// post-v1 번역 개선 Phase 4-A — QA Review Excel round-trip 의 **순수 포맷 계약** 회귀 가드.
//
// 여기서 고정하는 것은 **workbook 구조 · 언어 고정 열 · hidden metadata authority · strict 셀 타입 ·
// exact 비교 · 3-pass 분석(schema → duplicate → 행/로케일)** 뿐이다.
// ⚠️ canonical write(store)·UI·다운로드는 Phase 4-B/4-C 다 — 이 파일은 순수 함수만 부른다.

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  analyzeQaWorkbook,
  buildQaWorkbook,
  collectQaWorkbookRows,
  isQaWorkbook,
  readQaWorkbook,
  QA_COLUMN_LOCALES,
  QA_HEADER_ROW,
  QA_SHEET_DATA,
  QA_SHEET_GUIDE,
  QA_SHEET_META,
  QA_WORKBOOK_MARKER,
  QA_WORKBOOK_VERSION,
} from '../src/generators/translate/qaWorkbook';
import type { TranslationQaAnchor, TranslationQaCache } from '../src/generators/translate/qa';
import { baseLocaleOf, type Line, type Locale, type Project } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

const KO1 = '오늘은 정말 즐거웠어.';
const EN1 = 'Today was really terrible.';
const JA1 = '今日は本当に楽しかった。';
const KO2 = '내일 다시 만나자.';
const EN2 = 'See you yesterday.';
const JA2 = 'また明日会おう。';
const KO3 = '두 사람은 말이 없었다.';
const EN3 = 'Neither of them spoke.';
const JA3 = '二人は黙っていた。';

const EXPORTED_AT = '2026-08-22T00:00:00.000Z';

function narration(text: string, extra?: Partial<Extract<Line, { kind: 'narration' }>>): Line {
  return { kind: 'narration', text, ...extra };
}

/** 기본 픽스처 — 대사 2 + 지문 1, EN·JA 번역이 모두 채워져 있다(= QA 대상이 될 수 있는 상태). */
function baseProject(extra?: Partial<Project>): Project {
  return projectWith(
    [
      scene({
        id: 's1',
        lines: [
          dialogue('한지수', KO1, { i18n: { en: EN1, ja: JA1 } }),
          dialogue('강민주', KO2, { i18n: { en: EN2, ja: JA2 } }),
          narration(KO3, { i18n: { en: EN3, ja: JA3 } }),
        ],
      }),
    ],
    { translateMode: 'fast', ...extra },
  );
}

interface CellRef {
  lineIndex: number;
  locale: Locale;
  sceneId?: string;
}

/**
 * 지정한 칸들을 "의심(review)"으로 표시한 세션 QA 캐시를 만든다 — anchor 는 **현재 project 에서**
 * 뽑으므로 activeQaIssues 가 그대로 유효로 판정한다(캐시를 손으로 조립하지 않는다).
 */
function qaCacheFor(project: Project, refs: CellRef[]): TranslationQaCache {
  const base = baseLocaleOf(project);
  const cache: TranslationQaCache = {};
  for (const ref of refs) {
    const sceneId = ref.sceneId ?? 's1';
    const sc = project.scenes.find((s) => s.id === sceneId);
    if (!sc) throw new Error(`fixture: 장면 없음 ${sceneId}`);
    const line = sc.lines[ref.lineIndex];
    if (!line || (line.kind !== 'dialogue' && line.kind !== 'narration')) {
      throw new Error('fixture: 번역을 가질 수 없는 줄');
    }
    const target = line.i18n?.[ref.locale];
    if (!target) throw new Error('fixture: 번역이 비어 있음');
    const anchor: TranslationQaAnchor = {
      sceneId,
      lineIndex: ref.lineIndex,
      sourceLocale: base,
      targetLocale: ref.locale,
      source: line.text,
      target,
      speaker: line.kind === 'dialogue' ? line.speaker : undefined,
      narration: line.kind === 'narration',
    };
    const list = cache[sceneId] ?? [];
    list.push({ anchor, verdict: 'review', origin: 'ai', category: 'meaning', reason: '테스트', model: 'gpt-4o-mini' });
    cache[sceneId] = list;
  }
  return cache;
}

function exportWorkbook(project: Project, cache: TranslationQaCache): XLSX.WorkBook {
  return buildQaWorkbook(XLSX, collectQaWorkbookRows(project, cache), {
    baseLocale: baseLocaleOf(project),
    exportedAt: EXPORTED_AT,
  });
}

