// AI 의상 전환 추천 실행 전 비용 추정 — 순수 계산, API 호출 없음(emotion/estimate.ts 와 같은 패턴).
// 실행과 **똑같은 planner**(collectOutfitTargets → planOutfitWindows)를 재사용해 요청 수가 어긋날 수
// 없게 한다. 토큰 수는 실제 tokenizer 없이 한국어 ~1.3자/토큰 어림값을 쓴다(BYO 키라 tiktoken 번들은
// 부담) — 견적일 뿐, 과금은 OpenAI 대시보드가 정본이다.

import type { Project } from '../../types';
import { buildSynopsis } from '../theme';
import { collectOutfitTargets, planOutfitWindows } from './aiSelect';

/** 한국어 기준 대략적인 글자당 토큰 비율(표정 견적과 동일 기준). */
const KOREAN_CHARS_PER_TOKEN = 1.3;
/**
 * 요청당 응답 토큰 어림값. 의상은 **sparse** 라 "줄당"이 아니라 "요청당 상한 근사"가 맞는 단위다
 * (대부분의 요청은 변경 0~2건이고, 많아야 몇 건이다).
 * ⚠️ 이건 **비용 근사 allowance 일 뿐이다** — 응답 `changes` 개수의 hard cap 이 아니고(그런 제한을
 * 계약에 넣으면 sparse detector 의 recall 을 인위적으로 자른다), API `max_tokens` 도 아니다
 * (aiSelect.ts 의 MAX_OUTPUT_TOKENS=2048 이 그 역할 — 이 값을 거기에 쓰면 응답이 잘린다).
 * Phase 13 에서 320 → 400: 행마다 `"kind":"..."` 가 붙고(기존 allowance 폭 기준 +60 남짓),
 * `changes[]` 가 semantic candidate envelope 이 되면서 행 수 자체도 늘 수 있다. **envelope 이 실제로
 * 행을 얼마나 늘리는지는 Phase 13 PRIMARY 가 재는 값**이라 여기서는 과소 견적만 피하는 여유로 둔다.
 */
const OUTPUT_TOKENS_PER_REQUEST = 400;
/**
 * 요청당 시스템 프롬프트 + 고정 구조의 토큰 어림값(본문 글자 수는 아래에서 직접 센다).
 * Phase 13 에서 250 → 340: 시스템 프롬프트가 semantic candidate + `kind` 계약을 담으며 실측
 * **2,574자 → 3,466자**(항상 실리는 BASE 만 1,278 → 2,119)로 커졌다. 원래 250 이 어떤 비율에서
 * 나왔는지는 문서화돼 있지 않으므로 **새 환산식을 도입하지 않고** 같은 비율을 유지한 채 실측 증가분만
 * 반영한다(250 × 3466/2574 ≈ 337 → 340). ⚠️ `KOREAN_CHARS_PER_TOKEN` 은 한국어 **본문** 전용이라
 * 영문 프롬프트에 갖다 쓰지 말 것.
 */
const PROMPT_OVERHEAD_TOKENS_PER_REQUEST = 340;

/** 모델별 1K 토큰당 USD 단가 — emotion/estimate.ts 와 같은 값을 여기 따로 둔다(그 파일은 무수정). */
const MODEL_PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};
const DEFAULT_MODEL = 'gpt-4o-mini';

export interface OutfitCostEstimate {
  /** 스캔 대상(writable) 줄 수 — 이 줄들에서만 전환을 찾는다. */
  scanLines: number;
  /** 예상 API 요청 횟수 = 실행이 보내는 요청 수(같은 planner 라 정의상 일치한다). */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

const EMPTY_ESTIMATE: OutfitCostEstimate = {
  scanLines: 0,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  usd: 0,
};

/**
 * 프로젝트 전체의 의상 추천 예상 비용(동기, API 호출 없음). 배치 액션이 실행 전 확인창에 보여준다.
 * 추가 의상을 쓰는 캐릭터가 없거나 writable 줄이 하나도 없으면 요청 0·비용 0 이다.
 */
export function estimateOutfitCost(
  project: Project,
  model: string = DEFAULT_MODEL,
): OutfitCostEstimate {
  const batches = collectOutfitTargets(project);
  if (!batches.length) return EMPTY_ESTIMATE;

  const sceneById = new Map(project.scenes.map((s) => [s.id, s]));
  const synopsisLen = buildSynopsis(project).length;

  let scanLines = 0;
  let requests = 0;
  let charSum = 0;
  for (const batch of batches) {
    const scene = sceneById.get(batch.sceneId);
    if (!scene) continue;
    for (const plan of planOutfitWindows(batch, scene, project.outfitRules)) {
      requests += 1;
      scanLines += plan.scan.length;
      charSum += plan.scan.reduce((sum, l) => sum + l.text.length, 0);
      // lead-in·시놉시스·후보 목록은 요청마다 다시 실려 나가므로 요청 수만큼 중복 계산되는 게 맞다.
      charSum += plan.leadIn.reduce((sum, l) => sum + l.text.length, 0);
      charSum += synopsisLen;
      charSum += JSON.stringify(plan.characters).length;
    }
  }
  if (!requests) return EMPTY_ESTIMATE;

  const inputTokens =
    Math.ceil(charSum / KOREAN_CHARS_PER_TOKEN) + requests * PROMPT_OVERHEAD_TOKENS_PER_REQUEST;
  const outputTokens = requests * OUTPUT_TOKENS_PER_REQUEST;
  const price = MODEL_PRICE_PER_1K[model] ?? MODEL_PRICE_PER_1K[DEFAULT_MODEL];
  const usd = (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;

  return { scanLines, requests, inputTokens, outputTokens, usd };
}
