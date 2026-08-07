// 표정 결정 — 오프라인 휴리스틱 + 명시 태그 + AI 문맥 배정(2026-08 연결, 이전엔 "LLM 분류기 연결
// 안 함"이었으나 emotionAuto 필드 도입으로 뒤집혔다). 이 파일은 하위 모듈들의 재수출 창구일 뿐,
// 실제 판정 로직은 각 파일에 있다:
//   - resolve.ts  : 최종 우선순위(작가 태그 emotion > AI emotionAuto > 휴리스틱 > '기본')와
//                    "선언된 표정 목록" 검증의 단일 소스. React 렌더 중에도 불려 동기·순수해야 한다.
//   - infer.ts    : 신호가 없을 때(또는 AI 미실행)의 결정적 오프라인 추론(inferEmotion) — API 키
//                    없어도 항상 동작.
//   - aiSelect.ts : 문맥 기반 AI 배정. 결과는 동기 판정에 못 쓰므로 미리 계산해 Line.emotionAuto 에
//                    저장해두는 배치 작업(store.ts)에서만 쓰인다.
//   - estimate.ts : aiSelect 실행 전 비용(요청 수·토큰·USD) 어림 — API 호출 없는 순수 계산.
//
// 표정 "선택"은 여기서, 표정 "그림"(일관성 있는 스프라이트)은 외부 도구에서 만들어 업로드한다.

export { inferEmotion } from './infer';
export {
  resolveEmotion,
  resolveEmotionDetailed,
  availableExpressions,
  type EmotionSource,
  type ResolvedEmotion,
} from './resolve';
export {
  collectEmotionTargets,
  selectEmotionsBatch,
  parseEmotionResponse,
  type EmotionItem,
  type EmotionBatch,
  type EmotionPromptCtx,
} from './aiSelect';
export { estimateEmotionCost, type EmotionCostEstimate } from './estimate';
