// post-v1 번역 개선 Phase 4-B — QA 검수 Excel 적용(canonical apply lifecycle) 회귀 가드.
//
// tests/translate-qa-store.test.ts · tests/translate-store.test.ts 와 같은 관용구: 실제 store 를
// 그대로 import 해 localStorage/window 만 최소 stub 한다(범용 zustand 하네스를 만들지 않는다).
//
// 여기서 지키는 핵심:
//   ① 칸이 120개여도 canonical 커밋은 **단 한 번**(per-cell setter 반복 없음)
//   ② 적용 시점의 **현재 project 로 다시 분석**한다(화면의 preview 결과를 믿지 않는다)
//   ③ translationQa 캐시를 건드리지 않는다 — 경고 소멸은 Phase 3 의 exact anchor 가 알아서 한다
//   ④ candidate 0 이면 canonical 을 아예 커밋하지 않는다
//   ⑤ target 로케일 외의 필드는 전부 보존된다
// ⚠️ workbook 포맷 계약(strict cell·metadata schema·stale 판정)은 Phase 4-A 테스트가 덮는다.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { useStore } from '../src/store';
import {
  buildQaWorkbook,
  collectQaWorkbookRows,
  readQaWorkbook,
  QA_COLUMN_LOCALES,
  type QaWorkbookDoc,
} from '../src/generators/translate/qaWorkbook';
import { activeQaIssues, type TranslationQaAnchor, type TranslationQaCache } from '../src/generators/translate/qa';
import { baseLocaleOf, emptyProject, type Line, type Locale, type Project } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', {});
  useStore.setState({ project: emptyProject(), translationQa: {}, busy: {}, toast: null });
});

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const KO1 = '오늘은 정말 즐거웠어.';
const EN1 = 'Today was really terrible.';
const JA1 = '今日は本当に楽しかった。';
const KO2 = '내일 다시 만나자.';
const EN2 = 'See you yesterday.';
const JA2 = 'また明日会おう。';

function twoLineProject(): Project {
  return projectWith(
    [
      scene({
        id: 'sc_1',
        lines: [
          dialogue('한지수', KO1, { i18n: { en: EN1, ja: JA1 } }),
          dialogue('강민주', KO2, { i18n: { en: EN2, ja: JA2 } }),
        ],
      }),
    ],
    { translateMode: 'fast' },
  );
}

interface CellRef {
  sceneId?: string;
  lineIndex: number;
  locale: Locale;
}

/** 지정 칸을 "의심"으로 표시한 세션 QA 캐시(anchor 는 현재 project 에서 뽑는다). */
function qaCacheFor(project: Project, refs: CellRef[]): TranslationQaCache {
  const base = baseLocaleOf(project);
  const cache: TranslationQaCache = {};
  for (const ref of refs) {
    const sceneId = ref.sceneId ?? 'sc_1';
    const sc = project.scenes.find((s) => s.id === sceneId)!;
    const line = sc.lines[ref.lineIndex];
    if (line.kind !== 'dialogue' && line.kind !== 'narration') throw new Error('fixture');
    const anchor: TranslationQaAnchor = {
      sceneId,
      lineIndex: ref.lineIndex,
      sourceLocale: base,
      targetLocale: ref.locale,
      source: line.text,
      target: line.i18n![ref.locale]!,
      speaker: line.kind === 'dialogue' ? line.speaker : undefined,
      narration: line.kind === 'narration',
    };
    const list = cache[sceneId] ?? [];
    list.push({ anchor, verdict: 'review', origin: 'ai', category: 'meaning', reason: '테스트', model: 'gpt-4o-mini' });
    cache[sceneId] = list;
  }
  return cache;
}

const colOf = (locale: Locale) => QA_COLUMN_LOCALES.indexOf(locale);
const addr = (row: number, col: number) => XLSX.utils.encode_cell({ r: row, c: col });

