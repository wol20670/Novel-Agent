// post-v1 번역 개선 Phase 3-B — 번역 QA 배치의 store lifecycle 회귀 가드.
//
// tests/translate-store.test.ts · tests/outfit-store.test.ts 와 같은 관용구: 실제 store 를 그대로
// import 해 localStorage/window/fetch 만 최소 stub 한다(범용 zustand 하네스를 만들지 않는다).
//
// 여기서 지키는 핵심 4가지:
//   ① 규칙(copy-through) 결과는 **AI 가용성·키·요청 실패와 독립**이다
//   ② async 결과는 **칸 단위로** stale skip 한다(run 전체 폐기 없음)
//   ③ 부분 성공을 보존한다(요청 하나가 죽어도 나머지는 커밋)
//   ④ canonical(project.scenes)은 **절대 바뀌지 않는다**
// ⚠️ 모델의 semantic 정확도는 검증하지 않는다 — 응답은 전부 stub 이고 wire/workflow 계약만 본다.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { emptyProject, type Line, type Project } from '../src/types';
import type { TranslationQaAnchor, TranslationQaResult } from '../src/generators/translate/qa';
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

const MINI = 'gpt-4o-mini';
const S1 = 's1';

/** 정상 번역 한 줄(AI 대상). */
const normalLine = () => dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } });
/** 원문이 EN 칸에 복사된 줄(copy-through — 규칙이 API 없이 잡는다). */
const copyLine = () => dialogue('민주', '안녕하세요', { i18n: { en: '안녕하세요' } });

function projectFor(lines: Line[], extra?: Partial<Project>): Project {
  return projectWith([scene({ id: S1, lines })], { translateMode: 'fast', ...extra });
}

function seed(lines: Line[], extra?: Partial<Project> & { key?: string }) {
  const { key, ...projectExtra } = extra ?? {};
  useStore.setState({ project: projectFor(lines, projectExtra), openaiKey: key ?? '' });
}

/** OpenAI chat 응답 한 건(성공). */
function okResponse(results: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ results }) } }] }),
  } as unknown as Response;
}

function errorResponse(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

/** 첫 호출을 붙잡아 두고 테스트가 원할 때 흘려보낸다(outfit-store 의 deferredFetch 와 같은 관용구). */
function deferredFetch(results: unknown[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fetchMock = vi.fn(async () => {
    await gate;
    return okResponse(results);
  });
  return { fetchMock, release };
}

const qa = () => useStore.getState().translationQa;
const allResults = (): TranslationQaResult[] => Object.values(qa()).flat();
const toast = () => useStore.getState().toast;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', {});
  useStore.setState({
    project: emptyProject(),
    openaiKey: '',
    busy: {},
    translationQa: {},
    translationQaProgress: null,
    toast: null,
  });
});

describe('실행 전 가드', () => {
  it("translateMode 가 off 면 통째로 no-op 이다(API 도 state 도 건드리지 않는다)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    seed([copyLine(), normalLine()], { translateMode: undefined, key: 'test-key' });

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(qa()).toEqual({});
    expect(toast()).toBeNull();
  });

  it('새로 검수할 칸이 없으면 키가 없어도 안내만 하고 끝낸다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    seed([dialogue('민주', '반가워')]); // 번역이 아예 없는 줄 = Phase 1 영역

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast()).toContain('검수할 번역이 없습니다');
  });
});

describe('규칙 결과는 AI 가용성과 독립이다', () => {
  it('Case A — AI 대상이 0이면 OpenAI 키 없이도 규칙 결과가 커밋된다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    seed([copyLine()]); // 키 없음

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).not.toHaveBeenCalled();
    const results = allResults();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ origin: 'rule', verdict: 'review', category: 'language' });
    expect(results[0].anchor.targetLocale).toBe('en');
    expect(results[0].model).toBeUndefined();
  });

  it('Case B — AI 대상이 있는데 키가 없으면 규칙 결과는 남기고 AI 만 건너뛴다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    seed([copyLine(), normalLine()]); // 키 없음

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).not.toHaveBeenCalled();
    const results = allResults();
    expect(results).toHaveLength(1); // 규칙 1건만
    expect(results[0].origin).toBe('rule');
    expect(toast()).toContain('OpenAI 키가 필요');
    expect(useStore.getState().busy['batch:translate-qa']).toBeFalsy();
    expect(useStore.getState().translationQaProgress).toBeNull();
  });
});

