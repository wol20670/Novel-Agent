# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 여긴 **"지금"만** 쓴다.
> 확정된 계약은 [`docs/contracts/`](./docs/contracts/project-compat.md), 이력은 [`docs/history/`](./docs/history/v1-ai-phases.md)와 git log 가 보존한다.
> ⚠️ **"…가 확정한 것 / 깨지 말 것" 문장이 여기 쌓이기 시작하면 contract 로 옮길 신호다.**
> 정리는 **`/handoff-maintain` 을 명시적으로 호출**해서 한다(SessionStart 는 읽기만 하고 파일을 고치지 않는다).

## 현재 상태

- 브랜치 `chore/pre-r5-housekeeping` — **Pre-R5 Workflow/Docs Housekeeping** 진행 중(H1~H4, uncommitted).
  ⚠️ 이건 **안정화 R 축의 Phase 가 아니다**(R4.5 같은 번호를 붙이지 않는다).
- 직전 확정: **안정화 R4(SceneCard 구조 분리)** — `6dffbba`(구현) · `047cc7d`(문서), main 반영 완료.
- v1 동결값(역사적 고정): **implementation baseline `931a2cc`** · **repository checkpoint `5902dc8`**.

## 🎯 다음 할 일

- **정해진 다음 필수 작업은 없다.** ⚠️ **새 blocker 가 없는 한 Phase 20+ 를 만들지 말 것** —
  backlog 가 존재한다는 사실만으로 Phase 를 추가하지 않는다. "종료"의 뜻은 *영원히 완성*이 아니라
  **현재 계획된 v1 핵심 개발의 종료**다.
- **Pre-R5 Housekeeping**: H4 + 전체 verification 완료 → `/review-artifact` → `preflight-reviewer` →
  **GPT actual diff review 대기**. ⚠️ **COMMIT·PUSH GO 전까지 commit/push 금지**이고 commit shape 도 아직 정하지 않았다.
- **다음 후보는 R5(Line Identity Audit)** 이지만 **아직 열지 않았다** — 설계도 시작하지 않았고
  **사용자 지시가 있을 때만** 연다. 입력 정본은
  [scene-editor.md#line-identity](./docs/contracts/scene-editor.md#line-identity).
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

- [project-compat.md](./docs/contracts/project-compat.md) — persistence · `.npproj.zip` · store · 협업
- [scene-editor.md](./docs/contracts/scene-editor.md) — SceneCard/LineRow · **line identity(R5 입력)** · CG · 수동 편집
- [renpy-export.md](./docs/contracts/renpy-export.md) — 생성기 · GUI 실기 함정 · golden · 검증 절차
- [ai-workflows.md](./docs/contracts/ai-workflows.md) — Expression/Outfit/Translation 동결 계약 · 재튜닝 금지

## 📌 알아둘 것 (지속)

- **표정 AI 배정 실키 검증도 최후순위로 연기**(2026-08-10, TTS와 같은 취급) — OpenAI 키로 후보 밖 라벨·연속성·미소 계열 분화·토큰 견적을 볼 항목이었으나 당분간 안 한다. 코드는 이미 있으니 재개할 땐 `src/generators/emotion/` 부터. 재개 시 Phase 5 문맥 품질 확인 목록도 함께: 주인공↔히로인 반응 · 지문 개입 · 기존 표정 연속성 · 감정 유지 구간 · 명확한 급변 · 긴 장면.
- **TTS(Typecast)는 최후순위로 연기**(2026-08-09) — 실키 검증·Vercel Edge 배포 확인 모두 당분간 안 한다. 코드는 이미 들어와 있으니 재개할 땐 `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09) — 글자가 구워진 버튼이 영어·일본어에서도 한글로 남지만 감수. 다국어는 **텍스트 번역 + 폰트 교체**로만 간다(Ren'Py `tl/<언어>/` 이미지 치환 방법은 [renpy-export.md](./docs/contracts/renpy-export.md) 에 남겨뒀다).
- 미착수(계속 의도적으로 뺌): 탭 컴포넌트 코드 스플리팅, `screensRpy.ts`(3484줄) 분리(생성기 쪽은 `.rpy` 회귀 0 덤프 대조가 필요한 별개 작업), store 슬라이스 안의 긴 로직(autoTranslateAll·보이스 배치)을 services 로 빼기. ⚠️ **`AssetsTab.tsx` 분리는 R3 에서, `SceneCard.tsx` 분리는 R4 에서 완료**됐다([stabilization-r0-r4.md](./docs/history/stabilization-r0-r4.md#r3)) — 이 목록으로 되돌리지 말 것.
- **live audit 운영 주의**: 리포 안에 평문 키 파일(`key.txt` 류)을 만들지 말 것 — 환경변수로만 주입한다(CLAUDE.md 워크플로우). Phase 13 live 원본은 **`audit.local/phase13/`**(gitignore)에 보존돼 있고 `audit.local/out/` 의 Phase 10 산출물은 무수정이다.

## ✅ 방금 반영됨 (`/handoff-maintain` 이 git log 와 대조해 반영된 줄을 지운다)

- (없음 — Pre-R5 Housekeeping 은 아직 커밋 전이다.)
