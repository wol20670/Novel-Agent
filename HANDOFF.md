# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- **복장·표정 자동 추론(LLM) 도입 — Phase 12 까지 확정 완료.** 규칙·Phase 로그·확정 설계는 전부 [`PHASES.md`](./PHASES.md) 에 있다(Claude 계획 → GPT 검토 → 구현 → 검토 → 확정 루프).
  - **Phase 13 = PLANNED / NOT STARTED.** 계약은 이미 확정됐다(아래 📌) — **Phase 13 프롬프트를 받기 전까지 코드를 손대지 말 것.** Phase 13 범위 = *Phase 12 계약 구현 + 무료 결정론 검증 + (사용자 승인 후) live 재측정*. **구현 + 무료 검증을 마치기 전까지, 그리고 사용자 사전 승인 전까지 live API 호출 0.**
  - **Outfit AI semantic FP 는 아직 production 에서 미해결이다**(구매/소유 · 미래 의도 · 타 캐릭터 의상 언급 · window 끝 미래 의도). Phase 12 는 **고친 Phase 가 아니라 계약을 확정한 분석 Phase** 다.
  - ⚠️ **Phase 11 A 식 suppression 프롬프트 튜닝을 반복하지 말 것**(P10/P4 raw omission 회귀). Phase 13 도 프롬프트를 바꾸지만 **목적이 다르다** — 억제가 아니라 `kind` 라벨 외부화다.
  - 표정 선택 품질은 **여전히 실키 미검증**이다(의상만 Phase 10/11 에서 쟀다).
  - 후속 후보(착수 전 지시 필요): P12 window-boundary 축(read-only look-ahead) · 무시한 제안이 재실행 때 다시 나오는 문제 · 실제 제작 대본 기반 품질 측정(Phase 10/11 은 합성 fixture 한정) · 표정 AI 실키 검증. **무엇을 다음에 할지는 사용자가 정한다.**
  - known limitations(**명시적 우선순위 지시 전까지 착수하지 않음**, 상세는 PHASES.md Phase 9 절): D3 Export `optedIn` 비대칭 · D4 `availableExpressions` 후보 누수 · D5/D6 커스텀 표정·의상 속성 해시 충돌.

## 📌 Phase 12 가 확정한 것 (Phase 13 구현 계약 — 재설계 금지)
- **production 변경 0 · live 호출 0 인 분석/설계 Phase.** baseline 은 Phase 11 production contract(= Phase 10 프롬프트 + Phase 11 B 파서) 그대로.
- **root-cause**: known semantic FP 4건(`N1` 구매 · `N3` 미래 의도 · `N4` 타 캐릭터 화제 · `P12-59` 미래 의도+window 경계)은 현재 `B~G` 에서 **구조적으로 유효**하다. ⇒ *"현재 known semantic FP cases 를 recall regression 없이 거를 추가적인 언어 독립 parser-only deterministic invariant 를 이번 audit 에서는 찾지 못했다"* — **"더 이상 없다"로 쓰지 말 것.**
- **wire 계약**: `kind` = **`"transition"` | `"non_transition"` binary**(negative taxonomy 를 enum 으로 늘리지 않는다). `changes[]` 는 **semantic candidate envelope** 이 되지만 **semantic-only widening** 이다 — 후보 캐릭터·exact 의상·scan/writable 범위·fixed/manual·no-op 등 **structural eligibility 는 그대로**.
- **`S` gate 위치**: `B→C→C2→D→E→F→G→S→seen.add→parsedTransitionByChar.set`. S-rejected 행은 `seen` 도 chronology 도 건드리지 않는다. **반환 직전 filter 로 만들지 말 것**(Phase 11 B 연대기·반환 순서·cross-window 비전파 전부 유지).
- **fail-open**: `non_transition` 만 추가로 제거하고 **missing·unknown·wrong-type 은 legacy accept**, JSON 자체 malformed 는 기존대로 throw. 이 보장은 **동일 raw row 에 대한 parser-layer conditional guarantee** 이지 end-to-end recall 보장이 아니다 — **prompt 변경에 의한 raw omission FN 은 여전히 가능**하다.
- **정규화·파싱 3축을 섞지 말 것**: `character/outfit` = 기존 `normalizeOutfitLabel`(**lowercase 없음**, fuzzy 없음) / `kind` = NFKC+trim+공백+**lowercase** 후 두 토큰 exact / `i` = **production 과 동일한 numeric coercion**(`Number(r.i)` + `Number.isFinite`, `{"i":"60"}` 은 60). 파서·harness·raw recall 진단이 같은 해석을 쓰고, harness 는 셋을 **각각 mirror**(generic abstraction 신설 금지).
- **prompt 경계**: transition-only reporting 문장은 **교체/재작성**(append 금지), structural 지시는 **의미 보존**(표현 정합화만). "파서가 막으니 structurally invalid row 도 다 내라"는 금지.
- **저장·전파 없음**: `kind` 는 parser-local transient. `OutfitChange`/`OutfitSuggestion`/store/UI/Project/save/`.npproj.zip`/협업/Ren'Py export **전부 무변경**.
- **측정 계약**: raw candidate recall 은 **owner-window 기준**(그 `i` 를 scan 으로 소유하는 유일한 window 의 raw 에 있어야 emitted, 다른 window 건은 `out-of-owner-window emission` 진단일 뿐) · FN 은 **raw omission / semantic-label(S) / structural(B~G) / final** 로 **단일 attribution** · PRIMARY 는 Run 1 only(23 case·26요청)이고 **Phase 10 산출물을 덮어쓰지 않는다**. ⚠️ `audit.local/out/` 에는 **Phase 10 것만 남아 있다**(Phase 11 raw 없음 → 문서 인용 대조).

