# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- **Outfit 은 Phase 14, Expression F-1 은 Phase 15 에서 확정됐다. 다음 Phase 는 정해져 있지 않다 — 착수 전 사용자 지시가 필요하다.** 규칙·Phase 로그·확정 설계는 전부 [`PHASES.md`](./PHASES.md) 에 있다(Claude 계획 → GPT 검토 → 구현 → 검토 → 확정 루프).
  - **표정 선택 품질은 여전히 실키 미검증**이다(의상만 Phase 10/11/13 에서 쟀다). Phase 15 는 결정론적 계약 불일치를 고쳤을 뿐 **모델의 선택 품질을 잰 게 아니다**. 재개하면 `src/generators/emotion/` 부터 — `aiSelect.ts`(문맥/target 두 축) · `resolve.ts`(판정 단일 소스) · Phase 5 문맥 품질 확인 목록(PHASES.md).
  - **Expression backlog(사용자 별도 지시가 있을 때만 — 자동으로 다음 Phase 가 아니다)**: **F-2** 청크 경계를 넘는 연속성 정보 0(고치려면 러너·`validateEmotionUpdates` 양쪽에 run-local 상태를 흘리는 **설계 변경** — 순진하게 문맥에 넣으면 requestKey 축 9 가 전부 불일치해 2번째 이후 청크가 전량 skip 된다) · **F-3** target 수집에 export `optedIn` 게이트 없음(D3 와 결합) · 후보 1개뿐인 줄의 호출 생략 · 파서 폐기 건수 미보고.
  - **Outfit 은 열린 TODO 가 아니다** — 아래 셋은 **accepted limitation**(문서화하고 안고 간다, 상세는 PHASES.md "Phase 14 확정" 절):
    - `P12-59` residual FP(no-look-ahead window **종단**의 미래 의도). 원인은 raw semantic misclassification 이고 **window boundary 는 가장 강하게 의심되는 contributing factor 지만 유일한 causal root cause 로 확정하지 않는다.** ⚠️ **"window 끝 행은 non_transition/reject" 류 blanket boundary suppression 을 넣지 말 것**(진짜 종단 transition 이 silent FN 이 된다).
    - **same-input raw emission variability** — byte-identical 요청 24쌍 중 decision 일치 23/24, 유일한 divergence 가 `P3#0`. `temperature 0` 을 deterministic 이라고 쓰지 말 것. ⚠️ 보존 관측 "4 emitted / 1 omitted"는 **같은 입력 반복 실험이 아니므로 rate 로 인용 금지.**
    - `N1`/`N4` raw 미출력 — FP 는 없지만 **`S` 의 직접 효과가 아니다**(S 관측 case 는 `N3`). 재emit 유도 금지.
  - **Outfit backlog(사용자 별도 지시가 있을 때만 — 자동으로 다음 Phase 가 아니다)**: read-only look-ahead(P12 boundary 를 직접 줄이는 가장 명확한 structural candidate 중 하나지만 no-look-ahead 계약을 바꾸는 **별도 architecture 변경**) · 실제 제작 대본 기반 품질 측정(Phase 10/13 은 합성 fixture 한정) · 무시한 제안이 재실행 때 다시 나오는 문제.
  - ⚠️ **Phase 11 A 식 suppression 프롬프트 튜닝을 반복하지 말 것**(P10/P4 raw omission 회귀). candidate **개수**에 대한 sparsity prior 도 같은 억제 압력이라 넣지 않는다.
  - known limitations(**명시적 우선순위 지시 전까지 착수하지 않음**, 상세는 PHASES.md Phase 9 절): D3 Export `optedIn` 비대칭 · D5/D6 커스텀 표정·의상 속성 해시 충돌. (**D4 `availableExpressions` 후보 누수는 Phase 15 `e9311f3` 에서 해결됨** — 아래 📌 참고.)
- **live audit 운영 주의**: 리포 안에 평문 키 파일(`key.txt` 류)을 만들지 말 것 — 환경변수로만 주입한다(CLAUDE.md 워크플로우). Phase 13 live 원본은 **`audit.local/phase13/`**(gitignore, 커밋 안 함)에 pre-correction·corrected 둘 다 보존돼 있고 `audit.local/out/` 의 Phase 10 산출물은 무수정이다.

## 📌 Phase 15 가 확정한 것 (Expression AI 후보 pool — 깨지 말 것)
- **latest implementation = `e9311f3`** `fix: Expression AI 후보를 실제 의상 렌더 pool과 일치시킴 (Phase 15)`.
- **AI 표정 후보는 화면의 pool 규칙과 같아야 한다**(`availableExpressions`, `src/generators/emotion/resolve.ts`):
  ```
  추가 의상이 **직접 소유한 truthy asset** 이 1개 이상 → 그 의상 소유분만 available
  추가 의상 pool 이 완전히 비었음                      → 기본 의상 pool 재진입
  최종 후보 = effectiveExpressions **선언 순서**로 availability membership filter
  ```
  ⚠️ **`spriteAssetId` 같은 "표정 단위 base 폴백" semantics 를 후보 생성에 다시 쓰지 말 것** — 그게 고친
  버그다(부분 업로드 의상에서 base 전용 표정이 후보로 살아나 실제로는 neutral/pool[0] 로 강등됐다).
  ⚠️ `resolve.ts` 에서 `generate.ts` 를 import 하지 말 것(순환). 후보를 직접 소유분으로 좁히면 import
  없이도 `selectSprite` 결과와 일치한다.
