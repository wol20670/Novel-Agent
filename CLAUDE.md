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

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB. **앱 작업물은 브라우저별**(기기 이동은 앱 📤내보내기/📥가져오기 `.npproj.zip`). 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`(zustand), Ren'Py 출력=`src/renpy/generate.ts`, AI 설정 단일소스=`src/config/aiConfig.ts`(OpenAI `chat` 블록만 존재).
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자가 명시적으로 허락하기 전까지 절대 금지.** 코드 수정·검증은 자유.
- `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`로 검증(가능하면 OneDrive 밖 빌드로 한 번 더).
- 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`). 기존 코드 스타일(주석 밀도·네이밍) 맞추기.
