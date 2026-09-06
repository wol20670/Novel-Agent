# post-v1 — 이력 아카이브 (번역 · 의상 UX · 줄 삭제 · CG 종료 · Voice anchor)

> **이 문서는 "무슨 일이 있었는가"다.** 현재 지켜야 할 계약은 `docs/contracts/` 가 정본이고,
> **여기 적힌 수치·문장은 그때의 사실이라 현재 contract 를 override 하지 못한다.**
> ⚠️ **이 문서의 Phase 번호는 post-v1 로드맵의 것이고 v1 Phase 번호(`v1-ai-phases.md`)와 다른 축이다.**
> 아래 블록들은 Pre-R5 Housekeeping 이전 root 문서에서 **byte 단위 그대로** 옮겨온 것이다
> (baseline `047cc7d`). `<!-- NA-PROV -->` 사이 payload 는 **수정하지 말 것**.
> ⚠️ **보존 payload 안의 상대 링크는 baseline 당시의 저장소 루트 기준**이다
> (`./HANDOFF.md`·`./PHASES.md` 등). 이 파일 위치에서는 해석되지 않는다 —
> **원문 보존이 목적이라 고치지 않는다.** 현재 문서는 루트의 `HANDOFF.md`·`PHASES.md`
> 또는 `docs/contracts/` 를 직접 열 것.


## HANDOFF.md — post-v1 확정 절 (원문)

<a id="cg-end"></a>
<!-- NA-PROV id=HCG src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L384-492 sha256=c96e8536b31ff7d5919a3a678057c0b16f61526df6f15f7c4d9ef22fac0d0256 -->
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
  `🎴 CG:` 에는 안 들어간다). control line 이라 **줄 삭제 `🗑` 대상도 아니다**.
  ⚠️ **삭제 버튼·CG 관리 모달은 여전히 없다**(삽입만 있다 — 바로 아래 절 참고).

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

<!-- /NA-PROV id=HCG -->

<a id="cg-end-insert"></a>
<!-- NA-PROV id=HCGi src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L493-582 sha256=5ed21fbe90d2cb539e6be46c5431fb2e62b8c14823f8189abb17be73b026ac56 -->
### 🖼끝 — SceneCard 수동 삽입(구현 `d22c325`)
- **문제**: 마커 문법은 있는데 진입점이 없어서, "여기서 CG 를 끝내고 싶다"는 순간마다 왼쪽 패널 원본으로
  돌아가 `#CG끝` 을 타이핑하고 다시 분석해야 했다. 이번 작업은 **그 진입점 하나**를 여는 것이고
  **CG semantics 를 새로 만들지 않는다.**
- **동작**: CG active 인 대사·지문의 액션 영역(`👗` 와 표정 select 사이) `🖼끝` → **그 줄 바로 뒤**에
  기존 canonical 마커 `{ kind:'cg', desc:'', end:true }` 를 꽂는다. 의미는
  **"이 줄까지 CG → 바로 뒤에서 종료 → 다음 구간부터 일반 배경 + 기존 visible 스프라이트 복귀"** 다.
- **버튼 노출 조건** — 셋을 모두 만족할 때만이고, 불충족이면 **disabled 가 아니라 미렌더**다
  (CG 가 아닌 줄에 "CG 종료"는 의미가 없다 — `👗` 가 이유를 알리려고 disabled 인 것과 반대 판단):
  ```
  kind ∈ {dialogue, narration}  ∧  cgActiveFlags[index] >= 0  ∧  바로 다음 줄이 end:true 마커가 아님
  ```
  ⚠️ **판정은 `cgActiveFlags`(per-line 상태)** 다 — `getFirstEffectiveCgIndex`(최초 경계 · Outfit AI
  cutoff)를 쓰면 위에서 확정한 divergence 가 배선 사고로 무너진다. **둘을 합치지 말 것.**
  ```
  SceneCard 수동 CG 상태 판단 = cgActiveFlags
  Outfit AI cutoff           = getFirstEffectiveCgIndex
  ```
  dialogue/narration 은 CG 상태를 바꾸지 않아 `flags[i-1] === flags[i]` 라, 이 두 kind 에서는
  **before/after off-by-one 이 생기지 않는다**(그래서 `flags[index] >= 0` 하나로 충분하다).
- **canonical action 은 `insertCgEndAfterLine(sceneId, lineIndex)` 하나**다(`src/store/scriptSlice.ts`).
  ⚠️ **범용 `insertLine` 을 만들지 않았다** — 임의 kind 삽입은 `#아이템끝` 짝·`play music` 시작점·CG
  cutoff 같은 상태 전이 semantic 을 UI 로 흘린다(`deleteLine` 이 그 kind 들을 거절하는 것과 같은 이유).
  ```
  삽입 위치    : lineIndex + 1
  허용 kind    : dialogue · narration 뿐
  허용 상태    : cgActiveFlags[lineIndex] >= 0 (지금 CG 구간)
  중복 방지    : 바로 다음 줄이 이미 end:true 면 no-op
  무효 요청    : 완전 no-op
  기존 Line    : 객체 **참조 그대로** 뒤로 밀린다(복제·정규화 없음)
  건드리지 않음: Scene.cg · cgAssetIds · rawInput
  ```
  ⚠️ **guard 전부가 `invalidateOutfitSuggestions`·`setScenes`·`flash` 보다 먼저**다(`deleteLine` 과 같은
  순서 계약) — 무효·중복 요청은 observable state 를 **하나도** 건드리지 않는다. 테스트가 호출 전후의
  `project`·`scenes`·`scene[0]`·`lines` **참조**와 `rawInput`·`outfitSuggestions`·revision·sentinel
  toast 를 전부 대조해 이 순서를 고정한다.
  ⚠️ 중복 판정 범위는 **바로 다음 줄 하나뿐**이다 — 뒤쪽 종료 마커를 탐색하거나 CG timeline 편집 정책을
  만들지 않았다. 다음 줄이 **새 `#CG` 시작 마커**인 경우는 막지 않는다(표현 가능한 의도다).
