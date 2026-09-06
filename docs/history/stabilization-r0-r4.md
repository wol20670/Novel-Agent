# 안정화 리팩토링 R0~R4 — 이력 아카이브 (+ root 문서 원문 provenance)

> **이 문서는 "무슨 일이 있었는가"다.** 현재 지켜야 할 계약은 `docs/contracts/` 가 정본이고,
> **여기 적힌 수치·문장은 그때의 사실이라 현재 contract 를 override 하지 못한다.**
> ⚠️ **안정화 R 축은 v1 Phase 번호·post-v1 축과 다른 축이다.**
> 이 파일은 R0~R4 이력과 함께, v1 AI 축·post-v1 축에 속하지 않는 **root 문서 원문 provenance**
> (`CLAUDE.md` 명령·Ren'Py/GUI 함정·데이터 구조, `HANDOFF.md` 머리말 등)를 함께 보존한다.
> 아래 블록들은 baseline `047cc7d` 에서 **byte 단위 그대로** 옮겨왔다. `<!-- NA-PROV -->` 사이
> payload 는 **수정하지 말 것**.
> ⚠️ **보존 payload 안의 상대 링크는 baseline 당시의 저장소 루트 기준**이다
> (`./HANDOFF.md`·`./PHASES.md` 등). 이 파일 위치에서는 해석되지 않는다 —
> **원문 보존이 목적이라 고치지 않는다.** 현재 문서는 루트의 `HANDOFF.md`·`PHASES.md`
> 또는 `docs/contracts/` 를 직접 열 것.


## HANDOFF.md — R0~R4 확정 절 (원문)

<a id="r0"></a>
<!-- NA-PROV id=HR0 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L33-64 sha256=4b7e520706b0a40bd0b612591091a801f7e92fba1c141164829ccadbba311470 -->
## 📌 안정화 리팩토링 R 축 — R0(Regression Gate)이 확정한 것
> ⚠️ 이 절은 **안정화 R 축**이다(v1 Phase 번호·번역 로드맵·의상 UX·줄 삭제·CG 종료와 **다른 축**).
> **상태: 구현 + 로컬 자체검증 완료 · GPT implementation/docs final review PASS · 원격 GitHub Actions PASS.**
> 브랜치는 `chore/r0-regression-gate` 이고 **`main` 반영 진행 중**이다.

- **목적**: 이후의 **behavior-preserving refactor**(R1+: 컴포넌트·store·생성기 구조 정리)를 "구조만 바뀌고 observable behavior 는 그대로"임을 **기계적으로** 증명하며 진행할 수 있게 하는 **Regression Gate 구축**. 제품 기능은 하나도 추가하지 않는다.
- **`src/**` production 코드 변경 0** — 변경은 설정·테스트·스크립트·문서뿐이다(`git diff --exit-code -- src/` 로 고정 확인).
- **구현 결과**
  - **tests 전용 typecheck 도입** — `tsconfig.tests.json`(`extends` + `include:["tests"]` + `files:["src/vite-env.d.ts"]`) + `npm run typecheck:tests`. ⚠️ **root `tsconfig.json` 은 무수정**이라 기존 `typecheck`/`build` 의미가 보존된다. ⚠️ `files` 의 `vite-env.d.ts` 를 빼면 transitive 로 끌려온 src 에서 `import.meta.env` 오류가 **5건** 뜬다(실측).
  - **기존 tests 타입 오류 20건 정리** — 그중 2건은 **잠복 결함**이었다: `emotion-commit` 이 존재하지 않는 `SceneStatus` `'draft'` 를 썼고, `cg-end-insert` 가 `string[]` 자리에 `{0:…}` 객체를 넣고 있었다. ⚠️ `@ts-ignore`/`as any`/assertion 완화 **없이** 데이터만 교정했다.
  - **Ren'Py SHA-256 golden gate** — `scripts/renpyGolden.ts`(빌더·비교기) + `scripts/update-golden.ts` + `tests/renpy-golden.test.ts` + `tests/golden/renpy-files.json`. 구성 목록은 `scripts/dump-rpy.ts` 에서 **`scripts/renpyConfigs.ts`** 로 추출해 `dump:rpy` 와 공유한다(계약 상세는 CLAUDE.md 「명령」).
  - **`.npproj.zip` asset round-trip gate** — `tests/transfer-assets-roundtrip.test.ts`. 기존 왕복 테스트 둘이 주석대로 **"참조 0" 픽스처**로 IndexedDB 를 피해서 **에셋 경로 커버리지가 0** 이던 구멍을 닫았다. ⚠️ `src/project/transfer.ts` 와 기존 `transfer-roundtrip.test.ts` 는 **무수정**, fake-indexeddb 도 **안 들였다**(기존 `vi.mock('../src/storage/assetStore')` 관용구 재사용).
  - **self-hosting e2e runner** — `scripts/e2e-run.mjs` + `npm run check:full`. ⚠️ **`scripts/e2e.mjs` 는 한 줄도 안 고쳤다**(assertion·의미 무변경, `BASE_URL` 만 넘긴다).
  - **최소 GitHub Actions workflow** — `.github/workflows/check.yml`(`npm ci` → `npm run check` → `npm run build`).
- **검증 실측**
  - `npm run typecheck` **PASS** · `npm run typecheck:tests` **PASS**(20건 → 0)
  - `npm run test` **67파일 / 1072 tests / 실패 0** · `npm run check` **PASS**(≈20초)
  - `npm run check:full` **PASS**(≈1분) · **e2e 전체 통과**(어서션 40 / 실패 0), preview 정상 종료·LISTENING 잔존 0
  - golden **23구성 / 256파일**, scratch 사본 2회 byte 비교로 **멱등성 확인**
  - **최초 pre-R0 dump vs 최종 post-R0 dump `diff -r` = 0**(baseline 은 작업 시작 시점에 한 번만 뜨고 이후 재생성하지 않았다)
  - `src/**` diff **0** · `git diff --check` **clean**
  - mutation probe 2건이 실제로 탐지함 — 생성 문자열 1byte 변경 → golden 이 `changed: <구성>/game/characters.rpy` 23줄로 실패 / `zip.file('assets/…')` 제거 → round-trip 실패. **각각 즉시 원복하고 path-scoped `git diff --exit-code` 로 확인**했다.
- **중요한 테스트 계약(깨지 말 것)**
  - `.npproj.zip` export 는 **`Object.keys(assets) ∪ collectReferencedAssetIds(project)`** 다 — **두 축을 각각** 고정한다: ⓐ **assets map 에만 있고 프로젝트가 참조하지 않는 에셋**(`a-unused`)도 반드시 실린다 ⓑ **참조에만 있고 메타가 없는 에셋**(`a-cg`/`a-sprite`)은 **synthetic meta** 와 함께 실린다.
  - **참조는 있는데 blob 이 없는 id**(`a-missing`)는 기존 계약대로 **예외 없이 skip**(메타에도 안 실린다).
  - project 동등성은 **JSON-canonical 픽스처에 한해** `toEqual` 로 고정한다(explicit `undefined`·`NaN`·`Date`·`Map` 을 픽스처에 넣지 말 것 — JSON 직렬화가 보존하지 못한다). 합성 meta 의 `createdAt` 만 비결정 필드다.
  - golden 은 **같은 구성의 duplicate path 를 fail-fast** 한다.
  - ⚠️ **테스트는 golden 을 읽기만 한다** — 갱신은 `npm run golden:update` 뿐이다.
- **CI 상태(정확히)**: **원격 GitHub Actions 실행 PASS**(`check` job — `actions/checkout@v7`·`actions/setup-node@v7`, `node-version: '24'` 유지 — `npm ci` → `npm run check` → `npm run build` 전부 성공, 기존 Node.js 20 deprecated annotation 도 제거 확인). `xlsx` 가 `cdn.sheetjs.com` tarball 을 직접 받으므로 **CI `npm ci` 의 알려진 리스크**이고, R0 에서 dependency 구조를 바꾸지 않았다. workflow 의 Node 24 는 **R0 CI baseline 일 뿐 공식 engines 선언이 아니다**.
- **환경 함정 2건(이번에 실측)** — ① node 에는 **`FileReader` 가 없어** JSZip 이 Blob 입력을 못 읽는다(브라우저에선 정상) → 해당 테스트 파일 안에서만 shim ② `vite preview` 기본 host `localhost` 가 Windows 에서 **::1 에만** 바인딩된다 → runner 는 `--host 127.0.0.1` 로 고정. 상세는 CLAUDE.md 「명령」.
- **후속 후보(R0 범위 밖 — 지시가 있을 때만)**: `scripts/` 타입검사(`@types/node` 필요, `lib.dom` 전역 충돌 위험) · eslint/prettier 부재 · **e2e 의 CI 편입** · Node/TypeScript 버전 고정 정책(설치본 TS 5.9.3 vs `^5.6.3`) · `xlsx` CDN 의존 · `.npproj.zip` `manifest.version` 미사용(migration) · `collectProjectFiles`(zip 계층) golden · localStorage 왕복 golden · **R1 구조 리팩토링**(`screensRpy.ts` 3484 · `generate.ts` 1510 · `AssetsTab.tsx` 1388 · `SceneCard.tsx` 964).

<!-- /NA-PROV id=HR0 -->

<a id="r1"></a>
<!-- NA-PROV id=HR1 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L65-129 sha256=bfa1c07927ee7066db4b9cf8fd9749fc0cf26dfbcd4efd25d1d84ea8fffee5d3 -->
## 📌 안정화 리팩토링 R 축 — R1(Domain Dependency 정리)이 확정한 것
> ⚠️ 이 절은 **안정화 R 축**이다(v1 Phase 번호·번역 로드맵·의상 UX·줄 삭제·CG 종료와 **다른 축**).
> **상태: 구현 + 로컬 자체검증 완료 · GPT implementation review PASS.** 브랜치는 `chore/r1-domain-dependency`.

- **목적**: 기능·observable behavior 를 하나도 바꾸지 않고, project/store/UI 계층이 Ren'Py generator 구현
  세부사항에 의존하던 부분을 **최소 범위에서** 끊는다. 제품 기능 추가 0 · generator 출력 변경 0.
- **R1 이 확정한 규칙(딱 이 한 줄 — 넓히지 말 것)**
  > **project / store / UI 계층은 shared domain rule 또는 shared file rule 을 얻기 위해
  > `src/renpy/generate.ts` 를 import 하지 않는다.**
  ⚠️ **"domain ↔ renpy 완전 단방향"처럼 전체 architecture 를 포괄하는 표현을 쓰지 말 것** —
  `types/project.ts → renpy/gui/theme`(type-only)가 여전히 있고, 아래 의도적 잔류도 남는다.
- **canonical 위치(이동한 것)**
  ```
  backgroundKey · bgmKey · hasBgm  →  src/types/project.ts   (cgActiveFlags·outfitFlags 옆)
  extFromMime                      →  src/assetMime.ts       (import 0 잎 모듈, 신규)
  ```
  `hasCgStartMarker`/`cgActiveFlags` 를 `types/project.ts` 에 둔 CG 종료 Phase 선례를 그대로 계승한다.
  ⚠️ `src/assetMime.ts` 는 **import 가 0줄**이어야 한다(어느 계층에서 써도 결합이 늘지 않는 것이 존재 이유).
  ⚠️ `src/assetRefs.ts`(reference collection·GC)와 **다른 책임**이라 합치지 말 것.
- **함수 body 는 한 글자도 바꾸지 않았다**(정확한 기존 계약 — 이 값이 정본):
  ```
  backgroundKey(s) = (s.background || s.title).trim()
  bgmKey(s)        = (s.bgm || s.title).trim()
  hasBgm(s)        = !!(s.bgm || s.bgmAssetId)
  ```
  ⚠️ **`hasBgm` 을 "`#BGM` 을 적었는가"로만 읽지 말 것** — 이름 없이 `bgmAssetId` 만 있어도 `true` 다.
  whitespace-only `bgm`·legacy/inconsistent state 정리는 이 helper 의 책임이 **아니고** R1 에서 바꾸지 않았다.
  `stopWhenUnset` 으로 `stop music fadeout 1.0` 을 낼지의 **정책**은 여전히 `renpy/generate.ts` 소유다.
- ⚠️ **`backgroundKey` 와 `resolveOutfit` 의 `scene.background ?? ''` 는 다른 규칙 — 합치지 말 것.**
  저쪽은 **title 폴백도 `.trim()` 도 없다**. 통합하면 의상 규칙 매칭 대상이 바뀌어 게임 출력이 달라진다
  (`cgActiveFlags` ↔ `getFirstEffectiveCgIndex` 와 같은 등급의 의도된 divergence 다).
- **의도적으로 남긴 generator dependency(정확히 3개 — 정리 대상이 아니다)**
  ```
  ScenePlayer → arrangePositions·attrFor·selectSprite·spriteSlots : Preview/Export parity(기존 durable contract)
  RenpyTab    → generateRenpyFiles
  buildZip    → generateRenpyFiles·resolveItems·resolveCgs·charIdMap·voiceBaseName (Ren'Py 산출물/파일명 API)
  ```
- **변경 규모**: `12 modified + 1 new`(`src/assetMime.ts`). 새 abstraction·barrel·service·class **0** ·
  compatibility re-export **0**(옛 경로를 남기면 새 코드가 계속 그쪽을 쓴다) · rename/generalization **0** ·
  `Project` schema 변경 **0** · 새 test **0**(기존 gate 가 이미 네 함수를 고정한다).
  `src/project/sceneAssets.ts`·`src/project/transfer.ts` 의 **옛 위치를 명시하던 주석 2줄만** 함께 고쳤다.
- **검증 실측(전 게이트 PASS)**
  - 환경 **Node v24.19.0 · npm 11.17.0**
  - `npm run typecheck` **PASS** · `npm run typecheck:tests` **PASS**
  - `npm run test` **67파일 / 1072 tests / 실패 0**(R0 baseline 과 동일 — assertion·fixture 완화 0, 테스트 증감 0)
  - **Ren'Py golden PASS** · **`.npproj.zip` asset round-trip PASS**
  - `npm run check` **PASS** · `npm run check:full` **PASS**(scratch Vite build → self-hosted preview → e2e 전체 통과)
  - **pre/post `dump:rpy`**: baseline(`b452c1a`) **23구성 / 256파일** · R1 **23구성 / 256파일** ·
    **recursive diff 0** · 독립 교차검증으로 **SHA-256 manifest 256파일 전부 identical**
    (baseline 은 R1 working tree 를 건드리지 않으려고 **repo 밖 scratch 의 임시 git worktree**에서 떴고,
    검증 후 `git worktree remove` 로 정리했다 — tracked content 오염 0)
  - `git diff --check` **clean**
  - `git grep` definition 검증: 네 helper 정의가 `src/renpy` 에 **0건** · `extFromMime` canonical **1건**(`src/assetMime.ts`) ·
    key3 canonical **3건**(`src/types/project.ts`) · `src/project`·`src/store`·`AssetsTab.tsx` → `renpy/generate` **0건** ·
    남은 importer **정확히 3개**(위 의도적 잔류)
  - ⚠️ **`golden:update` 는 실행하지 않았다**(golden 이 깨지면 그건 회귀다).
- ⚠️ **생성되는 `.rpy` 안의 소스 경로 표기는 일부러 stale 하게 남겼다** — `generate.ts` 가 `voices.rpy` 주석으로
  `(extFromMime, generate.ts)` 를 **출력 텍스트로** 방출하는데, 이건 golden 이 고정하는 **출력 byte 의 일부**라
  고치면 golden 이 깨진다(`i18n` 구성이 `voiceLocales` 를 가져 실제로 실려 있다). 후속 후보로만 둔다.
- **후속 후보(R1 범위 밖 — 지시가 있을 때만)**: 생성 `.rpy` 안의 stale source-location 주석(위) ·
  GUI 테마 규격 dependency(`types/project.ts`(type-only)·`generators/theme/*`·`ProjectMeta`·`ThemeStudio` → `renpy/gui/theme`) ·
  CG 키 `desc.trim()` 인라인 중복(`mergeScenes`·`AssetsTab`·`assetSlice` — R1 에서 `cgKey()` 를 만들지 **않았다**) ·
  generator export surface 전수 조사(`extFromMime` 처럼 generator 안에서 안 쓰이는 export 가 더 있는지 — R7 과 함께) ·
  `backgroundKey`/`bgmKey` 의 `.trim()` 을 직접 pin 하는 test.

<!-- /NA-PROV id=HR1 -->

<a id="r2"></a>
<!-- NA-PROV id=HR2 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L130-215 sha256=8d88a4d2f24b7dbe32deb0b3f43f77edcd3e15be64e34d7ffe9fc862fcc5c8bf -->
## 📌 안정화 리팩토링 R 축 — R2(`.npproj.zip` Compatibility Layer)가 확정한 것
> ⚠️ 이 절은 **안정화 R 축**이다(v1 Phase 번호·번역 로드맵·의상 UX·줄 삭제·CG 종료와 **다른 축**).
> 구현 = **`a282154`**(`src/project/transfer.ts` + 신규 `tests/transfer-compat.test.ts` **딱 2파일**).
> store·UI·localStorage·협업·Ren'Py 생성기 **전부 무수정**.

- **목적**: `.npproj.zip` 이 **기기 간 이동의 유일한 경로**인데 import 가 `manifest.version` 을 **한 줄도
  읽지 않아서**, ① 앱이 이해 못 하는 미래 schema 를 조용히 current 로 해석했고 ② 실재했던 과거
  컨테이너 차이는 판별조차 못 했다. 그 경계를 **한 곳**으로 만든다.
- **canonical compatibility boundary 는 `importProjectFile`(`src/project/transfer.ts`) 한 곳뿐이다.**
  `project.json` 을 읽는 앱 코드가 여기밖에 없어(다른 하나는 `scripts/e2e.mjs`) 우회로가 없다.
  ⚠️ 이 boundary 는 **Project payload 를 normalize·migrate 하지 않는다** — compatibility validation 과
  **에셋 파일명** adaptation 을 거쳐 payload 를 **손대지 않은 채** 기존 load path 로 **admit** 할 뿐이다.
- **validation ordering 은 그 자체가 계약이다 — 세 조건을 다시 한 줄로 합치지 말 것:**
  ```
  ① archive identity(app) → ② version compatibility → ③ current-schema minimum guard(project.scenes) → ④ asset restoration
  ```
  - ⚠️ **②를 ③ 뒤로 옮기지 말 것** — 미래 schema 는 `project.scenes` 자체가 다를 수 있어서, 순서가
    뒤집히면 정상 future archive 가 *"Novel-Agent 프로젝트 파일이 아닙니다"* 라는 **틀린 진단**을 받고
    future-rejection 계약이 약해진다.
  - ⚠️ **①을 ② 뒤로 옮기지 말 것** — foreign app 의 숫자를 우리 version 축으로 해석하면 안 된다.
  - ⚠️ **어떤 검증도 ④ 뒤로 옮기지 말 것.** 테스트가 *같은 `project:{}` payload 인데 `version` 만
    다르면 메시지가 갈린다* 는 것과 `putAsset` 0회로 이 순서를 고정한다.
- **`PROJECT_FILE_VERSION` 은 도입(`781f42a`, 2026-06-09) 이래 계속 `1` 이고 R2 도 bump 하지 않았다** —
  R2 가 write schema/컨테이너 layout 을 바꾸지 않기 때문이다(read compatibility 개선만으로는 올리지
  않는다). `exportProjectFile` 은 완전 무수정이다.
- **version 판정(전부)** — 판정 단일 소스는 `assertSupportedVersion` 하나다:
  ```
  1                              → accept (current)
  safe integer 이고 > 1          → future reject
  present + non-number / non-integer / <= 0 → invalid reject   (⚠️ coercion 금지 — '1' 을 1 로 읽지 않는다)
  부재(undefined)                → accept  (아래 단서)
  ```
  **supported older numeric version 은 존재하지 않는다**(도입 이래 늘 1이었다). ⚠️ 그래서 에러 문구에
  *"vN 까지 지원"* 처럼 `≤ CUR` 전체를 지원한다는 뉘앙스를 쓰지 말 것(*"이 앱의 지원 형식 vN"* 으로 표기).
- ⚠️ **부재를 "v1" 이나 "legacy generation" 으로 설명하지 말 것.** 공식 version-less generation 은
  **존재한 적이 없다**(최초 커밋부터 무조건 `version` 을 썼다). 부재를 accept 하는 **유일한 근거는
  기존 main loader 가 그 입력을 받아 왔다는 behavior preservation** 이다 — unversioned / noncanonical
  input 을 current parser 에 그대로 통과시킬 뿐, 어떤 generation 으로도 분류하지 않는다.
- ⚠️ **version 은 migration generation selector 가 아니다** — current 판별 + future 거부에만 쓴다.
  **실제 historical 호환성 차이는 `8a90eeb`(2026-07-14)의 에셋 파일명 규칙 교체 하나뿐이고, 그 세대도
  `version: 1` 이다**(Generation A = `audio/wav` 만 `.wav`, 그 외 전부 `.png`). 즉 version 으로는
  세대가 구분되지 않는다 → **version 키 migration 테이블·registry 를 만들지 말 것.**
- **Generation A 복원은 version migration 이 아니라 import 전용 이름 폴백**이다:
  ```
  현재 이름 extFor(mime) 우선  →  없을 때만 legacyExtFor(mime) = (mime === 'audio/wav' ? 'wav' : 'png')
  ```
  현재 세대 zip 은 id 당 파일이 정확히 하나(`extFor` 이름)라 **첫 조회가 항상 적중하고 폴백은 도달조차
  하지 않는다**(false positive 구조적 불가). ⚠️ **`extFor` body 와 export path 는 무수정**이고 절대
  레거시 규칙으로 되돌리지 말 것 — 현재 컨테이너 레이아웃 계약(`transfer-assets-roundtrip` 의 엔트리
  이름 목록)이 깨진다. ⚠️ 조회 **순서**를 뒤집지 말 것(테스트가 dual-entry 를 **바이트로** 고정한다 —
  current-only 아카이브에는 legacy 엔트리가 없어 기존 왕복 테스트만으로는 순서가 증명되지 않는다).
- **mutation-zero 보장의 범위(정확히)** — 아래 **세 rejection 경로에 한해서만** `putAsset` 0회이고
  store 교체·`deleteAssets`·`saveProject`·협업 push 가 시작조차 되지 않는다:
  ```
  future version · invalid version · invalid project.scenes
  ```
  ⚠️ **`.npproj.zip` import 전체가 atomic 하다고 쓰지 말 것.** `putAsset` 은 **에셋별 IndexedDB write**
  라, 압축 해제나 IDB write 가 루프 **중간**에 실패하면 앞쪽 write 가 rollback 된다는 보장이 없다.
  full transactional import 는 R2 범위 밖이고 **새 asset-store abstraction·transaction 시스템을 만들지
  않았다.**
- **error surface 는 기존 것을 그대로 쓴다** — `throw → persistenceSlice 의 catch →
  flash('가져오기 실패: …')`. 새 error class·`code` 필드·Result 타입·모달·토스트 **0**, store·UI 무수정.
  **malformed JSON 은 기존 SyntaxError 전달 behavior 그대로** 두었다(R2 에서 문구를 바꾸지 않았다).
  테스트는 **전체 문자열이 아니라 의미 정규식**으로 고정하되 future/invalid 를 구별한다.
- ⚠️ **localStorage·협업의 version 과 archive format version 을 연결하지 말 것** — `projectStore.ts` 는
  version 필드 자체가 없고, Supabase `projects.version` 은 **LWW 순서 카운터**다(`src/collab/sync.ts`).
  협업 pull 페이로드에는 format version 이 아예 없어 R2 범위 밖이다.
- **의도된 behavior change 3건**
  1. **Generation A 의 mp3/jpg/webp/gif blob 이 이제 복원된다** — 그 전엔 `if (!f) continue` 로 조용히
     유실됐고(메타는 남고 blob 만 없어 그림·소리가 안 났다) `assetCount` 가 늘어난다.
  2. **future / invalid version 은 이제 명시적 실패**다(그 전엔 조용히 current 로 해석).
  3. **`project.scenes` 가 배열이 아닌 손상 파일이 이전 프로젝트 에셋을 지우기 전에 실패한다** —
     그 전엔 `deleteAssets` 뒤 `set({… project.scenes[0] …})` 에서 TypeError 라 partial mutation 이 났다.
     ⚠️ 이건 **최소 조건 하나**이지 full Project schema validator 가 아니다(만들지 말 것).
- **검증 실측**: `typecheck`·`typecheck:tests` **PASS** · vitest **68파일 / 1095 tests**(신규
  `tests/transfer-compat.test.ts` **23**) · **Ren'Py golden 23구성 256파일 무변경**(⚠️ `golden:update`
  **미실행**) · `git diff --check` clean · **mutation probe 8건 전부 의도한 테스트 실패를 확인했고
  원복 상태도 검증했다**(future 경계 · 검증을 에셋 루프 뒤로 · 검증을 scenes 가드 뒤로 · 검증을 app
  앞으로 · scenes 가드 제거 · 폴백 제거 · 조회 순서 반전 · `isSafeInteger` 제거).
