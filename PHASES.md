# PHASES — 복장·표정 자동 추론(LLM) 도입

> 여러 세션에 걸치는 대형 작업의 **진행 기록 + 규칙**. 짧게 유지하고, 확정된 Phase만 한 줄씩 쌓는다.
> 세부 이력은 git log가 보존한다. (세션 상태는 `HANDOFF.md`, 코드 함정은 `CLAUDE.md`.)

## 작업 루프 (사용자 확정, 2026-08-11)

```
Phase N 프롬프트(사용자) → Claude Plan Mode 로 계획 작성
  → 사용자가 GPT 에 계획 전달 → GPT 검토·수정 지시
  → Claude 가 수정안을 "구현 가능성" 관점에서 재검토(동의 아니면 근거를 대고 반박)
  → 승인되면 Claude 구현 + 테스트
  → 결과(diff 요약·테스트)를 사용자가 GPT 에 전달 → GPT 검토 → Phase N 확정
  → **확정된 코드 상태를 기준으로** Phase N+1 프롬프트를 새로 작성 → 반복
```

- Phase 프롬프트는 **한 번에 하나만 유효**하다. 다음 Phase를 미리 구현하지 않는다.
- Claude는 GPT 리뷰를 무조건 수용하지 않는다 — 이 리포의 실제 코드와 어긋나면 근거(파일·줄)를 들어 알린다.
- Phase가 확정되면 **아래 로그에 한 줄 추가 + 커밋 해시 기록**. 새 세션은 이 파일로 문맥을 복구한다.

## Phase 로그

