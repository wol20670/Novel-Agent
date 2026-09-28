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
- ⚠️ `projects` 테이블·Storage `assets` 버킷 모두 **RLS on + `to anon, authenticated` 개방 정책** 필수
  (정책 없이 RLS 만 켜면 400). predicate 는 operation 별로 다르다 — `projects` 는 `true`
  (select `using (true)` · insert `with check (true)` · update `using (true) with check (true)`),
  Storage 는 `bucket_id = 'assets'`(select·delete `using` · insert `with check` · update 둘 다). 전체 SQL = `supabase/setup.sql`(idempotent) — 재구축뿐 아니라
  **스키마가 바뀌는 버전업 배포 전에도 재실행**. 이 정책은 S1-B 이후에도 **그대로**다(아래 §보안 한계).
- **에셋 삭제는 로컬(IndexedDB)에만 반영된다** — 교체·해제·초기화 어디에도 원격 삭제가 없어 버킷은 단조 증가한다.
  회수는 에셋 탭 "☁️ 협업 Storage 정리" 스윕이 유일한 경로(`collab/assetsGc.ts` + `assetRefs.diffRemoteOrphans`).
  **교체 즉시 원격 삭제는 일부러 안 넣었다** — 상대가 아직 pull 안 했거나 LWW 로 옛 프로젝트가 다시 올라오면
  아직 쓰는 이미지를 지워 상대 화면에서 그림이 사라진다.
- 스윕 판정의 두 가드(하나라도 빼면 데이터 손실):
  **① projects 전 행의 참조 합집합**(Storage 키가 평면 구조라 방 구분이 없다)
  **② 업로드 후 유예 기간**(`REMOTE_GRACE_OPTIONS` — 기본 7일, UI 에서 1일·전체로 변경 가능).
- ⚠️ **실제 노출 범위(중요 — "방 코드 아는 사람만"보다 넓다)**: 클라이언트 키(현재 publishable key,
  S1-B 이전엔 legacy anon key)는 설계상 번들에 구워져 공개된다.
  RLS 정책에 방·사용자 조건이 없고(`true` / `bucket_id = 'assets'`) Storage 오브젝트 키가 평면 구조라
  **방 단위 구분이 없다** →
  배포 사이트를 열 수 있는 사람은 누구나 `assets` 버킷 전체를 목록 조회·다운로드·업로드·덮어쓰기 할 수 있다.
  실질 방어선은 "배포 URL 을 모른다" 하나. 2인 사설 도구라 감수한 선택(2026-08-05 사용자 확인) —
  서버 쪽 축소는 S1-D1/D2 의 몫이다(아래 §보안 한계).
  **`service_role` 키는 RLS 를 통째로 우회하니 절대 repo·번들에 넣지 말 것.**
- ⚠️ Supabase 대시보드가 "Clients can list all files in this bucket / Remove policy" 를 띄워도
  **그 버튼을 누르면 안 된다** — `.download()` 가 인증 엔드포인트를 타 SELECT 정책을 필요로 해서
  지우는 즉시 에셋 동기화가 400 으로 깨진다(원격 정리 스윕의 목록 조회도 같이 죽는다).
- `@supabase/supabase-js` 는 **지연 로딩**(`getSupabaseClient()` 안의 동적 import) — 초기 번들에서 ~210KB 분리.
  `supabaseClient.ts` 에 최상위 `import` 를 되살리지 말 것.

### 인증 경계 (Security S1-B — client-side gate)

- 계정은 Supabase Dashboard **invite 로만** 만든다(가입 UI 없음). 로그인은 email/password,
  `signOut({ scope: 'local' })` 라 다른 기기 세션은 유지된다. 세션 storage key 는 `na-auth` 이고
  **앱은 token·session 값을 읽거나 저장·로그하지 않는다**(store 에는 표시용 email 뿐).
- **client 는 둘로 나뉜다**:
  `getSupabaseClient()` = env 만 보는 **base/Auth client**(방 코드와 무관) ·
  `getCollabClient()` = **collab runtime 이 active 일 때만** client 를 돌려준다(await 전·후 이중 검사).
  collab remote 경로(project pull/push/구독 · Presence · 에셋 upload/download · Storage 정리)는
  **전부 `getCollabClient()` 로만** 얻는다.
- **세 값의 역할을 섞지 말 것**:

  ```
  persisted na_collab_enabled        = user intent          (localStorage, 로그아웃해도 보존)
  store.collabEnabled                = UI mirror            (runtime 결과를 따라간다, 부팅 시 false)
  collab module runtime active       = remote-access truth  (isCollabActive())
  ```

  runtime 을 켜는 경로는 **`enableCollabIfAuthenticated()` 하나**다 — Auth API 로 세션을 확인한 뒤에만
  `activateCollab()` + `startCollab()`. `startCollab` 은 스스로 켜지 않고, 모든 await 뒤에 active 를 다시 본다
  (continuation barrier). hydrate 는 intent 만 복원하고 **자동 접속하지 않는다**.
