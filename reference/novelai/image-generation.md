# 이미지 생성 — 모델·태깅·품질태그·파라미터

출처: docs.novelai.net/en/image/{basics,tags,qualitytags,stepsguidance,strengthening-weakening,multiplecharacters}, 2026-07-05 수집.

## 모델
- 핵심 엔진(NovelAI Diffusion Anime 계열): 애니메이션 화풍 특화 확산 모델. 우리 앱은 `nai-diffusion-4-5-curated` 사용(서브컬처 미소녀 화풍, `src/config/aiConfig.ts`).
- 텍스트 모델(Erato/Xialong/GLM-4.6 등)은 **이미지 렌더링 엔진이 아니다** — 서사/프롬프트 보조 도구일 뿐. 실제 그림은 확산 모델(V4.5 등)의 영역.

## 태깅 규칙
- **태그 배치 원리**: 프롬프트 앞쪽 태그가 전체 구도·스타일에 가장 강하게 영향. `1girl`/`solo` 같은 주체 선언은 최선단에 두어 타 인물 난입 방지.
- 신체 정밀 조형(`toned`, `muscular`, `thick thighs` 등)은 danbooru 계열 학습 어휘. 홍채 오류 방지엔 Undesired Content 에 `heterochromia` 추가.
- 구도 가이드(`full body`, `from above` 등)도 앞쪽 배치가 강하다.
- 매체/화풍/채색/특수효과 태그 예시: `traditional media, oil painting, watercolor` / `impressionism, ukiyo-e, art nouveau` / `anime coloring, monochrome, pastel colors` / `bloom, chromatic aberration, bokeh, lens flare`.
- `year 2014` 같은 연도 태그로 특정 시대 화풍 재현 가능.
- **Add Quality Tags** 옵션을 켜면 서버가 `aesthetic`/`very aesthetic` 를 자동 추가 — 특정 화풍을 고착시킬 수 있어 원치 않으면 끄거나 태그를 대괄호로 약화. 우리 앱은 `qualityToggle:false` 로 서버 자동부착을 끄고 **직접 끝에 부착**한다(`withQualityTags`, 결정적 동작을 위해).

## 품질 태그 (모델별, 프롬프트 **맨 끝**에 부착)
| 모델 | 품질 태그 |
|---|---|
| V4.5 Full | `location, very aesthetic, masterpiece, no text` |
| V4.5 Curated | `location, masterpiece, no text, -0.8::feet::, rating:general` |

Curated 의 `-0.8::feet::` 는 발 왜곡 억제용 음수 가중치인데, 우리 앱은 **전신 입화(head-to-toe)** 를 쓰므로 발이 잘리는 부작용이 있어 의도적으로 제외했다(`aiConfig.ts` 주석 참고).

## Steps & Prompt Guidance
- **Steps**: 반복 횟수. 10~15 는 구도/색감 프리뷰용, 높을수록 디테일↑·시간↑. **Opus 티어: steps ≤28 + Normal 이하 사이즈 + 단일 생성(비배치)이면 Anlas 무료.**
- **Prompt Guidance(scale/CFG)**: 텍스트 준수 강도. 낮으면 painterly/부드러움, 높으면 디테일/샤프하지만 과하면 화질 저하·아티팩트. **V3 이상 권장값 5~6**(우리 앱 기본 `scale: 6`).
- Prompt Guidance Rescale: 높은 guidance 로 인한 과채도 완화(V3). Decrisper: 고guidance 로 인한 색/아티팩트 완화(모든 guidance).

## 강조/약화 문법 (Strengthening & Weakening)
- **구형(브래킷)**: `{tag}` = ×1.05 강화, `[tag]` = ÷1.05 약화. 중첩 가능(`{{tag}}` = ×1.05²).
- **신형(숫자 `::`, V4 이상 전용)**: `1.5::tag::` — `::` 앞 숫자가 그 오른쪽 구간의 가중치. 약화는 0.0~1.0 사이 숫자. 강화 구간을 닫으려면 숫자 없는 `::` 를 둔다.
- 우리 앱(`novelai-image-provider` 메모리 기존 확인): SD WebUI 식 `(tag:1.3)` 문법은 **먹지 않는다** — 반드시 `weight::tag::` 형태.

## 다중 인물 (Multi-Character)
- **Character Prompt Boxes**: "+Add Character" 로 캐릭터별 프롬프트를 분리 — 정보 누수(bleeding) 최소화.
- **위치 지정**: "AI's Choice" 끄면 5×5 그리드로 대략적 배치 힌트(강제 아님, "가벼운 제안"에 가까움).
- **파이프 문법**(캐릭터 박스 미사용 시): `base prompt | character 1 | character 2`.
- **인원수 태그**: `1boy`/`2girls` 등은 **base prompt** 에만; 개별 캐릭터 프롬프트는 숫자 없이(`girl, purple hair` 처럼).
- **상호작용 태그**: `source#`(능동)/`target#`(수동)/`mutual#`(상호) 접두사. 예: 한쪽엔 `source#hug`, 다른 쪽엔 `target#hug`.

## API 상 대응 (`characterPrompts`/`v4_prompt`)
V4 계열은 `use_coords`/`characterPrompts`/`v4_prompt.caption.char_captions` 구조로 캐릭터별 캡션을 분리 전달할 수 있다(우리 코드 `buildParameters`, `novelaiProvider.ts`). 현재 앱은 `char_captions: []`(미사용) — `base_caption` 단일 캡션만 채운다.
