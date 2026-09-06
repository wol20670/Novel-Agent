---
name: handoff-maintain
description: HANDOFF.md 를 세션 시작/끝에 정리한다. Done 항목을 git log 와 대조해 반영된 줄을 지우고, 현재 상태와 다음 할 일을 갱신하며, 계약 문장이 쌓였는지 점검한다. HANDOFF mutation 의 유일한 소유자다.
disable-model-invocation: true
---

# HANDOFF 유지보수 (standing instructions)

**이 skill 이 `HANDOFF.md` 를 고치는 유일한 정상 경로다.**
SessionStart hook 은 **읽기만** 하고 파일을 고치지 않는다.

## 절차

1. **`✅ 방금 반영됨` 대조** — 각 항목이 `git log` 에 실제로 있는지 확인한다
   (커밋 메시지·해시로). **반영된 줄만 삭제**한다.
   ⚠️ 아직 커밋 전인 항목은 **지우지 않는다** — "아직 커밋 전"이라고 쓰여 있어도
   git log 를 직접 확인해서 판단한다(문구를 믿지 않는다).
2. **`현재 상태` 갱신** — 직전 확정 작업 1줄 · 진행 중인 작업.
   **active work 중에는 브랜치를 적어도 된다.** 다만 `branch`/`HEAD` 는 **git 이 authority** 이므로
   영구 current-state 정보처럼 중복 저장하지 않는다(지금 필요할 때만).
3. **`🎯 다음 할 일` 갱신** — 지금 열린 작업과 다음 action 만. 없으면 **"없다"라고 명시**한다.
   ⚠️ 서술하지 말 것 — 이력은 git log 와 `docs/history/` 가 보존한다.
4. **`🚧 Active blockers` 갱신** — 없으면 "없음".
5. **`📎 지금 필요한 contract 링크`** — 지금 작업이 건드리는 것 3~5개만 남긴다.
6. **재축적 점검(중요)** — HANDOFF 에 아래가 쌓였는지 본다:
   - "…가 확정한 것" / "깨지 말 것" 형태의 **영구 계약 문장**
   - 검증 실측치(`vitest N파일/M tests`, `dump:rpy N구성`) 같은 **그 시점 evidence**
   - 완료된 Phase 의 상세 설계
   있으면 **보고만 한다**: "이건 `docs/contracts/<X>.md` 로 옮겨야 한다" 라고 알리고
   ⚠️ **임의로 옮기지 않는다**(정본 이동은 사람 판단이다).
7. **링크 유효성 확인** — `docs/contracts/` · `docs/history/` 링크가 살아 있는지.

## ⚠️ phase/work close finalization 에서 추가로 할 것

`/phase-workflow` 의 **8단계(docs finalization)** 에서 불릴 때는 아래를 지킨다 —
**최종 push 뒤에 tracked HANDOFF mutation 이 남지 않게** 하는 게 목적이다.

**finalization mode 의 원칙: post-close stable state 를 미리 작성한다.**
최종 commit·push·`main` 병합이 **끝난 뒤에도 그대로 참일** project-state wording 만 남긴다.

- **transport state 를 쓰지 않는다** — 브랜치 이름 · `HEAD` · commit SHA ·
  `review 대기` · `merge 대기` · `push 대기` · `uncommitted` · `commit pending` · `아직 커밋 전` ·
  `COMMIT·PUSH GO 대기` 류. 이 시점 HANDOFF 는 **commit 대상**이라 그대로 두면
  push·병합 되는 순간 사실과 어긋난다.
- 진행 단계 이름(`review/correction 단계` 같은 것)도 **finalization 에서는 쓰지 않는다** —
  그것도 병합되면 곧 거짓이 된다.
- 남길 것은 **완료된 작업의 결과 상태 + 아직 열린 작업 + 다음 action** 이다.
- ⚠️ **close 단계에서는 이 skill 을 다시 돌리지 않는다**(그러면 push 뒤 dirty tree 가 된다).

⚠️ 위는 **finalization mode 한정**이다 — active work 중의 일반 호출에서는
절차 2번대로 브랜치를 일시적으로 적어도 된다.

## STOP conditions

- ⚠️ **`docs/history/` 의 내용을 삭제하지 않는다.** history 는 이 skill 의 대상이 아니다.
  특히 `<!-- NA-PROV -->` 사이의 payload 는 byte 단위 보존물이라 **한 글자도 고치지 않는다.**
- ⚠️ **commit/push 하지 않는다.**
- ⚠️ contract 문서를 이 skill 에서 재작성하지 않는다(6번은 **보고**까지다).
- HANDOFF 가 다시 길어지고 있으면(대략 8KB 초과) 그 사실을 보고한다 —
  living state 문서는 **1~2분 안에 상태를 복구할 수 있는 길이**여야 한다.

## 목표 형태

```
현재 상태 / 🎯 다음 할 일 / 🚧 Active blockers / 📎 contract 링크 / 📌 알아둘 것 (지속) / ✅ 방금 반영됨
```