- **Outfit 제안**: 유효 삽입은 줄 배열을 바꾸므로 **기존 `invalidateOutfitSuggestions()` 정책 그대로**
  (전체 clear + revision++). 무효 삽입은 제안·revision 까지 완전 무변경. **새 index shift 알고리즘 없음.**
- **안내 토스트는 사용자에게 1개**여야 한다 — `flash` 는 단일 `toast` state 라 뒤 메시지가 앞을 덮고,
  `invalidateOutfitSuggestions` 는 pending 이 있으면 자체 flash 를 낸다. 그래서 **공유 액션을 고치지 않고**
  (다른 호출 경로가 전부 그대로여야 한다) 호출측에서 **pending 을 먼저 세어** 마지막 합성 메시지에 담는다:
  `pending 계산 → invalidate → setScenes → flash(합성)`. ⚠️ `silent` 플래그·toast 큐를 만들지 말 것.
  invalid/duplicate 에서는 **flash 자체를 부르지 않는다.**
- **rawInput / persistence / reparse — 헷갈리기 쉬운 지점(둘은 다른 계약이다)**
  ```
  save/load persistence  ≠  rawInput reparse persistence
  ```
  이 삽입은 **parsed-only manual edit** 이다: 마커는 `Scene.lines` 에 들어가고 **`project.rawInput` 은
  건드리지 않는다**(`deleteLine`·`setLineText` 와 같은 source/parsed-data 계약).
  - **유지되는 곳** — localStorage save/load · `.npproj.zip` · 협업 · 생성 출력. 전부 parsed Scene 을 쓴다.
  - **사라질 수 있는 곳** — 원본 대본에 `#CG끝` 이 **없는 채로 같은 rawInput 을 다시 분석**하면 수동 마커가
    빠진다(실측: 병합 미리보기가 `➖ 삭제` 로 먼저 예고한다). 원본에 `#CG끝` 을 직접 적어두면 재분석
    뒤에도 같은 자리에 남는다(실측).
  ⚠️ **재분석을 undo·복구 수단으로 설명하지 말 것** — 재분석은 `#CG끝` 만이 아니라 다른 parsed/manual
  상태에도 각자의 merge 계약을 적용한다. 버튼 title 과 토스트도 **"재분석 시 사라질 수 있다"는 경고까지만**
  하고 복구 경로를 안내하지 않는다.
  ⚠️ **CG 종료 marker 삭제 UX · undo/redo · control-line 삭제 · rawInput reverse writer · parser source map ·
  source provenance · Line UUID 를 만들지 않았다.**
- **structural line-index 안전성은 줄 삭제 축의 방어를 그대로 재사용**한다(`scene.lines.length` 가 n → n+1
  이므로 삭제와 정확히 같은 신호다). **새 revision·UI state 시스템을 만들지 않았다.**
  - **`LineRow`**: key 에 줄 수가 섞여 있어 구조 변경이면 remount 된다 → `editing`·`voiceOpen`·`outfitOpen`
    같은 positional UI state 가 **다른 줄로 이월되지 않는다**(실측: 삽입 뒤 모든 row 의 textarea 0개).
  - **`ScenePlayer`**: 기존 `[scene.id, scene.lines.length]` reset dependency 가 그대로 걸려 첫 step 으로
    돌아간다(실측 `4 / 5` → `1 / 6` · `total` 은 control line 포함 `scene.lines.length`). **ScenePlayer 무수정.**
  - **Translation QA**: 캐시를 직접 지우지 않는다 — 밀린 결과는 기존 content anchor(`activeQaIssues`)에서 빠진다.
  - **Expression / autoTranslate**: 기존 commit-time anchor 재검증 그대로. **새 조치 없음.**
  - **Voice**: Phase 1A 의 request-time anchor 가 막는다(아래 📌 Voice 절) — 이번 Phase 에서 Voice 프로덕션
    코드를 다시 손대지 않았다.
- **Preview / 생성기 core 무변경** — 마커가 canonical `Scene.lines` 에 들어간 뒤는 기존 경로가 그대로 소비한다.
  ```
  SceneCard → 기존 end:true 마커 삽입 → 기존 cgActiveFlags
            → 기존 ScenePlayer CG 복원 → 기존 생성기 #CG끝 복원
  ```
  parser CG core · Preview CG core · generator CG core · Project schema/migration · `mergeScenes` CG
  semantic · Outfit AI first-CG cutoff **전부 무수정**이다. 특히 **`#CG끝` 그 줄에서 즉시 일반 배경 +
  visible 스프라이트가 복귀**하는 기존 semantic 을 UI 가 그대로 쓴다.
