# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- **Phase 19 에서 Novel-Agent v1 production baseline 이 확정됐고, 계획된 핵심 개발은 종료됐다**(Outcome A · docs-only). 전 제품 checkpoint 결과·verification·동결 상태의 **정본은 [`PHASES.md`](./PHASES.md) "Phase 19 확정" 절**이다. **v1 frozen production implementation baseline = `931a2cc`**(Phase 16 구현 — Phase 17~19 동안 `src`/`tests`/`scripts` 무변경으로 유지) · **Phase 19 final v1 repository checkpoint = `5902dc8`**. ⚠️ 이후의 **post-v1 correction** 은 이 역사적 baseline 을 재정의하지 않지만, **현재 HEAD 의 `src`/`tests` 트리가 `931a2cc` 와 동일하다는 뜻도 아니다**.
- **정해진 다음 필수 작업은 없다.** ⚠️ **새 blocker 가 없는 한 Phase 20+ 를 만들지 말 것** — backlog 가 존재한다는 사실만으로 Phase 를 추가하지 않는다. ⚠️ 종료의 뜻은 *"영원히 완성"* 이 아니라 **현재 계획된 v1 핵심 개발의 종료**다 — 실제 제작 중 새 blocker 가 나오면 그때 별도로 판단한다.
- **post-v1 번역 개선 로드맵** — ⚠️ **v1 Phase 번호 체계와 섞지 말 것**(별도 축이고, 기존식 Phase 20+ 를 만들지 않는다). 남은 것은 **후보일 뿐**이고 ⚠️ **사용자 지시가 있을 때만 연다**.
  - **Phase 1 ✅ 완료(구현 `78644d5`)** — 번역 누락 탐지 + 누락분만 번역 UX.
  - **Phase 2 ✅ 완료(구현 `567dc67`)** — 원문 ↔ 번역 유효성. 계약·검증·accepted limitation 은 아래 📌 절이 정본.
  - **Phase 3 ✅ 완료** — 번역 품질 QA·의심 번역 탐지. 계약·검증·accepted limitation 은 아래 📌 절이 정본.
  - **Phase 4 ✅ 완료** — QA Review Excel round-trip(의심 번역만 엑셀로 내보내 외부에서 문맥 보고 고친 뒤 되돌려 넣기). 계약·검증은 아래 📌 절이 정본.
    ⚠️ **앱 내부 고품질 재번역은 채택하지 않았다** — 조건부 후보였던 "선택적 고품질 재검수·재번역"은 이 왕복 workflow 로 **대체**됐다. 고품질 모델 tier·AI 대체 번역 제안·auto-fix·대본 전체 context packing 을 앱 안에 다시 만들지 말 것(문맥 교정은 외부 전체 대본 + QA Review Excel 이 담당한다).
  - **Phase 5 ✅ 완료** — QA Review Excel 의 **안 고치고 돌아온 칸**을 사용자 확인 뒤 `문제 없음` 으로 일괄 처리.
    ⚠️ **unchanged 자동 승인이 아니다**(앱은 검수 여부를 모른다 — explicit confirm 이 판단을 만든다). 계약·검증은 아래 📌 절이 정본.
  - adjacent/backlog(위 계약과 섞지 말 것): LeftPanel 키 안내문의 모델 표기 불일치(`gpt-4o-mini` vs 고품질 `gpt-4o`) · "누락만 보기"류 누락 위치 탐색 UX(QA 쪽 의심 위치 탐색은 Phase 3 에서 해결됐고 **이건 별개**다).
  - **deferred / adjacent(Phase 3 조사 중 확인, 이번엔 손대지 않음)**: `baseLocale='en'` 프로젝트가 실제로 지원되는데(`#설정_글언어` 첫 항목 = base, `sceneBuilder.setTextLocales`) 기존 `translate/index.ts` 의 `systemPrompt()` 은 source 를 **"Korean" 으로 하드코딩**한다. Phase 3 QA 는 `sourceLocale` 을 명시적으로 보내 이 문제를 **상속하지 않는다**. generation prompt 수정은 Phase 3 범위 밖이라 보류했고, 실사용에서 문제가 확인되면 **별도 post-v1 correction** 으로 처리한다.
- **post-v1 의상 전환 UX 개선** — ⚠️ 번역 로드맵·v1 Phase 번호와 **다른 축**이다. **Phase 1(구현)·Phase 2(검증·문서) 완료**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 의상 절에도 durable contract 한 줄이 있다.
- **post-v1 대본 한 줄 삭제 UX 개선** — ⚠️ 위 두 축(번역 로드맵·의상 UX)과도 **다른 축**이고 v1 Phase 번호와 섞지 말 것. **Phase 1(구현·검증)·Phase 2(문서) 완료**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 에도 durable contract 가 있다. ⚠️ `item`/`cg`/`bgm` control line 삭제는 **이번 scope 밖**이다(별도 Phase — 사용자 지시가 있을 때만).
  **구현 = `258c637`(장면 카드 수동 의상 전환 UI) · 문서 = `95ba76e`** — 이 둘은 **post-v1 번역 Phase 5 를 시작하기 전에 이미 main 에 있었고** Phase 5 는 이 축을 건드리지 않았다(`SceneCard.tsx` 무수정 · `👗` 패널 실브라우저 smoke 확인). ⚠️ 번역 Phase 5 baseline 을 `76612eb` 로 착각하지 말 것 — 실제 baseline 은 **`95ba76e`** 다.
- **post-v1 장면 중간 CG 종료 / 일반 장면 복귀 UX** — ⚠️ 위 세 축(번역 로드맵·의상 UX·줄 삭제)과도 **다른 축**이고 v1 Phase 번호와 섞지 말 것. **Phase 1(구현·검증)·Phase 2(문서) 완료**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 에도 durable contract 가 있다. ⚠️ **Outfit AI 를 post-CG 구간으로 넓히는 것은 이번 scope 밖**이다(별도 Phase — 사용자 지시가 있을 때만).
- **Expression AI 계약 matrix·evidence 등급의 정본은 [`PHASES.md`](./PHASES.md) "Phase 18 확정" 절**, Outfit 은 "Phase 14 확정" 절이다(둘 다 Phase 19 에서 다시 열지 않았다).
- **v1 비차단 backlog** — 사라진 게 아니라 **v1 production baseline 을 막지 않는 항목**이다. **Phase 19 의 자동 구현 범위가 아니며, 사용자 별도 지시가 있을 때만 다시 연다.**
  - **Expression**: **F-2** 청크 경계를 넘는 연속성 정보 0(러너·`validateEmotionUpdates` 양쪽에 run-local 상태를 흘리는 **설계 변경**) · **F-3** target 수집의 export `optedIn` 비대칭(비용·targeting·UI 노이즈) · 후보 1개뿐인 줄의 호출 생략 · 파서 폐기 건수 미보고 · heuristic negation. **`P16-F2` 시제 denotation 은 backlog 가 아니라 accepted limitation** — ⚠️ **Phase 18/19 에서 prompt tuning 을 재개하지 말 것**(아래 📌 Phase 17).
  - **Outfit**(Phase 14 동결): `P12-59` residual FP · same-input raw emission variability · `N1`/`N4` raw 미출력 은 **accepted limitation**, read-only look-ahead · 실제 제작 대본 기반 품질 측정 · 무시한 제안의 재출현 은 backlog. ⚠️ **blanket boundary suppression**(“window 끝 행은 reject”)·**Phase 11 A 식 suppression 튜닝**·candidate 개수 sparsity prior 를 넣지 말 것.
  - **known limitations**: D3 Export `optedIn` 비대칭 · D5/D6 커스텀 표정·의상 속성 해시 충돌(상세는 PHASES.md Phase 9 절).
- **live audit 운영 주의**: 리포 안에 평문 키 파일(`key.txt` 류)을 만들지 말 것 — 환경변수로만 주입한다(CLAUDE.md 워크플로우). Phase 13 live 원본은 **`audit.local/phase13/`**(gitignore)에 보존돼 있고 `audit.local/out/` 의 Phase 10 산출물은 무수정이다.

## 📌 post-v1 CG 종료 / 일반 장면 복귀가 확정한 것 (`#CG끝` — 깨지 말 것)
> ⚠️ 이 절은 **CG 종료 축**이다(번역 로드맵·의상 UX·줄 삭제·v1 Phase 번호와 같은 축이 아니다).

