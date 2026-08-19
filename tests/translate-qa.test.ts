// post-v1 번역 개선 Phase 3-A — 번역 QA 순수 계약 회귀 가드.
//
// 여기서 고정하는 것은 **대상 판정 · deterministic rule · precedence · 캐시 skip · 요청 계획 ·
// 파서 · 유효성/compaction · 견적 parity** 뿐이다.
// ⚠️ semantic correctness(모델이 실제로 잘 판정하는가)는 테스트하지 않는다 — 응답은 전부 문자열로
//    주입하고 parser/workflow 계약만 검증한다.

import { describe, it, expect } from 'vitest';
import {
  activeQaIssues,
  buildQaRequest,
  collectQaTargets,
  compactQaResults,
  detectCopyThrough,
  isQaResultValid,
  parseQaResponse,
  planQaRequests,
  qaCellKey,
  upsertQaResults,
  type TranslationQaAnchor,
  type TranslationQaCache,
  type TranslationQaResult,
} from '../src/generators/translate/qa';
import { estimateQaCost } from '../src/generators/translate/qaEstimate';
import { summarizeUntranslated } from '../src/generators/translate/collect';
import { translateTargetsOf, type Line, type Locale } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

const MINI = 'gpt-4o-mini';
const QUALITY = 'gpt-4o';

/** 기본 대상 로케일(baseLocale=ko 프로젝트) — 실행 액션이 넘기는 값과 같은 정책. */
const KO_TARGETS = translateTargetsOf({});

function narration(text: string, extra?: Partial<Extract<Line, { kind: 'narration' }>>): Line {
  return { kind: 'narration', text, ...extra };
}

/** anchor 하나를 손으로 만든다(순수 술어 테스트용). */
function anchor(patch: Partial<TranslationQaAnchor> = {}): TranslationQaAnchor {
  return {
    sceneId: 's1',
    lineIndex: 0,
    sourceLocale: 'ko',
    targetLocale: 'en',
    source: '오늘은 정말 즐거웠어.',
    target: 'Today was really fun.',
    speaker: '민주',
    narration: false,
    ...patch,
  };
}

function cached(results: TranslationQaResult[]): TranslationQaCache {
  const out: TranslationQaCache = {};
  for (const r of results) {
    const list = out[r.anchor.sceneId] ?? [];
    list.push(r);
    out[r.anchor.sceneId] = list;
  }
  return out;
}

describe('collectQaTargets — 대상 수집', () => {
  it('비어있지 않은 번역 칸만 대상이고, 빈/공백 칸은 Phase 1(missing) 영역이라 제외한다', () => {
    const p = projectWith([
      scene({
        lines: [
          dialogue('민주', '안녕', { i18n: { en: 'Hi', ja: 'やあ' } }),
          dialogue('민주', '잘 가', { i18n: { en: '', ja: '   ' } }),
          dialogue('민주', '또 봐'), // i18n 자체가 없음
        ],
      }),
    ]);
    const { cells } = collectQaTargets(p, KO_TARGETS, {}, MINI);
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => [c.lineIndex, c.targetLocale])).toEqual([
      [0, 'en'],
      [0, 'ja'],
    ]);
  });

  it('대사·지문만 대상이고 item/cg/bgm 라인은 제외한다', () => {
    const p = projectWith([
      scene({
        lines: [
          dialogue('민주', '안녕', { i18n: { en: 'Hi' } }),
          narration('창밖이 밝았다.', { i18n: { en: 'It was bright outside.' } }),
          { kind: 'item', name: '열쇠' },
          { kind: 'cg', desc: '노을' },
          { kind: 'bgm', name: '테마' },
        ],
      }),
    ]);
    const { cells } = collectQaTargets(p, ['en'], {}, MINI);
    expect(cells).toHaveLength(2);
    expect(cells[0].narration).toBe(false);
    expect(cells[0].speaker).toBe('민주');
    expect(cells[1].narration).toBe(true);
    expect(cells[1].speaker).toBeUndefined();
  });

  it('원문이 비어 있는 줄은 대상이 아니다(번역만 남아 있어도 검수할 원문이 없다)', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', '   ', { i18n: { en: 'Hi' } })] })]);
    expect(collectQaTargets(p, ['en'], {}, MINI).cells).toHaveLength(0);
  });

  it("baseLocale='en' 프로젝트는 sourceLocale='en' 이고 대상은 JA 뿐이다", () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'Hello', { i18n: { ja: 'こんにちは' } })] })], {
      baseLocale: 'en',
    });
    const targets = translateTargetsOf(p);
    expect(targets).toEqual(['ja']);

    const { cells } = collectQaTargets(p, targets, {}, MINI);
    expect(cells).toHaveLength(1);
    expect(cells[0].sourceLocale).toBe('en');
    expect(cells[0].targetLocale).toBe('ja');
    expect(cells[0].source).toBe('Hello');
  });

  it('원문 언어와 같은 로케일이 targets 에 섞여 들어와도 대상으로 잡지 않는다(방어)', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'Hello', { i18n: { en: 'Hello', ja: 'こんにちは' } })] })], {
      baseLocale: 'en',
    });
    const { cells } = collectQaTargets(p, ['en', 'ja'] as Locale[], {}, MINI);
    expect(cells.map((c) => c.targetLocale)).toEqual(['ja']);
  });
});

