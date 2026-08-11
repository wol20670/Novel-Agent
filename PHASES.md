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
| 2 | (대기 — 프롬프트 수령 전) | ⏳ | | |

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
