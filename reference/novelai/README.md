# NovelAI 공식 문서 로컬 정리

출처: https://docs.novelai.net/en (WebFetch 로 페이지별 수집) + `test/NovelAI 플랫폼 개발 가이드라인 및 기술 아키텍처 종합 분석 보고서.pdf`(로컬 전용, git 미추적).
수집일: 2026-07-05.

**왜 여기 있나**: `test/`·`docs/` 는 `.gitignore` 대상이라 PC↔노트북 사이에 동기가 안 된다. 이 폴더(`reference/novelai/`)는 **git 추적**이라 어느 기기에서든 최신 참고자료를 그대로 받는다. NovelAI 사이트는 JS 렌더라 WebFetch 로 본문이 잘 안 긁히는 경우가 있어(`novelai-image-provider` 메모리 참고), 확인된 내용만 정리했다.

## 파일 구성
- [`image-generation.md`](./image-generation.md) — 모델·태깅·품질태그·steps/guidance·강조문법·다중인물
- [`references.md`](./references.md) — Vibe Transfer·Precise Reference·encode-vibe
- [`enhance-upscale.md`](./enhance-upscale.md) — Enhance vs Upscale
- [`anlas-and-api.md`](./anlas-and-api.md) — 무료조건·Anlas·호스트·실제 request body

## 우리 앱과의 매핑
| 문서 개념 | 코드 위치 |
|---|---|
| 품질 태그 부착 | `src/generators/image/novelaiProvider.ts` `withQualityTags` |
| Vibe Transfer / encode-vibe | `novelaiEncodeVibe`, `toVibe`(같은 파일) — `styleReferences` 로 호출 |
| img2img (strength/noise) | `novelaiImg2img`(같은 파일) |
| Upscale | `novelaiUpscale`(같은 파일, Primary 호스트 `api.novelai.net`) |
| 배경제거(Director bg-removal) | `novelaiRemoveBackground` |
| 무료/고품질 모드·사이즈·스텝 | `src/config/aiConfig.ts` `image.novelai.modes` |
| 프롬프트 컴파일(태그 변환) | `src/generators/image/promptCompiler.ts` |

## 문서에서 찾지 못한 것 (비공개/불명확)
- Precise Reference 의 정확한 API 파라미터명 — 문서는 UI 슬라이더(Strength/Fidelity)만 설명, request body 스키마는 비공개. 실호출 응답으로 역추적 필요.
- `reference_strength`(단수) vs `reference_strength_multiple`(복수) 등 실제 필드명은 우리 코드(`novelaiProvider.ts`)의 기존 구현을 신뢰(과거 세션에서 공식 명세 대조 완료 — `novelai-image-provider` 메모리).
