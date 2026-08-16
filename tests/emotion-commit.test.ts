// 표정 AI 의 **커밋 직전 stale 재검증**(Phase 8 · C1) — S1~S13.
//
// 이 파일이 지키는 계약은 두 축이다(중복이 아니라 역할 분리):
//   · target validation  = "이 결과를 지금 이 줄에 써도 되는가"(장면/인덱스/대상 자격/anchor/의상/후보)
//   · request validation = "이 결과를 만든 LLM 판단 근거가 아직 같은가"(요청 원문 비교)
// 8조건만 있고 요청 검사가 없으면, **target 은 한 글자도 안 변했는데 그 요청의 문맥 줄만 바뀐 경우**
// (주인공 대사·지문·기배정 표정)가 통째로 새어 나간다 — S8/S9/S10 이 정확히 그 회귀를 잡는다.
//
// ⚠️ 전부 **실제 store 배치 액션 + 지연 응답**으로 돌린다. C1 은 본질적으로
// "요청 시작 → 사용자가 편집 → 옛 응답 도착 → 최종 커밋" 이라는 race 라서, 순수 헬퍼에 조작한
// old/fresh 객체만 넣고 통과시키면 정작 그 race 를 증명하지 못한다(기존 O24 와 같은 관용구를 쓴다).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { emptyProject, type Character, type Line, type Project, type Scene } from '../src/types';
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

const SCENE_ID = 's1';

/**
 * 민주의 '사복' 은 기본 의상과 **같은 표정 집합**을 갖는다 — 일부러 그렇게 둔다.
 * 그래야 의상만 바꿨을 때 후보 목록(=요청 페이로드)이 그대로라 **조건 7(의상 identity)만** 단독으로
 * 발화하고, 요청 검사(조건 9)에 가려지지 않는다(S3 가 무엇을 증명하는지 분명해진다).
 */
function heroine(): Character {
  return {
    name: '민주',
    color: '#f88',
    expressions: { 기본: 'a-base', 기쁨: 'a-joy' },
    outfits: [{ name: '사복', expressions: { 기본: 'b-base', 기쁨: 'b-joy' } }],
  };
}
function heroine2(): Character {
  return { name: '유나', color: '#8ff', expressions: { 기본: 'c-base', 기쁨: 'c-joy' } };
}
function protagonist(): Character {
  return { name: '한지수', color: '#fff', expressions: {}, isProtagonist: true };
}

/**
 * 문맥 전용 줄 3종(주인공 대사·지문·이미 배정된 대사)이 **target 보다 앞**에 오는 장면.
 * ⚠️ 순서가 중요하다: 문맥 window 는 `i ≤ 이 청크의 마지막 target` 까지만 담고 look-ahead 가 없어서,
 * target 뒤에 둔 줄은 애초에 요청에 실리지 않는다(그러면 S8~S10 이 아무것도 증명하지 못한다).
 */
const CTX_PROTAGONIST = 0;
const CTX_NARRATION = 1;
const CTX_ASSIGNED = 2;
const T_MINJU = 3;
const T_YUNA = 4;

function baseScene(): Scene {
  return scene({
    id: SCENE_ID,
    lines: [
      dialogue('한지수', '오늘은 기분이 좋아 보여.'), // 주인공 = 문맥 전용
      { kind: 'narration', text: '창밖으로 노을이 진다.' },
      dialogue('유나', '그러게, 날이 좋네.', { emotion: '기쁨' }), // 기배정 = 문맥(expr 을 싣는다)
      dialogue('민주', '다녀왔어.'), // target
      dialogue('유나', '어서 와.'), // target
    ],
  });
}
function baseProject(): Project {
  return projectWith([baseScene()], { characters: [protagonist(), heroine(), heroine2()] });
}

/** 첫 fetch 를 붙잡아 두고 테스트가 원할 때 흘려보낸다(O24 의 deferredFetch 와 같은 관용구). */
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

const lineAt = (i: number, sceneIdx = 0) =>
  useStore.getState().project.scenes[sceneIdx].lines[i] as Extract<Line, { kind: 'dialogue' }>;
const autoOf = (i: number) => lineAt(i).emotionAuto;

/** 민주·유나 두 target 을 배정하는 정상 응답. */
const BOTH = { results: [{ i: T_MINJU, expr: '기쁨' }, { i: T_YUNA, expr: '기쁨' }] };

/** 배치를 시작하고 응답을 붙잡아 둔 상태로 돌려준다(그 사이 테스트가 project 를 편집한다). */
function startRun(body: unknown = BOTH, project: Project = baseProject()) {
  useStore.setState({ project, openaiKey: 'test-key' });
  const { fetchMock, release } = deferredFetch(body);
  vi.stubGlobal('fetch', fetchMock);
  const run = useStore.getState().autoAssignEmotionAll();
  return { run, release, fetchMock };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { confirm: () => true });
  useStore.setState({
    project: emptyProject(),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    busy: {},
    emotionProgress: null,
    toast: null,
  });
});

