// autoTranslateAll 의 실행 전 가드 순서 — 0건 확인이 OpenAI 키 확인보다 **앞**이어야 한다.
// 예전엔 키 검사가 먼저라, 번역이 이미 다 찬 프로젝트에서 키만 없는 사용자에게 "OpenAI 키가
// 필요합니다"가 떴다(실제로는 할 일이 없어 키도 필요 없는 상태). 버튼 이름을 "누락 번역 채우기"로
// 바꾸면서 0건 안내가 정확해야 해서 순서를 교정했고, 이 파일이 그 회귀 가드다.
//
// tests/outfit-store.test.ts 와 같은 관용구: 실제 store 를 그대로 import 해 localStorage/fetch 만
// 최소 stub 한다(범용 zustand 하네스를 만들지 않는다).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { emptyProject, type Line, type Project } from '../src/types';
import { summarizeUntranslated } from '../src/generators/translate/collect';
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

/** 번역이 전부 채워진 대본(누락 0). */
const filled = () =>
  projectWith([scene({ lines: [dialogue('민주', '안녕', { i18n: { en: 'Hi', ja: 'やあ' } })] })], {
    translateMode: 'fast',
  });

/** ja 가 비어 있는 대본(누락 1줄). */
const missing = () =>
  projectWith([scene({ lines: [dialogue('민주', '안녕', { i18n: { en: 'Hi' } })] })], {
    translateMode: 'fast',
  });

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', {});
  useStore.setState({
    project: emptyProject(),
    openaiKey: '',
    busy: {},
    translateProgress: null,
    toast: null,
  });
});

describe('autoTranslateAll — 실행 전 가드 순서', () => {
  it('누락 0건이면 키가 없어도 "빈 칸 없음"으로 안내하고 API 를 부르지 않는다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useStore.setState({ project: filled(), openaiKey: '' });

    await useStore.getState().autoTranslateAll();

    expect(useStore.getState().toast).toContain('빈 칸이 없습니다');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().busy['batch:translate']).toBeFalsy();
    expect(useStore.getState().translateProgress).toBeNull();
  });

  it('실제 누락이 있는데 키가 없으면 기존대로 키 오류를 낸다(API 호출은 여전히 0)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useStore.setState({ project: missing(), openaiKey: '' });

    await useStore.getState().autoTranslateAll();

    expect(useStore.getState().toast).toContain('OpenAI 키가 필요합니다');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().busy['batch:translate']).toBeFalsy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 원문 ↔ 번역 유효성 — i18n 은 "그 줄의 **현재** KO 원문에 대한 번역"일 때만 유효하다.
// 동치 관계는 재분석 병합(mergeScenes)이 쓰는 것과 **같은 것**(공백·문장부호만 다르면 유효)이라,
// 앱 직접 편집 / 자동 번역 커밋 / 엑셀 병합 세 경로가 같은 답을 낸다.
// ────────────────────────────────────────────────────────────────────────────

const SCENE_ID = 's1';

const line0 = () => useStore.getState().project.scenes[0].lines[0] as Extract<Line, { kind: 'dialogue' }>;
const linesNow = () => useStore.getState().project.scenes[0].lines;

describe('setLineText — 원문을 고치면 그 줄의 번역이 같은 state update 에서 무효화된다', () => {
  /** 번역·표정·보이스가 모두 붙어 있는 줄(무효화 범위를 함께 검증). */
  const translated = (): Project =>
    projectWith(
      [
        scene({
          lines: [
            dialogue('민주', '안녕', {
              i18n: { en: 'Hi', ja: 'やあ' },
              emotionAuto: '기쁨',
              voiced: true,
              voiceAssetIds: { ko: 'va1' },
            }),
          ],
        }),
      ],
      { translateMode: 'fast' },
    );

  it('의미가 바뀌면 i18n 을 지우고 그 자리를 다시 "누락"으로 되돌린다', () => {
    useStore.setState({ project: translated() });
    useStore.getState().setLineText(SCENE_ID, 0, '잘 가');

    const l = line0();
    expect(l.text).toBe('잘 가');
    expect(l.i18n).toBeUndefined();
    // ⚠️ 조용한 손실이 아니어야 한다 — 지운 자리는 "🌐 누락 번역 채우기" 대상으로 되돌아온다.
    expect(summarizeUntranslated({ scenes: useStore.getState().project.scenes }, ['en', 'ja'])).toEqual({
      byLocale: { en: 1, ja: 1 },
      lines: 1,
    });
    expect(useStore.getState().toast).toContain('원문이 바뀌어');
    // 표정·보이스는 별개 축이라 건드리지 않는다(자동 무효화를 여기서 만들지 말 것).
    expect(l.emotionAuto).toBe('기쁨');
    expect(l.voiceAssetIds).toEqual({ ko: 'va1' });
  });

  it.each([
    ['문장부호', '안녕!'],
    ['공백', '안녕 '],
  ])('%s 만 고친 편집은 번역을 유지한다(재분석 병합의 느슨 매칭과 같은 답)', (_label, next) => {
    useStore.setState({ project: translated() });
    useStore.getState().setLineText(SCENE_ID, 0, next);

    const l = line0();
    expect(l.text).toBe(next);
    expect(l.i18n).toEqual({ en: 'Hi', ja: 'やあ' });
    expect(useStore.getState().toast).toBeNull(); // 안 지웠으면 알릴 것도 없다
  });
});