- **Phase I 로컬 검증 caveat(역사적 기록)**: 전체 스위트 실행 중
  `tests/integration-workflow.test.ts` 의 5초 timeout flake 가 발생했고 **baseline `b42228b` 에서도
  재현**됐다 — 그래서 R2 변경에 기인한 것으로 보지 않았다. `node scripts/e2e-run.mjs` 는 **별도로
  PASS** 했다. ⚠️ 이 별도 e2e PASS 를 **`npm run check:full` PASS 와 동일시하지 않는다.**
- **후속 후보(R2 범위 밖 — 지시가 있을 때만)**: `collectProjectFiles`(zip 계층) golden ·
  localStorage 왕복 golden · full transactional asset import.

<!-- /NA-PROV id=HR2 -->

<a id="r3"></a>
<!-- NA-PROV id=HR3 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L216-304 sha256=754b028c5bd9ae209d57db613fc6cf94c94f1fb3463ac636da7243886c18527b -->
## 📌 안정화 리팩토링 R 축 — R3(AssetsTab 구조 분리 + Background/BGM 장면 이동)이 확정한 것
> ⚠️ 이 절은 **안정화 R 축**이다(v1 Phase 번호·번역 로드맵·의상 UX·줄 삭제·CG 종료와 **다른 축**).
> **implementation 변경은 8파일**이다 — MODIFY `src/components/AssetsTab.tsx`·`scripts/e2e.mjs`, NEW
> `src/components/{assetGroups.ts,AssetGroupRows.tsx,CharacterCard.tsx,VoiceSection.tsx,AssetCleanupSections.tsx}`
> + `tests/asset-groups.test.ts`. **store·parser·Preview·persistence·Ren'Py 생성기 전부 무수정.**

