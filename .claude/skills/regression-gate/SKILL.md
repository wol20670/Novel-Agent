---
name: regression-gate
description: 변경된 경로의 blast radius 를 보고 필요한 검증만 골라 실행·보고한다. 모든 작업에 가장 비싼 게이트를 돌리지 않는다.
argument-hint: [changed-paths]
disable-model-invocation: true
---

# Regression gate (standing instructions)

대상 경로: **$ARGUMENTS** (없으면 `git status --porcelain=v1 --untracked-files=all` 로 직접 구한다)

## 1) blast radius 판정 → 요구 게이트

| 변경 경로 | 요구 게이트 |
|---|---|
| `docs/**` · `.claude/**` · root `*.md` · `.gitignore` | `git diff --check` · **scope gate(아래 2)** · `settings.json` JSON parse · markdown link/anchor 검사 — **npm 게이트 불필요** |
| `src/**`(비 UI) · `tests/**` | `npm run check` |
| `src/components/**` · `src/store/**` | `npm run check` **+ `npm run check:full`** |
| `src/renpy/**` · `src/zip/**` · `src/types/menu.ts` | `npm run check`(golden 포함) **+ `dump:rpy` 2벌 `diff -r`**. 화면 변경이면 `gen:lint` + 실제 `renpy.exe lint` + 실행 스크린샷 |
| `src/project/transfer.ts` · `src/storage/**` | `npm run check` + `.npproj.zip` 왕복 · asset 왕복 |
| `scripts/renpyConfigs.ts` | 위 + golden coverage 재검토 |
| 새 `.rpy` 출력 경로 추가 | 위 전부 + `zip-asset-invariant` 매트릭스 추가 |

여러 축에 걸치면 **합집합**을 돌린다.

## 2) scope gate (항상 실행 — 두 축 모두)

```
A. tracked:   git diff --exit-code -- <이번 작업에서 금지된 경로들>
B. tracked+untracked:  git status --porcelain=v1 --untracked-files=all
                       → 모든 path 가 이번 작업의 exact allowlist 안인지 기계적으로 확인
```

⚠️ **A 만으로는 새로 생긴 untracked production 파일을 못 잡는다.** 반드시 B 도 본다.
production regression 을 생략했다면 그 근거는 **"tracked + untracked forbidden path 가 모두 0"** 이어야 한다.

## 3) 보고 규칙

- 실행한 게이트와 **실제 출력**(테스트 수·실패 수·PASS/FAIL)을 적는다.
- ⚠️ **실행하지 않은 게이트를 PASS 로 쓰지 말 것.** "미실행"이라고 명시한다.
- ⚠️ **실패를 요약으로 덮지 말 것.** 실패 출력을 그대로 보여준다.
- 이번 작업에서 의도적으로 제외한 게이트가 있으면 **제외 사유**를 함께 적는다.

## STOP conditions

- **`npm run golden:update` 는 사용자 명시 승인 없이 실행하지 않는다.**
  이 skill 을 호출한 것 자체는 승인이 아니다. golden 이 깨졌다면 그건 **회귀**이지 갱신 대상이 아니다.
- `npm run build` 를 로컬(OneDrive)에서 게이트로 쓰지 않는다 — 조용히 exit 127 로 죽고 옛 dist 가 남는다.
  검증이 필요하면 스크래치 outDir 빌드를 쓴다.
- `.lint-tmp` 같은 생성 폴더를 repo 안에 두고 검증하지 않는다(스테일 산출물이 통과시킨다).
