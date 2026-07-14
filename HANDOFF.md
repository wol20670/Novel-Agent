# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- [ ] ⚠️ fix/review-p0-p1 배포 전 Supabase SQL Editor에서 `supabase/setup.sql` 재실행(projects.client_id 컬럼 추가) — 안 하면 협업 저장이 400으로 실패
- [ ] CG 배경 전환을 실제 업로드 CG로 사용자 실기기 확인(블러 백드롭 품질 체감)
- [ ] 퀵메뉴 드롭다운(알약 원복) 실기기 확인: hover 하이라이트 + 우측 끝 정렬·여백 0 체감

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- 코드리뷰 P0+P1 반영(8a90eeb, main 병합·푸시 완료): esc `[`/`{` 이스케이프, collab client_id 에코 판정, 폰트 폴백 gui.rpy 일치, 저장 로드 분리, push 실패 뱃지 반영, 전송 확장자 수정 + 성능 6건(SceneCard 셀렉터, content-visibility, 번역 배치 set, useMemo, 구독 축소, IDB 배치 삭제) — typecheck·test 32/32·외부 빌드·renpy lint 통과
