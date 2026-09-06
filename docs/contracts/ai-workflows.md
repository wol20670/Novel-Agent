# Contract — AI 워크플로우 (Expression · Outfit · Translation/QA)

> 이 문서는 **"앞으로 무엇을 깨면 안 되는가"의 정본**이다. 무슨 일이 있었는가는
> [`v1-ai-phases.md`](../history/v1-ai-phases.md) · [`post-v1.md`](../history/post-v1.md).
> **이 문서와 코드가 다르면 코드가 이긴다.** history 는 현재 contract 를 override 하지 못한다.
> ⚠️ 이 문서에 Phase 1~19 history 를 복사하지 않는다 — 근거가 필요하면 history 링크를 따라갈 것.

앱의 AI 는 **텍스트·보이스 전용**이다: OpenAI `gpt-4o-mini`(번역 고품질 모드만 `gpt-4o`) —
대본 번역(영/일) · GUI 테마 · 표정 자동 배정 · 의상 전환 추천 / Typecast: TTS.
**이미지·BGM 은 앱이 생성하지 않는다.**

⚠️ **production contract 는 "AI 초벌 → 사람 검수"** 다. 개별 semantic 오답은 그 자체로 blocker 가 아니다.

---

## 1. Expression AI (표정) — Phase 18 에서 실사용 baseline 으로 동결

**동결 baseline = `931a2cc`(Phase 16 구현) 코드 상태.**
⚠️ **새 blocker 없이 이 계약을 재튜닝하지 말 것**(§5 재튜닝 금지 목록).

### 판정 단일 소스

**표정 판정은 `resolveEmotion`(`src/generators/emotion/resolve.ts`) 하나**다 —
생성기·미리보기·장면카드가 각자 계산하면 어긋난다. **동기·순수**여야 한다(렌더 중 호출).

```
우선순위 = 작가 태그(Line.emotion) > AI 배정(Line.emotionAuto) > 휴리스틱(infer.ts) > '기본'
```

⚠️ **작가 태그는 검증하지 않는다** — 파서가 `이름(당황):` 을 "작가 신뢰"로 자유 문자열 채택하므로,
선언 목록으로 거르면 대본 태그가 조용히 무시된다. 검증 대상은 사람이 안 쓴 값(AI·휴리스틱)뿐이다 —
휴리스틱은 `project.expressions` 를 모른 채 옛 기본 6종만 뱉어서, 커스텀 세트에선 유령 표정 슬롯 +
플레이스홀더가 게임에 섞인다.
⚠️ **AI 후보 집합(`availableExpressions`)과 최종 검증 집합(선언 목록)은 다르다** —
같게 만들면 "업로드 전 임시 실루엣" 워크플로가 죽는다.

### 후보 pool (Phase 15 `e9311f3`) — 화면의 의상 pool 폴백과 일치해야 한다

```
추가 의상이 직접 소유한 truthy asset 이 1개 이상 → 그 의상 소유분만 available
추가 의상 pool 이 완전히 비었음                   → 기본 의상 pool 재진입
최종 후보 = effectiveExpressions 선언 순서로 availability membership filter
```

- ⚠️ **`spriteAssetId` 같은 "표정 단위 기본 의상 폴백"을 후보 생성에 되살리지 말 것** —
  부분 업로드 의상에서 base 전용 표정이 후보로 살아나 실제로는 neutral/`pool[0]` 로 강등된다
  (AI 가 슬픔을 골랐는데 게임은 웃는 얼굴).
- ⚠️ `resolve.ts` 에서 `generate.ts` 를 **import 하지 말 것**(순환) — 후보를 직접 소유분으로 좁히면
  import 없이도 `selectSprite` 결과와 일치한다.
- **후보 순서의 정본은 `effectiveExpressions(project.expressions)` 선언 순서**이고 반환 Set 은 멤버십 전용이다.
- **후보가 0이면 그 줄이 AI 대상에서 빠지는 게 정상**이다.
  ⇒ 견적의 계약은 **"숫자 불변"이 아니라 실행과 같은 planner 를 쓰는 것**
  (`collectEmotionTargets`/`planEmotionChunks`). *"target 은 항상 불변"* 이라고 쓰지 말 것.
- **기존 `emotionAuto` 는 소급 변경하지 않는다**(Phase 8 automatic invalidation 금지 유지).
  새 규칙으로는 안 나올 값이어도 자동 삭제·migration 하지 않는다 — 복구는 `clearEmotionAuto`·수동 override 뿐.