/** 실제 writer → (외부 편집) → 실제 reader 로 doc 를 만든다(손으로 doc 를 조립하지 않는다). */
function docFrom(
  project: Project,
  cache: TranslationQaCache,
  edit?: (ws: XLSX.WorkSheet, rowCount: number) => void,
): QaWorkbookDoc {
  const rows = collectQaWorkbookRows(project, cache);
  const wb = buildQaWorkbook(XLSX, rows, {
    baseLocale: baseLocaleOf(project),
    exportedAt: '2026-08-22T00:00:00.000Z',
  });
  edit?.(wb.Sheets['번역검수'], rows.length);
  return readQaWorkbook(XLSX, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** 표시 칸을 외부에서 고친 것처럼 바꾼다(0-based 데이터 행). */
function editCell(ws: XLSX.WorkSheet, row: number, locale: Locale, value: string): void {
  ws[addr(row + 1, colOf(locale))] = { t: 's', v: value };
}

/** 그 셀의 현재 값에 접미사를 붙인다(행↔줄 매핑을 몰라도 되는 편집). */
function suffixCell(ws: XLSX.WorkSheet, row: number, locale: Locale, suffix: string): void {
  const cell = ws[addr(row + 1, colOf(locale))] as XLSX.CellObject | undefined;
  if (!cell || typeof cell.v !== 'string') throw new Error('fixture: 표시 칸이 비어 있다');
  ws[addr(row + 1, colOf(locale))] = { t: 's', v: cell.v + suffix };
}

/**
 * 액션이 도는 동안 project 객체 identity 가 몇 번 바뀌는지 센다 = **setScenes 진입 횟수**
 * (setScenes 는 `project` 를 새로 만들고 그 안에서 autoSave 를 태운다).
 * ⚠️ `project.scenes` 배열 identity 로 세면 안 된다 — applyTranslationUpdates 는 빈 업데이트에
 * 대해 **같은 배열을 그대로 돌려주므로**, 불필요한 setScenes 호출이 그 계수기를 통과한다(실측).
 */
function countCommits(run: () => void): number {
  let commits = 0;
  const unsub = useStore.subscribe((s, prev) => {
    if (s.project !== prev.project) commits += 1;
  });
  try {
    run();
  } finally {
    unsub();
  }
  return commits;
}

const lineAt = (sceneIdx: number, lineIdx: number): Line =>
  useStore.getState().project.scenes[sceneIdx].lines[lineIdx];

// ── ① 대량 적용 = 단일 커밋 ──────────────────────────────────────────────────

describe('applyQaWorkbook — 단일 커밋', () => {
  it('120칸을 적용해도 canonical 커밋은 한 번뿐이다', () => {
    // 3장면 × 20줄 × EN·JA = 120칸. 원본 번역을 줄마다 유일하게 만들어 매핑 없이 검증한다.
    const scenes = [0, 1, 2].map((s) =>
      scene({
        id: `sc_${s}`,
        lines: Array.from({ length: 20 }, (_, i) =>
          dialogue('한지수', `원문 ${s}-${i}`, { i18n: { en: `EN ${s}-${i}`, ja: `JA ${s}-${i}` } }),
        ),
      }),
    );
    const project = projectWith(scenes, { translateMode: 'fast' });
    const refs: CellRef[] = [];
    for (const s of [0, 1, 2]) {
      for (let i = 0; i < 20; i++) {
        refs.push({ sceneId: `sc_${s}`, lineIndex: i, locale: 'en' });
        refs.push({ sceneId: `sc_${s}`, lineIndex: i, locale: 'ja' });
      }
    }
    const doc = docFrom(project, qaCacheFor(project, refs), (ws, rowCount) => {
      expect(rowCount).toBe(60); // 줄당 한 행(EN·JA 가 같은 행)
      for (let r = 0; r < rowCount; r++) {
        suffixCell(ws, r, 'en', ' (수정)');
        suffixCell(ws, r, 'ja', ' (수정)');
      }
    });

    useStore.setState({ project });
    let result!: ReturnType<typeof useStore.getState>['applyQaWorkbook'] extends (d: never) => infer R ? R : never;
    const commits = countCommits(() => {
      result = useStore.getState().applyQaWorkbook(doc);
    });

    expect(result.candidates).toHaveLength(120);
    // ⚠️ 칸마다 setLineTranslation 을 부르면 이 값이 120 이 된다 — 그게 이 테스트가 막는 회귀다.
    expect(commits).toBe(1);
    expect(result.byLocale).toEqual({ en: 60, ja: 60 });

    const after = useStore.getState().project.scenes;
    for (const s of [0, 1, 2]) {
      for (let i = 0; i < 20; i++) {
        const line = after[s].lines[i] as Extract<Line, { kind: 'dialogue' }>;
        expect(line.i18n).toEqual({ en: `EN ${s}-${i} (수정)`, ja: `JA ${s}-${i} (수정)` });
        expect(line.text).toBe(`원문 ${s}-${i}`); // 원문은 손대지 않는다
      }
    }
    expect(useStore.getState().toast).toContain('EN 60칸 · JA 60칸');
  });

  it('같은 줄의 EN·JA 는 한 레코드로 합쳐 적용된다', () => {
    const project = twoLineProject();
    const doc = docFrom(
      project,
      qaCacheFor(project, [
        { lineIndex: 0, locale: 'en' },
        { lineIndex: 0, locale: 'ja' },
      ]),
      (ws) => {
        editCell(ws, 0, 'en', 'Today was really fun.');
        editCell(ws, 0, 'ja', '今日はとても楽しかった。');
      },
    );

    useStore.setState({ project });
    const commits = countCommits(() => useStore.getState().applyQaWorkbook(doc));

    expect(commits).toBe(1);
    expect((lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>).i18n).toEqual({
      en: 'Today was really fun.',
      ja: '今日はとても楽しかった。',
    });
    // 다른 줄은 그대로다.
    expect((lineAt(0, 1) as Extract<Line, { kind: 'dialogue' }>).i18n).toEqual({ en: EN2, ja: JA2 });
  });
});

// ── ② 커밋 시점 재분석 ───────────────────────────────────────────────────────

describe('applyQaWorkbook — 커밋 시점 재분석', () => {
  it('doc 를 만든 뒤 앱에서 번역을 고쳤으면 그 칸만 stale 로 빠진다', () => {
    const project = twoLineProject();
    const doc = docFrom(
      project,
      qaCacheFor(project, [
        { lineIndex: 0, locale: 'en' },
        { lineIndex: 1, locale: 'en' },
      ]),
      (ws) => {
        editCell(ws, 0, 'en', 'Today was really fun.');
        editCell(ws, 1, 'en', 'See you tomorrow.');
      },
    );

    // preview 이후 사용자가 0번 줄 EN 을 앱에서 직접 고쳤다 → 그 anchor 는 더 이상 유효하지 않다.
    useStore.setState({ project });
    useStore.getState().setLineTranslation('sc_1', 0, 'en', '앱에서 방금 고친 EN');

    const result = useStore.getState().applyQaWorkbook(doc);

    expect(result.counts.stale).toBe(1);
    expect(result.candidates).toEqual([
      { sceneId: 'sc_1', lineIndex: 1, locale: 'en', text: 'See you tomorrow.' },
    ]);
    // 사람이 방금 넣은 값을 엑셀 값이 덮지 않는다.
    expect((lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>).i18n?.en).toBe('앱에서 방금 고친 EN');
    expect((lineAt(0, 1) as Extract<Line, { kind: 'dialogue' }>).i18n?.en).toBe('See you tomorrow.');
  });

  it('원문이 바뀌었으면 그 줄은 적용하지 않는다(preview 결과를 저장해두지 않는다는 증거)', () => {
    const project = twoLineProject();
    const doc = docFrom(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]), (ws) => {
      editCell(ws, 0, 'en', 'Today was really fun.');
    });

    useStore.setState({ project });
    // 원문을 의미 있게 고치면 setLineText 가 그 줄의 번역을 지운다(Phase 2 계약) → anchor 불일치.
    useStore.getState().setLineText('sc_1', 0, '오늘은 좀 별로였어.');

    const result = useStore.getState().applyQaWorkbook(doc);
    expect(result.candidates).toEqual([]);
    expect(result.counts.stale).toBe(1);
    expect((lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>).i18n).toBeUndefined();
  });

  it('valid 와 stale 이 섞여 있어도 valid 만 적용하고 run 을 취소하지 않는다', () => {
    const project = twoLineProject();
    const doc = docFrom(
      project,
      qaCacheFor(project, [
        { lineIndex: 0, locale: 'en' },
        { lineIndex: 0, locale: 'ja' },
        { lineIndex: 1, locale: 'en' },
      ]),
      (ws) => {
        editCell(ws, 0, 'en', 'Today was really fun.');
        editCell(ws, 0, 'ja', '今日はとても楽しかった。');
        editCell(ws, 1, 'en', '   '); // 빈칸 — 삭제가 아니라 무시
      },
    );

    useStore.setState({ project });
    useStore.getState().setLineTranslation('sc_1', 0, 'en', '앱에서 방금 고친 EN'); // EN 만 stale

    const result = useStore.getState().applyQaWorkbook(doc);

    expect(result.counts).toMatchObject({ stale: 1, blank: 1 });
    expect(result.candidates).toEqual([
      { sceneId: 'sc_1', lineIndex: 0, locale: 'ja', text: '今日はとても楽しかった。' },
    ]);
    expect((lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>).i18n).toEqual({
      en: '앱에서 방금 고친 EN',
      ja: '今日はとても楽しかった。',
    });
    expect((lineAt(0, 1) as Extract<Line, { kind: 'dialogue' }>).i18n?.en).toBe(EN2); // 빈칸은 지우지 않는다
    expect(useStore.getState().toast).toContain('건너뜀');
  });
});

