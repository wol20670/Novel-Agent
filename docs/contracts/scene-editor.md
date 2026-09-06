# Contract — Scene Editor (SceneCard / SceneLineRow · line identity · CG · 수동 편집)

> 이 문서는 **"앞으로 무엇을 깨면 안 되는가"의 정본**이다. 무슨 일이 있었는가는
> [`post-v1.md`](../history/post-v1.md) · [`stabilization-r0-r4.md`](../history/stabilization-r0-r4.md).
> **이 문서와 코드가 다르면 코드가 이긴다.** history 는 현재 contract 를 override 하지 못한다.

<a id="line-identity"></a>

## Line identity — R5 입력의 canonical (⚠️ 여기가 유일한 정본)

**`Line` 에는 stable id 가 없다.** 줄은 **배열 인덱스**로 참조된다 —
`setLineEmotion(sceneId, lineIndex)` · `line.voiceAssetIds` · 음성 파일명 `{charId}_{sceneLabel}_{lineIdx}`.
"index 의존 금지"를 요구하면 그건 **저장 포맷 마이그레이션 + 음성 파일 경로 + `mergeScenes` 매칭**까지
건드리는 **별도 대형 작업**이다 — 어떤 Phase 안에 슬쩍 넣지 말 것. `Scene.id` 는 있다.

현재 이 부재를 우회하는 장치는 셋이고, **각각 다른 계약**이다:

```
positional UI state   : key={`${scene.lines.length}:${i}`}  (LineRow remount 신호)
async 커밋 anchor      : request-time content anchor        (voice · 번역 · 표정)
QA / 제안 stale 판정   : content anchor 또는 revision epoch
```

**R4 가 line identity 를 해결하지 않았다** — `SceneCard`/`SceneLineRow` 분리에서
`key={`${scene.lines.length}:${i}`}` 와 그 workaround 의 semantic 을 **그대로 유지**했고
`Line.id` · UUID · stable key helper · line migration · delete/insert identity redesign 을 하지 않았다.
**line identity audit 은 R5 scope 다.**

⚠️ **이 문서에서 R5 를 설계하지 않는다.** 위는 기존에 확정된 사실의 정리다.
동일 입력(화자·원문이 완전히 같은 두 줄)을 구별하지 못하는 rare ambiguity 는
번역 QA·Voice·표정 전 축에서 **같은 등급의 accepted limitation** 이다
→ [ai-workflows.md](./ai-workflows.md)

## `Scene.lines` 길이가 바뀌는 변경의 필수 방어 2건

**positional transient state 를 반드시 무효화해야 한다.**

1. **`LineRow` 로컬 state**(`editing`·`voiceOpen`·`outfitOpen`)가 **다른 줄로 이월되면 안 된다**
   → 카드가 `scene.lines.length` 를 **key 에 섞어** remount 시킨다.
2. **`ScenePlayer` 의 `step`** 이 **밀린 다른 줄을 가리키면 안 된다**(렌더 clamp 는 범위만 막지 이걸 못 막는다)
   → 플레이어의 **reset effect deps** 에 `scene.lines.length` 가 들어 있다.

⚠️ **key 를 내용(text) 기반으로 만들지 말 것** — 타이핑마다 remount 돼 textarea 포커스가 날아간다.
줄 수가 그대로인 편집(텍스트·표정·의상·숨김)에서는 remount 되지 않아야 한다.
⚠️ 길이가 같은 복합 구조 변경(삭제+추가 동시)에서는 length 기반 reset 이 안 걸릴 수 있다 —
단일 줄 삭제/삽입 경로엔 해당 없고 기존 동작과 동일이라 회귀가 아니다.

## R4 — SceneCard / SceneLineRow 책임 경계 (새 범용 버킷을 만들지 말 것)

```
SceneCard.tsx      scene-level data acquisition · scene-level derived state ·
                   collaboration presence · header/status/selection · background preview ·
                   metadata editing · scene-level outfit controls ·
                   scene-wide AI outfit suggestion controls · line-list orchestration ·
                   scene summary(CG/choice/jumpTo) · footer upload/approve
SceneLineRow.tsx   special line marker rendering(CG/item/BGM) · dialogue/narration editing ·
                   translation QA rendering/dismiss · voice UI · per-line hide state ·
                   per-line outfit state · CG-end insertion · emotion picker · line deletion ·
                   LineRow 전용 private helpers
```

- **public boundary 는 `SceneCard → SceneLineRow` 의 `LineRow` 단방향 import 하나뿐**이다 —
  경계를 넘는 심볼이 그것 하나이고 **callback passthrough 0 · 새 context/framework 0**.