### 프롬프트 두 축 (Phase 16 `931a2cc`, `aiSelect.ts` 의 `BASE_SYSTEM_PROMPT`·`CONTEXT_RULE`)

```
semantic evidence (감정 판단 근거)      = 전체 scene/context — 타 화자 대사·지문·scene 메타 계속 사용
continuity ownership (previous state)  = 그 화자 자신의 이전 표정만, 타 캐릭터 승계 금지
```

옛 문안은 소유 범위가 **줄 단위**였는데 payload 는 여러 화자·지문이 뒤섞인 **하나의 시간축**이라
타 화자의 표정을 현재 화자의 previous state 로 승계하라는 지시가 됐다.

- ⚠️ **범위를 좁힌다고 "같은 화자의 이전 줄만 보라"로 쓰지 말 것** — evidence 가 빠지는 정반대 회귀다
  (테스트 T-B 전용 가드).
- anti-flicker 는 없앤 게 아니라 **범위만** 좁혔고, 변경 **횟수** sparsity prior 는 넣지 않는다(Phase 11 A 교훈).
- ⚠️ live 결과를 *"cross-speaker bleed 수정"·"품질 개선"* 으로 인용하지 말 것 —
  synthetic fixture 3개에서 before/after 가 전부 동일했고 baseline 도 틀리지 않았다.
  정확한 문장: **"invalid continuity scope 는 deterministic 하게 확인됐으나 이번 최소 live fixture 에서는
  baseline user-facing bleed 가 재현되지 않음"**.

### 요청의 "배정 대상"과 "문맥"은 다른 축이다 (`aiSelect.ts`)

`EmotionBatch.scriptLinesByIndex` 는 장면의 **모든** 대사·지문을 담고(target 줄 포함),
요청별 제외는 `planEmotionChunks` 가 **그 요청의 target 만** 빼는 방식으로 한다.

- ⚠️ 문맥 source 를 "target 이 아닌 줄"로 만들면 **문맥 전용 줄이 없는 장면이 여러 청크로 쪼개질 때
  두 번째 요청의 문맥이 0** 이 된다. 테스트 T7b 가 잡는 건 **딱 그 회귀**이고,
  *"문맥이 절대 안 빈다"* 거나 *"직전 target 3줄이 항상 남는다"* 는 보장이 **아니다** —
  문맥은 요청당 60줄·2000자 상한이고 넘치면 **오래된 쪽부터** 버린다.
- 빈 텍스트 필터(`!text.trim()`)는 **문맥 source 에만** 걸 것(target gate 엔 원래 텍스트 검사가 없어
  거기 끼우면 조용한 대상 축소가 된다).
- 문맥의 `expr` 은 **저장된 값(`emotion || emotionAuto`)만**이고 휴리스틱·폴백은 넣지 않는다.
- 쓰기 경계는 `parseEmotionResponse` 의 `itemByIndex` 하나 — **문맥에 있다고 target 으로 인정하면 안 된다.**

### 커밋 재검증 (Phase 8)

표정 AI 는 async 결과를 현재 project 에 그냥 merge 하지 않는다. 커밋 직전 **current snapshot 하나**로
대상·청크·요청을 다시 만들어 재검증하고, 어긋난 것만 버린다(run 전체 폐기 아님).
쓰기 base 는 항상 `currentProject.scenes` — 실행 중 사용자의 무관한 편집은 **보존된다**.
**검증~`setScenes` 사이에 `await` 을 넣지 말 것.**

- **의상 변경은 기존 `emotionAuto` 를 자동으로 지우거나 다시 계산하지 않는다**(자동 invalidation 금지).
- **"의상 제안 무효화"와 "표정 AI 초기화"는 서로 다른 개념**이다(전자는 `outfitSuggestions`+revision,
  후자는 `emotionAuto` 전용, 서로를 건드리지 않는다).
- **표정 AI 초기화는 자동값 전용** — 사람이 정한 `emotion` 과 의상·번역·보이스·상태는 보존한다.
  권장 작업 순서는 **Outfit 확정 → Expression AI**.

---

## 2. Outfit AI (의상) — Phase 14 에서 동결

### 제안은 저장되는 데이터가 아니다