## 📌 Phase 11 이 확정한 것 (다음 Phase 의 baseline)
- **같은 응답(= 같은 요청·같은 scan window) 안의 연쇄 전환은 파서가 시간순으로 읽는다** — 앞선 valid
  transition 을 함수-local 가정으로만 반영해 뒤 항목의 `G(no-op)` 를 판정한다. **canonical 상태도,
  사용자 수락도 아니다**: 다음 window·store·Project 로 전파되지 않고 저장·zip·협업에도 안 실린다.
  범위를 "same-run chain 전체 해결"로 과장하지 말 것 — **cross-window 는 여전히 비전파(의도)** 다.
- **검증 순서와 반환 순서는 다른 축**이다. 판정만 `i` 오름차순이고 **반환은 모델 출력 순서 그대로**.
- 값의 단일 소스는 계속 `outfitFlags` 다. 중간에 사람이 적은 manual 이 있으면 **그쪽이 이긴다**.
- **semantic FP 는 이 Phase 가 고친 게 아니다** — B-only live 에서도 Phase 10 과 동일한 FP 4건이
  재현됐다(`N1`·`N3`·`N4`·`P12-59`). 합성 fixture 한정 수치이며 실대본 품질이 아니다.

## 📌 Phase 10 이 확정한 것 (다음 Phase 의 baseline)
- **Outfit AI 품질은 이제 "미측정"이 아니라 "측정됨"이다** — 단 **합성 curated fixture 한정**이고 실제 제작
  대본은 재지 않았다. `precision 0.810 / recall 0.944 / F1 0.872`(case pass 18/23)를 **실제 게임 대본의
  품질로 인용하면 안 된다** — "Phase 10 curated synthetic live benchmark 의 Run 1 결과"가 정확한 표현이다.
- **production 은 한 줄도 안 바뀌었다**(측정 Phase). 확정 커밋은 docs-only.
- **재현된 failure 2종**: ① 대사 속 의상 언급의 시제·화자 구분 실패로 인한 노출 FP ② 같은 run 안에서
  이어지는 복귀 전환이 `G(no-op)` 에 걸려 사라지는 구조적 limitation. 둘 다 Phase 11 입력.
- 측정 harness 는 `audit.local/`(gitignore)에 있고 **커밋하지 않았다** — Phase 11 이 개선 전후를 같은 자로
  재야 하면 그때 `scripts/` 승격을 검토한다.

## 📌 Phase 9 가 확정한 계약 (다음 Phase 의 baseline — 깨지 말 것)
- **미리보기 스프라이트 선택은 Export 와 맞춘 상태다.** `optedIn=true` 캐릭터는 생성기의
  `spriteSlots`/`selectSprite` 를 **공유**하고, 줄 사이에는 논리 표정이 아니라 **실제 표시된 attr** 을
  잇는다(생성기 `lastShown.attr` 대응).
- **화자 줄에서만 논리 표정을 다시 계산**하고, 비화자 의상 동기화·숨김 복원은 **표시 attr carry**,
  숨김·유효 CG 구간은 **동결**이다.
- **미리보기에 독자적인 스프라이트 폴백 state machine 을 다시 만들지 말 것** — 판정이 둘로 갈리는
  순간 Phase 9 이전 버그가 되돌아온다. 폴백 판정은 Expression identity 가 아니라 **attr 존재** 기준.
- **`optedIn=false` 캐릭터(D3)는 기존 미리보기 경로(`spriteAssetId`)를 의도적으로 유지**한다 —
  게임에 안 나오는 캐릭터라 parity 대상이 아니고, 통합하면 목적 밖의 화면 변경이 된다.