- **검증(수동 삽입)**: `typecheck` PASS · `vitest` **65파일/1067 tests passed · failed 0**(신규
  `tests/cg-end-insert.test.ts` 19) · `git diff --check` clean ·
  `dump:rpy` **23구성 256파일 recursive diff 0**(생성기 출력이 1바이트도 안 바뀜).
  뮤테이션으로 테스트 실효성도 확인했다 — off-by-one·guard 순서 역전·중복 가드 제거·CG active 가드 제거
  각각에서 해당 테스트가 실제로 깨진다.
  실브라우저: **CG active 대사·지문에만 `🖼끝`**(CG 이전·`#CG끝` 이후·control line·중복 위치 미노출) ·
  클릭한 줄 **바로 뒤**에 `🖼 CG 종료` chip 즉시 등장 · **토스트 1개** · LineRow 로컬 state 이월 없음 ·
  ScenePlayer 첫 step reset · **`#CG끝` 다음 줄에서 수동 `👗` 재활성**(같은 화면에서 CG 구간은 disabled) ·
  **마커 스텝에서 일반 배경 + 스프라이트 즉시 복원**(CG 스텝의 전면 이미지가 사라지고 스프라이트가 나타남) ·
  새로고침 유지 · `.npproj.zip` 실왕복 유지 · **rawInput 에 없으면 재분석 시 소실 / 직접 적어두면 유지** ·
  줄 수가 안 바뀌는 텍스트 편집에서 remount·포커스 회귀 없음.

<!-- /NA-PROV id=HCGi -->

<a id="voice-anchor"></a>
<!-- NA-PROV id=HVO src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L583-633 sha256=27b15f281816aa78ca723b49f591019e766f194e03039ac8960408e281b5108c -->
## 📌 post-v1 Voice request-time anchor 가 확정한 것 (async 음성 첨부 — 깨지 말 것)
> ⚠️ 이 절은 **Voice 안전성 축**이다(CG·의상·줄 삭제·번역 로드맵과 같은 축이 아니다). 구현 = `4067a57`.
> CG 종료 수동 삽입(`d22c325`)의 **선행 조건**이라 같이 했을 뿐, 구조가 바뀌는 모든 경로에 적용된다.

- **고친 결함**: 음성 작업은 `(sceneId, lineIndex)` **좌표만** 들고 async(TTS → 업로드)를 건너간 뒤
  커밋하는데, 커밋 경로가 `kind === 'dialogue'` 만 확인했다. 그 사이 줄이 추가·삭제되면 **같은 좌표에
  들어온 다른 대사**에 `voiceAssetIds` 가 붙었다 — transient UI stale 이 아니라 **persistent 오부착**이다.
  배치는 요청~커밋 사이가 항목당 TTS + 페이싱 + 백오프라 window 가 가장 넓다.
- **anchor 는 반드시 "요청 시점" 값**이다 — **최초 async boundary 이전에** 그 줄에서 뜬다:
  ```
  { speaker: line.speaker, text: line.text }   // text 는 canonical 원문
  ```
  ⚠️ **`attachVoiceQuiet` 진입 시점에 현재 `lines[lineIndex]` 를 읽어 만들면 이미 늦다** — 그 지점은 TTS 가
  **끝난 뒤**라, 구조가 밀렸으면 **이미 들어온 다른 대사**에서 anchor 를 뜨게 되어 검증이 그대로 통과한다.
  ⚠️ live Line 참조가 아니라 **문자열 복사본**이어야 한다.
- **전달 경로**(둘 다 최초 await 이전에 캡처해 커밋까지 동행):
  ```
  단건 : VoiceLab.generate / attachToLine  →  attachLineVoice  →  attachVoiceQuiet  →  set()
  배치 : collectVoiceTargets  →  runCharacterVoiceBatch  →  attachVoiceQuiet  →  collector
         →  applyVoiceUpdates
  ```
- **검증은 두 지점**이다 — 한 곳만으로는 두 구간 중 하나가 뚫린다:
  ① `attachVoiceQuiet` **진입 fail-fast**(요청 ~ 진입 사이 shift · 업로드 전에 멈춰 크레딧·고아 blob 낭비 방지)
  ② **커밋 직전 재검증** — 단건은 `set()` 안에서 *그 순간의 state* 로, 배치는 `applyVoiceUpdates` 가 그룹핑
  **전에** 현재 scenes 로. 어긋난 항목은 **그 항목만 drop** 하고 **run 전체를 폐기하지 않는다**.
  ⚠️ 어긋나면 **어느 줄에도 쓰지 않는다** — 밀린 좌표를 재계산해 옮겨 붙이지 않는다(index remapping 금지).
  버려진 blob 은 **기존 고아 에셋 스윕**이 회수한다(새 정리 경로를 만들지 않았다).
- **판정 단일 소스는 `voiceLineAnchorMatches`(`src/store/helpers.ts`)** 하나다 — fail-fast · 단건 커밋 ·
  배치 커밋 셋이 공유한다(각자 비교식을 쓰면 그 순간 판정이 갈라진다 — `resolveEmotion` 과 같은 규칙).
  반환은 type guard 라 통과하면 호출측이 dialogue 로 좁혀 `voiceAssetIds` 를 읽는다.
- ⚠️ **synthesis text 와 identity anchor 는 다른 축이다** — `VoiceBatchItem.text` 는 TTS 에 넘길 값이라
  비-base 로케일이면 **번역문**이고, `anchorText` 는 **canonical `line.text`** 다. 둘을 같은 필드로 쓰면
  "번역이 없는 줄"과 "원문이 같은 다른 줄"을 구별하지 못한다.
- **만들지 않은 것**: Line UUID · 범용 provenance · index remapping · voice revision/epoch · abort/cancel
  primitive · locale-aware anchor framework · voice architecture rewrite.
- **accepted limitation**: 인접한 두 대사의 `speaker` 와 canonical `text` 가 **완전히 동일**하면 content
  anchor 로 구별할 수 없다 — 번역 QA Phase 3·4·5 가 이미 명시한 것과 **같은 등급의 기존 한계**다.
- **의도된 동작 변화**: 배치가 도는 동안 사용자가 그 줄의 **원문을 편집**하면 그 항목은 버려진다
  (`setLineText` 가 같은 상황에서 `i18n` 을 버리는 것과 같은 규율).