`src/generators/outfit/`, store `outfitSuggestions` — project 밖 런타임 state 라
**새로고침·저장·`.npproj.zip`·협업 어디에도 안 실린다.**
**수락한 값은 그냥 기존 `Line.outfits` manual 값**이고 provenance 는 일부러 사라진다
(표정의 `emotionAuto` 처럼 AI 전용 필드를 만들지 말 것 — 의상은 sparse+carry 라 오답이 다음 변화까지 계속 간다).
줄별 의상 값은 언제나 `outfitFlags` 에서 읽는다 — **AI 전용 fold/state machine 을 새로 만들면
그 순간 판정이 둘로 갈라진다.**

### 응답의 `kind` 는 parser-local transient wire 필드다 (Phase 13 `81b7f7f`)

`changes[]` 가 **semantic candidate envelope**(`transition`/`non_transition` 둘 다 옴)이 됐고
파서의 **`S` 게이트**가 `non_transition` 만 추가로 거른다. **위치가 계약이다**:

```
B → C → C2 → D → E → F → G → S → seen.add → chronology
```

- S 를 **반환 직전 filter 로 옮기면** 거부된 행이 뒤 항목의 `G(no-op)` 전제를 바꾼다
  (거부 행은 `seen` 도 연대기도 건드리면 안 된다).
- **fail-open**: `missing`·unknown 문자열·wrong type 은 **legacy accept**
  (모르는 값을 `non_transition` 으로 넘겨짚지 말 것). JSON 자체 malformed 는 기존대로 throw.
- **정규화 3축을 섞지 말 것** — identity(`normalizeOutfitLabel`, **lowercase 없음**, fuzzy 없음) /
  `kind`(NFKC+trim+공백+lowercase 후 두 토큰 exact) / `i`(기존 numeric coercion).
- `kind` 는 `OutfitChange` 밖으로 나가지 않는다(store·UI·save·zip·export 무변경).
- **같은 응답 안의 연쇄 전환은 파서가 시간순으로 읽는다**(Phase 11) — 앞선 valid transition 을
  함수-local 가정으로만 반영해 뒤 항목의 `G` 를 판정한다. **canonical 상태도, 사용자 수락도 아니다.**
  **cross-window 는 여전히 비전파(의도)** 다. 검증 순서와 반환 순서는 다른 축이다
  (판정만 `i` 오름차순, **반환은 모델 출력 순서 그대로**).

### `FIXED_RULE`(프롬프트)은 두 의미를 동시에 지켜야 한다

- 작가가 적어둔 fixed 행은 **실제 전환이어도 authoritative context 라 AI 후보가 아니다**
  (재출력하면 파서 `E` 로 버려져 그 요청의 후보 하나를 헛되이 쓴다).
- **그 뒤의 later completed transition 은 window 시작 의상으로의 복귀 여부와 무관하게 계속 심사**해야 한다.
  후자를 "복귀"로만 좁게 쓰면 `기본 → fixed 체육복 → 사복` 같은 비복귀 전환이 raw 에서 통째로 사라진다.

### writable 경계

**raw `kind:'cg'` 가 아니라 first *effective* CG**(`getFirstEffectiveCgIndex`)다 —
`#CG끝` 이 생긴 뒤에도 **이 정책 그대로**이고, 생성기·미리보기와 같은 4갈래이며
**orphan 마커는 CG 를 안 켜므로 경계도 아니다**(그 뒤 transition 은 dead write).
⚠️ **AI writable 을 비연속 다중 range 로 넓히는 것은 `planOutfitWindows` chunking·lead-in·CG sentinel
전제를 깨는 별도 Phase 다.** 수동 `👗` 와 경계가 다른 이유는 [scene-editor.md](./scene-editor.md).

**hide 는 상태와 이벤트가 다른 개념**이다: `initialHidden`(첫 포함 줄 **직전** 상태) vs 실제 전이 마커.
`spriteHiddenFlags` 가 "그 줄 override 를 적용한 뒤" 값이라 전이는 `flags[i-1]` vs `flags[i]` 로 봐야 한다 —
요청마다 `prev=false` 로 시작하면 이미 숨은 구간에 **없던 hidden 이 생기고** 첫 줄의 실제 `hidden→shown` 은 사라진다.

### `applyOutfitSuggestion` · revision epoch

- **제안 목록 전체 clear 가 아니다** — 그 항목만 빼고 나머지는 남긴다(전체 clear 는 수동 편집 `setLineOutfit` 쪽).
  한 건 수락에 검수 목록이 통째로 날아가면 워크플로가 무너진다.