- **기능**: 대본에 `#CG끝` 한 줄을 적으면 `일반 장면 → CG → 일반 장면` 이 된다. `#CG` 로 켠 CG 를 끄고
  **같은 Scene 의 일반 background** 로 되돌린 뒤 **그때 보여야 할 스프라이트를 즉시 복원**한다.
  ⚠️ **`#CG끝` 은 "다음 대사가 있어야 작동하는" 마커가 아니다 — 마커 그 자체에서 복귀가 완료된다.**
  그래서 `#CG끝 → 대사` · `→ 지문` · `→ 선택지` · `→ 장면 종료` 네 경우 모두 일반 장면 상태가
  **먼저** 확정된다(선택지 화면이 CG 위에 뜨지 않는다).
- **Line 표현은 새 kind 가 아니라 기존 cg Line 의 optional field** 다:
  ```
  종료 마커 : { kind: 'cg', desc: '',    end: true }
  일반 CG   : { kind: 'cg', desc: '...', end: undefined }
  ```
  ⚠️ **`desc === ''` 를 종료 판정으로 쓰지 말 것** — 설명 없는 `#CG` 도 `desc: ''` 를 만든다(정상 시작
  마커). 판정은 **반드시 `end === true`**. 종료 마커는 `Scene.lines` 에만 들어가고
  **`Scene.cg`·`cgAssetIds` 에는 들어가지 않는다**(에셋이 아니라 control marker 다).
- **parser 가 읽는 canonical 대본 문법**이라 `rawInput → parse → Scene.lines(end:true) → save/load →
  재분석` 전 구간에서 유지된다(실측: 재분석 시 병합 미리보기가 "변경 없음"). `#아이템끝` 과 같은
  관용구이고 `applyTag` 에서 **`#CG` 보다 먼저** 매칭한다. 엑셀은 기존 B열 원시 `#` 태그 경로로
  `#CG끝` 을 지원한다. ⚠️ **`CG: 끝` 같은 필드형 문법은 지원하지 않는다**("끝"이라는 이름의 CG 와
  구별할 수 없다 — `FIELD_TAG_MAP` 무변경). ⚠️ **SceneCard 에서 `#CG끝` 을 수동 삽입·삭제하는 UI 는
  만들지 않았다.**
- **신규 pure derived helper 2개**(`src/types/project.ts`, `spriteHiddenFlags`/`outfitFlags` 옆):
  - `hasCgStartMarker(scene)` — 실제 CG **시작** 마커 존재 여부(종료 마커를 start 로 세지 않는다).
    레거시 폴백 판정의 단일 소스이고 세 곳(`cgActiveFlags`·`getFirstEffectiveCgIndex`·생성기)이 공유한다.
  - `cgActiveFlags(scene)` — 각 줄을 처리한 **뒤**의 CG active 상태(`-1` = 일반 장면, `0 이상` =
    `scene.cg` 인덱스). `일반 → CG A → 일반 → CG B → 일반` 다중 구간을 그대로 지원한다.
  ⚠️ **`Scene.cgRanges`·timeline·persistent range state 를 만들지 않았다.**
- ⚠️ **`cgActiveFlags` 와 `getFirstEffectiveCgIndex` 를 합치지 말 것 — semantic 이 다르다.**
  ```
  cgActiveFlags            = 그 줄 시점의 CG active 여부(per-line range 판정)
  getFirstEffectiveCgIndex = 이 Scene 의 최초 CG boundary(1회)
  ```
  대표 edge — `Scene.cg=['legacy']` · `lines[0]=#CG끝` · `lines[1]=dialogue`:
  ```
  cgActiveFlags            = [-1, -1]   (지금은 일반 장면 → 수동 의상 허용)
  getFirstEffectiveCgIndex = 0          (이 장면은 시작부터 CG 였다 → AI writable 0줄)
  ```
  **둘 다 의도된 값**이다. 미래 리팩터에서 `getFirstEffectiveCgIndex = cgActiveFlags.findIndex(...)`
  로 합치면 그 장면에서 **Outfit AI writable 이 장면 전체로 열린다**(하지 않기로 한 확장이 배선
  사고로 일어난다). 테스트가 이 차이 자체를 고정한다.
- **Ren'Py 복원 계약** — `#CG끝` 에서 생성기는 즉시 ① `scene <일반 배경> at vn_bg with dissolve`
  ② CG active 종료 ③ 현재 `hideSprites` 상태 확인 ④ 표시 가능하면 기존 revealed 스프라이트를
  **즉시** 복원 ⑤ generator hidden 상태 동기화. **복원을 다음 대사로 미루지 않는다.**
  복원은 새 snapshot 이 아니라 기존 runtime state(`revealedOrder`·`currentPos`·`lastShown`·`outfitAt`)를
  재사용하고, **기존 `#인물숨김 → #인물표시` 복원과 CG 종료 복원이 generator-local restore helper
  한 벌을 공유**한다(`restoreShownSprites`). ⚠️ **새 snapshot·history·state-machine 을 만들지 않았다.**
  CG 가 안 켜진 상태의 `#CG끝` 은 **배경 문도 안 내는 완전 no-op** 이다.
- **복원값**(전부 기존 계약 승계):
  - **hide** — `hideSprites` 는 **per-character 가 아니라 장면 전체 표시 상태 boolean** 이다. 종료
    시점에 `false` 면 기존 visible 스프라이트를 복원하고, `true` 면 **아무도 복원하지 않는다**(뒤에
    `#인물표시` 로 풀릴 때 같은 helper 가 복원). ⚠️ **per-character hide 모델을 만들지 않았다.**
  - **outfit** — `outfitAt(character, endMarkerIndex)`. CG 구간 중 대본에서 바뀐 **현재 fold 의상**이 반영된다.
  - **expression** — CG 진입 전 마지막으로 **실제 표시됐던** `lastShown.attr`. CG 중 대사만 발생해
    실제로 표시되지 않은 표정은 복원값이 **아니다**(post-CG 재발화 시 그 줄 표정으로 정상 갱신).
  - **position** — 기존 `currentPos`/`revealedOrder`. **CG 중 처음 등장한 화자는 종료 순간 복원되지
    않고** post-CG 첫 발화에서 정상 등장한다.
- **Preview 는 `cgActiveFlags` 하나만 본다**(별도 fold 를 만들지 않는다) — CG 구간엔 스프라이트 표시를
  억제하고 `#CG끝` 부터 일반 배경 + 기존 visible 상태를 복원한다. ⚠️ CG 구간에서 **logical 표정 fold ·
  carried 표시 attr · 위치 누적** 셋 다 건너뛰어야 한다 — 하나라도 빠지면 **CG 중에만 등장한 화자가
  복귀 순간 튀어나온다**(생성기는 안 세운다). 목표는 **`#CG끝` 처리 후 effective scene state 일치**다.
- ⚠️ **의상 경계는 이제 두 정책이 의도적으로 다르다 — 다시 "공유 경계"로 합치지 말 것.**
  ```
  SceneCard 수동 👗 = cgActiveFlags[index] < 0   → CG 이전 허용 · CG 구간 차단 · #CG끝 이후 다시 허용
  Outfit AI         = getFirstEffectiveCgIndex   → 최초 CG 앞까지(기존 그대로)
  ```
  즉 **AI 는 이번 Phase 에서 post-CG 구간을 새 제안 대상으로 삼지 않는다.**
  `planOutfitWindows`·chunking·lead-in·CG sentinel·`apply.ts` **전부 무수정**이다.
- **merge identity 무변경** — 기존 일반 CG 의 키 `cg||<desc>` 는 **byte-for-byte 유지**되고 종료 마커만
  `cg|end|` 로 갈린다. 그래서 설명 없는 `#CG`(`cg||`)와 `#CG끝` 을 구별하면서 기존 CG 줄의 identity 는
  전혀 바뀌지 않는다.
- **persistence(정확한 표현)** — 이번 변경은 **`Line` serialized shape 에 backward-compatible optional
  field `end?: true` 를 추가**한 것이다. 즉 **serialized object shape 는 확장됐지만**
  schema version bump 없음 · migration 없음 · save/load container format 무변경 ·
  `.npproj.zip` container format 무변경이다. 기존 프로젝트엔 `end` 가 없어 그대로 읽히고, 신규
  프로젝트의 `end:true` 는 `.npproj.zip` 왕복에서 보존됨을 테스트로 고정했다.
  ⚠️ **구버전 앱은 `end` 를 이해하지 못하므로 CG 종료 semantics 가 보장되지 않는다** — 크래시 없는
  graceful degradation 만 기대한다(*"항상 orphan no-op"* 이라고 단정하지 말 것: 기존 프로젝트에 설명
  없는 CG 가 있으면 빈 desc 가 그 CG 와 매칭될 수 있다).
