# CLAUDE.md

> 🔵 **세션 시작 시 [`HANDOFF.md`](./HANDOFF.md) 먼저 확인** — 짧은 살아있는 상태 문서(🎯 다음 할 일 + ✅ 방금 반영됨). 관리 규칙은 아래 워크플로우.

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind). BYO 키, 한국어 코드베이스.
이미지·BGM은 **앱이 생성하지 않음** — 외부 도구에서 만들어 에셋 탭에 업로드. 앱의 AI는 텍스트·보이스 전용(OpenAI `gpt-4o-mini`): 대본 번역(영/일), GUI 테마, Supertone TTS.
`.claude/settings.json`(SessionStart 훅·권한)이 repo에 커밋돼 있어 새 기기는 clone만 하면 인수인계 자동.

## 명령
- `npm run dev`(5173) · `npm run build` · `npm run typecheck`(**코드 변경 후 항상**) · `npm run test`(vitest)

## 환경 함정 (중요)
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`. bash `pkill`/`taskkill`은 자주 실패(좀비 `vite preview`가 옛 빌드를 계속 서빙).
- **OneDrive dist 빌드 함정**: `vite build`가 `dist/`에 쓸 때 간헐적으로 에러 없이 exit 127로 죽음 — 코드 문제 아님. 검증만이면 `npx vite build --outDir <OneDrive 밖> --emptyOutDir`(tsc는 무관하게 통과).

## Ren'Py 생성 주의 (lint로도 못 잡는 런타임 버그)
- 화면 언어의 `add x:` 블록엔 애니메이션 ATL(`easein` 등) 금지 — 정적 속성만. 애니메이션은 `add x at transform:`으로 감쌀 것(`src/renpy/gui/screensRpy.ts`).
- **사용자 텍스트는 반드시 `esc`/`escRpyText`를 거칠 것**(`src/renpy/generate.ts`) — `%`·`[`·`{` 미이스케이프는 typecheck·lint 둘 다 못 잡는 **런타임** 크래시("할인 20%", "[속보]"). 새 .rpy 출력 경로를 추가할 땐 이스케이프부터 확인.
- 검증: `scripts/gen-lint.ts`로 출력 생성(esbuild 번들→`node` 실행, OneDrive 밖 cwd 추천) → 실제 `renpy.exe <폴더> lint`(이 PC SDK: `Downloads/renpy-8.5.3-sdk`).

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB — 브라우저별(기기 이동은 앱 📤/📥 `.npproj.zip`), 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`, Ren'Py 출력=`src/renpy/generate.ts`, AI 설정=`src/config/aiConfig.ts`.
- 미업로드 에셋은 Canvas 플레이스홀더로 자동 채움 — 단 **BGM은 플레이스홀더 없음**(미업로드 씬은 `play music` 미방출, 파일명 `.mp3` 고정).
- 협업(src/collab/): Supabase last-write-wins relay(저장마다 600ms 디바운스 push) + 프레즌스, 에코 판정은 세션별 client_id. 방 코드 아는 사람은 누구나 읽기·쓰기(2인 신뢰 전제 — UI 문구에서 빼지 말 것). ⚠️ `projects` 테이블·Storage `assets` 버킷 모두 **RLS on + anon 개방 정책** 필수(정책 없이 RLS만 켜면 400). 전체 SQL=`supabase/setup.sql`(idempotent) — 재구축뿐 아니라 **스키마 바뀌는 버전업 배포 전에도 재실행**(예: client_id 컬럼, 없으면 협업 저장 400).
- 폰트(src/fonts/): GCS 공개 버킷 온디맨드 fetch→IndexedDB 캐시(기본 나눔고딕만 로컬 번들). `guiOverrides.bodyFontId`/`nameFontId`는 gui.rpy(`theme.ts`)와 zip 폰트파일(`buildZip.ts`) **양쪽 일치 필수**(하나만 바꾸면 없는 파일 참조).
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자 명시 허락 전까지 절대 금지.** 코드 수정·검증은 자유. `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`(가능하면 OneDrive 밖 빌드로 한 번 더). 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`).
- **병합·브랜치 정리는 자동**(사용자 명시 요청, 2026-07-11): 커밋·푸시가 이미 승인된 브랜치는 typecheck(+가능하면 test) 통과 상태면 다시 묻지 않고 `main` fast-forward 병합 → push → 로컬·원격 브랜치 삭제. **ff 불가(충돌)·검증 실패면** 자동 진행하지 말고 확인. 끝나면 요약 보고.
- **HANDOFF.md 인수인계**(삭제 금지·짧게 유지): 세션 시작 시 `✅ 방금 반영됨`이 git log에 실제 있는지 확인 후 그 줄 삭제. 작업 끝엔 완료분 1줄을 `✅`에, 남은·새 일을 `🎯`에 갱신(서술 금지 — 이력은 git log).
