# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 여긴 **"지금"만** 쓴다.
> 확정된 계약은 [`docs/contracts/`](./docs/contracts/project-compat.md), 이력은 [`docs/history/`](./docs/history/v1-ai-phases.md)와 git log 가 보존한다.
> ⚠️ **"…가 확정한 것 / 깨지 말 것" 문장이 여기 쌓이기 시작하면 contract 로 옮길 신호다.**
> 정리는 **`/handoff-maintain` 을 명시적으로 호출**해서 한다(SessionStart 는 읽기만 하고 파일을 고치지 않는다).

## 현재 상태

- 진행 중: **Security S1-D1(server-side data plane hardening)** — 1단계(client 보강 + `supabase/setup.sql` D1 정책)가 들어갔다.
  - client(F-8 대응): 빈 방 초기화 INSERT-only · initial-sync write latch(project/asset upsert 차단 · 신뢰할 수 있는 initial sync 에서만 해제) ·
    `.npproj.zip` import 업로드의 sync lifecycle binding · 원격 GC 의 "에셋 > 0 · 프로젝트 행 0" fail-closed. 코드 주석이 각 invariant 를 담는다.
  - `setup.sql`: 초대 계정(authenticated · 비익명) 전용 정책 · legacy anon 정책 제거 · `assets` bucket private · 트랜잭션 + assertion.
  - ⚠️ **hosted Supabase 에는 D1 SQL 이 아직 적용되지 않았다** — live 는 pre-D1(`anon` 개방 · bucket public) 상태다.
    [project-compat.md](./docs/contracts/project-compat.md) `## 협업` 과 rule 은 repo 정의와 hosted 상태를 구분하는 transitional 문구까지 반영했고,
    README · 협업 설정 UI 문구와 D1 최종 canonical wording 은 hosted 검증 뒤 2단계에서 정리한다. 결과 index → [PHASES.md](./PHASES.md) Security 축.
