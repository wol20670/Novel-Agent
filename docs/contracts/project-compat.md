# Contract — Project 호환성 (persistence · schema · `.npproj.zip` · 에셋 · 협업)

> 이 문서는 **"앞으로 무엇을 깨면 안 되는가"의 정본**이다. 무슨 일이 있었는가는 [`docs/history/`](../history/stabilization-r0-r4.md).
> **이 문서와 코드가 다르면 코드가 이긴다.** history 는 현재 contract 를 override 하지 못한다.

## 저장 계층

- 프로젝트 메타 = **localStorage**, 바이너리 에셋 = **IndexedDB**. 둘 다 **브라우저별**이라 기기 이동은
  앱의 📤/📥 `.npproj.zip` 이 유일한 경로다. API 키도 기기별 재입력이다.
- 미업로드 에셋은 Canvas 플레이스홀더로 자동 채운다 — 단 **BGM 은 플레이스홀더가 없다**
  (미업로드 씬은 `play music` 을 방출하지 않고 파일명은 `.mp3` 고정).

## `Line` schema 확장 규칙

- **`Line` 에 추가되는 optional field 는 backward-compatible serialized 확장**이다
  (예: CG 종료 마커의 `end?: true`). serialized shape 는 늘지만
  **schema version bump · migration · save/load · `.npproj.zip` container format 변경은 없다.**
- 런타임 Project schema validator 는 **여전히 없다**. 안정화 R2 의 version 게이트는
  **format version 과 `project.scenes` 배열 여부만** 보고 `Line` shape 는 보지 않는다.
- ⚠️ 구버전 앱은 새 field 를 이해하지 못하므로 **동등 동작을 보장하지 않는다** —
  크래시 없는 graceful degradation 만 기대한다.

### 새 필드를 `Line`/`Scene`/`Project` 에 추가할 때 따라오는 경로

1. localStorage 저장(project 통째) · IndexedDB(바이너리만) — **자동**
2. `.npproj.zip` 내보내기/가져오기(`src/project/transfer.ts`) — project JSON 통째라 **자동**
3. 협업 LWW push(`src/collab/`) — **자동**
4. **재분석 병합(`src/project/mergeScenes.ts`)** — **수동 확인 필요**.
   `emotion`/`emotionAuto` 를 왜 갈랐는지가 여기 있다(`next.emotion ?? prev.emotion` 규칙 때문에
   AI 값이 작가 태그인 척 살아남는 문제).
5. **Ren'Py 출력(`src/renpy/generate.ts`)** — **수동 확인 필요**. 사용자 텍스트는 반드시
   `esc`/`escRpyText` 경유 → [renpy-export.md](./renpy-export.md)

## `.npproj.zip` compatibility boundary (안정화 R2)

**canonical boundary 는 `importProjectFile`(`src/project/transfer.ts`) 한 곳뿐**이다.
`project.json` 을 읽는 앱 코드가 여기밖에 없어(다른 하나는 `scripts/e2e.mjs`) 우회로가 없다.
이 boundary 는 **Project payload 를 normalize·migrate 하지 않는다** — compatibility validation 과
에셋 파일명 adaptation 을 거쳐 payload 를 **손대지 않은 채** 기존 load path 로 admit 할 뿐이다.

### validation ordering 은 그 자체가 계약이다 — 세 조건을 한 줄로 합치지 말 것

```
① archive identity(app) → ② version compatibility → ③ current-schema minimum guard(project.scenes) → ④ 에셋 복원
```

- ⚠️ **②를 ③ 뒤로 옮기지 말 것** — 미래 schema 는 `project.scenes` 자체가 다를 수 있어서, 순서가
  뒤집히면 정상 future archive 가 *"Novel-Agent 프로젝트 파일이 아닙니다"* 라는 **틀린 진단**을 받는다.
