# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- [ ] **Typecast 실키 검증** — typecast.ai 대시보드에서 Free 플랜 키 발급(월 3만 크레딧, 결제정보 불필요) → 앱에 입력 후: ① VoiceLab 보이스 목록 로딩(/v2/voices) ② 미리듣기 1회 생성+캐시 재청취 ③ 💡 견적 ↔ 실제 크레딧 차감 일치 ④ 잔여 크레딧 표시(/v1/users/me/subscription — 스키마는 방어적 파싱이라 실응답 확인 필요) ⑤ 일괄 생성 소량 + 402 가드. 대본 확정 후 3000줄 본생성은 Lite($15/월 20만 크레딧) 전환 검토
- [ ] Vercel 배포 시 api/typecast.ts Edge 함수 배포 확인(기존 api/supertone.ts 삭제됨)

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- Supertone→Typecast TTS 전면 이관(서비스 종료 대응) — typecastProvider/프록시/견적(1자=1크레딧 즉시)/VoiceLab 감정·강도/키·문구 전부 교체, 402 가드·배치·이어받기 보존 — test 90/90·외부 빌드·키없음 UI 스모크 통과 (main 병합·푸시 완료)
