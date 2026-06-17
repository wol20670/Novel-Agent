// 표정 결정 오케스트레이터 — "어댑터" 패턴(이미지/테마와 동일 철학).
//   - 오프라인(키 없음): inferEmotion 휴리스틱으로 결정 (지금 기본 동작).
//   - 온라인(키 있음, 추후): LLM 분류기로 더 정확히 — 같은 출력 타입이라 호출부 불변.
//
// 표정 "선택"은 여기서, 표정 "그림"(일관성 있는 스프라이트)은 이미지 어댑터에서 만든다.
// 이미지 API 연동 시: expressionPlan(generate.ts)이 알려주는 (캐릭터×표정) 목록을
// 기준 이미지(seed)에서 표정만 바꿔 생성하면, 대사에 따라 자동 전환 + 일관성이 완성된다.

import type { Expression, Line } from '../../types';
import { inferEmotion, type EmotionContext } from './infer';

export { inferEmotion } from './infer';
export type { EmotionContext } from './infer';

export interface ClassifyOptions {
  apiKey?: string;
  model?: string;
}

/**
 * 한 장면의 대사들에 표정을 부여한다(검수용 자동 태깅에 사용 예정).
 * 명시 태그(`(표정)`)가 있으면 그대로 두고, 없는 줄만 추론한다.
 *
 * 현재는 오프라인 휴리스틱. apiKey 가 주어지면 추후 LLM 분류로 교체(현재는 폴백).
 */
export async function classifyEmotions(
  lines: Line[],
  ctx: EmotionContext,
  opts: ClassifyOptions = {},
): Promise<Expression[]> {
  // TODO(API): opts.apiKey 가 있으면 LLM 으로 lines 전체를 한 번에 분류.
  //   실패 시 아래 휴리스틱으로 폴백(오프라인 우선 원칙).
  void opts;
  return lines.map((l) =>
    l.kind === 'dialogue' ? (l.emotion as Expression | undefined) ?? inferEmotion(l.text, ctx) : '기본',
  );
}