- **signed-out · local-only 에서는 신규 collaboration data · presence · storage 작업이 구조적으로 차단된다**
  (runtime 이 닫혀 있어 `getCollabClient()` 가 `null`).
  ⚠️ 단 **그 상태로 전이하면서 기존 Realtime handle 을 정리하는 teardown**(`stopCollab` → `removeAllChannels`)은
  발생할 수 있다 — local-only 진입은 직접, SIGNED_OUT 은 콜백 밖 `setTimeout 0` 에서 부른다.
  "remote 호출 전체 0"으로 쓰지 말 것. local-only **부팅** fast-path 는 Supabase SDK import 자체를 하지 않는다.
- **localStorage Project · IndexedDB 에셋은 Auth 와 독립**이다 — 로그인 실패·로그아웃·local-only 전환 어디에서도
  `clearProject`/에셋 삭제를 하지 않는다. 오프라인 제작 툴이라 hydrate 는 인증과 무관하게 항상 돈다.
- `onAuthStateChange` 콜백 안에서는 **동기 local 작업만** 한다 — Supabase API(teardown·재접속)는
  `setTimeout 0` 뒤로 미룬다. store 쪽 lifecycle owner 는 `store/authSlice.ts` 하나다.

### local-only → 로그인 재접속 확인 (S1-B F1)

`startCollab` 은 **pull-first** 다 — 방에 원격 행이 있으면 로컬 Project 를 **통째 교체**한다(S1-B 이전부터의 의미).
local-only 에서 편집한 뒤 로그인하면 intent 로 자동 재접속하면서 그 편집이 사라졌다(hosted 재현) →
**그 경계에서만** 사용자 확인을 받는다. `startCollab`·명시적 방 만들기/참가의 의미는 바꾸지 않았다.

- **marker = canonical truth**: `na_local_only` 가 소멸하는 모든 곳(callback 성공 · signIn 성공 ·
  `completePasswordSetup` · `leaveLocalOnly`)은 `consumeLocalOnlyPreference()` 하나를 거치고,
  local-only 였다면 **app 소유 marker `na_reconnect_confirm`** 을 먼저 남긴다(localStorage → **refresh-safe**).
  ⚠️ 이 helper 밖에서 `na_local_only` 를 직접 지우지 말 것 — 그 경로의 로그인은 확인 없이 재접속한다.
- `maybeAutoReconnect` 판정 순서:
  `authed` 아님 → return · 이미 active → return ·
  **`na_local_only` 가 아직 남아 있음 → return**(SDK 의 SIGNED_IN timer 가 signIn continuation 보다 먼저 돈
  전이 틈 — **재접속 barrier 일 뿐 모달 truth 가 아니다**) ·
  intent/room 없음 → stale marker 제거 후 return ·
  **marker 있음 → `collabReconnectPending = true`(UI mirror)** 후 return · 그 외 → 기존 자동 재접속.
  ⚠️ pending 을 marker 없이 올리지 말 것(mirror 가 truth 보다 먼저 서면 안 된다).
- **"방에 다시 연결"** = marker 제거 → 기존 `enableCollabIfAuthenticated` · **pull-first 그대로**.
- **"내 로컬 유지"** = marker 제거 + **persisted intent off**(`na_collab_enabled='0'`) ·
  room·name·local Project·IndexedDB 에셋 보존 · **remote project mutation 없음**.
  `setCollabConfig()`/`stopCollab()` 을 부르지 않아 Realtime teardown 을 포함한 collab 호출이 0 이다.
  ⚠️ local-only **진입 시** intent 를 자동으로 끄는 것과 다르다 — 사용자의 명시적 선택만 intent 에 기록한다.
- 확인 모달은 **차단형**(닫기·ESC·바깥 클릭 없음, 두 버튼 사이 focus trap)이라 좌패널 방 만들기/참가로 우회되지 않는다.
- local-only 를 거치지 않은 로그인·새로고침(marker 없음)은 **기존 자동 재접속 그대로**다.
- 알려진 잔여: F1 배포 **이전에** 이미 local-only 를 떠나 StartGate 에 있던 사용자는 marker 가 없다.

### ⚠️ 보안 한계 — S1-B 는 end-to-end authorization 이 아니다

- S1-B(+F1)는 **client-side authentication/runtime gate** 다. 서버는 아직 인증을 강제하지 않는다 —
  `setup.sql` 정책이 `to anon, authenticated` 에 위 predicate(`true` / `bucket_id = 'assets'`,
  `using`·`with check` operation 별 적용)로 열려 있어, **번들에 공개된 Supabase URL + publishable key 만으로
  REST/Storage 에 직접 접근할 수 있다**. S1-B/F1 을 "권한 강화"·"authorization 완료"로 표현하지 말 것.
- **server-side hardening(RLS·Storage 정책 · room 권한)은 별도 S1-D1/D2** 다(미착수).
- publishable key(`VITE_SUPABASE_PUBLISHABLE_KEY`)는 **secret boundary 가 아니다** — 번들에 공개되는 값이다.
- 위 §실제 노출 범위는 S1-B 이후에도 **그대로 유효**하다(로그인은 앱 UI 의 경로만 막는다).

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