describe('Phase 분리 — copy-through 는 Phase 1 missing 이 아니다', () => {
  it('EN 칸에 KO 원문이 복사돼 있으면 누락 집계는 0 인데 QA 는 의심 1건을 낸다', () => {
    const p = projectWith([
      scene({ lines: [dialogue('민주', '오늘은 정말 즐거웠어.', { i18n: { en: '오늘은 정말 즐거웠어.', ja: '今日は本当に楽しかった。' } })] }),
    ]);

    // Phase 1 은 "칸이 비었는가"만 본다 — 이 줄은 EN·JA 둘 다 차 있으므로 누락 0.
    expect(summarizeUntranslated(p, KO_TARGETS).lines).toBe(0);

    // Phase 3 은 그걸 language anomaly 로 잡는다(Phase 1 의 결함이 아니라 범위 밖 항목이다).
    const { ruleResults } = collectQaTargets(p, KO_TARGETS, {}, MINI);
    expect(ruleResults).toHaveLength(1);
    expect(ruleResults[0].origin).toBe('rule');
    expect(ruleResults[0].verdict).toBe('review');
    expect(ruleResults[0].category).toBe('language');
    expect(ruleResults[0].anchor.targetLocale).toBe('en');
  });
});

describe('detectCopyThrough — 좁은 deterministic rule', () => {
  it('원문이 그대로 복사된 EN/JA 칸을 잡는다(앞뒤 공백 차이는 무시)', () => {
    expect(detectCopyThrough(anchor({ source: '안녕하세요', target: '안녕하세요' }))).toBe(true);
    expect(detectCopyThrough(anchor({ source: '안녕하세요', target: '  안녕하세요  ' }))).toBe(true);
    expect(detectCopyThrough(anchor({ targetLocale: 'ja', source: '안녕하세요', target: '안녕하세요' }))).toBe(true);
  });

  it('원문에 한글 음절이 없으면 잡지 않는다(정상적으로 동일할 수 있는 줄)', () => {
    expect(detectCopyThrough(anchor({ source: '…', target: '…' }))).toBe(false);
    expect(detectCopyThrough(anchor({ source: 'OK', target: 'OK' }))).toBe(false);
    expect(detectCopyThrough(anchor({ source: '!?', target: '!?' }))).toBe(false);
  });

  it('문장부호만 다르면 잡지 않는다 — 판정은 exact 다(sameLooseText 를 쓰지 않는다)', () => {
    expect(detectCopyThrough(anchor({ source: '안녕하세요.', target: '안녕하세요' }))).toBe(false);
    expect(detectCopyThrough(anchor({ source: '안녕 하세요', target: '안녕하세요' }))).toBe(false);
  });

  it("sourceLocale 이 'ko' 가 아니면 잡지 않는다(한글 검사에 암묵 의존하지 않는다)", () => {
    expect(detectCopyThrough(anchor({ sourceLocale: 'en', source: '안녕하세요', target: '안녕하세요' }))).toBe(false);
  });

  it('known FP — 고유명사만으로 된 줄도 rule 조건상 hit 이다(오류 판정이 아니라 의심 번역)', () => {
    // ⚠️ 이 케이스가 "잘못된 번역"이라고 주장하는 테스트가 아니다. rule 의 정의된 동작을 고정할 뿐이며,
    //    사용자는 Phase 3-C 의 "문제 없음" 으로 종료한다.
    expect(detectCopyThrough(anchor({ source: '김민주', target: '김민주' }))).toBe(true);
  });

  it('정상 번역 fixture 에서는 하나도 걸리지 않는다(의역·짧은 대답·서식 문자 포함)', () => {
    const normals: TranslationQaAnchor[] = [
      anchor({ source: '오늘은 정말 즐거웠어.', target: 'Today was really fun.' }),
      anchor({ source: '응.', target: 'Yeah.' }),
      anchor({ source: '그래.', target: 'Yeah.' }), // 다른 원문 → 같은 번역(정상)
      anchor({ source: '할인 20% [특가] {오늘만}', target: '20% off [Deal] {today only}' }),
      anchor({ targetLocale: 'ja', source: '고마워', target: 'ありがとう' }),
    ];
    expect(normals.filter(detectCopyThrough)).toHaveLength(0);
  });
});