- **SceneCard UX** — 종료 마커를 기존 control chip 스타일로 **`🖼 CG 종료`** 로 표시한다(CG 에셋 목록
  `🎴 CG:` 에는 안 들어간다). control line 이라 **줄 삭제 `🗑` 대상도 아니다**. ⚠️ **CG 종료 삽입 버튼·
  삭제 버튼·CG 관리 모달을 만들지 않았다.**
- **검증**: `typecheck` PASS · `vitest` **63파일/1040 tests passed · failed 0**(신규·확장 **+58**).
  고정한 것 = `#CG끝` 텍스트·엑셀 파싱 · `cgActiveFlags` 레거시/orphan/end/다중구간 ·
  `getFirstEffectiveCgIndex` 기존 cutoff 보존 · **레거시 폴백 + 첫 줄 `#CG끝` edge** ·
  생성기 즉시 배경+스프라이트 복원 · **post-CG textual 줄이 없어도 복원** · **`#CG끝` → menu 전에 복원 완료** ·
  hide=true 복원 차단 · CG 중 의상 변화 복원 반영 · inactive `#CG끝` no-op · 다중 CG 구간 ·
  **기존 hide→show 복원 회귀** · 수동 range ↔ AI first-cutoff divergence ·
  **Preview↔Export final effective state parity** · merge identity · `end:true` 왕복.
  `dump:rpy` **23구성 256파일**(신규 `cg-end` 구성 추가) — **기존 22구성 recursive diff 0**
  (`restoreShownSprites` 추출이 기존 출력을 1바이트도 바꾸지 않음을 중간 단계에서 먼저 증명).
  **Ren'Py 8.5.3 lint error 0 · warning 0**(복원 `show` 포함 경로까지).
  실기: **CG 이전 frame == CG 종료 후 frame 이 픽셀 동일(md5 일치)** · **선택지 화면 전에 일반 배경 +
  스프라이트 복원 확인** · traceback/errors.txt 미생성 · 다중 CG 구간.
  실브라우저: 종료 chip · CG 에셋 목록에 종료 마커 미포함 · control line 삭제 버튼 미노출 ·
  **post-CG 수동 `👗` 재활성** · 새로고침 유지 · `.npproj.zip` 실왕복 · **재분석 후 `#CG끝` 생존**.
- ⚠️ **미검증(환경)**: Ren'Py **ZIP 탭 다운로드 전체 경로**는 오프라인이라 폰트 카탈로그(GCS) 대기에서
  확인하지 못했다. `script.rpy` 생성과 실기 실행은 위처럼 확인했고, 이 기능은 `buildZip`·폰트 경로를
  **건드리지 않는다**.
- **알려진 의도된 한계**
  1. Outfit **AI** 는 여전히 첫 CG 이후를 제안 대상으로 쓰지 않는다.
  2. `#CG끝` 뒤에서 다시 가능한 것은 **수동 `👗`** 뿐이다.
  3. `#CG끝` 직후 화자가 말하면 **복원 show + 화자 show 가 연달아** 나갈 수 있다 — 두 문 사이에
     interaction 이 없어 **user-visible 차이는 0**이다(없애려면 look-ahead 가 필요해 채택하지 않았다).
  4. CG 복귀 transition 은 **`dissolve` 고정**이다(설정 노출 없음).
  5. CG 구간에 남은 `Line.outfits` 를 **자동 정리하지 않는다**(기존 정책 승계 — 복원 fold 에는 반영된다).
  6. 구버전 앱에서는 CG 종료 semantics 가 보장되지 않는다.

## 📌 post-v1 대본 한 줄 삭제 UX 가 확정한 것 (수동 line delete — 깨지 말 것)
> ⚠️ 이 절은 **줄 삭제 축**이다(번역 로드맵·의상 UX·v1 Phase 번호와 같은 축이 아니다).

- **기능**: 장면 카드의 줄 액션 맨 끝 `🗑` 로 **대사(dialogue)·지문(narration) 한 줄**을 지운다.
  삭제 전 `window.confirm` 1회(기존 파괴적 UX 관용구 재사용 — 새 모달/ConfirmDialog 를 만들지 않았다).
  ⚠️ **`item`·`cg`·`bgm` 은 버튼 자체가 안 보인다** — 이들은 대사와 달리 **장면 상태 전이 semantics**
  (CG cutoff·`play music` 시작점·`#아이템끝` 짝)를 가져 별도 Phase 대상이다.
- **canonical path 는 새 store 액션 `deleteLine(sceneId, lineIndex)` 하나**다. 계약:
  dialogue/narration 만 허용 · 없는 장면·범위 밖·마커 kind 는 **완전 no-op** ·
  **guard 를 통과한 뒤에만** `invalidateOutfitSuggestions()` · 유효 삭제는 `Scene.lines` 에서 **객체를 실제로 제거** ·
  뒤쪽 index 는 배열 semantics 그대로 당겨진다.
  ⚠️ **UUID·tombstone·soft-delete·undo·index remapping 시스템을 만들지 않았다.**
- **Line-local 데이터는 객체와 함께 자연 소멸**한다 — `i18n`·`emotion`/`emotionAuto`·`outfits`·`hideSprites`·
  `voiceAssetIds` 전부. **필드별 cleanup 시스템을 추가하지 않았다.** 음성 blob 자체는 `deleteLine` 이 지우지 않고
  **기존 고아 에셋 처리**에 맡긴다.
- **line-index state 처리(이번 작업의 핵심 결론)** — "index dependency 가 없다"가 아니라 **축마다 다르다**:
  - **Outfit AI**: 외부 `lineIndex` 기반 제안 state 가 있으므로 **기존 `invalidateOutfitSuggestions()` 정책 재사용**
    (유효 삭제 → 제안 전체 clear + revision 증가). **새 index shift algorithm 없음.**
  - **Expression AI**: `emotion`/`emotionAuto` 가 Line-local 이고 in-flight 결과는 **기존 commit-time validation**
    을 그대로 타므로 **새 invalidation 없음**.
  - **Translation QA**: 캐시를 **직접 clear 하지 않는다**. 기존 content-anchor 검증(`activeQaIssues`)에 맡기고,
    밀린 stale 결과는 현재 줄 내용과 anchor 가 어긋나 활성 결과에서 빠진다.
  - **Voice**: per-line 외부 index state 를 새로 정리하지 않는다 — Line 의 음성 **연결**만 함께 사라지고
    파일 회수는 기존 고아 경로가 담당한다.
- **transient UI positional state 2건을 발견·수정**했다(이번 Phase 의 실제 작업량 대부분):
  - **SceneCard `LineRow`**: 기존 `key={i}` 로는 앞줄 삭제 후 뒤 row 의 `editing`·`voiceOpen`·`outfitOpen` 이
    **다른 줄로 이월**됐다. 지금은 **줄 수가 바뀌는 구조 변경에서 remount** 되도록 key 를 구성해 패널이 닫힌다.
    ⚠️ **text/content 기반 key 가 아니다**(타이핑마다 remount·포커스 손실) · **일반 텍스트·표정·의상 변경에선 remount 되지 않는다**.
  - **`ScenePlayer`**: 기존 step reset 이 `scene.id` 만 봐서 **같은 장면 안의** 앞줄 삭제 때 같은 step 이 다른 줄을
    가리켰다(렌더 clamp 는 범위만 막는다). 지금은 `scene.lines.length` 변화도 reset 조건에 포함한다.
    ⚠️ **index remapping 은 하지 않는다**(구조가 바뀌면 처음으로 돌린다).
- **rawInput / 재분석 계약(헷갈리기 쉬운 지점)**: `deleteLine` 은 **`Scene.lines` 만** 고치고 **`project.rawInput` 은
  건드리지 않는다**. 그래서 앱에서 지우면 save/load·`.npproj.zip`·Ren'Py 출력엔 반영되지만, **같은 원본으로 다시 분석하면
  원본에 남아 있는 줄은 되살아난다**. 이건 결함이 아니라 기존 줄 편집(`setLineText` 등)과 **같은 source/parsed-data 계약**을
  승계한 것이다 — tombstone·파서 역방향 writer 를 만들지 않았다(실브라우저에서 `rawInput` 보존을 실측).