| Phase | 내용 | 상태 | 커밋 | 검증 |
|---|---|---|---|---|
| 0 | store/LeftPanel/types 모듈화(기준 상태) | ✅ 확정 | `9f936b6`…`e4dbe6a` | typecheck·test 479·build·e2e |
| 1 | 복장 시스템 분석 + 장면 내 의상 전환 설계(**코드 변경 없음**) | ✅ 확정 (3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| 2 | 장면 내 수동 의상 전환 구현 | ✅ 확정 | `7dbfaaa` (보정 `ec7bc04`) | typecheck · vitest 42파일/517 · 기존 `.rpy` 21구성 바이트 회귀 0 + 신규 `outfits-line` 정상 · 스크래치 빌드+e2e · Ren'Py lint 에러 0 · save/load·`.npproj.zip` 왕복 |
| 3 | 기존 표정 AI end-to-end audit(**코드 변경 없음**) | ✅ 확정 (3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| 4 | 표정 AI correctness — F1(줄 시점 의상) + F4(표정 설명 identity) | ✅ 확정 (2차 리뷰 반영) | `558f18e` | typecheck · vitest 42파일/532 · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 |
| 5 | 표정 AI 문맥 품질(F2/F3) | ⏳ | | |

## Phase 1 확정 설계 — 장면 내 의상 전환 (구현은 Phase 2)

**목표**: 한 장면 안에서 같은 캐릭터가 여러 의상으로 갈아입을 수 있게. 기존 배경 키워드 heuristic·`resolveOutfit`은 **그대로 유지**.

**데이터**: `Line`(dialogue·narration)에 `outfits?: Record<캐릭터, 의상>` — "이 줄부터", 적힌 캐릭터만 변경(`hideSprites`의 줄 단위 override와 같은 관용구). 별도 event 배열/timeline 금지(줄 밖에 두면 index를 저장하게 돼 stable ID가 필요해진다).

**판정 단일 소스**: `outfitFlags(scene, rules, charName): string[]`(`types/project.ts`, `spriteHiddenFlags` 옆, **동기·순수**). 시작값은 기존 `resolveOutfit` 호출. 우선순위 = 줄 override > (후일 줄 AI 값) > `Scene.outfits` > 배경 키워드 규칙 > `기본`. **(장면,캐릭터)당 한 번 계산해 재사용**(줄마다 재fold 금지).

**생성기 emit 순서**(줄마다): ① 숨김 전이(복원 시 **의상은 fold 값**, 표정은 `lastShown.attr`) → ② **의상 동기화 = `revealedOrder` − 이번 줄 speakerIds** → ③ 기존 dialogue speaker 처리(의상값만 fold로).
- ②가 speaker를 제외하는 이유: ③이 어차피 최신 의상으로 show한다. 포함하면 **없던 show가 생겨 회귀 0이 깨진다**. 숨김 해제 줄에서 복원+화자 show가 2회 나가는 **현행 동작은 그대로 둔다**(1회로 줄이려 하지 말 것).
- 상태는 `lastShown: Map<charId, {outfitAttr, attr, wanted}>` **한 곳**. `outfitAttr/attr`=실제 화면, `wanted`=마지막 요청 의상(재발행 판정). **속성 없는 재배치 `show id at vn_char(x)`(`generate.ts:753`)는 이 상태를 건드리지 않는다.**
- 폴백은 기존 `generate.ts:765-771` 순서를 `pickSpriteAttrs(charId, wantedOutfit, currentAttr)`로 **추출만** 해서 ②③이 공유(새 규칙 금지).

**미리보기**: 같은 `outfitFlags`를 `useMemo`로 계산해 `PreviewSprite`에 전달 → 전이 시점이 생성기와 일치.

**파서 라이프사이클**: `#복장`이 장면 맨 앞이면 기존대로 `Scene.outfits`, 도중이면 `pendingOutfits`(캐릭터별 **merge**, overwrite 아님) → 다음 dialogue/narration이 소비하며 `appliedOutfits`에도 반영. **명시 `#S`는 상태를 끊고(폐기), 자동 `splitBeat`는 잇는다**(`startScene` 리셋 **전에** 스냅샷 → 새 장면 시작 의상 = `appliedOutfits` + 미소비 pending). heuristic 결과는 `appliedOutfits`에 담지 않는다.

**merge**: `carryLineMeta`의 dialogue·narration 두 갈래에 `outfits: next.outfits ?? prev.outfits`(whole-record 교체 — 캐릭터별 merge는 대본에서 지운 지정이 좀비로 남는다). 변경 감지는 `tagFieldsChanged` **한 곳만** 확장하되 **`linesIdentical`일 때만** 인덱스별로 `prev.outfits` vs `next.outfits ?? prev.outfits`(= 실제 병합 결과와 동일 semantics) 비교 → 다르면 `affectsGame`. **`lineKey`·`pairLines`는 불변**, `emotion`/`hideSprites` 감지는 이번에 안 건드림.

**known limitations(이번에 고치지 않음, 기록만)**
- Preview는 "기본 의상 + 현재 표정", Export는 "그 의상 + neutral"로 폴백이 **비대칭**(`spriteAssetId` vs `generate.ts:765-771`) — 오늘도 존재하나 줄 단위 전환으로 마주칠 확률이 는다.
- `pairLines`는 FIFO라 **동일 speaker+text 줄이 여럿이면** 메타가 다른 동일 줄에 붙을 수 있다(emotion·voice·hideSprites가 공유하는 기존 한계).
- 재분석 시 `next.outfits` 부재가 "태그 삭제"인지 "앱 수동값 유지"인지 구분할 **provenance가 없다** — origin 필드/시스템 추가 금지.
- AI 표정 후보가 **장면 단위** 의상으로 계산된다(`aiSelect.ts:71-73` → `availableExpressions`) — 줄 단위 전환과 어긋날 수 있는 cross-system 의존. 별도 검토 대상.
- 음성 파일명이 줄 index를 굳힌다(`voiceBaseName`) — 무관한 선행 부채, 별도 Phase.

**구현 순서**: 타입+`outfitFlags`+테스트 → 생성기(추출→②→①→`wanted`) → 미리보기 → 파서 → merge → (선택) 줄 UI.

**Phase 2 착수 시 준비된 도구**
- `npm run dump:rpy -- <스크래치>/before` 를 **코드 손대기 전에** 한 번 돌려둘 것(21구성 · 결정론적). 작업 후 같은 명령으로 `after` 를 만들어 `diff -r` → 줄 override 를 안 쓴 구성은 **한 구성도 달라지면 안 된다**. 이미 `outfits` 구성(장면 단위 의상 + 배경 키워드 규칙)이 들어 있어 기존 heuristic 보존도 함께 대조된다.
- 빌드 확인은 `npx vite build --outDir <스크래치>/dist --emptyOutDir`(리포 안 `dist/` 는 조용히 죽는다), e2e 는 그 dist 로 `npx vite preview --outDir <스크래치>/dist --port 4173` 후 `npm run test:e2e`.
**필수 검증**: override 없는 프로젝트 **출력 회귀 0**(덤프 `diff -r`) · 장면 내 2회 전환 · 타 화자 줄/narration 줄 전환 · hide 중 전환 후 복원 · 전환+show 같은 줄(show 개수 동일) · `splitBeat` 승계 및 `#S` 비승계 · 미등장 캐릭터 선변경 후 등장 · 의상에 그 표정 없음(문서화된 폴백 재현) · save/load · `.npproj.zip` · 재분석 후 유지 + **줄 의상만 바뀐 재분석에서 승인 리셋** · 미리보기/export 전이 시점 대조 · typecheck/test/빌드.

## Phase 3 확정 — 기존 표정 AI audit 결과 (구현은 Phase 4)

**코드 변경 없음.** 표정 AI는 이미 end-to-end로 동작하는 시스템이며, 아래 결론은 코드 근거는 `파일 · 함수명`으로만 기록한다(줄 번호는 정본으로 안 쓴다 — 리팩터에 바로 어긋난다).

**A — 이미 충분, 재설계하지 않는다**: `Line.emotion`/`Line.emotionAuto` 분리 · 작가/수동 > AI > 휴리스틱 > 기본 우선순위 · `resolveEmotion`/`resolveEmotionDetailed` 단일 판정 · `availableExpressions` 기반 후보 제한 · 응답 파싱/검증 · 🤖 표시 + 수동 override · 프롬프트 수준 표정 연속성(smoothing) 지시 · 증분 대상 선정 · 배치(견적·진행률·재시도·치명 오류 중단·단일 커밋) · save/load · `.npproj.zip` · 협업 · 재분석의 `emotionAuto` 승계와 `emotionLoss` · 미리보기/Ren'Py export 판정 경로. **새 provenance 시스템·review modal·smoothing 엔진·범용 AI framework를 만들지 않는다.**

**B — correctness 2건(Phase 4 필수)**
- **F1 — 줄 시점 의상 ↔ AI 후보 불일치**: 후보가 `resolveOutfit`(장면 단위)로 계산돼 speaker 단위로 장면 전체에 공유되는데(`generators/emotion/aiSelect.ts · collectEmotionTargets`), Phase 2 이후 줄 시점 판정 단일 소스는 `types/project.ts · outfitFlags`다. 한 장면에서 A→B→C 전환이 일어나면 전환 이후 후보가 실제 의상과 어긋난다(그림 없는 표정이 배정돼 플레이스홀더가 게임에 실리거나, 그림 있는 표정이 후보에서 빠진다).
  **계약**: *각 AI target 줄은 자신의 줄 시점 effective outfit에 맞는 후보 집합으로 LLM에 제시되고, 동일 후보 집합으로 응답 검증된다.*
  **제약**: `outfitFlags` 단일 소스 재사용 · 표정 AI 전용 의상 계산기 금지 · `candidatesBySpeaker` 캐시 키 변경만으로 끝난다고 선결정하지 않음(**같은 speaker가 같은 청크 안에서 여러 의상을 쓸 수 있다** — payload도 검증도 speaker 단위 후보를 전제하고 있다) · stable Line ID 등 대형 abstraction 금지.
- **F4 — `expressionNotes` 후보 identity 불일치**: payload는 설명이 있으면 `표정명(설명)`을 후보로 보내고(`aiSelect.ts · buildUserPayload`), 프롬프트는 후보 문자열을 정확히 복사하라고 요구하는데(`aiSelect.ts · SYSTEM_PROMPT`), 파서는 canonical `project.expressions` 이름과만 일치를 인정한다(`aiSelect.ts · parseEmotionResponse`). 모델이 지시를 따를수록 결과가 폐기된다.
  **계약**: *`expressionNotes`가 있어도 prompt/payload와 parser가 동일한 canonical Expression identity를 쓰고, 성공 결과는 `project.expressions` 원문으로 저장되며, 후보 밖 응답은 계속 거부된다.* 구현 방식(설명을 별도 필드로 분리 / 파서에서 canonical 매핑 등)은 Phase 4 Plan에서 최소 변경으로 정한다.

**C — 품질(Phase 5로 이관)**: **F2/F3 — 대사 문맥 커버리지 결손.** target에서 빠진 줄은 LLM 문맥에서도 통째로 사라진다(주인공 대사·지문·합동 대사·이미 배정된 줄과 그 표정 값). `prevContext`도 실제 직전 대사가 아니라 **직전 청크의 마지막 target 3개**이고 장면마다 초기화된다 — **target 줄과 문맥 전용 줄이 분리돼 있지 않다.** 장면 메타데이터(제목·배경·연출·CG·시놉시스) 배관 자체는 이미 있으므로 재구축 대상이 아니다.

**Phase 4 범위 = F1 + F4 correctness만.** 제외: F2/F3 문맥 품질 · 실행 중 취소 UX · 장면 단위 재실행 · `emotionAuto`만 비우는 UI · review modal · suggestion staging · provenance · deterministic smoothing/state machine · stable Line ID · timeline/event 엔진 · 범용 AI 인프라 리팩터 · 표정 AI 전면 재작성 · 의상 AI · 미리보기/export 폴백 통일 · merge 재설계.

**Phase 4 검증**: 같은 장면·**같은 청크**에서 동일 화자가 A→B→C로 갈아입는 케이스로 ① 줄별 effective outfit ② 줄별 허용 후보 ③ 이전 의상 전용 후보 제외 ④ 새 의상 전용 후보 포함 ⑤ 파싱이 줄별 올바른 후보로 검증 — 다섯을 직접 검증한다. F4는 구현 중립으로 ① 설명이 있는 프로젝트에서 정상 배정 성립 ② 저장값이 `project.expressions` 원문과 일치 ③ 후보 밖은 여전히 거부 ④ 설명이 없으면 기존 동작 불변. `npm run dump:rpy` before/after `diff -r` 은 **전체 회귀 안전망**으로 유지하되 **F1 의 직접 증명이 아니다**(위 단위 테스트가 증명한다).

## Phase 4 확정 설계 — 표정 AI correctness (구현 `558f18e`)

**F1 — 후보 키가 화자 하나 → `(화자, 의상)`.** `EmotionItem` 이 자기 줄의 `outfit` 을 들고 다니고,
`EmotionBatch.candidatesByKey` 가 `candidateKey(화자, 의상)`(= `JSON.stringify([speaker, outfit])`,
구분자 문자를 박지 않아 이름에 뭐가 들어와도 안 겹친다) 로 후보를 담는다. 줄 시점 의상은
**`outfitFlags` 단일 소스**를 (장면,캐릭터)당 한 번 계산해 재사용한다(`aiSelect.ts` 안에 의상 fold 를
새로 만들지 않는다 — `resolveOutfit` 직접 호출은 사라졌다). 프롬프트·응답 검증이 **같은 줄의 후보
집합 하나**만 본다: `parseEmotionResponse` 는 `i → item → candidateKey` 로 조회하므로 전환 전 의상에만
있는 표정은 전환 뒤 줄에서 거부된다. "그 줄 의상에 스프라이트가 하나도 없음" 판정도 화자 단위가
아니라 **줄 단위**가 됐다(그 줄만 대상에서 빠진다).
→ Phase 1 의 known limitation "AI 표정 후보가 장면 단위" 는 이걸로 해소됐다.

**F4 — 설명은 metadata, identity 는 canonical 하나.** 후보 라벨에 `표정명(설명)` 으로 결합하던 걸 없애고
`expressionNotes` 를 **별도 payload 키**로 보낸다(그 청크 후보에 실제로 실린 표정의 설명만). 파서·저장은
그대로라 성공값은 항상 `project.expressions` 원문이고 후보 밖 응답은 계속 거부된다 — **괄호 제거·fuzzy
매칭·display 문자열 허용은 넣지 않았다.**

**기존 동작 보존(테스트로 고정)**: 줄 단위 전환도 표정 설명도 없는 프로젝트는 요청 페이로드와 기본
지시문이 **바이트 단위로 예전과 같다.** 조건부는 둘 다 **그 청크에 실제로 필요할 때만** 켜진다 —
`disambiguate` = *같은 화자*가 이 청크에서 2벌 이상(화자마다 한 벌씩이면 꺼짐), `hasNotes` = *이 청크
후보에 실린* 표정 중 설명 보유(프로젝트 전체 유무가 아니다). 후보 그룹 순서는 items 등장 순서가 아니라
**`candidatesByKey` 삽입 순서**를 따른다(items 순서로 새로 만들면 뒤쪽 청크에서 화자 순서가 뒤집힌다).

**손대지 않은 것**: `resolve.ts` 우선순위 사슬 · `availableExpressions`/`effectiveExpressions` 역할 분리 ·
`estimate.ts` · `applyEmotionUpdates` · 저장/zip/협업/merge/미리보기/export · 배치 골격 · stable Line ID 없음.
`Line`/`Project` 에 새 필드가 없다(`outfit` 은 배치 실행 중에만 존재하는 파생값)라 저장 포맷 변화도 없다.

**Phase 5 재정의**: 기존의 smoothing/표정 state-machine 성격 Phase 는 **진행하지 않는다.** 남긴다면 **"표정 AI 문맥 품질 개선"**(F2/F3 전용)으로 축소한다. 위의 구조적 사실은 이미 확정됐으니 다시 재평가하지 말고, **어디까지 문맥을 넣을지(지문 포함 여부·기존 표정 값 포함 여부·창 크기)와 토큰·비용 대비 품질 향상이 있는지**만 실측으로 정한다. deterministic smoothing 은 문맥 개선 뒤에도 필요성이 입증될 때만 다시 본다. 실키 검증이 최후순위 연기 상태라 착수 시점은 보류 가능.

## 계획 입력: 지금 코드에 이미 있는 것 (재발명 금지)

**표정 파이프라인은 이미 존재한다.** LLM 배정도 들어와 있다.
- 판정 단일 소스 `resolveEmotion`(`src/generators/emotion/resolve.ts`) — **동기·순수**여야 한다(ScenePlayer·SceneCard가 렌더 중 호출). 우선순위 = 작가 태그 `Line.emotion` > AI `Line.emotionAuto` > 휴리스틱(`infer.ts`) > `기본`.
- 그래서 AI 값은 **렌더 시점 조회가 아니라 미리 계산해 Line에 저장**하는 구조다. 새 추론도 이 계약을 따라야 한다.
- 배치 실행 `autoAssignEmotionAll`(`src/store/aiBatchSlice.ts`) + `aiSelect.ts`(249줄) + 비용 견적 `estimate.ts`. 증분(이미 채운 줄은 재호출 안 함)·busy 키·진행률·PACE·단일 커밋 구조를 공유한다.
- 후보 집합이 **두 종류**다: AI가 고를 수 있는 건 `availableExpressions`(실제 업로드된 것만), 최종 검증은 `effectiveExpressions`(선언 목록). 같게 만들면 "업로드 전 임시 실루엣" 워크플로가 죽는다.

**복장은 규칙 기반뿐 — LLM 추론이 없다(여기가 빈자리).**
- `resolveOutfit`(`src/types/project.ts`): 장면 직접 지정 `Scene.outfits[charName]` > `OutfitRule`(배경 이름 부분 일치, 긴 키워드 우선) > `기본`.
- 표정처럼 "AI 값 전용 필드 + 사람 값 우선"이라는 대칭 구조가 아직 없다.

**⚠️ `Line`에는 stable id가 없다.** 줄은 **배열 인덱스**로 참조된다(`setLineEmotion(sceneId, lineIndex)`, `line.voiceAssetIds`, 음성 파일명 `{charId}_{sceneLabel}_{lineIdx}`). "index 의존 금지"를 요구하면 그건 저장 포맷 마이그레이션 + 음성 파일 경로 + `mergeScenes` 매칭까지 건드리는 **별도 대형 작업**이다 — Phase 안에 슬쩍 넣지 말 것. `Scene.id`는 있다.

**새 필드를 Line/Scene/Project에 추가할 때 따라오는 경로**(대부분 자동, 마지막 둘은 수동 확인 필요)
1. localStorage 저장(project 통째) · IndexedDB(바이너리만) — 자동
2. `.npproj.zip` 내보내기/가져오기(`src/project/transfer.ts`) — project JSON 통째라 자동
3. 협업 LWW push(`src/collab/`) — 자동
4. **재분석 병합(`src/project/mergeScenes.ts`)** — 수동. `emotion`/`emotionAuto`를 왜 갈랐는지가 여기 있다(`next.emotion ?? prev.emotion` 규칙 때문에 AI 값이 작가 태그인 척 살아남는 문제).
5. **Ren'Py 출력(`src/renpy/generate.ts`)** — 수동. 사용자 텍스트는 반드시 `esc`/`escRpyText` 경유.

## 매 Phase 체크리스트

- [ ] 기존 `resolveEmotion`/`resolveOutfit` **단일 소스 계약**을 깨지 않는가(생성기·미리보기·장면카드가 각자 계산하면 어긋난다)
- [ ] 기존 휴리스틱(`infer.ts`)·폴백·워크어라운드를 이유 확인 없이 제거하지 않는가
- [ ] 사람이 정한 값(작가 태그·직접 지정)이 **항상 AI보다 우선**인가, 되돌릴 수 있는가
- [ ] 저장·`.npproj.zip`·협업·재분석 병합·Ren'Py export 5경로를 다 고려했는가
- [ ] timeline/event 같은 **새 추상화를 필요 없이 도입**하지 않는가(범위 확대 금지)
- [ ] AI 호출은 증분·비용 견적·진행률·중단 가능 구조를 기존 배치와 **같은 방식**으로 쓰는가
- [ ] 회귀 0: 기능을 안 켠 프로젝트의 생성 `.rpy`가 바이트 단위로 동일한가(CLAUDE.md "출력 회귀 0 증명법")
- [ ] 검증: `npm run typecheck` · `npm run test` · 스크래치 outDir 빌드 · 필요하면 `npm run test:e2e`
      (⚠️ `npm run build`는 OneDrive에서 조용히 죽고 옛 dist가 남는다 — CLAUDE.md 명령 절 참고)
