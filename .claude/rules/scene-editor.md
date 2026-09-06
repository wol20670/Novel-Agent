---
paths:
  - "src/components/**"
  - "src/store/scriptSlice.ts"
  - "src/store/voiceSlice.ts"
  - "src/generators/voice/**"
---

# Scene Editor 규칙 (SceneCard / SceneLineRow · CG · 수동 편집)

- **`Scene.lines` 길이가 바뀌는 변경은 positional transient state 를 무효화할 것** —
  `LineRow` key 에 `scene.lines.length` 를 섞고, `ScenePlayer` reset deps 에도 넣는다.
  ⚠️ key 를 **내용(text) 기반으로 만들지 말 것**(타이핑마다 remount·포커스 손실).
- **guard 는 `invalidateOutfitSuggestions`·`setScenes`·`flash` 보다 먼저.**
  무효 요청이 검수 중인 제안을 날리면 안 된다(`deleteLine`·`insertCgEndAfterLine` 공통 순서 계약).
- `flash` 는 단일 toast 다 — **한 액션에서 두 번 부르지 말 것.** 호출측에서 합성 메시지 하나로 만든다.
  공유 액션에 `silent` 플래그·toast 큐를 만들지 않는다.
- **CG 판정 둘을 합치지 말 것**: 수동 `👗`·`🖼끝` 은 `cgActiveFlags[index]`(per-line 상태),
  Outfit **AI** cutoff 는 `getFirstEffectiveCgIndex`(최초 경계)다.
- **범용 `insertLine` 을 만들지 말 것.** `deleteLine` 의 **삭제 대상 줄**과 `insertCgEndAfterLine` 의
  **anchor 줄**은 `dialogue`/`narration` 만 허용한다(`item`/`cg`/`bgm` 은 상태 전이 semantics 라 제외).
  ⚠️ 이건 **대상/anchor 줄의 kind 제한**이지 "`cg` kind 를 삽입할 수 없다"는 뜻이 아니다 —
  `insertCgEndAfterLine` 이 실제로 넣는 것은 canonical CG 종료 마커 `{ kind: 'cg', desc: '', end: true }` 다.
- 의상 값의 쓰기는 `setLineOutfit` 하나뿐 — **수동 전용 state·mutation·레코드 직접 조립 금지.**
  이미 있는 값의 해제(`✕`)는 CG 경계와 무관하게 허용한다.
- **async 커밋은 좌표가 아니라 request-time anchor 로 한다**(음성·번역·표정).
  anchor 는 **최초 `await` 이전**에 문자열 복사본으로 뜨고, 어긋난 항목은 **그 항목만 drop** 한다
  (run 전체 폐기·index remapping 금지). 판정은 `voiceLineAnchorMatches` 단일 소스.
- **`rawInput` 을 자동 수정하지 말 것.** 수동 편집은 `Scene.lines` 만 고치고, 재분석은 undo 가 아니다.
  reverse writer · parser source map · provenance · Line UUID · undo UI 를 만들지 않는다.
- **Line UUID / tombstone / soft-delete / index remapping 을 만들지 말 것 — 이건 R5 scope 다.**
- QA UI 에서 `setLineTranslation` 뒤에 `clearTranslationQa` 같은 걸 부르지 말 것.
  QA 캐시는 직접 clear 하지 않고 기존 content anchor 판정에 맡긴다.
- R3 DOM 계약 5개(`scene-${id}` · root click → `selectScene` · `border-accent` · `scroll-mt-4` ·
  제목 input `stopPropagation`)를 깨지 말 것. navigation 은 기존 `jumpToScene` 재사용이고
  **새 navigation store/action/router 를 만들지 않는다.**
- `SceneCard` ↔ `SceneLineRow` 의 public boundary 는 `LineRow` 단방향 import 하나다.
  두 파일을 다시 합치거나 범용 버킷으로 재분할하지 말 것. `LineRow` props 11개·derived 계산 위치 유지.
- **UI/component 가 shared domain rule·shared file rule 을 얻으려고 `src/renpy/generate.ts` 를
  import 하지 말 것**(R1 cross-path guard). ⚠️ **R1 에서 확정된 의도적 component dependency 인
  `ScenePlayer`(Preview/Export parity — `arrangePositions`·`attrFor`·`selectSprite`·`spriteSlots`)와
  `RenpyTab`(`generateRenpyFiles`)은 예외이며 정리 대상이 아니다** — 걷어내거나 facade 로 감싸지 말 것.
  정확한 rationale·잔류 목록 → [`docs/contracts/project-compat.md`](../../docs/contracts/project-compat.md)

**상세·근거 → [`docs/contracts/scene-editor.md`](../../docs/contracts/scene-editor.md)**