- ⚠️ **목표 두 개는 성격이 다르다 — 둘 다 behavior-preserving 이라고 쓰지 말 것.**
  ① **구조 분리 = behavior-preserving refactor** — navigation 을 위해 **의도적으로 바꾼 두 곳**
  (`groupBy` 의 `sceneLabels`/global-index 파생 · `BgGroupRow`/`BgmGroupRow` 의 `SceneUsageBadge` 배선)을
  **제외한** 추출 대상 기존 로직은 그대로 보존했다. `CharacterCard`/`VoiceSection`/cleanup 두 섹션 ·
  CG · Item 은 **의미 변경 없이 이동**만 했다. ② **Background/BGM 장면 이동 = 의도적인 신규 UX
  behavior**(그래서 "회귀 0" 이 검증 기준이 될 수 없어 unit + E2E regression 을 새로 붙였다).
- **책임 경계(확정 — 새 범용 버킷을 만들지 말 것)**
  ```
  AssetsTab.tsx            top-level orchestration + 작은 순서 결합 row 유지
                           (TitleBgm·BgmPlaybackToggles·GameIcon·MenuArt·NarrationOnly·
                            PlayerName·AssignEmotions·SuggestOutfits — 배치 순서에 결합된
                            주석이 있어 묶으면 인위적 카테고리가 생긴다)
  assetGroups.ts           AssetsTab 전용 순수 group derived data (JSX 0 · import 는 Scene 타입뿐인 leaf)
  AssetGroupRows.tsx       Background/CG/Item/BGM group rendering + Background/BGM usage navigation
  CharacterCard.tsx        CharacterCard + 전용 sprite helpers(SpriteBatchUploadRow·ExpressionThumb)
  VoiceSection.tsx         project-wide TTS cost/batch/review
  AssetCleanupSections.tsx local/remote orphan cleanup pair
  ```
  ⚠️ `assetGroups.ts` 는 **leaf 로 유지**한다(다른 컴포넌트를 import 하면 순환). `AssetsTab.tsx` 가
  나머지를 **단방향으로** import 하는 트리를 깨지 말 것.
- **Background/BGM navigation UX 계약**
  ```
  single usage   → <button type="button">  누르면 즉시 그 장면으로
  multiple usage → native <select>         사용자가 장면을 고르면 그 장면으로 (고르지 않으면 no-op)
  ```
  ⚠️ **CG/Item navigation 은 R3 non-goal 이고 추가하지 않았다** — `CgGroupRow` 는 기존 `CountBadge`
  그대로이고 `CgGroup` 에 `sceneIds`/`sceneLabels` 를 넣지 않았다. `ItemGroupRow` 는 장면 귀속 구조
  자체가 없다.
  접근성은 **native button/select semantic 을 그대로 쓴다**(role·tabIndex·키 핸들러 자작 0) —
  이름은 `aria-label` 이 정본이고 `title` 은 마우스 툴팁 전용이다(⚠️ `title` 만을 accessible name 으로
  의존하지 말 것). 새 component library·CSS framework·modal·dropdown 라이브러리 **0**.
- **canonical navigation transition — 기존 `jumpToScene(id)`(`src/components/sceneJump.ts`) 재사용**
  ```
  selectScene(id) → setActiveTab('scenes') → 기존 requestAnimationFrame 스크롤
  ```
  `sceneJump.ts` 는 **한 줄도 고치지 않았다**. **새 navigation store/action/framework/router 0.**
  ⚠️ **AssetsTab 에서 클릭하는 순간에는 scene target DOM 이 아직 없다**(에셋 탭이라 장면 트리가
  언마운트돼 있다). 그래서 순서가 중요하다 — `selectScene` → `setActiveTab('scenes')` 를 **먼저** 하고,
  **그 다음 기존 rAF callback 에서** `scene-${id}` 를 조회한다. **그 시점에 target 이 렌더돼 있으면 기존
  스크롤이 그대로 수행되고**, rAF 조회에서도 target 이 없을 때에만 **상태 전이는 유지된 채 스크롤만
  생략**된다. ⚠️ **"클릭 순간 DOM 없음 = 스크롤 생략"으로 단정하지 말 것.** 그 위에 재시도·복구·
  타임아웃·stale-reference recovery 를 얹지 말 것.
- **usage derived-data 규칙(`Group`, `assetGroups.ts`)**
  ```
  sceneIds    = 실제 navigation identity (이동 대상)
  sceneLabels = UI-only 표시 데이터      (picker 에 보이는 글자)
  ```
  둘은 **같은 `groupBy` pass 의 같은 Scene 에서 같은 index 로** 생성된다(그래서 정상 derived data
  안에서 짝이 어긋난 pair 가 나오지 않는다). 라벨 = **global scene ordinal + title**(`#3 밤, 상가거리`),
  **빈 title 은 `#N` fallback**.
  ⚠️ **제목만으로는 안 된다** — 파서(`sceneBuilder.startScene`)가 `장면:` 마다 무조건 새 Scene 을 만들어
  **같은 제목의 장면이 여럿 존재한다**(샘플에도 "밤, 상가거리" 가 둘). **duplicate title 은 ordinal 로
  구별**한다.
  ⚠️ **ordinal 은 `include()`/filter 후 순번이 아니라 project `scenes` 배열의 global index** 다 — BGM
  그룹은 `hasBgm` 으로 걸러지므로 필터 후 번호를 쓰면 장면 카드의 번호와 어긋난다(unit test 가 이
  회귀를 전용으로 잡는다).
  ⚠️ 이 데이터는 **Project/Scene/store/archive schema 어디에도 저장되지 않는다**(기존 `bgs`/`bgms`
  `useMemo` 와 같은 렌더 파생값). `zero-usage` 그룹은 `include(s)` 를 통과한 장면에서만 그룹이 만들어져
  **구조적으로 생기지 않는다**.
- ⚠️ **`src/assetRefs.ts`(에셋 참조/GC canonical)와 이 UI-derived usage data 를 혼동하지 말 것** —
  전자는 프로젝트 전체 **flat 참조 집합**(고아 정리·원격 스윕용, 장면 귀속 없음)이고 후자는 그룹 카드
  렌더 전용이다. 목적이 달라 서로 대체하지 않는다. `assetRefs.ts`·`collab/assetsGc.ts` **무수정**.
- **store 변경 0** — 새 액션·새 State 필드·새 슬라이스 없음. `selectedSceneId`/`activeTab` 은 원래부터
  최상위 State 필드라 persistence 와 무관하고, `selectScene`/`setActiveTab` 이 **기존대로 각각
  `updatePresence` 를 호출**한다(새 종류의 presence behavior 는 없고, 이동 1회당 기존 두 액션의 presence
  update 호출이 발생할 뿐이다 — 장면 리모컨·번역 QA 점프에서 이미 일어나던 것과 같다).
- **Preview architecture / persistence / save-load / `.npproj.zip` / Ren'Py export 에 schema·path 변경 0.**
  navigation 이 `selectedSceneId` 를 바꿔 기존 selection-driven UI/Preview 가 그 장면을 반영하는 것은
  **의도된 기존 behavior 재사용**이다(새 Preview 경로가 아니다).
- **R1/R2 frozen contract 유지** — R1 의 canonical helper 위치와 "project/store/UI 는 shared domain·file
  rule 을 얻으려고 `renpy/generate.ts` 를 import 하지 않는다" 규칙, R2 의 `importProjectFile` 단일
  compatibility boundary·`PROJECT_FILE_VERSION = 1` 전부 그대로다.
- **검증 실측**: `typecheck`·`typecheck:tests`·`test`·`check`·`check:full` **전부 PASS**
  (vitest **69파일 / 1105 tests** — 신규 `tests/asset-groups.test.ts` **10**) ·
  e2e 에 **Background single / duplicate-title multiple / BGM single** 이동 regression 추가(장면 탭 전환 +
  대상 SceneCard `border-accent` + 직전 대상 해제 + 같은 제목 오선택 없음) ·
  **expected Ren'Py golden diff 0 · golden 파일 변경 0**(⚠️ `golden:update` **미실행**) ·
  `git diff --check` clean.
- **R4+ 에 영향을 주는 실제 발견**: `SceneCard` 의 제목 `input` 은 `onClick` 에서 `stopPropagation` 한다 —
  따라서 **그 제목 input 을 클릭하면 root 의 `select(sceneId)` 가 호출되지 않는다**. automation 에서 root
  selection 을 재현할 땐 input 이 아니라 **root/패딩 영역**을 클릭해야 한다. `SceneCard.tsx` 를 다루는
  R4 가 이 계약을 알고 있어야 한다.

<!-- /NA-PROV id=HR3 -->

<a id="r4"></a>
<!-- NA-PROV id=HR4 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L305-383 sha256=c77ab7362c995c6fb471f98ac86925eedb771f33b7a929f91000a218804c021b -->
## 📌 안정화 리팩토링 R 축 — R4(SceneCard 구조 분리)가 확정한 것
> ⚠️ 이 절은 **안정화 R 축**이다(v1 Phase 번호·번역 로드맵·의상 UX·줄 삭제·CG 종료와 **다른 축**).
> **implementation 변경은 2파일** — MODIFY `src/components/SceneCard.tsx`, NEW
> `src/components/SceneLineRow.tsx`. **store·types·parser·project·generators·Ren'Py·tests·scripts 전부 무수정.**