describe('정상 실행 + wire contract', () => {
  it('실제 요청 body 가 계약대로 나가고 응답이 origin:ai 결과로 커밋된다', async () => {
    const fetchMock = vi.fn(async () =>
      okResponse([{ i: 0, v: 'review', c: 'meaning', r: '원문은 긍정, 번역은 부정.' }]),
    );
    vi.stubGlobal('fetch', fetchMock);
    seed([normalLine()], { key: 'test-key' });

    await useStore.getState().reviewTranslationsAll();

    // ── transport wire contract ────────────────────────────────────────────
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(MINI);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    // 요청 payload 는 그 칸의 입력만 — 주변 줄 문맥이 실리지 않는다.
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload.items).toEqual([
      { i: 0, sourceLocale: 'ko', targetLocale: 'en', source: '반가워', target: 'Nice to meet you.', speaker: '민주' },
    ]);

    // ── 커밋된 결과 ────────────────────────────────────────────────────────
    const results = allResults();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      origin: 'ai',
      verdict: 'review',
      category: 'meaning',
      reason: '원문은 긍정, 번역은 부정.',
      model: MINI,
    });
    expect(results[0].anchor).toMatchObject({ sceneId: S1, lineIndex: 0, targetLocale: 'en', source: '반가워' });
    expect(useStore.getState().busy['batch:translate-qa']).toBeFalsy();
    expect(useStore.getState().translationQaProgress).toBeNull();
  });

  it('canonical(project.scenes)은 QA 실행으로 바뀌지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '이유' }])));
    seed([normalLine()], { key: 'test-key' });
    const before = JSON.stringify(useStore.getState().project);

    await useStore.getState().reviewTranslationsAll();

    expect(JSON.stringify(useStore.getState().project)).toBe(before);
  });

  it('응답에 없는 항목은 unreviewed 로 남아 다음 실행에서 다시 대상이 된다(부분 응답)', async () => {
    const fetchMock = vi.fn(async () => okResponse([{ i: 0, v: 'ok' }])); // i:1 은 빠뜨림
    vi.stubGlobal('fetch', fetchMock);
    seed([normalLine(), dialogue('민주', '또 봐', { i18n: { en: 'See you.' } })], { key: 'test-key' });

    await useStore.getState().reviewTranslationsAll();
    expect(allResults()).toHaveLength(1);

    // 두 번째 실행 — 캐시된 i:0 은 건너뛰고 남은 한 칸만 다시 요청한다.
    fetchMock.mockClear();
    await useStore.getState().reviewTranslationsAll();
    const second = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const items = JSON.parse(second.messages[1].content).items;
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('또 봐');
  });
});

describe('실패 처리 — 부분 성공 보존', () => {
  it(
    'Case C — 요청 하나가 실패해도 나머지 성공분과 규칙 결과는 커밋된다',
    async () => {
      // 장면 3개 = 요청 3개(장면 × 대상 로케일 grouping) + 규칙 1건.
      const scenes = [
        scene({ id: 's1', lines: [copyLine(), normalLine()] }),
        scene({ id: 's2', lines: [dialogue('서연', '잘 지냈어?', { i18n: { en: 'How have you been?' } })] }),
        scene({ id: 's3', lines: [dialogue('서연', '또 보자', { i18n: { en: 'See you again.' } })] }),
      ];
      useStore.setState({
        project: projectWith(scenes, { translateMode: 'fast' }),
        openaiKey: 'test-key',
      });
      let call = 0;
      const fetchMock = vi.fn(async () => {
        call += 1;
        if (call === 2) return errorResponse(400); // 일시적 오류가 아니라 재시도도 없다
        return okResponse([{ i: 0, v: 'review', c: 'meaning', r: '의미가 다릅니다.' }]);
      });
      vi.stubGlobal('fetch', fetchMock);

      await useStore.getState().reviewTranslationsAll();

      expect(fetchMock).toHaveBeenCalledTimes(3); // 실패해도 다음 요청을 계속한다
      const results = allResults();
      expect(results.filter((r) => r.origin === 'rule')).toHaveLength(1);
      expect(results.filter((r) => r.origin === 'ai')).toHaveLength(2); // 1·3번 요청분
      expect(results.some((r) => r.anchor.sceneId === 's2')).toBe(false); // 실패한 요청만 빠진다
      expect(toast()).toContain('1개 요청 실패');
    },
    15000,
  );

  it('Case D — fatal(401)이면 이후 요청은 중단하되 이미 확보한 규칙 결과는 남는다', async () => {
    const fetchMock = vi.fn(async () => errorResponse(401));
    vi.stubGlobal('fetch', fetchMock);
    seed([copyLine(), normalLine()], { key: 'test-key' });

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).toHaveBeenCalledTimes(1); // 재시도 폭주 없음(비일시적 오류)
    const results = allResults();
    expect(results).toHaveLength(1);
    expect(results[0].origin).toBe('rule');
    expect(toast()).toContain('중단');
    expect(useStore.getState().busy['batch:translate-qa']).toBeFalsy();
    expect(useStore.getState().translationQaProgress).toBeNull();
  });
});

