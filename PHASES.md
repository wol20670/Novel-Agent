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
| 1 | (대기 — 프롬프트 수령 전) | ⏳ | | |

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