- **배치 요약 카운트(`done`)에 커밋 시점 drop 을 배선하지 않았다** — 기존 best-effort 집계 그대로다.
- **검증**: `typecheck` PASS · `vitest` **64파일/1048 tests passed · failed 0**(신규 `tests/voice-anchor.test.ts` 8 ·
  `tests/collect-voice.test.ts` shape 갱신) · `dump:rpy` **23구성 256파일 recursive diff 0**.
  뮤테이션 확인 — 커밋 검증을 옛 `kind === 'dialogue'` guard 로 되돌리면 해당 테스트가 실제로 깨진다.
  실브라우저: 단건 파일 업로드 적용이 **연 그 줄에 정확히** 부착(`voice_<이름>_<index>_<locale>.mp3`) ·
  교체 시 그 줄의 assetId 만 갱신되고 다른 줄 무변경.
- ⚠️ **미검증(환경)**: 실제 **TTS 생성·배치 생성**은 Typecast 실키가 없어 브라우저에서 확인하지 못했다.
  그쪽에서 이번에 바꾼 두 끝(`collectVoiceTargets`·`applyVoiceUpdates`)과 거부 경로는 **테스트로만** 고정돼 있다.
- **open question**: 로케일 synthesis text 의 staleness(예: TTS 도는 동안 **번역만** 고친 경우)는 이번
  anchor 에 포함하지 않았다 — content-staleness 정책 확장이라 별도 판단이다. collector 에 이미 실려 오므로
  나중에 필드 추가 없이 켤 수 있다.

<!-- /NA-PROV id=HVO -->

<a id="line-delete"></a>
<!-- NA-PROV id=HDL src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L634-684 sha256=efe78470a702c3139f95ffc5e07e24cf8de0eda5b5b5445b07982d460e76c55a -->
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

<!-- /NA-PROV id=HDL -->

<a id="outfit-ux"></a>
<!-- NA-PROV id=HOU src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L685-711 sha256=ee6fcbcdcaf683af4548c241d0a20148c5bf5e7684c9f4308659f69a1bbe7f3f -->
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

<!-- /NA-PROV id=HOU -->

<a id="translate-p5"></a>
<!-- NA-PROV id=HT5 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L712-770 sha256=60696c5dd60957449bf82dbcb861d4237e4747e7da965575af2259b7d446ebd6 -->
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

<!-- /NA-PROV id=HT5 -->

<a id="translate-p4"></a>
<!-- NA-PROV id=HT4 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L771-809 sha256=9611563624dcc0d8ff7c62721657e8efc0df42faf1bcf138644ddd232c73aa71 -->
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

<!-- /NA-PROV id=HT4 -->

<a id="translate-p3"></a>
<!-- NA-PROV id=HT3 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L810-872 sha256=fa81024d54b0ea6cb9e9760cf46a245f5bd317d82676782c7828129dfc73a551 -->
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

<!-- /NA-PROV id=HT3 -->

<a id="translate-p2"></a>
<!-- NA-PROV id=HT2 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L873-913 sha256=9722578e4e87e28d07496f127f3ff137caa0e40d1d7fb9398e3a6eca9f9196f6 -->
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

<!-- /NA-PROV id=HT2 -->

## HANDOFF.md — 🎯 post-v1 축 항목 (원문)

<a id="handoff-goal-translate"></a>
<!-- NA-PROV id=Hg-c src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L9-18 sha256=d801f5c1db1e216825d6e452215a97798acc4374ba9ce02558746c79edc12b78 -->
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
<!-- /NA-PROV id=Hg-c -->

<a id="handoff-goal-postv1"></a>
<!-- NA-PROV id=Hg-d src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L19-24 sha256=72a6168c178d7d3fed9ca06b083a17a9a23e5b9ed20de105eedceba929b81fa5 -->
- **post-v1 의상 전환 UX 개선** — ⚠️ 번역 로드맵·v1 Phase 번호와 **다른 축**이다. **Phase 1(구현)·Phase 2(검증·문서) 완료**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 의상 절에도 durable contract 한 줄이 있다.
- **post-v1 대본 한 줄 삭제 UX 개선** — ⚠️ 위 두 축(번역 로드맵·의상 UX)과도 **다른 축**이고 v1 Phase 번호와 섞지 말 것. **Phase 1(구현·검증)·Phase 2(문서) 완료**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 에도 durable contract 가 있다. ⚠️ `item`/`cg`/`bgm` control line 삭제는 **이번 scope 밖**이다(별도 Phase — 사용자 지시가 있을 때만).
  **구현 = `258c637`(장면 카드 수동 의상 전환 UI) · 문서 = `95ba76e`** — 이 둘은 **post-v1 번역 Phase 5 를 시작하기 전에 이미 main 에 있었고** Phase 5 는 이 축을 건드리지 않았다(`SceneCard.tsx` 무수정 · `👗` 패널 실브라우저 smoke 확인). ⚠️ 번역 Phase 5 baseline 을 `76612eb` 로 착각하지 말 것 — 실제 baseline 은 **`95ba76e`** 다.
- **post-v1 장면 중간 CG 종료 / 일반 장면 복귀 UX** — ⚠️ 위 세 축(번역 로드맵·의상 UX·줄 삭제)과도 **다른 축**이고 v1 Phase 번호와 섞지 말 것. **Phase 1(구현·검증)·Phase 2(문서) 완료**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 에도 durable contract 가 있다. ⚠️ **Outfit AI 를 post-CG 구간으로 넓히는 것은 이번 scope 밖**이다(별도 Phase — 사용자 지시가 있을 때만).
  - **SceneCard 수동 삽입 UX(같은 CG 축의 후속)** — 대본을 고쳐 재분석하지 않고도 장면 카드에서 `#CG끝` 을 꽂는다. **Phase 1A(Voice 선행 안전성)·1B(구현·검증)·2(문서) 완료**, 남은 필수 작업 없음. **1A = `4067a57` · 1B = `d22c325`**. ⚠️ **CG 종료 marker 삭제·undo·CG 시작 수동 삽입은 여전히 없다**(별도 Phase — 사용자 지시가 있을 때만).
