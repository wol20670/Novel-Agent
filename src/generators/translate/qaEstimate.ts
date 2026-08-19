// 번역 QA 실행 전 비용 추정 — 순수 계산, API 호출 없음(emotion/outfit estimate 와 같은 패턴).
//
// **planner parity 가 이 파일의 존재 이유다**: 대상 수집(collectQaTargets)도, 요청 계획
// (planQaRequests)도 실행과 **같은 함수**를 부른다. 여기서 grouping·chunking 을 다시 계산하면
// 확인창의 "요청 M회"와 실제 호출 수가 조용히 갈라진다.
//
// ⚠️ deterministic copy-through 로 걸린 칸은 aiCells 에서 빠지므로 **비용에서도 빠진다**
//    (그게 "규칙은 API 비용 0"이 말뿐이 아니라는 뜻이다).

import type { Locale, Project } from '../../types';
import { collectQaTargets, planQaRequests, type TranslationQaCache } from './qa';

/** 한국어 기준 대략적인 글자당 토큰 비율(emotion/outfit 견적과 같은 기준). */
const KOREAN_CHARS_PER_TOKEN = 1.3;
/**
 * 요청당 시스템 프롬프트 + JSON 봉투의 토큰 어림값. 실측 시스템 프롬프트 **1,132자**를 기존 outfit
 * 견적과 같은 환산 기준(250토큰 ≈ 2,574자)으로 옮기면 약 110토큰이고, 여기에 `{"items":[…]}` 봉투
 * 몫을 얹어 120 으로 둔다. ⚠️ KOREAN_CHARS_PER_TOKEN 은 한국어 **본문** 전용이라 영문 프롬프트에
 * 갖다 쓰지 않는다(그래서 이 값은 별도 상수다).
 */
const PROMPT_OVERHEAD_TOKENS_PER_REQUEST = 120;
/**
 * 항목 하나의 JSON 키 몫(`"i"·"sourceLocale"·"targetLocale"·"source"·"target"·"speaker"·"narration"`)
 * 어림값 — 본문 글자 수와 달리 ASCII 라 한국어 비율로 나누면 과소 계산된다.
 */
const ITEM_JSON_OVERHEAD_TOKENS = 30;
/**
 * 칸 하나당 응답 토큰 어림값. `{"i":0,"v":"ok"}` 는 10토큰 남짓이고 review 행은 한국어 이유가 붙어
 * 훨씬 길다 — **과소 견적을 피하는 allowance** 일 뿐 응답 행 수의 상한도, API max_tokens 도 아니다
 * (후자는 qa.ts 의 MAX_OUTPUT_TOKENS 가 담당한다).
 */
const OUTPUT_TOKENS_PER_CELL = 40;

/**
 * 모델별 1K 토큰당 USD 단가 — 이 파일 안의 local table(emotion/outfit 과 같은 convention).
 * ⚠️ **모르는 모델을 다른 모델 단가로 폴백하지 않는다.** quality 모드(gpt-4o)의 단가는 이 리포에
 * 존재한 적이 없고, 추측해서 박으면 확인창이 비용을 과소 표시한다 — 그럴 바엔 usd 를 비우고
 * 토큰 수만 보여주는 쪽이 정직하다(호출측이 model 과 함께 안내한다).
 */
const MODEL_PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

export interface QaCostEstimate {
  /** 이번 실행에서 실제 검수하는 칸(유효 캐시 skip 이후) = ruleFlagged + aiCells. */
  cells: number;
  /** deterministic copy-through 로 로컬 처리되는 칸(API 0회). */
  ruleFlagged: number;
  /** 실제로 AI 에 보내는 칸. */
  aiCells: number;
  /** 실제 API 요청 횟수 = planQaRequests 결과 수(정의상 실행과 일치). */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** 이번 run 의 reviewer 모델(확인창 표시용). */
  model: string;
  /** 단가를 아는 모델일 때만 채운다 — 없으면 호출측이 토큰 수만 보여준다. */
  usd?: number;
}

/**
 * 프로젝트 전체의 번역 QA 예상 비용(동기, API 호출 없음).
 * 인자는 실행 액션이 넘길 값 그대로다 — targets 는 translateTargetsOf(project), cache 는 현재 세션
 * QA 결과, model 은 translateModelFor(translateModeOf(project)).
 */
export function estimateQaCost(
  project: Pick<Project, 'scenes' | 'baseLocale'>,
  targets: Locale[],
  cache: TranslationQaCache,
  model: string,
): QaCostEstimate {
  const { cells, ruleResults, aiCells } = collectQaTargets(project, targets, cache, model);
  const plans = planQaRequests(aiCells);

  const base: QaCostEstimate = {
    cells: cells.length,
    ruleFlagged: ruleResults.length,
    aiCells: aiCells.length,
    requests: plans.length,
    inputTokens: 0,
    outputTokens: 0,
    model,
  };
  if (!plans.length) return base;

  // 요청 계획을 그대로 훑는다 — aiCells 를 따로 세면 chunk 경계가 달라졌을 때 조용히 갈라진다.
  let charSum = 0;
  let items = 0;
  for (const plan of plans) {
    for (const a of plan.items) {
      charSum += a.source.length + a.target.length + (a.speaker?.length ?? 0);
      items += 1;
    }
  }

  const inputTokens =
    Math.ceil(charSum / KOREAN_CHARS_PER_TOKEN) +
    plans.length * PROMPT_OVERHEAD_TOKENS_PER_REQUEST +
    items * ITEM_JSON_OVERHEAD_TOKENS;
  const outputTokens = items * OUTPUT_TOKENS_PER_CELL;
  const price = MODEL_PRICE_PER_1K[model];
  const usd = price ? (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output : undefined;

  return { ...base, inputTokens, outputTokens, usd };
}