- **무변경 축**: Ren'Py generator · parser · Project schema/migration · save/load format · `.npproj.zip` format ·
  협업 format **전부 변경 없음**. Ren'Py 는 canonical `Scene.lines` 를 기존대로 소비해 삭제된 줄만 출력에서 빠진다.
  Preview 도 core architecture 는 그대로고 **`ScenePlayer.step` reset dependency 만** 최소 수정했다.
- **검증**: `typecheck` PASS · `vitest` **58파일/982 tests passed · failed 0**(신규 `tests/line-delete.test.ts` 16 tests).
  신규 테스트가 고정하는 것 = 가운데 대사·지문 삭제와 index shift · Line-local 자연 제거 + 이웃 보존 ·
  Outfit 제안 invalidate 정책 · **QA 캐시 무조치 + stale 배제** · 첫/마지막/유일 줄 경계 · **`rawInput` unchanged** ·
  **무효 삭제(없는 장면·범위 밖·item·cg·bgm)가 제안·revision 까지 완전 no-op**(= guard 가 invalidate 보다 먼저).
  실브라우저 smoke(스크래치 outDir 빌드 + preview, 번들에 변경 반영됐는지 grep 선확인): confirm 취소/삭제 ·
  새로고침 유지 · Ren'Py 탭 출력 반영 · **LineRow 패널 이월 없음** · **Preview step reset(`3/3` → 삭제 → `1/2`)** ·
  일반 타이핑에서 remount·포커스 회귀 없음(`sameNode` 확인) · control line 에 버튼 미노출 · `rawInput` 에 삭제 줄 유지.
- **알려진 의도된 한계**: ① 원본에 줄이 남아 있으면 재분석 때 되살아난다 ② `item`/`cg`/`bgm` 삭제는 이번 scope 밖
  ③ 길이가 같은 복합 구조 변경(삭제+추가 동시)에서는 length 기반 LineRow reset 이 안 걸릴 수 있다 — **단일 줄 삭제 경로엔
  해당 없음**(기존 동작과 동일이라 회귀 아님) ④ Preview 는 줄 수가 바뀌면 현재 위치를 보정하지 않고 **처음으로** 돌린다.
  ⑤ (기존 QA architecture 의 일반 한계) 인접한 두 줄의 화자·원문·번역이 **완전히 동일**하면 QA anchor 가 여전히 맞아
  경고가 옆 줄에 붙을 수 있다.

## 📌 post-v1 의상 전환 UX 개선이 확정한 것 (수동 line outfit — 깨지 말 것)
> ⚠️ 이 절은 **의상 UX 축**이다(번역 로드맵·v1 Phase 번호와 같은 축이 아니다).

- **새 의상 전환 시스템을 만들지 않았다** — 이미 있던 `Line.outfits` 시스템에 **수동 add/change 진입점만** 없었다.
  값은 `Line.outfits`, 쓰기는 `setLineOutfit`(→ `patchLineOutfit` → `mergeLineOutfit`) **하나뿐**이라
  수동 지정과 수락된 AI 제안이 canonical 에서 **구별되지 않는다**(수동 전용 state·mutation 금지).
- **저장 index = `👗` 를 누른 바로 그 줄**, 의미는 파서 `#복장`·AI 와 동일한 **"이 줄부터"**.
  패널이 시각적으로 줄 아래 펼쳐져도 다음 줄에 쓰지 않는다(off-by-one 금지).
- **CG cutoff 는 `getFirstEffectiveCgIndex` 를 AI 와 공유**한다. 파생 조건 하나(`manualOutfitWritable`)를
  **진입 버튼과 열린 패널 양쪽에** 걸어, 패널을 열어둔 뒤 cutoff 가 앞으로 와도 다음 렌더에서 mutation 이 막힌다.
  ⚠️ **기존 값의 해제(`✕`)는 cutoff 와 무관하게 계속 허용**한다(남은 값을 정리할 유일한 경로 · 자동 정리 없음).
- **캐릭터 후보는 기존 `outfitChars`**(장면 시작 의상 selector 와 같은 목록), 의상 후보는 `characterOutfits`.
  수동 picker 전용 character resolution 을 만들지 않았고 AI `collectOutfitTargets` 와도 결합하지 않았다.
- **의상 캐릭터가 0인 장면은 `👗` 자체가 안 보인다** — 의상을 안 쓰는 프로젝트는 화면이 그대로다.
- ⚠️ **same-effective-outfit 지정은 별도 validation 을 두지 않아 가능하다** — 현재 `Line.outfits` semantics 를 따르는
  **accepted limitation** 이지 보장하는 기능이 아니다. UX 문제가 실제로 확인되기 전엔 정책을 만들지 않는다.
- **재분석 계약은 기존 `mergeScenes` 그대로**(실측): 원본 대본에 `#복장` 이 있는 줄은 재분석 때 **대본 값으로 되돌아가고**,
  태그가 없는 줄의 수동 값은 **유지**된다(`next.outfits ?? prev.outfits`). 버그가 아니라 source-of-truth 계약이다.
- **검증**: typecheck · vitest **57파일/936**(기존 회귀 0 · 신규 2 case 는 기존 `outfit-store.test.ts` O26 에 추가) ·
  스크래치 outDir 빌드 · **`dump:rpy` 22구성 245파일 diff 0** · 실브라우저(추가/변경/해제 · 지문 줄 · 비화자 줄 ·
  같은 줄 2캐릭터 보존 · CG 이후 차단+이유+`✕` 유지 · AI 제안 존재 시 기존 계약대로 전체 clear 1회 ·
  새로고침 유지 · `.npproj.zip` 실왕복 · 1280/1536px 레이아웃 · 의상 0 프로젝트에서 미표시).
  Preview 는 스프라이트 픽셀 샘플링으로 **그 줄부터** 바뀌는 것을 확인했고, Ren'Py 는 브라우저에서 뽑은 실제 project 로
  `generateRenpyFiles`(= ZIP 이 쓰는 그 함수)를 돌려 `show <의상attr>` 과 비화자 동기화 show 를 확인했다.
- ⚠️ **미검증(환경)**: Ren'Py **ZIP 탭 다운로드 전체 경로**는 오프라인이라 폰트 카탈로그(GCS) 대기에서 멈춰 확인하지 못했다.
  `script.rpy` 생성 자체는 위처럼 확인했고, 이 기능은 `buildZip`·폰트 경로를 **건드리지 않는다**.

## 📌 post-v1 번역 Phase 5 가 확정한 것 (QA Excel unchanged → manual OK — 깨지 말 것)
> ⚠️ 이 절도 **post-v1 번역 로드맵의 Phase 5** 다(v1 Phase 번호와 같은 축이 아니다).

- **Phase 4 가 되돌려주지 못하던 절반을 채운다** — 외부 검수자가 **고친** 칸은 Phase 4 가 canonical 로
  반영하지만, **"원래 번역이 맞다"고 판단해 그대로 둔** 칸은 앱에서 `문제 없음` 을 손으로 다시 눌러야 했다
  (실사용: flagged 158칸 중 105 수정 / **53 무수정** → 53건이 의심 목록에 그대로 남음).
- ⚠️ **unchanged 는 "검수 완료"의 증거가 아니다** — 앱은 검수 provenance 를 모른다(파일을 열어보지도 않고
  그대로 다시 넣어도 unchanged 다). 그래서 analyzer 가 내는 건 **eligibility 뿐**이고, manual 판단은
  **사용자의 명시적 confirm** 이 만든다. ⚠️ 자동 승인 금지 · UI 문구에 "검수 완료"라고 단정하지 말 것.
- **workbook 은 v1 그대로**(새 열·시트·marker·버전 **0**) — 기존 hidden metadata 가 이미 anchor 8필드를
  담고 있어 **세션 QA 캐시 없이도** 복원된다(내보내고 앱을 껐다 켠 다음 날 반영이 정상 경로).
- **analyzer 출력이 두 축이 됐다**(`analyzeQaWorkbook`, Phase 4 판정 순서·집계는 무변경):
  ```
  candidates         = 고쳐 온 칸   → 기존 Phase 4 canonical correction
  manualOkCandidates = 안 고친 칸   → "문제 없음" eligibility (TranslationQaAnchor[])
  ```
  `text === snapshot` 하나로 갈리므로 **상호배타**다. manual OK 자격은 **flagged · metadata strict ·
  duplicate 아님 · 원문 열 일치 · strict text cell · exact unchanged · blank/공백 아님 · 현재 project
  exact-valid** 전부를 만족해야 하고, 이 조건들은 **기존 pass 위치에서 그대로 나온다**(새 validity 술어 0).
  anchor 정의는 `anchorOf` 하나를 changed·unchanged 두 경로가 공유한다.