function toBuf(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** workbook → (파일 왕복) → 현재 project 기준 분석. 실제 import 경로와 같은 순서다. */
function analyze(wb: XLSX.WorkBook, project: Project) {
  return analyzeQaWorkbook(readQaWorkbook(XLSX, toBuf(wb)), project);
}

const colOf = (locale: Locale) => QA_COLUMN_LOCALES.indexOf(locale);
const addr = (row: number, col: number) => XLSX.utils.encode_cell({ r: row, c: col });

/** 데이터 행 n(0-based) 의 워크시트 행 번호. 0행은 헤더다. */
const dataRow = (n: number) => n + 1;

function dataSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  return wb.Sheets[QA_SHEET_DATA];
}

/** 표시 칸을 문자열로 고쳐 쓴다(외부 검수자가 Excel 에서 고친 상황). */
function editCell(wb: XLSX.WorkBook, row: number, locale: Locale, value: string): void {
  dataSheet(wb)[addr(dataRow(row), colOf(locale))] = { t: 's', v: value };
}

/** 임의 타입의 셀로 바꿔 쓴다(수식·숫자 등). null 이면 셀을 지운다. */
function putCell(wb: XLSX.WorkBook, row: number, col: number, cell: XLSX.CellObject | null): void {
  const ws = dataSheet(wb);
  const a = addr(dataRow(row), col);
  if (cell) ws[a] = cell;
  else delete ws[a];
}

function readMeta(wb: XLSX.WorkBook, row: number): Record<string, unknown> {
  const cell = dataSheet(wb)[addr(dataRow(row), QA_COLUMN_LOCALES.length + 1)] as XLSX.CellObject;
  return JSON.parse(String(cell.v)) as Record<string, unknown>;
}

/** hidden metadata token 을 통째로 바꿔 쓴다(변조·손상 시나리오). */
function writeMeta(wb: XLSX.WorkBook, row: number, value: unknown): void {
  dataSheet(wb)[addr(dataRow(row), QA_COLUMN_LOCALES.length + 1)] = {
    t: 's',
    v: typeof value === 'string' ? value : JSON.stringify(value),
  };
}

function patchMeta(wb: XLSX.WorkBook, row: number, patch: Record<string, unknown>): void {
  writeMeta(wb, row, { ...readMeta(wb, row), ...patch });
}

/** 데이터 행 전체(A:E)를 통째로 뒤집는다 — "행 전체를 함께 옮긴" 재정렬. */
function reverseDataRows(wb: XLSX.WorkBook, rowCount: number): void {
  const width = QA_COLUMN_LOCALES.length + 2;
  const ws = dataSheet(wb);
  const snapshot: (XLSX.CellObject | undefined)[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: (XLSX.CellObject | undefined)[] = [];
    for (let c = 0; c < width; c++) row.push(ws[addr(dataRow(r), c)] as XLSX.CellObject | undefined);
    snapshot.push(row);
  }
  snapshot.reverse();
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < width; c++) {
      const a = addr(dataRow(r), c);
      const cell = snapshot[r][c];
      if (cell) ws[a] = cell;
      else delete ws[a];
    }
  }
}

// ── ① export — 대상 수집과 workbook 구조 ──────────────────────────────────────