- **post-v1 Voice request-time anchor** — ⚠️ CG 축이 아니라 **Voice 안전성 축**이다(줄 구조가 바뀌는 모든 경로에 적용된다). **완료(구현 `4067a57`)**, 남은 필수 작업 없음. 계약은 아래 📌 절이 정본이고 `CLAUDE.md` 에도 durable contract 가 있다.
<!-- /NA-PROV id=Hg-d -->

## CLAUDE.md — post-v1 요약 원문 provenance

<a id="claudemd-translate"></a>
<!-- NA-PROV id=C06 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L44-48 sha256=29556537ff545faf38fc5a3ed8501ac5b1b31249c742327f2aeb8e1983b73ab4 -->
- **번역(`Line.i18n`)은 그 줄의 "현재 KO 원문"에 대한 번역일 때만 유효하다** — 동치 관계의 단일 소스는 `sameLooseText`(`src/project/mergeScenes.ts`, 병합 `loosePronKey` 의 공백·문장부호 strip 을 공유)이고 **엑셀 병합 · 앱 직접 편집(`setLineText`) · 자동 번역 커밋(`autoTranslateAll`) 세 경로가 같은 답을 내야 한다**(두 번째 구현·`Line` 을 받는 범용 identity 추상 금지 — `resolveEmotion` 과 같은 규칙). ⚠️ **manual 무효화를 "편집 완료" 시점으로 미루지 말 것** — `setLineText` 은 키 입력마다 project 를 갱신하고 autoSave(localStorage·협업 push)를 태우므로, 미루면 "새 원문 + 옛 번역"이 저장·전송·`tl/<lang>/script.rpy` 를 통과하는 시간창이 생긴다(그래서 같은 state update 안에서 지운다). ⚠️ **async 커밋은 좌표를 믿지 않는다**: 요청 시점 anchor(`ko`·`speaker`·`narration`)로 커밋 직전 재검증하고 **어긋난 항목만** 버린다(run 전체 폐기 아님·쓰기 base 는 현재 `scenes`·검증~`setScenes` 사이 `await` 금지). 검증은 **pending 을 바깥 루프로 도는 2-pass** 여야 한다 — 현재 scenes 를 map 하며 `updates.get(i)` 를 보면 **줄이 삭제돼 index 가 사라진 결과는 방문조차 못 해 조용히 유실**된다. ⚠️ 표정의 `requestKey`(요청 원문 전체 비교)를 번역에 복사하지 말 것(번역 payload 엔 문맥 전용 줄이 없어 한 글자 편집이 40줄 청크를 통째로 버린다). 사람이 이미 채운 로케일은 **칸 단위**로 보존하고, `committed`/`skipped` 도 로케일 칸 단위로 보고한다. **이전 버전에서 이미 저장된 stale 번역은 소급 정리하지 않는다**(provenance 가 없다 — hash·version·UUID·migration 을 만들지 말 것).
- **번역 QA(`src/generators/translate/qa.ts`, store `translationQa`)는 canonical 을 고치지 않는 session-only review layer 다** — 결과는 project 밖 런타임 state 라 저장·`.npproj.zip`·협업 어디에도 안 실리고, `Line.i18n` 을 **읽기만** 한다(수정은 사람이 장면 카드에서 직접). 유효성은 **source+target exact anchor** 다 — ⚠️ Phase 2 의 `sameLooseText` 를 여기 쓰지 말 것(그쪽은 만들어진 *산출물*을 표기 편집에서 지키는 것이고, QA 는 그 두 문자열에 대한 *transient 판단*이라 엄격한 쪽이 안전하다). 표시·커밋 판정의 단일 소스는 `activeQaIssues`/`isQaResultValid` 이고 **global revision epoch·Line UUID·translation hash/version·persistent QA metadata·`Scene.status` 자동 변경을 만들지 않는다**(stale 은 배선이 아니라 판정으로 처리한다 — UI 에서 `setLineTranslation` 뒤에 `clearTranslationQa` 같은 걸 부르면 다른 칸의 유효 결과까지 날아간다).
- **deterministic QA 는 copy-through 하나뿐이고 규칙 결과는 AI 와 독립이다** — 길이·문장부호·"한글 포함"·중복 번역은 FP 가 커서 전부 기각했으니 **두 번째 heuristic 을 얹지 말 것**(generic language-heuristic framework 로 키우는 건 이 rule 의 확장이 아니다). 규칙 hit 은 AI 배치에서 빠지고, **AI 대상이 0이면 키를 확인하지도 않으며** 키가 없거나 요청이 실패해도 이미 확정된 규칙 결과·이미 성공한 AI 결과는 커밋된다(run 전체 폐기 금지 — UI 에서 키 유무로 실행을 막지 말 것). ⚠️ 사람이 누른 "문제 없음"(`origin:'manual'`)은 **같은 exact anchor 의 pending 자동 판정이 덮지 못한다**. ⚠️ 중복 응답 `i` 는 `parseEmotionResponse` 의 last-wins 를 복사하지 말고 **그 항목만 unreviewed** 로 버린다(모르는 결과를 `ok` 로 넘겨짚지 않는다). ⚠️ QA 실행 중 중복 실행·전체 재검수는 **UI 의 disable 이 유일한 방어선**이다(스토어에 동시 실행 guard 가 없다 — 의도적).
- **QA 검수 엑셀(`src/generators/translate/qaWorkbook.ts`)은 일반 대본 엑셀과 별개의 좁은 포맷이다** — 의심 번역만 내보내 외부에서 전체 대본 문맥과 함께 고친 뒤 되돌려 넣는 왕복 전용이고, **`parseExcel.ts`/`sceneBuilder.ts` 의 semantic 을 공유·확장하지 않는다**(공유하는 건 `xlsx` 지연 로딩·`downloadBlob`·숨김 file input 같은 저수준 관용구뿐이다 — 둘을 generic Excel parser/escaping abstraction 으로 합치지 말 것). 보이는 열은 **언어 고정**(`A 한국어 · B 영어 · C 일본어`)이고 `D 검수 대상`은 **표시 전용**이다 — 적용 권한의 authority 는 **숨은 metadata(E열 + `_naqa`) 뿐**이라 D열을 고쳐도 반영 대상이 바뀌지 않는다. 행1 헤더 5칸은 structural contract 라 exact 대조하고(**헤더로 동적 column mapping 을 만들지 말 것**), **export 당시 검수 대상이던 로케일만** 쓸 수 있다(나머지 칸은 context-only). 비교는 전부 **exact** 이고 **`trim` 을 끼우지 않는다**(빈칸 판정에만 쓴다 — `"Hello "`→`"Hello!"` 가 stale 로 오판된다), 빈칸은 **삭제가 아니라 무시**, 수식·숫자 셀은 번역으로 적용하지 않는다(전용 strict text cell reader — `parseExcel` 의 `String(row[c] ?? '').trim()` coercion 을 재사용하지 말 것). 행 metadata 는 **fail-closed**(필드 하나만 어긋나도 그 행 폐기 · 권한 `f` 는 부분 복구 금지 · 같은 줄 중복은 last-wins 가 아니라 전부 폐기 · 원문 열이 스냅샷과 다르면 행 skip). stale 판정의 정본은 기존 **`isQaResultValid` 하나**이고(새 술어 금지), import 는 **현재 `translationQa` 캐시에 의존하지 않는다**. 적용(`applyQaWorkbook`)은 **커밋 시점 현재 project 로 재분석**한 뒤 `applyTranslationUpdates` 로 **`setScenes` 1회**만 쓴다(칸마다 `setLineTranslation` 반복 금지 · candidate 0 이면 커밋 자체 없음 · `translationQa` 를 직접 지우거나 자동 재검수를 돌리지 말 것). **Project schema·localStorage·`.npproj.zip` 은 무변경**이고 workbook metadata 는 어디에도 저장되지 않는다(적용 결과는 평범한 `Line.i18n` 변경일 뿐). ⚠️ 이 기능이 있으므로 **앱 안에 고품질 재번역·AI 대체 번역 제안·auto-fix 를 다시 만들지 말 것**(HANDOFF 📌 Phase 4 절이 정본).
- **QA 검수 엑셀에서 "안 고치고 돌아온" 칸은 `문제 없음` 후보일 뿐, 자동 승인 대상이 아니다**(Phase 5, `analyzeQaWorkbook` 의 `manualOkCandidates` + store `applyQaWorkbookManualOk`) — **앱은 사용자가 실제로 검수했는지 모른다**(파일을 열어보지도 않고 그대로 다시 넣어도 unchanged 다). analyzer 가 내는 건 **eligibility 뿐**이고 manual 판단은 **UI 의 별도 confirm** 이 만든다 — ⚠️ import 만으로 등록하거나 canonical confirm 에 묶어 한 번에 동의받지 말 것, UI 문구에 "검수 완료"라고 단정하지도 말 것. 자격은 **flagged · metadata strict · duplicate 아님 · 원문 열 일치 · strict text cell · `text === snapshot` exact · blank/공백 아님 · 현재 project `isQaResultValid`** 전부이고, 이 조건들은 기존 pass 위치에서 그대로 나온다(**새 validity 술어를 만들지 말 것** · anchor 정의는 `anchorOf` 하나를 changed·unchanged 가 공유). ⚠️ **`counts.unchanged`·`blank`·`stale` 의 Phase 4 의미를 바꾸지 말 것** — 빈/공백 칸은 후보에서만 빼고 `counts.blank` 로 옮기지 않으며, **`unchanged − manualOk` 를 stale 이라 부르지 말 것**(stale 과 blank 가 섞여 있다). 결과 shape 은 `dismissQaIssue` 와 **정확히 같아야** 하고(`verdict:'ok'`·`origin:'manual'`, category·reason·model 없음) 그래야 기존 skip·precedence·compaction 이 걸린다. 쓰기는 **functional set 1회**(`upsertQaResults` 가 이미 배열 batch — 새 primitive 금지), 후보 0이면 캐시 무변경, 반환은 `committed` 뿐이다(**`skipped` 집계를 만들지 말 것** — denominator 가 다르다). canonical·`autoSave`·협업·persistence·`clearTranslationQa`·자동 재검수 **전부 없고**, canonical 확인창 취소가 이 분기를 죽이면 안 된다(`NO/YES` 가 정상 경로다). manual OK 는 Phase 3 과 같은 **session-only** 라 새 세션에서 복원되지 않는다(HANDOFF 📌 Phase 5 절이 정본).
<!-- /NA-PROV id=C06 -->