describe('precedence — rule hit 은 AI 대상에서 빠진다', () => {
  it('copy-through 칸은 ruleResults 에만 있고 aiCells 에는 없다', () => {
    const p = projectWith([
      scene({
        lines: [
          dialogue('민주', '안녕하세요', { i18n: { en: '안녕하세요' } }), // rule hit
          dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } }), // AI 대상
        ],
      }),
    ]);
    const { cells, ruleResults, aiCells } = collectQaTargets(p, ['en'], {}, MINI);

    expect(cells).toHaveLength(2);
    expect(ruleResults.map((r) => r.anchor.lineIndex)).toEqual([0]);
    expect(aiCells.map((a) => a.lineIndex)).toEqual([1]);
    expect(cells.length).toBe(ruleResults.length + aiCells.length);
  });
});

describe('증분 캐시 skip — model-aware', () => {
  const project = () =>
    projectWith([scene({ lines: [dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } })] })]);

  const aiResult = (model: string): TranslationQaResult => ({
    anchor: anchor({ source: '반가워', target: 'Nice to meet you.' }),
    verdict: 'ok',
    origin: 'ai',
    model,
  });

  it('같은 모델의 AI 결과가 있으면 건너뛴다', () => {
    const { cells } = collectQaTargets(project(), ['en'], cached([aiResult(MINI)]), MINI);
    expect(cells).toHaveLength(0);
  });

  it('모델이 바뀌면 AI 캐시를 재사용하지 않고 다시 대상으로 잡는다', () => {
    const { aiCells } = collectQaTargets(project(), ['en'], cached([aiResult(MINI)]), QUALITY);
    expect(aiCells).toHaveLength(1);
  });

  it('rule·manual 결과는 모델이 바뀌어도 유지된다(무료 판정과 사람의 판단)', () => {
    const base = anchor({ source: '반가워', target: 'Nice to meet you.' });
    const ruleCache = cached([{ anchor: base, verdict: 'review', origin: 'rule', category: 'language' }]);
    const manualCache = cached([{ anchor: base, verdict: 'ok', origin: 'manual' }]);

    expect(collectQaTargets(project(), ['en'], ruleCache, QUALITY).cells).toHaveLength(0);
    expect(collectQaTargets(project(), ['en'], manualCache, QUALITY).cells).toHaveLength(0);
  });

  it('번역이 수정되면 anchor 가 어긋나 캐시를 쓰지 않는다(같은 모델이어도)', () => {
    const stale: TranslationQaResult = {
      anchor: anchor({ source: '반가워', target: '옛 번역' }),
      verdict: 'ok',
      origin: 'ai',
      model: MINI,
    };
    expect(collectQaTargets(project(), ['en'], cached([stale]), MINI).cells).toHaveLength(1);
  });
});

