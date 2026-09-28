# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 여긴 **"지금"만** 쓴다.
> 확정된 계약은 [`docs/contracts/`](./docs/contracts/project-compat.md), 이력은 [`docs/history/`](./docs/history/v1-ai-phases.md)와 git log 가 보존한다.
> ⚠️ **"…가 확정한 것 / 깨지 말 것" 문장이 여기 쌓이기 시작하면 contract 로 옮길 신호다.**
> 정리는 **`/handoff-maintain` 을 명시적으로 호출**해서 한다(SessionStart 는 읽기만 하고 파일을 고치지 않는다).

## 현재 상태

- 직전 확정: **Security S1-B(Supabase Auth + collab runtime gate) + F1 보정(local-only → 로그인 재접속 확인)** —
  CI·Preview hosted smoke 까지 검증됐다. ⚠️ **client-side gate 일 뿐**이고 서버(RLS·Storage)는 아직 `anon` 개방이다.
  계약 → [project-compat.md](./docs/contracts/project-compat.md) 의 `## 협업` 절 · 결과 index → [PHASES.md](./PHASES.md) Security 축.
- 그 전 확정: 안정화 R4(SceneCard 구조 분리) · Pre-R5 workflow/docs housekeeping(production 변경 0).
- v1 동결값(역사적 고정): **implementation baseline `931a2cc`** · **repository checkpoint `5902dc8`**.

## 🎯 다음 할 일

- **Security S1-D1/D2(server-side hardening: RLS·Storage 정책·room 권한)는 미착수** — 다음 Security 후보지만
  **사용자·리뷰어 지시가 있을 때만** 연다. 그때 `supabase/setup.sql` 상단 주석의 "anon 키" 표현도 정리한다
  (클라이언트 키는 publishable key — SQL role `anon` 과 혼동 여지).
- 운영: 친구 계정 재초대(Supabase 기본 SMTP 발송 한도가 빡빡하니 초대 간격을 둔다) ·
  Supabase 쪽 legacy anon key 정리 여부는 사용자 결정.
- v1 축은 **정해진 다음 필수 작업이 없다.** ⚠️ **새 blocker 가 없는 한 Phase 20+ 를 만들지 말 것** —
  backlog 가 존재한다는 사실만으로 Phase 를 추가하지 않는다. "종료"의 뜻은 *영원히 완성*이 아니라
  **현재 계획된 v1 핵심 개발의 종료**다.
- **R5(Line Identity Audit)** 도 후보지만 **아직 열지 않았다** — **사용자 지시가 있을 때만** 연다.
  입력 정본은 [scene-editor.md#line-identity](./docs/contracts/scene-editor.md#line-identity).
- 열려 있는 다른 축(전부 완료 상태 · 지시가 있을 때만 재개):
  post-v1 번역 로드맵(P1~5 완료) · 의상 전환 UX · 대본 한 줄 삭제 · CG 종료/수동 삽입 · Voice anchor ·
  안정화 R0~R4. 계약은 `docs/contracts/`, 이력은
  [post-v1.md](./docs/history/post-v1.md) · [stabilization-r0-r4.md](./docs/history/stabilization-r0-r4.md).
- **v1 비차단 backlog** 는 사라진 게 아니라 **v1 을 막지 않는 항목**이다 —
  목록과 accepted limitation 의 정본은
  [ai-workflows.md](./docs/contracts/ai-workflows.md) §4·§5. ⚠️ 자동 구현 대상이 아니다.

## 🚧 Active blockers

- 없음.

## 📎 지금 필요한 contract 링크

- [project-compat.md](./docs/contracts/project-compat.md) — persistence · `.npproj.zip` · store · 협업 · **Auth 경계 · F1 · 보안 한계**
- [scene-editor.md](./docs/contracts/scene-editor.md) — SceneCard/LineRow · **line identity(R5 입력)** · CG · 수동 편집
- [renpy-export.md](./docs/contracts/renpy-export.md) — 생성기 · GUI 실기 함정 · golden · 검증 절차
- [ai-workflows.md](./docs/contracts/ai-workflows.md) — Expression/Outfit/Translation 동결 계약 · 재튜닝 금지

## 📌 알아둘 것 (지속)

- **표정 AI 배정 실키 검증도 최후순위로 연기**(2026-08-10, TTS와 같은 취급) — OpenAI 키로 후보 밖 라벨·연속성·미소 계열 분화·토큰 견적을 볼 항목이었으나 당분간 안 한다. 코드는 이미 있으니 재개할 땐 `src/generators/emotion/` 부터. 재개 시 Phase 5 문맥 품질 확인 목록도 함께: 주인공↔히로인 반응 · 지문 개입 · 기존 표정 연속성 · 감정 유지 구간 · 명확한 급변 · 긴 장면.
- **TTS(Typecast)는 최후순위로 연기**(2026-08-09) — 실키 검증·Vercel Edge 배포 확인 모두 당분간 안 한다. 코드는 이미 들어와 있으니 재개할 땐 `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09) — 글자가 구워진 버튼이 영어·일본어에서도 한글로 남지만 감수. 다국어는 **텍스트 번역 + 폰트 교체**로만 간다(Ren'Py `tl/<언어>/` 이미지 치환 방법은 [renpy-export.md](./docs/contracts/renpy-export.md) 에 남겨뒀다).
- 미착수(계속 의도적으로 뺌): 탭 컴포넌트 코드 스플리팅, `screensRpy.ts`(3484줄) 분리(생성기 쪽은 `.rpy` 회귀 0 덤프 대조가 필요한 별개 작업), store 슬라이스 안의 긴 로직(autoTranslateAll·보이스 배치)을 services 로 빼기. ⚠️ **`AssetsTab.tsx` 분리는 R3 에서, `SceneCard.tsx` 분리는 R4 에서 완료**됐다([stabilization-r0-r4.md](./docs/history/stabilization-r0-r4.md#r3)) — 이 목록으로 되돌리지 말 것.
- **Auth 운영**: 계정은 Dashboard invite 로만 만들고 앱 안에 비밀번호 재설정 경로는 없다(계정 복구 절차는 필요할 때 정한다).
  Preview 배포는 Vercel Deployment Protection 뒤에 있다(자동 브라우저로 볼 땐 그 창에서 Vercel 로그인 필요).
- **live audit 운영 주의**: 리포 안에 평문 키 파일(`key.txt` 류)을 만들지 말 것 — 환경변수로만 주입한다(CLAUDE.md 워크플로우). Phase 13 live 원본은 **`audit.local/phase13/`**(gitignore)에 보존돼 있고 `audit.local/out/` 의 Phase 10 산출물은 무수정이다.

## ✅ 방금 반영됨 (`/handoff-maintain` 이 git log 와 대조해 반영된 줄을 지운다)

- **Security S1-B + F1 보정 docs closure** — `project-compat.md` 협업 절(인증 경계 · F1 · 보안 한계) ·
  `.claude/rules/project-compat.md` · PHASES Security 축.