<a id="claudemd-scene-manual"></a>
<!-- NA-PROV id=C08 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L55-57 sha256=61014035b5df8ce135b3cf3c26cb2102ea1f55fe6533a9777e671993ab2ecf36 -->
- **장면 카드의 수동 의상 전환(줄 `👗` 패널)도 canonical 경로가 AI 와 같다** — 값은 `Line.outfits`, 쓰기는 `setLineOutfit`(→ `mergeLineOutfit`) 하나뿐이라 수락한 AI 제안과 결과가 구별되지 않는다(수동 전용 state·mutation·레코드 직접 조립을 만들지 말 것 — 같은 줄의 다른 캐릭터 지정 보존이 그 머지에 달려 있다). 저장되는 index 는 **패널을 연 바로 그 줄**이고 의미는 파서 `#복장`·AI 와 동일한 "이 줄부터"다(패널이 줄 아래 펼쳐진다고 다음 줄에 쓰지 말 것). ⚠️ **새 전환을 추가·변경할 수 있는 경계는 이제 AI 와 다르다 — 다시 합치지 말 것**: 수동은 `cgActiveFlags[index] < 0`(**CG active 구간만** 차단 → `#CG끝` 이후 다시 허용), Outfit **AI** 는 `getFirstEffectiveCgIndex`(최초 CG 앞까지) 그대로다. `#CG끝` 뒤 줄은 생성기가 그 줄의 fold 의상으로 다시 세우므로 더는 dead write 가 아니지만, AI writable 을 비연속 다중 range 로 넓히는 것은 `planOutfitWindows` chunking·lead-in·CG sentinel 전제를 깨는 **별도 Phase** 다. ⚠️ **이미 있는 값의 해제(`✕`)는 그 경계와 무관하게 허용**해야 한다 — CG 구간에 남은 값을 정리할 유일한 경로다(자동 정리는 하지 않는다).
- **대본 한 줄 수동 삭제의 canonical 은 `deleteLine(sceneId, lineIndex)`(`src/store/scriptSlice.ts`) 하나다** — 현재 **dialogue/narration 만** 지원하고(`item`·`cg`·`bgm` 은 CG cutoff·`play music` 시작점·`#아이템끝` 짝 같은 **상태 전이 semantics** 라 제외 — 장면 카드에도 버튼이 안 나온다), 없는 장면·범위 밖·마커 kind 는 완전 no-op 이다. ⚠️ **guard 가 `invalidateOutfitSuggestions()` 보다 먼저**여야 한다(무효 요청이 검수 중인 의상 제안을 날리면 안 된다 — `tests/line-delete.test.ts` 가 이 순서를 고정한다). **`Scene.lines` 만 고치고 `rawInput` 은 건드리지 않는다** — 그래서 원본에 그 줄이 남아 있으면 **재분석 때 되살아난다**(기존 줄 편집과 같은 source 계약이다. Line UUID·tombstone·soft-delete·undo·index remapping 을 만들지 말 것). QA 캐시는 **직접 clear 하지 말 것**(기존 `activeQaIssues` content-anchor 판정이 stale 을 거른다), 표정은 Line-local 이라 별도 무효화가 필요 없고, 음성 blob 회수는 기존 고아 에셋 경로가 담당한다.
- **`Scene.lines` 의 길이가 바뀌는 변경은 positional transient state 를 반드시 무효화해야 한다** — ① 장면 카드 `LineRow` 의 로컬 state(`editing`·`voiceOpen`·`outfitOpen`)가 **다른 줄로 이월되면 안 되고** ② `ScenePlayer` 의 `step` 이 **밀린 다른 줄을 가리키면 안 된다**(렌더 clamp 는 범위만 막지 이걸 못 막는다). 지금은 둘 다 `scene.lines.length` 로 해결한다 — 카드는 그 값을 **key 에 섞어** remount 시키고, 플레이어는 **reset effect deps** 에 넣는다. ⚠️ key 를 **내용(text) 기반으로 만들지 말 것**(타이핑마다 remount 돼 textarea 포커스가 날아간다) — 줄 수가 그대로인 편집(텍스트·표정·의상·숨김)에서는 remount 되지 않아야 한다.
<!-- /NA-PROV id=C08 -->