describe('planQaRequests — 요청 계획', () => {
  it('장면·대상 로케일별로 나누고 항목 순서를 보존한다', () => {
    const cells = [
      anchor({ sceneId: 's1', lineIndex: 0, targetLocale: 'en' }),
      anchor({ sceneId: 's1', lineIndex: 0, targetLocale: 'ja' }),
      anchor({ sceneId: 's1', lineIndex: 1, targetLocale: 'en' }),
      anchor({ sceneId: 's2', lineIndex: 0, targetLocale: 'en' }),
    ];
    const plans = planQaRequests(cells);
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => [p.sceneId, p.targetLocale])).toEqual([
      ['s1', 'en'],
      ['s1', 'ja'],
      ['s2', 'en'],
    ]);
    expect(plans[0].items.map((i) => i.lineIndex)).toEqual([0, 1]);
  });

  it('줄 수 상한(chunkItems)에서 같은 그룹을 쪼갠다', () => {
    const cells = Array.from({ length: 41 }, (_, i) => anchor({ lineIndex: i }));
    const plans = planQaRequests(cells);
    expect(plans.map((p) => p.items.length)).toEqual([40, 1]);
  });

  it('빈 입력은 요청 0개', () => {
    expect(planQaRequests([])).toEqual([]);
  });
});

describe('buildQaRequest — 요청 페이로드', () => {
  it('항목은 요청-local i 와 지정된 필드만 담고 주변 줄 문맥은 싣지 않는다', () => {
    const plan = planQaRequests([
      anchor({ lineIndex: 7, source: '반가워', target: 'Nice to meet you.', speaker: '민주' }),
      anchor({ lineIndex: 9, source: '창밖이 밝았다.', target: 'It was bright outside.', speaker: undefined, narration: true }),
    ])[0];
    const { system, user } = buildQaRequest(plan);
    const parsed = JSON.parse(user) as { items: Record<string, unknown>[] };

    expect(Object.keys(parsed)).toEqual(['items']);
    // i 는 배열 위치(줄 인덱스 7·9 가 아니다)
    expect(parsed.items.map((it) => it.i)).toEqual([0, 1]);
    expect(parsed.items[0]).toEqual({
      i: 0,
      sourceLocale: 'ko',
      targetLocale: 'en',
      source: '반가워',
      target: 'Nice to meet you.',
      speaker: '민주',
    });
    expect(parsed.items[1]).toEqual({
      i: 1,
      sourceLocale: 'ko',
      targetLocale: 'en',
      source: '창밖이 밝았다.',
      target: 'It was bright outside.',
      narration: true,
    });
    expect(system).toContain('Korean');
    expect(system).toContain('English');
    // 대체 번역 금지가 프롬프트 계약이다.
    expect(system).toContain('Never propose or output a replacement');
  });
});