- ⚠️ **`counts.unchanged` 의 Phase 4 의미를 바꾸지 않았다**(blank·stale 인 unchanged 도 계속 포함).
  빈/공백 칸은 **후보에서만** 빠지고 `counts.blank` 로 옮기지 않는다. ⚠️ **`unchanged − manualOk` 에
  의미를 부여하지 말 것** — 그 차이엔 unchanged-but-stale 과 unchanged-but-blank 가 섞여 있어
  stale 전용 숫자가 아니다(UI 도 두 숫자를 따로 보여줄 뿐이다). `counts.stale` 정의도 그대로다.
- **store 는 액션 하나만 추가**(`applyQaWorkbookManualOk`, scriptSlice) — **`applyQaWorkbook` 은 무수정**.
  같은 doc 을 받아 **커밋 시점 현재 project 로 재분석**하고(preview 를 넘겨받지 않는다), 결과는
  `dismissQaIssue` 와 **정확히 같은 shape**(`verdict:'ok'`·`origin:'manual'`, category·reason·model 없음)이라
  기존 재실행 skip(`shouldSkipCell`)·pending precedence(`manualByCell`)·`compactQaResults` 가 그대로 걸린다.
  쓰기는 칸 수와 무관하게 **functional set 1회**(`upsertQaResults` 가 이미 배열 batch 다 — 새 primitive 금지),
  후보 0이면 캐시를 아예 안 건드리고 `{ committed: 0 }`. ⚠️ 반환에 **`skipped` 를 만들지 말 것**
  (stale·blank·non-flagged·badMeta·duplicate 는 denominator 가 달라 한 숫자로 못 섞는다).
  ⚠️ canonical(`setScenes`/`autoSave`)·collab·persistence·`clearTranslationQa`·자동 QA 재실행 **전부 없다**.
- **UI 는 확인창 2개가 독립**이다(`onQaFile`) — canonical 취소가 **handler 전체를 return 하지 않는다**
  (기존 `if (!ok) return;` 을 분기 변수로 바꿨다). 네 조합이 전부 의미를 갖는다:
  `YES/YES`(둘 다) · `YES/NO`(canonical 만, **rollback 없음**) · **`NO/YES`(canonical 무변경 + manual 만)** ·
  `NO/NO`(무변경). canonical 0·manual>0 이면 confirm #1 을 **생략**하고, canonical>0·manual 0 이면
  **기존 Phase 4 UX 그대로**(정보 줄도 안 붙는다), 둘 다 0이면 기존 no-candidate toast 다.
  적용 건수 표시는 preview 가 아니라 **store 의 `committed`** 를 쓴다. `qaIo`·catch·finally 는 무변경.
- **manual OK 는 Phase 3 과 같은 session-only 다** — Project schema·localStorage·`.npproj.zip`·협업
  **어디에도 안 실린다**(실측: archive 는 `project.json` 하나뿐이고 QA 키 0 · `Line` 키는
  `kind/speaker/text/i18n` 그대로 · localStorage 에도 QA 문자열 0). **fresh session 에서 복원되지 않는다**
  — 실측으로 이전 세션에서 manual OK 한 3칸이 새 세션 견적에서 **다시 검수 대상 4칸**으로 잡혔다.
  ⚠️ same-runtime project 교체(`importProject`/`resetAll`/`applyRemoteProject`)는 **Phase 3 동작 그대로**다:
  `translationQa` 를 명시적으로 clear 하지 **않고**(셋 다 `invalidateOutfitSuggestions` 만 부른다),
  anchor 가 같으면 ephemeral 결과가 계속 유효하고 달라지면 `activeQaIssues`/`isQaResultValid` 가 걸러낸 뒤
  기존 `compactQaResults` 가 치운다. **Phase 5 에서 이 정책을 새로 만들지 않았다.**
- **검증**: typecheck · vitest **57파일/966**(기존 954 회귀 0 · 신규 30 = analyzer 18 + store 12) ·
  스크래치 outDir 빌드(xlsx 는 여전히 **동적 chunk 분리**, 자산 해시 4개 동일) ·
  **`dump:rpy` 22구성 245파일 — clean HEAD `95ba76e` worktree 대비 recursive diff 0**(집계 해시 동일) ·
  일반 Excel 회귀(`parseExcel`/`sceneBuilder` 무수정 · parser/excel/merge 69 tests) ·
  실브라우저(4-way confirm 전 조합 · manual-only · opt-out · canonical 왕복 · `.npproj.zip` 실왕복 ·
  fresh session 재검수 · Preview 렌더 · 의상 전환 `👗` 패널).
- ⚠️ **accepted limitations(과장하지 말 것)**
  - **"검수했다"는 주장을 검증할 수 없다** — 방어선은 confirm #2 의 explicit opt-in **하나**이고
    그 이상의 provenance(서명·편집 흔적·타임스탬프)는 만들지 않는다. 위협 모델은 계속 **non-adversarial**.
  - manual OK 는 새로고침이면 사라진다 — 복구 경로는 **그 엑셀을 다시 import** 하는 것뿐이다.
  - Line UUID 가 없어, 완전히 동일한 semantic input 을 가진 두 줄의 rare ambiguity 는 Phase 3·4 와
    똑같이 남고 same-runtime project 교체 경로에도 같은 형태로 존재한다(고치지 않는다).

## 📌 post-v1 번역 Phase 4 가 확정한 것 (QA Review Excel round-trip — 깨지 말 것)
> ⚠️ 이 절도 **post-v1 번역 로드맵의 Phase 4** 다(v1 Phase 번호와 같은 축이 아니다).

- **구현 = `6d7c1cb`** `feat: QA Review Excel round-trip 추가`(production 5 + tests 2).
- **Phase 3 이 표시한 의심 번역을 앱 안에서 AI 로 고치지 않는다** — 좁은 전용 엑셀로 내보내고,
  외부에서 **전체 대본 문맥과 함께** 고친 파일을 다시 읽어 **안전한 칸만** 반영한다.
- **workbook 포맷**(`src/generators/translate/qaWorkbook.ts` 단일 소스, 일반 대본 엑셀과 **별개 좁은 포맷**):
  - 보이는 열은 **언어 고정** `A 한국어 · B 영어 · C 일본어`(source/target 순서가 아니다).
    `D 검수 대상` 은 **표시 전용** — importer 는 읽지 않는다(지우거나 고쳐도 적용 권한이 안 바뀐다).
  - 적용 권한(flagged locale)의 **authority 는 숨은 metadata(E열 + `_naqa` 시트) 뿐**이고,
    **export 당시 검수 대상이던 로케일만** 고칠 수 있다. 나머지 칸은 context-only 라 무시된다.
  - 행1 헤더 5칸은 **structural contract** 다(exact 대조 — 영어/일본어 열을 통째로 바꿔치기한 파일을 여기서 막는다).
    ⚠️ 헤더 이름으로 **동적 column mapping** 을 만들지 말 것.
  - **현재 `translationQa` 캐시 없이도 import 된다**(내보내고 앱을 껐다 켠 다음 날 반영하는 게 정상 경로).
- **안전 규칙**(전부 테스트가 지킨다):
  - anchor 는 `source·target·speaker·narration` **exact** 비교이고 정본은 기존 **`isQaResultValid` 하나**다(새 술어 금지).
  - 비교에 **`trim` 을 끼우지 않는다**(`"Hello "`→`"Hello!"` 가 stale 로 오판된다). trim 은 빈칸 판정에만 쓴다.
  - 빈칸·공백만 남긴 칸은 **삭제가 아니라 무시**다(번역 삭제는 앱 UI 담당).
  - 수식·숫자·불리언·날짜 셀은 **번역으로 적용하지 않는다**(`String()` 강제 변환 금지 — 전용 strict text cell reader 사용).
  - 행 metadata 는 **fail-closed** — 필드 하나만 어긋나도 그 행 전체 폐기. 특히 `f`(권한)는 **부분 복구하지 않는다**.
  - 같은 줄을 가리키는 정상 metadata 가 둘이면 **last-wins 가 아니라 둘 다 폐기**한다.
  - 원문 열이 metadata 스냅샷과 다르면 **그 행을 통째로 건너뛴다**(숨은 열을 뺀 부분 정렬로 metadata 가 다른 줄에 붙는 사고 방어).
    ⚠️ 행 전체(A:E)를 함께 옮기는 재정렬은 안전하지만, **원문이 완전히 같은 두 줄끼리 뒤바뀐 경우는 구별할 수 없다**(accepted limitation — UUID/hash 를 만들지 않는다).
  - stale·빈칸·손상 행이 섞여 있어도 **valid candidate 는 그대로 적용**한다(run 전체 취소 금지). 전체 거절은 **구조 오류**뿐.
