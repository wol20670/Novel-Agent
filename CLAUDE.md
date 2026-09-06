# CLAUDE.md

> 🔵 **세션 시작 시 [`HANDOFF.md`](./HANDOFF.md) 먼저 확인** — 짧은 살아있는 상태 문서. 정리는 `/handoff-maintain` 으로 한다.
> 🟣 **Phase 작업 루프와 Phase 결과 index 는 [`PHASES.md`](./PHASES.md)**, 상세 이력은 [`docs/history/`](./docs/history/v1-ai-phases.md).
> 🟢 **확정된 계약의 정본은 [`docs/contracts/`](./docs/contracts/project-compat.md)** — 아래 §문서 인덱스 표를 보고 필요한 것만 열 것.

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind). BYO 키, 한국어 코드베이스.
이미지·BGM은 **앱이 생성하지 않음** — 외부 도구에서 만들어 에셋 탭에 업로드. 앱의 AI는 텍스트·보이스 전용 — OpenAI `gpt-4o-mini`(번역 고품질 모드만 `gpt-4o`): 대본 번역(영/일)·GUI 테마·표정 자동 배정·의상 전환 추천 / Typecast: TTS.
`.claude/settings.json`(SessionStart 훅·권한)이 repo에 커밋돼 있어 새 기기는 clone만 하면 인수인계 자동.

## v1 동결 상태

- **Novel-Agent v1 production baseline 은 Phase 19 에서 확정됐고 계획된 핵심 개발은 종료됐다**(Outcome A · docs-only).
- **v1 frozen production implementation baseline = `931a2cc`** · **Phase 19 final v1 repository checkpoint = `5902dc8`**
  (두 축을 섞지 말 것 — [project-compat.md](./docs/contracts/project-compat.md) §baseline SHA).
- ⚠️ **정해진 다음 필수 Phase 는 없다** — 새 blocker 가 없는 한 동결된 Outfit/Expression semantic baseline 을
  재튜닝하거나 Phase 20+ 를 자동 생성하지 말 것([ai-workflows.md](./docs/contracts/ai-workflows.md) §재튜닝 금지 목록).

## 명령

- `npm run dev`(5173) · `npm run build` · `npm run typecheck`(**코드 변경 후 항상**) · `npm run test`(vitest)
- **`npm run check` — 평상시 게이트(≈20초).** `typecheck`(production) → `typecheck:tests` → `test`(vitest 전체 = golden·`.npproj.zip` 왕복 포함). ⚠️ root `tsconfig.json` 은 `include: ["src"]` 라 **tests 는 `tsconfig.tests.json` 으로만 검사된다** — `typecheck` 만 돌려놓고 "타입 통과"라고 하지 말 것.
- **`npm run check:full` — 전체 게이트(≈1분).** `check` → **OneDrive 밖 임시 디렉터리**에 Vite build → self-hosted preview → 기존 e2e. **서버를 미리 띄워둘 필요가 없다.**
- `npm run typecheck:tests` · `npm run test:e2e`(이미 서버가 떠 있을 때 · `BASE_URL` 로 대상 지정)
- `npm run gen:lint` — 샘플 대본으로 `.lint-tmp/`에 실제 `.rpy` 생성. **`check`·`check:full` 어디에도 안 들어간다**(의도적).
- `npm run dump:rpy -- <OneDrive 밖 폴더>` — 23구성으로 `.rpy` 덤프(회귀 0 증명용).
- `npm run golden:update` — Ren'Py golden 갱신. ⚠️ **사용자 명시 승인 없이 실행 금지.**

> 각 명령의 **계약 상세**(golden 회귀 계약 · `renpyConfigs.ts` coverage · e2e 러너 · lint 절차 · 출력 회귀 0 증명법)는
> **[docs/contracts/renpy-export.md](./docs/contracts/renpy-export.md)** 가 정본이다.

