# 참조 도구 — Vibe Transfer · Precise Reference · encode-vibe

출처: docs.novelai.net/en/image/{vibetransfer,precisereference}, 2026-07-05 수집.

## Vibe Transfer
업로드한 이미지를 "영감(inspiration)"으로 삼아 생성에 반영하는 기능. 원본을 그대로 베끼지 않는다.

- **Reference Strength**: 1.0 에 가까울수록 화풍·색감 등 시각 특성을 더 강하게 모방. **여러 vibe 를 함께 쓸 땐 강도 합이 1.0 이하가 되도록 권장**.
- **Information Extracted**: 소스에서 무엇을 뽑아낼지 조절. **낮추면 구도(composition) 위주로 우선하고, 텍스처 등 고주파 디테일부터 버린다** — 이 덕분에 **원치 않는 요소(예: 흰 배경)가 결과에 억지로 끼어드는 걸 방지**할 수 있다. (우리 CG 문제의 핵심 해법 근거 — 투명/흰 배경 스프라이트를 참조로 쓸 때 배경까지 따라오지 않게 하려면 이 값을 낮춘다.)
- **비용**: 표준 생성(참조 이미지 사용)은 그 자체로 무료. **인코딩(V4+)** 은 신규 이미지당 **2 Anlas**(세션 캐싱으로 재인코딩 방지). 4개 초과 다중 vibe는 생성당 vibe 1개마다 +2 Anlas.
- **Information Extracted 값 변경 시 재인코딩 필요**(캐시 무효화).
- **멀티비이브**: 최대 16개 동시 사용 가능.
- **파일 형식**: `.naiv4vibe`(단일)/`.naiv4vibeBundle`(다중). 인코딩된 벡터는 PNG 메타데이터에도 저장되어 공유·재현 가능.

## Precise Reference (Character Reference)
캐릭터 정체성(얼굴·포즈·구도)을 강하게 고정하는 V4.5 전용 기능.

- **Strength 슬라이더**: 1에 가까울수록 스타일·색감 등 시각 단서를 강하게 모방 — 과하면 표정·각도·포즈까지 참조와 비슷해짐.
- **Fidelity 슬라이더**: 1이면 참조를 더 강하게 강제(프롬프트로 오버라이드하기 어려움), 0이면 유연.
- **비용**: 참조당 **+5 Anlas**(참조 개수에 비례 가산).
- **Inpainting 과 호환**(부분 영역에 참조를 주입해 의상·디테일 보정 가능).
- **제약**: **V4.5 전용**, 그리고 **Vibe Transfer 와 동시 사용 불가**(상호 배타).
- 공식 API 파라미터명은 문서에 비공개 — UI 레벨 설명만 존재.

## encode-vibe
Vibe 인코딩 엔드포인트(`/ai/encode-vibe`). V4/V4.5 는 raw 이미지를 바로 참조로 넣을 수 없고 이 인코딩 단계가 필수(우리 코드 주석 근거). 요청에 `information_extracted`(0~1)를 실어 보내고, 결과 벡터를 생성 요청의 `reference_image_multiple` 배열에 담아 `reference_strength_multiple` 과 함께 전달한다.

## 우리 앱의 선택 (CG 레퍼런스 개편)
CG 는 스프라이트를 "그대로 베끼기"가 아니라 "머리색·의상 등 필수 특징만 가져온 표지 일러스트"를 원하므로:
- **Precise Reference 는 채택하지 않음** — 고정밀·Vibe 배타·API 비공개라 방향과 상충.
- **Vibe Transfer + 낮은 information_extracted(≈0.35) + 낮은 strength(≈0.4)** 를 채택 — 느슨한 참조로 구도/디테일은 새로 그리게 하고, 배경 누수를 막는다.