- ⚠️ 두 파일을 다시 합치거나 `SceneCardSections.tsx` 류 범용 버킷으로 재분할하지 말 것.
- **parent / child ownership (이동 0 — 이게 계약이다)**: `LineRow` props **11개 유지**.
  `sceneId`·`index`·`line`·`scene` = line identity / render context.
  `charMap`·`effHidden`·`outfitChars`·`outfitFlagsByChar`·`cgFlags`·`suggestions`·`qaIssues`
  = parent 가 카드 단위로 계산·그룹핑해 줄에 배분하는 **기존** derived 값.
- ⚠️ **`SceneCard` 의 `useMemo` derived 계산을 줄 계층으로 옮기지 말 것**
  (줄마다 store 구독·resolver 재실행을 없앤 기존 성능 구조).
  `LineRow` 로컬 state `editing`/`voiceOpen`/`outfitOpen` ownership 유지 ·
  줄 단위 store action 은 line 계층이 직접 구독한다. **새 store action / State 필드 = 0.**

## R3 — navigation DOM contract 5개 (전부 `SceneCard` parent 영역)

```
root id            = `scene-${sceneId}`
root click         → selectScene(sceneId)
selected card      = border-accent
scroll-mt-4 anchor 유지
제목 input onClick   stopPropagation 유지
```

⚠️ **제목 `input` 을 클릭하면 root 의 `select(sceneId)` 가 호출되지 않는다** —
automation 에서 root selection 을 재현할 땐 input 이 아니라 **root/패딩 영역**을 클릭해야 한다.

**canonical navigation transition 은 기존 `jumpToScene(id)`(`src/components/sceneJump.ts`) 재사용**:

```
selectScene(id) → setActiveTab('scenes') → 기존 requestAnimationFrame 스크롤
```

⚠️ **AssetsTab 에서 클릭하는 순간에는 scene target DOM 이 아직 없다**(장면 트리가 언마운트돼 있다).
그래서 순서가 중요하다 — `selectScene` → `setActiveTab('scenes')` 를 **먼저** 하고, **그 다음 기존 rAF
callback 에서** `scene-${id}` 를 조회한다. rAF 조회에서도 target 이 없을 때에만 상태 전이는 유지된 채
스크롤만 생략된다. ⚠️ *"클릭 순간 DOM 없음 = 스크롤 생략"* 으로 단정하지 말 것.
그 위에 재시도·복구·타임아웃·stale-reference recovery 를 얹지 말 것.
**새 navigation store/action/framework/router 0**, `sceneJump.ts` 는 한 줄도 고치지 않는다.

**AssetsTab 책임 경계**(R3 — 새 범용 버킷 금지):

```
AssetsTab.tsx            top-level orchestration + 작은 순서 결합 row 유지
assetGroups.ts           AssetsTab 전용 순수 group derived data (JSX 0 · leaf 유지)
AssetGroupRows.tsx       Background/CG/Item/BGM group rendering + Background/BGM usage navigation
CharacterCard.tsx        CharacterCard + 전용 sprite helpers
VoiceSection.tsx         project-wide TTS cost/batch/review
AssetCleanupSections.tsx local/remote orphan cleanup pair
```

- usage derived-data: `sceneIds` = 실제 navigation identity / `sceneLabels` = UI-only 표시 데이터.
  라벨 = **global scene ordinal + title**(`#3 밤, 상가거리`), 빈 title 은 `#N` fallback.
  ⚠️ 파서가 `장면:` 마다 새 Scene 을 만들어 **같은 제목의 장면이 여럿 존재**하므로 제목만으로는 안 되고,
  ⚠️ ordinal 은 filter 후 순번이 아니라 **project `scenes` 배열의 global index** 다.
  이 데이터는 **어떤 schema 에도 저장되지 않는다**(렌더 파생값).
- ⚠️ `src/assetRefs.ts`(참조/GC canonical)와 이 UI-derived usage data 를 **혼동하지 말 것** — 목적이 다르다.
- **CG/Item navigation 은 R3 non-goal 이고 추가하지 않았다.**
  접근성은 native button/select semantic 그대로(role·tabIndex·키 핸들러 자작 0),
  이름은 `aria-label` 이 정본이고 `title` 은 마우스 툴팁 전용이다.

## 대본 한 줄 수동 삭제 — `deleteLine(sceneId, lineIndex)`

canonical 은 `deleteLine`(`src/store/scriptSlice.ts`) **하나**다.