- `outfitSuggestionRevision` 은 provenance 가 아니라 **실행 중인 AI run 의 stale commit 을 막는 epoch** 이라,
  canonical 을 바꾸는 경로는 **async 면 첫 `await` 이전에** 올려야 한다(`removeOutfit` 이 그 예).
- 무효화 판정은 **액션 이름이 아니라 바뀌는 필드** 기준: `renameCgGroup`/`renameBackgroundGroup` 은
  에셋 액션처럼 보여도 `scene.cg`/`scene.background` **문자열**을 바꿔 대상이고,
  `importCgGroup`(`cgAssetIds` 만)·스프라이트 업로드는 대상이 아니다.

---

## 3. 번역 (`Line.i18n`) · 번역 QA

### 원문 ↔ 번역 유효성 (post-v1 번역 Phase 2)

**`Line.i18n` 은 그 줄의 "현재 KO 원문"에 대한 번역일 때만 유효하다.**
동치 관계의 단일 소스는 **`sameLooseText`(`src/project/mergeScenes.ts`)** 이고
**엑셀 병합 · 앱 직접 편집(`setLineText`) · 자동 번역 커밋(`autoTranslateAll`) 세 경로가 같은 답을 내야 한다**
(두 번째 구현·`Line` 을 받는 범용 identity 추상 금지 — `resolveEmotion` 과 같은 규칙).

- ⚠️ **manual 무효화를 "편집 완료" 시점으로 미루지 말 것** — `setLineText` 은 키 입력마다 autoSave
  (localStorage·협업 push)를 태우므로, 미루면 "새 원문 + 옛 번역"이 저장·전송·`tl/<lang>/script.rpy` 를
  통과하는 시간창이 생긴다(그래서 같은 state update 안에서 지운다).
- ⚠️ **async 커밋은 좌표를 믿지 않는다**: 요청 시점 anchor(`ko`·`speaker`·`narration`)로 커밋 직전 재검증하고
  **어긋난 항목만** 버린다(run 전체 폐기 아님 · 쓰기 base 는 현재 `scenes` · 검증~`setScenes` 사이 `await` 금지).
  검증은 **pending 을 바깥 루프로 도는 2-pass** 여야 한다 — 현재 scenes 를 map 하며 `updates.get(i)` 를 보면
  **줄이 삭제돼 index 가 사라진 결과는 방문조차 못 해 조용히 유실**된다.
- ⚠️ 표정의 `requestKey`(요청 원문 전체 비교)를 번역에 복사하지 말 것
  (번역 payload 엔 문맥 전용 줄이 없어 한 글자 편집이 40줄 청크를 통째로 버린다).
- 사람이 이미 채운 로케일은 **칸 단위**로 보존하고, `committed`/`skipped` 도 로케일 칸 단위로 보고한다.
- ⚠️ **이전 버전에서 이미 저장된 stale 번역은 소급 정리하지 않는다**(provenance 가 없다 —
  hash·version·UUID·migration 을 만들지 말 것). *"Phase 2 가 기존 데이터를 다 정리해준다"* 로 쓰지 말 것.

### 번역 QA — session-only review layer (post-v1 번역 Phase 3)

`src/generators/translate/qa.ts`, store `translationQa` 는 **canonical 을 고치지 않는 session-only review layer** 다.
결과는 project 밖 런타임 state 라 저장·`.npproj.zip`·협업 어디에도 안 실리고, `Line.i18n` 을 **읽기만** 한다.

- 유효성은 **source+target exact anchor** 다. ⚠️ **Phase 2 의 `sameLooseText` 를 여기 쓰지 말 것** —
  그쪽은 만들어진 *산출물*을 표기 편집에서 지키는 것이고, QA 는 그 두 문자열에 대한 *transient 판단*이라
  엄격한 쪽이 안전하다.
- 표시·커밋 판정의 단일 소스는 `activeQaIssues`/`isQaResultValid` 이고
  **global revision epoch·Line UUID·translation hash/version·persistent QA metadata·`Scene.status` 자동 변경을
  만들지 않는다**(stale 은 배선이 아니라 판정으로 처리한다).