describe('QA workbook — export 구조', () => {
  it('시트 3개(데이터·안내·숨은 marker)와 고정 헤더를 낸다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));

    expect(wb.SheetNames).toEqual([QA_SHEET_DATA, QA_SHEET_GUIDE, QA_SHEET_META]);
    // 숨은 marker 시트는 실제로 hidden 이어야 한다(사용자 눈에 보이면 지우고 싶어진다).
    expect(wb.Workbook?.Sheets?.[2].Hidden).toBe(1);
    const header = XLSX.utils.sheet_to_json<string[]>(dataSheet(wb), { header: 1, blankrows: false })[0];
    expect(header).toEqual([...QA_HEADER_ROW]);
    // E열(metadata)은 숨긴다.
    expect(dataSheet(wb)['!cols']?.[4]?.hidden).toBe(true);
    // marker/version 은 **문자열 셀**이다(숫자로 쓰면 reader 가 거절한다).
    const meta = wb.Sheets[QA_SHEET_META];
    expect(meta.A1).toMatchObject({ t: 's', v: QA_WORKBOOK_MARKER });
    expect(meta.A2).toMatchObject({ t: 's', v: QA_WORKBOOK_VERSION });
  });

  it('숨은 시트·숨은 열이 실제 파일 왕복에서도 살아남는다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    // 열 너비/hidden 은 SheetJS 가 cellStyles 옵션에서만 노출한다(읽기 경로는 이 값을 쓰지 않는다).
    const rt = XLSX.read(toBuf(wb), { type: 'array', cellStyles: true });
    expect(rt.Workbook?.Sheets?.[2].Hidden).toBe(1);
    expect(rt.Sheets[QA_SHEET_DATA]['!cols']?.[4]?.hidden).toBe(true);
    expect(isQaWorkbook(XLSX, rt)).toBe(true);
  });

  it('A/B/C 는 언어 고정이고 D열은 검수 대상 표시다 (baseLocale=ko)', () => {
    const project = baseProject();
    const cache = qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]);
    const rows = collectQaWorkbookRows(project, cache);

    expect(rows).toHaveLength(1);
    expect(rows[0].values).toEqual({ ko: KO1, en: EN1, ja: JA1 });
    expect(rows[0].flagged).toEqual(['en']);

    const wb = exportWorkbook(project, cache);
    const aoa = XLSX.utils.sheet_to_json<string[]>(dataSheet(wb), { header: 1, blankrows: false });
    expect(aoa[1].slice(0, 4)).toEqual([KO1, EN1, JA1, 'EN']);
  });

  it('한 줄에서 EN·JA 가 둘 다 의심이면 행은 하나이고 flagged 가 두 값이다', () => {
    const project = baseProject();
    const cache = qaCacheFor(project, [
      { lineIndex: 1, locale: 'en' },
      { lineIndex: 1, locale: 'ja' },
    ]);
    const rows = collectQaWorkbookRows(project, cache);

    expect(rows).toHaveLength(1);
    expect(rows[0].flagged).toEqual(['en', 'ja']);
    const wb = exportWorkbook(project, cache);
    const aoa = XLSX.utils.sheet_to_json<string[]>(dataSheet(wb), { header: 1, blankrows: false });
    expect(aoa[1][3]).toBe('EN, JA');
    expect(readMeta(wb, 0).f).toEqual(['en', 'ja']);
  });

  it('지문 줄은 speaker 키가 아예 빠지고 narration 이 true 다(anchor 의미 그대로)', () => {
    const project = baseProject();
    const cache = qaCacheFor(project, [{ lineIndex: 2, locale: 'en' }]);
    const wb = exportWorkbook(project, cache);
    const meta = readMeta(wb, 0);

    expect('p' in meta).toBe(false);
    expect(meta.n).toBe(true);
    expect(collectQaWorkbookRows(project, cache)[0].speaker).toBeUndefined();
  });

  it('대상 판정은 activeQaIssues 에 위임한다 — ok·수동 확정·stale·빈 번역은 나가지 않는다', () => {
    const project = baseProject();
    const base = baseLocaleOf(project);
    const line0 = project.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>;
    const anchorFor = (lineIndex: number, locale: Locale, patch?: Partial<TranslationQaAnchor>) => {
      const l = project.scenes[0].lines[lineIndex] as Extract<Line, { kind: 'dialogue' }>;
      return {
        sceneId: 's1',
        lineIndex,
        sourceLocale: base,
        targetLocale: locale,
        source: l.text,
        target: l.i18n![locale]!,
        speaker: l.speaker,
        narration: false,
        ...patch,
      } satisfies TranslationQaAnchor;
    };
    const cache: TranslationQaCache = {
      s1: [
        { anchor: anchorFor(0, 'en'), verdict: 'ok', origin: 'ai', model: 'gpt-4o-mini' }, // AI 정상
        { anchor: anchorFor(0, 'ja'), verdict: 'ok', origin: 'manual' }, // 사람이 "문제 없음"
        // 원문이 그 사이 바뀐 결과(stale) — 표시도 export 도 되면 안 된다
        { anchor: anchorFor(1, 'en', { source: '옛 원문' }), verdict: 'review', origin: 'ai', model: 'gpt-4o-mini' },
        { anchor: anchorFor(1, 'ja'), verdict: 'review', origin: 'ai', model: 'gpt-4o-mini' }, // 유일한 유효 의심
      ],
    };
    expect(line0.i18n?.en).toBe(EN1); // 픽스처 가드

    const rows = collectQaWorkbookRows(project, cache);
    expect(rows).toHaveLength(1);
    expect(rows[0].lineIndex).toBe(1);
    expect(rows[0].flagged).toEqual(['ja']);
  });

  it('baseLocale=en 프로젝트도 A=한국어 · B=영어 · C=일본어 고정이다(원문은 B열)', () => {
    const project = projectWith(
      [
        scene({
          id: 's1',
          lines: [dialogue('Jisoo', 'Today was really fun.', { i18n: { ja: JA1 } })],
        }),
      ],
      { baseLocale: 'en', translateMode: 'fast' },
    );
    const cache = qaCacheFor(project, [{ lineIndex: 0, locale: 'ja' }]);
    const rows = collectQaWorkbookRows(project, cache);

    // ko 는 어떤 base 에서도 번역 target 이 아니라 값이 존재하지 않는다 → 빈 문자열(정상).
    expect(rows[0].values).toEqual({ ko: '', en: 'Today was really fun.', ja: JA1 });
    expect(rows[0].sourceLocale).toBe('en');
    expect(rows[0].flagged).toEqual(['ja']);

    const wb = exportWorkbook(project, cache);
    const analysis = analyze(wb, project);
    expect(analysis.counts.badMeta).toBe(0);
    expect(analysis.candidates).toEqual([]); // 아직 아무것도 안 고쳤다
  });

  it('baseLocale=ja 프로젝트는 C열이 원문이고 EN 만 검수 대상이 된다', () => {
    const project = projectWith(
      [scene({ id: 's1', lines: [dialogue('ジス', JA1, { i18n: { en: EN1 } })] })],
      { baseLocale: 'ja', translateMode: 'fast' },
    );
    const cache = qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]);
    const rows = collectQaWorkbookRows(project, cache);
    expect(rows[0].values).toEqual({ ko: '', en: EN1, ja: JA1 });

    const wb = exportWorkbook(project, cache);
    editCell(wb, 0, 'en', 'Today was really fun.');
    const analysis = analyze(wb, project);
    expect(analysis.candidates).toEqual([
      { sceneId: 's1', lineIndex: 0, locale: 'en', text: 'Today was really fun.' },
    ]);
  });
});