```
허용 kind   : dialogue · narration 뿐
거절        : 없는 장면 · 범위 밖 · item/cg/bgm 마커 → 완전 no-op
UI          : 삭제 전 window.confirm 1회 (기존 관용구 재사용 — 새 모달 금지)
```

- `item`·`cg`·`bgm` 은 **상태 전이 semantics**(CG cutoff · `play music` 시작점 · `#아이템끝` 짝)라 제외이고
  장면 카드에도 버튼이 안 나온다.
- ⚠️ **guard 가 `invalidateOutfitSuggestions()` 보다 먼저**여야 한다
  (무효 요청이 검수 중인 의상 제안을 날리면 안 된다 — `tests/line-delete.test.ts` 가 이 순서를 고정한다).
- Line-local 데이터(`i18n`·`emotion`/`emotionAuto`·`outfits`·`hideSprites`·`voiceAssetIds`)는
  **객체와 함께 자연 소멸**한다. 필드별 cleanup 시스템을 추가하지 않는다.
  음성 blob 회수는 **기존 고아 에셋 경로**가 담당한다.
- 축별 처리: Outfit AI = 기존 `invalidateOutfitSuggestions()` 재사용 / Expression = Line-local 이라 별도 무효화 없음 /
  Translation QA = **캐시를 직접 clear 하지 않는다**(기존 `activeQaIssues` content-anchor 가 stale 을 거른다) /
  Voice = 연결만 함께 사라지고 파일 회수는 기존 고아 경로.
- ⚠️ **UUID · tombstone · soft-delete · undo · index remapping 을 만들지 않았다.**

## CG 종료 — 대본 문법 `#CG끝` 과 수동 삽입 `🖼끝`

### 대본 문법(canonical)

`#CG` 로 켠 CG 를 끄고 그 Scene 의 **일반 background** 로 되돌린 뒤
**그때 보여야 할 스프라이트를 즉시 복원**한다. Line 표현은 새 kind 가 아니라 기존 cg Line 의 optional field:

```
종료 마커 : { kind: 'cg', desc: '',    end: true }
일반 CG   : { kind: 'cg', desc: '...', end: undefined }
```

- ⚠️ **`desc === ''` 자체를 종료로 해석하지 말 것** — 설명 없는 `#CG` 도 `desc: ''` 를 만든다.
  판정은 **`end === true` 뿐**이다.
- 종료 마커는 **`Scene.cg`·`cgAssetIds` 에 넣지 않는다**(에셋이 아니라 control marker).
- `applyTag` 에서 **`#CG` 보다 먼저** 매칭한다(`#아이템끝` 과 같은 순서 규칙).
  ⚠️ `CG: 끝` 류 필드형 문법은 만들지 않는다("끝"이라는 이름의 CG 와 구별할 수 없다).
- ⚠️ **복원을 다음 dialogue/narration 으로 미루지 말 것** — 마커 그 줄에서 완료돼야
  `#CG끝 → 선택지` · `→ 장면 종료` 에서도 일반 장면이 먼저 확정된다(선택지 화면이 CG 위에 뜨지 않는다).
- CG 가 안 켜진 상태의 `#CG끝` 은 **완전 no-op** 이다.
- merge identity 무변경 — 기존 CG 키 `cg||<desc>` 는 byte-for-byte 유지되고 종료 마커만 `cg|end|` 로 갈린다.

### ⚠️ CG state helper 둘은 semantic 이 달라 합치면 안 된다

```
cgActiveFlags(scene)        = 그 줄을 처리한 뒤의 per-line active range
                              (-1 = 일반, 0 이상 = scene.cg 인덱스, 다중 구간 지원)
getFirstEffectiveCgIndex()  = 이 Scene 의 최초 CG boundary (1회)
```

대표 edge — `Scene.cg=['legacy']` · `lines[0]=#CG끝` · `lines[1]=dialogue`:

```
cgActiveFlags            = [-1, -1]   (지금은 일반 장면 → 수동 의상 허용)
getFirstEffectiveCgIndex = 0          (이 장면은 시작부터 CG 였다 → AI writable 0줄)
```

**둘 다 의도된 값**이다. `getFirstEffectiveCgIndex = cgActiveFlags.findIndex(...)` 로 합치면
그 장면에서 **Outfit AI writable 이 장면 전체로 열린다**. 레거시 폴백의 "시작 마커 있는가" 판정은
`hasCgStartMarker` 단일 소스로 세 곳(두 helper + 생성기)이 공유한다 —
`l.kind === 'cg'` 로 재면 종료 마커를 시작으로 세어 폴백이 조용히 죽는다.
⚠️ `Scene.cgRanges`·timeline·persistent range state 를 만들지 않았다.

