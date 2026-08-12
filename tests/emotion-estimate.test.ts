import { describe, it, expect } from 'vitest';
import { estimateEmotionCost } from '../src/generators/emotion/estimate';
import { collectEmotionTargets, planEmotionChunks } from '../src/generators/emotion/aiSelect';
import type { Character, Line } from '../src/types';
import { scene, projectWith, dialogue } from './fixtures';

function char(name: string, patch: Partial<Character> = {}): Character {
  return { name, color: '#ffffff', expressions: {}, ...patch };
}

describe('estimateEmotionCost: 순수 계산(실제 파이프라인의 collectEmotionTargets·chunkItems 를 그대로 재사용)', () => {
  it('대상이 없으면 전부 0인 영값 견적을 돌려준다(API 호출 없이 즉시)', () => {
    const p = projectWith([scene({ lines: [] })]);
    expect(estimateEmotionCost(p)).toEqual({ targetLines: 0, requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  });

  it('줄 수·청크 수·토큰·USD 를 정확한 공식으로 계산한다(회귀 스냅샷)', () => {
    const sc = scene({
      lines: [dialogue('민주', '가나다'), dialogue('민주', '라마바사'), dialogue('민주', '아')], // 3+4+1=8자
    });
    const p = projectWith([sc], { characters: [char('민주', { expressions: { 기본: 'a1', 기쁨: 'a2' } })] });

    const result = estimateEmotionCost(p);

    expect(result.targetLines).toBe(3);
    expect(result.requests).toBe(1); // 3줄·8자는 청크 상한(40줄/4000자) 안 → 청크 1개
    // estimate.ts 상단 상수와 동일 기준: KOREAN_CHARS_PER_TOKEN=1.3, PROMPT_OVERHEAD=250/청크,
    // OUTPUT_TOKENS_PER_LINE=12, 가격표(gpt-4o-mini)=input 0.00015/1K · output 0.0006/1K.
    expect(result.inputTokens).toBe(Math.ceil(8 / 1.3) + 250);
    expect(result.outputTokens).toBe(36);
    const expectedUsd = (result.inputTokens / 1000) * 0.00015 + (36 / 1000) * 0.0006;
    expect(result.usd).toBeCloseTo(expectedUsd, 10);
  });

  it('한 장면 안에서도 40줄을 넘으면 청크가 나뉜다(요청 수 = 청크 수, 청크당 오버헤드가 그만큼 더해짐)', () => {
    const lines = Array.from({ length: 45 }, (_, i) => dialogue('민주', `대사${i}`));
    const sc = scene({ lines });
    const p = projectWith([sc], { characters: [char('민주', { expressions: { 기본: 'a1', 기쁨: 'a2' } })] });

    const result = estimateEmotionCost(p);
    expect(result.targetLines).toBe(45);
    expect(result.requests).toBe(2); // 40 + 5(chunkItems 와 동일한 40줄 상한)
  });

  it('이미 emotion/emotionAuto 가 있는 줄은 견적 대상에서 빠진다(collectEmotionTargets 와 동일 규칙)', () => {
    const sc = scene({
      lines: [dialogue('민주', '이미 있음', { emotion: '기쁨' }), dialogue('민주', '아직 없음')],
    });
    const p = projectWith([sc], { characters: [char('민주', { expressions: { 기본: 'a1', 기쁨: 'a2' } })] });
    expect(estimateEmotionCost(p).targetLines).toBe(1);
  });

  it('스프라이트가 없는 캐릭터의 대사는 견적 대상에서 빠진다(AI 가 고를 후보가 없음)', () => {
    const sc = scene({ lines: [dialogue('민주', '표정 후보 없음')] });
    const p = projectWith([sc], { characters: [char('민주', { expressions: {} })] });
    expect(estimateEmotionCost(p).targetLines).toBe(0);
  });
});

/** F2/F3 — 요청에 실려 나가는 읽기 전용 문맥도 입력 토큰이다. 견적과 실행이 같은 계획을 봐야 한다. */
describe('estimateEmotionCost(F2/F3): 문맥 증가분을 실행과 같은 계획으로 센다', () => {
  const heroine = char('민주', { expressions: { 기본: 'a1', 기쁨: 'a2' } });
  const narrator = char('주인공', { isProtagonist: true });

  it('주인공·지문이 끼면 target 수는 그대로인데 입력 토큰만 그만큼 늘어난다', () => {
    const target = dialogue('민주', '가나다라마'); // 5자
    const bare = projectWith([scene({ lines: [target] })], { characters: [heroine, narrator] });
    const withContext = projectWith(
      [
        scene({
          lines: [
            dialogue('주인공', '주인공대사'), // 5자 — 문맥
            { kind: 'narration', text: '지문지문지문' }, // 6자 — 문맥
            target,
          ],
        }),
      ],
      { characters: [heroine, narrator] },
    );

    const a = estimateEmotionCost(bare);
    const b = estimateEmotionCost(withContext);

    expect(b.targetLines).toBe(a.targetLines); // 배정 대상은 그대로
    expect(b.requests).toBe(a.requests); // 요청 수도 그대로
    expect(b.outputTokens).toBe(a.outputTokens); // 응답 크기도 그대로
    // 입력만 문맥 11자만큼 늘어난다(estimate.ts 의 1.3자/토큰 어림값).
    expect(b.inputTokens).toBe(Math.ceil((5 + 11) / 1.3) + 250);
    expect(b.inputTokens).toBeGreaterThan(a.inputTokens);
    expect(b.usd).toBeGreaterThan(a.usd);
  });

  it('요청 수와 문맥 글자 수가 실행 계획(planEmotionChunks)과 정확히 일치한다', () => {
    const lines: Line[] = [];
    for (let n = 0; n < 45; n += 1) {
      if (n % 10 === 9) lines.push({ kind: 'narration', text: `지문${n}` });
      lines.push(dialogue('민주', `대사${n}`));
    }
    const p = projectWith([scene({ lines })], { characters: [heroine, narrator] });

    const plans = collectEmotionTargets(p).flatMap((b) => planEmotionChunks(b));
    const est = estimateEmotionCost(p);

    expect(est.requests).toBe(plans.length);
    expect(est.targetLines).toBe(plans.reduce((s, pl) => s + pl.items.length, 0));
    // 문맥은 요청마다 재전송되므로 그 몫이 요청 수만큼 중복 계산되는 게 실제 과금과 맞다.
    const chars = plans.reduce(
      (s, pl) =>
        s +
        pl.items.reduce((t, it) => t + it.text.length, 0) +
        pl.context.reduce((t, c) => t + c.text.length, 0),
      0,
    );
    expect(est.inputTokens).toBe(Math.ceil(chars / 1.3) + plans.length * 250);
    expect(plans.some((pl) => pl.context.length > 0)).toBe(true); // 실제로 문맥이 실렸다
  });
});