<a id="claudemd-cg-flash-voice"></a>
<!-- NA-PROV id=C10 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L59-64 sha256=b30a1770ce4ca564ab9b6d57476d15aeb4f178923990ad0ddd3429c036444328 -->
  - ⚠️ **판정 기준은 Expression 이름이 아니라 `attr` 존재**다 — 커스텀 표정 속성이 32비트 FNV-1a 해시라 injective 가 아니어서(D5) identity 비교로 바꾸면 기존 게임 출력이 달라진다. 반대로 `'neutral'` 은 커스텀이 항상 `'x'` 접두사라 `'기본'` 전용이 보장되고, base pool 엔 리터럴 `'기본'` 슬롯이 늘 있어 **base 재진입은 항상 `'기본'` 착지**다.
  - ⚠️ **미리보기 carry 는 논리 표정이 아니라 실제 표시된 attr**(생성기 `lastShown.attr` 대응). **화자 줄에서만** 논리 표정을 다시 계산하고, 비화자 의상 동기화·숨김 복원은 표시 attr 을 이어받아 다시 폴백을 태운다. 미리보기에 **별도 폴백 state machine 을 만들지 말 것**(판정이 갈리는 순간 그 버그가 되돌아온다).
  - ⚠️ `optedIn=false`(기본 의상 스프라이트 0)인 캐릭터는 **게임에 아예 안 나오므로** 미리보기가 **예전 `spriteAssetId` 경로를 그대로 유지**한다(D3 보존). 임의로 통합하지 말 것. `optedIn` 게이트는 `spriteSlots` 호출보다 **앞**에 있어야 한다.
  - 커스텀 **의상** 속성도 같은 해시라 충돌 가능(D6) — 그래서 미리보기 칸 조회는 `outfitAttr` 이 아니라 **논리 의상 이름**으로 한다. D5/D6 충돌 자체는 미해결이며 그 영역의 중복 image 승자는 보장 대상이 아니다.