/** 첫 fetch 를 붙잡아 두고 테스트가 원할 때 흘려보낸다(emotion-commit.test.ts 와 같은 관용구). */
function deferredFetch(body: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fetchMock = vi.fn(async () => {
    await gate;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
    } as unknown as Response;
  });
  return { fetchMock, release };
}

/** KO 만 있고 EN/JA 가 비어 있는 대본(자동 번역 대상 1줄 = 2칸). */
const untranslated = (): Project =>
  projectWith([scene({ lines: [dialogue('민주', '안녕')] })], { translateMode: 'fast' });

const RESP = [{ i: 0, en: 'Hi', ja: 'やあ' }];

function startRun(project: Project = untranslated(), body: unknown = RESP) {
  useStore.setState({ project, openaiKey: 'test-key' });
  const { fetchMock, release } = deferredFetch(body);
  vi.stubGlobal('fetch', fetchMock);
  return { run: useStore.getState().autoTranslateAll(), release, fetchMock };
}

describe('autoTranslateAll — 커밋 직전 anchor 재검증', () => {
  // ⚠️ 전부 **실제 배치 액션 + 지연 응답**으로 돌린다. 이 결함은 본질적으로
  // "요청 시작 → 사용자가 편집 → 옛 응답 도착 → 커밋" race 라서, 순수 헬퍼에 조작한 객체만
  // 넣고 통과시키면 정작 그 race 를 증명하지 못한다(emotion-commit.test.ts 와 같은 관용구).
  //
  // 집계 단위는 **로케일 칸**이다(줄이 아니다) — EN·JA 둘 다 온 줄이 통째로 어긋나면 2칸이다.

  it('아무 변경이 없으면 그대로 커밋된다(가드가 과잉 차단하지 않는다)', async () => {
    const { run, release, fetchMock } = startRun();
    release();
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(line0().i18n).toEqual({ en: 'Hi', ja: 'やあ' });
    expect(useStore.getState().toast).toContain('2건 채움');
    expect(useStore.getState().toast).not.toContain('건너뜀');
  });

  it('실행 중 원문이 바뀌면 옛 원문의 번역을 새 원문에 쓰지 않는다(0건 채움 · 2건 건너뜀)', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineText(SCENE_ID, 0, '잘 가');
    release();
    await run;

    expect(line0().text).toBe('잘 가');
    expect(line0().i18n).toBeUndefined();
    expect(useStore.getState().toast).toContain('0건 채움');
    expect(useStore.getState().toast).toContain('2건 건너뜀');
  });

  it('실행 중 원문이 문장부호만 바뀌면 결과를 그대로 커밋한다(세 경로가 같은 동치 관계를 쓴다)', async () => {
    // ⚠️ 이 테스트가 async 쪽 **loose-equivalence 계약**의 가드다: anchor 를 `line.text === u.ko`
    // 로 퇴행시키면 위 stale 테스트들은 다 통과하는데 **이것만** 깨진다.
    // 엑셀 병합(표기만 고쳐진 줄은 번역 승계)·앱 직접 편집(문장부호만 고치면 안 지움)과 같은 답이어야
    // 하고, 동시에 stale guard 가 표기 편집을 과잉 차단하지 않는다는 뜻이기도 하다.
    // 이 줄은 처음에 i18n 이 없으므로 setLineText 의 무효화는 발화하지 않는다(async 축만 남는다).
    const { run, release } = startRun();
    useStore.getState().setLineText(SCENE_ID, 0, '안녕!');
    release();
    await run;

    const l = line0();
    expect(l.text).toBe('안녕!');
    expect(l.i18n).toEqual({ en: 'Hi', ja: 'やあ' });
    expect(useStore.getState().toast).toContain('2건 채움');
    expect(useStore.getState().toast).not.toContain('건너뜀');
  });

  it('실행 중 앞에 줄이 삽입돼도 엉뚱한 줄이 오염되지 않는다', async () => {
    const { run, release } = startRun();
    const before = linesNow();
    useStore.getState().updateScene(SCENE_ID, { lines: [dialogue('민주', '아, 잠깐만.'), ...before] });
    release();
    await run;

    const lines = linesNow() as Extract<Line, { kind: 'dialogue' }>[];
    expect(lines).toHaveLength(2);
    // 옛 index 0 의 결과가 그 자리에 새로 온 줄에 눌러앉으면 안 된다.
    expect(lines[0].text).toBe('아, 잠깐만.');
    expect(lines[0].i18n).toBeUndefined();
    expect(lines[1].i18n).toBeUndefined();
    expect(useStore.getState().toast).toContain('2건 건너뜀');
  });

  it('실행 중 앞 줄이 삭제돼 target index 가 사라지면 조용히 유실되지 않고 건너뜀으로 집계된다', async () => {
    // ⚠️ 이 케이스가 2-pass 구조를 지키는 가드다 — 현재 scenes 를 map 하며 updates.get(i) 를 보는
    // 방식이면 범위를 벗어난 결과는 **검증 branch 에 들어오지도 못해** 집계에서 사라진다.
    const twoLines = projectWith(
      [scene({ lines: [dialogue('민주', '첫 줄'), dialogue('민주', '둘째 줄')] })],
      { translateMode: 'fast' },
    );
    const { run, release } = startRun(twoLines, [{ i: 1, en: 'Second', ja: '二番目' }]);
    useStore.getState().updateScene(SCENE_ID, { lines: linesNow().slice(1) });
    release();
    await run;

    const lines = linesNow() as Extract<Line, { kind: 'dialogue' }>[];
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('둘째 줄');
    expect(lines[0].i18n).toBeUndefined(); // wrong-line commit 0
    expect(useStore.getState().toast).toContain('0건 채움');
    expect(useStore.getState().toast).toContain('2건 건너뜀'); // silent success 0
  });

  it('실행 중 사람이 채운 칸은 덮지 않고, 같은 줄의 빈 칸은 정상 커밋한다(1건 채움 · 1건 건너뜀)', async () => {
    // ⚠️ 계약은 **줄 단위 skip 이 아니라 로케일 칸 단위 non-overwrite** 다 — EN 이 찼다고 그 줄을
    // 통째로 버리면 아직 비어 있던 JA 까지 잃는다.
    const { run, release } = startRun();
    useStore.getState().setLineTranslation(SCENE_ID, 0, 'en', 'Manual EN');
    release();
    await run;

    expect(line0().i18n).toEqual({ en: 'Manual EN', ja: 'やあ' });
    expect(useStore.getState().toast).toContain('1건 채움');
    expect(useStore.getState().toast).toContain('1건 건너뜀');
  });

  it('KO 가 같아도 화자가 바뀌면 커밋하지 않는다(같은 "네." 라도 누가 말했는지가 입력이다)', async () => {
    const { run, release } = startRun();
    useStore.getState().updateScene(SCENE_ID, { lines: [dialogue('서연', '안녕')] });
    release();
    await run;

    const l = line0();
    expect(l.speaker).toBe('서연');
    expect(l.text).toBe('안녕'); // 원문은 한 글자도 안 바뀌었다
    expect(l.i18n).toBeUndefined(); // 그런데도 버려야 한다
    expect(useStore.getState().toast).toContain('2건 건너뜀');
  });

  // ⚠️ mutation 으로 확인한 사실: 이 케이스를 실제로 잡는 건 kind 검사가 아니라 **화자 검사**다
  // (narration 의 화자 파생값은 항상 undefined 라 dialogue↔narration 이면 화자부터 어긋난다).
  // 그래서 이 테스트는 "kind branch 전용 가드"가 아니라 **대사↔지문 교체의 end-to-end 계약**을 고정한다
  // — kind 검사를 지워도 통과하므로, 그 검사를 정리하려면 aiBatchSlice 의 4·5 주석을 함께 볼 것.
  it('KO 가 같아도 대사 ↔ 지문이 바뀌면 커밋하지 않는다', async () => {
    const { run, release } = startRun();
    useStore.getState().updateScene(SCENE_ID, { lines: [{ kind: 'narration', text: '안녕' }] });
    release();
    await run;

    const l = linesNow()[0] as Extract<Line, { kind: 'narration' }>;
    expect(l.kind).toBe('narration');
    expect(l.text).toBe('안녕');
    expect(l.i18n).toBeUndefined();
    expect(useStore.getState().toast).toContain('0건 채움');
    expect(useStore.getState().toast).toContain('2건 건너뜀');
  });
});