describe('async stale validation — 칸 단위 skip', () => {
  /** 검수 중에 사용자가 편집하는 상황을 만든다. */
  async function runWithEdit(lines: Line[], edit: () => void, results: unknown[]) {
    const { fetchMock, release } = deferredFetch(results);
    vi.stubGlobal('fetch', fetchMock);
    seed(lines, { key: 'test-key' });

    const run = useStore.getState().reviewTranslationsAll();
    edit();
    release();
    await run;
    return fetchMock;
  }

  it('검수 중 원문이 바뀌면 그 결과를 버린다', async () => {
    await runWithEdit(
      [normalLine()],
      () => useStore.getState().setLineText(S1, 0, '아주 반가워'),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    expect(allResults()).toHaveLength(0);
    expect(toast()).toContain('건너뜀');
  });

  it('검수 중 EN 을 고치면 EN 결과만 버리고 JA 결과는 커밋한다', async () => {
    await runWithEdit(
      [dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.', ja: 'はじめまして' } })],
      () => useStore.getState().setLineTranslation(S1, 0, 'en', 'Glad to meet you.'),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    const results = allResults();
    expect(results).toHaveLength(1);
    expect(results[0].anchor.targetLocale).toBe('ja');
  });

  it('검수 중 JA 를 고치면 JA 결과만 버리고 EN 결과는 커밋한다', async () => {
    await runWithEdit(
      [dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.', ja: 'はじめまして' } })],
      () => useStore.getState().setLineTranslation(S1, 0, 'ja', '会えてうれしい'),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    const results = allResults();
    expect(results).toHaveLength(1);
    expect(results[0].anchor.targetLocale).toBe('en');
  });

  it('검수 중 줄이 사라지면 그 결과를 버린다', async () => {
    await runWithEdit(
      [normalLine()],
      () =>
        useStore.setState((s) => ({
          project: { ...s.project, scenes: s.project.scenes.map((sc) => ({ ...sc, lines: [] })) },
        })),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    expect(allResults()).toHaveLength(0);
  });

  it('검수 중 장면이 사라지면 그 결과를 버린다', async () => {
    await runWithEdit(
      [normalLine()],
      () => useStore.setState((s) => ({ project: { ...s.project, scenes: [] } })),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    expect(allResults()).toEqual([]);
  });

  it('검수 중 줄이 앞에 삽입돼 인덱스가 밀리면 엉뚱한 줄에 붙이지 않는다', async () => {
    await runWithEdit(
      [normalLine()],
      () =>
        useStore.setState((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => ({
              ...sc,
              lines: [dialogue('서연', '먼저 한마디', { i18n: { en: 'A word first.' } }), ...sc.lines],
            })),
          },
        })),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    // 0번에는 이제 다른 줄이 있다 — 옛 판정이 그 줄에 붙으면 안 된다.
    expect(allResults()).toHaveLength(0);
  });

  it('검수 중 화자가 바뀌면 그 결과를 버린다', async () => {
    await runWithEdit(
      [normalLine()],
      () =>
        useStore.setState((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => ({
              ...sc,
              lines: [dialogue('서연', '반가워', { i18n: { en: 'Nice to meet you.' } })],
            })),
          },
        })),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    expect(allResults()).toHaveLength(0);
  });

  it('검수 중 대사가 지문으로 바뀌면 그 결과를 버린다', async () => {
    await runWithEdit(
      [normalLine()],
      () =>
        useStore.setState((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => ({
              ...sc,
              lines: [{ kind: 'narration', text: '반가워', i18n: { en: 'Nice to meet you.' } } as Line],
            })),
          },
        })),
      [{ i: 0, v: 'review', c: 'meaning', r: '이유' }],
    );
    expect(allResults()).toHaveLength(0);
  });

  it('규칙 결과도 같은 재검증을 거친다 — 검수 중 그 칸을 고치면 옛 경고를 커밋하지 않는다', async () => {
    // 규칙 칸(copy) + AI 칸(normal)을 함께 두고, 실행 중 규칙 칸의 번역을 고친다.
    await runWithEdit(
      [copyLine(), normalLine()],
      () => useStore.getState().setLineTranslation(S1, 0, 'en', 'Hello.'),
      [{ i: 0, v: 'ok' }],
    );
    const results = allResults();
    expect(results.filter((r) => r.origin === 'rule')).toHaveLength(0);
    expect(results.filter((r) => r.origin === 'ai')).toHaveLength(1);
  });
});