## 📌 Phase 8 이 확정한 계약 (다음 Phase 의 baseline — 깨지 말 것)
- **표정 AI 는 async 결과를 현재 project 에 그냥 merge 하지 않는다.** 커밋 직전 **current snapshot 하나**로 대상·청크·요청을 다시 만들어 재검증하고, 어긋난 것만 버린다(run 전체 폐기 아님). 쓰기 base 는 항상 `currentProject.scenes` — 실행 중 사용자가 한 무관한 편집(번역·상태 등)은 **보존된다**. 검증~`setScenes` 사이에 `await` 을 넣지 말 것.
- **의상 변경은 기존 `emotionAuto` 를 자동으로 지우거나 다시 계산하지 않는다**(수동 의상 편집도 같은 stale 을 만들므로 AI 경로만 특별 취급하면 비대칭). 자동 invalidation 을 만들지 말 것.
- **"의상 제안 무효화"와 "표정 AI 초기화"는 서로 다른 개념이다.** 전자는 `outfitSuggestions`+revision, 후자는 `emotionAuto` 전용이고 서로를 건드리지 않는다.
- **표정 AI 초기화는 자동값(`emotionAuto`) 전용** — 사람이 정한 `emotion` 과 의상·번역·보이스·상태는 보존한다. 권장 작업 순서는 **Outfit 확정 → Expression AI**(역순이면 초기화 후 재실행).
- 기존 호환성은 계속 고려 대상: Preview · save/load · `.npproj.zip` · Ren'Py export · Phase 7 Outfit 계약.
- **타이틀 BGM 실기 청취 확인**(사용자) — 에셋 탭 🎵 BGM 맨 위에서 곡을 올리고 내보내 ① 타이틀에서 나오는지 ② "처음부터" 시작하면 첫 장면 곡으로 넘어가는지 ③ ESC→타이틀 복귀 때 다시 나오는지.

## 📌 알아둘 것 (지속)
- **Supabase Storage 경고는 무시**(대시보드 "Remove policy" 절대 누르지 말 것 — 에셋 동기화가 400으로 깨진다). 에셋 버킷의 실제 노출 범위는 "배포 URL 아는 사람 = 전부 열람·업로드 가능"이며 감수한 선택(2026-08-05). 상세는 `supabase/setup.sql` 머리 주석.
- **이미지 GUI 3종(메인·퀵·ESC)은 전부 opt-in** — 아무것도 안 올리면 생성 `.rpy`가 기존과 바이트 단위로 같아야 한다(회귀 0). 손댈 때마다 작업 전 커밋에서 여러 구성으로 `.rpy`를 덤프해두고 `diff -r`로 증명할 것(CLAUDE.md "출력 회귀 0 증명법").
- **표정 AI 배정 실키 검증도 최후순위로 연기**(2026-08-10, TTS와 같은 취급) — OpenAI 키로 후보 밖 라벨·연속성·미소 계열 분화·토큰 견적을 볼 항목이었으나 당분간 안 한다. 코드는 이미 있으니 재개할 땐 `src/generators/emotion/` 부터. 재개 시 Phase 5 문맥 품질 확인 목록도 함께: 주인공↔히로인 반응 · 지문 개입 · 기존 표정 연속성 · 감정 유지 구간 · 명확한 급변 · 긴 장면.
- **TTS(Typecast)는 최후순위로 연기**(2026-08-09) — 실키 검증·Vercel Edge 배포 확인 모두 당분간 안 한다. 코드는 이미 들어와 있으니 재개할 땐 `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09) — 글자가 구워진 버튼이 영어·일본어에서도 한글로 남지만 감수. 다국어는 **텍스트 번역 + 폰트 교체**로만 간다(Ren'Py `tl/<언어>/` 이미지 치환은 CLAUDE.md에 방법만 남겨둔다).
- **store 액션엔 단위 테스트가 없다** — 안전망은 typecheck+e2e뿐이라 협업 push·자동저장 디바운스 같은 경로는 실사용 확인이 필요하다.
- 미착수(계속 의도적으로 뺌): 탭 컴포넌트 코드 스플리팅, `screensRpy.ts`(3484줄)·`AssetsTab.tsx`(1338줄) 분리(생성기 쪽은 `.rpy` 회귀 0 덤프 대조가 필요한 별개 작업), store 슬라이스 안의 긴 로직(autoTranslateAll·보이스 배치)을 services 로 빼기.

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- **Phase 12 확정(docs-only) — Outfit AI semantic contract audit + Phase 13 계약 고정**: production/tests/audit.local 변경 0, live 호출 0. 확정 계약은 위 📌 블록, 전체 근거·후보 비교·테스트 매트릭스·rollback 기준은 `PHASES.md` "Phase 12 확정" 절.
