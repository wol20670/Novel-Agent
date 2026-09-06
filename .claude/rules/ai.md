---
paths:
  - "src/generators/emotion/**"
  - "src/generators/outfit/**"
  - "src/generators/translate/**"
  - "src/store/aiBatchSlice.ts"
  - "src/config/aiConfig.ts"
  - "src/generators/shared/**"
---

# AI 워크플로우 규칙 (Expression · Outfit · Translation)

## 동결 — 새 blocker 없이 다시 열지 말 것

- **Expression AI 는 Phase 18(baseline `931a2cc`), Outfit AI 는 Phase 14 에서 동결됐다.**
  prompt variant 추가 · 시제 denotation 재시도 · 변경 횟수 sparsity prior · 기본 표정 선호 억제 문구 ·
  **blanket boundary suppression**("window 끝 행은 reject") 전부 금지.
- **deterministic 통과(typecheck·tests·mutation·`dump:rpy` diff 0)를 품질 개선으로 인용하지 말 것.**
- backlog 는 **존재한다는 이유만으로 구현 대상이 되지 않는다.**

## 판정 · 후보

- 표정 판정은 **`resolveEmotion` 단일 소스**(동기·순수). 우선순위 = 작가 태그 > `emotionAuto` > 휴리스틱 > `기본`.
  **작가 태그는 검증하지 않는다**(선언 목록으로 거르면 대본 태그가 조용히 무시된다).
- AI 후보는 `availableExpressions`, 최종 검증은 선언 목록(`effectiveExpressions`) — **같게 만들지 말 것.**
  후보 **순서**의 정본은 `effectiveExpressions` 선언 순서이고 반환 Set 은 멤버십 전용이다.
- ⚠️ `spriteAssetId` 식 "표정 단위 기본 의상 폴백"을 후보 생성에 되살리지 말 것.
- ⚠️ `resolve.ts` 에서 `generate.ts` 를 **import 하지 말 것**(순환).
- **후보 0이면 그 줄이 대상에서 빠지는 게 정상**이다. 견적은 실행과 **같은 planner** 를 쓴다
  ("숫자 불변"이 계약이 아니다).
- 기존 `emotionAuto` 를 **소급 변경·자동 삭제·migration 하지 말 것.**

## 프롬프트 · 파서

- 표정 프롬프트의 두 축을 섞지 말 것: **continuity 는 same-speaker 한정, 감정 판단 근거는 전체 문맥.**
  범위를 좁힌다고 "같은 화자의 이전 줄만 보라"로 쓰면 정반대 회귀다.
- 요청의 **target 과 문맥은 다른 축**이다. 문맥 source 를 "target 이 아닌 줄"로 만들지 말 것.
  빈 텍스트 필터는 **문맥 source 에만** 건다. 문맥의 `expr` 은 저장된 값만(휴리스틱·폴백 금지).
  쓰기 경계는 `parseEmotionResponse` 의 `itemByIndex` 하나다.
- 의상 파서 게이트 순서 **`B→C→C2→D→E→F→G→S→seen.add→chronology`** 를 유지할 것.
  S 를 반환 직전 filter 로 옮기지 말 것. **fail-open**(missing·unknown·wrong type 은 legacy accept).
- **정규화 3축을 섞지 말 것**: identity(`normalizeOutfitLabel`, lowercase 없음) / `kind`(lowercase 후 exact) / `i`(numeric coercion).
  `kind` 는 parser-local transient — `OutfitChange` 밖으로 내보내지 말 것.
- `FIXED_RULE` 은 두 의미를 동시에 지킨다: fixed 행은 후보가 아니고, 그 뒤 later completed transition 은
  **복귀 여부와 무관하게** 계속 심사한다.

## 상태 · 커밋

- 의상 제안은 **저장되는 데이터가 아니다.** AI 전용 필드를 만들지 말 것 — 값은 언제나 `outfitFlags` 에서 읽는다.
- `applyOutfitSuggestion` 은 **그 항목만** 제거한다(전체 clear 아님).
  `outfitSuggestionRevision` 은 stale commit 방지 epoch 이라 canonical 변경 경로는 **첫 `await` 이전**에 올린다.
- async 결과는 **커밋 직전 재검증**하고 어긋난 것만 버린다(run 전체 폐기 금지).
  쓰기 base 는 현재 `scenes`, **검증~`setScenes` 사이 `await` 금지.**
- 번역 동치는 **`sameLooseText` 하나**(엑셀 병합·직접 편집·자동 번역 세 경로가 같은 답).
  ⚠️ QA 는 **exact anchor** 를 쓴다 — `sameLooseText` 를 쓰지 말 것.
  ⚠️ 표정의 `requestKey` 를 번역에 복사하지 말 것.
- `setLineText` 의 stale 번역 제거를 **편집 완료 시점으로 미루지 말 것**(같은 state update 안에서).
- 번역 async 검증은 **pending 을 바깥 루프로 도는 2-pass** 여야 한다.
- QA deterministic 은 **copy-through 하나뿐** — **두 번째 heuristic 을 추가하지 말 것.**
  규칙 결과는 AI 가용성과 독립이고, 키가 없어도 run 전체를 폐기하지 않는다.
  중복 응답 `i` 는 last-wins 가 아니라 **그 항목만 unreviewed**.
  사람이 누른 `origin:'manual'` 은 pending 자동 판정이 덮지 못한다.
- QA 워크북 metadata 는 **fail-closed**, 비교는 **exact**(`trim` 끼우지 말 것), 적용은 `setScenes` **1회**.
- ⚠️ 앱 안에 **고품질 재번역·AI 대체 번역 제안·auto-fix 를 다시 만들지 말 것.**

## 운영

- **live API 키를 리포 안 평문 파일로 두지 말 것** — 환경변수로만 주입하고 값은 어디에도 남기지 않는다.

**상세·근거·accepted limitation → [`docs/contracts/ai-workflows.md`](../../docs/contracts/ai-workflows.md)**
