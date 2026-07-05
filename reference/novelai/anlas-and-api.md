# Anlas 요금 체계 · API 호스트 · 실제 request body

출처: docs.novelai.net (steps/guidance, qualitytags 페이지) + `test/…분석 보고서.pdf` §5,§6,§10 + 우리 코드(`src/generators/image/novelaiProvider.ts`) 실측, 2026-07-05.

## 무료(Opus) 조건 — 전부 충족해야 0 Anlas
1. `n_samples = 1` (배치 아님)
2. 해상도가 **Normal 이하**(예: 1216×832, 832×1216, 1024×1024)
3. `steps ≤ 28`
4. **img2img 를 쓰지 않음**(텍스트 전용 text2img)

→ 위 4개를 모두 만족하면 img2img 를 써도 0 Anlas 라는 세부 사실도 있으나(`novelai-cost-model` 메모리 실측), **Precise Reference/Vibe 인코딩 등 "참조" 계열 기능은 무료조건과 별개로 항상 과금**된다(아래 표).

## Anlas 소모 구조 (참조/후처리 기능)
| 기능 | 비용 |
|---|---|
| encode-vibe(신규 이미지 인코딩) | 2 Anlas/장 (세션 캐시로 재사용 시 0) |
| Vibe 4개 초과 다중 사용 | 초과분 1개당 +2 Anlas |
| Precise Reference | +5 Anlas/참조(참조 개수 비례) |
| Upscale(4배) | ~7 Anlas |
| Large 해상도 생성 | 무조건 정량 차감(무료조건 무관) |

- Subscription Anlas(구독 충전분)가 먼저 소모되고, 다음으로 Paid Anlas(구매분) 소모. Subscription Anlas 는 갱신 시 "현재 잔액이 티어 최대치보다 적을 때만" 그 수치까지 보충(이월은 안 됨), Paid Anlas 는 소멸 없이 계속 이월.

## API 호스트 분리
| 서비스 | 도메인 | 용도 |
|---|---|---|
| Primary Gateway | `api.novelai.net` | 인증·결제·**Upscale** |
| Image Gen API | `image.novelai.net` | V4.5 디퓨전 생성·img2img·**encode-vibe**·bg-removal(augment) |
| Text Gen API | `text.novelai.net` | 텍스트 생성(Kayra/Erato 등, 이 앱은 미사용) |

우리 코드는 `vite.config.ts` dev 프록시로 `/nai`→image 호스트, `/nai-api`→Primary 호스트(업스케일용, `/nai-api` 를 `/nai` 보다 먼저 매칭해야 함)를 각각 우회한다.

## 실제 request body (우리 코드 기준, `novelaiProvider.ts`)
### text2img (`action: 'generate'`)
```json
{
  "input": "<프롬프트+품질태그>",
  "model": "nai-diffusion-4-5-curated",
  "action": "generate",
  "parameters": {
    "params_version": 3, "width": 1216, "height": 832,
    "scale": 6, "sampler": "k_euler_ancestral", "steps": 28,
    "n_samples": 1, "qualityToggle": false, "seed": 123,
    "negative_prompt": "...",
    "v4_prompt": { "caption": { "base_caption": "...", "char_captions": [] }, "use_coords": false, "use_order": true },
    "reference_image_multiple": ["<base64 vibe vector>", "..."],
    "reference_strength_multiple": [0.4]
  }
}
```
### img2img (`action: 'img2img'`) — 추가 필드
```json
{ "parameters": { "image": "<base64>", "strength": 0.7, "noise": 0, "extra_noise_seed": 123 } }
```
### encode-vibe (`/ai/encode-vibe`)
```json
{ "image": "<base64>", "information_extracted": 0.35, "model": "nai-diffusion-4-5-curated" }
```
### bg-removal (`/ai/augment-image`)
```json
{ "req_type": "bg-removal", "width": 832, "height": 1216, "image": "<base64>" }
```
### upscale (`/ai/upscale`, Primary 호스트)
```json
{ "image": "<base64>", "width": 832, "height": 1216, "scale": 4 }
```

응답은 대부분 **ZIP**(PK 헤더) 안에 PNG 1장 — `jszip` 으로 첫 PNG 추출(`bufToImage`). 일부 엔드포인트는 raw PNG 를 바로 반환.