- ⚠️ **①을 ② 뒤로 옮기지 말 것** — 남의 앱 숫자를 우리 version 축으로 해석하면 안 된다.
- ⚠️ **어떤 검증도 ④ 뒤로 옮기지 말 것** — rejection 전에 `putAsset`(IndexedDB) mutation 이 시작될 수 있다.

### version 판정 — 단일 소스는 `assertSupportedVersion`

```
1                                          → accept (current)
safe integer 이고 > 1                      → future reject
present + non-number / non-integer / <= 0  → invalid reject   (⚠️ coercion 금지 — '1' 을 1 로 읽지 않는다)
부재(undefined)                            → accept
```

- **지원하는 하위 numeric version 은 존재하지 않는다**(도입 이래 늘 1이었다).
  ⚠️ 에러 문구에 *"vN 까지 지원"* 처럼 `≤ CUR` 전체를 지원한다는 뉘앙스를 쓰지 말 것.
- ⚠️ **부재를 "v1"·"legacy 세대"로 해석하지 말 것** — 공식 version-less generation 은 **존재한 적이 없다**.
  받는 유일한 근거는 **기존 loader 의 permissive acceptance 보존**이다.
- `PROJECT_FILE_VERSION` 은 **`1` 고정**이고, write schema/컨테이너 layout 이 실제로 바뀔 때만 올린다.
  `exportProjectFile` 은 무수정이다.

### ⚠️ version 은 migration generation selector 가 아니다

**version 키 migration 테이블·registry 를 만들지 말 것.** 실제 historical 차이는 `8a90eeb`(2026-07-14)의
**에셋 파일명 규칙 교체** 하나뿐인데 **그 세대도 `version: 1`** 이라 version 으로는 구분되지 않는다.
복원은 **import 전용 이름 폴백**이다:

```
extFor(mime) 현재 이름 우선  →  없을 때만 legacyExtFor(mime) = (mime === 'audio/wav' ? 'wav' : 'png')
```

⚠️ **조회 순서를 뒤집지 말 것**이고 **`extFor` body·export path 는 무수정**이다
(되돌리면 현재 컨테이너 레이아웃 계약이 깨진다).

### mutation-zero 의 정확한 범위

**future version · invalid version · invalid `project.scenes`** 세 rejection 경로에만 보장된다.
⚠️ **import 전체가 atomic 하다고 오해하지 말 것** — `putAsset` 은 에셋별 IndexedDB write 라
루프 중간 실패는 앞쪽 write 를 rollback 하지 않는다(full transactional import 를 만들지 않았다).
실패는 기존 `throw → catch → flash('가져오기 실패: …')` 를 타고, **malformed JSON 은 기존 SyntaxError 전달 그대로**다.

⚠️ **localStorage 에는 version 이 없고 협업 `projects.version` 은 LWW 카운터**라 archive format version 과
**연결하지 말 것**.

## 도메인 helper 의 canonical 위치 (안정화 R1)

> **project / store / UI 계층은 shared domain rule 또는 shared file rule 을 얻으려고
> `src/renpy/generate.ts` 를 import 하지 않는다.**

⚠️ *"domain ↔ renpy 완전 단방향"* 처럼 전체 architecture 를 포괄하는 표현을 쓰지 말 것 —
`types/project.ts → renpy/gui/theme`(type-only)가 여전히 있고 의도적 잔류도 남는다.

```
backgroundKey · bgmKey · hasBgm  →  src/types/project.ts   (cgActiveFlags·outfitFlags 옆)
extFromMime                      →  src/assetMime.ts       (import 0 잎 모듈)
```

정확한 body(이 값이 정본):

```
backgroundKey(s) = (s.background || s.title).trim()
bgmKey(s)        = (s.bgm || s.title).trim()
hasBgm(s)        = !!(s.bgm || s.bgmAssetId)
```

- ⚠️ **`hasBgm` 을 "`#BGM` 을 적었는가"로만 읽지 말 것** — 이름 없이 `bgmAssetId` 만 있어도 `true` 다.
  `stopWhenUnset` 으로 `stop music fadeout 1.0` 을 낼지의 **정책**은 여전히 `renpy/generate.ts` 소유다.