describe('parseQaResponse — 응답 파싱 경계', () => {
  const items = [anchor({ lineIndex: 0 }), anchor({ lineIndex: 1 }), anchor({ lineIndex: 2 })];

  it('ok / review 를 읽고 review 에만 category·reason 을 붙인다', () => {
    const raw = JSON.stringify({
      results: [
        { i: 0, v: 'ok' },
        { i: 1, v: 'review', c: 'meaning', r: '원문은 긍정, 번역은 부정.' },
      ],
    });
    expect(parseQaResponse(raw, items)).toEqual({
      0: { verdict: 'ok' },
      1: { verdict: 'review', category: 'meaning', reason: '원문은 긍정, 번역은 부정.' },
    });
  });

  it('ok 에는 모델이 category·reason 을 붙여 보내도 담지 않는다', () => {
    const raw = JSON.stringify({ results: [{ i: 0, v: 'ok', c: 'meaning', r: '괜찮음' }] });
    expect(parseQaResponse(raw, items)[0]).toEqual({ verdict: 'ok' });
  });

  it('코드펜스와 잡텍스트를 걷어낸다', () => {
    const raw = '```json\n{"results":[{"i":0,"v":"ok"}]}\n```';
    expect(parseQaResponse(raw, items)).toEqual({ 0: { verdict: 'ok' } });
  });

  it('요청하지 않은 인덱스(유령 응답)는 버린다', () => {
    const raw = JSON.stringify({ results: [{ i: 9, v: 'review', c: 'meaning' }, { i: 0, v: 'ok' }] });
    expect(parseQaResponse(raw, items)).toEqual({ 0: { verdict: 'ok' } });
  });

  it('중복 i 는 last wins 가 아니라 그 항목만 unreviewed 로 버린다(review 신호를 조용히 지우지 않는다)', () => {
    const raw = JSON.stringify({
      results: [
        { i: 1, v: 'review', c: 'meaning', r: '의미 반전' },
        { i: 1, v: 'ok' },
        { i: 0, v: 'ok' },
      ],
    });
    const out = parseQaResponse(raw, items);
    expect(out[1]).toBeUndefined();
    expect(out[0]).toEqual({ verdict: 'ok' }); // 정상 행은 살린다
  });

  it('3회 이상 중복도 계속 제외된다', () => {
    const raw = JSON.stringify({
      results: [{ i: 2, v: 'ok' }, { i: 2, v: 'review' }, { i: 2, v: 'ok' }],
    });
    expect(parseQaResponse(raw, items)[2]).toBeUndefined();
  });

  it('v 가 없거나 모르는 값이면 ok 로 넘겨짚지 않고 unreviewed 로 둔다', () => {
    const raw = JSON.stringify({
      results: [{ i: 0 }, { i: 1, v: 'maybe' }, { i: 2, v: 'REVIEW' }],
    });
    const out = parseQaResponse(raw, items);
    expect(out[0]).toBeUndefined();
    expect(out[1]).toBeUndefined();
    expect(out[2]).toEqual({ verdict: 'review', category: undefined, reason: undefined }); // 대소문자는 정규화
  });

  it('모르는 category 는 판정을 살리고 category 만 비운다', () => {
    const raw = JSON.stringify({ results: [{ i: 0, v: 'review', c: 'nitpick', r: '이유' }] });
    expect(parseQaResponse(raw, items)[0]).toEqual({ verdict: 'review', category: undefined, reason: '이유' });
  });

  it('문자열 i 도 숫자로 받아들이고, 숫자가 아니면 버린다', () => {
    const raw = JSON.stringify({ results: [{ i: '1', v: 'ok' }, { i: 'x', v: 'ok' }] });
    expect(parseQaResponse(raw, items)).toEqual({ 1: { verdict: 'ok' } });
  });

  it('JSON 객체가 없거나 깨졌으면 예외를 던진다(호출측이 요청 단위로 스킵)', () => {
    expect(() => parseQaResponse('no json here', items)).toThrow();
    expect(() => parseQaResponse('{ broken', items)).toThrow();
    expect(() => parseQaResponse('{"results": [oops]}', items)).toThrow();
  });

  it('results 가 배열이 아니면 빈 결과(예외 아님)', () => {
    expect(parseQaResponse(JSON.stringify({ results: 'nope' }), items)).toEqual({});
  });
});