- **후보 0이면 target 제외가 정상이다.** gate 는 `availableExpressions` 출력이 아니라 **`effectiveExpressions`
  교집합 이후**를 본다 — 그 의상이 표현할 수 있으면서 선언된 표정이 하나도 없으면 AI 가 기여할 정보가 0 이다.
  ⇒ **estimate 의 계약은 "before/after 숫자 불변"이 아니라 `execution planner parity`**(같은
  `collectEmotionTargets`/`planEmotionChunks` 를 쓴다). "target 은 항상 불변"이라고 쓰지 말 것.
- **후보 순서의 정본은 `effectiveExpressions(project.expressions)` 선언 순서**이고 반환 Set 은 멤버십
  전용이다 — asset 객체 삽입 순서를 ordering 으로 취급하면 프롬프트 바이트가 새 semantics 를 얻는다.
- **기존 `emotionAuto` 는 소급 변경하지 않는다**(Phase 8 automatic invalidation 금지 유지). 새 규칙으로는
  안 나올 값이어도 자동 삭제·migration 하지 않는다 — 복구는 `clearEmotionAuto`·수동 override 뿐.
- **렌더러는 canonical, 후보가 거기 맞춘다**(단방향). `selectSprite`/`spriteSlots`/`attrFor`·Ren'Py 출력·
  save/load·`.npproj.zip`·schema **전부 무변경**이고 `dump:rpy` 22구성 245파일 diff 0 이다. ⚠️ 그 diff 0 은
  **"기존 project state 에 대해 생성기를 안 건드렸다"**는 뜻이지 **"앞으로의 AI 실행 결과도 같다"가 아니다**
  (새 실행은 후보가 달라져 얼굴이 의도적으로 달라진다).

## 📌 Phase 14 가 확정한 것 (Outfit 동결 — 자동으로 다시 열지 말 것)
- **Outcome B — Outfit AI 를 현재 상태 그대로 실사용 baseline 으로 동결.** production/tests/audit/fixture/프롬프트 변경 **0**, live **0**. 남은 항목은 해결 과제가 아니라 위 🎯 의 **accepted limitation / backlog** 다.
- **`P12-59` 원인 표현의 상한**: raw semantic misclassification 이고 **no-look-ahead window 종단이 가장 강하게 의심되는 structural contributing factor**. `P1`/`P14` in-window 대조는 그 **가중 가능성을 강하게 지지**할 뿐 통제 실험이 아니다 — "boundary 가 유일한 원인"·"prompt semantics 문제가 아니다"로 쓰지 말 것.
- **검토했고 채택하지 않은 fix**: parser `i === scanEnd` reject(chunking **위치 artifact** → 종단의 진짜 전환이 복구 불가 silent FN) · cross-window dedup(신규 시스템) · 화자/문형(P2 와 분리 불가·regex 금지) · **prompt boundary suppression**(보이고 복구 가능한 FP 를 조용한 FN + carry 로 교환). ⇒ *"이번 Phase 에서 안전한 minimal fix 를 발견하지 못했다"* 이지 미래 설계 배제가 아니다.
- **`FIXED_RULE` attribution 정정**: pre·corrected **두 run 모두 `17/1/1`**(FAIL 이 P4→P3 로 이동) ⇒ 그 run pair 의 aggregate delta 는 **0**. `F1 0.872→0.944` 를 `S` 단독 또는 `FIXED_RULE` 단독에 귀속하지 말 것(N1/N4 는 raw 미출력이라 S 효과가 아니다). Phase 13 절 수치는 이력이라 **수정하지 않았다**.

## 📌 Phase 13 이 확정한 것 (다음 Phase 의 baseline — 깨지 말 것)
- **`changes[]` 는 semantic candidate envelope 이고 `kind` 는 binary wire 필드**(`transition`|`non_transition`)다. 파서 **`S` 게이트**가 `non_transition` 만 거른다. **위치가 계약**: `B→C→C2→D→E→F→G→S→seen.add→chronology` — 반환 직전 filter 로 옮기면 거부 행이 뒤 항목의 `G` 전제를 바꾼다.
- **fail-open**: missing·unknown 문자열·wrong type 은 **legacy accept**(모르는 값을 `non_transition` 으로 넘겨짚지 말 것). **정규화 3축 분리**: identity(lowercase 없음) / `kind`(lowercase 후 exact) / `i`(기존 coercion).
- **`kind` 는 parser-local transient** — `OutfitChange`·store·UI·Project·save·`.npproj.zip`·협업·Ren'Py export 전부 무변경.
- **`FIXED_RULE` 은 두 의미를 동시에 지킨다**: fixed 행은 실제 전환이어도 **AI candidate 가 아니고**, 그 뒤의 later completed transition 은 **복귀 여부와 무관하게** 계속 심사한다(후자를 "복귀"로만 좁히면 P4 형 회귀가 재발한다).
- **측정치는 합성 fixture 한정**: corrected PRIMARY `TP/FP/FN 17/1/1 · F1 0.944`(Phase 10 `17/4/1 · 0.872`). **모든 semantic FP 해결도, raw recall 보장도 주장하지 않는다.**

## 📌 Phase 12 가 확정한 것 (Phase 13 구현 계약 — 구현 완료)
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
- **Phase 15 확정 — Expression AI F-1 후보 pool correction(`e9311f3`)**: `availableExpressions` 의 표정 단위 base 폴백을 렌더러(`selectSprite`)의 의상 pool 폴백에 맞춤. production 1파일 + 테스트 3파일. typecheck · vitest 50파일/772 · `dump:rpy` 245파일 diff 0 · 스크래치 빌드 · live 0 · mutation check 8건.
- **Phase 15 docs finalization**: `PHASES.md` Phase 15 확정 절 + 로그 표(14행 상태 정정 포함) · Phase 9 D4 해결 표기 · 이 파일 · `CLAUDE.md` 후보 pool 계약 한 줄.
