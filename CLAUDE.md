# CLAUDE.md

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
- 에코(무한루프) 방지가 `src/collab/sync.ts`의 핵심 — 버전 카운터로 자기 자신이 보낸 변경을
  걸러낸다. 이 로직 건드릴 땐 반드시 실제 네트워크 오류 상황(가짜 URL 등)으로 상태 배지가
  "연결 실패"로 정확히 뜨는지 재확인할 것(과거 여기서 버그 있었음 — Supabase 클라이언트가 네트워크
  오류를 조용히 `{error}` 로 반환하고 throw 하지 않아서 상태가 잘못 "연결됨"으로 뜬 적 있음).

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB. **앱 작업물은 브라우저별**(기기 이동은 앱 📤내보내기/📥가져오기 `.npproj.zip`). 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`(zustand), Ren'Py 출력=`src/renpy/generate.ts`, AI 설정 단일소스=`src/config/aiConfig.ts`(OpenAI `chat` 블록만 존재).
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자가 명시적으로 허락하기 전까지 절대 금지.** 코드 수정·검증은 자유.
- `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`로 검증(가능하면 OneDrive 밖 빌드로 한 번 더).
- 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`). 기존 코드 스타일(주석 밀도·네이밍) 맞추기.