### SceneCard 의 두 CG 판정은 이미 다르고 앞으로도 달라야 한다

```
SceneCard 수동 👗 · 🖼끝  = cgActiveFlags[index]        (per-line 상태)
Outfit AI cutoff          = getFirstEffectiveCgIndex    (최초 경계)
```

dialogue/narration 은 CG 상태를 바꾸지 않아 `flags[i-1] === flags[i]` 이므로 그 두 kind 에선
**before/after off-by-one 이 없다**(`flags[index] >= 0` 하나로 충분).

### 수동 삽입 `🖼끝` — canonical 은 `insertCgEndAfterLine(sceneId, lineIndex)`

CG active 인 대사·지문 **바로 뒤(`index + 1`)** 에 기존 마커를 꽂을 뿐이라
**parser·Preview·생성기 CG semantic 은 무수정**이다.

```
삽입 위치    : lineIndex + 1
허용 kind    : dialogue · narration 뿐
허용 상태    : cgActiveFlags[lineIndex] >= 0
중복 방지    : 바로 다음 줄이 이미 end:true 면 no-op
무효 요청    : 완전 no-op
기존 Line    : 객체 참조 그대로 뒤로 밀린다(복제·정규화 없음)
건드리지 않음: Scene.cg · cgAssetIds · rawInput
```

- ⚠️ **범용 `insertLine` 을 만들지 말 것** — 임의 kind 삽입은 `#아이템끝` 짝·`play music` 시작점 같은
  상태 전이 semantic 을 UI 로 흘린다(`deleteLine` 이 그 kind 들을 거절하는 것과 같은 이유).
- ⚠️ **guard 전부가 `invalidateOutfitSuggestions`·`setScenes`·`flash` 보다 먼저**다(`deleteLine` 과 같은 순서 계약).
- 중복 판정은 **바로 다음 줄 하나만** 본다(뒤쪽 마커 탐색·CG timeline 편집 정책 금지).
  다음 줄이 새 `#CG` 시작 마커인 경우는 막지 않는다.
- 버튼은 조건 불충족 시 **disabled 가 아니라 미렌더**다(CG 가 아닌 줄의 "CG 종료"는 의미가 없다 —
  이유를 알려야 하는 `👗` 와 **반대 판단**이다).

## 수동 의상 전환 (줄 `👗` 패널)

- **새 의상 전환 시스템을 만들지 않았다** — 값은 `Line.outfits`, 쓰기는 `setLineOutfit`(→ `mergeLineOutfit`)
  **하나뿐**이라 수동 지정과 수락된 AI 제안이 canonical 에서 **구별되지 않는다**.
  수동 전용 state·mutation·레코드 직접 조립을 만들지 말 것 — 같은 줄의 다른 캐릭터 지정 보존이 그 머지에 달려 있다.
- 저장 index = **패널을 연 바로 그 줄**, 의미는 파서 `#복장`·AI 와 동일한 **"이 줄부터"**
  (패널이 줄 아래 펼쳐진다고 다음 줄에 쓰지 말 것).
- ⚠️ **경계가 AI 와 다르다 — 다시 합치지 말 것**: 수동은 `cgActiveFlags[index] < 0`
  (**CG active 구간만** 차단 → `#CG끝` 이후 다시 허용), Outfit **AI** 는 `getFirstEffectiveCgIndex` 그대로다.
  파생 조건(`manualOutfitWritable`)을 **진입 버튼과 열린 패널 양쪽에** 걸어, 패널을 열어둔 뒤
  cutoff 가 앞으로 와도 다음 렌더에서 mutation 이 막힌다.
- ⚠️ **이미 있는 값의 해제(`✕`)는 그 경계와 무관하게 허용**해야 한다(CG 구간에 남은 값을 정리할 유일한 경로 ·
  자동 정리는 하지 않는다).
- 캐릭터 후보는 기존 `outfitChars`, 의상 후보는 `characterOutfits`. 의상 캐릭터가 0인 장면은 `👗` 자체가 안 보인다.
- ⚠️ **same-effective-outfit 지정은 별도 validation 을 두지 않아 가능하다**(accepted limitation).

## async 음성 첨부 — request-time anchor

음성 작업은 `(sceneId, lineIndex)` 만 들고 TTS·업로드를 건너가므로, 그 사이 줄이 추가·삭제되면
**같은 좌표의 다른 대사**에 `voiceAssetIds` 가 붙는다(예전 커밋 경로는 `kind === 'dialogue'` 만 봤다).

