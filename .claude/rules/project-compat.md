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

**상세·근거 → [`docs/contracts/project-compat.md`](../../docs/contracts/project-compat.md)**