- **deterministic 은 copy-through rule 하나뿐**(`detectCopyThrough`):
  `sourceLocale==='ko'` ∧ `targetLocale∈{en,ja}` ∧ `target.trim()===source.trim()` ∧ 원문에 한글 음절.
  ⚠️ **두 번째 heuristic 을 추가하지 말 것** — 길이·문장부호·"한글 포함"·중복 번역은 FP 가 커서 전부 기각했고,
  이 rule 을 generic language-heuristic framework 로 키우는 건 이 rule 의 확장이 아니다.
- 규칙 hit 은 AI 배치에서 빠지고, **AI 대상이 0이면 키를 확인하지도 않으며** 키가 없거나 요청이 실패해도
  이미 확정된 규칙 결과·이미 성공한 AI 결과는 커밋된다(run 전체 폐기 금지 — UI 에서 키 유무로 실행을 막지 말 것).
- AI reviewer 는 **로케일 칸 단위**다. 입력은 `source`·`sourceLocale`·`target`·`targetLocale`·`speaker`·
  `narration` 뿐이고 **주변 문맥을 싣지 않는다**. 분류는 `meaning|omission|addition|language` 4개이고
  **style·naturalness 는 review 대상이 아니다**. 확신이 낮으면 `ok`, **대체 번역은 출력도 적용도 하지 않는다**.
  모델은 `translateModelFor(translateModeOf(project))` — QA 전용 모델 설정을 만들지 않는다.
- 파서 경계: 요청-local `i` 는 그 요청의 target 만 인정하고, ⚠️ **중복 `i` 는 last-wins 가 아니라
  그 항목만 unreviewed** 다(`parseEmotionResponse` 의 semantic 을 복사하지 말 것).
  `v` 누락·unknown 도 `ok` 로 넘겨짚지 않고 unreviewed, `c` 가 unknown 이면 판정은 살리고 분류만 비운다.
- 캐시 재사용: `rule`·`manual` 은 reviewer 모델과 무관하게 유지, **`ai` 는 같은 모델일 때만** 재사용.
- ⚠️ **사람이 누른 "문제 없음"(`origin:'manual'`)은 같은 exact anchor 의 pending 자동 판정이 덮지 못한다.**

### QA 검수 엑셀 round-trip (post-v1 번역 Phase 4)

`src/generators/translate/qaWorkbook.ts` 는 **일반 대본 엑셀과 별개의 좁은 포맷**이다 —
의심 번역만 내보내 외부에서 전체 대본 문맥과 함께 고친 뒤 되돌려 넣는 왕복 전용이고,
**`parseExcel.ts`/`sceneBuilder.ts` 의 semantic 을 공유·확장하지 않는다**
(공유하는 건 `xlsx` 지연 로딩·`downloadBlob`·숨김 file input 같은 저수준 관용구뿐 —
둘을 generic Excel parser/escaping abstraction 으로 합치지 말 것).

- 보이는 열은 **언어 고정**(`A 한국어 · B 영어 · C 일본어`)이고 `D 검수 대상` 은 **표시 전용**이다 —
  적용 권한의 authority 는 **숨은 metadata(E열 + `_naqa`) 뿐**이라 D열을 고쳐도 반영 대상이 바뀌지 않는다.
- 행1 헤더 5칸은 **structural contract** 라 exact 대조한다(⚠️ **헤더로 동적 column mapping 을 만들지 말 것**).
  **export 당시 검수 대상이던 로케일만** 쓸 수 있다(나머지 칸은 context-only).
- 비교는 전부 **exact** 이고 **`trim` 을 끼우지 않는다**(빈칸 판정에만 쓴다 — `"Hello "`→`"Hello!"` 가 stale 로 오판된다).
  빈칸은 **삭제가 아니라 무시**, 수식·숫자·불리언·날짜 셀은 번역으로 적용하지 않는다
  (전용 strict text cell reader — `parseExcel` 의 `String(row[c] ?? '').trim()` coercion 을 재사용하지 말 것).
- 행 metadata 는 **fail-closed**(필드 하나만 어긋나도 그 행 폐기 · 권한 `f` 는 부분 복구 금지 ·
  같은 줄 중복은 last-wins 가 아니라 **전부 폐기** · 원문 열이 스냅샷과 다르면 행 skip).
- stale 판정의 정본은 기존 **`isQaResultValid` 하나**이고(새 술어 금지), import 는
  **현재 `translationQa` 캐시에 의존하지 않는다**(내보내고 앱을 껐다 켠 다음 날 반영이 정상 경로).