describe('isQaResultValid — exact 유효성', () => {
  const sc = scene({
    lines: [dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } })],
  });
  const good = anchor({ source: '반가워', target: 'Nice to meet you.' });

  it('원문·번역·화자·kind 가 그대로면 유효하다', () => {
    expect(isQaResultValid(good, sc, 'ko')).toBe(true);
  });

  it('원문이 바뀌면 무효 — 문장부호만 바뀐 경우도 포함(Phase 2 의 loose 동치를 쓰지 않는다)', () => {
    const edited = scene({ lines: [dialogue('민주', '반가워!', { i18n: { en: 'Nice to meet you.' } })] });
    expect(isQaResultValid(good, edited, 'ko')).toBe(false);
  });

  it('검수했던 번역이 바뀌면 무효(옛 판단을 새 번역에 붙이지 않는다)', () => {
    const edited = scene({ lines: [dialogue('민주', '반가워', { i18n: { en: 'Glad to meet you.' } })] });
    expect(isQaResultValid(good, edited, 'ko')).toBe(false);
  });

  it('화자·kind 가 바뀌면 무효', () => {
    const speakerChanged = scene({ lines: [dialogue('서연', '반가워', { i18n: { en: 'Nice to meet you.' } })] });
    const kindChanged = scene({ lines: [narration('반가워', { i18n: { en: 'Nice to meet you.' } })] });
    expect(isQaResultValid(good, speakerChanged, 'ko')).toBe(false);
    expect(isQaResultValid(good, kindChanged, 'ko')).toBe(false);
  });

  it('장면·줄이 사라졌거나 원문 언어가 바뀌면 무효', () => {
    expect(isQaResultValid(good, undefined, 'ko')).toBe(false);
    expect(isQaResultValid(anchor({ lineIndex: 5 }), sc, 'ko')).toBe(false);
    expect(isQaResultValid(good, sc, 'en')).toBe(false);
  });

  it('줄이 앞에 삽입돼 인덱스가 밀리면 무효다(엉뚱한 줄에 붙지 않는다)', () => {
    const shifted = scene({
      lines: [
        dialogue('서연', '먼저 한마디', { i18n: { en: 'A word first.' } }),
        dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } }),
      ],
    });
    expect(isQaResultValid(good, shifted, 'ko')).toBe(false);
  });
});

describe('activeQaIssues — 화면 표시 판정(단일 소스)', () => {
  const sc = scene({ id: 's1', lines: [dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } })] });
  const at = anchor({ sceneId: 's1', source: '반가워', target: 'Nice to meet you.' });
  const review: TranslationQaResult = { anchor: at, verdict: 'review', origin: 'ai', category: 'meaning', model: MINI };

  it('유효한 review 만 표시 대상이다', () => {
    expect(activeQaIssues([review], sc, 'ko')).toEqual([review]);
  });

  it("ok 는 표시하지 않는다 — AI 든 사람의 '문제 없음'이든", () => {
    expect(activeQaIssues([{ ...review, verdict: 'ok' }], sc, 'ko')).toHaveLength(0);
    expect(activeQaIssues([{ anchor: at, verdict: 'ok', origin: 'manual' }], sc, 'ko')).toHaveLength(0);
  });

  it('번역을 고치면 별도 무효화 없이 경고가 사라진다(render-time anchor 검사)', () => {
    const edited = scene({ id: 's1', lines: [dialogue('민주', '반가워', { i18n: { en: 'Glad to meet you.' } })] });
    expect(activeQaIssues([review], edited, 'ko')).toHaveLength(0);
  });

  it('장면·결과가 없으면 빈 배열', () => {
    expect(activeQaIssues(undefined, sc, 'ko')).toHaveLength(0);
    expect(activeQaIssues([review], undefined, 'ko')).toHaveLength(0);
  });
});

