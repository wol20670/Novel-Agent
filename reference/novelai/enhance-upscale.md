# Enhance vs Upscale

출처: docs.novelai.net/en/image/enhance (및 인접 후처리 페이지), 2026-07-05 수집.

## Enhance (강화)
생성된 이미지를 **NovelAI Diffusion 에 다시 통과시켜** 개선한다. Upscale 과 달리 **텍스트 프롬프트가 결과에 영향을 준다** — 부족한 부분을 프롬프트로 조정해 보완 가능.
- **Magnitude** 슬라이더: Strength·Noise 를 한 번에 조합.
- 개별 조절: **Strength**(이미지가 얼마나 바뀌는지), **Noise**(디테일 생성량).
- **Upscale Amount**: Enhance 중 해상도도 함께 올릴 수 있음.
- 낮은 Strength/Noise + 원본 구도 유지 조합으로 "질감만 향상"도 가능(PDF §10.6).

## Upscale (확대)
순수 해상도 확대 전용 — "예술적 영향 없이 그냥 업스케일하고 싶다면 Upscale 을 쓰라"고 문서가 명시. Enhance 와 달리 프롬프트 영향 없음.
- 우리 앱: `novelaiUpscale`(`novelaiProvider.ts`) — **4배 고정**, 엔드포인트는 **Primary 호스트**(`api.novelai.net/ai/upscale` — image 호스트는 404). ~7 Anlas.
- 같은 시드라도 해상도를 바꿔 **재생성하면 다른 그림**이 나오므로, 마음에 든 그림의 해상도만 올리려면 재생성이 아니라 **업스케일**이 정석(기존 `novelai-image-provider`/`novelai-cost-model` 메모리와 일치).

## 우리 앱의 CG 적용
CG 는 기본을 **무료 사이즈(1216×832, steps 28, 1장)** 로 생성해 base Anlas 0 을 유지하고, 마음에 든 결과만 **Upscale(4배)** 로 선명화한다. 처음부터 큰 해상도가 필요하면 **CG 고품질 토글**로 `high` 모드 사이즈(1536×1024)를 명시적으로 선택 — 이 경우는 Anlas 가 정량 소모된다(문서: Large 사이즈는 무조건 정량 차감).