describe('manual precedence — 사람의 판단이 pending 자동 판정보다 우선한다', () => {
  it('검수 중 "문제 없음"을 누르면 나중에 도착한 AI 결과가 그 판단을 덮지 않는다', async () => {
    // 1) fast(mini)로 한 번 돌려 그 칸에 review 이슈를 만든다.
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '이유' }])));
    seed([normalLine()], { key: 'test-key' });
    await useStore.getState().reviewTranslationsAll();
    const anchorA = allResults()[0].anchor;
    expect(allResults()[0].origin).toBe('ai');

    // 2) quality 로 바꾸면 mini 결과는 재사용되지 않아 같은 칸이 다시 AI 대상이 된다.
    useStore.setState((s) => ({ project: { ...s.project, translateMode: 'quality' } }));
    const { fetchMock, release } = deferredFetch([{ i: 0, v: 'review', c: 'omission', r: '누락' }]);
    vi.stubGlobal('fetch', fetchMock);

    const run = useStore.getState().reviewTranslationsAll();
    // 3) 요청이 떠 있는 동안 사용자가 그 칸을 "문제 없음"으로 확정한다.
    useStore.getState().dismissQaIssue(anchorA);
    expect(allResults()[0].origin).toBe('manual');
    release();
    await run;

    // 4) 뒤늦게 도착한 AI review 가 사람의 판단을 덮으면 안 된다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const results = allResults();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ origin: 'manual', verdict: 'ok' });
    expect(results[0].category).toBeUndefined();
    // 조용히 버리지 않고 알린다.
    expect(toast()).toContain('문제 없음');
  });

  it('실행 시작 시점에 만들어진 규칙 결과도 같은 guard 를 받는다', async () => {
    // 규칙 칸(0번)과 AI 칸(1번)을 함께 두면, AI 요청이 떠 있는 동안이 곧 규칙 결과의 대기 구간이다.
    const ruleAnchor: TranslationQaAnchor = {
      sceneId: S1,
      lineIndex: 0,
      sourceLocale: 'ko',
      targetLocale: 'en',
      source: '안녕하세요',
      target: '안녕하세요',
      speaker: '민주',
      narration: false,
    };
    const { fetchMock, release } = deferredFetch([{ i: 0, v: 'ok' }]);
    vi.stubGlobal('fetch', fetchMock);
    seed([copyLine(), normalLine()], { key: 'test-key' });

    const run = useStore.getState().reviewTranslationsAll();
    useStore.getState().dismissQaIssue(ruleAnchor);
    release();
    await run;

    const results = allResults();
    const ruleCell = results.find((r) => r.anchor.lineIndex === 0)!;
    expect(ruleCell).toMatchObject({ origin: 'manual', verdict: 'ok' });
    // AI 칸은 정상적으로 커밋된다(guard 는 그 칸에만 걸린다).
    expect(results.find((r) => r.anchor.lineIndex === 1)).toMatchObject({ origin: 'ai', verdict: 'ok' });
  });

  it('그 사이 번역이 바뀌어 stale 이 된 manual 결과는 새 QA 를 막지 않는다', async () => {
    // 1) 이슈 → "문제 없음" 으로 확정
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '이유' }])));
    seed([normalLine()], { key: 'test-key' });
    await useStore.getState().reviewTranslationsAll();
    useStore.getState().dismissQaIssue(allResults()[0].anchor);
    expect(allResults()[0].origin).toBe('manual');

    // 2) 그 칸의 번역을 고치면 옛 manual 판단은 더 이상 그 칸의 답이 아니다 → 다시 검수 대상.
    useStore.getState().setLineTranslation(S1, 0, 'en', 'Glad to meet you.');
    const fetchMock = vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '새 이유' }]));
    vi.stubGlobal('fetch', fetchMock);
    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const results = allResults();
    expect(results).toHaveLength(1); // 옛 manual 은 compaction 이 걷어낸다
    expect(results[0]).toMatchObject({ origin: 'ai', verdict: 'review', reason: '새 이유' });
  });
});

