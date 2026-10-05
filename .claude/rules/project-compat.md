---
paths:
  - "src/project/**"
  - "src/store/**"
  - "src/types/project.ts"
  - "src/assetMime.ts"
  - "src/assetRefs.ts"
  - "src/collab/**"
  - "src/storage/**"
---

# Project 호환성 규칙 (persistence · schema · 에셋 · 협업)

- `importProjectFile` 의 검증 **4단계 순서를 바꾸지 말 것**:
  `archive identity → version → project.scenes guard → 에셋 복원`. 세 조건을 한 줄로 합치지 않는다.
- `PROJECT_FILE_VERSION` 은 **`1` 고정**. write schema/컨테이너 layout 이 실제로 바뀔 때만 올린다.
- **version 키 migration 테이블·registry 를 만들지 말 것.** 에셋 이름 복원은 import 전용 폴백이고
  `extFor` → `legacyExtFor` **조회 순서를 뒤집지 말 것**. `extFor` body 와 export path 는 무수정.
- `.npproj.zip` import 를 **atomic 하다고 쓰지 말 것**(mutation-zero 는 세 rejection 경로 한정).
- **project / store / UI 는 shared domain·file rule 을 얻으려고 `src/renpy/generate.ts` 를 import 하지 말 것.**
  의도적 잔류는 `ScenePlayer`·`RenpyTab`·`buildZip` 정확히 3개다.
- `backgroundKey` 와 `resolveOutfit` 의 `scene.background ?? ''` 를 **합치지 말 것**(다른 규칙이다).
- `src/assetMime.ts` 는 **import 0줄 잎 모듈**로 유지하고 `src/assetRefs.ts` 와 합치지 말 것.
- **슬라이스끼리 import 금지** — 다른 슬라이스 액션은 `get().액션()`. 부수효과는 `ctx` 공유 클로저를 쓴다.
- 새 액션은 **State 인터페이스 선언 + 해당 슬라이스 구현** 두 곳 모두.
- **zustand 는 필드 단위 구독.** 셀렉터 안에서 `scenes.find(...)` 금지 — `sceneById()` 를 쓴다.
- `Line`/`Scene`/`Project` 에 필드를 추가하면 **5경로**를 확인할 것
  (localStorage · `.npproj.zip` · 협업 · **`mergeScenes` 재분석 병합** · **Ren'Py 출력**).
- **`Line` 의 optional field** 는 현재 frozen contract 상 backward-compatible serialized 확장이라
  schema version bump·migration 없이 간다. ⚠️ **이 규칙을 `Scene`/`Project` 필드로 일반화하지 말 것** —
  그쪽을 건드릴 땐 [`docs/contracts/project-compat.md`](../../docs/contracts/project-compat.md) 의
  `Line` schema 확장 규칙과 `.npproj.zip` compatibility boundary(안정화 R2) 를 읽고
  archive format·version 영향을 별도로 판단한다.
- 에셋 원격 삭제 경로를 새로 만들지 말 것 — 회수는 기존 GC 스윕 하나이고 **두 가드**
  (전 행 참조 합집합 · 업로드 유예 기간)를 빼면 데이터 손실이다.
- `supabaseClient.ts` 에 최상위 `import` 를 되살리지 말 것(지연 로딩 유지).
- **Auth/협업 경계(S1-B)**: collab remote 경로는 `getCollabClient()` 로만 얻고(`getSupabaseClient()` = base/Auth 전용),
  runtime 을 켜는 곳은 `enableCollabIfAuthenticated()` 하나다. `na_collab_enabled`(intent) ·
  `store.collabEnabled`(UI mirror) · `isCollabActive()`(remote-access truth) 를 섞지 말 것.
  Auth 전이에서 local Project·IndexedDB 에셋을 지우지 말 것.
- **F1 재접속 확인**: `na_local_only` 는 `consumeLocalOnlyPreference()` 로만 지운다(marker `na_reconnect_confirm`).
  `collabReconnectPending` 은 marker 가 있을 때만 올리고, `na_local_only` 잔존은 재접속 barrier 로만 쓴다.
  "내 로컬 유지"에서 `setCollabConfig`/`stopCollab`/push 를 부르지 말 것. `startCollab` 의 pull-first 는 바꾸지 않는다.
- signed-out/local-only 에서 막히는 것은 **신규** data·presence·storage 작업이다 — 전이 시 Realtime teardown
  (`removeAllChannels`)은 날 수 있으니 "remote 호출 전체 0"으로 쓰지 말 것.
- ⚠️ S1-B Auth/runtime gate 는 **client-side boundary** 다 — authorization 으로 쓰지 말 것.
- checked-in `setup.sql` 은 **S1-D1 data-plane 정책**(authenticated · 비익명 · `assets` private)을 정의하지만,
  **repo 에 있다는 사실만으로 hosted 적용을 가정하지 말 것** — hosted 상태는 `PHASES.md`/`HANDOFF.md` 와 실제 policy audit 으로 확인한다.
- S1-D1 은 trusted authenticated-account interim 이고 **room authorization 이 아니다** — Realtime private channel · Presence · room 권한은 S1-D2.
  번들의 Supabase URL + publishable key 는 비밀이 아니다.

**상세·근거 → [`docs/contracts/project-compat.md`](../../docs/contracts/project-compat.md)**