- **적용(`applyQaWorkbook`, scriptSlice)**: 호출 시점의 **현재 project 로 다시 분석**하고(화면 preview 결과를 넘겨받지 않는다),
  기존 `applyTranslationUpdates` 로 **`setScenes` 1회** 커밋한다(칸이 120개여도 1회 · per-cell setter 없음).
  candidate 가 0이면 canonical 을 아예 건드리지 않는다. ⚠️ `translationQa` 캐시를 **직접 지우지 않는다** —
  고친 칸의 경고는 anchor 불일치로 저절로 빠지고 안 고친 칸은 남는다. **자동 QA 재실행도 없다.**
- **persistence 무변경**: Project schema · localStorage · `.npproj.zip` 포맷 **그대로**이고 workbook metadata 는 **어디에도 저장되지 않는다**(적용 결과는 평범한 `Line.i18n` 값 변경일 뿐).
- **오용 가드**: 대본 엑셀 업로드(LeftPanel)에 QA 파일을 넣으면 `_naqa` **표식 하나만** 보고 막는다
  (시트명·헤더·파일명 휴리스틱 금지). `parseExcel.ts`/`sceneBuilder.ts` 는 **무변경** — 일반 대본 파서와 semantic 을 공유·확장하지 않는다.
- **최종 검증**: typecheck · vitest **57파일/934**(기존 회귀 0) · 스크래치 outDir 빌드 ·
  **`dump:rpy` 22구성 245파일, clean HEAD 대비 recursive diff 0**(집계 해시 동일) ·
  **openpyxl 실왕복 PASS**(외부 편집 후에도 숨은 열·`_naqa`·표식/버전 보존, flagged EN 만 반영·context JA 무시) ·
  실브라우저(내보내기→외부 수정→반영→`tl/english/script.rpy` 에 새 번역 반영·JA 는 원값 유지 · 취소 무변경 ·
  stale 재반영 시 no-op · 새로고침 유지 · `.npproj.zip` 왕복 유지 · 대본 업로드 오용 가드 · 1280/1536px 헤더).
- ⚠️ **과장하지 말 것**: openpyxl 왕복은 **이번에 확인한 사실**이지 "모든 엑셀 도구·모든 버전과 영구 호환"이 아니다.
  숨은 metadata 를 **문법적으로 멀쩡하게 위조**한 경우는 탐지 대상이 아니다(위협 모델은 non-adversarial 왕복 — HMAC/서명을 만들지 않는다).

## 📌 post-v1 번역 Phase 3 이 확정한 것 (번역 품질 QA — 깨지 말 것)
> ⚠️ 이 절도 **post-v1 번역 로드맵의 Phase 3** 이다(v1 Phase 번호와 같은 축이 아니다).

- **구현 = `89d2953`** `feat: 번역 품질 QA 및 의심 번역 검수 추가`(production 9 + tests 3).
- **다루는 문제가 Phase 1·2 와 다르다**: Phase 1 은 *번역 없음*, Phase 2 는 *새로 생기는 stale* 이다.
  Phase 3 은 **값이 있고 현재 원문과도 연결돼 있는데 의미가 의심되는** 칸을 검수 대상으로 표시한다.
  ⚠️ 결과는 **"오류 확정"이 아니라 "검토 필요"** 다 — 자동 overwrite·자동 재번역은 없다.
- **deterministic 은 copy-through rule 하나뿐**(`detectCopyThrough`):
  `sourceLocale==='ko'` ∧ `targetLocale∈{en,ja}` ∧ `target.trim()===source.trim()` ∧ 원문에 한글 음절.
  known FP = 고유명사만으로 된 줄 · 효과음 · 의도적 원어 유지(사용자가 "문제 없음"으로 종료).
  ⚠️ **두 번째 heuristic 을 추가하지 말 것** — 길이·문장부호·"한글 포함"·중복 번역은 FP 가 커서 전부 기각했고,
  이 rule 을 generic language-heuristic framework 로 키우는 건 이 rule 의 확장이 아니라 새 Phase 의 판단이다.
- **AI reviewer 는 로케일 칸 단위**다. 입력은 `source`·`sourceLocale`·`target`·`targetLocale`·`speaker`·
  `narration` 뿐이고 **주변 문맥을 싣지 않는다**(문맥을 넣으면 "문맥이 바뀌었는가"까지 anchor 로 검증해야 해서
  표정 `requestKey` 급 복잡도가 따라온다). 분류는 `meaning|omission|addition|language` 4개이고
  **style·naturalness 는 review 대상이 아니다**. 확신이 낮으면 `ok`, **대체 번역은 출력도 적용도 하지 않는다**.
  모델은 `translateModelFor(translateModeOf(project))` — QA 전용 모델 설정을 만들지 않는다.
- **파서 경계**: 요청-local `i` 는 그 요청의 target 만 인정하고(유령 응답 폐기), **중복 `i` 는 last-wins 가
  아니라 그 항목만 unreviewed** 다(⚠️ `parseEmotionResponse` 의 semantic 을 복사하지 말 것 — `review` 뒤에
  `ok` 가 오면 review 신호가 조용히 사라진다). `v` 누락·unknown 도 `ok` 로 넘겨짚지 않고 unreviewed,
  반대로 `c` 가 unknown 이면 **판정은 살리고 분류만 비운다**.
- **QA 결과는 session-only** 다 — Project·localStorage·`.npproj.zip`·협업 어디에도 안 실린다(Outfit 제안과 같은 등급).
  anchor 는 **source+target exact** 비교다. ⚠️ Phase 2 의 `sameLooseText` 를 쓰지 않는다 — 그쪽은 만들어진
  *산출물*을 표기 편집에서 지키는 게 목적이고, 이쪽은 그 두 문자열에 대한 *transient 판단*이라 엄격한 게 안전하다.
- **캐시 재사용 규칙**: `rule`·`manual` 은 reviewer 모델과 무관하게 유지, **`ai` 는 같은 모델일 때만** 재사용한다
  (fast→quality 로 바꾸면 mini 판정은 다시 검수된다). `model` 은 session-only QA metadata 이지
  persistent translation version/hash 가 아니다.
- **사람의 판단이 pending 자동 판정보다 우선한다** — 실행 중 사용자가 "문제 없음"(`origin:'manual'`)으로
  확정한 칸은 뒤늦게 도착한 rule·AI 결과가 **덮지 않는다**(Phase 2 가 pending 중 사람이 채운 번역 칸을
  덮지 않는 것과 같은 user-intent precedence). 보호 대상은 **manual 뿐**이고, 그 사이 번역이 바뀐
  stale manual 은 보호하지 않는다(exact anchor 일치일 때만).
- **stale 은 무효화 배선이 아니라 판정으로 처리한다** — 표시는 `activeQaIssues`(render-time), 커밋은
  `isQaResultValid` + 실행 시작·커밋 양쪽의 `compactQaResults`. ⚠️ global revision epoch·Line UUID·
  translation hash/version·persistent QA metadata·`Scene.status` 자동 변경 **전부 없다**.
  ⚠️ UI 에서 `setLineTranslation` 뒤에 `clearTranslationQa` 같은 걸 부르지 말 것(다른 칸의 유효 결과까지 날아간다).
- **규칙 결과는 AI 가용성과 독립이다** — AI 대상이 0이면 **키를 확인하지도 않고**, 키가 없거나 요청이 실패해도
  이미 확정된 규칙 결과와 이미 성공한 AI 결과는 커밋된다(run 전체 폐기 금지). ⚠️ UI 에서 키 유무로 QA 실행을
  막지 말 것.
- **UX**: `🔍 번역 QA`(증분) · `↺ 전체 재검수` · 전체 의심 카운트 · SceneCard 헤더 `⚠ N` · 로케일 칸별 경고+이유 ·
  `문제 없음`. ⚠️ **전체 재검수는 confirm 전에 캐시를 지우지 않는다**(취소했는데 기록이 사라지면 안 된다)
  — confirm 후 `clearTranslationQa()` → 기존 실행 flow. 견적도 **빈 캐시 기준**이라야 실제 실행과 맞는다.
  ⚠️ **busy 중 실행·전체 재검수 버튼 disable 은 UX 가 아니라 store concurrency 경계**다(스토어에 동시 실행
  방어가 없다 — 의도적). 진행률 단위는 **장면이 아니라 AI 요청**이다.
