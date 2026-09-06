# PHASES — Phase index

> **Phase 결과 index 와 작업 루프**만 여기 둔다. Phase 별 확정 설계·측정치·폐기안 전문은
> [`docs/history/v1-ai-phases.md`](./docs/history/v1-ai-phases.md) 가 보존한다(byte 단위 원문).
> 현재 지켜야 할 계약은 [`docs/contracts/`](./docs/contracts/ai-workflows.md) 가 정본이고,
> **history 는 그것을 override 하지 못한다.** (세션 상태는 `HANDOFF.md`, 상시 규칙은 `CLAUDE.md`.)

## 작업 루프 (사용자 확정, 2026-08-11)

```
Phase N 프롬프트(사용자) → Claude Plan Mode 로 계획 작성
  → 사용자가 GPT 에 계획 전달 → GPT 검토·수정 지시
  → Claude 가 수정안을 "구현 가능성" 관점에서 재검토(동의 아니면 근거를 대고 반박)
  → 승인되면 Claude 구현 + 테스트
  → 결과(diff 요약·테스트)를 사용자가 GPT 에 전달 → GPT 검토 → Phase N 확정
  → **확정된 코드 상태를 기준으로** Phase N+1 프롬프트를 새로 작성 → 반복
```

- Phase 프롬프트는 **한 번에 하나만 유효**하다. 다음 Phase를 미리 구현하지 않는다.
- Claude는 GPT 리뷰를 무조건 수용하지 않는다 — 이 리포의 실제 코드와 어긋나면 근거(파일·줄)를 들어 알린다.
- Phase가 확정되면 **아래 로그에 한 줄 추가 + 커밋 해시 기록**. 새 세션은 이 파일로 문맥을 복구한다.

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

## 계획 입력: 지금 코드에 이미 있는 것 (재발명 금지)

**표정 파이프라인은 이미 존재한다.** LLM 배정도 들어와 있다.
- 판정 단일 소스 `resolveEmotion`(`src/generators/emotion/resolve.ts`) — **동기·순수**여야 한다(ScenePlayer·SceneCard가 렌더 중 호출). 우선순위 = 작가 태그 `Line.emotion` > AI `Line.emotionAuto` > 휴리스틱(`infer.ts`) > `기본`.
- 그래서 AI 값은 **렌더 시점 조회가 아니라 미리 계산해 Line에 저장**하는 구조다. 새 추론도 이 계약을 따라야 한다.
- 배치 실행 `autoAssignEmotionAll`(`src/store/aiBatchSlice.ts`) + `aiSelect.ts` + 비용 견적 `estimate.ts`. 증분(이미 채운 줄은 재호출 안 함)·busy 키·진행률·PACE·단일 커밋 구조를 공유한다.
- 후보 집합이 **두 종류**다: AI가 고를 수 있는 건 `availableExpressions`(실제 업로드된 것만), 최종 검증은 `effectiveExpressions`(선언 목록). 같게 만들면 "업로드 전 임시 실루엣" 워크플로가 죽는다.

**복장은 규칙 기반뿐 — LLM 추론이 없다(여기가 빈자리).**
- `resolveOutfit`(`src/types/project.ts`): 장면 직접 지정 `Scene.outfits[charName]` > `OutfitRule`(배경 이름 부분 일치, 긴 키워드 우선) > `기본`.
- 표정처럼 "AI 값 전용 필드 + 사람 값 우선"이라는 대칭 구조가 아직 없다.

**⚠️ `Line` 에는 stable id 가 없다.** 원인·구조·R5 scope 선언의 정본은
[`docs/contracts/scene-editor.md#line-identity`](./docs/contracts/scene-editor.md#line-identity) 다.
**새 필드를 `Line`/`Scene`/`Project` 에 추가할 때 따라오는 5경로**는
[`docs/contracts/project-compat.md`](./docs/contracts/project-compat.md) §새 필드 추가 가 정본이다.

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