describe('compactQaResults / upsertQaResults — 세션 캐시 수명', () => {
  const p = projectWith([
    scene({ id: 's1', lines: [dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.' } })] }),
  ]);
  const valid: TranslationQaResult = {
    anchor: anchor({ sceneId: 's1', source: '반가워', target: 'Nice to meet you.' }),
    verdict: 'ok',
    origin: 'ai',
    model: MINI,
  };
  const stale: TranslationQaResult = {
    anchor: anchor({ sceneId: 's1', lineIndex: 3, source: '없어진 줄', target: 'gone' }),
    verdict: 'review',
    origin: 'ai',
    model: MINI,
  };
  const goneScene: TranslationQaResult = {
    anchor: anchor({ sceneId: 's9', source: '삭제된 장면', target: 'deleted' }),
    verdict: 'review',
    origin: 'rule',
  };

  it('유효한 결과만 남기고 통째로 빈 장면 키는 지운다', () => {
    const out = compactQaResults(cached([valid, stale, goneScene]), p);
    expect(Object.keys(out)).toEqual(['s1']);
    expect(out.s1).toHaveLength(1);
    expect(out.s1[0]).toBe(valid);
  });

  it('반복 실행해도 결과가 누적되지 않는다(칸 identity 로 upsert)', () => {
    const first = upsertQaResults({}, [valid]);
    const second = upsertQaResults(first, [{ ...valid, verdict: 'review', origin: 'ai', category: 'meaning' }]);
    expect(second.s1).toHaveLength(1);
    expect(second.s1[0].verdict).toBe('review');
    // 입력 캐시는 그대로(순수)
    expect(first.s1[0].verdict).toBe('ok');
  });

  it('다른 칸은 나란히 쌓인다', () => {
    const other: TranslationQaResult = {
      anchor: anchor({ sceneId: 's1', targetLocale: 'ja', target: 'はじめまして' }),
      verdict: 'ok',
      origin: 'ai',
      model: MINI,
    };
    const out = upsertQaResults(upsertQaResults({}, [valid]), [other]);
    expect(out.s1).toHaveLength(2);
    expect(new Set(out.s1.map((r) => qaCellKey(r.anchor))).size).toBe(2);
  });
});

describe('estimateQaCost — 실행 planner 와 parity', () => {
  const bigProject = () =>
    projectWith([
      scene({
        id: 's1',
        lines: [
          dialogue('민주', '안녕하세요', { i18n: { en: '안녕하세요', ja: 'こんにちは' } }), // EN 은 rule hit
          dialogue('민주', '반가워', { i18n: { en: 'Nice to meet you.', ja: 'はじめまして' } }),
          narration('창밖이 밝았다.', { i18n: { en: 'It was bright outside.', ja: '外は明るかった。' } }),
        ],
      }),
      scene({
        id: 's2',
        lines: [dialogue('서연', '또 만나', { i18n: { en: 'See you again.', ja: 'またね' } })],
      }),
    ]);

  it('requests 는 planQaRequests 결과 수와 정확히 일치한다(견적이 따로 grouping 하지 않는다)', () => {
    const p = bigProject();
    const { aiCells } = collectQaTargets(p, KO_TARGETS, {}, MINI);
    const est = estimateQaCost(p, KO_TARGETS, {}, MINI);
    expect(est.requests).toBe(planQaRequests(aiCells).length);
    expect(est.aiCells).toBe(aiCells.length);
  });

  it('rule 로 걸린 칸은 AI 대상·비용에서 빠진다', () => {
    const est = estimateQaCost(bigProject(), KO_TARGETS, {}, MINI);
    expect(est.ruleFlagged).toBe(1);
    expect(est.cells).toBe(est.ruleFlagged + est.aiCells);
    expect(est.aiCells).toBe(7); // 전체 8칸 − rule 1칸
  });

  it('단가를 아는 모델이면 usd 를 채우고, 모르는 모델이면 비워 둔다(다른 모델 단가로 폴백 금지)', () => {
    const mini = estimateQaCost(bigProject(), KO_TARGETS, {}, MINI);
    const quality = estimateQaCost(bigProject(), KO_TARGETS, {}, QUALITY);

    expect(mini.model).toBe(MINI);
    expect(mini.usd).toBeGreaterThan(0);
    expect(quality.model).toBe(QUALITY);
    expect(quality.usd).toBeUndefined();
    // 토큰 수는 모델과 무관하게 같아야 한다(모델 차이는 단가에만 반영된다).
    expect(quality.inputTokens).toBe(mini.inputTokens);
    expect(quality.outputTokens).toBe(mini.outputTokens);
  });

  it('대상이 없으면 요청·토큰 0 이다', () => {
    const est = estimateQaCost(projectWith([]), KO_TARGETS, {}, MINI);
    expect(est).toMatchObject({ cells: 0, ruleFlagged: 0, aiCells: 0, requests: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('캐시로 건너뛴 칸은 견적에서도 빠진다', () => {
    const p = bigProject();
    const { aiCells } = collectQaTargets(p, KO_TARGETS, {}, MINI);
    const cache = cached(aiCells.map((a) => ({ anchor: a, verdict: 'ok' as const, origin: 'ai' as const, model: MINI })));
    const est = estimateQaCost(p, KO_TARGETS, cache, MINI);
    expect(est.aiCells).toBe(0);
    expect(est.requests).toBe(0);
    expect(est.cells).toBe(1); // rule 칸은 캐시에 없으므로 남는다
  });
});