// ── ② structural validation ───────────────────────────────────────────────────

describe('QA workbook — structural validation(파일 전체 거절)', () => {
  const ready = () => {
    const project = baseProject();
    return { project, wb: exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }])) };
  };

  it('marker 시트가 없거나 표식이 다르면 거절한다', () => {
    const a = ready();
    delete a.wb.Sheets[QA_SHEET_META];
    a.wb.SheetNames = a.wb.SheetNames.filter((n) => n !== QA_SHEET_META);
    expect(() => analyze(a.wb, a.project)).toThrow(/QA 검수 파일/);

    const b = ready();
    b.wb.Sheets[QA_SHEET_META].A1 = { t: 's', v: 'SOMETHING_ELSE' };
    expect(() => analyze(b.wb, b.project)).toThrow(/QA 검수 파일/);
  });

  it('모르는 버전이거나 버전이 문자열 셀이 아니면 거절한다', () => {
    const a = ready();
    a.wb.Sheets[QA_SHEET_META].A2 = { t: 's', v: '2' };
    expect(() => analyze(a.wb, a.project)).toThrow(/버전/);

    const b = ready();
    b.wb.Sheets[QA_SHEET_META].A2 = { t: 'n', v: 1 }; // 숫자 셀은 계약 위반이다
    expect(() => analyze(b.wb, b.project)).toThrow(/버전/);
  });

  it('데이터 시트가 없으면 거절한다', () => {
    const { project, wb } = ready();
    delete wb.Sheets[QA_SHEET_DATA];
    wb.SheetNames = wb.SheetNames.filter((n) => n !== QA_SHEET_DATA);
    expect(() => analyze(wb, project)).toThrow(/데이터 시트/);
  });

  it('영어/일본어 열 제목이 뒤바뀌면 거절한다(열 통째 교체 방어)', () => {
    const { project, wb } = ready();
    const ws = dataSheet(wb);
    ws[addr(0, 1)] = { t: 's', v: '일본어' };
    ws[addr(0, 2)] = { t: 's', v: '영어' };
    expect(() => analyze(wb, project)).toThrow(/열 제목/);
  });

  it('A1·D1·E1 헤더가 바뀌거나 문자열 셀이 아니면 거절한다', () => {
    for (const [col, cell] of [
      [0, { t: 's', v: '원문' }],
      [3, { t: 's', v: '대상' }],
      [4, { t: 's', v: 'META' }],
      [1, { t: 'n', v: 1 }], // 숫자 헤더
      [2, { t: 's', v: '일본어', f: 'A1' }], // 수식 헤더
    ] as [number, XLSX.CellObject][]) {
      const { project, wb } = ready();
      dataSheet(wb)[addr(0, col)] = cell;
      expect(() => analyze(wb, project)).toThrow(/열 제목/);
    }
  });

  it('데이터 행이 있는데 숨은 metadata 열이 통째로 지워지면 거절한다', () => {
    const { project, wb } = ready();
    putCell(wb, 0, QA_COLUMN_LOCALES.length + 1, null);
    expect(() => analyze(wb, project)).toThrow(/숨은 정보 열/);
  });

  it('isQaWorkbook 은 marker 만 본다(일반 대본 엑셀은 false)', () => {
    const plain = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(plain, XLSX.utils.aoa_to_sheet([['주인공', '안녕']]), '스토리');
    expect(isQaWorkbook(XLSX, plain)).toBe(false);

    const { wb } = ready();
    expect(isQaWorkbook(XLSX, wb)).toBe(true);
  });
});

// ── ③ exact 비교 semantics ────────────────────────────────────────────────────

