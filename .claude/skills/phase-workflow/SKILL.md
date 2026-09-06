---
name: phase-workflow
description: Novel-Agent 의 Phase lifecycle 을 승인 게이트와 함께 진행한다. Plan → GPT 검토 → IMPLEMENTATION GO → 구현 → actual diff review → COMMIT·PUSH GO 까지의 절차와 STOP 조건.
argument-hint: [phase-name]
disable-model-invocation: true
---

# Phase 작업 루프 (standing instructions)

대상 Phase: **$ARGUMENTS**

이 지시는 **이 작업이 끝날 때까지 계속 유효**하다. 아래 게이트는 **사용자의 명시적 문장**으로만 열린다 —
Claude 는 스스로 게이트를 통과했다고 선언하지 않는다.

## 게이트 순서 (건너뛰지 말 것)

```
1. Plan 작성 (Plan Mode · repo 밖 scratch 에 .md 로)
        ↓  사용자가 GPT 에 전달
2. GPT Plan Review  → 수정 지시가 오면 반영하고 다시 STOP
        ↓  ★ 사용자의 "IMPLEMENTATION GO"
3. 브랜치 생성 (main 이면 반드시 새 브랜치부터)
4. 구현 + self-check (변경 종류에 맞는 게이트 = /regression-gate)
5. /review-artifact  → repo 밖 scratch 에 actual-diff artifact 생성
6. preflight-reviewer 로 self-review (승인 authority 아님)
        ↓  사용자가 GPT 에 전달
7. GPT actual diff review
        ↓  ★ 사용자의 "IMPLEMENTATION PASS"
8. docs finalization — **/handoff-maintain 을 여기서 돌린다** (HANDOFF · contract · history 갱신)
9. /review-artifact 다시 (docs 포함 full working-tree diff)
        ↓  ★ 사용자의 "FINAL DIFF PASS"
        ↓  ★ 사용자의 "COMMIT · PUSH GO"
10. commit shape 결정 → commit → push → remote CI 확인
11. close — **파일을 고치지 않는다.** working tree clean · branch · remote 상태만 확인
```

★ 표시된 **네 지점**(IMPLEMENTATION GO · IMPLEMENTATION PASS · FINAL DIFF PASS · COMMIT·PUSH GO)은
**사용자 문장이 없으면 다음 단계로 가지 않는다.**

### ⚠️ invariant — 최종 push 뒤 tracked HANDOFF mutation 을 남기지 않는다

- **`/handoff-maintain` 은 8단계(docs finalization)에서 돈다.** close 에서 HANDOFF 를 고치면
  push 뒤 dirty tree 가 되거나(A) **push 된 HANDOFF 가 stale 해진다**(B). 둘 다 금지다.
- 9단계 final review artifact 에는 **최종 HANDOFF 도 포함**되고, 10단계 commit 대상에 그 HANDOFF 가 들어간다.
- finalization 용 HANDOFF 에 `uncommitted` · `commit pending` · `push pending` 처럼
  **즉시 stale 해지는 transient 표현을 남기지 않는다.**
- **branch/HEAD 는 git 이 authority 다** — 영구 current-state 정보처럼 HANDOFF 에 중복 저장하지 않는다
  (진행 중 작업에서 잠시 필요할 때만 적는다).
- ⚠️ 이걸 위해 **새 git automation·hook 을 만들지 않는다.** SessionStart 는 read-only 그대로다.

## STOP conditions (하나라도 해당하면 멈추고 보고한다)

- `main` 브랜치에서 구현을 시작하려는 상황 → **새 브랜치부터.**
- 승인 없이 `git commit` / `git push` 를 하려는 상황 → **금지.**
- `npm run golden:update` 를 실행하려는 상황 → **사용자 명시 승인 없이 금지.**
  이 skill 을 호출한 것 자체는 그 승인이 아니다.
- Plan 에 없던 파일·디렉터리를 건드리게 되는 상황(scope creep) → 멈추고 확인.
- 동결 계약(Expression Phase 18 / Outfit Phase 14)을 재튜닝하게 되는 상황 →
  `docs/contracts/ai-workflows.md` §5 를 먼저 확인하고, 새 blocker 근거가 없으면 하지 않는다.
- GPT 리뷰 내용이 이 리포의 실제 코드와 어긋날 때 → **무조건 수용하지 않는다.**
  근거(파일·심볼)를 들어 반박하고 사용자 판단을 기다린다.

## 계획 단계에서 반드시 할 것

- **contract 를 먼저 읽는다**(path-scoped rule 은 파일을 열기 전엔 문맥에 없다):
  `docs/contracts/project-compat.md` · `scene-editor.md` · `renpy-export.md` · `ai-workflows.md`.
  필요하면 `contract-auditor` agent 에게 blast radius 조사를 맡긴다(read-only).
- 매 Phase 체크리스트(`PHASES.md`)를 통과시킨다.
- **한 번에 하나의 Phase 만 유효**하다. 다음 Phase 를 미리 구현하지 않는다.

## 확정 후

- `PHASES.md` Phase 로그에 한 줄 + 커밋 해시. 상세는 `docs/history/` 로.
- **"…가 확정한 것 / 깨지 말 것" 문장은 `HANDOFF.md` 가 아니라 `docs/contracts/` 로 간다.**