- **카운트 클릭 = 다음 의심 장면으로 이동**(끝이면 wrap). 기준점은 기존 `selectedSceneId` 이고 **새 QA cursor
  state 를 만들지 않는다**. 스크롤은 RightPanel 에 있던 검증된 루틴을 `components/sceneJump.ts` 로 **그대로**
  옮긴 것이다(⚠️ 알고리즘·재시도 프레임 수·타이밍을 손대지 말 것 — content-visibility 환경 실측값).
  이동은 **장면 카드까지만**이다(로케일 입력 focus·issue navigator 를 만들지 않는다).
- **검증**: typecheck · vitest **55파일/880**(기존 회귀 0) · 스크래치 outDir 빌드 ·
  **`dump:rpy` 22구성 245파일 clean HEAD `39a39c8` 대비 diff 0**(집계 해시도 일치) ·
  실브라우저 시나리오(실행·confirm·진행률·문제 없음·번역 수정 후 자동 소멸·전체 재검수 취소/확정·
  mode off·규칙 전용 no-key·RightPanel 리모컨 회귀·의심 카운트 next/wrap 이동).
- ⚠️ **accepted limitations(과장하지 말 것)**
  - 주변 문맥을 안 보내므로 **대명사 선행사·장면 전체 문체 일관성·화자 간 반응 정합성은 검출 대상이 아니다**.
  - copy-through 는 고유명사·효과음·의도적 원어 유지에서 **FP 가 가능하다**(precision 을 우선했을 뿐 0 이 아니다).
  - stable Line UUID 가 없어, 구조 편집 뒤 **완전히 동일한 semantic input** 의 줄이 같은 좌표를 차지하면
    구별할 수 없는 rare ambiguity 가 남는다. 특히 **manual dismissal 은 같은 사용자 판단이라고 엄밀히
    보장할 수 없다**(rule·ai 는 읽은 입력이 문자 단위로 같아 위험이 낮다).
  - 줄을 삽입하면 **그 장면의 이후 캐시가 miss** 되어 재검수 비용이 생긴다(다른 장면은 영향 없음).
  - reviewer 가 generator 와 **같은 모델 계열**이라 같은 종류의 semantic 오해를 공유할 수 있다.
  - QA 결과는 **오류 판정이 아니라 사용자 검수 후보**다.
- ⚠️ **실 API 품질 측정은 하지 않았다** — 응답은 전부 stub 이고 고정한 것은 wire/workflow 계약이다.
  *"QA 가 오역을 N% 잡는다"* 류로 인용하지 말 것.

## 📌 post-v1 번역 Phase 2 가 확정한 것 (원문 ↔ 번역 유효성 — 깨지 말 것)
> ⚠️ 아래 📌 Phase 8~19 는 **v1 Phase 번호**다. 이 절은 **post-v1 번역 로드맵의 Phase 2** 이고 같은 축이 아니다.

- **구현 = `567dc67`** `fix: 원문 변경 및 번역 race의 stale 커밋 방지`(production 4 + tests 2).
- **핵심 불변식: `Line.i18n` 은 그 줄의 *현재* KO 원문에 대한 번역일 때만 유효하다.** 종속을 강제하는
  지점이 재분석 병합 한 곳뿐이라 나머지 두 경로가 `(sceneId, lineIndex)` 좌표만 믿던 것이 원인이었다.
- **동치 관계는 하나다** — `sameLooseText(a, b)`(`src/project/mergeScenes.ts`, 병합 `loosePronKey` 의 정규식을
  그대로 공유). **엑셀 병합 · 앱 직접 편집 · 자동 번역 커밋 세 경로가 같은 답을 낸다.**
  ⚠️ 두 번째 구현을 만들거나 `Line` 을 받는 범용 identity 추상으로 키우지 말 것(kind·화자 비교는 필요한 호출측만 한다).
- **manual(`setLineText`)**: 공백·문장부호만 바뀐 편집은 번역 **유지**, loose-equivalent 가 아닌 의미 변경은
  **원문을 쓰는 같은 state update 안에서** `i18n` 제거 + 1회 고지. `emotionAuto`·`voiceAssetIds` 는 무변경.
  ⚠️ **편집 종료(완료 버튼) 시점으로 미루지 말 것** — 이 액션은 키 입력마다 autoSave(localStorage·협업
  push)를 태우므로, 미루면 "새 원문 + 옛 번역"이 저장·전송·내보내기를 통과하는 시간창이 생긴다.
  그 창을 없애는 대신 **오타 왕복으로 손댄 번역이 사라지는 UX 비용**을 감수했다(편집 세션 복원안은 이월).
- **async(`autoTranslateAll`)**: 요청 시점 anchor(`ko`·`speaker`·`narration`)를 그대로 들고 가 커밋 직전
  현재 줄과 대조한다. 장면·줄 소실 · kind/지문 변화 · 화자 변화 · 원문 불일치는 **그 항목만** skip 하고
  **run 전체를 폐기하지 않는다**(dense·유료). 쓰기 base 는 **현재 `project.scenes`**, 검증~`setScenes` 사이
  **`await` 금지**. 검증은 **pending 을 바깥 루프로 도는 2-pass** — 현재 scenes 를 map 하며 `updates.get(i)`
  를 보는 구조로 되돌리면 **index 가 사라진 결과는 방문조차 못 해 조용히 유실**된다.
- **Phase 1 selective 계약의 async 확장**: pending 중 사람이 채운 로케일은 AI 가 **덮지 않고**, 같은 줄의
  아직 빈 로케일만 커밋한다 — **줄 단위가 아니라 로케일 칸 단위** partial commit / non-overwrite.
- **완료 보고도 로케일 칸 단위**(`committed`/`skipped`). stale·소실·수동 선점으로 커밋되지 않은 AI 결과를
  **조용한 성공으로 보고하지 않는다**(예전 `done` 은 응답 시점 집계라 전건 성공처럼 보였다).
- **새 persistent identity 시스템은 도입하지 않았다** — Line UUID · translation source hash/version ·
  global revision epoch · 표정 `requestKey` 복제 · schema migration **전부 없음**.
  ⚠️ 특히 `requestKey`(요청 원문 전체 비교)를 번역에 들여오지 말 것 — 번역 payload 엔 문맥 전용 줄이
  없어서 무관한 한 글자 편집이 40줄 청크를 통째로 폐기한다(토큰 재과금).
- **검증**: typecheck · vitest **52파일/796**(기존 회귀 0) · `dump:rpy` **22구성 245파일 diff 0** · 스크래치
  outDir 빌드. 고정된 regression: 의미 편집→제거 / 문장부호·공백 편집→유지 / async 원문 stale→skip /
  줄 삽입→엉뚱한 줄 무오염 / target index 소실→skipped 집계 / pending 중 수동 EN→EN 보존 + 남은 로케일만
  커밋 / 같은 KO 화자 변경→skip / 대사↔지문 변경→skip / pending 중 문장부호만 편집→정상 커밋 /
  엑셀 병합 loose i18n 승계 parity.
- ⚠️ **mutation 실측**: 새 가드는 각각 확인됐으나 **kind/지문 검사는 화자 검사에 대해 구조적으로 중복**이라
  단독으로 kill 되지 않는다(narration 의 화자 파생값이 항상 `undefined` 라 화자 검사가 먼저 잡는다).
  production bug 가 아니며, **테스트 가능하게 만들려고 구조를 바꾸지 말 것**(코드 주석에 명시돼 있다).
- ⚠️ **accepted limitation — 소급 정리는 하지 않는다**: Phase 2 는 **구현 이후의 write path** 만 보장한다.
  fix 이전에 이미 저장된 stale `i18n` 은 **자동 탐지·정리하지 않는다** — 기존 project 에는 그 번역이 어느
  KO 원문에서 나왔는지 판별할 provenance/hash 가 없다. 이걸 해결하려고 persistent hash · translation
  version · Line UUID · migration · global validity registry · Phase 3 QA 를 **추가하지 않았다**.
  ⚠️ *"Phase 2 가 기존 데이터를 다 정리해준다"* 로 쓰지 말 것.

