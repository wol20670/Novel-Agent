---
name: review-artifact
description: GPT actual-diff review 에 넘길 artifact 를 repo 밖 scratch 에 .md 로 생성한다. unified diff + untracked 신규 파일 전문 + git status + baseline/branch + verification evidence 를 한 파일에 담는다.
argument-hint: [plan|impl|docs]
disable-model-invocation: true
---

# Review artifact 생성 (standing instructions)

종류: **$ARGUMENTS** (`plan` | `impl` | `docs` — 없으면 `impl` 로 본다)

## 출력 위치·형식 (계약)

- **repo 밖 scratch 디렉터리**에 만든다. repo 안에 쓰지 않는다.
- 확장자는 **`.md` 또는 `.txt`**. ⚠️ **bare `.patch` 금지.**
- 파일명은 이 skill 이 정한다 — 사용자가 손으로 바꿀 필요가 없어야 한다:
  `<scratch>/review/<YYYYMMDD-HHMM>-<종류>-<브랜치>.md`
- 마지막에 **절대경로 한 줄**을 보고한다.

## 담을 것 (순서 고정)

1. **헤더** — 작업 이름 · 종류(plan/impl/docs) · 생성 시각
2. **baseline / branch** — `git rev-parse HEAD` · 작업 브랜치 · `origin/main` · 이 작업의 canonical baseline SHA
3. **`git status --short`** 전문
4. **`git status --porcelain=v1 --untracked-files=all`** 전문 (scope gate 근거)
5. **unified diff** — `git diff`(working tree 대 HEAD). ⚠️ `docs` 종류이거나 uncommitted 작업이면
   **full working-tree diff** 여야 한다(commit 이 아직 없으므로 `git diff HEAD` 가 전부다).
6. **untracked 신규 파일** — 파일별로 경로 + **전문**(diff 에 안 잡히므로 반드시 본문을 넣는다).
   너무 큰 파일은 자르지 말고, 자를 수밖에 없으면 **잘랐다는 사실과 잘린 바이트 수를 명시**한다.
7. **verification evidence** — 실제로 돌린 게이트와 그 출력 요약.
   ⚠️ **돌리지 않은 게이트를 PASS 로 적지 말 것.** 안 돌렸으면 "미실행"이라고 쓴다.
8. **알려진 이슈 / 리뷰어가 봐야 할 지점** — 스스로 판단한 위험 지점.

## STOP conditions

- repo 안에 쓰려는 상황 → 멈춘다.
- API 키·토큰·비밀 값이 diff 나 evidence 에 들어가는 상황 → **넣지 않는다.**
  값이 아니라 "환경변수로 주입했다"는 사실만 적는다.
- diff 가 비어 있는데 artifact 를 만들려는 상황 → 그 사실을 보고하고 만들지 않는다.
