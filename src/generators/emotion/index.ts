// 표정 결정 — 오프라인 휴리스틱 + 명시 태그가 최종 설계(LLM 분류기 연결 안 함, 2026-07-13 확정).
//   - 명시 태그 `이름(표정)` 이 있으면 그 값이 우선, 없으면 inferEmotion 휴리스틱.
//
// 표정 "선택"은 여기서, 표정 "그림"(일관성 있는 스프라이트)은 외부 도구에서 만들어 업로드한다.

export { inferEmotion } from './infer';
export type { EmotionContext } from './infer';