- ⚠️ **`backgroundKey` 와 `resolveOutfit` 의 `scene.background ?? ''` 는 다른 규칙 — 합치지 말 것.**
  저쪽은 title 폴백도 `.trim()` 도 없다. 통합하면 의상 매칭 대상이 바뀌어 게임 출력이 달라진다.
- ⚠️ `src/assetMime.ts` 는 **import 가 0줄**이어야 하고, `src/assetRefs.ts`(참조 수집·GC)와 **다른 책임**이라 합치지 말 것.

**의도적으로 남긴 generator dependency(정확히 3개 — 정리 대상 아님)**

```
ScenePlayer → arrangePositions·attrFor·selectSprite·spriteSlots : Preview/Export parity
RenpyTab    → generateRenpyFiles
buildZip    → generateRenpyFiles·resolveItems·resolveCgs·charIdMap·voiceBaseName
```

⚠️ R1 규칙은 `generators/**` **전체** 금지가 아니다 — 예컨대 `SceneLineRow.tsx` 는
`generators/emotion/resolve`(값)와 `generators/outfit`·`generators/translate/qa`(타입)를 기존대로 import 한다.

## store 구조

- store 는 도메인 슬라이스로 나뉜다(`src/store/`, 외부는 `from '../store'` 의 `useStore` 하나만 쓴다).
  `index.ts`=초기 state + 조립 · `types.ts`=State 인터페이스(액션 전부의 계약) ·
  `context.ts`=공유 클로저(`autoSave`·`flash`·`setScenes`·`commitAssetSwap`·`uploadAsset`·`collabHooks`) ·
  `helpers.ts`=순수 함수 · 나머지는 `*Slice.ts`(ui/script/aiBatch/project/character/asset/menuGui/voice/collab/persistence).
- 새 액션은 **State 인터페이스에 선언 + 해당 슬라이스에 구현**.
- ⚠️ **슬라이스끼리 import 금지**(순환 방지) — 다른 슬라이스 액션이 필요하면 `get().액션()`.
  부수효과(저장·토스트·에셋 교체)는 직접 짜지 말고 `ctx` 의 공유 클로저를 쓴다.
- `src/types/` 도 두 도메인: `project.ts`(Locale·Line·Scene·Character·Project + 파생 헬퍼) /
  `menu.ts`(메인·퀵·ESC 메뉴 규격과 파일 경로 헬퍼). 의존은 **menu → project 한 방향**만
  (`menu.ts` 가 `Project` 를 값으로 가져오면 순환이 된다).
- **zustand 구독은 필드 단위로**(`useStore((s) => s.project.title)`) — `s.project` 통째 구독은
  무관한 키 입력마다 트리 전체를 재렌더한다. 셀렉터는 **모든 `set()` 마다 전부 재실행**되므로
  셀렉터 안에서 `scenes.find(...)` 금지 — `sceneById()`(`store/helpers.ts`, `WeakMap` 인덱스)를 쓸 것.
- 에셋 object URL 은 `useAssetUrl` 의 **ref-count 공유 캐시** 경유. `assetStore` 의 삭제/초기화가
  `subscribeAssetChange` 로 무효화를 통지한다.
- **store action test coverage 는 action 별로 다르다** — 변경 전에 관련 `tests/**` 를 실제로 조사하고
  blast radius 에 맞는 verification 을 선택한다.

## 협업 (`src/collab/`)

- Supabase last-write-wins relay(저장마다 600ms 디바운스 push) + 프레즌스. 에코 판정은 세션별 `client_id`.
- ⚠️ `projects` 테이블·Storage `assets` 버킷 모두 **RLS on + anon 개방 정책** 필수(정책 없이 RLS 만 켜면 400).
  전체 SQL = `supabase/setup.sql`(idempotent) — 재구축뿐 아니라 **스키마가 바뀌는 버전업 배포 전에도 재실행**.