## 환경 함정 (중요)
- **Windows 좀비 프로세스 종료는 PID 단위로**: 잔존 `vite preview`(옛 빌드를 계속 서빙)는 runner 가 출력한 PID 를 확인해 PowerShell `Stop-Process -Id <PID> -Force` 로 **그 프로세스만** 죽인다. bash `pkill`/`taskkill`은 자주 실패한다. ⚠️ **`Get-Process node | Stop-Process -Force` 는 쓰지 말 것** — 무관한 다른 Node 작업까지 함께 종료된다.
- **OneDrive dist 빌드 함정**: `vite build`가 `dist/`에 쓸 때 간헐적으로 에러 없이 exit 127로 죽음 — 코드 문제 아님. 검증만이면 `npx vite build --outDir <OneDrive 밖> --emptyOutDir`(tsc는 무관하게 통과).
  - ⚠️ **검증 산출물도 같은 함정 — 이쪽이 더 위험하다**: `.lint-tmp` 처럼 리포 안에 수십 개 파일을 쓰는 생성 스크립트가 조용히 죽으면(출력 한 줄도 없이 exit 127) **옛 산출물이 그대로 남아** lint·스크린샷이 "고치기 전 코드"를 통과시킨다(실제로 겪음 — 완료 로그가 안 찍혔으면 실패다). 생성 폴더는 **OneDrive 밖**(스크래치패드)으로 주고, 검증 전에 gui.rpy 등에서 이번 변경이 실제로 들어갔는지 한 줄 확인할 것.

## 문서 인덱스 — 이걸 건드리면 이걸 먼저 읽어라 (YOU MUST)

| 건드리는 것 | 먼저 읽을 정본 | 자동 로드되는 rule |
|---|---|---|
| `src/renpy/**` · `src/zip/**` · `src/types/menu.ts` · `src/generators/{image,theme}/**` · `scripts/{renpyConfigs,renpyGolden,dump-rpy,update-golden,gen-lint}.ts` · `scripts/e2e*.mjs` | [renpy-export.md](./docs/contracts/renpy-export.md) | `.claude/rules/renpy.md` |
| `src/project/**` · `src/store/**` · `src/types/project.ts` · `src/collab/**` · `src/storage/**` · `src/assetMime.ts` · `src/assetRefs.ts` | [project-compat.md](./docs/contracts/project-compat.md) | `.claude/rules/project-compat.md` |
| `src/components/**` · `src/store/scriptSlice.ts` · `src/store/voiceSlice.ts` · `src/generators/voice/**` | [scene-editor.md](./docs/contracts/scene-editor.md)(Voice anchor 포함) | `.claude/rules/scene-editor.md` |
| `src/generators/{emotion,outfit,translate,shared}/**` · `src/store/aiBatchSlice.ts` · `src/config/aiConfig.ts` | [ai-workflows.md](./docs/contracts/ai-workflows.md) | `.claude/rules/ai.md` |

⚠️ **`.claude/rules/*` 는 전부 path-scoped 라 그 파일을 실제로 열기 전에는 문맥에 없다.**
계획·설계 단계에서는 위 표를 보고 **contract 를 직접 열 것.** 특히 AI 축은 동결 계약이라
[ai-workflows.md](./docs/contracts/ai-workflows.md) §재튜닝 금지 목록을 먼저 확인한다.

**이력을 찾을 때**: v1 Phase 1~19 → [v1-ai-phases.md](./docs/history/v1-ai-phases.md) ·
번역/의상UX/줄삭제/CG/Voice → [post-v1.md](./docs/history/post-v1.md) ·
안정화 R0~R4 → [stabilization-r0-r4.md](./docs/history/stabilization-r0-r4.md).
⚠️ **history 는 현재 contract 를 override 하지 못한다**(그때의 사실이다).

## 코드 주석의 "CLAUDE.md …" 는 여기로 (compatibility pointer)

`src/**`·`tests/**`·`scripts/**` 의 **58곳(22파일)** + `.github/workflows/check.yml` **1곳** = **총 59곳**이
아래 이름으로 이 문서를 가리킨다. 그 내용은 contract 문서로 옮겼고 **주석은 수정하지 않았다** — 대응표는 이것 하나다.
(그중 `screensRpy.ts` 의 4건은 TS 주석이 아니라 **생성 `.rpy` 안으로 나가는 `##` 문자열**이다.)