describe('S1 — 아무 변경이 없으면 요청이 바이트 동일이라 결과가 그대로 커밋된다', () => {
  it('두 target 모두 emotionAuto 가 채워진다(가드가 과잉 차단하지 않는다)', async () => {
    const { run, release, fetchMock } = startRun();
    release();
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(1); // 한 요청에 두 target — 아래 테스트들의 전제
    expect(autoOf(T_MINJU)).toBe('기쁨');
    expect(autoOf(T_YUNA)).toBe('기쁨');
    expect(useStore.getState().toast).toContain('2건 채움');
    expect(useStore.getState().toast).not.toContain('건너뜀');
  });
});

describe('S2 — 실행 중 줄이 밀리면 stale 결과가 "잘못된 줄"에 박히지 않는다', () => {
  // stable Line ID 가 없으므로(그리고 만들지 않으므로) 여러 건이 보수적으로 skip 될 수 있다.
  // 증명하는 계약은 "정확히 N건만 skip" 이 아니라 **"엉뚱한 줄이 오염되지 않는다"** 다.
  it('앞에 줄이 삽입되면 새 줄에도, 밀려난 옛 줄에도 옛 배정이 쓰이지 않는다', async () => {
    const { run, release } = startRun();
    const before = useStore.getState().project.scenes[0].lines;
    useStore.getState().updateScene(SCENE_ID, {
      lines: [dialogue('민주', '아, 잠깐만.'), ...before],
    });
    release();
    await run;

    const lines = useStore.getState().project.scenes[0].lines;
    const auto = (i: number) => (lines[i] as Extract<Line, { kind: 'dialogue' }>).emotionAuto;
    expect(lines).toHaveLength(6);
    expect((lines[0] as Extract<Line, { kind: 'dialogue' }>).text).toBe('아, 잠깐만.');
    expect(auto(0)).toBeUndefined();
    // 옛 인덱스(3·4)의 결과가 밀려난 줄(4·5)에 그대로 눌러앉으면 안 된다.
    expect(auto(4)).toBeUndefined();
    expect(auto(5)).toBeUndefined();
  });
});

describe('S3·S5 — 의상만 바뀐 target 은 skip, 무관한 target 은 그대로 커밋', () => {
  it('민주의 줄 의상이 바뀌면 그 줄만 버리고 유나의 결과는 살린다', async () => {
    const { run, release } = startRun();
    // 후보 목록이 같도록 fixture 를 짰으므로 요청 원문은 그대로다 → 조건 7(의상 identity)만 발화한다.
    useStore.getState().setLineOutfit(SCENE_ID, T_MINJU, '민주', '사복');
    release();
    await run;

    expect(autoOf(T_MINJU)).toBeUndefined(); // 기본→사복: 후보 공간이 달라진 줄
    expect(autoOf(T_YUNA)).toBe('기쁨'); // 무관한 target 은 부분 보존된다(run 전체 폐기 아님)
    expect(useStore.getState().toast).toContain('1건 채움');
    expect(useStore.getState().toast).toContain('1건 건너뜀');
  });
});

describe('S4 — 실행 중 사람이 표정을 직접 고르면 그 밑에 AI 값을 깔지 않는다', () => {
  it('manual emotion 이 생긴 줄은 emotionAuto 가 비어 있어야 한다(latent stale 방지)', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineEmotion(SCENE_ID, T_MINJU, '화남');
    release();
    await run;

    expect(lineAt(T_MINJU).emotion).toBe('화남');
    // ⚠️ 우선순위상 emotion 이 이기니 괜찮다고 넘기면 안 된다 — 사람이 나중에 수동값을 지우는 순간
    // 옛 run 의 stale 배정이 되살아난다. 아예 쓰지 않는 것이 계약이다.
    expect(autoOf(T_MINJU)).toBeUndefined();
    // 같은 요청의 다른 target 도 함께 빠진다: target 하나가 사라지면 청크 구성이 달라져 요청 원문이
    // 바뀌기 때문이다(문서화한 보수적 blast radius — 오검보다 안전한 쪽).
    expect(autoOf(T_YUNA)).toBeUndefined();
  });
});

describe('S6 — 고른 표정이 더 이상 유효 후보가 아니면 skip', () => {
  it('그 표정의 스프라이트가 사라지면 배정하지 않는다', async () => {
    const { run, release } = startRun();
    useStore.getState().updateCharacter('민주', { expressions: { 기본: 'a-base' } }); // 기쁨 스프라이트 제거
    release();
    await run;

    expect(autoOf(T_MINJU)).toBeUndefined();
    // 후보 목록은 요청 페이로드의 일부라 같은 요청의 유나도 함께 무효가 된다(보수적).
    expect(autoOf(T_YUNA)).toBeUndefined();
  });
});

