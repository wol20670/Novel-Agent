# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- [ ] CG 배경 전환을 실제 업로드 CG로 사용자 실기기 확인(블러 백드롭 품질 체감)
- [ ] 퀵메뉴 드롭다운 카드형 실기기 확인: hover 알약 하이라이트 + 카드 우측 끝/메뉴 버튼 정렬(자동화 스크린샷 불가 항목)

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- 퀵메뉴 드롭다운을 카드형(frame+vbox, 여백0, 동일폭)으로 교체 — style_prefix "quick" 그대로 쓰던 vbox를 quick_dropdown/quick_item_* 전용 스타일로 분리, 터치 variant/톱니 버튼은 미변경
- (부수 발견·수정) quick_button 계열에 insensitive_background 누락 — Ren'Py 8.5.3 프리캐시가 첫 인터랙션마다 존재하지 않는 DynamicImage를 조회해 **모든 생성 게임이 첫 대사에서 크래시**하던 버그를 실행 검증(renpy.exe run)으로 발견·수정
