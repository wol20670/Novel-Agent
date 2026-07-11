# CLAUDE.md

> 🔵 진행 중 인수인계가 있으면 [`HANDOFF.md`](./HANDOFF.md) 먼저 확인(현재: 2026-07-11 코드 정리 세션). 반영 끝나면 이 줄·HANDOFF 삭제.

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind). BYO 키, 한국어 코드베이스.
이미지·BGM은 **앱이 생성하지 않음** — 외부 도구(ChatGPT/Suno)에서 만들어 에셋 탭에 업로드. 앱의 AI는 텍스트·보이스 전용(OpenAI `gpt-4o-mini`): 대본 번역(영/일), GUI 테마, Supertone TTS.

## 명령
- `npm run dev` — 개발 서버(http://localhost:5173)
- `npm run build` — tsc + vite build
- `npm run typecheck` — `tsc --noEmit`. **코드 변경 후 항상 실행.**
- `npm run test` — vitest

## 환경 함정 (중요)
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`. bash `pkill`/`taskkill`는 자주 실패(좀비 `vite preview`가 옛 빌드를 계속 서빙).
- **OneDrive dist 빌드 함정**: OneDrive 동기 폴더라 `vite build`가 `dist/`에 쓸 때 간헐적으로 에러 없이 exit 127로 죽음 — 코드 문제 아님. 검증만이면 `npx vite build --outDir <OneDrive 밖> --emptyOutDir`(tsc는 무관하게 통과).

## Ren'Py 생성 주의 (lint로도 못 잡는 런타임 버그)
- **화면 언어의 `add x:` 블록엔 애니메이션 ATL(`easein` 등) 못 씀** — 정적 속성만 허용. 애니메이션은 `add x at transform:`으로 감쌀 것. 어기면 컴파일 실패(`src/renpy/gui/screensRpy.ts`).
- **대사·이름·UI의 리터럴 `%`는 반드시 `%%`로 이스케이프**(`esc`/`escRpyText`/`escLit`, `src/renpy/generate.ts`) — 안 하면 "할인 20%" 같은 줄에서 **런타임에** `Unknown string format code`로 죽음. typecheck·lint 둘 다 못 잡음.
- 검증: `scripts/gen-lint.ts` 패턴으로 `generateRenpyFiles()` 출력을 임시 폴더에 씀(esbuild 번들 후 `node` 실행) → 실제 `renpy.exe <폴더> lint`.

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB. 작업물은 브라우저별(기기 이동은 앱 📤/📥 `.npproj.zip`), 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`, Ren'Py 출력=`src/renpy/generate.ts`, AI 설정=`src/config/aiConfig.ts`.
- 미업로드 에셋은 Canvas 플레이스홀더로 자동 채움(`src/generators/image/canvas*.ts`) — 단 **BGM은 플레이스홀더 없음**(미업로드 씬은 `play music` 미방출). BGM 파일명은 항상 `.mp3` 고정.
- 협업(src/collab/): Supabase를 저장 시점(600ms 디바운스)마다 동기화하는 last-write-wins relay + 프레즌스. 방 코드 아는 사람은 누구나 읽기·쓰기(2인 신뢰 전제 — UI 문구에서 빼지 말 것). ⚠️ Storage `assets` 버킷은 RLS를 못 끄므로 anon에 select/insert/update 정책 필수(안 하면 400 RLS 에러).
- 폰트(src/fonts/): 사용자 GCS 공개 버킷에서 온디맨드 fetch→IndexedDB 캐시(기본 나눔고딕만 로컬 번들). `guiOverrides.bodyFontId`/`nameFontId`가 gui.rpy(`theme.ts`)와 zip 폰트파일(`buildZip.ts`) **양쪽에 일치해야 함**(하나만 바꾸면 없는 파일 참조).
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자 명시 허락 전까지 절대 금지.** 코드 수정·검증은 자유.
- `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`로 검증(가능하면 OneDrive 밖 빌드로 한 번 더).
- 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`). 기존 코드 스타일 맞추기.