describe('QA workbook — exact 비교(trim 은 blank 판정에만)', () => {
  /** 번역 끝에 공백이 있는 픽스처 — trim 비교였다면 오판이 나는 자리다. */
  function spacedProject(): Project {
    return projectWith(
      [scene({ id: 's1', lines: [dialogue('한지수', KO1, { i18n: { en: 'Hello ', ja: JA1 } })] })],
      { translateMode: 'fast' },
    );
  }

  it('snapshot "Hello " → "Hello!" 는 stale 이 아니라 candidate 다', () => {
    const project = spacedProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    editCell(wb, 0, 'en', 'Hello!');

    const { candidates, counts } = analyze(wb, project);
    expect(counts.stale).toBe(0);
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 0, locale: 'en', text: 'Hello!' }]);
  });

  it('snapshot "Hello" → " Hello " 는 unchanged 가 아니고 공백이 보존된다', () => {
    const project = projectWith(
      [scene({ id: 's1', lines: [dialogue('한지수', KO1, { i18n: { en: 'Hello', ja: JA1 } })] })],
      { translateMode: 'fast' },
    );
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    editCell(wb, 0, 'en', ' Hello ');

    const { candidates, counts } = analyze(wb, project);
    expect(counts.unchanged).toBe(0);
    expect(candidates[0].text).toBe(' Hello '); // analyzer 가 깎지 않는다
  });

  it('공백만 남기거나 비우면 blank — 번역을 지우지 않는다', () => {
    const project = baseProject();
    for (const value of ['   ', '']) {
      const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
      editCell(wb, 0, 'en', value);
      const { candidates, counts } = analyze(wb, project);
      expect(candidates).toEqual([]);
      expect(counts.blank).toBe(1);
    }
    // 셀 자체를 지운 경우도 같다(blank).
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    putCell(wb, 0, colOf('en'), null);
    expect(analyze(wb, project).counts.blank).toBe(1);
  });

  it('손대지 않은 칸은 unchanged 이고 적용 대상이 아니다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([]);
    expect(counts.unchanged).toBe(1);
    expect(counts.flaggedCells).toBe(1);
  });
});

// ── ④ strict 셀 타입 ─────────────────────────────────────────────────────────

describe('QA workbook — strict 셀 타입(강제 문자열 변환 금지)', () => {
  const flaggedEn = () => {
    const project = baseProject();
    return { project, wb: exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }])) };
  };

  it('검수 대상 칸이 수식이면 적용하지 않는다', () => {
    const { project, wb } = flaggedEn();
    putCell(wb, 0, colOf('en'), { t: 's', v: 'Today was fun.', f: 'CONCATENATE("a","b")' });

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([]);
    expect(counts.invalidCell).toBe(1);
  });

  it('숫자·불리언·날짜·오류 셀도 번역으로 적용하지 않는다', () => {
    const cells: XLSX.CellObject[] = [
      { t: 'n', v: 42 },
      { t: 'b', v: true },
      { t: 'd', v: new Date('2026-01-02') },
      { t: 'e', v: 0x2a, w: '#N/A' },
    ];
    for (const cell of cells) {
      const { project, wb } = flaggedEn();
      putCell(wb, 0, colOf('en'), cell);
      const { candidates, counts } = analyze(wb, project);
      expect(candidates).toEqual([]);
      expect(counts.invalidCell).toBe(1);
    }
  });

  it('"=SUM(A1)" 같은 문자열 번역은 수식으로 오인되지 않고 그대로 왕복한다', () => {
    const project = projectWith(
      [scene({ id: 's1', lines: [dialogue('한지수', KO1, { i18n: { en: '=SUM(A1)', ja: JA1 } })] })],
      { translateMode: 'fast' },
    );
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));

    // 내보낸 셀은 문자열 셀이어야 한다(수식 셀이 아니다).
    const cell = dataSheet(wb)[addr(dataRow(0), colOf('en'))] as XLSX.CellObject;
    expect(cell.t).toBe('s');
    expect(cell.f).toBeUndefined();

    const first = analyze(wb, project);
    expect(first.counts.unchanged).toBe(1);
    expect(first.counts.invalidCell).toBe(0);

    editCell(wb, 0, 'en', '=총합(A1)');
    expect(analyze(wb, project).candidates[0].text).toBe('=총합(A1)');
  });
});

// ── ⑤ 행 metadata schema (fail-closed) ───────────────────────────────────────