// ── ③ translationQa 캐시 ─────────────────────────────────────────────────────

describe('applyQaWorkbook — translationQa 캐시', () => {
  it('캐시 객체를 교체하지 않고, 고친 칸의 경고만 저절로 사라진다', () => {
    const project = twoLineProject();
    const cache = qaCacheFor(project, [
      { lineIndex: 0, locale: 'en' },
      { lineIndex: 1, locale: 'en' },
    ]);
    const doc = docFrom(project, cache, (ws) => {
      editCell(ws, 0, 'en', 'Today was really fun.'); // 0번만 고친다
    });

    useStore.setState({ project, translationQa: cache });
    const before = useStore.getState().translationQa;

    useStore.getState().applyQaWorkbook(doc);

    // 캐시 자체는 그대로다(clear/replace 하지 않는다).
    expect(useStore.getState().translationQa).toBe(before);
    expect(useStore.getState().translationQa.sc_1).toHaveLength(2);

    // 표시 판정은 Phase 3 의 render-time 필터가 한다 — 고친 칸만 빠진다.
    const s = useStore.getState();
    const active = activeQaIssues(s.translationQa.sc_1, s.project.scenes[0], baseLocaleOf(s.project));
    expect(active).toHaveLength(1);
    expect(active[0].anchor.lineIndex).toBe(1);
  });

  it('세션 QA 캐시가 비어 있어도 workbook 만으로 적용된다', () => {
    const project = twoLineProject();
    const doc = docFrom(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]), (ws) => {
      editCell(ws, 0, 'en', 'Today was really fun.');
    });

    // 내보낸 뒤 앱을 껐다 켠 상황: 캐시가 없다.
    useStore.setState({ project, translationQa: {} });
    const result = useStore.getState().applyQaWorkbook(doc);

    expect(result.candidates).toHaveLength(1);
    expect((lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>).i18n?.en).toBe('Today was really fun.');
    expect(useStore.getState().translationQa).toEqual({});
  });
});