| 코드 주석의 표현 | 현재 정본 |
|---|---|
| `CLAUDE.md 최상위 함정`(이스케이프 · 없는 이미지 참조 · `properties` 크래시) | [renpy-export.md](./docs/contracts/renpy-export.md) §lint 로도 못 잡는 런타임 크래시 |
| `CLAUDE.md 규칙: add 블록엔 애니메이션 ATL 금지` | 같은 절 |
| `CLAUDE.md 의 "양쪽 일치 필수" 함정` · `escSlotThumbMetrics` · 그라데이션 | [renpy-export.md](./docs/contracts/renpy-export.md) §이미지 GUI · 메뉴 |
| `CLAUDE.md 의 "생성기·미리보기 두 구현이 어긋나면"` · `resolveEmotion 규칙` | [renpy-export.md](./docs/contracts/renpy-export.md) §스프라이트 · [ai-workflows.md](./docs/contracts/ai-workflows.md) §판정 단일 소스 |
| `CLAUDE.md "출력 회귀 0 증명법"` · `"덤프가 plain 과 같아지는" 함정` | [renpy-export.md](./docs/contracts/renpy-export.md) §검증 절차 · §golden 회귀 계약 |
| `CLAUDE.md "플레이어 지정 주인공 이름은 다음 대사부터"` | [renpy-export.md](./docs/contracts/renpy-export.md) §플레이어 지정 주인공 이름 |
| `CLAUDE.md 환경 함정` · `CLAUDE.md OneDrive 함정` | 이 문서 §환경 함정 (**그대로 유효**) |
| `CLAUDE.md` (그 외 일반 참조) | 위 §문서 인덱스 표에서 해당 축 |

## 핵심 파일 위치

- 상태 = `src/store/`(도메인 슬라이스) · Ren'Py 출력 = `src/renpy/generate.ts` · AI 설정 = `src/config/aiConfig.ts`
- 타입 = `src/types/project.ts`(Line·Scene·Project + 파생 헬퍼) / `src/types/menu.ts`(메뉴 규격·파일 경로 헬퍼)
- 판정 단일 소스: `resolveEmotion`(표정) · `outfitFlags`(의상) · `spriteHiddenFlags`(숨김) ·
  `cgActiveFlags`/`getFirstEffectiveCgIndex`(CG · **서로 다른 semantic**) · `sameLooseText`(번역 동치) ·
  `voiceLineAnchorMatches`(음성 anchor) · `spriteSlots`/`selectSprite`(스프라이트 선택)
- 저장: 프로젝트 메타 = localStorage, 바이너리 에셋 = IndexedDB(브라우저별 — 기기 이동은 앱 📤/📥 `.npproj.zip`)

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자 명시 허락 전까지 절대 금지.** 코드 수정·검증은 자유. `main`에서 작업하면 새 브랜치부터.
- 변경 후 **`npm run check`**(= typecheck + typecheck:tests + test). UI·store 를 건드렸으면 **`npm run check:full`** 까지. 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`).
- **병합·브랜치 정리는 자동**(사용자 명시 요청, 2026-07-11): 커밋·푸시가 이미 승인된 브랜치는 typecheck(+가능하면 test) 통과 상태면 다시 묻지 않고 `main` fast-forward 병합 → push → 로컬·원격 브랜치 삭제. **ff 불가(충돌)·검증 실패면** 자동 진행하지 말고 확인. 끝나면 요약 보고.
- **live API 키를 리포 안 평문 파일로 두지 말 것**(`key.txt` 류) — 실측 audit 이 필요하면 **환경변수로만** 주입하고(`OPENAI_API_KEY`), 값은 로그·리포트·artifact 어디에도 남기지 않는다(harness 는 `Authorization` 헤더를 기록하지 않는다). 부득이 파일을 쓴다면 리포 **밖**에 두고 실행 직후 삭제.
- **HANDOFF.md 인수인계**(삭제 금지·짧게 유지): 정리는 **`/handoff-maintain` 을 명시적으로 호출**해서 한다 — SessionStart 는 읽기만 하고 파일을 고치지 않는다. 작업 끝엔 완료분 1줄을 `✅`에, 남은·새 일을 `🎯`에 갱신(서술 금지 — 이력은 git log).
- Phase 작업 루프(Plan → GPT 검토 → IMPLEMENTATION GO → 구현 → actual diff review → COMMIT·PUSH GO)는
  [`PHASES.md`](./PHASES.md) §작업 루프와 `/phase-workflow` 가 정본이다. **승인 게이트를 스스로 넘지 말 것.**

## 사용 가능한 skill · agent

| 이름 | 용도 |
|---|---|
| `/phase-workflow` | Phase lifecycle 과 승인 게이트 |
| `/review-artifact` | GPT actual-diff review artifact 생성(repo 밖 scratch) |
| `/regression-gate` | 변경 blast radius 에 맞는 검증만 실행 |
| `/handoff-maintain` | 세션 시작/끝 HANDOFF 정리(**handoff mutation 의 유일한 소유자**) |
| `contract-auditor`(agent) | Plan 전 기존 contract·blast radius 조사(read-only) |
| `preflight-reviewer`(agent) | 구현 뒤 actual diff self-review(read-only · GPT 승인 대체 아님) |