describe('QA workbook — 행 metadata schema(어긋나면 행 전체 폐기)', () => {
  const ready = (refs: CellRef[] = [{ lineIndex: 0, locale: 'en' }]) => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, refs));
    return { project, wb };
  };

  it('f 에 모르는 값이 섞이면 정상 locale 도 적용하지 않는다(부분 복구 금지)', () => {
    const { project, wb } = ready();
    editCell(wb, 0, 'en', 'Today was really fun.');
    patchMeta(wb, 0, { f: ['en', 'unknown'] });

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([]);
    expect(counts.badMeta).toBe(1);
  });

  it('f 가 비었거나 중복이거나 원문 언어를 포함하면 행을 폐기한다', () => {
    for (const f of [[], ['en', 'en'], ['ko'], ['en', 'ko'], 'en']) {
      const { project, wb } = ready();
      editCell(wb, 0, 'en', 'Today was really fun.');
      patchMeta(wb, 0, { f });
      const { candidates, counts } = analyze(wb, project);
      expect(candidates).toEqual([]);
      expect(counts.badMeta).toBe(1);
    }
  });

  it('s·i·b·n·p 타입이 어긋나면 행을 폐기한다', () => {
    const patches: Record<string, unknown>[] = [
      { s: '' },
      { s: 3 },
      { i: '0' },
      { i: -1 },
      { i: 1.5 },
      { b: 'de' },
      { b: 'en' }, // workbook baseLocale(ko)와 불일치
      { n: 'false' },
      { p: 42 },
      { p: null },
    ];
    for (const patch of patches) {
      const { project, wb } = ready();
      editCell(wb, 0, 'en', 'Today was really fun.');
      patchMeta(wb, 0, patch);
      const { candidates, counts } = analyze(wb, project);
      expect(candidates).toEqual([]);
      expect(counts.badMeta).toBe(1);
    }
  });

  it('v 는 ko·en·ja 세 값이 모두 문자열이어야 한다', () => {
    const cases: unknown[] = [
      { en: EN1, ja: JA1 }, // ko 누락
      { ko: KO1, ja: JA1 }, // en 누락
      { ko: KO1, en: EN1 }, // ja 누락
      { ko: KO1, en: EN1, ja: 3 }, // 비문자열
      { ko: KO1, en: EN1, ja: null },
      'not-an-object',
      [KO1, EN1, JA1],
    ];
    for (const v of cases) {
      const { project, wb } = ready();
      editCell(wb, 0, 'en', 'Today was really fun.');
      patchMeta(wb, 0, { v });
      const { candidates, counts } = analyze(wb, project);
      expect(candidates).toEqual([]);
      expect(counts.badMeta).toBe(1);
    }
  });

  it('metadata 가 JSON 이 아니거나 객체가 아니면 행을 폐기한다(다른 행은 살린다)', () => {
    const { project, wb } = ready([
      { lineIndex: 0, locale: 'en' },
      { lineIndex: 1, locale: 'en' },
    ]);
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 1, 'en', 'See you tomorrow.');
    writeMeta(wb, 0, '{ 깨진 JSON');

    const { candidates, counts } = analyze(wb, project);
    expect(counts.badMeta).toBe(1);
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 1, locale: 'en', text: 'See you tomorrow.' }]);
  });

  it('D열(검수 대상)을 지우거나 변조해도 적용 결과가 바뀌지 않는다', () => {
    const { project, wb } = ready();
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 0, 'ja', '今日は本当に楽しかったよ。'); // JA 는 검수 대상이 아니다
    // D열에 "EN, JA" 라고 적어도 권한은 hidden metadata 가 정한다.
    putCell(wb, 0, QA_COLUMN_LOCALES.length, { t: 's', v: 'EN, JA' });

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 0, locale: 'en', text: 'Today was really fun.' }]);
    expect(counts.ignoredEdits).toBe(1);

    // D열을 통째로 지운 경우도 같다.
    const b = ready();
    editCell(b.wb, 0, 'en', 'Today was really fun.');
    putCell(b.wb, 0, QA_COLUMN_LOCALES.length, null);
    expect(analyze(b.wb, b.project).candidates).toHaveLength(1);
  });
});

// ── ⑥ duplicate ──────────────────────────────────────────────────────────────