## 📌 Phase 19 가 확정한 것 (v1 checkpoint — 다시 열지 말 것)
- **Outcome A — docs-only.** production/tests/프롬프트 변경 **0** · live **0** · 새 benchmark/harness/e2e **0**.
- **canonical verification 전부 PASS**: typecheck · vitest **50파일/775**(fail 0 · skip 0) · 스크래치 outDir 빌드(vite 5.4.21) · `dump:rpy` **22구성 245파일** · 브라우저 e2e 전체 통과(Outfit AI route-mock 배치 실주행 + `.npproj.zip` 실왕복 포함) · **Ren'Py 8.5.3 lint error 0 · warning 0**.
- **새 v1 blocker 0** — Preview · parity · save/load · `.npproj.zip` · Ren'Py export · Outfit/Expression AI 실행·재실행 · estimate · 병합 · 협업 · build/typecheck/tests 전 경로.
- ⚠️ **AI semantic accuracy 100% 는 v1 조건이 아니다** — production contract 는 **"AI 초벌 → 사람 검수"** 이고, 개별 semantic 오답은 그 자체로 blocker 가 아니다.
- ⚠️ **Expression AI 브라우저 e2e 는 리포에 없다**(실측). Phase 19 는 **만들지 않았고**, 실행/커밋/회수는 기존 vitest(`emotion-ai`·`emotion-commit`·`emotion-recovery`·`emotion-resolve`·`emotion-estimate`·`integration-workflow`)가 덮는다.
- ⚠️ **baseline 두 축을 섞지 말 것**: **v1 frozen production implementation baseline = `931a2cc`** / **Phase 19 final v1 repository checkpoint = `5902dc8`**(verification 을 돌린 `b1adab3` 가 아니다). ⚠️ post-v1 correction 의 **현재 HEAD** 를 이 두 historical checkpoint 와 혼동하지 말 것 — `production implementation baseline` 을 커밋마다 새 SHA 로 갱신하는 체계를 만들지 않는다.

## 📌 Phase 18 이 확정한 것 (Expression AI 동결 — 자동으로 다시 열지 말 것)
- **Outcome A — docs-only finalization.** production/tests/프롬프트 변경 **0** · live **0** · 새 benchmark **0**. 동결 baseline = **`931a2cc`**(Phase 16 구현) 코드 상태.
- **재검증 ceremony 를 돌리지 않은 근거**: `git diff --stat 931a2cc..b1adab3 -- src tests scripts package.json` 이 **비어 있다**(Phase 17 은 Outcome C 라 구현 커밋이 없고 폐기한 correction 도 트리에 안 남았다). ⇒ Phase 16 시점 검증(typecheck · vitest 50파일/775 · mutation 8건 · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 빌드)이 **그대로 유효**하다.
- **동결 계약은 파일+symbol 로 기록했다**(줄 번호를 정본에 심지 않는다 — 금방 낡는다). Phase 18 은 **새 limitation 발굴 Phase 가 아니라서** 기존 확정분만 승계했다.
- ⚠️ **live evidence 범위**: 소규모 curated **synthetic** fixture 한정이고 실제 제작 대본 전반의 **일반화된 품질 평가는 수행하지 않았다**. 이것을 *"production baseline 으로 쓸 수 없다"* 로 연결하지 말 것 — freeze 판정은 deterministic contract · integration path(Preview/export/save/전송/병합) · known limitation · 사람 검수 workflow(`emotion` 우선 · `clearEmotionAuto` · 🤖 표시)를 함께 본 것이다.
- ⚠️ **deterministic 통과를 품질 개선으로 인용하지 말 것**(Phase 17 이 그 반례).

## 📌 Phase 17 이 확정한 것 (표정 denotation — accepted limitation, 다시 열지 말 것)
- **Outcome C — 구현 커밋 없음.** production/test tracked 변경 **0**, baseline 은 Phase 16(`931a2cc`) 그대로.
- **관측된 defect 는 시제 축 하나다**(curated fixture 6개 × before/after 각 1회 = **live 12회**, parser-valid 6/6):
  ```
  "그때는 정말 화가 났었지. 지금은 다 웃어넘길 수 있어."   기대: 화남 아님 → 실제: 화남   (F2-N2)
  ```
  정확한 표현은 **"과거의 분노와 현재의 해소된 상태가 명시적으로 대비됐는데도 과거 분노가 현재
  expression 으로 선택됐다"** — *"현재 분노가 문법적으로 명시 부정됐다"* 로 쓰지 말 것.
  **타인 감정 귀속·부정 fixture 는 통과**했고 인용·가정·미래는 **조사하지 않았다**.
- **폐기한 correction**: 시제 축만 겨냥한 denotation clause 1개(evidence-scope 문장 뒤). deterministic
  검증은 전부 통과했는데(typecheck · 776 tests · T-A/T-B/T-C 무수정 · mutation 6건 · `dump:rpy` diff 0 ·
  스크래치 빌드) **before/after 선택이 6/6 동일**해 폐기했다. user payload 는 **byte-identical** 이었다.
  ⇒ **positive guard regression 은 없었지만 defect 도 안 고쳐졌다.** *"deterministic 통과 = 품질 개선"이
  아니라는 증거*로 인용할 것.
- ⚠️ **두 번째 문안·variant 를 시도하지 말 것**(attempt 1회 고정). ⚠️ *"Phase 17 이 문제를 해결했다"* ·
  *"prompt 품질이 개선됐다"* · *"`gpt-4o-mini` 는 과거 감정을 일반적으로 구분 못 한다"* ·
  *"동일 입력에서 안정적으로 반복되는 defect 가 입증됐다"*(반복 측정 안 했다)로 쓰지 말 것.
- 상세·폐기 문안·evidence 표는 `PHASES.md` "Phase 17 확정" 절이 **정본**이다(로컬 audit 산출물은 커밋하지
  않았고 문서가 그것에 의존하지 않는다).

## 📌 Phase 16 이 확정한 것 (Expression AI 연속성 소유 범위 — 깨지 말 것)
- **latest implementation = `931a2cc`** `fix: Expression AI 연속성 소유 범위를 화자 단위로 한정 (Phase 16)`.
- **두 축을 분리한다**(`src/generators/emotion/aiSelect.ts` 의 `BASE_SYSTEM_PROMPT`·`CONTEXT_RULE`):
  ```
  semantic evidence (감정 판단 근거)      = 전체 scene/context — 타 화자 대사·지문·scene 메타 계속 사용
  continuity ownership (previous state) = 그 화자 자신의 이전 표정만, 타 캐릭터 승계 금지
  ```
  ⚠️ **범위를 좁힌다고 "같은 화자의 이전 줄만 보라"로 쓰지 말 것** — 타 화자·지문이 판단 근거에서
  빠지는 **정반대 회귀**다(테스트 T-B 가 그 전용 가드). anti-flicker 는 **없앤 게 아니라 범위만** 좁혔다.
  ⚠️ 변경 **횟수** sparsity prior·기본 표정 선호 같은 억제 문구를 추가하지 말 것(Phase 11 A 교훈).
- **production 은 프롬프트 문자열 2곳 + 주석뿐**이다 — planner·payload·parser·estimate·resolve·
  renderer·store·schema·save/load·`.npproj.zip`·협업·Ren'Py export **전부 무변경**(`dump:rpy` diff 0).
- **⚠️ live 결과를 과장하지 말 것**: `gpt-4o-mini` · synthetic fixture 3개 · before/after 각 1회 · 총 6회.
  **baseline 부터 이미 올바른 선택이었고 before/after 가 전부 동일**했다. ⇒ *"cross-speaker bleed 를
  고쳤다"·"semantic FP 해결"·"선택 품질 개선"·"live 에서 개선 확인"* 으로 쓰면 안 된다.
  정확한 문장: **"invalid continuity scope 는 deterministic 하게 확인됐으나 이번 최소 live fixture 에서는
  baseline user-facing bleed 가 재현되지 않음"** — 방향성 regression 도 관측되지 않았다.
  **same-input variance·stability campaign 으로 확대하지 않는다.**

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
- **post-v1 대본 한 줄 삭제 UX — Phase 1(구현·검증)**(⚠️ 아직 커밋 전): 장면 카드 `🗑` 로 대사·지문 한 줄을
  `window.confirm` 뒤 삭제한다. canonical 은 새 store 액션 `deleteLine` 하나이고 계약·검증은 위 📌 절이 정본.
  production 변경 4개(`types.ts` 선언 + `scriptSlice.ts` 구현 + `SceneCard.tsx` 버튼·key + `ScenePlayer.tsx` reset deps 1줄) ·
  신규 테스트 1파일(16 tests) · parser·Ren'Py 생성기·Project schema·persistence·협업 변경 0.
