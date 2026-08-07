import { describe, it, expect } from 'vitest';
import { estimateEmotionCost } from '../src/generators/emotion/estimate';
import type { Character } from '../src/types';
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