- **성격: behavior-preserving structure refactor 하나뿐이다.** 신규 UX·기능 추가 **0**(R3 처럼 "구조 분리 +
  새 UX" 두 목표가 아니다 — 그래서 R4 의 검증 기준은 **회귀 0** 이 그대로 성립한다).
  `SceneCard.tsx` 964줄을 책임 경계 하나에서 잘라 375 + 615줄로 나눴다(LOC 는 참고 수치일 뿐 계약이 아니다).
- **최종 책임 경계(확정 — 새 범용 버킷을 만들지 말 것)**
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
  **public boundary 는 `SceneCard → SceneLineRow` 의 `LineRow` 단방향 import 하나뿐**이다 —
  경계를 넘는 심볼이 그것 하나이고, **callback passthrough 0 · 새 context/framework 0**.
  ⚠️ 두 파일을 다시 합치거나 `SceneCardSections.tsx` 류 범용 버킷으로 재분할하지 말 것.
- **parent / child ownership (이동 0 — 이게 계약이다)**
  ```
  LineRow props 11개 유지(인터페이스 변경 0)
    sceneId · index · line · scene                    = line identity / render context
    charMap · effHidden · outfitChars ·
    outfitFlagsByChar · cgFlags · suggestions ·
    qaIssues                                          = parent 가 카드 단위로 계산·그룹핑해
                                                        줄에 배분하는 **기존** derived 값
  ```
  ⚠️ **`SceneCard` 의 `useMemo` derived 계산은 하나도 옮기지 않았다**(줄마다 store 구독·resolver
  재실행을 없앤 기존 성능 구조 그대로). ⚠️ **`LineRow` local state `editing`/`voiceOpen`/`outfitOpen`
  ownership 유지** · 줄 단위 store action 은 예전처럼 **line 계층이 직접 구독**한다.
  **새 store action / State 필드 = 0.**
- **R3 frozen DOM/navigation contract 보존 — 5개 전부 `SceneCard` parent 영역에 남고 무수정**
  ```
  root id            = `scene-${sceneId}`
  root click         → selectScene(sceneId)
  selected card      = border-accent
  scroll-mt-4 anchor 유지
  제목 input onClick   stopPropagation 유지
  ```
  (그래서 R3 의 asset → scene navigation·e2e 계약이 그대로 성립한다.)
- ⚠️ **R5 전달 계약 — R4 는 line identity 를 해결하지 않았다.**
  ```
  key={`${scene.lines.length}:${i}`}  그대로 유지 (호출 지점이 parent 라 파일 이동과 무관)
  그 key workaround 의 semantic 도 그대로 유지
  ```
  **`Line.id` · UUID · stable key helper · line migration · delete/insert identity redesign 은
  하지 않았다.** **line identity audit 은 R5 scope** 다.
- **behavior contract — canonical store/domain semantics 변경 0.** QA · CG · outfit · hide · voice ·
  emotion · delete 전부 그대로다(판정의 단일 소스가 store·`types/project.ts`·generators 에 있고
  그 파일들을 **수정하지 않았다**). **`LineRow` 내부 local state 와 조건 semantic 은 "이동만" 했다** —
  `manualOutfitWritable` · `canInsertCgEnd` · CG/item/BGM early-return 순서 ·
  `VoiceLab` 의 `sceneId`/`lineIndex` · `LineEmotion` 의 resolve precedence 와 수동 deps 전부 무변경.
- **compatibility — 전부 영향 없음**
  ```
  Project/Scene/Line schema 변경 0 · parser 영향 0 · Preview(ScenePlayer) 영향 0
  save/load/localStorage 영향 0 · .npproj.zip / R2 import boundary 영향 0
  asset refs 영향 0 · Ren'Py export 영향 0 · store responsibility 변경 0
  ```
  R1 의 "project/store/UI 는 `renpy/generate.ts` 를 import 하지 않는다" 규칙도 유지된다
  (신규 `SceneLineRow.tsx` 역시 **`renpy/generate.ts` import 0**). ⚠️ R1 규칙은 `generators/**`
  **전체** 금지가 아니다 — `SceneLineRow.tsx` 는 `generators/emotion/resolve`(값)와
  `generators/outfit`·`generators/translate/qa`(타입)를 **기존 그대로** import 한다.
- **검증 실측(전 게이트 PASS)**
  - `npm run typecheck` **PASS** · `npm run typecheck:tests` **PASS**
  - `npm run test` **69파일 / 1105 tests / 실패 0**(R3 baseline 과 동일 — 테스트 증감 0, 신규 test 0)
  - `npm run check` **PASS** · `npm run check:full` **PASS**(scratch Vite build → self-hosted preview →
    **e2e 전체 통과**)
  - **Ren'Py dump pre/post 23구성 / 256파일 · recursive diff 0**
  - **golden tracked 변경 0** · ⚠️ **`golden:update` 미실행**
  - `git diff --check` **clean**
- **이동의 성질(리뷰가 확인한 사실)**: 이동 블록을 원본과 byte 비교했을 때 **바뀐 줄은
  `function LineRow({` → `export default function LineRow({` 하나뿐**이고, **parent 잔류 구역은
  완전히 동일**하다. 신규 모듈 상단 docblock 만 새로 썼다.

<!-- /NA-PROV id=HR4 -->

## HANDOFF.md — 머리말 · 🎯 R 축 · 알아둘 것 (원문)

<a id="handoff-head"></a>
<!-- NA-PROV id=H00 src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L1-5 sha256=a4ea60e5f8750545e9318a09690f9108b7cb4f3df9dde74991a129c7011cbe9a -->
# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

<!-- /NA-PROV id=H00 -->

<a id="handoff-goal-raxis"></a>
<!-- NA-PROV id=Hg-g src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L30-30 sha256=287ad86bf3fbd3503216b87e7dd1a6f9e66f78a92f6f81410dd2c6ccced5d332 -->
- **안정화 리팩토링 R 축** — ⚠️ **v1 Phase 번호 체계·post-v1 축들과 섞지 말 것**(또 다른 별도 축이다). **R0(Regression Gate) 완료 · main 반영 완료**(`b452c1a`, 원격 GitHub Actions PASS). **R1(Domain Dependency 정리) 구현·검증 완료 · GPT implementation review PASS**(`chore/r1-domain-dependency`). **R2(`.npproj.zip` Compatibility Layer) 구현·검증 완료 · GPT implementation review PASS**(구현 `a282154`, `chore/r2-zip-compat`). **R3(AssetsTab 구조 분리 + Background/BGM 장면 이동) 구현·검증 완료 · GPT implementation review PASS**. **R4(SceneCard 구조 분리) 구현·검증 완료 · GPT implementation review PASS**(`chore/r4-scenecard-split`). 계약·실측은 아래 📌 R0·R1·R2·R3·R4 절이 각각 정본이다. ⚠️ **다음 후보는 R5(Line Identity Audit)** 이지만 **아직 열지 않았다** — 설계도 시작하지 않았고 **사용자 지시가 있을 때만** 연다(R5~R8 내용을 R4 문서로 당겨오지 말 것).
<!-- /NA-PROV id=Hg-g -->

<a id="handoff-know-supabase"></a>
<!-- NA-PROV id=Hk-a src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L1057-1057 sha256=14bd83b2b566169a64664e65875b922e4c81b781016725ad1c44d1c999fce612 -->
- **Supabase Storage 경고는 무시**(대시보드 "Remove policy" 절대 누르지 말 것 — 에셋 동기화가 400으로 깨진다). 에셋 버킷의 실제 노출 범위는 "배포 URL 아는 사람 = 전부 열람·업로드 가능"이며 감수한 선택(2026-08-05). 상세는 `supabase/setup.sql` 머리 주석.
<!-- /NA-PROV id=Hk-a -->

<a id="handoff-know-guiopt"></a>
<!-- NA-PROV id=Hk-b src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L1058-1058 sha256=04f84f8b5c2cd33ab12ff62508832dc6cda831ece785c305ca46bd5ae0d6ab51 -->
- **이미지 GUI 3종(메인·퀵·ESC)은 전부 opt-in** — 아무것도 안 올리면 생성 `.rpy`가 기존과 바이트 단위로 같아야 한다(회귀 0). 손댈 때마다 작업 전 커밋에서 여러 구성으로 `.rpy`를 덤프해두고 `diff -r`로 증명할 것(CLAUDE.md "출력 회귀 0 증명법").
<!-- /NA-PROV id=Hk-b -->

<a id="handoff-know-rest"></a>
<!-- NA-PROV id=Hk-c src=HANDOFF.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L1059-1063 sha256=c842392686bd41f00606f69e0fc309d09877c39a500386d05638123ac4a98736 -->
- **표정 AI 배정 실키 검증도 최후순위로 연기**(2026-08-10, TTS와 같은 취급) — OpenAI 키로 후보 밖 라벨·연속성·미소 계열 분화·토큰 견적을 볼 항목이었으나 당분간 안 한다. 코드는 이미 있으니 재개할 땐 `src/generators/emotion/` 부터. 재개 시 Phase 5 문맥 품질 확인 목록도 함께: 주인공↔히로인 반응 · 지문 개입 · 기존 표정 연속성 · 감정 유지 구간 · 명확한 급변 · 긴 장면.
- **TTS(Typecast)는 최후순위로 연기**(2026-08-09) — 실키 검증·Vercel Edge 배포 확인 모두 당분간 안 한다. 코드는 이미 들어와 있으니 재개할 땐 `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09) — 글자가 구워진 버튼이 영어·일본어에서도 한글로 남지만 감수. 다국어는 **텍스트 번역 + 폰트 교체**로만 간다(Ren'Py `tl/<언어>/` 이미지 치환은 CLAUDE.md에 방법만 남겨둔다).
- **store 액션엔 단위 테스트가 없다** — 안전망은 typecheck+e2e뿐이라 협업 push·자동저장 디바운스 같은 경로는 실사용 확인이 필요하다.
- 미착수(계속 의도적으로 뺌): 탭 컴포넌트 코드 스플리팅, `screensRpy.ts`(3484줄) 분리(생성기 쪽은 `.rpy` 회귀 0 덤프 대조가 필요한 별개 작업), store 슬라이스 안의 긴 로직(autoTranslateAll·보이스 배치)을 services 로 빼기. ⚠️ **`AssetsTab.tsx` 분리는 R3 에서, `SceneCard.tsx` 분리는 R4 에서 완료**됐다(위 📌 R3·R4 절) — 이 목록으로 되돌리지 말 것.
<!-- /NA-PROV id=Hk-c -->

## CLAUDE.md — 명령 · Ren'Py/GUI 함정 · 데이터 구조 원문 provenance

<a id="claudemd-preamble"></a>
<!-- NA-PROV id=C01 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L1-10 sha256=198375ab805fd3802a9ab417ba12e771ea25d8156d38b26115a46e99ee2daabc -->
# CLAUDE.md

> 🔵 **세션 시작 시 [`HANDOFF.md`](./HANDOFF.md) 먼저 확인** — 짧은 살아있는 상태 문서(🎯 다음 할 일 + ✅ 방금 반영됨). 관리 규칙은 아래 워크플로우.
> 🟣 **여러 세션에 걸친 대형 작업(복장·표정 LLM 추론)은 [`PHASES.md`](./PHASES.md)** — 작업 루프(Claude 계획 → GPT 검토 → 구현 → 확정)와 Phase 로그, 계획 전에 알아야 할 기존 코드 사실이 거기 있다.
> 🟢 **Novel-Agent v1 production baseline 은 Phase 19 에서 확정됐고 계획된 핵심 개발은 종료됐다**(Outcome A · docs-only · **v1 frozen production implementation baseline = `931a2cc`** · **Phase 19 final v1 repository checkpoint = `5902dc8`**) — 전 제품 checkpoint·verification·동결 상태의 정본은 [`PHASES.md`](./PHASES.md) "Phase 19 확정" 절이다. ⚠️ **정해진 다음 필수 Phase 는 없다** — 새 blocker 가 없는 한 동결된 Outfit/Expression semantic baseline 을 재튜닝하거나 Phase 20+ 를 자동 생성하지 말 것.

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind). BYO 키, 한국어 코드베이스.
이미지·BGM은 **앱이 생성하지 않음** — 외부 도구에서 만들어 에셋 탭에 업로드. 앱의 AI는 텍스트·보이스 전용 — OpenAI `gpt-4o-mini`(번역 고품질 모드만 `gpt-4o`): 대본 번역(영/일)·GUI 테마·표정 자동 배정·의상 전환 추천 / Typecast: TTS.
`.claude/settings.json`(SessionStart 훅·권한)이 repo에 커밋돼 있어 새 기기는 clone만 하면 인수인계 자동.

<!-- /NA-PROV id=C01 -->

<a id="claudemd-cmd-basic"></a>
<!-- NA-PROV id=C02a src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L11-16 sha256=5145c9d12c17d1ff641f49995b679766e7c203f3351d66550f24cc13b99e05e5 -->
## 명령
- `npm run dev`(5173) · `npm run build` · `npm run typecheck`(**코드 변경 후 항상**) · `npm run test`(vitest)
- **`npm run check` — 평상시 게이트(≈20초).** `typecheck`(production) → `typecheck:tests` → `test`(vitest 전체 = golden·`.npproj.zip` 왕복 포함). ⚠️ root `tsconfig.json` 은 `include: ["src"]` 그대로라 **tests 는 `tsconfig.tests.json` 으로만 검사된다** — `typecheck` 만 돌려놓고 "타입 통과"라고 하지 말 것.
- **`npm run check:full` — 전체 게이트(≈1분).** `check` → **OneDrive 밖 임시 디렉터리**에 Vite build → self-hosted preview → 기존 e2e. **서버를 미리 띄워둘 필요가 없다.**
- `npm run typecheck:tests` — tests 만 타입검사(`tsc -p tsconfig.tests.json`). `check` 가 이미 부른다.
- `npm run golden:update` — Ren'Py golden 갱신. **평소엔 부르지 않는다**(아래 golden 계약).
<!-- /NA-PROV id=C02a -->

<a id="claudemd-cmd-renpy"></a>
<!-- NA-PROV id=C02b src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L17-28 sha256=0b117d5b8ffef7e73294e1973d300031af141eb1821699898db589ab6274d33b -->
- `npm run gen:lint` — 샘플 대본으로 `.lint-tmp/`에 실제 `.rpy` 생성(+참조 이미지 스텁). 이후 `renpy.exe .lint-tmp lint`. ⚠️ OneDrive에선 산출물은 정상인데 **exit 127로 죽는다**(위 함정) — 파일이 생겼으면 성공이다.
  - ⚠️ **`gen:lint` 는 `check`·`check:full` 어디에도 들어가지 않는다(의도적 제외)** — ① 실제 `renpy.exe lint` 가 아니라 `.lint-tmp` **산출 단계**이고 ② 실제 lint 는 로컬 Ren'Py SDK 에 의존하며 ③ 생성 텍스트의 byte 회귀는 golden 이 담당한다. 화면·lint 검증이 필요할 때 **수동으로** 부른다.
- `npm run dump:rpy -- <OneDrive 밖 폴더>` — 23구성으로 `.rpy` 덤프(회귀 0 증명용). 작업 전 커밋에서 한 번, 작업 후 한 번 돌려 `diff -r`. 결정론적이라 같은 코드면 항상 같은 출력이다. 구성 목록은 **`scripts/renpyConfigs.ts`**(golden 과 공유하는 단일 소스)에 있다.
- **Ren'Py golden 회귀 계약** — `npm run test` 안의 `tests/renpy-golden.test.ts` 가 생성 결과를 **경로 → SHA-256** 매니페스트(`tests/golden/renpy-files.json`)와 대조해 **byte 단위 변경**을 잡는다. 현재 baseline = **23구성 / 256파일**.
  - 구성의 단일 소스는 **`scripts/renpyConfigs.ts`** 다(`dump:rpy` 와 golden 이 같은 목록을 쓴다). **새 Ren'Py 출력 경로·새 opt-in 출력 기능을 만들면 이 파일의 coverage 를 반드시 함께 검토**할 것 — 구성에 없으면 golden 도 `dump:rpy` 도 그 경로를 보지 못한다(실제로 의상 구성이 plain 과 똑같은 덤프를 내던 걸 잡았다).
  - **테스트는 golden 을 읽기만 하고 갱신·쓰기하지 않는다.** 갱신 경로는 **`npm run golden:update` 하나뿐**이다(자동 갱신을 만들면 게이트가 스스로를 통과시킨다).
  - golden 은 **어떤 구성의 어떤 경로가 달라졌는지(added/removed/changed)까지만** 알려준다. **실제 내용 차이는 기존대로 `dump:rpy` 두 벌 + `diff -r`** 로 본다.
  - 같은 구성에서 같은 path 가 두 번 나오면 **즉시 실패**한다(Record 로 접으면 앞 값이 조용히 덮여 생성기의 중복 방출을 놓친다).
  - ⚠️ `golden:update` 뒤 결정론 확인은 **scratch 사본 2회 byte 비교**로 한다 — `cp tests/golden/renpy-files.json "$SCRATCH/first.json"` → 다시 `golden:update` → `diff -u "$SCRATCH/first.json" tests/golden/renpy-files.json`. **최초 golden 은 untracked 라 `git diff` 로는 멱등성이 증명되지 않는다**(내용을 비교하지 않고 통과한다).
- `npm run test:e2e` — Playwright 풀 파이프라인(분석→업로드→ZIP 내용 검증). **이미 서버가 떠 있을 때** 쓰는 기존 명령이다(`BASE_URL` 로 대상 지정). 서버 준비까지 자동으로 하려면 **`npm run check:full`** 을 쓸 것.
  - `check:full` 의 러너(`scripts/e2e-run.mjs`)는 매 실행 **`mkdtemp` 새 폴더**에 빌드해 위 OneDrive 함정의 **스테일 dist 를 구조적으로 불가능**하게 만들고, **free port + `--strictPort`** 로 preview 를 띄운 뒤 **응답 본문이 방금 빌드한 `index.html` 과 같은지**까지 확인해 "옛 서버가 200 을 주는" 오탐을 막는다. 끝나면 kill → close 확인 → 임시 폴더 제거 순으로 정리한다(SIGINT/SIGTERM 포함).
  - ⚠️ preview 는 **`--host 127.0.0.1`** 로 바인딩한다 — 기본값 `localhost` 는 Windows 에서 **::1(IPv6)에만** 붙어 127.0.0.1 폴링이 60초 내내 실패한다(실제로 겪음). 수동으로 띄울 때도 같은 함정이 있다.
<!-- /NA-PROV id=C02b -->

<a id="claudemd-renpy-head"></a>
<!-- NA-PROV id=C03 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L35-35 sha256=bc66215618e070fc8bbb9cf27a1164f64556f268aea718562a766bf8c5e61d75 -->
## Ren'Py 생성 주의 (lint로도 못 잡는 런타임 버그)
<!-- /NA-PROV id=C03 -->

<a id="claudemd-renpy-esc"></a>
<!-- NA-PROV id=C04 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L36-37 sha256=012d06f81784cfbcac32e9d2ec2319482fe644d492f0a544b0333035ccf55e04 -->
- 화면 언어의 `add x:` 블록엔 애니메이션 ATL(`easein` 등) 금지 — 정적 속성만. 애니메이션은 `add x at transform:`으로 감쌀 것(`src/renpy/gui/screensRpy.ts`).
- **사용자 텍스트는 반드시 `esc`/`escRpyText`를 거칠 것**(`src/renpy/generate.ts`) — `%`·`[`·`{` 미이스케이프는 typecheck·lint 둘 다 못 잡는 **런타임** 크래시("할인 20%", "[속보]"). 새 .rpy 출력 경로를 추가할 땐 이스케이프부터 확인.
<!-- /NA-PROV id=C04 -->

<a id="claudemd-gui-traps"></a>
<!-- NA-PROV id=C12 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L67-98 sha256=9d22d5ec1184a879ad77a0122b354776a708977428b5ea52f3eb368fdc2d8466 -->
- **`flash` 는 단일 `toast` state 라 한 액션에서 두 번 부르면 앞 메시지가 조용히 사라진다** — `invalidateOutfitSuggestions` 는 pending 이 있을 때 자체 flash 를 내므로, 그걸 부르고 또 알릴 액션은 **호출측에서 pending 을 먼저 세어 마지막 합성 메시지 하나에 담는다**(`insertCgEndAfterLine` 이 그 예: pending 계산 → invalidate → `setScenes` → 합성 flash). ⚠️ 공유 액션에 `silent` 플래그를 달거나 toast 큐/새 알림 시스템을 만들지 말 것.
- **async 음성 첨부는 좌표가 아니라 request-time anchor 로 커밋한다**(`voiceLineAnchorMatches`·`src/store/helpers.ts` 단일 소스) — 음성 작업은 `(sceneId, lineIndex)` 만 들고 TTS·업로드를 건너가므로, 그 사이 줄이 추가·삭제되면 **같은 좌표의 다른 대사**에 `voiceAssetIds` 가 붙는다(예전 커밋 경로는 `kind === 'dialogue'` 만 봤다). anchor `{ speaker, canonical line.text }` 는 **최초 async boundary 이전**에 뜬다 — 단건은 `VoiceLab.generate`/`attachToLine`, 배치는 `collectVoiceTargets`(`anchorSpeaker`/`anchorText`). ⚠️ **`attachVoiceQuiet` 진입 시점에 현재 줄을 읽어 anchor 를 만들지 말 것** — 거긴 TTS 가 끝난 뒤라 이미 밀려 들어온 대사에서 anchor 를 뜨게 되어 검증이 통과한다. 검증은 **진입 fail-fast + 커밋 직전** 두 곳이고, 어긋난 항목은 **그 항목만 drop**(run 전체 폐기·좌표 remap 금지 — 남은 blob 은 기존 고아 에셋 스윕이 회수). ⚠️ `VoiceBatchItem.text` 는 **synthesis input**(비-base 로케일이면 번역문)이라 identity anchor 로 쓰지 말 것. speaker·원문이 완전히 같은 두 대사를 구별 못 하는 건 QA Phase 3~5 와 같은 등급의 accepted limitation 이다(Line UUID·revision·index remapping 금지).
- **CG 종료 복원은 기존 runtime state 재사용이다** — `revealedOrder`·`currentPos`·`lastShown`·`outfitAt` 를 그대로 쓰고, **기존 `#인물숨김 → #인물표시` 복원과 generator-local helper 한 벌(`restoreShownSprites`)을 공유**한다. ⚠️ **새 snapshot·history·state-machine 을 만들지 말 것**(알고리즘을 두 벌로 복제하는 순간 둘이 어긋난다). 복원값은 의상=복원 줄의 fold 값 · 표정=마지막으로 **실제 표시된** attr(CG 중 대사만 한 표정이 아니다) · 위치=기존 값이고, **CG 중 처음 등장한 화자는 복원 대상이 아니다**(post-CG 첫 발화에서 정상 등장). ⚠️ `hideSprites` 는 캐릭터별이 아니라 **장면 전체 boolean** 이라, 종료 시점에 숨김이면 **아무도** 복원하지 않는다(per-character hide 를 만들지 말 것).
- **인물 스프라이트 숨김 판정은 `spriteHiddenFlags`(`src/types/project.ts`) 단일 소스** — 장면(`Scene.hideSprites`)에서 출발해 줄(`Line.hideSprites`, 3-state)로 뒤집는다. 생성기·미리보기가 각자 계산하면 어긋난다(`resolveEmotion`과 같은 규칙). `#CG`는 별개 상태라 호출 측이 OR로 합친다(CG 중엔 `scene` 문이 이미 다 지웠으므로 hide/복원을 내지 말 것). ⚠️ **`hide` 뒤의 `show`는 반드시 속성 전체(`<의상> <표정>`)를 다시 줄 것** — 태그의 속성 기억이 사라져 속성 없는 `show`는 없는 이미지 참조로 죽는다(그래서 `lastShown`에 마지막 속성을 기록해 복원한다).
- **이미지 GUI에 글자를 굽지 말 것** — 이 앱은 다국어(ko/en/ja)가 핵심인데 글자가 박힌 버튼 이미지는 언어를 바꿔도 그대로 남는다. 라벨은 Ren'Py가 그리게 두고 이미지는 틀만(ESC 메뉴 에셋이 그 설계). 부득이 글자를 구웠다면 **`game/tl/<언어>/` 에 같은 파일명으로 두면 Ren'Py가 자동 치환**한다(`renpy/loader.py`의 `get_prefixes()`가 모든 탐색 앞에 `tl/<언어>/`를 붙이고, 언어 변경 시 이미지 캐시를 비운다). 없으면 원본으로 폴백.
- **ESC 메뉴 이미지 GUI는 스타일 배경 교체** — 화면을 새로 짜지 않고 `screens.rpy` 끝에 조건부 `style` 블록만 덧붙인다(`buildEscMenuStyles`). ⚠️ 실기에서만 드러난 함정 둘: ① 공통배경을 올리면 `game_menu_outer_frame`의 `Solid(gui.menu_overlay_color)` 스크림이 그 위를 덮어 **배경이 통째로 안 보인다** → `background None` 필요 ② 버튼 글자색 규칙이 **좌측 내비와 나머지가 정반대**다(내비는 어두운 사이드바 위라 평상시 밝은 글자, 선택버튼·슬롯·팝업은 밝은 아트 위라 평상시 어두운 글자). 하나로 통일하면 한쪽이 반드시 안 읽힌다.
- **플레이어 지정 주인공 이름은 "다음 대사부터" 반영된다 — 엔진 한계이지 버그가 아니다**(`project.playerName`, `Character(<callable>, dynamic=True)`). `who` 는 **say 문이 실행되는 순간 한 번** 평가돼 **문자열로** say 화면에 넘어가고(`renpy/character.py:1541`), `Text.per_interact`(`renpy/text/text.py:2388`)는 **언어가 바뀔 때만** 재치환한다 — 그래서 설정에서 이름을 바꿔도 **화면에 이미 떠 있는 줄은 안 바뀐다**(실기 확인). `renpy.restart_interaction()` 으로도 안 된다(화면 스코프에 확정된 문자열이 이미 들어 있다). 기록 화면이 옛 이름을 남기는 것도 같은 이유(`add_history` 가 그 시점 문자열을 저장). 세이브를 불러오면 새 이름으로 나오는 건 say 문이 다시 실행되기 때문. ⚠️ **우회로를 찾느라 시간 쓰지 말 것.** 기록만 현재 이름으로 통일하는 건 가능하다(`Character("[persistent.player_name]")` 보간 + 기록 `substitute True`) — 단 그러면 이름을 비운 플레이어의 기본 이름이 첫 실행 시점 언어로 고정된다. **사용자가 지금 동작을 유지하기로 확정(2026-08-10).**
- **타이틀 화면 BGM은 `config.main_menu_music`(options.rpy)** — 화면(`screens.rpy`)을 건드릴 일이 아니다. 엔진 `renpy/common/00start.rpy`의 `label _main_menu`가 메인 메뉴에 들어올 때마다 `renpy.music.play(config.main_menu_music, if_changed=True, fadein=config.main_menu_music_fadein)`을 부른다(같은 곡이면 안 끊김 — 장면 BGM의 `if_changed`와 같은 규칙). 경로는 `titleBgmFile()`(`src/types/menu.ts`) 단일 소스, 업로드가 있을 때만 define을 낸다(`buildZip`의 `resolveTitleBgm`이 blob 없으면 생성 전에 가지친다 — `window_icon`과 같은 패턴). ⚠️ **`label start`에서 곡을 멈추지 않는다**(사용자 결정) — 첫 장면에 `#BGM`이 없으면 타이틀 곡이 게임까지 이어지고, 그걸 끊는 건 기존 토글 `bgmPlayback.stopWhenUnset` 하나뿐이다.
- **`npm run gen:lint` 산출물은 lint 전용 — 실제 실행하면 메인 메뉴에서 죽는다**(재현 확인). `gen-lint.ts`는 `.rpy` 텍스트에 **리터럴로 박힌** 이미지 참조만 스텁하는데, 버튼 배경은 `gui/button/[prefix_]background.png` DynamicImage(정규식에 안 걸림)라 스텁이 안 생기고 `buildZip`만 굽는다(`buttonBgAssets`). 화면 동작 검증은 lint 폴더가 아니라 **실제 내보낸 프로젝트**로 할 것(`C:\renpy\renpy-scene\` 등).
- **게임 아이콘은 두 군데, 이름도 다르다** — exe 아이콘은 **프로젝트 루트의 `icon.ico`**(빌드 시 런처가 exe 리소스에 박음, `launcher/game/distribute.rpy`), 실행 중 창 아이콘은 **`config.window_icon`**(options.rpy). ⚠️ `gui.window_icon`으로 정의하면 **조용히 무시된다** — 그 값을 config로 옮겨주는 코드가 엔진에 없다(실기에서 아이콘이 안 바뀌는 걸로 발견). 경로는 `GAME_ICON_FILE`/`WINDOW_ICON_FILE`(`src/types/menu.ts`) 단일 소스.
- **`imagebutton`에 `focus_mask True` 금지** — 히트박스가 "불투명 픽셀"로 좁아지는데 메뉴 버튼 아트는 대개 여백이 투명(글자 획만 불투명)이라 **hover·클릭이 아예 안 먹는다**(실기 재현 확인). lint·typecheck 둘 다 못 잡음.
- **버튼 "눌린 상태" 이미지는 엔진이 지원 안 함** — `imagebutton` 상태는 idle/hover/selected_*/insensitive 뿐. `ImageButton`에 `activate_image` 슬롯이 남아 있으나 `activate_` 프리픽스를 세팅하는 코드가 엔진에 없다(레거시). 누르는 동안엔 hover 이미지가 보인다.
- **메뉴 버튼·로고 파일 경로는 `menuButtonFile()`/`TITLE_LOGO_FILE`(`src/types/menu.ts`) 단일 소스**로만 만들 것 — `screensRpy.ts`(참조)와 `buildZip.ts`(배치)가 어긋나면 없는 파일 참조로 런타임 크래시(폰트 `guiOverrides` 함정과 같은 종류). **메뉴 폰트(`menuFontId`/`menuSubFontId`)도 같은 대상** — `buildZip`의 `selectedFontFiles`에 빠뜨리면 커스텀 폰트 선택 순간 게임이 안 켜진다.
- **메뉴 라벨은 사용자 입력** — `.rpy`로 낼 때 반드시 `escRpyText`(`src/renpy/escape.ts`) 경유. 이스케이프 헬퍼는 순환 import(`generate`↔`screensRpy`)를 피하려 별도 모듈에 있고 `generate.ts`가 재수출한다.
- **메뉴 글자엔 외곽선이 필요**(`mainMenuUi.textOutline`, 기본 켜짐) — 이미지 버튼 경로에서 좌측 스크림 프레임을 없앴기 때문에 텍스트 메뉴는 업로드 배경 위에 맨몸으로 놓인다. 밝은 아트면 글자가 사라진다(실기 확인).
- **ESC 메뉴는 이미지를 깔아도 글자는 Ren'Py가 그린다** — 세이브 날짜·대사 기록·페이지 번호·버전 문자열이 전부 동적이라 이미지 버튼으로 대체 불가. 색은 `escMenuUi.colors`(앱에서 조절, 기본값=**밝은 아이보리 아트** 기준) → `escColors()`(`types.ts`)로 병합해 `buildEscMenuStyles`가 꽂는다. 하드코딩 금지 — 어두운 아트 게임에선 정확히 반대가 된다. ⚠️ 좌측 내비 글자색만 리터럴로 남아 있다(카드가 아니라 배경 아트의 **사이드바 위** 색이라 팔레트가 답을 모른다).
- **ESC 메뉴 글꼴(`escMenuUi.fontId`)은 gui.rpy define 경유** — `escFontStyles`(`screensRpy.ts`)가 ESC 텍스트 스타일들에 `font gui.esc_text_font`만 얹고, 실제 경로는 `guiRpy.ts`가 `fontVal()`로 낸다(일본어 프로젝트는 `_font_jp` FontGroup으로 감싸야 가나가 두부가 안 된다 — 경로를 스타일에 직접 굽지 말 것). 이 블록은 **항상 맨 마지막**이어야 한다(`navigation_button_text` 등 이름이 색 블록과 겹치는데, 테스트 헬퍼 `styleBlock()`이 첫 등장만 잘라낸다). 폰트 파일은 `buildZip`의 `selectedFontFiles`에 반드시 포함(빠뜨리면 폰트 고르는 순간 게임이 안 켜지는 `menuFontId` 함정 재현).
- **`gui.history_height = None`이면 기록 화면이 통째로 다른 배치가 된다** — `screen history()`가 `scroll=("vpgrid" if gui.history_height else "viewport")`라 엔진이 스스로 갈아타고 행이 내용 높이에 맞는다(고정 140px의 성긴 간격·긴 대사 잘림이 한 번에 사라진다). ESC 이미지 모드에서만 켜며 **모바일 `small` 변형의 190도 같이 None**으로 안 바꾸면 그쪽에서 되살아난다. 행 사이 여백·구분선은 `escHistoryMetrics()`(`screensRpy.ts`) 단일 소스 — `gui.history_spacing`(guiRpy)과 구분선 폭·오프셋(historyBody)이 같은 값에서 나온다.
- **ESC 기록 본문은 `style_prefix "history"`를 쓰지 않는다** — 항목을 `vbox`로 감싸 구분선을 붙였는데 prefix가 살아 있으면 정의된 적 없는 `history_vbox`를 찾다 죽는다(ESC `preferencesBody`가 위젯마다 스타일을 명시하는 것과 같은 이유). 화자 이름의 캐릭터별 색(`h.who_args["color"]`)도 ESC 분기에서만 뺐다 — 밝은 아이보리 카드 위에서 파스텔 색이 안 읽혀 시안이 강조색으로 통일했다.
- **`screen navigation()`은 ESC 메뉴와 텍스트 메인 메뉴가 공용, `screen game_menu()`는 메뉴 화면 전용** — 여기 뭔가를 추가할 때 이 차이를 헷갈리면 안 된다. `navigation`에 조건 없이 추가하면 메인 메뉴 자체 로고(`buildImageMainMenuScreen`)와 겹쳐 타이틀 화면에 두 번 나온다(그래서 `if not main_menu:`가 필요). 좌측 사이드바 타이틀 로고는 반대로 **`game_menu`에 조건 없이** 얹는다(사용자 결정 — 타이틀에서 연 설정 화면에도 로고가 나오길 원함) — 타이틀 화면엔 애초에 `game_menu`가 안 열리므로 두 번 나올 일이 없다. 로고 파일은 `mainMenuUi.logo` blob이 있을 때만 zip에 들어가므로 참조 게이트도 같아야 한다(`buildEscMenuPlan`이 blob 가지치기 후의 `effectiveProject`를 보므로 자동 일치).
- **타이틀에서 연 메뉴("환경설정" 등)도 ESC 공통배경으로 통일**(사용자 결정) — `screen game_menu()`의 `if main_menu: gui.main_menu_background else: gui.game_menu_background` 분기는 ESC `bg`를 올렸을 때만 없앤다(`gameMenuBackground`, `screensRpy.ts`). 게이트는 `buildEscMenuStyles`가 `game_menu_outer_frame`의 스크림을 걷는 조건(`has('bg')`)과 **반드시 같아야** 한다 — 어긋나면 "스크림도 없고 배경은 타이틀 아트"(원래 버그) 또는 "ESC 배경 위에 스크림 이중"이 된다.
- **ESC 메뉴 좌표는 `ESC_LAYOUT`(`screensRpy.ts`, 1920 기준 px) 단일 소스** — 기존 스타일은 전부 `gui.scale()` 상대값이라 **업로드 배경이 카드를 어디 그렸는지 모른다**. 그대로 두면 제목이 사이드바의 게임 타이틀을 덮고 격자가 카드 밖으로 흘러내린다(lint·테스트 전부 통과, 시안 대조로만 잡힘). `game_menu_navigation_frame`은 hbox의 **빈 자리채기**일 뿐이라(실제 내비는 `use navigation`이 절대좌표로 그린다) 폭을 줄여 콘텐츠 시작 x를 옮겨도 안전하다.
- **`game_menu_label`엔 `ypos`가 필요** — 없으면 제목이 y=0부터 그려져 카드 위쪽(어두운 배경)에 걸쳐 잘린 것처럼 보인다.
- **버튼 배경만 이미지로 갈아끼우면 크기는 글자 폭 그대로** — `xminimum`/`yminimum`을 에셋 규격으로 안 주면 "예" 버튼이 시안의 넓은 알약이 아니라 글자에 테두리만 두른 꼴이 된다(`confirm_button` 200×58, `confirm_frame` 680×330). `xysize`가 아니라 최소값이어야 긴 문구에서 넘치지 않는다.
- **ESC 격자는 뷰포트(콘텐츠 폭 − 스크롤바 거터) 안에 들어와야 한다** — `game_menu_viewport`의 `xsize`는 스타일에 박힌 고정값이라 **스크롤 여부와 무관하게 거터가 항상 빠진다**(1810−420−40=1350). 갤러리 칸을 아트 실측값 그대로 쓰다가 4×324+3×20=1356 / 3×440+2×20=1360으로 넘겨 맨 오른쪽 열이 잘렸다(실기 확인). 칸 크기는 `fitGalleryCell`(`screensRpy.ts`)로 **뷰포트에서 역산**하고(여유 `GALLERY_GRID_SAFETY`), 격자·그림칸·캡션이 칸 안에 있는지는 기하 불변식 테스트가 지킨다 — 숫자를 손으로 다시 못 박지 말 것.
- **`add x: fit "contain" xysize(...)`는 축소 후 크기가 xysize보다 작다** — `pos`로 직접 놓으면 세로 사진이 칸 왼쪽에 쏠려 붙는다. 안쪽 `fixed`를 두고 `align (0.5, 0.5)`로 가운데 놓을 것.
- **저장 슬롯 아트 안쪽 칸은 16:9가 아니다**(298×132 = 2.26:1). `config.thumbnail_*`을 칸 비율로 바꾸면 Ren'Py가 저장 시점에 화면을 비균등 축소해 썸네일이 찌그러진다 — 캡처는 16:9로 두고 표시할 때 `fit="cover"`로 자를 것(둥근 모서리는 `AlphaMask` + 생성 마스크 PNG, 크기는 `escSlotThumbMetrics` 단일 소스 — `screensRpy.ts`/`buildZip.ts` 양쪽이 같은 값을 써야 마스크가 안 뭉개진다).
- **`style_prefix`로 정의된 적 없는 스타일을 부르면 죽는다**(`radio_hbox` 등) — ESC 설정 카드 배치가 위젯마다 스타일을 명시하는 이유. frame에 `style_prefix`를 걸면 프레임 자신이 `<prefix>_frame`이 돼 카드 배경도 날아간다.
- **`hyperlink_text`는 `color`까지 줘야 한다** — 포커스를 못 받는 문맥에선 `idle_color`가 아니라 `color`를 쓴다(정보·크레딧·도움말의 `{a=}` 링크가 테마 분홍으로 남던 원인).
- **▶ 등 기호는 이모지 치환 주의** — Ren'Py는 `TwemojiCOLRv0.ttf`를 번들하고 기본 스타일이 `prefer_emoji True`라, U+25B6(이모지 등급 UNQUALIFIED) 같은 문자가 **파란 재생버튼 이모지로 치환**된다. UI 기호엔 스타일에 `emoji_font None`을 줄 것(엔진 자체도 `00director.rpy`에서 같은 관용구 사용). 나눔고딕엔 `▶▷◆★•●`는 있고 `U+25B8·U+2023·U+27A4·✦`는 **없다**(두부).
- **참조하는 파일은 zip에 반드시 들어가야 한다** — `tests/zip-asset-invariant.test.ts`가 지킨다(`collectProjectFiles` 결과의 `.rpy` 텍스트가 참조하는 `images|gui|fonts|audio/…` 경로가 전부 파일 목록에 있는지 교차 검증, 프리셋·폰트·로케일 매트릭스). **새 에셋 출력 경로를 추가하면 이 테스트 매트릭스에도 추가할 것.** 참조 쪽(`screensRpy`/`guiRpy`)과 배치 쪽(`buildZip`)이 따로 판단하면 안 되고, `buildZip`이 **생성 전에** blob 유무를 확인해 `mainMenuUi`를 가지치기한다(`resolveMainMenuArt` — `adopt*Fonts`와 같은 패턴).
- **폰트를 하나도 못 구하면 `DejaVuSans.ttf`로 폴백**(엔진 `renpy/common/` 내장, 번들 불필요) — 없는 폰트 파일을 참조해 크래시하느니 한글이 두부로 보여도 켜지는 쪽. `collectProjectFiles`가 `fontFallbackWarning`으로 사용자에게 알린다.
<!-- /NA-PROV id=C12 -->

<a id="claudemd-lint-shot"></a>
<!-- NA-PROV id=C13 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L99-100 sha256=80b017251ba3d6658265c3a6b75504ce2a327430b6d6dbfb112251ae127d5f5b -->
- 검증: `npm run gen:lint`로 출력 생성 → 실제 `renpy.exe .lint-tmp lint`(이 PC SDK: **`C:\renpy-8.5.3-sdk`**). **lint 통과 ≠ 동작** — 화면 변경은 `renpy.exe <폴더>`로 실제 실행해 스크린샷까지 볼 것(테스트용 프로젝트: `C:\renpy\renpy-scene\`, 실기 에셋이 든 사용자 프로젝트는 `…\카페테리아`).
- **화면 스크린샷 자동 수집법**(SendKeys는 Ren'Py 창에 안 먹는다) — 임시 `zz_verify.rpy`에 `label splashscreen:`을 두고 `renpy.show_screen(...)` → `renpy.pause(...)` → `renpy.screenshot(path)` 를 돌린 뒤 `renpy.quit()`. 함정 둘: ① **모달 화면(`confirm`)은 `renpy.pause`가 안 풀린다** → 별도 화면의 `timer`로 찍고 `Return()` 시킬 것 ② **`import renpy.<x>`를 rpy 안에서 쓰면 스토어의 `renpy`(exports 파사드)를 진짜 모듈로 덮어써 게임이 죽는다**(`renpy.music` 없다며 00mixers에서 크래시) → `from renpy.x import Y` 형태만 쓸 것. 프로젝트 복제는 node `cpSync`가 이 크기에서 죽으니 `robocopy /E`로.
<!-- /NA-PROV id=C13 -->

<a id="claudemd-regression-proof"></a>
<!-- NA-PROV id=C14 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L101-102 sha256=44a74b896a43cd96455858a44c5f9c55d08b6faddf91c277bafcdb8435861311 -->
- **출력 회귀 0 증명법**: 작업 전 커밋에서 `generateRenpyFiles`를 여러 구성(프리셋 5종·그라데이션·i18n·메뉴 이미지)으로 돌려 `.rpy`를 덤프해두고, 작업 후 같은 덤프와 `diff -r`. 리팩터·죽은 코드 제거는 여기서 1바이트도 달라지면 안 된다.

<!-- /NA-PROV id=C14 -->

<a id="claudemd-data-a"></a>
<!-- NA-PROV id=C15 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L103-114 sha256=c5cabd0d5871b8ee49642f12b15bc76793375913282c0d95d816079bae7c41a9 -->
## 데이터·구조
- **`Line` 에 추가되는 optional field 는 backward-compatible serialized 확장이다**(예: cg 종료 마커의 `end?: true`) — serialized shape 는 늘지만 **schema version bump·migration·save/load·`.npproj.zip` container format 변경은 없다**(안정화 R2 의 version 게이트는 **format version 과 `project.scenes` 배열 여부만** 보고 `Line` shape 는 보지 않는다 — 런타임 Project schema validator 는 여전히 없다). ⚠️ 구버전 앱은 새 field 를 이해하지 못하므로 **동등 동작을 보장하지 않는다** — 크래시 없는 graceful degradation 만 기대한다.
- **`.npproj.zip` 의 compatibility boundary 는 `importProjectFile`(`src/project/transfer.ts`) 한 곳이고, 그 안의 순서가 계약이다**(안정화 R2) — `① archive identity(app) → ② version compatibility → ③ current-schema minimum guard(project.scenes) → ④ 에셋 복원`. ⚠️ **세 조건을 다시 한 줄로 합치거나 순서를 바꾸지 말 것**: ②가 ③ 뒤로 가면 정상 future archive 가 "Novel-Agent 파일이 아님"이라는 **틀린 진단**을 받고, ①이 ② 뒤로 가면 남의 앱 숫자를 우리 version 축으로 해석하며, 어떤 검증이든 ④ 뒤로 가면 **rejection 전에 `putAsset`(IndexedDB) mutation 이 이미 시작될 수 있다**. version 판정의 단일 소스는 `assertSupportedVersion` 이다 — `1`=accept · safe integer `>1`=**future reject** · present 인데 non-number/non-integer/`≤0`=**invalid reject**(⚠️ coercion 금지) · **부재=accept**. ⚠️ **부재를 "v1"·"legacy 세대"로 해석하지 말 것**(version-less generation 은 존재한 적이 없다 — 받는 근거는 기존 loader 의 permissive acceptance 보존 하나뿐). **지원하는 하위 numeric version 은 없다.** `PROJECT_FILE_VERSION` 은 **`1` 고정**이고 write schema/컨테이너 layout 이 실제로 바뀔 때만 올린다.
  - ⚠️ **version 은 migration generation selector 가 아니다 — version 키 migration 테이블·registry 를 만들지 말 것.** 실제 historical 차이는 `8a90eeb`(2026-07-14)의 **에셋 파일명 규칙 교체** 하나뿐인데 **그 세대도 `version: 1`** 이라 version 으로는 구분되지 않는다. 그래서 복원은 **import 전용 이름 폴백**이다 — `extFor(mime)` **현재 이름 우선**, 없을 때만 `legacyExtFor(mime)`(`audio/wav ? wav : png`). ⚠️ **조회 순서를 뒤집지 말 것**이고 **`extFor` body·export path 는 무수정**이다(되돌리면 현재 컨테이너 레이아웃 계약이 깨진다).
  - ⚠️ **import 전체가 atomic 하다고 오해하지 말 것** — mutation-zero 는 **future version·invalid version·invalid `project.scenes`** 세 rejection 경로에만 보장된다. `putAsset` 은 에셋별 IndexedDB write 라 루프 중간 실패는 앞쪽 write 를 rollback 하지 않는다(full transactional import 를 만들지 않았다). 실패는 기존 `throw → catch → flash('가져오기 실패: …')` 를 그대로 타고 **malformed JSON 은 기존 SyntaxError 전달 그대로**다. ⚠️ localStorage 에는 version 이 없고 협업 `projects.version` 은 **LWW 카운터**라 archive format version 과 **연결하지 말 것**.
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB — 브라우저별(기기 이동은 앱 📤/📥 `.npproj.zip`), 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store/`, Ren'Py 출력=`src/renpy/generate.ts`, AI 설정=`src/config/aiConfig.ts`.
- **store 는 도메인 슬라이스로 나뉘어 있다**(`src/store/`, 외부는 예전처럼 `from '../store'` 의 `useStore` 하나만 쓴다). `index.ts`=초기 state + 조립, `types.ts`=State 인터페이스(액션 전부의 계약), `context.ts`=공유 클로저(`autoSave`·`flash`·`setScenes`·`commitAssetSwap`·`uploadAsset`·`collabHooks`), `helpers.ts`=순수 함수, 나머지는 `*Slice.ts`(ui/script/aiBatch/project/character/asset/menuGui/voice/collab/persistence). 새 액션은 **State 인터페이스에 선언 + 해당 슬라이스에 구현**. ⚠️ **슬라이스끼리 import 금지**(순환 방지) — 다른 슬라이스의 액션이 필요하면 `get().액션()` 으로 부를 것. 부수효과(저장·토스트·에셋 교체)는 직접 짜지 말고 `ctx` 의 공유 클로저를 쓴다.
- **`src/types/` 도 두 도메인**: `project.ts`(Locale·Line·Scene·Character·Project + 파생 헬퍼) / `menu.ts`(메인·퀵·ESC 메뉴 규격과 파일 경로 헬퍼). import 는 예전처럼 `from '../types'`(index 가 전부 재수출). 의존은 **menu → project 한 방향**만 — `menu.ts` 가 `Project` 를 값으로 가져오면 순환이 된다.
- **공용 규칙의 canonical 위치**(안정화 R1): Scene 파생 domain helper 는 `src/types/project.ts`(`backgroundKey`·`bgmKey`·`hasBgm` 이 `cgActiveFlags`·`outfitFlags` 옆에 있다), MIME→오디오 확장자는 `src/assetMime.ts`(import 0 잎 모듈)다. ⚠️ **project/store/UI 는 이런 공용 domain·file 규칙을 얻으려고 `renpy/generate.ts` 를 import 하지 말 것.** `backgroundKey`(`(s.background || s.title).trim()`)와 `resolveOutfit` 의 `scene.background ?? ''` 는 **다른 규칙이라 합치면 안 된다**(합치면 의상 매칭 대상이 바뀐다).
- 미업로드 에셋은 Canvas 플레이스홀더로 자동 채움 — 단 **BGM은 플레이스홀더 없음**(미업로드 씬은 `play music` 미방출, 파일명 `.mp3` 고정).
- **BGM 재생은 기본이 `if_changed`**(`project.bgmPlayback`, `src/renpy/generate.ts`의 `playMusicLine`) — Ren'Py는 `renpy.music.play()`가 기본적으로 dequeue+fadeout 후 재큐잉이라 **같은 곡이어도 장면이 바뀌면 처음부터 다시 재생**된다(`renpy/audio/music.py`의 `if if_changed and c.get_playing() in filenames:`가 재생 중인 곡과 파일명이 같으면 dequeue·fadeout을 건너뛰고 fadein을 0으로 강제 — `renpy/common/000statements.rpy`의 `parse_play_music`이 파싱하는 키워드). `restartSameBgm: true`로 옛 동작(항상 재시작)으로 되돌릴 수 있다. `stopWhenUnset: true`는 `#BGM` 미지정 장면에서 `stop music fadeout 1.0`을 내는데, 판정은 `hasBgm(scene)`(`src/types/project.ts` — generate.ts 안의 `!r.bgmFile`이 아니다) — "`#BGM`을 안 적었다"와 "적었지만 아직 업로드를 안 했다"는 다르고, 후자는 작가가 곡을 의도한 자리라 멈추면 안 된다.
<!-- /NA-PROV id=C15 -->

<a id="claudemd-data-menuart"></a>
<!-- NA-PROV id=C16 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L115-116 sha256=3e79f6f91e6a45baf228ecd7640353bfee5bbfb9c1cece7fd2618825df887b82 -->
- 메인 메뉴 이미지 GUI(`project.mainMenuUi`): 아무것도 안 올리면 `screens.rpy` 출력이 **바이트 단위로 기존과 동일**해야 한다(회귀 0 — `tests/main-menu-ui.test.ts`가 지킴). 좌표는 1920×1080 기준 px를 `height/1080` 배율로 구움 — **`gui.scale()`(720p 기준)을 쓰지 말 것**.
- 대사창 그라데이션: 창 높이·글자 보정량은 `dialogueGradientMetrics()`, 색은 `dialogueGradientColor()`(둘 다 `gui/theme.ts`) **단일 소스** — guiRpy(창)와 buildZip(PNG 픽셀 높이)이 어긋나면 Frame이 늘려/줄여 곡선이 뭉개진다. 색 기본값을 검정으로 하드코딩하지 말 것(밝은 테마는 본문 글자가 어두워 안 읽힘 — 실기 확인). 페이드를 늘릴 땐 `name/dialogue_ypos`에 같은 delta를 더해야 글자가 안 밀린다(`style window`는 하단 고정·위로 자람).
<!-- /NA-PROV id=C16 -->

<a id="claudemd-data-collab"></a>
<!-- NA-PROV id=C17 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L117-127 sha256=61a99e92a39e456559c8b9d758a7fd836daec2a2ed34758071ceccb1553d1ef7 -->
- 협업(src/collab/): Supabase last-write-wins relay(저장마다 600ms 디바운스 push) + 프레즌스, 에코 판정은 세션별 client_id. ⚠️ `projects` 테이블·Storage `assets` 버킷 모두 **RLS on + anon 개방 정책** 필수(정책 없이 RLS만 켜면 400). 전체 SQL=`supabase/setup.sql`(idempotent) — 재구축뿐 아니라 **스키마 바뀌는 버전업 배포 전에도 재실행**(예: client_id 컬럼, 없으면 협업 저장 400 / `assets open delete` 정책, 없으면 원격 정리 403).
  - **에셋 삭제는 로컬(IndexedDB)에만 반영된다** — 교체·해제·초기화 어디에도 원격 삭제가 없어 버킷은 단조 증가한다(업로드 경로만 있고 삭제 경로가 없던 비대칭). 회수는 에셋 탭 "☁️ 협업 Storage 정리" 스윕이 유일한 경로(`collab/assetsGc.ts` + `assetRefs.diffRemoteOrphans`). **교체 즉시 원격 삭제는 일부러 안 넣었다** — 상대가 아직 pull 안 했거나 LWW로 옛 프로젝트가 다시 올라오면 아직 쓰는 이미지를 지워 상대 화면에서 그림이 사라진다.
  - 스윕 판정은 **① projects 전 행의 참조 합집합**(Storage 키가 평면 구조라 방 구분이 없어, 내 프로젝트 기준으로만 빼면 남의 방 파일을 지운다) **② 업로드 후 유예 기간**(`REMOTE_GRACE_OPTIONS` — 기본 7일, UI에서 1일·전체로 변경 가능. 교체 직후 파일은 대부분 최근이라 7일 고정이면 정작 치우고 싶을 때 목록이 비어 나온다) 두 가드에 걸려 있다. 둘 중 하나라도 빼면 남이 쓰는 에셋을 지우는 데이터 손실이 된다.
  - **실제 노출 범위(중요 — "방 코드 아는 사람만"보다 넓다)**: anon 키는 설계상 번들에 구워져 공개된다(`supabaseClient.ts`). RLS 정책이 전부 개방(`true`)이고 Storage 오브젝트 키가 `<assetId>` 평면 구조라 **방 단위 구분이 없다** → 배포 사이트를 열 수 있는 사람은 누구나 `assets` 버킷 전체를 목록 조회·다운로드·업로드·덮어쓰기 할 수 있다. 실질 방어선은 "배포 URL을 모른다" 하나. 2인 사설 도구라 감수한 선택(2026-08-05 사용자 확인) — 뒤집으려면 공개 버킷+SELECT 정책 제거(열거 차단) 또는 Edge 함수 signed URL이 필요. **`service_role` 키는 RLS를 통째로 우회하니 절대 repo·번들에 넣지 말 것.**
  - Supabase 대시보드가 "Clients can list all files in this bucket / Remove policy"를 띄워도 **그 버튼을 누르면 안 된다** — `.download()`가 인증 엔드포인트를 타 SELECT 정책을 필요로 해서, 지우는 즉시 에셋 동기화가 400으로 깨진다(원격 정리 스윕의 목록 조회도 같이 죽는다).
  - `@supabase/supabase-js`는 **지연 로딩**(`getSupabaseClient()` 안의 동적 import) — 초기 번들에서 ~210KB 분리. 협업이 꺼져 있으면 아예 안 받는다. `supabaseClient.ts`에 최상위 `import`를 되살리지 말 것.
- 폰트(src/fonts/): GCS 공개 버킷 온디맨드 fetch→IndexedDB 캐시(기본 나눔고딕만 로컬 번들). `guiOverrides.bodyFontId`/`nameFontId`는 gui.rpy(`theme.ts`)와 zip 폰트파일(`buildZip.ts`) **양쪽 일치 필수**(하나만 바꾸면 없는 파일 참조).
- **zustand 구독은 필드 단위로**(`useStore((s) => s.project.title)`) — `s.project` 통째 구독은 프로젝트가 매번 새 객체라 **무관한 키 입력마다** 그 트리 전체가 재렌더된다. 셀렉터는 렌더 여부와 무관하게 **모든 `set()`마다 전부 재실행**되므로 셀렉터 안에서 `scenes.find(...)` 금지 — `sceneById()`(`store/helpers.ts`, `WeakMap<Scene[], Map>` 인덱스)를 쓸 것(150장면×150카드 = 키 입력당 2만 회 비교였다).
- 에셋 object URL은 `useAssetUrl`의 **ref-count 공유 캐시** 경유 — 같은 blob을 두 컴포넌트가 물어도 URL은 하나. `assetStore`의 삭제/초기화가 `subscribeAssetChange`로 무효화를 통지한다.
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

<!-- /NA-PROV id=C17 -->

<a id="claudemd-handoff-rule"></a>
<!-- NA-PROV id=C18 src=CLAUDE.md@047cc7d83a38aa6b2b229162f6849f2c4562cc58 L133-133 sha256=bd6a1522f20b313417a8bf9fed32383e812d1935a4a7f987775ccb4b2a0d231b -->
- **HANDOFF.md 인수인계**(삭제 금지·짧게 유지): 세션 시작 시 `✅ 방금 반영됨`이 git log에 실제 있는지 확인 후 그 줄 삭제. 작업 끝엔 완료분 1줄을 `✅`에, 남은·새 일을 `🎯`에 갱신(서술 금지 — 이력은 git log).
<!-- /NA-PROV id=C18 -->

## 부록 — Pre-R5 Housekeeping provenance ledger

> **"무손실"이 이 저장소 안에서 자립하도록 남기는 대장이다.**
> baseline = `047cc7d83a38aa6b2b229162f6849f2c4562cc58`(= `047cc7d`).

### 보존 방식

Pre-R5 Housekeeping 에서 root 문서(`CLAUDE.md`·`HANDOFF.md`·`PHASES.md`)로부터 **삭제되거나 재작성된**
모든 source range 는 아래 셋 중 하나다.

1. **exact-preserved** — 여는 마커와 닫는 마커 사이에 **byte 단위 그대로** 들어 있다.
   마커는 `id` · `src=<파일>@047cc7d` · `L<시작>-<끝>` · `sha256=<hex>` 를 담는다(실제 형태는 아래 블록에서 볼 것).
   총 **79블록** — `v1-ai-phases.md` 42 · `post-v1.md` 15 · `stabilization-r0-r4.md` 22.
   (이 문단은 마커 문자열을 리터럴로 적지 않는다 — 마커를 세는 grep 결과가 위 숫자와 어긋나지 않게 하려는 의도다.)
2. **root 에 그대로 남음** — 아래 §비아카이브 표.
3. **intentionally removed** — 아래 §의도적 제거 표(사유 필수).

**검증 방법**(누구나 재현 가능):

```bash
# ① 원문 꺼내기
git show 047cc7d:PHASES.md | sed -n '635,783p' > /tmp/src.txt
# ② 이 문서의 해당 NA-PROV 블록 payload 와 sha256 비교
sha256sum /tmp/src.txt   # 마커의 sha256= 값과 같아야 한다
```

⚠️ `NA-PROV` 마커 **사이의 payload 는 한 글자도 고치지 말 것** — 고치는 순간 이 증명이 깨진다.

### 의도적 제거 (repository 어디에도 그 wording 을 보존하지 않는다)

| source | range | 내용 | 사유 |
|---|---|---|---|
| `HANDOFF.md` | L1065-1069 | ✅ 방금 반영됨 (R4 — 이미 6dffbba/047cc7d 로 main 에 커밋됨) | 해당 커밋이 **이미 `main` 에 있다**(`6dffbba`·`047cc7d`). 기존 세션 규칙이 정한 정상 소멸이고, 무엇이 반영됐는지는 git log 와 이 문서의 R4 절이 보존한다. |

**의도적 제거는 위 1건이 전부다.**

### 비아카이브 range — root 에 byte-identical 로 남아 있다 (삭제가 아니다)

| source | range | 상태 |
|---|---|---|
| `CLAUDE.md` | L29-34 | root 에 그대로 유지 — `## 환경 함정 (중요)…` |
| `CLAUDE.md` | L128-132 | root 에 그대로 유지 — `## 워크플로우 (YOU MUST)…` |
| `HANDOFF.md` | L32 | 공백 줄(정보 없음) |
| `HANDOFF.md` | L1056 | root 에 그대로 유지 — `## 📌 알아둘 것 (지속)…` |
| `HANDOFF.md` | L1064 | 공백 줄(정보 없음) |
| `PHASES.md` | L1417 | 공백 줄(정보 없음) |
| `PHASES.md` | L1424 | 공백 줄(정보 없음) |

⚠️ 이 표의 항목은 **root 문서에서 문자 그대로 찾을 수 있어야 한다.**
(예: `CLAUDE.md` 「환경 함정」 절과 「워크플로우 (YOU MUST)」 절의 나머지 줄들.)