describe('QA workbook — duplicate identity', () => {
  it('같은 줄을 가리키는 정상 metadata 두 행은 둘 다 폐기한다(last-wins 금지)', () => {
    const project = baseProject();
    const rows = collectQaWorkbookRows(project, qaCacheFor(project, [
      { lineIndex: 0, locale: 'en' },
      { lineIndex: 1, locale: 'en' },
    ]));
    // 0번 행을 복제해 같은 identity 를 두 번 주장하게 만든다.
    const wb = buildQaWorkbook(XLSX, [rows[0], { ...rows[0] }, rows[1]], {
      baseLocale: 'ko',
      exportedAt: EXPORTED_AT,
    });
    editCell(wb, 0, 'en', 'A안');
    editCell(wb, 1, 'en', 'B안');
    editCell(wb, 2, 'en', 'See you tomorrow.');

    const { candidates, counts } = analyze(wb, project);
    expect(counts.duplicate).toBe(2);
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 1, locale: 'en', text: 'See you tomorrow.' }]);
  });

  it('손상된 metadata 는 정상 행을 duplicate 로 오염시키지 않는다', () => {
    const project = baseProject();
    const rows = collectQaWorkbookRows(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    const wb = buildQaWorkbook(XLSX, [rows[0], { ...rows[0] }], { baseLocale: 'ko', exportedAt: EXPORTED_AT });
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 1, 'en', '무시돼야 하는 값');
    // 두 번째 행의 i 를 문자열로 망가뜨린다 — schema 검증에서 먼저 떨어져야 한다.
    patchMeta(wb, 1, { i: '0' });

    const { candidates, counts } = analyze(wb, project);
    expect(counts.badMeta).toBe(1);
    expect(counts.duplicate).toBe(0); // 정상 행이 duplicate 로 끌려들어가지 않는다
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 0, locale: 'en', text: 'Today was really fun.' }]);
  });
});

// ── ⑦ stale — isQaResultValid 위임 ───────────────────────────────────────────

describe('QA workbook — stale 판정(기존 exact anchor 재사용)', () => {
  function withEnEdit(project: Project, refs: CellRef[] = [{ lineIndex: 0, locale: 'en' }]) {
    const wb = exportWorkbook(project, qaCacheFor(project, refs));
    editCell(wb, 0, 'en', 'Today was really fun.');
    return wb;
  }

  it('원문(base 텍스트)이 그 사이 바뀌면 stale 이다', () => {
    const project = baseProject();
    const wb = withEnEdit(project);
    const changed = baseProject();
    (changed.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>).text = '오늘은 좀 별로였어.';

    const { candidates, counts } = analyze(wb, changed);
    expect(candidates).toEqual([]);
    expect(counts.stale).toBe(1);
  });

  it('화자가 바뀌면 stale 이다(빈 문자열로 바뀐 경우 포함)', () => {
    for (const speaker of ['서연', '']) {
      const project = baseProject();
      const wb = withEnEdit(project);
      const changed = baseProject();
      (changed.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>).speaker = speaker;
      const { candidates, counts } = analyze(wb, changed);
      expect(candidates).toEqual([]);
      expect(counts.stale).toBe(1);
    }
  });

  it('대사가 지문으로 바뀌면 stale 이다', () => {
    const project = baseProject();
    const wb = withEnEdit(project);
    const changed = baseProject();
    changed.scenes[0].lines[0] = narration(KO1, { i18n: { en: EN1, ja: JA1 } });

    const { candidates, counts } = analyze(wb, changed);
    expect(candidates).toEqual([]);
    expect(counts.stale).toBe(1);
  });

  it('번역이 그 사이 다른 값으로 바뀌면 stale 이다(옛 번역에 대한 수정이므로)', () => {
    const project = baseProject();
    const wb = withEnEdit(project);
    const changed = baseProject();
    (changed.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>).i18n = { en: '앱에서 이미 고친 값', ja: JA1 };

    expect(analyze(wb, changed).counts.stale).toBe(1);
  });

  it('장면·줄이 사라져도 그 칸만 건너뛰고 예외를 던지지 않는다', () => {
    const project = baseProject();
    const wb = withEnEdit(project);

    const noScene = projectWith([], { translateMode: 'fast' });
    expect(analyze(wb, noScene).counts.stale).toBe(1);

    const shortened = baseProject();
    shortened.scenes[0].lines = [];
    expect(analyze(wb, shortened).counts.stale).toBe(1);
  });

  it('프로젝트 baseLocale 이 내보낼 때와 달라지면 적용하지 않는다', () => {
    const project = baseProject();
    const wb = withEnEdit(project);
    const changed = baseProject({ baseLocale: 'ja' });

    const { candidates, counts } = analyze(wb, changed);
    expect(candidates).toEqual([]);
    expect(counts.stale).toBe(1);
  });

  it('한 행에서 EN 은 stale 이고 JA 는 유효하면 JA 만 적용한다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [
      { lineIndex: 0, locale: 'en' },
      { lineIndex: 0, locale: 'ja' },
    ]));
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 0, 'ja', '今日は本当に楽しかったよ。');

    // 앱에서 EN 만 이미 손봤다 → EN anchor 만 어긋난다.
    const changed = baseProject();
    (changed.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>).i18n = { en: '앱에서 고친 EN', ja: JA1 };

    const { candidates, counts } = analyze(wb, changed);
    expect(counts.stale).toBe(1);
    expect(candidates).toEqual([
      { sceneId: 's1', lineIndex: 0, locale: 'ja', text: '今日は本当に楽しかったよ。' },
    ]);
  });
});