- **에셋 삭제는 로컬(IndexedDB)에만 반영된다** — 교체·해제·초기화 어디에도 원격 삭제가 없어 버킷은 단조 증가한다.
  회수는 에셋 탭 "☁️ 협업 Storage 정리" 스윕이 유일한 경로(`collab/assetsGc.ts` + `assetRefs.diffRemoteOrphans`).
  **교체 즉시 원격 삭제는 일부러 안 넣었다** — 상대가 아직 pull 안 했거나 LWW 로 옛 프로젝트가 다시 올라오면
  아직 쓰는 이미지를 지워 상대 화면에서 그림이 사라진다.
- 스윕 판정의 두 가드(하나라도 빼면 데이터 손실):
  **① projects 전 행의 참조 합집합**(Storage 키가 평면 구조라 방 구분이 없다)
  **② 업로드 후 유예 기간**(`REMOTE_GRACE_OPTIONS` — 기본 7일, UI 에서 1일·전체로 변경 가능).
- ⚠️ **실제 노출 범위(중요 — "방 코드 아는 사람만"보다 넓다)**: anon 키는 설계상 번들에 구워져 공개된다.
  RLS 정책이 전부 개방(`true`)이고 Storage 오브젝트 키가 평면 구조라 **방 단위 구분이 없다** →
  배포 사이트를 열 수 있는 사람은 누구나 `assets` 버킷 전체를 목록 조회·다운로드·업로드·덮어쓰기 할 수 있다.
  실질 방어선은 "배포 URL 을 모른다" 하나. 2인 사설 도구라 감수한 선택(2026-08-05 사용자 확인).
  **`service_role` 키는 RLS 를 통째로 우회하니 절대 repo·번들에 넣지 말 것.**
- ⚠️ Supabase 대시보드가 "Clients can list all files in this bucket / Remove policy" 를 띄워도
  **그 버튼을 누르면 안 된다** — `.download()` 가 인증 엔드포인트를 타 SELECT 정책을 필요로 해서
  지우는 즉시 에셋 동기화가 400 으로 깨진다(원격 정리 스윕의 목록 조회도 같이 죽는다).
- `@supabase/supabase-js` 는 **지연 로딩**(`getSupabaseClient()` 안의 동적 import) — 초기 번들에서 ~210KB 분리.
  `supabaseClient.ts` 에 최상위 `import` 를 되살리지 말 것.

## 폰트

GCS 공개 버킷 온디맨드 fetch → IndexedDB 캐시(기본 나눔고딕만 로컬 번들).
`guiOverrides.bodyFontId`/`nameFontId` 는 gui.rpy(`theme.ts`)와 zip 폰트파일(`buildZip.ts`)
**양쪽 일치 필수**(하나만 바꾸면 없는 파일 참조) → [renpy-export.md](./renpy-export.md)

## 저장소 baseline SHA (두 축 — 섞지 말 것)

```
v1 frozen production implementation baseline = 931a2cc   (Phase 16 구현)
Phase 19 final v1 repository checkpoint      = 5902dc8   (문서·이력 포함 저장소 기준점)
```

⚠️ 이후의 post-v1 correction 은 이 역사적 baseline 을 재정의하지 않지만,
**현재 HEAD 의 `src`/`tests` 트리가 `931a2cc` 와 동일하다는 뜻도 아니다.**
`production implementation baseline` 을 커밋마다 새 SHA 로 갱신하는 체계를 만들지 않는다.

## gitignore

`.secrets/` · `docs/*`(단 `!docs/contracts/` · `!docs/history/`) · `node_modules/` · `dist/` · `scenario/` 등.
⚠️ git 규칙상 부모 디렉터리가 제외되면 자식을 다시 포함할 수 없어 **`docs/` 가 아니라 `docs/*`** 여야
negation 이 동작한다.