- 적용(`applyQaWorkbook`)은 **커밋 시점 현재 project 로 재분석**한 뒤 `applyTranslationUpdates` 로
  **`setScenes` 1회**만 쓴다(칸마다 `setLineTranslation` 반복 금지 · candidate 0 이면 커밋 자체 없음 ·
  `translationQa` 를 직접 지우거나 자동 재검수를 돌리지 말 것).
- **Project schema·localStorage·`.npproj.zip` 은 무변경**이고 workbook metadata 는 어디에도 저장되지 않는다.
- 오용 가드: 대본 엑셀 업로드에 QA 파일을 넣으면 `_naqa` **표식 하나만** 보고 막는다
  (시트명·헤더·파일명 휴리스틱 금지).
- ⚠️ **이 기능이 있으므로 앱 안에 고품질 재번역·AI 대체 번역 제안·auto-fix 를 다시 만들지 말 것.**

### unchanged → manual OK (post-v1 번역 Phase 5)

QA 검수 엑셀에서 **안 고치고 돌아온 칸은 `문제 없음` 후보일 뿐, 자동 승인 대상이 아니다**
(`analyzeQaWorkbook` 의 `manualOkCandidates` + store `applyQaWorkbookManualOk`).

- **앱은 사용자가 실제로 검수했는지 모른다**(파일을 열어보지도 않고 그대로 다시 넣어도 unchanged 다).
  analyzer 가 내는 건 **eligibility 뿐**이고 manual 판단은 **UI 의 별도 confirm** 이 만든다.
  ⚠️ import 만으로 등록하거나 canonical confirm 에 묶어 한 번에 동의받지 말 것,
  UI 문구에 "검수 완료"라고 단정하지도 말 것.
- 자격은 **flagged · metadata strict · duplicate 아님 · 원문 열 일치 · strict text cell ·
  `text === snapshot` exact · blank/공백 아님 · 현재 project `isQaResultValid`** 전부이고,
  이 조건들은 **기존 pass 위치에서 그대로 나온다**(새 validity 술어 금지 ·
  anchor 정의는 `anchorOf` 하나를 changed·unchanged 가 공유).
- ⚠️ **`counts.unchanged`·`blank`·`stale` 의 Phase 4 의미를 바꾸지 말 것** — 빈/공백 칸은 후보에서만 빼고
  `counts.blank` 로 옮기지 않으며, **`unchanged − manualOk` 를 stale 이라 부르지 말 것**(stale 과 blank 가 섞여 있다).
- 결과 shape 은 `dismissQaIssue` 와 **정확히 같아야** 하고(`verdict:'ok'`·`origin:'manual'`,
  category·reason·model 없음) 그래야 기존 skip·precedence·compaction 이 걸린다.
- 쓰기는 **functional set 1회**(`upsertQaResults` 가 이미 배열 batch — 새 primitive 금지),
  후보 0이면 캐시 무변경, 반환은 `committed` 뿐이다(**`skipped` 집계를 만들지 말 것** — denominator 가 다르다).
- canonical·`autoSave`·협업·persistence·`clearTranslationQa`·자동 재검수 **전부 없고**,
  canonical 확인창 취소가 이 분기를 죽이면 안 된다(`NO/YES` 가 정상 경로다).
- manual OK 는 Phase 3 과 같은 **session-only** 라 새 세션에서 복원되지 않는다.

---

## 4. Accepted limitations (해결 과제가 아니다)