// ── ⑧ row mismatch — visible/hidden 분리 방어 ────────────────────────────────

describe('QA workbook — 원문 열 정합성', () => {
  it('숨은 metadata 가 다른 행 것과 뒤바뀌면 어느 줄에도 적용하지 않는다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [
      { lineIndex: 0, locale: 'en' },
      { lineIndex: 1, locale: 'en' },
    ]));
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 1, 'en', 'See you tomorrow.');
    // 표시 행은 그대로 두고 E열만 서로 바꾼다(숨은 열을 뺀 부분 정렬 시나리오).
    const m0 = readMeta(wb, 0);
    const m1 = readMeta(wb, 1);
    writeMeta(wb, 0, m1);
    writeMeta(wb, 1, m0);

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([]);
    expect(counts.rowMismatch).toBe(2);
  });

  it('원문 칸을 수정하면 그 행은 통째로 건너뛴다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 0, 'ko', '오늘은 정말 즐거웠어!'); // 원문을 건드렸다

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([]);
    expect(counts.rowMismatch).toBe(1);
    expect(counts.ignoredEdits).toBe(0); // "무시된 수정"이 아니라 행 자체를 못 믿는 상황이다
  });

  it('원문 칸이 수식·숫자 셀이어도 그 행을 건너뛴다', () => {
    for (const cell of [{ t: 's', v: KO1, f: 'A1' }, { t: 'n', v: 7 }] as XLSX.CellObject[]) {
      const project = baseProject();
      const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
      editCell(wb, 0, 'en', 'Today was really fun.');
      putCell(wb, 0, colOf('ko'), cell);
      const { candidates, counts } = analyze(wb, project);
      expect(candidates).toEqual([]);
      expect(counts.rowMismatch).toBe(1);
    }
  });

  it('검수 대상이 아닌 번역을 고쳐도 대상 번역은 그대로 적용된다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 0, 'ja', '今日は本当に楽しかったよ。'); // context-only

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 0, locale: 'en', text: 'Today was really fun.' }]);
    expect(counts.ignoredEdits).toBe(1);
  });

  it('baseLocale=en 프로젝트에서 참고용 한국어 칸을 채워도 무시된다', () => {
    const project = projectWith(
      [scene({ id: 's1', lines: [dialogue('Jisoo', 'Today was really fun.', { i18n: { ja: JA1 } })] })],
      { baseLocale: 'en', translateMode: 'fast' },
    );
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'ja' }]));
    editCell(wb, 0, 'ja', '今日は本当に楽しかったよ。');
    editCell(wb, 0, 'ko', '오늘은 정말 즐거웠어.'); // ko 는 이 프로젝트의 번역 대상이 아니다

    const { candidates, counts } = analyze(wb, project);
    expect(candidates).toEqual([{ sceneId: 's1', lineIndex: 0, locale: 'ja', text: '今日は本当に楽しかったよ。' }]);
    expect(counts.ignoredEdits).toBe(1);
  });
});

// ── ⑨ 행 재정렬 ──────────────────────────────────────────────────────────────

describe('QA workbook — 행 재정렬', () => {
  it('행 전체(A:E)를 함께 옮기면 결과가 같다', () => {
    const project = baseProject();
    const refs: CellRef[] = [
      { lineIndex: 0, locale: 'en' },
      { lineIndex: 1, locale: 'en' },
      { lineIndex: 2, locale: 'en' },
    ];
    const wb = exportWorkbook(project, qaCacheFor(project, refs));
    editCell(wb, 0, 'en', 'Today was really fun.');
    editCell(wb, 2, 'en', 'Neither of them said a word.');
    const before = analyze(wb, project);

    reverseDataRows(wb, 3);
    const after = analyze(wb, project);

    expect(after.counts).toEqual(before.counts);
    // 순서만 뒤집히고 내용은 같다(행 순서에 의존하지 않는다).
    expect([...after.candidates].sort((a, b) => a.lineIndex - b.lineIndex)).toEqual(
      [...before.candidates].sort((a, b) => a.lineIndex - b.lineIndex),
    );
    expect(after.candidates).toHaveLength(2);
  });

  it('빈 행이 섞여 있어도 무시한다', () => {
    const project = baseProject();
    const wb = exportWorkbook(project, qaCacheFor(project, [{ lineIndex: 0, locale: 'en' }]));
    editCell(wb, 0, 'en', 'Today was really fun.');
    // 아래쪽에 빈 행이 생기도록 범위를 늘린다(사용자가 스크롤하다 만든 흔적).
    const ws = dataSheet(wb);
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 5, c: 4 } });

    const { candidates, counts } = analyze(wb, project);
    expect(counts.rows).toBe(1);
    expect(candidates).toHaveLength(1);
  });
});