- anchor `{ speaker, canonical line.text }` 는 **최초 async boundary 이전**에 뜬다 —
  단건은 `VoiceLab.generate`/`attachToLine`, 배치는 `collectVoiceTargets`(`anchorSpeaker`/`anchorText`).
  ⚠️ **`attachVoiceQuiet` 진입 시점에 현재 줄을 읽어 anchor 를 만들지 말 것** — 거긴 TTS 가 끝난 뒤라
  이미 밀려 들어온 대사에서 anchor 를 뜨게 되어 검증이 통과한다. live Line 참조가 아니라 **문자열 복사본**이어야 한다.
- **판정 단일 소스는 `voiceLineAnchorMatches`(`src/store/helpers.ts`)** 하나다.
- 검증은 **진입 fail-fast + 커밋 직전** 두 곳이고, 어긋난 항목은 **그 항목만 drop**
  (run 전체 폐기·좌표 remap 금지 — 남은 blob 은 기존 고아 에셋 스윕이 회수).
- ⚠️ `VoiceBatchItem.text` 는 **synthesis input**(비-base 로케일이면 번역문)이라 identity anchor 로 쓰지 말 것.

## `flash` 는 단일 `toast` state 다

한 액션에서 두 번 부르면 앞 메시지가 조용히 사라진다. `invalidateOutfitSuggestions` 는 pending 이 있을 때
자체 flash 를 내므로, 그걸 부르고 또 알릴 액션은 **호출측에서 pending 을 먼저 세어 마지막 합성 메시지
하나에 담는다**(`insertCgEndAfterLine` 이 그 예: pending 계산 → invalidate → `setScenes` → 합성 flash).
⚠️ 공유 액션에 `silent` 플래그를 달거나 toast 큐/새 알림 시스템을 만들지 말 것.

## rawInput / 재분석 계약 (헷갈리기 쉬운 지점)

```
save/load persistence  ≠  rawInput reparse persistence
```

`deleteLine`·`setLineText`·`insertCgEndAfterLine` 은 **`Scene.lines` 만** 고치고
**`project.rawInput` 은 건드리지 않는다.**

- **유지되는 곳** — localStorage save/load · `.npproj.zip` · 협업 · 생성 출력(전부 parsed Scene 을 쓴다).
- **사라질 수 있는 곳** — 원본 대본에 그 내용이 없는 채로 같은 rawInput 을 다시 분석하면 수동 편집이 빠진다.
- ⚠️ **재분석을 undo·복구 수단으로 설명하지 말 것.** 버튼 title 과 토스트도
  *"재분석 시 사라질 수 있다"* 는 경고까지만 하고 복구 경로를 안내하지 않는다.
- ⚠️ **rawInput reverse writer · parser source map · source provenance · Line UUID · undo UI 를 만들지 말 것.**
- 의상은 기존 `mergeScenes` 그대로: 원본에 `#복장` 이 있는 줄은 재분석 때 **대본 값으로 되돌아가고**,
  태그가 없는 줄의 수동 값은 **유지**된다(`next.outfits ?? prev.outfits`).

## 장면 카드의 Translation QA — UI 표시·상호작용 계약만

> semantic / equivalence / anchor / 파서 / 캐시 재사용 규칙은 [ai-workflows.md](./ai-workflows.md) 가 정본이다.

- 표시: SceneCard 헤더 `⚠ N` · 로케일 칸별 경고 + 이유 · `문제 없음` 버튼.
- 전체 의심 카운트 클릭 = **다음 의심 장면으로 이동**(끝이면 wrap). 기준점은 기존 `selectedSceneId` 이고
  **새 QA cursor state 를 만들지 않는다**. 스크롤은 `components/sceneJump.ts` 의 검증된 루틴 그대로
  (⚠️ 알고리즘·재시도 프레임 수·타이밍을 손대지 말 것 — content-visibility 환경 실측값).
  이동은 **장면 카드까지만**이다(로케일 입력 focus·issue navigator 를 만들지 않는다).
- ⚠️ **UI 에서 `setLineTranslation` 뒤에 `clearTranslationQa` 같은 걸 부르지 말 것**
  (다른 칸의 유효 결과까지 날아간다).
- ⚠️ **QA 실행 중 중복 실행·전체 재검수 disable 은 UX 가 아니라 store concurrency 경계**다
  (스토어에 동시 실행 guard 가 없다 — 의도적). 진행률 단위는 장면이 아니라 **AI 요청**이다.
- ⚠️ **전체 재검수는 confirm 전에 캐시를 지우지 않는다**(취소했는데 기록이 사라지면 안 된다).
