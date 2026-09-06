# PHASES — Phase index

> **Phase 결과 index 와 작업 루프**만 여기 둔다. Phase 별 확정 설계·측정치·폐기안 전문은
> [`docs/history/v1-ai-phases.md`](./docs/history/v1-ai-phases.md) 가 보존한다(byte 단위 원문).
> 현재 지켜야 할 계약은 [`docs/contracts/`](./docs/contracts/ai-workflows.md) 가 정본이고,
> **history 는 그것을 override 하지 못한다.** (세션 상태는 `HANDOFF.md`, 상시 규칙은 `CLAUDE.md`.)

## 작업 루프 — 정본은 `/phase-workflow`

> **이 문서는 Phase 결과 index 다.** Phase lifecycle 과 승인 게이트의 **canonical 은 `/phase-workflow`** 하나이고,
> 여기에는 high-level pointer 만 둔다(같은 절차를 두 곳에 두면 어긋난다).

```
Plan → GPT 검토 → IMPLEMENTATION GO → 구현 → actual diff review → COMMIT·PUSH GO
```

- Phase 프롬프트는 **한 번에 하나만 유효**하다. 다음 Phase 를 미리 구현하지 않는다.
- Claude 는 GPT 리뷰를 무조건 수용하지 않는다 — 리포의 실제 코드와 어긋나면 근거(파일·줄)를 들어 알린다.
- **승인 게이트를 스스로 넘지 말 것.** 확정되면 아래 로그에 한 줄 + 커밋 해시를 남긴다.
- 2026-08-11 확정 당시의 루프 원문 → [`v1-ai-phases.md#phases-head`](./docs/history/v1-ai-phases.md#phases-head) (P00 블록).

## Phase 로그

> Phase 번호를 누르면 그 Phase 의 **확정 설계 원문**으로 간다(0·2 는 전용 절이 없다).

| Phase | 내용 | 상태 | 커밋 | 검증 |
|---|---|---|---|---|
| 0 | store/LeftPanel/types 모듈화(기준 상태) | ✅ 확정 | `9f936b6`…`e4dbe6a` | typecheck·test 479·build·e2e |
| [1](./docs/history/v1-ai-phases.md#phase-1) | 복장 시스템 분석 + 장면 내 의상 전환 설계(**코드 변경 없음**) | ✅ 확정 (3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| 2 | 장면 내 수동 의상 전환 구현 | ✅ 확정 | `7dbfaaa` (보정 `ec7bc04`) | typecheck · vitest 42파일/517 · 기존 `.rpy` 21구성 바이트 회귀 0 + 신규 `outfits-line` 정상 · 스크래치 빌드+e2e · Ren'Py lint 에러 0 · save/load·`.npproj.zip` 왕복 |
| [3](./docs/history/v1-ai-phases.md#phase-3) | 기존 표정 AI end-to-end audit(**코드 변경 없음**) | ✅ 확정 (3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| [4](./docs/history/v1-ai-phases.md#phase-4) | 표정 AI correctness — F1(줄 시점 의상) + F4(표정 설명 identity) | ✅ 확정 (2차 리뷰 반영) | `558f18e` | typecheck · vitest 42파일/532 · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 |
| [5](./docs/history/v1-ai-phases.md#phase-5) | 표정 AI 문맥 품질(F2/F3) | ✅ 확정 (v2 리뷰 반영) | `e1c1adf` | typecheck · vitest 42파일/549(532→+17) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 200줄 합성 장면 구조 실측 |
| [6](./docs/history/v1-ai-phases.md#phase-6) | Outfit AI audit + 최소 계약(**코드 변경 없음**) | ✅ 확정 (v3.1, 3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| [7](./docs/history/v1-ai-phases.md#phase-7) | Outfit AI transition suggestion 구현 | ✅ 확정 (Plan v4 + 구현 diff 리뷰 반영) | `25c2b5e` | typecheck · vitest 46파일/668(549→+119) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 기존 e2e 전체 통과 · 브라우저 targeted smoke · `.npproj.zip` 실제 왕복 |
| [8](./docs/history/v1-ai-phases.md#phase-8) | AI 연출 workflow 통합 audit + 정합성 방어 | ✅ 확정 (Plan v4 + actual diff 리뷰 반영) | `88c4095` | typecheck · vitest 50파일/708(668→+40) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 브라우저 e2e 전체(제안 칩 4경로 + export/import 후속 단계 포함) · `git diff --check` 이상 없음 |
| [9](./docs/history/v1-ai-phases.md#phase-9) | Preview↔Export 스프라이트 표시 parity | ✅ 확정 (Plan v6 + GitHub actual commit 리뷰 반영) | `7352ba5` | typecheck · vitest 50파일/729(708→+21) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 브라우저 e2e 전체 · `git diff --check` 이상 없음 · 미리보기 실기 스모크(콘솔 에러 0) |
| [10](./docs/history/v1-ai-phases.md#phase-10) | Outfit AI 실키 품질 audit(**production 변경 없음** — 측정 Phase) | ✅ 확정 (Plan v3 + dry/GT freeze + actual 결과 리뷰 반영) | 이 문서 | dry 18/18(D0~D16) · live Run 1 26요청 · stability Run 2·3 각 13요청 · deployed UI request-contract parity 1요청 · vitest 50파일/729 · typecheck · production/tests/package/lock/`.gitignore` diff 0 |
| [11](./docs/history/v1-ai-phases.md#phase-11) | Outfit AI 같은 응답 안의 연쇄 전환 검증 보정(A 는 rollback) | ✅ 확정 | `6da5d77` | typecheck · vitest 50파일/741 · 스크래치 outDir 빌드 · e2e 전체 · `dump:rpy` 22구성 245파일 diff 0 · audit dry D0~D16 · B-only live PRIMARY 26요청 |
| [12](./docs/history/v1-ai-phases.md#phase-12) | Outfit AI semantic contract audit + Phase 13 계약 고정(**코드 변경 없음** — 분석/설계 Phase) | ✅ 확정 (Plan v1→최종, GPT 4차 검토 반영) | 이 문서(docs-only) | — (분석 Phase · live 호출 0 · production/tests/audit diff 0) |
| [13](./docs/history/v1-ai-phases.md#phase-13) | Outfit AI binary semantic `kind` 계약 구현 + `FIXED_RULE` 보정 | ✅ 확정 (구현 → live PRIMARY → P4 회귀 분석 → 최소 보정 → corrected PRIMARY, GPT 4차 검토 반영) | `81b7f7f` | typecheck · vitest 50파일/762(741→+21) · audit dry D0~D19 21/21 · `dump:rpy` 22구성 245파일 diff 0 · pre-correction live PRIMARY 26요청 · corrected live PRIMARY 26요청(TP/FP/FN 17/1/1 · F1 0.944) |
| [14](./docs/history/v1-ai-phases.md#phase-14) | Outfit AI residual/stability audit → **동결 결정**(분석 Phase) | ✅ 확정 (Outcome B) | `4f1f115`(docs-only) | — (분석 Phase · production/tests/프롬프트 변경 0 · live 0) |
| [15](./docs/history/v1-ai-phases.md#phase-15) | Expression AI 실사용 audit → **F-1 후보 pool correction** | ✅ 확정 (Plan v1 → GPT 3차 검토 → 구현 → 구현 리뷰) | `e9311f3` | typecheck · vitest 50파일/772(762→+10) · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 outDir 빌드 · live 0 · mutation check 8건 |
| [16](./docs/history/v1-ai-phases.md#phase-16) | Expression AI **연속성 소유 범위**(continuity ownership) prompt-contract correction | ✅ 확정 (Plan rev.2 → GPT 검토 → 구현 → 구현 리뷰 PASS) | `931a2cc` | typecheck · vitest 50파일/775(772→+3) · mutation check 8건 · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 outDir 빌드 · **live 6회**(fixture 3 × before/after 1) |
| [17](./docs/history/v1-ai-phases.md#phase-17) | Expression AI `P16-F2` **표정 denotation**(시제 축) 좁은 조사 | ✅ 확정 — **Outcome C**(correction 폐기, production 변경 0) (Plan rev.3 → GPT 검토 → live gate → correction → 구현 리뷰 PASS) | *(구현 커밋 없음)* | **live 12회**(fixture 6 × before/after 1) · 임시 correction 한정 검증: typecheck · vitest 50파일/776(775→+1) · mutation check 6건 · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 outDir 빌드 |
| [18](./docs/history/v1-ai-phases.md#phase-18) | Expression AI **production baseline 동결**(docs-only finalization) | ✅ 확정 — **Outcome A**(production/test 변경 0) (Plan → GPT 검토 → 정제 반영 → docs 확정) | 이 문서(docs-only) | — (분석·확정 Phase · production/tests/프롬프트 변경 0 · live 0 · 코드 트리 = `931a2cc` 와 동일이라 Phase 16 검증이 그대로 유효) |
| [19](./docs/history/v1-ai-phases.md#phase-19) | Novel-Agent 전체 production stabilization / **v1 checkpoint** | ✅ 확정 — **Outcome A**(production/test 변경 0) (Plan rev.2 → GPT 2차 검토 → canonical verification → GPT verification 리뷰 → docs 확정) | 이 문서(docs-only) | typecheck · vitest 50파일/775 · 스크래치 outDir 빌드(vite 5.4.21) · `dump:rpy` 22구성 245파일 · 브라우저 e2e 전체 통과 · Ren'Py 8.5.3 lint error·warning 0 · live 0 |

## Phase 결과 요약 (Outcome)

- **Outcome A**(production/test 변경 0 · docs-only 확정): Phase 18 · Phase 19
- **Outcome B**(현재 상태를 실사용 baseline 으로 동결): Phase 14 — Outfit AI
- **Outcome C**(correction 을 시도했으나 폐기 · 구현 커밋 없음): Phase 17 — 표정 시제 denotation
- **분석/설계 전용**(코드 변경 없음): Phase 1 · 3 · 6 · 10 · 12
- **구현 Phase**: 2 · 4 · 5 · 7 · 8 · 9 · 11 · 13 · 15 · 16
- ⚠️ **동결된 것**: Expression AI(Phase 18, baseline `931a2cc`) · Outfit AI(Phase 14).
  재튜닝 금지 목록은 [ai-workflows.md](./docs/contracts/ai-workflows.md) §5 가 정본이다.

## 계획 입력 — 현재 계약은 여기서 읽는다

> ⚠️ **"지금 코드에 이미 있는 것"을 이 문서에 다시 서술하지 않는다** — 중복 서술은 곧 stale 해진다.
> 계획 전에 아래 정본을 직접 열 것.

| 알아야 할 것 | 정본 |
|---|---|
| Expression / Outfit / Translation 현재 계약 · 재튜닝 금지 목록 | [`docs/contracts/ai-workflows.md`](./docs/contracts/ai-workflows.md) |
| Scene / Line identity(R5 입력) · CG · 수동 편집 | [`docs/contracts/scene-editor.md`](./docs/contracts/scene-editor.md) |
| persistence · schema 5경로 · 협업 | [`docs/contracts/project-compat.md`](./docs/contracts/project-compat.md) |
| Ren'Py 출력 · golden · 검증 절차 | [`docs/contracts/renpy-export.md`](./docs/contracts/renpy-export.md) |
| 역사적 planning input(2026-08-11 시점 snapshot) | [`v1-ai-phases.md#phases-planinput`](./docs/history/v1-ai-phases.md#phases-planinput) |

⚠️ 마지막 줄은 **그때의 사실**이다 — 현재 계약을 override 하지 못한다.
(예: 그 snapshot 의 Outfit 축 서술은 Phase 7 구현 · Phase 14 동결로 이미 낡았다 —
현재 Outfit AI 는 production 에 있다.)

## 매 Phase 체크리스트

> 실행 절차는 `/phase-workflow`, 변경 범위별 게이트 선택은 `/regression-gate` 가 확장판이다.

- [ ] 기존 `resolveEmotion`/`resolveOutfit` **단일 소스 계약**을 깨지 않는가(생성기·미리보기·장면카드가 각자 계산하면 어긋난다)
- [ ] 기존 휴리스틱(`infer.ts`)·폴백·워크어라운드를 이유 확인 없이 제거하지 않는가
- [ ] 사람이 정한 값(작가 태그·직접 지정)이 **항상 AI보다 우선**인가, 되돌릴 수 있는가
- [ ] 저장·`.npproj.zip`·협업·재분석 병합·Ren'Py export 5경로를 다 고려했는가
- [ ] timeline/event 같은 **새 추상화를 필요 없이 도입**하지 않는가(범위 확대 금지)
- [ ] AI 호출은 증분·비용 견적·진행률·중단 가능 구조를 기존 배치와 **같은 방식**으로 쓰는가
- [ ] 회귀 0: 기능을 안 켠 프로젝트의 생성 `.rpy`가 바이트 단위로 동일한가([renpy-export.md](./docs/contracts/renpy-export.md) "출력 회귀 0 증명법")
- [ ] 검증: `npm run typecheck` · `npm run test` · 스크래치 outDir 빌드 · 필요하면 `npm run test:e2e`
      (⚠️ `npm run build`는 OneDrive에서 조용히 죽고 옛 dist가 남는다 — `CLAUDE.md` 환경 함정 참고)

## 아카이브

- Phase 1~19 확정 설계 원문 → [`docs/history/v1-ai-phases.md`](./docs/history/v1-ai-phases.md)
- post-v1 축(번역·의상 UX·줄 삭제·CG 종료·Voice) → [`docs/history/post-v1.md`](./docs/history/post-v1.md)
- 안정화 R0~R4 → [`docs/history/stabilization-r0-r4.md`](./docs/history/stabilization-r0-r4.md)
