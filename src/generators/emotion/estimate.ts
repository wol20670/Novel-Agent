// AI 표정 배정 실행 전 비용 추정 — 순수 계산, API 호출 없음(voice/estimate.ts 와 같은 패턴).
// 실제 파이프라인이 쓰는 것과 똑같은 대상 집합(collectEmotionTargets)·요청 계획(planEmotionChunks)을
// 그대로 재사용해 "정확히 몇 번 호출되는지 / 무엇이 실려 나가는지"를 어림한다 — 별도 근사식을 쓰면
// 실행 시점에 실제 요청 수·페이로드가 달라져 견적이 거짓말을 하게 된다. 토큰 수 자체는 실제 tokenizer 없이는 정확히 알 수
// 없어(BYO 키라 tiktoken 번들은 부담) 한국어 ~1.3자/토큰 어림값을 쓴다 — 견적일 뿐, 과금은
// OpenAI 대시보드가 정본이다.

import type { Project } from '../../types';
import { collectEmotionTargets, planEmotionChunks } from './aiSelect';

/** 한국어 기준 대략적인 글자당 토큰 비율(OpenAI 토크나이저 실측 경향치). */
const KOREAN_CHARS_PER_TOKEN = 1.3;
/** 응답 한 항목({"i":0,"expr":"..."})의 토큰 어림값. */
const OUTPUT_TOKENS_PER_LINE = 12;
/** 청크당 시스템 프롬프트 + 시놉시스 + 후보 목록의 토큰 어림값(문맥은 아래에서 글자 수로 직접 센다). */
const PROMPT_OVERHEAD_TOKENS_PER_REQUEST = 250;

/** 모델별 1K 토큰당 USD 단가 — 가격이 바뀌면 이 표만 고친다(다른 곳에 하드코딩 금지). */
const MODEL_PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};
const DEFAULT_MODEL = 'gpt-4o-mini';

export interface EmotionCostEstimate {
  /** AI 배정 대상 대사 줄 수(이미 emotion/emotionAuto 가 있는 줄, 스프라이트 없는 화자는 제외됨). */
  targetLines: number;
  /** 예상 API 요청 횟수(장면별 planEmotionChunks 계획 수 합 = 실행이 보내는 요청 수). */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

/** targetLines=0(대상 없음)일 때의 영값 견적. */
const EMPTY_ESTIMATE: EmotionCostEstimate = { targetLines: 0, requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 };

/**
 * 프로젝트 전체의 AI 표정 배정 예상 비용을 계산한다(동기, API 호출 없음). store.ts 의 배치 액션이
 * 실행 전 확인창(window.confirm)에 이 값을 보여준다.
 */
export function estimateEmotionCost(project: Project, model: string = DEFAULT_MODEL): EmotionCostEstimate {
  const batches = collectEmotionTargets(project);
  if (!batches.length) return EMPTY_ESTIMATE;

  let targetLines = 0;
  let requests = 0;
  let charSum = 0;
  for (const batch of batches) {
    targetLines += batch.items.length;
    // 실행이 실제로 보내는 계획(청크 경계 + 요청별 읽기 전용 문맥)을 그대로 재사용한다 — 문맥 window 를
    // 여기서 다시 계산하면 견적과 실행이 조용히 갈라진다. 문맥은 요청마다 재전송되므로 그 몫이 요청 수만큼
    // 중복 계산되는 게 맞다(청크 경계를 넘는 줄은 다음 요청에 다시 실린다).
    for (const plan of planEmotionChunks(batch)) {
      requests += 1;
      charSum += plan.items.reduce((sum, it) => sum + it.text.length, 0);
      charSum += plan.context.reduce((sum, l) => sum + l.text.length, 0);
    }
  }

  const inputTokens = Math.ceil(charSum / KOREAN_CHARS_PER_TOKEN) + requests * PROMPT_OVERHEAD_TOKENS_PER_REQUEST;
  const outputTokens = targetLines * OUTPUT_TOKENS_PER_LINE;
  const price = MODEL_PRICE_PER_1K[model] ?? MODEL_PRICE_PER_1K[DEFAULT_MODEL];
  const usd = (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;

  return { targetLines, requests, inputTokens, outputTokens, usd };
}
