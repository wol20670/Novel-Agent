# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- [ ] `971deae` 아이템 팝업 이름 제거 + 퀵메뉴 알약 UI 실측(실제 Ren'Py 실행으로 확인)
- [ ] 사용자가 말한 "개선사항 여러 가지" — 다음 세션 시작 때 구체 항목 확인
- [ ] (선택) 퀵메뉴 원형 아이콘: 지금 알약형. 원하면 `canvasMenu.ts`/`buildZip.ts`에 원형 PNG 로직 추가
- [ ] `chore/cleanup-optimize` → main 병합/PR 여부 결정

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- 죽은 코드·pngjs 제거(`0c2cc48`) + CLAUDE.md 35줄로 축약·HANDOFF 갱신(`5e891a8`) — `chore/cleanup-optimize` push 완료
- 자기정리형 인수인계 시스템 도입(이 커밋) — HANDOFF 구조화 + CLAUDE.md 규칙 + SessionStart 훅