// ── ④ candidate 0 ────────────────────────────────────────────────────────────

describe('applyQaWorkbook — 적용할 게 없을 때', () => {
  it('아무것도 고치지 않은 workbook 은 canonical 을 커밋하지 않는다', () => {
    const project = twoLineProject();
    const doc = docFrom(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }])); // 편집 없음

    useStore.setState({ project });
    const beforeProject = useStore.getState().project;
    const beforeScenes = beforeProject.scenes;

    let result!: ReturnType<ReturnType<typeof useStore.getState>['applyQaWorkbook']>;
    const commits = countCommits(() => {
      result = useStore.getState().applyQaWorkbook(doc);
    });

    expect(result.candidates).toEqual([]);
    expect(result.counts.unchanged).toBe(1);
    expect(commits).toBe(0); // setScenes 자체를 부르지 않는다(=autoSave 경로에도 안 들어간다)
    expect(useStore.getState().project).toBe(beforeProject);
    expect(useStore.getState().project.scenes).toBe(beforeScenes);
    expect(useStore.getState().toast).toContain('적용할 수정이 없습니다');
  });

  it('검수 대상이 아닌 칸만 고친 workbook 도 커밋하지 않는다', () => {
    const project = twoLineProject();
    const doc = docFrom(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]), (ws) => {
      editCell(ws, 0, 'ja', '今日はとても楽しかった。'); // JA 는 flagged 가 아니다
    });

    useStore.setState({ project });
    const beforeProject = useStore.getState().project;
    let result!: ReturnType<ReturnType<typeof useStore.getState>['applyQaWorkbook']>;
    const commits = countCommits(() => {
      result = useStore.getState().applyQaWorkbook(doc);
    });

    expect(result.counts.ignoredEdits).toBe(1);
    expect(result.candidates).toEqual([]);
    expect(commits).toBe(0);
    expect(useStore.getState().project).toBe(beforeProject);
    expect(useStore.getState().project.scenes).toBe(beforeProject.scenes);
    expect((lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>).i18n?.ja).toBe(JA1); // 원래 값 유지
  });
});