describe('S7 — 건너뛴 건수를 완료 토스트가 알린다', () => {
  it('조용히 성공처럼 끝내지 않는다', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineOutfit(SCENE_ID, T_MINJU, '민주', '사복');
    release();
    await run;

    expect(useStore.getState().toast).toContain('분석 중 프로젝트가 변경됨');
  });
});

describe('S8 — 같은 요청 안 주인공 대사(문맥 전용)만 바뀌어도 stale 이다', () => {
  it('target 은 전혀 안 변했지만 판단 근거가 달라졌으므로 skip 한다', async () => {
    const { run, release } = startRun();
    // 주인공 줄은 target 이 아니다 — 8조건(장면·인덱스·자격·anchor·의상·후보)은 전부 통과한다.
    useStore.getState().setLineText(SCENE_ID, CTX_PROTAGONIST, '오늘은 화가 많이 난 것 같아.');
    release();
    await run;

    expect(lineAt(T_MINJU).speaker).toBe('민주');
    expect(lineAt(T_MINJU).text).toBe('다녀왔어.'); // target 은 한 글자도 안 바뀌었다
    expect(autoOf(T_MINJU)).toBeUndefined(); // 그런데도 버려야 한다 — 조건 9 가 없으면 새어 나간다
    expect(autoOf(T_YUNA)).toBeUndefined();
  });
});

describe('S9 — 같은 요청 안 지문(문맥 전용)만 바뀌어도 stale 이다', () => {
  it('narration 변경도 요청 원문을 바꾼다', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineText(SCENE_ID, CTX_NARRATION, '창밖에서 비가 쏟아진다.');
    release();
    await run;

    expect(autoOf(T_MINJU)).toBeUndefined();
    expect(autoOf(T_YUNA)).toBeUndefined();
  });
});

describe('S10 — 문맥으로 실린 "이미 배정된 표정" 이 바뀌어도 stale 이다', () => {
  it('기배정 줄의 emotion 변경이 연속성 근거를 바꾼다', async () => {
    const { run, release } = startRun();
    // 이 줄은 emotion 이 있어 target 이 아니고, 문맥 줄의 expr 로 요청에 실린다.
    useStore.getState().setLineEmotion(SCENE_ID, CTX_ASSIGNED, '화남');
    release();
    await run;

    expect(lineAt(T_MINJU).text).toBe('다녀왔어.'); // target 자체는 그대로
    expect(autoOf(T_MINJU)).toBeUndefined();
    expect(autoOf(T_YUNA)).toBeUndefined();
  });
});

describe('S11 — 요청에 실리지 않는 변경은 과잉 무효화하지 않는다', () => {
  it('번역(i18n)은 요청 semantic input 이 아니므로 결과가 정상 커밋된다', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineTranslation(SCENE_ID, T_MINJU, 'en', "I'm back.");
    release();
    await run;

    expect(autoOf(T_MINJU)).toBe('기쁨');
    expect(autoOf(T_YUNA)).toBe('기쁨');
    expect(useStore.getState().toast).not.toContain('건너뜀');
  });
});

describe('S12 — AI 커밋이 실행 중 사용자 편집을 되감지 않는다', () => {
  it('요청과 무관한 편집은 emotionAuto 커밋 뒤에도 그대로 남는다', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineTranslation(SCENE_ID, T_MINJU, 'en', "I'm back.");
    useStore.getState().setSceneStatus(SCENE_ID, 'draft');
    release();
    await run;

    // ⚠️ 쓰기 base 가 run 시작 시점 스냅샷이면 이 둘이 옛 값으로 되감긴다.
    expect(lineAt(T_MINJU).i18n?.en).toBe("I'm back.");
    expect(useStore.getState().project.scenes[0].status).toBe('draft');
    expect(autoOf(T_MINJU)).toBe('기쁨'); // 그러면서도 AI 값은 정상 커밋
  });
});

describe('S13 — stale skip 이어도 그 사이 사용자 편집은 보존된다', () => {
  it('배치가 프로젝트를 옛 상태로 복원하지 않는다', async () => {
    const { run, release } = startRun();
    useStore.getState().setLineOutfit(SCENE_ID, T_MINJU, '민주', '사복'); // 이 편집이 stale 을 유발한다
    useStore.getState().setLineTranslation(SCENE_ID, T_YUNA, 'ja', 'おかえり。');
    release();
    await run;

    expect(autoOf(T_MINJU)).toBeUndefined(); // skip 은 skip 대로
    expect(lineAt(T_MINJU).outfits).toEqual({ 민주: '사복' }); // 사용자가 바꾼 값은 살아 있다
    expect(lineAt(T_YUNA).i18n?.ja).toBe('おかえり。');
  });
});