- **CG 종료(`#CG끝`)의 canonical 은 대본 문법 하나다** — `#CG` 로 켠 CG 를 끄고 그 Scene 의 **일반 background** 로 되돌린 뒤 **그때 보여야 할 스프라이트를 즉시 복원**한다. Line 표현은 새 kind 가 아니라 기존 cg Line 의 optional field(`{ kind:'cg', desc:'', end:true }`)이고, ⚠️ **`desc:''` 자체를 종료로 해석하지 말 것**(설명 없는 `#CG` 도 `desc:''` 를 만든다 — 판정은 `end === true` 뿐). 종료 마커는 **`Scene.cg`·`cgAssetIds` 에 넣지 않는다**(에셋이 아니다). `applyTag` 에서 **`#CG` 보다 먼저** 매칭하고(`#아이템끝` 과 같은 순서 규칙), `CG: 끝` 류 필드형 문법은 만들지 않는다. ⚠️ **복원을 다음 dialogue/narration 으로 미루지 말 것** — 마커 그 줄에서 완료돼야 `#CG끝 → 선택지`·`→ 장면 종료` 에서도 일반 장면이 먼저 확정된다(선택지 화면이 CG 위에 뜨지 않는다). CG 가 안 켜진 상태의 `#CG끝` 은 **완전 no-op** 이다.
- **CG state helper 둘은 semantic 이 달라 합치면 안 된다** — `cgActiveFlags`(`src/types/project.ts`)는 **그 줄을 처리한 뒤의 per-line active range**(`-1`=일반, `0 이상`=`scene.cg` 인덱스, 다중 구간 지원)이고, `getFirstEffectiveCgIndex`(`generators/outfit`)는 **이 Scene 의 최초 CG boundary** 다. 레거시 폴백 장면의 첫 줄이 `#CG끝` 이면 전자는 `[-1,…]`, 후자는 `0` 이고 **둘 다 맞다**. ⚠️ `getFirstEffectiveCgIndex = cgActiveFlags.findIndex(...)` 로 합치면 그 장면에서 **Outfit AI writable 이 장면 전체로 열린다**. 레거시 폴백의 "시작 마커 있는가" 판정은 `hasCgStartMarker` 단일 소스로 세 곳(두 helper + 생성기)이 공유한다 — `l.kind === 'cg'` 로 재면 종료 마커를 시작으로 세어 폴백이 조용히 죽는다.
<!-- /NA-PROV id=C10 -->

<a id="claudemd-cg-restore"></a>
<!-- NA-PROV id=C11 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L65-66 sha256=c100feeb0aceab7eb15d069c393a81bb76092cfd31dfb925193f43f8a84deb04 -->
- **SceneCard 의 수동 CG 종료 삽입(`🖼끝`)은 parsed-only edit 이고 canonical 은 `insertCgEndAfterLine`(`src/store/scriptSlice.ts`) 하나다** — CG active 인 dialogue/narration **바로 뒤(`index + 1`)** 에 기존 마커 `{ kind:'cg', desc:'', end:true }` 를 꽂을 뿐이라 **parser·Preview·생성기 CG semantic 은 무수정**이다(범용 `insertLine` 을 만들지 말 것 — 임의 kind 삽입은 `#아이템끝` 짝·`play music` 시작점 같은 상태 전이 semantic 을 UI 로 흘린다). guard = 장면·index·kind·`cgActiveFlags[i] >= 0`·**바로 다음 줄이 이미 `end:true` 가 아님** 이고, ⚠️ **guard 전부가 `invalidateOutfitSuggestions`·`setScenes`·`flash` 보다 먼저**여야 한다(무효·중복 요청이 검수 중인 의상 제안을 날리면 안 된다 — `deleteLine` 과 같은 순서 계약). 중복 판정은 **바로 다음 줄 하나만** 본다(뒤쪽 마커 탐색·CG timeline 편집 정책 금지). 기존 Line 은 **참조 그대로** 밀고 `Scene.cg`·`cgAssetIds` 는 건드리지 않는다(종료는 에셋이 아니다). ⚠️ **`rawInput` 은 자동 수정하지 않는다** — save/load·`.npproj.zip`·협업에는 남지만 **원본에 `#CG끝` 이 없는 채로 재분석하면 사라진다**(`deleteLine`·`setLineText` 와 같은 source/parsed-data 계약). **save/load persistence 와 rawInput reparse persistence 는 다른 계약이고, 재분석은 undo 가 아니다** — reverse writer·source map·provenance·Line UUID·삭제/undo UI 를 만들지 말 것.
- **SceneCard 의 두 CG 판정은 이미 다르고 앞으로도 달라야 한다** — 수동 `👗`·`🖼끝` 은 **`cgActiveFlags`(per-line 상태)**, Outfit **AI** cutoff 는 **`getFirstEffectiveCgIndex`(최초 경계)** 다(위 "CG state helper" 항목의 divergence 를 UI 쪽에서 그대로 지킨다). dialogue/narration 은 CG 상태를 바꾸지 않아 `flags[i-1] === flags[i]` 이므로 그 두 kind 에선 **before/after off-by-one 이 없다**(`flags[index] >= 0` 하나로 충분). ⚠️ 조건 불충족 시 `🖼끝` 은 **disabled 가 아니라 미렌더**다(CG 가 아닌 줄의 "CG 종료" 버튼은 의미가 없다 — 이유를 알려야 하는 `👗` 와 반대 판단이다).
<!-- /NA-PROV id=C11 -->