// ── ⑤ 다른 필드 보존 ─────────────────────────────────────────────────────────

describe('applyQaWorkbook — 대상 로케일 외 필드 보존', () => {
  it('원문·표정·의상·보이스·다른 로케일·장면 구조를 건드리지 않는다', () => {
    const rich = projectWith(
      [
        scene({
          id: 'sc_1',
          title: '첫 장면',
          lines: [
            dialogue('한지수', KO1, {
              i18n: { en: EN1, ja: JA1 },
              emotion: '기쁨',
              emotionAuto: '슬픔',
              outfits: { 한지수: '교복' },
              voiceAssetIds: { ko: 'a_voice_1' },
              hideSprites: true,
            }),
          ],
        }),
        scene({ id: 'sc_2', title: '두 번째', lines: [dialogue('강민주', KO2, { i18n: { en: EN2 } })] }),
      ],
      { translateMode: 'fast' },
    );
    const doc = docFrom(rich, qaCacheFor(rich, [{ lineIndex: 0, locale: 'en' }]), (ws) => {
      editCell(ws, 0, 'en', 'Today was really fun.');
    });

    useStore.setState({ project: rich });
    const before = rich.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>;
    useStore.getState().applyQaWorkbook(doc);

    const after = lineAt(0, 0) as Extract<Line, { kind: 'dialogue' }>;
    expect(after.i18n).toEqual({ en: 'Today was really fun.', ja: JA1 }); // JA 보존
    expect({ ...after, i18n: undefined }).toEqual({ ...before, i18n: undefined }); // 나머지 전부 동일
    // 장면 순서·id·제목과 다른 장면의 참조도 그대로다.
    const scenes = useStore.getState().project.scenes;
    expect(scenes.map((s) => s.id)).toEqual(['sc_1', 'sc_2']);
    expect(scenes[0].title).toBe('첫 장면');
    expect(scenes[1]).toBe(rich.scenes[1]); // 손대지 않은 장면은 객체 identity 까지 보존
  });
});