describe('증분 캐시 — 실행이 현재 모델을 그대로 넘긴다', () => {
  const cachedAi = (model: string): TranslationQaResult => ({
    anchor: {
      sceneId: S1,
      lineIndex: 0,
      sourceLocale: 'ko',
      targetLocale: 'en',
      source: '반가워',
      target: 'Nice to meet you.',
      speaker: '민주',
      narration: false,
    },
    verdict: 'ok',
    origin: 'ai',
    model,
  });

  it('같은 모델의 AI 결과가 있으면 요청하지 않는다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    seed([normalLine()], { key: 'test-key' });
    useStore.setState({ translationQa: { [S1]: [cachedAi(MINI)] } });

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast()).toContain('검수할 번역이 없습니다');
  });

  it('번역 모드를 quality 로 바꾸면 mini 결과를 재사용하지 않고 다시 검수한다', async () => {
    const fetchMock = vi.fn(async () => okResponse([{ i: 0, v: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);
    seed([normalLine()], { key: 'test-key', translateMode: 'quality' });
    useStore.setState({ translationQa: { [S1]: [cachedAi(MINI)] } });

    await useStore.getState().reviewTranslationsAll();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o');
    expect(allResults()[0].model).toBe('gpt-4o'); // 캐시가 새 모델 결과로 교체된다(칸 identity upsert)
    expect(allResults()).toHaveLength(1);
  });
});

describe('dismissQaIssue / clearTranslationQa', () => {
  async function seedOneIssue() {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '이유' }])));
    seed([normalLine()], { key: 'test-key' });
    await useStore.getState().reviewTranslationsAll();
    return allResults()[0].anchor;
  }

  it('"문제 없음"은 그 칸을 manual ok 로 대체하고 재실행에서도 건너뛴다', async () => {
    const anchor = await seedOneIssue();

    useStore.getState().dismissQaIssue(anchor);

    const results = allResults();
    expect(results).toHaveLength(1); // 칸 identity upsert — 항목이 늘지 않는다
    expect(results[0]).toMatchObject({ origin: 'manual', verdict: 'ok' });
    expect(results[0].category).toBeUndefined();
    expect(results[0].reason).toBeUndefined();
    expect(results[0].model).toBeUndefined();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useStore.getState().reviewTranslationsAll();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('그 사이 번역이 바뀐(stale) anchor 로 부르면 아무 일도 하지 않는다', async () => {
    const anchor = await seedOneIssue();
    useStore.getState().setLineTranslation(S1, 0, 'en', 'Glad to meet you.');

    useStore.getState().dismissQaIssue(anchor);

    expect(allResults().every((r) => r.origin !== 'manual')).toBe(true);
  });

  it('존재하지 않는 좌표로 불러도 안전하다', async () => {
    await seedOneIssue();
    const ghost: TranslationQaAnchor = {
      sceneId: 'nope',
      lineIndex: 9,
      sourceLocale: 'ko',
      targetLocale: 'en',
      source: 'x',
      target: 'y',
    };
    useStore.getState().dismissQaIssue(ghost);
    expect(qa().nope).toBeUndefined();
  });

  it('clearTranslationQa 는 캐시만 비운다', async () => {
    await seedOneIssue();
    expect(allResults()).toHaveLength(1);

    useStore.getState().clearTranslationQa();

    expect(qa()).toEqual({});
    expect(useStore.getState().translationQaProgress).toBeNull();
  });
});

describe('compaction — stale 결과가 세션에 누적되지 않는다', () => {
  it('실행할 때마다 현재 project 기준으로 정리된다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '이유' }])));
    seed([normalLine()], { key: 'test-key' });

    await useStore.getState().reviewTranslationsAll();
    expect(allResults()).toHaveLength(1);

    // 번역을 고치면 기존 결과는 stale — 그 상태로 다시 실행하면 옛 결과가 남지 않는다.
    useStore.getState().setLineTranslation(S1, 0, 'en', 'Glad to meet you.');
    await useStore.getState().reviewTranslationsAll();

    const results = allResults();
    expect(results).toHaveLength(1); // 옛 결과 + 새 결과 2건이 되면 안 된다
    expect(results[0].anchor.target).toBe('Glad to meet you.');
  });

  it('사라진 장면의 결과는 다음 실행에서 정리된다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse([{ i: 0, v: 'review', c: 'meaning', r: '이유' }])));
    useStore.setState({
      project: projectWith(
        [scene({ id: 's1', lines: [normalLine()] }), scene({ id: 's2', lines: [copyLine()] })],
        { translateMode: 'fast' },
      ),
      openaiKey: 'test-key',
    });

    await useStore.getState().reviewTranslationsAll();
    expect(Object.keys(qa()).sort()).toEqual(['s1', 's2']);

    useStore.setState((s) => ({
      project: { ...s.project, scenes: s.project.scenes.filter((sc) => sc.id === 's1') },
    }));
    await useStore.getState().reviewTranslationsAll();

    expect(Object.keys(qa())).toEqual(['s1']);
  });
});