| 축 | 항목 |
|---|---|
| Expression | **`P16-F2` 시제 denotation** — Phase 17 에서 관측된 실제 misselection(`"그때는 정말 화가 났었지. 지금은 다 웃어넘길 수 있어."` → `화남`)이고, 시제 축만 겨냥한 minimal denotation clause 는 **before/after 6/6 동일**이라 폐기했다. **backlog 가 아니라 accepted limitation** 이다. |
| Expression | 청크 경계를 넘는 연속성 정보 0(**F-2**) · target 수집의 export `optedIn` 비대칭(**F-3**) · 후보 1개뿐인 줄의 호출 생략 · 파서 폐기 건수 미보고 · heuristic negation — **v1 비차단 backlog** |
| Outfit | **`P12-59` residual FP** — no-look-ahead window 의 **종단** 미래 의도가 FP 로 남을 수 있다. window boundary 가 강한 contributing factor 지만 **유일한 causal root cause 로 확정하지 않는다**(원인은 raw semantic misclassification 이기도 하다). |
| Outfit | same-input raw emission variability · `N1`/`N4` raw 미출력 — accepted limitation. read-only look-ahead · 실제 제작 대본 기반 품질 측정 · 무시한 제안의 재출현 은 backlog. |
| 번역 QA | 주변 문맥을 안 보내므로 **대명사 선행사·장면 전체 문체 일관성·화자 간 반응 정합성은 검출 대상이 아니다.** copy-through 는 고유명사·효과음·의도적 원어 유지에서 **FP 가 가능하다.** reviewer 가 generator 와 같은 모델 계열이라 같은 종류의 오해를 공유할 수 있다. |
| 전 축 | **stable Line UUID 가 없어** 화자·원문이 완전히 동일한 두 줄을 구별하지 못하는 rare ambiguity — Voice anchor·번역 QA Phase 3/4/5 가 **같은 등급**으로 명시한 기존 한계다. 원인·구조의 정본은 [scene-editor.md#line-identity](./scene-editor.md#line-identity). |
| Export | **D3 — Export `optedIn` 비대칭**(canonical). `optedIn=false` 캐릭터는 게임에 안 나오는데 AI target 수집은 그 비대칭을 그대로 갖는다(비용·targeting·UI 노이즈). 렌더러 쪽 처리는 [renpy-export.md](./renpy-export.md) 참고. |
| Export | **D5/D6** 커스텀 표정·의상 속성 해시 충돌 → [renpy-export.md](./renpy-export.md) |

---

## 5. ⚠️ 재튜닝 금지 목록 (새 blocker 없이 다시 열지 말 것)

- **Phase 11 A 식 suppression 튜닝** · 변경 **횟수** sparsity prior · 기본 표정 선호 억제 문구.
- **Phase 17 denotation attempt 는 1회로 고정** — 두 번째 문안·variant 를 시도하지 말 것.
  ⚠️ 그 임시 correction 은 typecheck·776 tests·mutation·`dump:rpy` diff 0 을 **전부 통과했는데도**
  모델 선택을 못 바꿨다 — **deterministic 통과를 품질 개선으로 인용하지 말 것.**
  ⚠️ *"`gpt-4o-mini` 는 과거 감정을 일반적으로 구분 못 한다"* 로 일반화하지 말 것
  (타인 감정 귀속·부정은 같은 실행에서 **통과**했고 인용·가정·미래는 조사하지 않았다).
- **Outfit blanket boundary suppression**("window 끝 행은 `non_transition`/reject") — 그 index 의 owner window 는
  하나뿐이라 종단의 **진짜** transition 이 silent FN 이 되고 틀린 의상이 carry 된다.
  구조적 재검토는 positive recall 보호를 포함해 look-ahead 등 architecture 변경으로 **별도 Phase** 에서 다룬다.
- **QA 의 두 번째 deterministic heuristic** · generic language-heuristic framework 화.
- **앱 내부 고품질 재번역 / AI 대체 번역 제안 / auto-fix**(QA Review Excel 왕복이 대체했다).
- ⚠️ **backlog 는 존재한다는 이유만으로 구현 대상이 되지 않는다.** 새 blocker 가 없는 한
  동결된 Outfit/Expression semantic baseline 을 재튜닝하지 않는다.

## 6. 운영 주의

- **live API 키를 리포 안 평문 파일로 두지 말 것**(`key.txt` 류) — 실측 audit 이 필요하면
  **환경변수로만** 주입하고(`OPENAI_API_KEY`), 값은 로그·리포트·artifact 어디에도 남기지 않는다.
- **표정 AI 실키 검증 · TTS(Typecast) 실키 검증은 최후순위로 연기**된 상태다(2026-08-09/10).
  재개할 땐 `src/generators/emotion/` · `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- ⚠️ **Expression AI 브라우저 e2e 는 리포에 없다**(실측). 실행/커밋/회수는 기존 vitest
  (`emotion-ai`·`emotion-commit`·`emotion-recovery`·`emotion-resolve`·`emotion-estimate`·`integration-workflow`)가 덮는다.
- ⚠️ `baseLocale='en'` 프로젝트가 실제로 지원되는데 기존 `translate/index.ts` 의 `systemPrompt()` 은
  source 를 **"Korean" 으로 하드코딩**한다. Phase 3 QA 는 `sourceLocale` 을 명시적으로 보내 이 문제를
  **상속하지 않는다**. generation prompt 수정은 **별도 post-v1 correction** 대상이다.