- 직전 확정: **안정화 R5(Line Identity Audit)** — 계약 → [scene-editor.md §Line identity](./docs/contracts/scene-editor.md#line-identity).
- 그 전 확정: **Security S1-B(Supabase Auth + collab runtime gate) + F1 보정** — ⚠️ **client-side gate 일 뿐**이다.
- v1 동결값(역사적 고정): **implementation baseline `931a2cc`** · **repository checkpoint `5902dc8`**.

## 🎯 다음 할 일

- **S1-D1 남은 순서**(각 단계는 사용자 명시 GO · 승인 게이트를 스스로 넘지 말 것):
  1. production 배포에 client 보강이 들어갔는지 확인 → **두 사용자 모두 새 build 로 새로고침**(옛 탭은 F-8 보호가 없다).
  2. **hosted SQL APPLY GO** → 사용자가 Supabase SQL Editor 에서 `supabase/setup.sql` 전체 실행(Claude 는 DB 자격증명·`service_role` 을 받지 않는다).
     실패 시 대응은 `setup.sql` 머리 주석에 있다(트랜잭션 거부 → 멈춤 · bucket UPDATE 거부 → 대시보드 Public off 후 재실행).
  3. 검증: 정책 audit(projects 3 · storage.objects 4 · 전부 `{authenticated}` · `public=false`) → authenticated hosted smoke(GC 는 계산까지만) →
     anon/public probe(SQL 적용 **후에만** · 키는 환경변수로만 · status 단독 판정 금지) → 테스트 데이터 정리.
  4. 2단계 canonical finalization: `project-compat.md` `## 협업` · `.claude/rules/project-compat.md` · README §실시간 협업 ·
     `src/components/left/CollabSettings.tsx` 보안 문구(초대 계정끼리 · 계정 사이 방별 권한 분리 없음) · PHASES/HANDOFF.
- S1-D1 follow-up(**지시가 있을 때만**): F-9 pull 이 network throw 로 실패한 lifecycle 뒤 자동저장 upsert 가 pull-first 없이 원격을 덮을 수 있음(pre-existing) ·
  F-10 boolean active 라 OFF→ON 사이 옛 startCollab continuation(pull 적용·채널·status)이 살아날 수 있음(pre-existing) ·
  lifecycle 전환 시 폐기된 import 에셋 업로드는 자동 재전송되지 않음(수용한 availability residual).
- **S1-D2(Realtime private channel · Presence authorization · room 권한 · 필요 시 GC/asset namespace 재설계)는 미착수** — D1 이 끝난 뒤
  **사용자·리뷰어 지시가 있을 때만** 연다. D1 은 end-to-end room authorization 이 아니다(초대 계정끼리는 전 방·전체 에셋 접근).
- v1 축은 **정해진 다음 필수 작업이 없다.** ⚠️ **새 blocker 가 없는 한 Phase 20+ 를 만들지 말 것** —
  backlog 가 존재한다는 사실만으로 Phase 를 추가하지 않는다. "종료"의 뜻은 *영원히 완성*이 아니라
  **현재 계획된 v1 핵심 개발의 종료**다.
- **안정화 R 축의 다음 Phase 는 정해지지 않았다** — **사용자 지시가 있을 때만** 연다(R5 에서 미리 설계하지 않았다).
  R5 follow-up 2건(voice 배치 커밋의 선점 precedence · 같은 이름 캐릭터의 preset 만 바뀐 교체)은
  [scene-editor.md §R5](./docs/contracts/scene-editor.md#line-identity) 에 한 줄씩 기록만 돼 있다 — 지시가 있을 때만.
- 열려 있는 다른 축(전부 완료 상태 · 지시가 있을 때만 재개):
  post-v1 번역 로드맵(P1~5 완료) · 의상 전환 UX · 대본 한 줄 삭제 · CG 종료/수동 삽입 · Voice anchor ·
  안정화 R0~R5. 계약은 `docs/contracts/`, 이력은
  [post-v1.md](./docs/history/post-v1.md) · [stabilization-r0-r4.md](./docs/history/stabilization-r0-r4.md).
- **v1 비차단 backlog** 는 사라진 게 아니라 **v1 을 막지 않는 항목**이다 —
  목록과 accepted limitation 의 정본은
  [ai-workflows.md](./docs/contracts/ai-workflows.md) §4·§5. ⚠️ 자동 구현 대상이 아니다.

## 🚧 Active blockers

- 없음.

## 📎 지금 필요한 contract 링크

- [project-compat.md](./docs/contracts/project-compat.md) — persistence · `.npproj.zip` · store · 협업 · **Auth 경계 · F1 · 보안 한계**(D1 서술은 2단계에서 갱신)
- [scene-editor.md](./docs/contracts/scene-editor.md) — SceneCard/LineRow · **line identity(R5 audit 결과 · VoiceLab)** · CG · 수동 편집
- [renpy-export.md](./docs/contracts/renpy-export.md) — 생성기 · GUI 실기 함정 · golden · 검증 절차
- [ai-workflows.md](./docs/contracts/ai-workflows.md) — Expression/Outfit/Translation 동결 계약 · 재튜닝 금지

## 📌 알아둘 것 (지속)

- **표정 AI 배정 실키 검증도 최후순위로 연기**(2026-08-10, TTS와 같은 취급) — OpenAI 키로 후보 밖 라벨·연속성·미소 계열 분화·토큰 견적을 볼 항목이었으나 당분간 안 한다. 코드는 이미 있으니 재개할 땐 `src/generators/emotion/` 부터. 재개 시 Phase 5 문맥 품질 확인 목록도 함께: 주인공↔히로인 반응 · 지문 개입 · 기존 표정 연속성 · 감정 유지 구간 · 명확한 급변 · 긴 장면.
- **TTS(Typecast)는 최후순위로 연기**(2026-08-09) — 실키 검증·Vercel Edge 배포 확인 모두 당분간 안 한다. 코드는 이미 들어와 있으니 재개할 땐 `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09) — 글자가 구워진 버튼이 영어·일본어에서도 한글로 남지만 감수. 다국어는 **텍스트 번역 + 폰트 교체**로만 간다(Ren'Py `tl/<언어>/` 이미지 치환 방법은 [renpy-export.md](./docs/contracts/renpy-export.md) 에 남겨뒀다).
- 미착수(계속 의도적으로 뺌): 탭 컴포넌트 코드 스플리팅, `screensRpy.ts`(3484줄) 분리(생성기 쪽은 `.rpy` 회귀 0 덤프 대조가 필요한 별개 작업), store 슬라이스 안의 긴 로직(autoTranslateAll·보이스 배치)을 services 로 빼기. ⚠️ **`AssetsTab.tsx` 분리는 R3 에서, `SceneCard.tsx` 분리는 R4 에서 완료**됐다([stabilization-r0-r4.md](./docs/history/stabilization-r0-r4.md#r3)) — 이 목록으로 되돌리지 말 것.
- **Auth 운영**: 계정은 Dashboard invite 로만 만들고 앱 안에 비밀번호 재설정 경로는 없다(계정 복구 절차는 필요할 때 정한다).
  Preview 배포는 Vercel Deployment Protection 뒤에 있다(자동 브라우저로 볼 땐 그 창에서 Vercel 로그인 필요).
- **로컬 Windows 검증 주의**: 이 PC 는 vitest 전체 실행에서 5s timeout starvation 이 재현된다(대상 테스트가 매번 바뀌고
  pristine baseline 에서도 같다 · 단독 실행은 통과). 그때 `check:full` 은 **environment-blocked 로 보고**하고 PASS 로 쓰지 않는다 —
  e2e 는 `node scripts/e2e-run.mjs` 단독으로 증거를 낸다. ⚠️ **CI 를 얻으려고 COMMIT·PUSH GO 전에 push 하지 않는다.**
- **live audit 운영 주의**: 리포 안에 평문 키 파일(`key.txt` 류)을 만들지 말 것 — 환경변수로만 주입한다(CLAUDE.md 워크플로우). Phase 13 live 원본은 **`audit.local/phase13/`**(gitignore)에 보존돼 있고 `audit.local/out/` 의 Phase 10 산출물은 무수정이다.

## ✅ 방금 반영됨 (`/handoff-maintain` 이 git log 와 대조해 반영된 줄을 지운다)

- **Security S1-D1 1단계** — `src/collab/{sync,index,assetsSync,assetsGc}.ts` F-8 보강 · `src/store/{assetSlice,persistenceSlice}.ts` ·
  `supabase/setup.sql` D1 정책(live 미적용) · `tests/collab-auth-gate.test.ts` S1-D1 F-8 블록 · PHASES Security 축.
