# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- [ ] 고아 blob 정리 버튼(에셋 탭) — scene/character/itemAssetIds/menuArt 어디서도 참조 안 되는 IndexedDB 에셋 스캔→개수 표시→deleteAssets 일괄 삭제(참조 수집은 store.ts clearGeneratedAssets 패턴 재사용, 삭제 전 확인 필수)
- [ ] 협업 디바운스 창 편집 보호 — applyRemoteProject(store.ts)가 원격 수신 시 프로젝트 전체 교체라 600ms 디바운스 대기 중인 내 타이핑이 유실되는 경로 완화(예: 대기 중 saveTimer 있으면 원격 반영 유예 또는 병합)

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- 대본 재업로드 병합(스마트 병합/뒤에 추가/전체 교체 모달) — 에셋 이름 재연결·번역/승인 승계, test 40/40·Playwright 실 시나리오 검증 완료
- 파서 URL/시각 오인식 수정 + 이스케이프 3종 escapeRpy 코어 통합 — test 48/48·renpy lint 회귀 통과
