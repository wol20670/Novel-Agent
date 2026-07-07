# CLAUDE.md

> 🔵 **[`HANDOFF.md`](./HANDOFF.md)** 를 먼저 읽으세요 — 2026-07-07 오후~저녁 세션 반영 사항(Supertone TTS 통합·voice() 버그·기록 삭제/중복 버그·에셋 해제 버튼·퀵메뉴 개편) + Ren'Py 유지 결정 배경. 다음 세션에서 최신 상태 확인 후 이 줄과 HANDOFF.md 삭제할 것.

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind).
100% 클라이언트(백엔드 없음), BYO 키. 한국어 코드베이스.

이미지(배경·캐릭터 입화·CG)와 음악(BGM)은 **앱이 생성하지 않는다** — ChatGPT/Suno 등 외부 도구에서
만든 파일을 앱에 **업로드**하는 워크플로우다(2026-07 전면 개편). 앱에 남은 AI 기능은 전부 텍스트
전용(OpenAI `gpt-4o-mini`): 대본 자동 번역(영/일), AI GUI 테마 생성.

## 명령
- `npm run dev` — 개발 서버(http://localhost:5173).
- `npm run build` — tsc + vite build
- `npm run typecheck` — `tsc --noEmit`. **코드 변경 후 항상 실행.**
- `npm run test` — vitest(파서·번역·아이템 단위/통합 테스트).

## 환경 함정 (중요)
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`. bash `pkill`/`taskkill`는 자주 실패. 좀비 `vite preview`가 `dist`/포트를 잡으면 옛 빌드를 계속 서빙한다.
- **OneDrive dist 빌드 함정**: 프로젝트가 OneDrive 동기 폴더라, `vite build`가 `dist/`에 쓸 때 간헐적으로 **에러 없이 exit 127**로 죽는다. **코드 문제 아님**(환경). 검증만 목적이면 `npx vite build --outDir <OneDrive 밖 경로> --emptyOutDir`. tsc는 무관하게 통과. 근본해결은 프로젝트를 OneDrive 밖에 두기.

## 에셋 워크플로우 (배경·캐릭터·CG·BGM)
- 사용자가 ChatGPT(이미지) / Suno(음악) 등 외부 사이트에서 직접 생성 → 앱의 **에셋 탭**에서 업로드.
- 업로드 안 한 에셋은 오프라인 Canvas 플레이스홀더(`src/generators/image/canvas*.ts`)로 자동 채워져
  ZIP·미리보기가 항상 동작한다. 단 **BGM 은 플레이스홀더가 없다** — 업로드 안 한 씬은 `play music`
  자체가 방출되지 않는다(`src/renpy/generate.ts` 의 `scene.bgmAssetId` 게이팅).
- BGM 파일명은 항상 `.mp3` 로 고정(Suno 기본 출력 포맷 기준, `src/renpy/generate.ts`). wav 등 다른
  포맷을 올리면 확장자만 mp3 로 저장되니 주의(재생 자체는 대체로 문제없음).
- 성우(TTS) 파이프라인은 **골격만 유지**(`Project.voiceLocales`, `voices.rpy` 출력, 업로드 mp3 재생
  경로) — 실제 생성/업로드 UI는 미구현. Supertone(공식 API 확인됨: `docs.supertoneapi.com`, 호스트
  `https://supertoneapi.com/v1`, 헤더 `x-sup-api-key`, `POST /text-to-speech/{VOICE_ID}`) 연동은 후속 작업.

## 협업(실시간 공유, 2인 전제 — src/collab/)
- **"100% 클라이언트(백엔드 없음)" 원칙의 유일한 예외.** Supabase(무료 티어)를 저장 시점(자동저장
  600ms 디바운스)마다 동기화하는 가벼운 relay 로 쓴다 — 키 입력마다 반영되는 구글독스식 동시편집이
  아니라, last-write-wins(나중 저장이 이김) + 프레즌스("친구가 지금 이 장면 보는 중")로 충돌을 피함.
- **URL·anon key는 빌드에 내장**(`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `.env.example` 참고
  — anon key는 원래 공개돼도 되는 값, 진짜 보안은 Supabase RLS). 사용자는 **6자리 방 코드**(새로
  만들면 자동 생성, 참가는 그 코드 입력)와 이름만 다룬다. ⚠️ 방 코드를 아는 사람은 누구나 읽고
  쓸 수 있음(보안 경계 아님, 2인 신뢰 전제) — 이 사실을 UI 문구에서 절대 빼지 말 것.
- 로컬 개발 시 `.env.example`을 `.env.local`로 복사해 값 채우기(gitignore 됨). 배포(Vercel 등)는
  프로젝트 환경변수 설정에 같은 두 값을 넣으면 됨(`vercel.json`은 SPA rewrite만 담당, 이 앱은
  라우팅이 없어 필수는 아니지만 방어적으로 있음).
- Supabase 쪽 필요 설정(테이블 스키마·Storage 버킷·RLS off·Realtime publication)은 대시보드에서
  수동으로 해야 함 — 자동화 불가. 정확한 SQL·순서는 세션 히스토리(또는 사용자에게 문의) 참고.
  **`projects` 테이블은 RLS off로 충분하지만 Storage `assets` 버킷은 RLS를 끌 수 없다**
  (storage.objects는 항상 RLS 적용) — anon 역할에 select/insert/update 정책을 반드시 추가해야
  에셋 업로드·다운로드가 됨(안 하면 콘솔에 `new row violates row-level security policy` 400).
- 프레즌스(`src/collab/presence.ts`)의 clientId는 localStorage 에 영속화돼 있다 — 새로고침마다
  새 id를 뽑으면 이전 세션이 "나"로 제외되지 못해 유령 접속자가 누적되는 버그가 있었음(수정됨).
- 협업을 끄고 같은 방 코드로 재입장하면 이전 프로젝트가 그대로 복원된다 — **의도된 동작**(방 데이터가
  방 코드를 PK로 서버에 저장돼 있음, 끄기는 채널 해제일 뿐 방 삭제가 아님). 방을 비우려면 대시보드에서
  해당 room 행/에셋을 직접 지워야 함(앱에 초기화 UI 없음).
- 에코(무한루프) 방지가 `src/collab/sync.ts`의 핵심 — 버전 카운터로 자기 자신이 보낸 변경을
  걸러낸다. 이 로직 건드릴 땐 반드시 실제 네트워크 오류 상황(가짜 URL 등)으로 상태 배지가
  "연결 실패"로 정확히 뜨는지 재확인할 것(과거 여기서 버그 있었음 — Supabase 클라이언트가 네트워크
  오류를 조용히 `{error}` 로 반환하고 throw 하지 않아서 상태가 잘못 "연결됨"으로 뜬 적 있음).

## 폰트 프리셋(본문/이름 폰트 선택 — src/fonts/)
- 폰트는 앱에 번들하지 않고 **사용자 소유 GCS 공개 버킷**에서 온디맨드로 받아 IndexedDB에 캐싱한다
  (기본 폰트 나눔고딕만 `public/fonts`에 로컬 번들 — 네트워크 없어도 항상 동작). 목록은 버킷의
  `manifest.json`(데이터)이라 **폰트 추가는 앱 재배포 없이** `scripts/upload-fonts.mjs` 재실행만으로 끝.
- `src/fonts/fontCatalog.ts`(매니페스트 fetch + id→경로 변환, 항상 동기 — `resolveTheme`/
  `withGuiOverrides`가 이미 전역에서 동기로 쓰이고 있어 여기서 async로 바꾸면 파급이 큼) /
  `src/fonts/fontCache.ts`(바이너리 fetch+IndexedDB 캐시+FontFace 등록, 비동기).
- `Project.guiOverrides.bodyFontId`/`nameFontId`(id, 미지정=기본)가 `withGuiOverrides`
  (`src/renpy/gui/theme.ts`)를 거쳐 `gui.text_font`/`gui.name_text_font`로, `buildZip.ts`의
  `selectedFontFiles`를 거쳐 실제 `.ttf`(+OFL 라이선스)로 각각 반영된다 — **두 경로가 항상 일치해야
  함**(하나만 바꾸면 gui.rpy가 zip에 없는 파일을 참조하게 됨).
- `VITE_FONTS_BASE_URL`(버킷 base URL, `.env.example`) 미설정/오프라인이면 기본 폰트만 조용히 폴백
  (에러 없음). 커스텀 폰트 다운로드 실패 시에도 기본 폰트로 자동 대체 + placeholders 카운트 반영.
- 버킷 준비(1회, gsutil): 공개(uniform + `allUsers` Object Viewer) + CORS(`scripts/gcs-fonts-cors.json`,
  origin `*` — 공개 정적 폰트라 문제없음). 업로드는 `node scripts/upload-fonts.mjs gs://<버킷>`.

## Ren'Py 생성 주의사항 (실제 SDK로만 잡히는 버그들 — lint로도 못 잡는 것 있음)
- **화면 언어(screen language)의 `add x:` 블록엔 애니메이션 ATL(`easein`/`linear` 등 워퍼)을 못 쓴다** —
  정적 속성(`alpha 0.0`, `pos (...)` 등 즉시값)만 허용. 애니메이션을 쓰려면 `add x at transform:`
  으로 감싸거나 별도 `transform NAME:` 을 정의해 `at NAME`으로 참조해야 함. 안 지키면 Ren'Py가
  `'easein' is not a keyword argument or valid child of the add statement`로 컴파일 자체가 안 됨
  (`src/renpy/gui/screensRpy.ts`, 2026-07-07 수정).
- **대사·이름·UI 텍스트의 리터럴 `%`는 반드시 `%%`로 이스케이프**(`esc`/`escRpyText`/`escLit`,
  `src/renpy/generate.ts`) — 안 하면 "할인 20%" 같은 문장이 있을 때 Ren'Py가 그 줄을 표시하는
  **순간(런타임)** `Unknown string format code`로 죽는다. **`npm run typecheck`·lint 둘 다 이 버그를
  못 잡는다** — 실제 SDK로 그 줄까지 진행시켜봐야 드러남.
- 이런 종류의 버그를 검증할 땐 코드만 보고 판단하지 말 것: `scripts/gen-lint.ts` 패턴으로
  `generateRenpyFiles()` 출력을 임시 폴더에 쓰고(`npx esbuild <스크립트>.ts --bundle --platform=node
  --format=esm --outfile=<번들>.mjs && node <번들>.mjs` — `node`로 `.ts`를 바로 실행하면 확장자 없는
  상대 import를 ESM 리졸버가 못 찾아 실패하니 반드시 esbuild로 먼저 번들링), 실제 Ren'Py SDK로
  `renpy.exe <폴더> lint` 실행해 확인. `%` 류(런타임 전용) 버그는 lint로도 안 잡히므로 필요하면
  Ren'Py 소스(`<SDK>/renpy/*.py`)를 직접 grep해서 실제 동작을 확인.

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB. **앱 작업물은 브라우저별**(기기 이동은 앱 📤내보내기/📥가져오기 `.npproj.zip`). 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`(zustand), Ren'Py 출력=`src/renpy/generate.ts`, AI 설정 단일소스=`src/config/aiConfig.ts`(OpenAI `chat` 블록만 존재).
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자가 명시적으로 허락하기 전까지 절대 금지.** 코드 수정·검증은 자유.
- `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`로 검증(가능하면 OneDrive 밖 빌드로 한 번 더).
- 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`). 기존 코드 스타일(주석 밀도·네이밍) 맞추기.
