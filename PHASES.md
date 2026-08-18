# PHASES — 복장·표정 자동 추론(LLM) 도입

> 여러 세션에 걸치는 대형 작업의 **진행 기록 + 규칙**. 짧게 유지하고, 확정된 Phase만 한 줄씩 쌓는다.
> 세부 이력은 git log가 보존한다. (세션 상태는 `HANDOFF.md`, 코드 함정은 `CLAUDE.md`.)

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

| Phase | 내용 | 상태 | 커밋 | 검증 |
|---|---|---|---|---|
| 0 | store/LeftPanel/types 모듈화(기준 상태) | ✅ 확정 | `9f936b6`…`e4dbe6a` | typecheck·test 479·build·e2e |
| 1 | 복장 시스템 분석 + 장면 내 의상 전환 설계(**코드 변경 없음**) | ✅ 확정 (3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| 2 | 장면 내 수동 의상 전환 구현 | ✅ 확정 | `7dbfaaa` (보정 `ec7bc04`) | typecheck · vitest 42파일/517 · 기존 `.rpy` 21구성 바이트 회귀 0 + 신규 `outfits-line` 정상 · 스크래치 빌드+e2e · Ren'Py lint 에러 0 · save/load·`.npproj.zip` 왕복 |
| 3 | 기존 표정 AI end-to-end audit(**코드 변경 없음**) | ✅ 확정 (3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| 4 | 표정 AI correctness — F1(줄 시점 의상) + F4(표정 설명 identity) | ✅ 확정 (2차 리뷰 반영) | `558f18e` | typecheck · vitest 42파일/532 · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 |
| 5 | 표정 AI 문맥 품질(F2/F3) | ✅ 확정 (v2 리뷰 반영) | `e1c1adf` | typecheck · vitest 42파일/549(532→+17) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 200줄 합성 장면 구조 실측 |
| 6 | Outfit AI audit + 최소 계약(**코드 변경 없음**) | ✅ 확정 (v3.1, 3차 리뷰 반영) | 이 문서 | — (분석 Phase) |
| 7 | Outfit AI transition suggestion 구현 | ✅ 확정 (Plan v4 + 구현 diff 리뷰 반영) | `25c2b5e` | typecheck · vitest 46파일/668(549→+119) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 기존 e2e 전체 통과 · 브라우저 targeted smoke · `.npproj.zip` 실제 왕복 |
| 8 | AI 연출 workflow 통합 audit + 정합성 방어 | ✅ 확정 (Plan v4 + actual diff 리뷰 반영) | `88c4095` | typecheck · vitest 50파일/708(668→+40) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 브라우저 e2e 전체(제안 칩 4경로 + export/import 후속 단계 포함) · `git diff --check` 이상 없음 |
| 9 | Preview↔Export 스프라이트 표시 parity | ✅ 확정 (Plan v6 + GitHub actual commit 리뷰 반영) | `7352ba5` | typecheck · vitest 50파일/729(708→+21) · `.rpy` 22구성 245파일 회귀 0(`dump:rpy` before/after) · 스크래치 outDir 빌드 · 브라우저 e2e 전체 · `git diff --check` 이상 없음 · 미리보기 실기 스모크(콘솔 에러 0) |
| 10 | Outfit AI 실키 품질 audit(**production 변경 없음** — 측정 Phase) | ✅ 확정 (Plan v3 + dry/GT freeze + actual 결과 리뷰 반영) | 이 문서 | dry 18/18(D0~D16) · live Run 1 26요청 · stability Run 2·3 각 13요청 · deployed UI request-contract parity 1요청 · vitest 50파일/729 · typecheck · production/tests/package/lock/`.gitignore` diff 0 |
| 11 | Outfit AI 같은 응답 안의 연쇄 전환 검증 보정(A 는 rollback) | ✅ 확정 | `6da5d77` | typecheck · vitest 50파일/741 · 스크래치 outDir 빌드 · e2e 전체 · `dump:rpy` 22구성 245파일 diff 0 · audit dry D0~D16 · B-only live PRIMARY 26요청 |
| 12 | Outfit AI semantic contract audit + Phase 13 계약 고정(**코드 변경 없음** — 분석/설계 Phase) | ✅ 확정 (Plan v1→최종, GPT 4차 검토 반영) | 이 문서(docs-only) | — (분석 Phase · live 호출 0 · production/tests/audit diff 0) |
| 13 | Outfit AI binary semantic `kind` 계약 구현 + `FIXED_RULE` 보정 | ✅ 확정 (구현 → live PRIMARY → P4 회귀 분석 → 최소 보정 → corrected PRIMARY, GPT 4차 검토 반영) | `81b7f7f` | typecheck · vitest 50파일/762(741→+21) · audit dry D0~D19 21/21 · `dump:rpy` 22구성 245파일 diff 0 · pre-correction live PRIMARY 26요청 · corrected live PRIMARY 26요청(TP/FP/FN 17/1/1 · F1 0.944) |
| 14 | Outfit AI residual/stability audit → **동결 결정**(분석 Phase) | ✅ 확정 (Outcome B) | `4f1f115`(docs-only) | — (분석 Phase · production/tests/프롬프트 변경 0 · live 0) |
| 15 | Expression AI 실사용 audit → **F-1 후보 pool correction** | ✅ 확정 (Plan v1 → GPT 3차 검토 → 구현 → 구현 리뷰) | `e9311f3` | typecheck · vitest 50파일/772(762→+10) · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 outDir 빌드 · live 0 · mutation check 8건 |
| 16 | Expression AI **연속성 소유 범위**(continuity ownership) prompt-contract correction | ✅ 확정 (Plan rev.2 → GPT 검토 → 구현 → 구현 리뷰 PASS) | `931a2cc` | typecheck · vitest 50파일/775(772→+3) · mutation check 8건 · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 outDir 빌드 · **live 6회**(fixture 3 × before/after 1) |
| 17 | Expression AI `P16-F2` **표정 denotation**(시제 축) 좁은 조사 | ✅ 확정 — **Outcome C**(correction 폐기, production 변경 0) (Plan rev.3 → GPT 검토 → live gate → correction → 구현 리뷰 PASS) | *(구현 커밋 없음)* | **live 12회**(fixture 6 × before/after 1) · 임시 correction 한정 검증: typecheck · vitest 50파일/776(775→+1) · mutation check 6건 · `dump:rpy` 22구성 245파일 diff 0 · 스크래치 outDir 빌드 |
| 18 | Expression AI **production baseline 동결**(docs-only finalization) | ✅ 확정 — **Outcome A**(production/test 변경 0) (Plan → GPT 검토 → 정제 반영 → docs 확정) | 이 문서(docs-only) | — (분석·확정 Phase · production/tests/프롬프트 변경 0 · live 0 · 코드 트리 = `931a2cc` 와 동일이라 Phase 16 검증이 그대로 유효) |
| 19 | Novel-Agent 전체 production stabilization / **v1 checkpoint** | ✅ 확정 — **Outcome A**(production/test 변경 0) (Plan rev.2 → GPT 2차 검토 → canonical verification → GPT verification 리뷰 → docs 확정) | 이 문서(docs-only) | typecheck · vitest 50파일/775 · 스크래치 outDir 빌드(vite 5.4.21) · `dump:rpy` 22구성 245파일 · 브라우저 e2e 전체 통과 · Ren'Py 8.5.3 lint error·warning 0 · live 0 |

## Phase 1 확정 설계 — 장면 내 의상 전환 (구현은 Phase 2)

**목표**: 한 장면 안에서 같은 캐릭터가 여러 의상으로 갈아입을 수 있게. 기존 배경 키워드 heuristic·`resolveOutfit`은 **그대로 유지**.

**데이터**: `Line`(dialogue·narration)에 `outfits?: Record<캐릭터, 의상>` — "이 줄부터", 적힌 캐릭터만 변경(`hideSprites`의 줄 단위 override와 같은 관용구). 별도 event 배열/timeline 금지(줄 밖에 두면 index를 저장하게 돼 stable ID가 필요해진다).

**판정 단일 소스**: `outfitFlags(scene, rules, charName): string[]`(`types/project.ts`, `spriteHiddenFlags` 옆, **동기·순수**). 시작값은 기존 `resolveOutfit` 호출. 우선순위 = 줄 override > (후일 줄 AI 값) > `Scene.outfits` > 배경 키워드 규칙 > `기본`. **(장면,캐릭터)당 한 번 계산해 재사용**(줄마다 재fold 금지).

**생성기 emit 순서**(줄마다): ① 숨김 전이(복원 시 **의상은 fold 값**, 표정은 `lastShown.attr`) → ② **의상 동기화 = `revealedOrder` − 이번 줄 speakerIds** → ③ 기존 dialogue speaker 처리(의상값만 fold로).
- ②가 speaker를 제외하는 이유: ③이 어차피 최신 의상으로 show한다. 포함하면 **없던 show가 생겨 회귀 0이 깨진다**. 숨김 해제 줄에서 복원+화자 show가 2회 나가는 **현행 동작은 그대로 둔다**(1회로 줄이려 하지 말 것).
- 상태는 `lastShown: Map<charId, {outfitAttr, attr, wanted}>` **한 곳**. `outfitAttr/attr`=실제 화면, `wanted`=마지막 요청 의상(재발행 판정). **속성 없는 재배치 `show id at vn_char(x)`(`generate.ts:753`)는 이 상태를 건드리지 않는다.**
- 폴백은 기존 `generate.ts:765-771` 순서를 `pickSpriteAttrs(charId, wantedOutfit, currentAttr)`로 **추출만** 해서 ②③이 공유(새 규칙 금지).

**미리보기**: 같은 `outfitFlags`를 `useMemo`로 계산해 `PreviewSprite`에 전달 → 전이 시점이 생성기와 일치.

**파서 라이프사이클**: `#복장`이 장면 맨 앞이면 기존대로 `Scene.outfits`, 도중이면 `pendingOutfits`(캐릭터별 **merge**, overwrite 아님) → 다음 dialogue/narration이 소비하며 `appliedOutfits`에도 반영. **명시 `#S`는 상태를 끊고(폐기), 자동 `splitBeat`는 잇는다**(`startScene` 리셋 **전에** 스냅샷 → 새 장면 시작 의상 = `appliedOutfits` + 미소비 pending). heuristic 결과는 `appliedOutfits`에 담지 않는다.

**merge**: `carryLineMeta`의 dialogue·narration 두 갈래에 `outfits: next.outfits ?? prev.outfits`(whole-record 교체 — 캐릭터별 merge는 대본에서 지운 지정이 좀비로 남는다). 변경 감지는 `tagFieldsChanged` **한 곳만** 확장하되 **`linesIdentical`일 때만** 인덱스별로 `prev.outfits` vs `next.outfits ?? prev.outfits`(= 실제 병합 결과와 동일 semantics) 비교 → 다르면 `affectsGame`. **`lineKey`·`pairLines`는 불변**, `emotion`/`hideSprites` 감지는 이번에 안 건드림.

**known limitations(이번에 고치지 않음, 기록만)**
- ~~Preview는 "기본 의상 + 현재 표정", Export는 "그 의상 + neutral"로 폴백이 **비대칭**(`spriteAssetId` vs `generate.ts:765-771`) — 오늘도 존재하나 줄 단위 전환으로 마주칠 확률이 는다.~~
  → **Phase 2 당시의 known limitation. Phase 9(`7352ba5`)에서 Export 를 canonical 로 두고 통합돼 해결됐다.**
- `pairLines`는 FIFO라 **동일 speaker+text 줄이 여럿이면** 메타가 다른 동일 줄에 붙을 수 있다(emotion·voice·hideSprites가 공유하는 기존 한계).
- 재분석 시 `next.outfits` 부재가 "태그 삭제"인지 "앱 수동값 유지"인지 구분할 **provenance가 없다** — origin 필드/시스템 추가 금지.
- AI 표정 후보가 **장면 단위** 의상으로 계산된다(`aiSelect.ts:71-73` → `availableExpressions`) — 줄 단위 전환과 어긋날 수 있는 cross-system 의존. 별도 검토 대상.
- 음성 파일명이 줄 index를 굳힌다(`voiceBaseName`) — 무관한 선행 부채, 별도 Phase.

**구현 순서**: 타입+`outfitFlags`+테스트 → 생성기(추출→②→①→`wanted`) → 미리보기 → 파서 → merge → (선택) 줄 UI.

**Phase 2 착수 시 준비된 도구**
- `npm run dump:rpy -- <스크래치>/before` 를 **코드 손대기 전에** 한 번 돌려둘 것(21구성 · 결정론적). 작업 후 같은 명령으로 `after` 를 만들어 `diff -r` → 줄 override 를 안 쓴 구성은 **한 구성도 달라지면 안 된다**. 이미 `outfits` 구성(장면 단위 의상 + 배경 키워드 규칙)이 들어 있어 기존 heuristic 보존도 함께 대조된다.
- 빌드 확인은 `npx vite build --outDir <스크래치>/dist --emptyOutDir`(리포 안 `dist/` 는 조용히 죽는다), e2e 는 그 dist 로 `npx vite preview --outDir <스크래치>/dist --port 4173` 후 `npm run test:e2e`.
**필수 검증**: override 없는 프로젝트 **출력 회귀 0**(덤프 `diff -r`) · 장면 내 2회 전환 · 타 화자 줄/narration 줄 전환 · hide 중 전환 후 복원 · 전환+show 같은 줄(show 개수 동일) · `splitBeat` 승계 및 `#S` 비승계 · 미등장 캐릭터 선변경 후 등장 · 의상에 그 표정 없음(문서화된 폴백 재현) · save/load · `.npproj.zip` · 재분석 후 유지 + **줄 의상만 바뀐 재분석에서 승인 리셋** · 미리보기/export 전이 시점 대조 · typecheck/test/빌드.

## Phase 3 확정 — 기존 표정 AI audit 결과 (구현은 Phase 4)

**코드 변경 없음.** 표정 AI는 이미 end-to-end로 동작하는 시스템이며, 아래 결론은 코드 근거는 `파일 · 함수명`으로만 기록한다(줄 번호는 정본으로 안 쓴다 — 리팩터에 바로 어긋난다).

**A — 이미 충분, 재설계하지 않는다**: `Line.emotion`/`Line.emotionAuto` 분리 · 작가/수동 > AI > 휴리스틱 > 기본 우선순위 · `resolveEmotion`/`resolveEmotionDetailed` 단일 판정 · `availableExpressions` 기반 후보 제한 · 응답 파싱/검증 · 🤖 표시 + 수동 override · 프롬프트 수준 표정 연속성(smoothing) 지시 · 증분 대상 선정 · 배치(견적·진행률·재시도·치명 오류 중단·단일 커밋) · save/load · `.npproj.zip` · 협업 · 재분석의 `emotionAuto` 승계와 `emotionLoss` · 미리보기/Ren'Py export 판정 경로. **새 provenance 시스템·review modal·smoothing 엔진·범용 AI framework를 만들지 않는다.**

**B — correctness 2건(Phase 4 필수)**
- **F1 — 줄 시점 의상 ↔ AI 후보 불일치**: 후보가 `resolveOutfit`(장면 단위)로 계산돼 speaker 단위로 장면 전체에 공유되는데(`generators/emotion/aiSelect.ts · collectEmotionTargets`), Phase 2 이후 줄 시점 판정 단일 소스는 `types/project.ts · outfitFlags`다. 한 장면에서 A→B→C 전환이 일어나면 전환 이후 후보가 실제 의상과 어긋난다(그림 없는 표정이 배정돼 플레이스홀더가 게임에 실리거나, 그림 있는 표정이 후보에서 빠진다).
  **계약**: *각 AI target 줄은 자신의 줄 시점 effective outfit에 맞는 후보 집합으로 LLM에 제시되고, 동일 후보 집합으로 응답 검증된다.*
  **제약**: `outfitFlags` 단일 소스 재사용 · 표정 AI 전용 의상 계산기 금지 · `candidatesBySpeaker` 캐시 키 변경만으로 끝난다고 선결정하지 않음(**같은 speaker가 같은 청크 안에서 여러 의상을 쓸 수 있다** — payload도 검증도 speaker 단위 후보를 전제하고 있다) · stable Line ID 등 대형 abstraction 금지.
- **F4 — `expressionNotes` 후보 identity 불일치**: payload는 설명이 있으면 `표정명(설명)`을 후보로 보내고(`aiSelect.ts · buildUserPayload`), 프롬프트는 후보 문자열을 정확히 복사하라고 요구하는데(`aiSelect.ts · SYSTEM_PROMPT`), 파서는 canonical `project.expressions` 이름과만 일치를 인정한다(`aiSelect.ts · parseEmotionResponse`). 모델이 지시를 따를수록 결과가 폐기된다.
  **계약**: *`expressionNotes`가 있어도 prompt/payload와 parser가 동일한 canonical Expression identity를 쓰고, 성공 결과는 `project.expressions` 원문으로 저장되며, 후보 밖 응답은 계속 거부된다.* 구현 방식(설명을 별도 필드로 분리 / 파서에서 canonical 매핑 등)은 Phase 4 Plan에서 최소 변경으로 정한다.

**C — 품질(Phase 5로 이관)**: **F2/F3 — 대사 문맥 커버리지 결손.** target에서 빠진 줄은 LLM 문맥에서도 통째로 사라진다(주인공 대사·지문·합동 대사·이미 배정된 줄과 그 표정 값). `prevContext`도 실제 직전 대사가 아니라 **직전 청크의 마지막 target 3개**이고 장면마다 초기화된다 — **target 줄과 문맥 전용 줄이 분리돼 있지 않다.** 장면 메타데이터(제목·배경·연출·CG·시놉시스) 배관 자체는 이미 있으므로 재구축 대상이 아니다.

**Phase 4 범위 = F1 + F4 correctness만.** 제외: F2/F3 문맥 품질 · 실행 중 취소 UX · 장면 단위 재실행 · `emotionAuto`만 비우는 UI · review modal · suggestion staging · provenance · deterministic smoothing/state machine · stable Line ID · timeline/event 엔진 · 범용 AI 인프라 리팩터 · 표정 AI 전면 재작성 · 의상 AI · 미리보기/export 폴백 통일 · merge 재설계.

**Phase 4 검증**: 같은 장면·**같은 청크**에서 동일 화자가 A→B→C로 갈아입는 케이스로 ① 줄별 effective outfit ② 줄별 허용 후보 ③ 이전 의상 전용 후보 제외 ④ 새 의상 전용 후보 포함 ⑤ 파싱이 줄별 올바른 후보로 검증 — 다섯을 직접 검증한다. F4는 구현 중립으로 ① 설명이 있는 프로젝트에서 정상 배정 성립 ② 저장값이 `project.expressions` 원문과 일치 ③ 후보 밖은 여전히 거부 ④ 설명이 없으면 기존 동작 불변. `npm run dump:rpy` before/after `diff -r` 은 **전체 회귀 안전망**으로 유지하되 **F1 의 직접 증명이 아니다**(위 단위 테스트가 증명한다).

## Phase 4 확정 설계 — 표정 AI correctness (구현 `558f18e`)

**F1 — 후보 키가 화자 하나 → `(화자, 의상)`.** `EmotionItem` 이 자기 줄의 `outfit` 을 들고 다니고,
`EmotionBatch.candidatesByKey` 가 `candidateKey(화자, 의상)`(= `JSON.stringify([speaker, outfit])`,
구분자 문자를 박지 않아 이름에 뭐가 들어와도 안 겹친다) 로 후보를 담는다. 줄 시점 의상은
**`outfitFlags` 단일 소스**를 (장면,캐릭터)당 한 번 계산해 재사용한다(`aiSelect.ts` 안에 의상 fold 를
새로 만들지 않는다 — `resolveOutfit` 직접 호출은 사라졌다). 프롬프트·응답 검증이 **같은 줄의 후보
집합 하나**만 본다: `parseEmotionResponse` 는 `i → item → candidateKey` 로 조회하므로 전환 전 의상에만
있는 표정은 전환 뒤 줄에서 거부된다. "그 줄 의상에 스프라이트가 하나도 없음" 판정도 화자 단위가
아니라 **줄 단위**가 됐다(그 줄만 대상에서 빠진다).
→ Phase 1 의 known limitation "AI 표정 후보가 장면 단위" 는 이걸로 해소됐다.

**F4 — 설명은 metadata, identity 는 canonical 하나.** 후보 라벨에 `표정명(설명)` 으로 결합하던 걸 없애고
`expressionNotes` 를 **별도 payload 키**로 보낸다(그 청크 후보에 실제로 실린 표정의 설명만). 파서·저장은
그대로라 성공값은 항상 `project.expressions` 원문이고 후보 밖 응답은 계속 거부된다 — **괄호 제거·fuzzy
매칭·display 문자열 허용은 넣지 않았다.**

**기존 동작 보존(테스트로 고정)**: 줄 단위 전환도 표정 설명도 없는 프로젝트는 요청 페이로드와 기본
지시문이 **바이트 단위로 예전과 같다.** 조건부는 둘 다 **그 청크에 실제로 필요할 때만** 켜진다 —
`disambiguate` = *같은 화자*가 이 청크에서 2벌 이상(화자마다 한 벌씩이면 꺼짐), `hasNotes` = *이 청크
후보에 실린* 표정 중 설명 보유(프로젝트 전체 유무가 아니다). 후보 그룹 순서는 items 등장 순서가 아니라
**`candidatesByKey` 삽입 순서**를 따른다(items 순서로 새로 만들면 뒤쪽 청크에서 화자 순서가 뒤집힌다).

**손대지 않은 것**: `resolve.ts` 우선순위 사슬 · `availableExpressions`/`effectiveExpressions` 역할 분리 ·
`estimate.ts` · `applyEmotionUpdates` · 저장/zip/협업/merge/미리보기/export · 배치 골격 · stable Line ID 없음.
`Line`/`Project` 에 새 필드가 없다(`outfit` 은 배치 실행 중에만 존재하는 파생값)라 저장 포맷 변화도 없다.

**Phase 5 재정의**: 기존의 smoothing/표정 state-machine 성격 Phase 는 **진행하지 않는다.** 남긴다면 **"표정 AI 문맥 품질 개선"**(F2/F3 전용)으로 축소한다. 위의 구조적 사실은 이미 확정됐으니 다시 재평가하지 말고, **어디까지 문맥을 넣을지(지문 포함 여부·기존 표정 값 포함 여부·창 크기)와 토큰·비용 대비 품질 향상이 있는지**만 실측으로 정한다. deterministic smoothing 은 문맥 개선 뒤에도 필요성이 입증될 때만 다시 본다. 실키 검증이 최후순위 연기 상태라 착수 시점은 보류 가능.

## Phase 5 확정 설계 — 표정 AI 실제 장면 문맥 (구현 `e1c1adf`)

**계약 한 줄(설계 불변식)**: *target 여부는 그 줄이 장면 문맥 source 에 존재하는지를 결정하지 않는다.
**현재 요청의 target 인 줄만** 그 요청의 context 에서 빠진다.* 예전엔 `collectEmotionTargets` 의 `return`
하나가 "AI 결과 대상 아님"과 "프롬프트에서 삭제"를 동시에 결정해, 주인공 대사·지문·합동 대사·이미
배정된 줄·후보 0인 줄이 LLM 입력에서 통째로 사라졌다(F2/F3).

**문맥 source** — `EmotionBatch.scriptLinesByIndex`(런타임 전용, scene line index → 문맥 줄, 삽입 순서 =
시간 순서). 담는 것: 일반 dialogue·**AI target dialogue**·주인공·지문·합동 대사·`emotion` 보유·`emotionAuto`
보유·미등록 화자·그 줄 의상에 후보가 없어 target 이 못 된 dialogue. 빼는 것: `item`/`cg`/`bgm`, 빈 텍스트.
⚠️ **빈 텍스트 필터는 문맥 쪽에만 건다** — 기존 target gate 엔 텍스트 검사가 없어서 거기 끼우면 빈 대사의
target 자격이 조용히 사라진다(회귀).

**문맥 window** — `planEmotionChunks`(실행·견적 **공용 단일 소스**). target 청크 경계(40줄/4000자)는 그대로
두고 요청마다 문맥만 얹는다: ① `i ≤ 이 청크의 마지막 target` 인 대본 줄 ② **이 요청의 target 제외**
③ 시간순 유지 ④ 최대 60줄 ⑤ 최대 2000자 ⑥ 초과분은 **오래된 앞쪽부터** 제거 ⑦ **look-ahead 없음**.
같은 줄이 앞 요청에선 target, 뒤 요청에선 읽기 전용 문맥이 되는 것은 **정상 semantics** 다.

**옛 `prevContext` 는 제거·흡수** — `prevContextLines = chunk.slice(-3)`(직전 target 3줄) 경로는 사라졌고
장면 기반 bounded 문맥 하나로 통합됐다. ⚠️ **"옛 마지막 3줄이 항상 새 문맥에 남는다"고 쓰지 말 것** —
상한이 포화되면 더 최근의 실제 장면 문맥에 밀려 오래된 직전-target 줄이 제거될 수 있다. 기록하는 계약은
**"T7b 같은 all-target 다중 청크 장면에서 후속 요청의 문맥이 v1 설계처럼 구조적으로 0 이 되는 회귀를
막는다"** 수준까지다.

**기존 표정 metadata** — 문맥 줄의 `expr` 은 **실행 시작 전에 저장돼 있던 값**(`emotion || emotionAuto ||
undefined`)뿐이다. 휴리스틱·폴백·`exprSource`·provenance·**직전 청크에서 방금 생성된 미커밋 AI 값**은 넣지
않는다. `expr` 은 연속성 참고용이라 후보에 없을 수도 있고, AI 의 새 답은 언제나 그 줄의 canonical
`candidates` 에서만 나온다.

**유지된 계약**: `parseEmotionResponse` 의 target-only 쓰기 경계(문맥 인덱스 결과는 저장 안 됨) · F1
`(화자, 의상)` candidate identity 와 줄별 검증 · 후보 밖 거부 · F4 canonical identity 와 `expressionNotes`
metadata 분리(fuzzy·`표정명(설명)` 없음) · 증분 target 선정 · 단일 커밋 · **저장 schema 무변경**.

**견적** — 실행과 estimator 가 같은 `planEmotionChunks` 를 쓴다: 요청 수·`targetLines`·`outputTokens`
semantics 불변, 실제 문맥 글자 수만 input 에 반영. 근사 estimator 성격 유지(**tiktoken·새 tokenizer 없음**).
⚠️ `CONTEXT_MAX_CHARS = 2000` 은 prompt/token 전체 상한이 아니라 **estimator 가 세는 요청당 문맥 텍스트
글자 수 상한**이다.

**검증**: typecheck · vitest 42파일/549(532→+17) · `.rpy` 22구성 245파일 회귀 0 · 스크래치 outDir 빌드.
구조 실측(API 없음, 200줄 합성 장면): target 124 · 요청 4 · 요청별 문맥 25/60/60/60 줄, 747/1810/1853/1860 자
· look-ahead 없음 확인 · 총 문맥 6,270자 · `inputTokens` 3,905→8,728 · 예상 비용 $0.001479→$0.002202.
⚠️ **이 실측과 자동 테스트가 증명하는 것은 "구조적으로 필요한 문맥이 실제 요청에 들어간다"까지다** —
표정 선택 품질 향상은 BYO 키 검증이 연기 상태라 증명했다고 쓰지 않는다.

## Phase 6 확정 설계 — Outfit AI 최소 계약 (코드 변경 없음, 구현은 Phase 7)

**역할 분리**: `resolveOutfit` = 장면 시작 baseline 1개 / `outfitFlags` = 그 baseline 에서 출발한 줄별
fold(판정 단일 소스). **Outfit AI 는 둘 다 안 건드리고** fold 의 입력(`Line.outfits`)만 *사람 손을 거쳐*
채운다. 찾는 것은 대본이 **의상 변화를 진술한 자리**뿐 — 매 줄 재분류·heuristic 재판정·새 의상 이름
생성·표정/포즈·hide/show 생성은 범위 밖.

**저장 = P3(transient 제안 → 사용자 apply)**. `Scene`/`Line`/`Project` 에 **신규 persistent 필드 0**.
제안은 `project` 밖 런타임 state(`outfitSuggestions` + `outfitSuggestionRevision`)라 저장·zip·협업에
자동으로 안 실린다. 수락하면 기존 `Line.outfits` 에 **manual 값**으로 기록 → merge·삭제·export 가 전부
Phase 2 경로 그대로(추가 작업 0). provenance 소멸은 **의도**다(승인한 값과 적은 값은 같은 지위).
표정이 `emotionAuto`(dense·줄마다 배정)를 택한 것과 갈리는 이유: 의상은 **sparse + carry**(한 번 틀리면
다음 변화까지 계속 틀린 옷) → 검수 비용은 작고 오답 비용이 크다. **`emotionAuto` 구조를 복제하지 말 것.**

**후보 identity = `characterOutfits(c)` 원문**(canonical exact match, fuzzy·괄호 결합 금지 — F4 교훈).
표정의 `availableExpressions`(업로드된 것만)를 **복사하면 안 된다** — 리스크 구조가 다르다: 스프라이트가
하나도 없는 의상은 이미지가 정의되지 않고 `pickSpriteAttrs` 가 `기본` pool 로 내려가 **플레이스홀더가 안
실린다**(대신 "화면상 옷이 안 바뀐다" → 검수 UI 가 **렌더 시점 현재 asset 으로** 경고. snapshot 금지).
대상 캐릭터 = 그 장면 화자 ∧ 주인공 아님 ∧ 추가 의상 ≥1 — 화자 판정은 **`SceneCard.outfitChars` 와 같은
규칙**(joint 는 `members` 전개) ⇒ **joint member 는 정상 target**(합성 라벨은 아니다. 표정 AI 의
joint gate 를 복사하지 말 것). 의상을 안 쓰는 프로젝트는 배치가 비어 **요청 0회**.

**⚠️ 사후 apply 는 Scene-local 이다** — `splitBeat` 승계는 파서 실행 중 상태(`appliedOutfits`)로만
일어난다. 이미 만들어진 Scene 의 `Line.outfits` 를 고쳐도 **다음 Scene 의 `Scene.outfits`/baseline 은
안 바뀐다**(자동 분할 sibling 포함, 오늘의 장면 카드 👗 편집도 동일). propagation engine 금지.

**⚠️ writable 경계 = first *effective* CG** — `cgActive` 는 `true` 로만 설정돼 첫 활성 이후 복원·의상
동기화·화자 show 가 전부 막힌다 ⇒ 그 뒤 transition 은 **dead write**. 단 cutoff 은 raw `kind:'cg'` 가
아니다: 생성기가 `desc` 를 `scene.cg` 와 매칭할 때만 활성화하므로 **orphan 마커는 경계를 안 끊고**,
레거시 폴백 게이트는 "**`kind:'cg'` 라인이 하나도 없음**"이라 *`scene.cg` 는 있는데 orphan 마커만 있는
장면*은 CG 가 끝까지 안 켜져 **전체 writable** 이다(미리보기 `activeCgIdx` 도 같은 3갈래). **hide 는
반대로 정상 target** — 복원 블록이 그 줄의 fold 값을 쓰므로 새 옷이 실제로 나온다.

**Scene-start**: 별도 Scene-level AI 필드를 만들지 않고 **첫 텍스트 줄의 transition** 으로 표현한다
(첫 dialogue 이전엔 선 스프라이트가 없어 **관찰되는 렌더 결과가 동등** — raw `outfitFlags` 배열 동일성을
주장하는 게 아니다). 단 그 캐릭터의 baseline 이 `scene-manual`/`line-manual` 이면 **첫 줄 제안 금지**
(baseline correction 과 실제 state change 를 deterministic 하게 못 가른다 — v1 은 recall 을 희생).
`rule`/`default` 면 허용. 집행은 요청에 싣는 transient `outfitSource` 로.

**청킹**: 표정의 `planEmotionChunks` 재사용 금지(문제 구조가 다르다 — 배정 vs 탐색). writable 줄에
`chunkItems(…, 60, 3500)` 로 **disjoint scan window** + **lead-in 10줄/500자(쓰기 금지)** + look-ahead 없음.
**미승인 제안을 다음 window 의 current outfit 에 되먹이지 않는다**(Phase 5 의 미커밋 값 금지와 같은 이유,
의상은 오류 전파가 더 크다) — 대가로 같은 변화가 다른 줄에 재제안될 수 있고 그건 검수가 거른다.

**액션 semantics(가장 헷갈리는 지점)** — invalidate 와 apply 는 **다르다**:

| 액션 | 제안 목록 | revision | canonical |
|---|---|---|---|
| `invalidateOutfitSuggestions()` | 전체 clear | +1 | 무변경 |
| `setLineOutfit()`(manual·칩 ✕) | 전체 clear | +1 | 변경 |
| `applyOutfitSuggestion()` | **그 항목만 제거(나머지 유지)** | +1 | 변경 |
| `applySceneOutfitSuggestions()` | 처리분만 제거 | +1(1회) | 변경(**단일 commit**) |
| `ignoreOutfitSuggestion()` | 그 항목만 제거 | 증가 없음 | 무변경 |

apply 가 전체 clear 를 하면 **한 건 적용에 검수 목록이 통째로 날아간다**(P3 UX 붕괴). 그래도 revision 은
올린다 — canonical 이 바뀌었으니 동시 실행 중인 old run 을 폐기해야 한다. `outfitSuggestionRevision` =
*현재 run 의 입력 유효성 세대*이고, 배치는 시작 시 스냅샷 → **최종 commit 직전 비교 → 다르면 run 전체 폐기**.
일괄 적용은 `lineIndex` 오름차순 **working copy 순차 재검증**(앞 적용이 뒤 제안을 no-op 으로 만든다) 후
1회 commit. 개별·일괄 모두 apply 직전 **현재 state 로 9개 재검증**(scene/index/kind/`lineKey`/character/
대상 자격/canonical outfit/manual 선점/no-op).

**invalidation 기준은 slice 가 아니라 "Outfit AI 가 읽는 입력"**: text·hide·Scene 메타/`Scene.outfits`·
manual `Line.outfits`·OutfitRule·캐릭터 name/`isProtagonist`/의상 add·remove·`applyAnalysis`·
`hydrate`/`importProject`/`resetAll`/`applyRemoteProject` → clear. **표정 추가·삭제·설명·입화 업로드/
삭제/교체는 clear 하지 않는다**(candidate identity 는 의상 **이름**뿐이고 renderability 는 렌더 시점 계산).
⚠️ `lineKey` 지문은 **target anchor 방어일 뿐 context 방어가 아니다**(근거 줄이 바뀌어도 통과) — 그래서
input-dependency invalidation 이 반드시 함께 필요하다.

**Expression AI**: 수락 즉시 `collectEmotionTargets`(F1)가 `outfitFlags` 로 새 후보를 본다. 기존
`emotionAuto` 는 **자동으로 안 지운다**(manual 의상 변경도 오늘 똑같은 stale 을 갖는다 — AI 경로만 특별
취급하면 비대칭). `Line.emotion` 자동 삭제는 **절대 금지**.

**Phase 7 범위 밖**: 신규 store slice · stable Line ID · Scene 간 propagation/파서 재실행 · generic
stale·revision·transaction·CG framework · provenance graph · 대형 review modal · cancellation ·
tiktoken · Preview/Export 폴백 비대칭 수정 · merge 재설계 · `Emotion*` generic 개명.

**전체본**(감사 근거·대안 비교·O1~O27 회귀 테스트 매트릭스·known limitations 14종)은 계획 파일
`~/.claude/plans/novel-agent-phase-6-scalable-meadow.md` v3.1. **실키 검증은 하지 않았으므로 탐지 품질
(recall/precision·false positive)은 증명된 바 없다.**

## Phase 7 확정 설계 — Outfit AI transition suggestion (구현 `25c2b5e`)

Phase 6 계약을 그대로 구현했다 — **계약에서 달라진 점 없음.** 신규 `src/generators/outfit/`
(`aiSelect`=수집·계획·요청·파싱 / `apply`=재검증·머지·일괄 fold / `estimate`) + store 액션 7개 + 최소 UI.

**저장(P3)**: `Scene`/`Line`/`Project` 에 **신규 persistent 필드 0**. 제안은 project 밖 런타임 state
(`outfitSuggestions`·`outfitSuggestionRevision`·`outfitProgress`)라 저장·zip·협업에 자동으로 안 실린다
(`.npproj.zip` 실제 왕복으로 확인). 수락하면 기존 `Line.outfits` 에 **manual 값**으로 들어가고
provenance 는 의도적으로 사라진다.

**값의 단일 소스**: `currentOutfit` 은 언제나 `outfitFlags(scene, rules, char)[scanStart]` 다 —
Outfit AI 전용 fold/state machine 을 만들지 않았다. `outfitSource` 는 **설명 라벨만** 파생하며 순서는
`line-manual > scene-manual > rule > default`. ⚠️ `Line.outfits` 를 먼저 보는 이유: `outfitFlags` 는
줄 override 를 **그 줄 index 에 이미 반영**해서(대입 뒤 push), `Scene.outfits` 를 먼저 보면 값과 라벨이
모순된다. **미승인 제안은 다음 window 의 상태에 overlay 하지 않는다.**

**scan/문맥**: writable 줄에 `chunkItems(…, 60, 3500)` 로 disjoint scan window + lead-in 10줄/500자
(읽기 전용) + **look-ahead 없음.** 모든 metadata 를 그 causal window 로 자른다 — `fixed` 는 **scan 범위
안의** manual 값만(미래 값 금지), 마커는 `[leadIn 시작, scan 끝]` 안에서 **실제 일어난** hide/show 전이만.

**⚠️ hide 는 상태와 전이가 다른 개념이다**: `initialHidden` = 첫 포함 줄 **직전**의 canonical 상태,
`markers` = 실제 전이. `spriteHiddenFlags` 가 "그 줄 override 를 적용한 뒤" 값이라 전이 판정은
`flags[i-1]` vs `flags[i]` 여야 한다. request 마다 `prev=false` 로 시작해 마커를 만들면 ① 이미 숨겨진
구간에서 시작한 window 에 **없던 hidden 이 생기고** ② 첫 줄의 실제 `hidden→shown` 이 **통째로 사라진다**
(둘 다 리뷰에서 잡힌 회귀 — O11 이 고정).

**writable 경계**: raw `kind:'cg'` 가 아니라 **first effective CG** 4갈래(`getFirstEffectiveCgIndex`).
orphan 마커는 경계도 아니고 모델에 `event:"cg"` 로 보내지도 않는다. 경계 sentinel 은 **마지막 writable
window 에만**. hide 구간 transition 은 반대로 정상 target 이다.

**액션 semantics(가장 헷갈리는 지점 — `apply ≠ invalidate`)**: `applyOutfitSuggestion` 은 **그 항목만**
제거하고 나머지 제안을 유지한다(전체 clear 는 manual `setLineOutfit` 쪽). `ignore*` 는 revision 을 안
올리고, 일괄 적용은 working scene 순차 재검증 후 **실제 write 가 있을 때만** 1회 커밋 + revision +1.
적용 불가/no-op 제안은 목록에서 **제거하되** canonical·revision 은 안 건드린다(영원히 실패하는 칩 방지).

**재검증**: Phase 6 최소 9검사 + 방어 2검사(현재 effective-CG writable · 첫 텍스트 줄 explicit
`Scene.outfits` 보호). 후자 둘이 없으면 "첫 줄 → 사복" 제안이 `Scene.outfits=교복` 상태에서 8·9 를
**둘 다 통과**한다(리뷰에서 잡힘).

**stale-run guard**: `outfitSuggestionRevision` 은 provenance 가 아니라 **in-flight run 의 stale commit
방지 epoch**. run 시작 스냅샷 ↔ 최종 commit 직전 비교, 다르면 **부분 채택 없이 전체 폐기**. 그래서
canonical 을 바꾸는 경로는 (async 면 **첫 await 이전에**) epoch 을 올려야 한다 — `removeOutfit` 이 그 예다.

**무효화는 "Outfit AI 가 읽는 입력"이 바뀔 때만** — 액션 이름이 아니라 **바뀌는 필드**로 판정한다.
⚠️ `renameBackgroundGroup`/`renameCgGroup` 은 에셋 액션처럼 보이지만 `scene.background`/`scene.cg`
**문자열**을 바꾼다(후자는 CG cutoff 를 움직인다) → 무효화 대상. 반대로 `importCgGroup`(`cgAssetIds` 만)·
스프라이트 업로드·`clearGeneratedAssets`(의상 **이름** 유지) 는 대상이 아니다.

**Expression AI 무수정**: 수락 후 `Line.outfits` → `outfitFlags` → 기존 `collectEmotionTargets` 경로로
후보가 자연히 바뀐다. `emotion`/`emotionAuto` 자동 삭제 없음.

**검증**: typecheck · vitest 46파일/668(549→+119) · `.rpy` 22구성 245파일 회귀 0 · 스크래치 outDir 빌드 ·
기존 e2e 전체 통과 · `.npproj.zip` 실제 왕복(수락값 유지 + 제안 metadata 미포함) · 브라우저 targeted smoke.
**known limitation**: AI 제안 칩의 적용/무시/모두 적용 **브라우저 클릭 경로는 자동 e2e 로 seed 하지 않았고**
(store 통합 테스트 + typecheck/build + diff 리뷰로 검증), **실키 미검증이라 탐지 품질(precision/recall)은
여전히 증명된 바 없다.**

## Phase 8 확정 설계 — AI 연출 workflow 통합 audit + 정합성 방어 (구현 `88c4095`)

**성격**: 새 기능 Phase 가 아니다. 두 AI(표정·의상)를 **한 제작 workflow 로 번갈아 썼을 때**의
semantics 를 감사하고, 확인된 결함만 최소 수정했다. 생성기·파서·`mergeScenes`·`types/project.ts`·
`store/helpers.ts`·협업 프로토콜·schema **전부 무수정** → 기존 프로젝트 `.rpy` 는 바이트 동일.

**감사 결론(변경 불필요로 확인)**: 두 축 모두 사람 값 > AI(단일 판정 함수) · 제안의 canonical 영향 0 ·
`apply ≠ invalidate` · 무효화는 액션 이름이 아니라 **바뀌는 필드** 기준 · effective CG 4갈래 ·
hide 상태/전이 분리 · Scene 경계 비전파 · 견적↔실행 동일 planner · production 로직에 게임별 이름 의존 0.

**C1 — 표정 AI 커밋 직전 stale 재검증**(`store/aiBatchSlice.ts`). 결과는 실행 중에만 사는 ephemeral
값(`Line`/`Scene`/`Project` 신규 필드 0)이고, 커밋 직전 **current project 스냅샷 하나**로
`collectEmotionTargets → planEmotionChunks → buildEmotionRequest` 를 **같은 경로로 다시 돌려** 대조한다:
① 장면·인덱스 ② 여전히 target 인가(= gate 가 manual `emotion`·새 `emotionAuto` 선점을 자동으로 걸러준다)
③ 줄 anchor(speaker/text) ④ `(화자, 의상)` identity ⑤ 선택 표정이 지금도 유효 후보 ⑥ **요청 원문 동일성**.
⚠️ ⑥ 이 없으면 *target 은 한 글자도 안 변했는데 그 요청의 문맥 줄(주인공 대사·지문·기배정 표정)만
바뀐 경우* 가 통째로 새어 나간다. 어긋난 update 만 skip 하고 나머지는 커밋한다 — **의상 AI 의 global
revision epoch 를 복사하지 않는다**(sparse 는 전체 폐기가 싸지만 표정은 dense·유료라 비용이 사용자에게
전가된다). 쓰기 base 는 반드시 `currentProject.scenes`(실행 시작 스냅샷에 쓰면 실행 중 사용자가 한
번역·상태 편집을 되감는다), 검증~`setScenes` 사이에 **`await` 없음**.
⚠️ **보수적 반경(의도)**: target 하나가 사라지거나 후보가 바뀌면 청크가 재구성돼 **같은 요청의 다른
target 도 함께 skip** 된다. `buildSynopsis` 가 project-wide(모든 장면의 제목·배경·첫 3줄, 700자)라
다른 장면 앞부분을 고쳐도 그 run 전체가 skip 될 수 있다 — 오검보다 안전한 쪽을 택했다.
⚠️ 문맥은 `i ≤ 그 청크의 마지막 target` 까지만 실린다(look-ahead 없음) ⇒ ⑥ 은 **target 보다 앞의**
문맥 줄이 바뀔 때 발화한다.

**C2 — 의상 제안 무효화 안내**(`scriptSlice`): 실제 pending 이 있을 때만 1회 알린다. 비어 있으면 완전
침묵(hydrate·원격 반영에서 토스트가 안 튄다). revision epoch semantics 불변. best-effort 라
`importProject`/`resetAll` 처럼 뒤이어 다른 flash 가 나는 경로에선 덮인다.

**C3 — 의상 적용 토스트 정확화**(개별 + 일괄 공통): "표정 배정은 유지된다" → **"이미 배정된 표정은
다시 계산되지 않는다"**. automatic `emotionAuto` invalidation 은 **도입하지 않는다**.

**C4 — AI 배정 표정 초기화**(`clearEmotionAuto`, 사용자가 누를 때만): `emotionAuto` 만 비우고
사람이 정한 `emotion`·`Line.outfits`/`Scene.outfits`·번역·보이스·상태·**의상 제안/revision** 은 전부
보존한다(표정은 Outfit AI 입력이 아니므로 `invalidateOutfitSuggestions` 를 부르지 않는다).
0건이면 확인창·`setScenes`·`autoSave` 전부 없음, 취소하면 canonical 무변경.
→ **역순 작업(표정 먼저 → 의상 변경)의 유일한 복구 경로**다: 표정 AI 는 이미 값이 있는 줄을 영구
스킵하므로 초기화 없이는 재실행이 no-op 이다. **권장 순서는 여전히 Outfit 확정 → Expression AI.**

**테스트 정확도(리뷰에서 보정)**: W2 의 `expect(f(x)).toBe(f(x))` tautology 제거 → **case 별 독립 생성
fixture**로 `manual > emotionAuto > 기본` 이 `.rpy` 속성까지 반영되는지 검증(한 장면의 연속 대사와
`show` 가 1:1 이라고 가정하지 않는다). ScenePlayer 를 render 하는 테스트가 아니므로 "미리보기를
검증한다"고 쓰지 않는다. e2e 는 나가는 요청에서 **유효 `(line, character, outfit)` 을 역산**하고
(effective outfit 은 그 줄까지의 최신 `fixed` 로 계산), 적용 대상과 원복 대상을 **같은 제안 행에서**
추적해 정확히 그 override 만 ✕ 로 지운다(fixture 시작 `baseWorn === 0` 명시).
신규 테스트가 실제 회귀를 잡는지는 **mutation check** 로 확인했다(가드 제거 시 12건 중 10건 실패 ·
생성기가 `emotionAuto` 를 무시하거나 AI 를 작가보다 우선하면 각각 해당 테스트만 실패).

**known limitations(그대로 유지)**: ~~Preview↔Export 스프라이트 폴백 divergence(선행 동작 —
`tests/preview-export-fallback.test.ts` 가 "현재 동작"으로 고정하며 후속 Phase 가 통합하면 그 테스트를
함께 바꾸는 게 정상)~~ → **Phase 8 시점의 known limitation이었고 Phase 9(`7352ba5`)에서 해결됐다**
(그 테스트 파일은 예고대로 parity 검증으로 의미가 바뀌었다) · `pairLines` FIFO · stable Line ID 없음 ·
무시한 제안이 재실행 때 다시 나옴 · **양쪽 AI 실키 precision/recall 미검증**(사용자 승인 없이 paid
호출을 하지 않았다).

## Phase 9 확정 설계 — Preview↔Export 스프라이트 표시 parity (구현 `7352ba5`)

**문제**: 같은 줄에서 미리보기와 게임이 **다른 그림**을 골랐다. 그 의상에 그 표정 그림이 없을 때
미리보기는 `spriteAssetId` 로 *기본 의상의 같은 표정*(옷을 버림)을, 생성기는 `pickSpriteAttrs` 로
*그 의상의 neutral/pool[0]*(표정을 버림)을 썼다.

**Export 가 canonical.** 줄의 의상은 `outfitFlags` 가 정하고 게임이 정본이므로 **미리보기를 출력에
맞췄다**(생성기 semantics 무변경).

**공유 단일 소스**: slot 목록 `spriteSlots` + 폴백 판정 `selectSprite`(둘 다 `generate.ts`, 미리보기가
import). `pickSpriteAttrs` 는 `selectSprite` 의 wrapper 로 남고 **반환 계약 `(outfitAttr, attr)` 무변경**.
helper 를 `types/project.ts` 에 두지 않은 이유는 순환 의존(그 모듈은 런타임 의존 0) — Ren'Py 속성
어휘의 소유자가 `generate.ts` 다.

**폴백 사다리(2단계, 모든 의상 공통 — base 특별취급 없음)**
```
pool  : requested outfit → (비면) '기본' → (비면) 전체
pool 내: wantAttr → 'neutral' → pool[0]
```
⚠️ **판정은 Expression identity 가 아니라 `attr` 존재 기준**이다 — 커스텀 표정 속성이 32비트 FNV-1a
해시라 injective 가 아니어서(D5) 두 판정이 갈리면 기존 게임 출력이 달라진다. 반대로 `'neutral'` 은
커스텀이 항상 `'x'` 접두사를 가져 **`'기본'` 전용이 보장**되고, base pool 에는 리터럴 `'기본'` 슬롯이
항상 있어 **base 재진입은 항상 `'기본'` 에 착지**한다(`pool[0]` 은 추가 의상에서만 도달).

**줄 사이 carry 는 논리 표정이 아니라 *실제 표시된 attr***(= 생성기 `lastShown.attr` 대응).
- **화자 줄**: 논리 표정(`resolveEmotion`)을 **다시 계산**한다.
- **비화자 의상 동기화 · 숨김 복원**: 직전 **표시 attr** 을 이어받아 다시 사다리를 탄다.
  (A 의상에 '기쁨'이 없어 neutral 로 내려갔으면, B 로 갈아입어도 '기쁨'이 아니라 neutral 이다.)
- **숨김 · 유효 CG 구간**: 표시 상태 **동결**.
⚠️ carry 를 논리 표정으로 되돌리면 그 지점에서 다시 갈라진다. `wantedOutfit` 은 emission 전용
게이트라 미리보기가 carry 할 필요가 없다(`pick` 이 멱등).

**기본 의상 slot 의 입력(정책은 호출자에게)**: `spriteSlots(c, planExprs)` 는 정책을 모른다.
- 생성기 = `expressionPlan`(**승인 장면만**, 합동 대사는 멤버 전개)
- 미리보기 = **승인 장면 project-wide ∪ 지금 보고 있는 미승인 장면 하나**
⇒ 미리보기 정책이 `.rpy` 로 샐 수 없다.

**D3 보존(의도)**: 기본 의상 스프라이트가 하나도 없어 생성기 `optedIn` 게이트에서 탈락하는 캐릭터는
**게임에 아예 안 나오므로 parity 대상이 아니다** — 미리보기는 **예전 `spriteAssetId` 경로를 그대로**
쓴다. 게이트는 `spriteSlots` 호출보다 **앞**에 있어야 한다(뒤로 밀면 그 캐릭터가 새로 게임에 등장한다).

**저장·출력**: `Line`/`Scene`/`Project` 신규 필드 0, save/load·`.npproj.zip` 구조 무변경,
`.rpy` **22구성 245파일 0바이트 회귀**.

**테스트**: `tests/preview-export-fallback.test.ts` 가 divergence 기록 → **parity 검증**으로 의미가
바뀌었다(Phase 8 머리주석이 예고한 대로). 기대값을 미리보기로 만들지 않고 **실제 `.rpy` 의 show/hide
를 파싱**해 대조하며, 핵심 케이스는 Export literal·Preview literal·parity 를 셋 다 본다.
신규 테스트는 **mutation check** 로 검출력을 확인했다 — 그 과정에서 T15c/T15d 의 약한 fixture(정작
`scriptExprs` 범위 변이를 못 잡던 것)를 발견해 보정했다.

**known limitations**
- **D3** — Export `optedIn` 비대칭 자체는 미해결(base 스프라이트가 없고 추가 의상만 올린 캐릭터는
  올린 아트가 게임에서 무시된다). 고치면 `show` 가 새로 생겨 회귀 0 이 깨진다.
- ~~**D4** — `availableExpressions` 의 기본 의상 폴백 때문에 AI 표정 후보에 그 의상이 표시하지 못하는
  표정이 실린다(미해결). Phase 9 이후엔 그 강등이 **미리보기에 보이게** 됐을 뿐이다.~~
  → **Phase 9 시점의 known limitation 이었고 Phase 15(`e9311f3`)에서 해결됐다**(후보 쪽을 `selectSprite`
  의 pool 규칙에 맞춤 — 렌더러는 무변경).
- **D5** — 커스텀 **표정** 속성의 32비트 FNV-1a 충돌 가능.
- **D6** — 커스텀 **의상** 속성의 32비트 FNV-1a 충돌 가능(미리보기 칸 조회는 논리 의상 이름으로 해
  엉뚱한 의상을 집지는 않는다).
- D5/D6 충돌 영역에서 **Ren'Py 중복 image 정의의 승자 parity 는 보장 범위 밖**이다. 폴백 attr 선택
  자체는 기존 semantics 를 그대로 보존한다.

## Phase 10 확정 — Outfit AI 실키 품질 audit (production 변경 없음)

**성격**: 구현 Phase 가 아니라 **측정 Phase** 다. Phase 6/7 이 증명한 건 구조까지였고 탐지 품질은
미검증이었다(`PHASES.md` Phase 7 known limitation). 이번엔 **오늘의 production 을 그대로 둔 채**
실제 OpenAI 호출로 품질과 failure mode 를 재고, 재현 가능한 evidence 를 남겼다.
`SYSTEM_PROMPT`·model·temperature·window/chunk·lead-in·parser·validator·suggestion overlay·
Project schema·save/load·`.npproj.zip`·Preview·Ren'Py export **전부 무변경** → 확정 커밋은 docs-only.

**⚠️ Phase 10 성공 = "품질이 충분하다"가 아니다.** "품질과 failure mode 를 frozen benchmark + 실키 +
반복성 + UI parity 로 **측정하고 재현 가능한 근거를 확보했다**"는 뜻이다.

**측정 도구**: `audit.local/`(gitignore `*.local`) 의 로컬 harness 3파일. production 함수
(`collectOutfitTargets`/`planOutfitWindows`/`buildOutfitRequest`/`suggestOutfitsBatch`/`parseOutfitResponse`)를
그대로 호출하고 transport 도 production `chat()` 그대로다 — 요청을 재구현하지 않았다. raw 응답은
`globalThis.fetch` **통과형 스파이**가 `res.clone().text()` 로만 복사한다(headers/Authorization 미접근).
거부 사유 분류기는 **진단 전용**이고 권위는 언제나 `parseOutfitResponse` 다(요청마다 accepted 집합
동일성 assert). 키는 `OPENAI_API_KEY` **process 환경변수만** 사용했다.

**frozen benchmark**(live 전 freeze, Run 1 중 무변경): live case 23(positive 14 · negative 9) +
dry-only 1(N10) · expected event 18 · planner 실측 요청 26.

### PRIMARY — Run 1 only (Run 2/3 을 합산하지 않는다)

```
fetch 26 · retry 0 · ERROR 0
TP 17 · FP 4 · FN 1
precision 0.810 · recall 0.944 · F1 0.872
case PASS 18/23 · FAIL 5/23
```
**신뢰구간을 싣지 않는다** — curated synthetic fixture 는 제작 대본 모집단의 확률표본이 아니다.
Run 2/3 subset 은 Run 1 실패를 oversampling 하므로 합산하면 selection bias 다(산출물도 파일이 분리돼
있고 stability 쪽엔 precision/recall 필드 자체가 없다).

**Safety(negative)**: N1–N9 중 **최종 노출 FP 3건** — N1(purchase/ownership) · N3(future intent) ·
N4(other-character outfit mention). parser-defense 3종은 전부 방어 성공: N7 PASS ·
N8 PASS(raw 를 **F** scene-start 보호가 차단) · N9 PASS(raw `한복` 을 **D** candidate-outside 가 차단).

**P12 추가 FP**: `(60, 민주, 사복)` 은 맞혔지만 `(59, 민주, 사복)` 도 함께 노출됐다(TP 1 · FP 1).
59 는 "사복으로 갈아입고 올게"라는 future intent 이고, 60 이 완료를 확인하는 첫 writable 줄이다.

### Failure Cluster A — dialogue outfit-reference temporal/semantic grounding

반복 FP 4건이 한 묶음이다: N1 구매/소유 · N3 미래 의도 · N4 타 캐릭터 의상 언급 · P12 line 59 미래 의도.
⚠️ **"대사에 의상 이름이 나오면 항상 실패한다"고 과장하지 않는다** — P2(완료된 전환을 대사로 말하는
positive)는 정상 통과했다. 핵심은 **completed actual transition vs purchase/ownership vs future intent
vs other-character reference** 의 구분 실패다.

### Failure Cluster B — same-run chained suggestion 이 G(no-op)에 걸린다

P3 의 정답은 `(1, 민주, 체육복)` `(3, 민주, 사복)` 둘이고, **모델 raw 는 Run 1/2/3 전부 두 전환을 정확히
생성했다**. 그런데 매번 `(3, 민주, 사복)` 이 파서 **G(no-op)** 로 제거됐다. 미승인 제안은 canonical 에
overlay 되지 않으므로(Phase 7 계약) `outfitFlags` 는 장면 내내 `사복` 이고, 그래서 "사복으로 복귀"가
no-op 으로 보인 것이다. 즉 **model omission 이 아니다** — Layer 1 A(model omission)는 Run 1 에서 **0/18**
이었다. 원인은 `same-run suggested transition chain + unaccepted suggestion non-overlay +
canonical-only effective state + G no-op validation` 의 상호작용이다.

### Stability (Run 2/3 — 재현성 전용)

사전 고정 control + Run 1 실패 subset 10 case(P1·P2·P3·P5·P11·P12·N1·N3·N4·N5), 각 run planned 13 /
actual 13 / retry 0. **10/10 case 가 Run 1/2/3 exact predicted tuple set 동일** → stable 10 · variable 0 ·
unstable 0. ⚠️ "모델은 결정적이다"라고 쓰지 않는다 — 정확히는 **동일 frozen fixture 와 현재 production
request contract, 동일 response snapshot/fingerprint 가 관찰된 이번 조건에서 3/3 exact-set 재현**이다.

### deployed UI request-contract parity = **PASS**

`https://novel-agent-pink.vercel.app/` 에 P1 freeze 픽스처(`.npproj.zip`)를 가져와 1회 실행. 협업 기능은
쓰지 않았다(방 생성·입장·room code 없음). 확인창이 `스캔 대상 4줄 · 예상 요청 1회` 로 planner 와 일치했고,
실제 POST 1건(CORS preflight `OPTIONS` 1건은 body 가 없어 비교 대상도 요청 수도 아니다).
endpoint·model·temperature·response_format·max_tokens·messages[0].role/content·messages[1].role/content
**9항목 전부 PASS**, 불일치 field 0 — system 은 문자열 완전 동일, user 는 raw JSON string 직렬화 결과까지
동일했고 조건부 키(`initialHidden`/`context`/`fixed`/`markers`)의 **생략 조건도 일치**했다.
secondary output 이 `(2, 민주, 사복)` 으로 우연히 같았지만 **품질 지표에 합산하지 않는다**(별개 live call).
API key/Authorization/header 는 수집·저장·출력하지 않았다.

### Telemetry · 비용

| | prompt | completion | cached | usage-based estimate |
|---|---|---|---|---|
| Run 1 | 18,439 | 770 | **0** | 약 $0.0032 |
| Run 2 | 11,775 | 393 | **5,632** | 약 $0.0020 |
| Run 3 | 11,775 | 391 | **5,632** | 약 $0.0020 |

`responseModel` 은 Run 1/2/3 **52요청 전부** `gpt-4o-mini-2024-07-18`, `system_fingerprint` 는
`fp_830d456649`, `finish_reason` 은 전부 `stop`(잘린 응답 0). `cached_tokens` 는 Run 1 에서 0 이었고
Run 2/3 에서는 **각각 3개 요청**(각 run 합계 5,632 — 즉 stability 두 run 합쳐 non-zero cached request
6건)에서만 관측됐다. 전부 prompt 1,857~2,146 토큰인 긴 요청이다.
⚠️ harness 의 추정은 `prompt_tokens` 전체에 정가를 곱하므로 **cached 할인을 반영하지 않는 보수적 상한**이며,
**`actual billed cost` 가 아니다**. Phase 10 전체 POST 53회(Run1 26 · Run2 13 · Run3 13 · parity 1),
합계 **약 $0.0075 usage-based estimate**.

### dry / structural evidence (유료 호출 0)

`D0~D16` **18/18 PASS** — live no-key fail-closed · `--dry` no-key 실행 가능 · planner 요청 수 ·
P11 multi-window · P12 lead-in 경계 · CG cutoff · 분류기 self-test · 분류기↔파서 acceptance drift guard ·
malformed JSON · HTTP failure · **H 발생 시 PASS 금지(ERROR)** · multi-window union/dedupe · index
invariant · batch 생성 · `estimateOutfitCost.requests === planOutfitWindows` · asset 참조 0 ·
repeat subset 사전 고정. dry-only **N10** 으로 **effective CG cutoff 이후 줄이 request payload 에 실리지
않음**을 확인했다(모델이 볼 수조차 없어 억제력 측정 대상이 아니다).

### ⚠️ synthetic-only limitation

이번 측정은 **curated synthetic fixture 한정**이다. 실제 사용자의 제작 프로젝트·실제 VN 대본은 품질
benchmark 대상으로 **측정하지 않았다**(디스크에 실대본이 없었고 사용자가 synthetic 만으로 확정).
따라서 `precision 0.810 / recall 0.944 / F1 0.872` 를 **"실제 제작 대본의 Outfit AI 품질"이라고 쓰면
안 된다** — 정확한 표현은 **"Phase 10 curated synthetic live benchmark 의 Run 1 결과"** 다.

### 결론

production request path 는 dry structural audit + live API benchmark + deployed UI parity 까지 검증됐고,
대부분의 positive 시나리오는 정상 처리했다. 다만 **사용자에게 노출되는 semantic FP 가 반복 발견**됐고,
**P3 에서는 모델이 정확히 생성한 same-run 복귀 전환이 production no-op 검증에 의해 제거되는 구조적
limitation** 이 확인됐다. 두 cluster 모두 이번 측정 조건에서 3/3 재현됐다. **Phase 10 은 production 을
고치지 않고 evidence 를 Phase 11 입력으로 넘긴다** — Phase 10 자체는 *quality audit/measurement 완료* 로 확정.

**산출물**(gitignore `audit.local/out/`, 원문은 tracked docs 에 복사하지 않는다):
`…-manifest.md`(frozen GT) · `…-dry.md` · `…-run1.{md,json}`(PRIMARY) ·
`…-stability.{md,json}` ×2 · `…-parity.md` · `parity-reference-P1.md`

## Phase 11 확정 — Outfit AI 같은 응답 안의 연쇄 전환 검증 보정 (구현 `6da5d77`)

**성격**: Phase 10 이 실측한 failure 2종을 audit 해 **결정론적 파서 결함(B)만 채택**하고,
**프롬프트 semantic 보강(A)은 실험 후 production 에서 전부 rollback** 했다. 최종 production 상태는
**Phase 10 `BASE_SYSTEM_PROMPT` + Phase 11 B 파서 수정**이다(프롬프트는 origin/main 과 바이트 동일).

### B — 채택 (범위를 과장하지 말 것)

정확한 범위는 **same-response / same-window parser-local chronology correction** 이다. "same-run chain
전체 해결"이 아니다. 하는 일은 하나뿐: **같은 `parseOutfitResponse` 호출(= 같은 요청·같은 scan window)
안에서 앞선 valid transition 을 함수-local 가정 연대기로만 고려해 뒤 항목의 `G(no-op)` 를 판정한다.**

문제의 구조: 미승인 제안은 canonical 에 overlay 되지 않으므로(Phase 7 계약) `outfitFlags` 는 장면 내내
그대로고, 그래서 `A→B→A` 의 마지막 복귀가 "이미 그 옷"으로 보여 파서가 지웠다. **apply 쪽
`foldSceneSuggestions` 는 원래 working scene 순차 재검증을 하고 있었다** — parse 쪽만 원본 canonical
스냅샷에 독립 판정하던 **비대칭**이 원인이었다(P5 = 중간 전환이 manual 이라 정상 통과, P3 = 같은 응답의
제안이라 실패. 두 케이스의 차이가 곧 버그의 정의였다).

**production 변경은 `src/generators/outfit/aiSelect.ts` 한 파일**(`parseOutfitResponse` + 주석 2곳):
- `parsedTransitionByChar` = 그 호출 안에서만 사는 **가정 연대기**(캐릭터당 최신 1건). canonical 상태가
  아니고 **사용자 수락을 뜻하지도 않는다** — Project·Scene/Line·store·다음 요청 어디에도 안 나간다.
- **검증 순서와 반환 순서는 다른 축**이다: 판정만 `i` 오름차순(같은 `i` 는 모델 출력 순서 — 중복
  semantics 보존), **반환 배열은 예전과 동일한 모델 출력 순서**(store 가 그대로 검수 목록에 넣는다).
- no-op 비교 기준은 **기본이 언제나 canonical `outfitFlags`**(값의 단일 소스 불변). 가정은 그 사이에
  **canonical manual 변경점이 없을 때만** 우선하고, manual 은 **앞선 가정 하나만** 끊는다(그 뒤 새로
  통과한 전환은 다시 전제가 된다).
- **모든 게이트(B/C/C2/D/E/F/G)를 통과한 항목만** 가정을 전진시킨다 — 거부·중복 항목은 영향 0.
- 망가진 row(`null`·primitive·비객체·비숫자 `i`)는 **정렬 전에 객체 여부를 확인**해 예전처럼 조용히
  무시한다(정렬 때문에 응답 하나가 통째로 예외가 되면 안 된다).
- `G` 자체 유지 · cross-window 비전파 유지 · 파서 시그니처 무변경 · schema/store/apply/UI 무변경.

**tests**: `tests/outfit-ai.test.ts`(연쇄 복원 · 역순 raw · 선행 없는 canonical no-op 유지 · manual
경계 · manual 뒤 새 전제 · 캐릭터별 독립 · 거부/중복 row 의 state 미오염 · cross-window 비전파 ·
반환 순서 보존 · malformed row 방어) + `tests/outfit-store.test.ts`(연쇄 2건이 `outfitSuggestions`
까지 도달하고 canonical 은 무변경). 개별 적용·일괄 fold·ignore·stale 은 기존 O20/O26/O27/O24 가
이미 지키므로 복제하지 않았다.

**무료 검증**(최종 B-only 트리): typecheck PASS · vitest **50파일 741** PASS · 스크래치 outDir 빌드 PASS ·
e2e 전체 PASS · `dump:rpy` **22구성 245파일 diff 0** · audit dry **D0~D16 PASS** · classifier↔parser
drift guard PASS.

### B-only live PRIMARY (Phase 10 수치를 덮어쓰지 않는다)

같은 frozen benchmark(23 case · expected 18 · 26요청), 같은 모델(`gpt-4o-mini-2024-07-18`,
fingerprint `fp_830d456649`), **Phase 10 프롬프트 그대로 + B 파서만**:

```
TP 18 · FP 4 · FN 0 · precision 0.818 · recall 1.000 · F1 0.900 · case pass 19/23
(prompt 18,439 tok · completion 770 tok — Phase 10 Run 1 과 동일, 약 $0.0032)
```

⚠️ **curated synthetic fixture 한정**이며 실제 제작 대본 품질이 아니다.

**exact delta — 이쪽이 정본이다**(aggregate 아님):
- `P3 (3, 민주, 사복)`: **FN → TP**. 23 case 중 production predicted tuple set 이 Phase 10 과 달라진
  case 는 **P3 하나뿐**이었다.
- 26요청 전체에서 legacy canonical-only `G` 와 판정이 갈린 accepted row 는 **정확히 1건**(위 P3 tuple)
  이고 그건 GT expected 다 ⇒ **B-sensitive parser-exposed FP = 0**.
- 기존 TP → 새 FN **0** · structural defense regression **0**(live rejection 은 N8 `F` · N9 `D` 로
  Phase 10 과 동일, Phase 10 의 `P3 w0 G` 만 의도대로 사라졌다).

### A — 실험했고 production 에는 채택하지 않았다 (같은 튜닝을 반복하지 말 것)

`BASE_SYSTEM_PROMPT` 에 completed vs 미래 의도 · 구매/소유 · 현재 상태 언급 · 타 캐릭터 의상 화제 ·
행위자 grounding · 예고와 완료의 자리를 원리로 적어 넣고 **실키로 재봤다**(합성 fixture 한정).

- 1차: `N1·N3·N4·P12-59` FP 4건이 **raw 단계에서** 사라졌고 P2·P12-60 은 유지됐다. 그러나 기존 TP
  `P10 (1, 지수, 사복)` 이 **raw model-level FN** 이 됐다(한 지문이 두 사람의 전환을 말하는 joint).
- 2차(actor 문장을 복수 주체까지 포함하도록 교체): P10 두 member 복구 · A target FP 0. 대신
  `P4 (3, 민주, 사복)` 이 새 model-level FN 이 됐다(모델이 이미 manual 로 확정된 line 1 만 재보고).
- 같은 프롬프트로 **3-run stability**: `P4` FN **3/3**(raw 문자열까지 동일) · `P12-59` future-intent
  FP **2/3 재발**(Run 1 만 없음) · 반면 `N1/N3/N4` FP 0/3 · `P2`·`P12-60`·`P10` 두 member ·`P3` 두
  tuple 은 3/3 TP.

**결론**: prompt-only semantic guard 는 일부 FP 축을 개선했지만 **P12 future-intent 가 불안정하게
재발했고 P4 에서 stable model omission regression 이 발생**했다. 합성 fixture 에 맞춘 추가 prompt
tuning 을 계속하지 않고 **production 에서는 전부 rollback** 했다. ⚠️ *직접 원인은 확정하지 않았다* —
특정 문장이 P4 를 깨뜨렸다고 단정하지 말고, prompt 접근이 영구히 틀렸다고도 쓰지 말 것. semantic FP 를
다시 다룬다면 이 evidence 를 입력으로 **새 Plan 부터** 검토한다.

### known limitation (숨기지 말 것)

production 에는 Phase 10 의 **semantic FP class 가 그대로 남아 있다** — 구매/소유 · 미래 의도 ·
타 캐릭터 의상 언급. B-only live 에서도 Phase 10 과 **동일한 FP 4건**(`N1`·`N3`·`N4`·`P12-59`)이
재현됐다. Phase 11 의 성공을 "semantic FP 해결"로 쓰면 안 된다.
또 harness 의 `omissionA` 진단은 같은 줄에 여러 캐릭터가 있을 때 member 별 누락을 충분히 표현하지
못했다(P10 regression 을 A=0/18 로 셌다) — 다만 **exact tuple GT 비교가 그 regression 을 정확히
검출**했으므로 metric 은 재설계하지 않았다.

## Phase 12 확정 — Outfit AI semantic contract audit + Phase 13 계약 고정 (코드 변경 없음)

**성격**: 구현 Phase 가 아니라 **분석/설계 Phase** 다. production 변경 **0**, live 호출 **0**, 확정 커밋은
docs-only. Phase 12 가 한 일은 *"Outfit AI 의 semantic FP 를 다시 다루기 전에 production 요청·응답·파서 계약을
audit 하고, Phase 11 실패 evidence 를 입력으로 **Phase 13 이 구현할 최소 semantic contract 를 확정**한 것"* 이다.
⚠️ **Phase 12 가 semantic FP 를 production 에서 해결한 게 아니다** — 상태는 `Phase 12 = contract audit + design
finalized` / `Phase 13 = implementation + deterministic verification + approved live measurement`.

### root-cause audit 결과 (Phase 10 raw 로 재검증)

현재 known semantic FP cases: `N1`(purchase/ownership) · `N3`(future intent) · `N4`(other-character outfit
topic/reference) · `P12-59`(future intent + **window-boundary amplification**). 네 건 모두 현재 파서의
`B/C/C2/D/E/F/G` structural validation 에서 **구조적으로 유효**하다(같은 run 에서 N8 은 `F`, N9 는 `D` 로
정상 차단됐다 — 파서가 약한 게 아니라 거절 근거가 데이터에 없다).

> **현재 known semantic FP cases 를 recall regression 없이 거를 추가적인 언어 독립 parser-only deterministic
> invariant 를 이번 audit 에서는 찾지 못했다.**

⚠️ "parser-only invariant 는 더 이상 존재하지 않는다" 또는 "수학적으로 파서에서 더 할 게 없다"고 쓰지 말 것 —
새 evidence 가 나오면 다른 structural invariant 가 발견될 여지는 열어 둔다.

**P12 구조 사실**(문서화 가치 있음): `P12` 는 window 0 이 `scan i=0..59`(60줄 포화), window 1 이
`context 50..59 · scan 60..69` 다. 59("갈아입고 올게")는 **window 0 scan 의 마지막 줄**이고 완료를 확인하는 60 은
look-ahead 금지 때문에 그 요청에 **없다** — 두 행은 서로 다른 응답이라 Phase 11 B(same-response chronology)로는
관계지을 수 없다(의도). 게다가 둘이 같이 남으면 `foldSceneSuggestions` 가 `lineIndex` 오름차순이라 **59(FP)를 먼저
적용하고 60(TP)은 no-op 으로 skip** 한다 — FP 가 TP 자리를 뺏는다.

**raw evidence 표현(정확히)**: *일부* semantic FP 에서는 raw `reason` 에 semantic cue 가 이미 노출됐다
(N1 은 구매/소유를 직접 드러냈고 N3 는 future-intent 표현을 인용). ⚠️ 반면 **N4 는 "체육복으로 바뀌었음"으로
상황을 잘못 해석**했다. 따라서 "모델은 의미를 다 알고 있었는데 표현할 자리가 없었다"고 일반화하지 말 것 —
근거가 지지하는 결론은 **explicit semantic field 가 있으면 최소 일부 case 에서 모델 내부 구분이 raw output 으로
외부화될 가능성이 있다**는 수준이다.

### Phase 11 A 반복 금지 (같은 튜닝을 되풀이하지 않는다)

Phase 11 A(prompt-only semantic guard)는 일부 FP 를 줄였지만 **P10 joint member omission · P4 stable raw
omission · P12 future-intent instability** 를 만들어 **production 에서 전부 rollback** 됐다(프롬프트는 Phase 10
상태). Phase 13 은 **suppression 지향 prompt tuning 을 반복하지 않는다.** ⚠️ 단 "prompt 접근은 영원히 금지"라고
쓰지 말 것 — Phase 13 도 프롬프트를 바꾸지만 **목적이 다르다**(억제가 아니라 라벨 외부화).

### Phase 13 구현 계약 (Phase 12 확정 — Phase 13 에서 재설계 금지)

**① wire field(binary)** — `kind`, 허용값은 **정확히 `"transition"` | `"non_transition"` 둘**. negative
taxonomy 를 production enum 으로 늘리지 않는다(모든 negative 를 파서가 동일하게 reject 하면 추가 production
invariant 가 0이고 unknown 표면만 커진다. 진단 granularity 는 기존 `reason` + harness raw 저장으로 충분).

**② `changes[]` 의 semantic widening — semantic-only** 다.
```
LLM wire changes[]              = semantic candidate envelope (transition / non_transition 모두 가능)
parseOutfitResponse() 반환      = structural gates + semantic S gate 를 모두 통과한 실제 transition 제안만
OutfitSuggestion / store / UI   = 기존과 동일(kind·non_transition 행은 도달하지 않는다)
canonical Line.outfits          = 사용자 accept 이후에만 변경
```
⚠️ **structural universe 는 넓히지 않는다**: scan 밖 line · 후보 아닌 character · 후보 아닌 outfit · fuzzy/신규
outfit · fixed/manual 무시 · canonical no-op · effective CG 이후 · 주인공 등 기존 제외 대상. 즉 *candidate-envelope
widening 은 semantic classification boundary 만 넓히고 existing structural eligibility 와 canonical/manual/no-op
계약은 유지한다.*

**③ parser semantic gate `S` 의 위치**
```
B → C → C2 → D → E → F → G → S → seen.add → parsedTransitionByChar.set
```
`kind:"non_transition"` → `S` reject · `kind:"transition"` → 기존 structural gates 기준. **S-rejected 행은
`seen` 을 consume 하지 않고 chronology 를 advance 하지 않는다**(같은 `(i, character)` 의 뒤 행은 다시 심사 가능).
Phase 11 same-response hypothetical chronology 유지 · 반환 순서 = 모델 출력 순서 · cross-window 미승인 제안
전파 없음. ⚠️ **`S` 를 반환 직전 filter 로 구현하지 않는다**(게이트 루프 밖으로 빼면 거부된 행이 뒤 항목의 `G`
전제를 바꾼다).

**④ fail-open 정책과 보장 범위**
```
known "transition"   → 기존 structural validation 후 accept 가능
known "non_transition" → S reject
kind missing / unknown string / wrong type → legacy accept
whole JSON malformed → 기존처럼 throw
```
> 동일한 raw candidate row 가 파서에 들어왔다는 조건에서, missing / unknown / wrong-type `kind` 는 Phase 11
> parser 보다 **추가 semantic rejection 을 만들지 않는다.**

이것은 **parser-layer conditional guarantee** 이지 **end-to-end model recall guarantee 가 아니다** —
프롬프트가 바뀌므로 모델이 true candidate 자체를 생략하는 **raw omission FN 은 여전히 가능**하고 fail-open 은
그 경로를 막지 못한다.

**⑤ normalization / parsing 3축(섞지 말 것)**
| 축 | 규칙 |
|---|---|
| `character`/`outfit` | 기존 `normalizeOutfitLabel` semantics — NFKC + trim + whitespace, **lowercase 없음**, canonical identity **exact**, fuzzy·신규 이름 채택 금지(`"Casual"` 과 `"casual"` 을 임의로 같다고 보지 않는다) |
| `kind` | **wire-token normalization** — NFKC + trim + whitespace + **lowercase** 후 두 토큰과 exact. `completed_transition`·`transition-ish`·`non-transition`·`not_transition` 은 **unknown → fail-open**(semantic fuzzy match 금지) |
| `i` | **production parser 와 동일한 numeric coercion** — `typeof r.i === 'number' ? r.i : Number(r.i)` 후 `Number.isFinite` + scan membership. `{"i":"60"}` 은 60 으로 해석된다. `"abc"`·`NaN`·`Infinity` 는 기존 `B` 계열에서 거부 |

파서·audit harness·raw candidate recall 진단이 **모두 같은 해석**을 쓴다. harness 는 세 축을 **각각 mirror**
하고 **하나의 generic normalization/parsing abstraction 으로 합치지 않는다**(기존 production helper 재사용은 가능).

**⑥ prompt rewrite 경계** — candidate-envelope 계약과 직접 충돌하는 **transition-only reporting 문장은
교체/재작성**한다(단순 append 금지 — "실제 transition 만 넣어라"와 "non_transition 도 내라"를 동시에 남기지 않는다).
반대로 **structural invariant 대응 지시는 behavioral 의미를 유지**한다: fixed/manual authoritative ·
scene-start manual 보호 · canonical no-op 회피 · candidate character 제한 · exact candidate outfit 제한 ·
writable scan 제한 · `context` 인덱스에 결과 금지 · `markers`/`initialHidden` semantics. `change` → `candidate`
같은 **표현 정합화만 허용**하고, **"파서가 막으니 structurally invalid row 도 다 내라"는 방향은 금지**다.

**⑦ Phase 13 prompt 가 표현할 semantics(고정)**: ①`changes[]` = semantic candidate rows ②candidate 마다 `kind`
③값은 두 개 ④실제 effective outfit transition = `transition` ⑤아니면 `non_transition` ⑥purchase/ownership ·
⑦future intent · ⑧other-character outfit topic/reference 는 `non_transition` 예시 ⑨true completed transition 유지
⑩multi-subject 는 **member 별 행 유지** ⑪fixed/manual 이후의 실제 completed return transition 유지
⑫불확실성을 이유로 true candidate 자체를 억제하는 competing instruction 금지 ⑬전부 existing structural
eligibility 안에서. **영어 문장 선택만 Phase 13 작업이고 semantics 는 바꾸지 않는다.**

**⑧ 저장·전파 없음** — `kind` 는 **parser-local transient wire metadata** 다. `OutfitChange`·`OutfitSuggestion`·
store·UI·Project schema·save/load·`.npproj.zip`·협업·Ren'Py export **전부 무변경**, cross-window 전달 없음.

### Phase 13 측정 계약 (benchmark)

**raw candidate recall — owner-window 기준**: expected tuple `(i, character, outfit)` 의 owner 는 **그 `i` 를
writable scan 으로 소유하는 유일한 planned window**(disjoint scan 계약상 정확히 하나). **owner window 의 raw
`changes[]`** 에 있을 때만 `Raw emitted = YES` 이고, 다른 window(read-only context 를 보고 낸 것 포함)에서 나온
동일 tuple 은 **`out-of-owner-window emission` 진단으로만** 기록하며 raw recall 을 만족시키지 않는다. tuple 비교는
위 3축(`i` coercion / identity / kind)을 그대로 쓴다.

**FN attribution(중복 없이 first disappearance stage 기준 단일 분류)**
| 축 | 정의 |
|---|---|
| A. raw omission FN | expected tuple 이 **owner window raw 에 없음**(다른 window 에 잘못 나왔어도 A 다) |
| B. semantic-label FN | owner raw 에 있으나 `kind == non_transition` → `S` reject (새 계약 고유의 recall regression) |
| C. structural/parser FN | owner raw 에 있으나 `S` 가 아닌 기존 `B~G` 가 제거 (기존 parser/harness regression 신호) |
| final FN | end-to-end expected tuple 미생존 |

**필수 진단**: `Expected tuples total · Raw expected tuples emitted · Raw omission FN · Raw candidate recall ·
Out-of-owner-window emission · Semantic-label FN · Structural/parser FN · Final TP/FP/FN · Precision · Recall · F1`.
positive protection = `P2` · `P3`(각 tuple) · `P4` · `P10`(각 member) · `P12-60`, known semantic FP = `N1`·`N3`·`N4`·`P12-59`.
추가로 **candidate-envelope expansion FP**(Phase 10 raw 에 없던 신규 tuple 이 envelope 때문에 생겼고 그중
`transition` 으로 최종 accept 된 신규 FP)를 따로 센다.

**live 규약**: 구현 + 무료 검증(typecheck·vitest·스크래치 빌드·`dump:rpy` diff 0·audit dry) 이후,
**사용자 사전 승인 전 live 호출 0**. 승인 요청 시 최소 `model gpt-4o-mini · requests 26 · 예상 비용` 제시.
PRIMARY 는 **Run 1 only**(23 case · expected 18 · 26요청), stability(Run 2/3)는 PRIMARY 를 본 뒤 필요할 때만.
**Phase 10 산출물을 덮어쓰지 않는다.** ⚠️ known limitation: `audit.local/out/` 에는 **Phase 10 산출물만 남아 있고
Phase 11 B-only PRIMARY·A 실험의 raw/JSON 은 디스크에 없다** — tuple-level 대조 정본은 Phase 10 `run1.json` 이고
Phase 11 수치는 **문서 인용 대조**로만 쓴다.

### Phase 13 out of scope (이번 계약에 넣지 않는다)

2-pass classifier · Structured Outputs migration(`json_object` 유지) · semantic regex/blacklist · look-ahead ·
cross-window 미승인 제안 전파 · ignored suggestion persistence · Project/save schema 재설계 · generic AI framework ·
Expression AI 실키 · TTS · D3/D4/D5/D6 · stable Line ID · Preview/Export 재설계 · Phase 11 B refactor.
⚠️ `P12-59` 의 window-boundary 축(read-only look-ahead)은 **N1/N3/N4 에 효과가 없고** 동시 투입하면 live delta
attribution 이 불가능해져 **이번 계약과 함께 고치지 않는다**(후속 Phase 후보).

**전체본**(후보 비교·기각 사유·테스트 매트릭스·rollback 기준)은 계획 파일
`~/.claude/plans/novel-agent-phase-12-dazzling-kettle.md` 최종본.

## Phase 13 확정 — Outfit AI binary semantic `kind` 계약 (구현 `81b7f7f`)

**성격**: Phase 12 가 확정한 계약의 **구현 Phase**. 프롬프트가 semantic 판단을 억제(Phase 11 A)하는 대신
**candidate 생성과 semantic 분류를 같은 응답 안에서 분리**하고, 파서가 라벨 하나만 보고 거른다.

### 구현 계약 (깨지 말 것)

```
LLM wire changes[]            = semantic candidate envelope (transition / non_transition 둘 다 옴)
kind                          = "transition" | "non_transition" (binary, negative taxonomy 없음)
parseOutfitResponse() 반환    = B/C/C2/D/E/F/G/S 를 모두 통과한 실제 transition 제안만
OutfitSuggestion/store/UI/save = 기존 schema 그대로(= kind 는 여기 도달하지 않는다)
```

**S 게이트 위치가 계약이다**: `B → C → C2 → D → E → F → G → S → seen.add → chronology update`.
S 거부 행은 `seen` 도 hypothetical chronology 도 건드리지 않는다(같은 `(i,character)` 의 뒤 행 재심사 가능).
**반환 직전 filter 로 옮기지 말 것** — 거부 행이 뒤 항목의 `G(no-op)` 전제를 바꾼다.

**fail-open**: `transition` → 기존 structural validation · `non_transition` → S reject ·
**missing / unknown 문자열 / wrong type → legacy accept**(모르는 값을 `non_transition` 으로 넘겨짚지 않는다) ·
JSON 자체 malformed → 기존대로 throw. ⚠️ 이건 **같은 raw row 에 대한 parser-layer 보장**이지 end-to-end
recall 보장이 아니다(프롬프트가 바뀌므로 raw omission 은 여전히 가능 — 실제로 아래 P3/P4 에서 관측됐다).

**정규화 3축을 섞지 말 것**: `character/outfit` = NFKC+trim+공백, **lowercase 없음**, fuzzy 없음 /
`kind` = NFKC+trim+공백+**lowercase** 후 두 토큰 exact / `i` = 기존 numeric coercion + finite + scan membership.

**`FIXED_RULE` 보정(P4 회귀 대응)**: 작가가 적어둔 fixed 행은 **실제 전환이어도 authoritative context 라
AI candidate 가 아니며**(`kind` 재분류가 아니라 candidate universe 밖), 그 뒤의 **later completed transition 은
window 시작 의상으로의 복귀 여부와 무관하게 계속 심사**한다.

### 검증

결정론(무료): typecheck · vitest 50파일/762 · audit dry `D0~D19` 21/21 · `dump:rpy` 22구성 245파일 **diff 0** ·
`git diff --check`. **corrected LIVE PRIMARY**(23 case · expected 18 · 26 planned/26 actual · retry 0 · H 0 · VALID):

```
Raw expected emitted 17/18 · Raw candidate recall 94.4%
A(raw omission) 1 · B(semantic-label) 0 · C(structural) 0
TP/FP/FN 17/1/1 · precision 0.944 · recall 0.944 · F1 0.944 · case pass 21/23
kind compliance 21/21 (transition 20 · non_transition 1 · missing/unknown/wrong-type 0)
```
Phase 10 대비 **FP 4→1 · F1 0.872→0.944**. ⚠️ 합성 curated fixture 한정 수치다.

### 남은 것과 정확한 해석 (과장 금지)

- **P4**: pre-correction 에서 fixed `i=1` 을 후보로 재출력(→ `E` 거부)하고 정답 `i=3` 이 raw 에서 누락됐다.
  `FIXED_RULE` 보정 후 corrected PRIMARY 에서 **오출력 소멸 + `i=3` emitted → accepted → TP**.
  ⇒ *"의도한 방향으로 관측됐다"* 수준이고 **deterministic guarantee 가 아니다**.
- **P5**: 복귀 보호 유지(TP) — 보정이 기존 계약을 깨지 않았다.
- **P3**: corrected PRIMARY 의 **유일한 FN**(`(3,민주,사복)` raw omission). ⚠️ 두 run 사이 **P3 의
  system/user 프롬프트는 byte-identical** 이었다(프롬프트가 달라진 요청은 P4/P5 둘뿐). 즉 이 회귀는
  이번 보정으로 설명되지 않으며, **같은 모델·같은 fingerprint·같은 입력에서도 single-run raw emission 이
  ±1 expected-event 수준으로 흔들린다**는 evidence다. "temperature 0 이면 deterministic" 이라고 쓰지 말 것.
- **N3**: `raw candidate 출력 → kind=non_transition → S reject → FP 아님`. **Phase 13 메커니즘이 실제로
  관측된 유일한 case** 다.
- **N1 · N4**: raw candidate 자체가 **출력되지 않아** FP 가 사라졌다. **S 가 해결한 것이 아니다** —
  프롬프트 변경에 따른 emission 변화이며, envelope 이 Phase 10 보다 **좁아졌다**(raw tuple 24→21).
- **P12-59**: `kind=transition` 으로 살아남는 **residual semantic FP**(미해결). window-boundary 축은
  Phase 13 범위 밖이었다.

> **결론**: Phase 13 은 binary `kind` 계약과 파서 `S` 게이트를 기존 structural·chronology 계약을 깨지 않고
> production 에 도입했고, corrected PRIMARY 에서 Phase 10 대비 FP 4→1 · F1 0.872→0.944 를 얻었다.
> **모든 semantic FP 를 해결했다고 주장하지 않으며**(P12-59 잔존), **raw recall 을 보장하지도 않는다**
> (P3/P4 raw omission 관측). 다음 과제는 raw candidate emission 의 **안정성(stability) 측정**이다.

**live evidence 보존**(gitignore `*.local`, 커밋하지 않음): `audit.local/phase13/` 에 pre-correction
(`…T10-58-06-run1.{json,md}`)·corrected(`…T11-33-55-run1.{json,md}`) 원본을 byte-identical 복사해 뒀다.
Phase 10 산출물(`audit.local/out/`)은 무수정이다.

## Phase 14 확정 — Outfit AI 동결 (분석 Phase · production 변경 0 · live 0)

**성격**: 구현 Phase 가 아니라 **결정 Phase** 다. 물음은 하나였다 — *"Outfit AI 에 production correction 을
한 번 더 넣을지, 아니면 지금 상태로 동결하고 Expression AI 로 넘어갈지."* 답은 **동결**이다.
production·tests·audit·fixture·프롬프트 변경 **0**, **live 호출 0**, 확정 커밋은 docs-only.
보존 evidence(`audit.local/phase13/` pre·corrected · `audit.local/out/` Phase 10 run1 + stability run2/3)만
읽어 판단했다.

> ⚠️ **이 절의 서술 원칙(사용자 지시)**: `증명`·`배제`·`유일한 원인`·`유일한 해법` 같은 causal 확정 표현을
> 쓰지 않는다. evidence 가 지지하는 것은 **contributing factor** 수준이고, 관측은 **관측으로만** 적는다
> (발생 확률·stability 를 추론하지 않는다).

### `P12-59` vs `P12-60` — frozen evidence

`P12` = 70줄 장면. window 0 `scan 0..59`(context 없음) · window 1 `scan 60..69 · context 50..59`.
두 행은 **서로 다른 요청**에서 나왔고 두 요청 모두 pre/corrected 사이 **byte-identical** 이다.

| axis | `P12-59` | `P12-60` | 차이 |
|---|---|---|---|
| 줄 | `[민주] 나 잠깐 사복으로 갈아입고 올게.` | `잠시 후 민주가 돌아와 옆자리에 앉았다.` | 59=선언 · 60=복귀 사실 |
| 의미 | 미래 의도 | 완료된 전환의 결과 상태 | 59 는 완료 진술이 아니다 |
| owner window | planIdx 0 | planIdx 1 | 서로 다른 요청 |
| 다음 줄 가시성 | **없음** — 59 가 scan 종단, 60 은 no-look-ahead 로 부재 | 59 를 read-only context 로 **가짐** | 정보 비대칭 |
| currentOutfit/source · outfits · fixed · markers · initialHidden | `기본`/`default` · `['기본','사복']` · 없음 · 없음 · false | 전부 동일 | 통제됨 |
| raw `kind` | `transition` | `transition` | 59 를 완료로 분류 |
| parser | 전 게이트 통과 → **FP** | 통과 → **TP** | S 는 못 막는다(라벨이 transition) |
| 파서가 아는 정보 | `i∈scan`·후보·no-op·fixed·firstTextual 뿐 | 동일 | "선언 vs 완료" 필드가 없다 |

두 행은 최종 결과에 **공존**한다(`predicted = [59, 60]`) — 59 가 60 을 지우지 않는다.

**window-boundary 가중 가능성을 강하게 지지하는 대조**: 유사한 미래 의도 구문이 **완료 줄과 같은 window
안에** 있는 두 case 에서는 모델이 선언 줄을 후보로도 내지 않고 완료 줄만 냈다(각 두 run 동일 관측) —
`P1`(선언 i=1 · 완료 i=2 → **i=2 만**) · `P14`(선언 i=2 · 완료 i=3 → **i=3 만**). `P12`#0 은 같은 종류의
선언이 scan 종단(i=59)에 있고 완료(i=60)가 window 밖이며 **i=59 를 `transition` 으로** 냈다(두 run 동일).
⚠️ **이 대조는 통제된 causal experiment 가 아니다** — 세 문장은 유사하지만 byte-identical 이 아니고 문맥·
장면 길이·window 구성도 함께 다르며, `P12-59` 문장 자체에 이미 미래 의도 cue 가 있다. 따라서 **boundary
가중 가능성을 강하게 지지하는 자료**이지 "boundary 가 유일한 원인"·"prompt semantics 문제가 아니다" 의
근거가 아니다. (참고: `N3` = 완료가 장면 어디에도 없는 case 는 두 run 모두 `non_transition` 라벨.)

### root cause 는 이 수준으로만 확정한다

```
P12-59 는 여전히 raw model semantic misclassification 이다.
다만 P1/P14 대조와 P12 window 구조를 보면, non-final window 종단에서 downstream completion
evidence 를 볼 수 없는 no-look-ahead 구조가 이 오판의 가장 강하게 의심되는
structural contributing factor 다.
현재 frozen evidence 만으로 "boundary 가 유일한 root cause" 또는
"prompt semantics 문제는 아니다" 까지 causal 하게 확정하지 않는다.
```

### 검토한 minimal fix 를 채택하지 않은 이유

**이번 Phase 에서 검토한 작은 correction 중 positive recall 위험을 제한하면서 채택할 만한 것을 발견하지
못했다.** ⚠️ 미래 설계 가능성을 배제하는 문장으로 읽지 말 것.

- **D1 parser invariant `i === scanEnd` ∧ 뒤에 writable 잔존 → reject**: P12-59 를 거르고 P12-60 을 살리며
  언어 독립·현재 파서 정보로 계산 가능하다. **그런데 판정 근거가 의미가 아니라 60줄·3500자 chunking 의
  위치 artifact 다** — 진짜 transition 이 정확히 `scanEnd` 에 오면 **그 index 의 owner window 는 하나뿐이라
  복구 경로가 없고 silent FN** 이 된다(fixture 에 그 case 도 없다: P11 정답은 10·125).
- **D2 cross-window dedup**: 미승인 제안의 cross-window 전파·철회는 신규 시스템이고, 뒤 window 가 raw
  omission 하면(P3 가 그런 사례) FP 가 그대로 남는다.
- **D3 화자·문형 판정**: `P12-59` 도 `P2`(TP)도 민주 본인 대사라 화자 축으로 분리되지 않고, 시제·어미
  기반은 금지된 semantic regex/blacklist 다.
- **D4 prompt boundary suppression("window 종단 선언은 `non_transition`")**: 형태는 국소적이지만 실패
  모드가 비대칭이다 — 지금은 **59 FP 와 60 TP 가 함께 제안되어 보이고 거부로 복구**되는데, D4 는 종단 줄의
  **진짜 완료 전환**을 `non_transition` → S reject 로 **조용히** 없앨 수 있고(그 index 의 owner window 는
  하나) 틀린 의상이 다음 변화까지 carry 된다. 그 위치의 fixture case 가 없어 무료 검증으로 회귀를 잡을 수도
  없다. **F1 0.944 baseline 에서 채택 근거가 없다.**
- **D5 read-only look-ahead** — *"P12 boundary 정보 결손을 직접 줄이는 가장 명확한 structural candidate 중
  하나지만, 현재 no-look-ahead 계약을 바꾸는 별도 시스템 변경이므로 이번 Phase 범위 밖이다."* 파급:
  `aiSelect.ts` causal-window 계약 · payload/prompt 신규 키 · `estimate.ts` 견적 · 다중 window 장면 비용.
  **자동으로 다음 Phase 가 아니다**(사용자 별도 지시 시에만). overlapping scan · cross-window
  reconciliation · 2-pass 등 다른 대규모 설계는 이번에 연구·나열하지 않았다.

### `P3` — 두 종류의 evidence 를 섞지 말 것

**① 직접적인 same-input evidence(이것이 근거다)**
```
Phase 13 pre / corrected: 26 requests
byte-identical request pair 24쌍   (다른 것은 P4#0 · P5#0 = FIXED_RULE 보정 대상 둘뿐)
그 24쌍 중 tuple decision set(i|character|outfit|kind) 일치 = 23/24
유일한 decision divergence = P3#0   (pre: emitted / corrected: omitted)
※ 나머지 7건은 reason 문구·공백만 차이(파서가 표시용으로만 쓰고 저장하지 않는다)
```
⇒ **same-input raw emission variability 가 실제 존재한다.** `temperature 0` 이어도 deterministic 이라고
간주할 수 없다.

**② 역사적 참고 관측(rate 로 해석하지 않는다)** — `(3,민주,사복)` 행: Phase 10 run1 emitted · stability
run2 emitted · run3 emitted · Phase 13 pre emitted · Phase 13 corrected **omitted** ⇒ 보존 관측 총
**4 emitted / 1 omitted**. ⚠️ **이 5회는 동일 prompt/input 반복 실험이 아니다**(Phase 10 은 semantic-kind
도입 **전** 프롬프트). 따라서 4/5 를 same-input probability 나 emission rate 로 해석하지 않는다.

**③ production bug evidence — 없음**: Phase 13 pre 에서 같은 두 행이 모두 accepted(P3 PASS, tp=2) ·
Phase 10 의 P3 FN 은 raw omission 이 아니라 **`G`(no-op) 구조 거부**였고(raw 엔 두 행 다 있었다) Phase 11 B
가 이미 고친 축이다 · corrected P3 `rawAudit` = `ownerCount 1` · `matching []` · verdict `A` ·
`ownerInvariantOk true`. ⇒ planner payload drift · parser bug · window ownership bug · fixed/manual bug
**어느 근거도 없다.** **추가 stability campaign 불필요 — stability run 을 더 돌리지 않는다.**

### `FIXED_RULE` / F1 attribution 정정

```
Phase 13 pre        TP/FP/FN = 17/1/1   FAIL = P4, P12
Phase 13 corrected  TP/FP/FN = 17/1/1   FAIL = P3, P12
```
`FIXED_RULE` correction 은 겨냥한 `P4` 를 실제로 고쳤지만, 같은 corrected run 에서 **독립적인** `P3` raw
omission 이 발생해 **aggregate delta 는 0 으로 상쇄**됐다. 따라서 attribution 은 이 수준으로 쓴다:

```
Phase 10 baseline 대비 Phase 13 semantic-kind configuration 에서 관측 aggregate 가
F1 0.872 → 0.944 로 개선됐다.
mechanism-level 로는
  · N3 등 실제 non_transition row 는 S 가 reject 한 관측이 있음
  · N1/N4 는 raw candidate 자체가 사라졌으므로 S 의 직접 효과라고 할 수 없음
  · FIXED_RULE 은 P4 를 실제 보정했으나 해당 pre/corrected run pair 의 aggregate delta 는
    독립적인 P3 omission 으로 상쇄됨
⇒ 전체 F1 향상을 S 단독 또는 FIXED_RULE 단독에 귀속하지 않는다.
```
⚠️ **Phase 13 절의 기존 수치는 이력이므로 수정하지 않았다** — 정정은 이 절에만 있다.

### `N1` / `N4`

Phase 10 에서는 둘 다 raw 후보를 내 최종 **FP** 였다(`N1 (0,민주,사복)` · `N4 (0,지수,체육복)`).
**Phase 13 의 보존된 두 run 에서는 모두 raw 미출력(`{"changes":[]}`)이 관측됐다**(요청은 byte-identical),
최종 FP 0 · case PASS. ⚠️ 그 이상의 발생 확률·stability 는 추론하지 않는다. 제품 관점에서 **고칠 문제가
없고**, candidate-envelope 이론상 이상적이지 않다는 이유만으로 다시 emit 시키려 프롬프트를 흔들지 않는다.
**"`S` 가 N1/N4 를 해결했다"고 쓰지 말 것** — S 직접 효과가 관측된 case 는 `N3` 다.

### Outfit freeze 기준 (동결 시점의 상태)

**완성된 것** — 계약: `changes[]` = semantic candidate envelope · `kind` = binary parser-local transient ·
게이트 순서 `B→C→C2→D→E→F→G→S→seen.add→chronology` · fail-open · 정규화 3축 분리 · `FIXED_RULE` 이중
의미. 비침습성: `OutfitChange`·`OutfitSuggestion`·store·UI·Project schema·save/load·`.npproj.zip`·협업·
Ren'Py export **전부 무변경**, 값의 단일 소스는 계속 `outfitFlags`. 안전망: `tests/outfit-ai.test.ts`
(`S` 전용 블록 — fail-open·정규화 누수·게이트 위치) · `outfit-apply.test.ts` · `outfit-store.test.ts` ·
`dump:rpy` 22구성 회귀 0. 측정: corrected PRIMARY `17/1/1 · F1 .944 · case pass 21/23`(**합성 fixture 한정**).

**허용(=동결)하는 limitation**
1. **`P12-59` residual FP** — no-look-ahead window 의 **종단** 미래 의도가 `transition` 으로 남을 수 있다
   (원인 표현은 위 결론 블록 그대로). **현재 P12 fixture 에서 관측된 bulk-apply 영향**: 59 FP 와 60 TP 가
   모두 제안으로 존재하고, `foldSceneSuggestions` 가 `lineIndex` 오름차순이라 59 가 먼저 적용되고 60 은
   working-scene 기준 no-op 으로 skip 되어 **이 fixture 에서는 전환이 한 줄 일찍 시작**한다. 개별 검수에서
   59 를 거부하면 P12 는 정상화 가능하다. ⚠️ 이 관측을 **모든 boundary FP 의 일반적 피해 상한으로 쓰지 말 것.**
   ⚠️ **blanket boundary suppression(D4)으로 고치려 하지 말 것.**
2. **same-input raw emission variability** — 위 ① 그대로. ②의 4/5 를 rate 로 인용하지 말 것.
3. **`N1`/`N4` raw 미출력** — FP 는 없지만 `S` 의 직접 효과가 아니다. 재emit 유도 금지.
4. **합성 fixture 한정 측정** — 실제 제작 대본 기반 품질은 여전히 미측정.
5. 기존 유지: cross-window 미승인 제안 비전파(의도) · 무시한 제안의 재등장 · D3/D4/D5/D6.

**Outfit backlog(사용자 별도 지시가 있을 때만 재검토 — 자동으로 다음 Phase 가 아니다)**:
read-only look-ahead(D5) · 실제 제작 대본 기반 품질 측정 · 무시한 제안 재등장 방지.

> **결론**: Outfit AI 를 **현재 상태 그대로 실사용 baseline 으로 동결**한다. 남은 항목은 **현재 활성 해결
> 과제가 아니라** 문서화된 **accepted limitation / backlog** 다. **다음 Phase = Expression AI 실사용 audit +
> production 개선.**

## Phase 15 확정 — Expression AI 후보를 렌더 pool 에 일치 (구현 `e9311f3`)

**성격**: Expression AI 전면 재설계가 아니라 *"현재 production 경로에서 실사용 품질을 가장 크게 떨어뜨리는
defect 하나를 찾아 작은 correction 으로 연결한다"* — Outcome A. audit 에서 후보 3건(F-1 후보 누수 · F-2 청크
간 연속성 · F-3 `optedIn` 비대칭) 중 **F-1 만** 고쳤다.

**F-1 root cause — 폴백 모델이 둘이었다.** 후보는 `spriteAssetId` 로 **표정 단위** 기본 의상 폴백,
화면(`selectSprite`)은 **pool 단위** 폴백(요청 의상 칸이 **완전히 빌 때만** base pool 재진입)이었다.
추가 의상 slot 은 실제 asset 이 있는 표정만 생기므로, **부분 업로드된 추가 의상에서는 base pool 이 절대
참조되지 않는데 후보 함수는 base 표정을 available 이라고 거짓 보고**했다. frozen evidence 는
`tests/preview-export-fallback.test.ts` T2/T3/T4 — 특히 T3(base `{슬픔}` · 사복 `{기쁨}`)은 **AI 가
`슬픔` 을 고르면 화면에 웃는 얼굴이 뜨는** 정반대 강등이다. 피해: 유료 호출이 조용히 무효화되고,
그 줄은 `emotionAuto` 가 채워져 **증분 재실행에서 영구 스킵**되며, 대본 카드의 🤖 라벨과 게임이 어긋난다.

**방향은 단방향이다** — Phase 9 가 canonical 로 확정한 렌더러/Export 를 건드리지 않고 **AI 후보 생성기를
거기에 맞췄다**. 반대로 렌더러를 표정 단위 폴백으로 바꾸면 "옷은 사복인데 그림은 기본 의상"이 되고
기존 `.rpy` 도 달라진다(Phase 9 가 이미 기각한 방향).

**확정 계약(`src/generators/emotion/resolve.ts · availableExpressions`)**
```
outfit 이 '기본' 이 아니고 그 의상이 **직접 소유한 truthy asset** 이 1개 이상 → 그 의상 소유분만
그 외(기본 의상 / 직접 소유 0개인 추가 의상)                                  → 기본 의상 소유분
```
· ⚠️ **여기서 `spriteAssetId` 를 다시 부르면 안 된다** — 그 표정 단위 폴백이 결함의 원천이다.
· ⚠️ `generate.ts` 를 import 하지 않는다(그쪽이 이 모듈을 import 하므로 순환). 후보를 "그 의상이 직접
  소유한 표정"으로 좁히면 `selectSprite` 의 `pool.some((o) => o.attr === wantAttr)` 이 항상 참이라
  import 없이 결과가 일치한다. **D5(속성 해시 충돌)는 pool 내부 승자 문제라 기존대로 범위 밖.**
· 빈 문자열·`undefined` 슬롯은 "그림 없음"으로 센다(직접 소유로 치지 않는다).

**역할 분리는 그대로(Phase 3-A)**: `availableExpressions` = asset 측 선택 가능성 / `effectiveExpressions`
= project 선언 집합. **합치지 않는다.** 최종 후보는 기존대로 둘의 교집합이고, **순서의 정본은 계속
`effectiveExpressions(project.expressions)` 선언 순서**다(`declaredOrder.filter((e) => avail.has(e))`).
반환은 **Set = 멤버십 전용** — asset 삽입 순서를 의미 있는 ordering 으로 취급하지 말 것.

**폐기한 가정(중요)**: *"이 correction 후에도 target/요청 수/견적은 항상 불변"* 은 **틀렸다.** target gate 는
`availableExpressions` 출력이 아니라 **교집합 이후**를 본다. 그래서 `base {기본} · 추가 의상 {화남} ·
선언 ['기본']` 같은 구성에서 후보가 0 이 되어 **그 줄이 target 에서 빠질 수 있고, 그게 올바른 semantics 다**
— 그 의상 렌더러가 표현할 수 있으면서 project 가 허용하는 표정이 하나도 없으면 AI 호출이 기여할 정보가
0 이기 때문이다. ⇒ **계약은 "before/after 수치 불변"이 아니라 `estimate ↔ execution planner parity`**
(둘이 같은 `collectEmotionTargets`/`planEmotionChunks` 를 쓴다).

**소급 변경 없음**: 이미 저장된 `Line.emotionAuto` 는 새 규칙으로는 생성되지 않을 값이어도 **자동 삭제·
migration·batch cleanup 하지 않는다**(Phase 8 automatic invalidation 금지 유지). 복구 경로는 기존
`clearEmotionAuto` 와 수동 override 뿐.

**무변경**: `selectSprite`·`spriteSlots`·`pickSpriteAttrs`·`attrFor`·`resolveEmotionDetailed`·`aiSelect`
구조·`aiBatchSlice` stale 재검증·`ScenePlayer`·Ren'Py generator semantics·store schema·save/load·
`.npproj.zip`·협업·프롬프트 문장. Outfit AI 는 **Phase 14 동결 상태 그대로**.

**고정한 regression 축**(`emotion-resolve`·`emotion-ai`·`integration-workflow`): 부분 업로드 의상의 base
전용 후보 누수 금지 · 정반대 강등(T2) 재현 방지 · 추가 의상 asset 0개의 base 재진입 유지 · 기본 의상
semantics 유지 · truthy asset 만 직접 소유로 취급 · 후보 ordering = 선언 순서(asset 삽입 순서와 **어긋나게**
만든 fixture 로 판별력 확보) · 교집합 후 0 이면 target 제외 · estimate↔execution parity · **모든 최종 후보의
attr 를 그 의상 pool 이 실제로 표현 가능**(렌더러에 직접 결속). mutation check: 옛 구현으로 되돌리면 **8건 실패**.

**검증**: typecheck · vitest 50파일/772(762→+10) · `dump:rpy` 22구성 245파일 **diff 0** · 스크래치 outDir
빌드 · **live 0회**.
⚠️ `dump:rpy diff 0` 의 뜻은 **"고정된 기존 project state 에 대해 렌더러·생성기 semantics 를 안 건드렸다"**
까지다. **"앞으로의 AI 실행에서도 `.rpy` 가 같다"는 뜻이 아니다** — 새 실행은 후보가 달라져
`emotionAuto` 가 달라질 수 있고 Preview·게임 얼굴도 의도적으로 달라진다(그게 이 correction 의 목적).

**이번에 구현하지 않은 것**(해결 과제가 아니라 기록): **F-2** 청크 경계를 넘는 표정 연속성 정보 0
(run-local 값을 문맥에 넣으면 `validateEmotionUpdates` 축 9 의 requestKey 가 전부 불일치해 2번째 이후
청크 결과가 전량 skip 된다 — 러너·검증자 양쪽에 run-local 상태를 흘리는 **설계 변경**이다) · **F-3**
target 수집에 export `optedIn` 게이트 없음(D3 와 결합, 비용·UI 노이즈만) · 후보 1개뿐인 줄의 호출 생략
(답이 강제됨) · 파서가 "후보 밖"으로 버린 건수 미보고 · `contextWindow` 단일 초장문 줄 edge.
**표정 선택 품질 자체는 여전히 실키 미검증**이다(이번 Phase 는 결정론적 계약 불일치를 고쳤을 뿐).

## Phase 16 확정 — Expression AI 연속성 소유 범위 (구현 `931a2cc`)

**성격**: Phase 15 와 같은 *"production 경로의 defect 하나를 evidence 기반으로 골라 작은 correction 으로
연결한다"* — Outcome A. 후보 3건(`P16-F1` continuity ownership · `P16-F2` denotation 정의 부재 ·
`P16-F3` parser 폐기 건수 미보고) 중 **`P16-F1` 만** 고쳤다.

**root cause (deterministic)** — `BASE_SYSTEM_PROMPT` 의 연속성 문장이 소유 범위를 **줄 단위**로 썼다:
`"if it is unchanged from the previous line, repeat the same expression (avoid flickering between lines)"`.
그런데 Phase 5 이후 payload 는 **여러 화자와 지문이 뒤섞인 하나의 시간축**이다(`items` 는 `chunkItems` 가
원본 줄 순서로 자르고, `context` 는 주인공·지문·타 화자를 같은 `i` 축에 싣는다 — 기존 T7 이 고정).
⇒ *다른 화자의 표정을 현재 화자의 previous state 로 삼으라*는 지시가 성립했다. `CONTEXT_RULE` 의
`use it for continuity only` 도 그 `expr` 이 **누구 것인지** 말하지 않아 같은 문제였다.

**확정 계약 — 두 축을 분리한다(하나로 합치지 말 것)**
```
semantic evidence (감정 판단 근거)      = 전체 scene/context — 타 화자 대사·지문·scene 메타 계속 사용
continuity ownership (previous state) = 그 화자 자신의 이전 표정만, 타 캐릭터 승계 금지
```
· ⚠️ **범위를 좁힌다고 "같은 화자의 이전 줄만 보라"로 쓰면 안 된다** — 그 순간 타 화자·지문이 판단
  근거에서 빠지는 **정반대 회귀**가 된다. 그래서 BASE 첫 문장이 evidence 범위를(`including other
  characters' lines and narration`), `CONTEXT_RULE` 이 `every context line still informs what is
  happening` 을 명시적으로 못박는다. 테스트 **T-B** 가 그 방향 회귀 전용 가드다.
· ⚠️ anti-flicker 는 **없앤 게 아니라 범위만 좁혔다** — 같은 화자 안에서는 강도 그대로다.
· ⚠️ 변경 **횟수**에 대한 sparsity prior·기본 표정 선호 같은 억제 문구를 추가하지 말 것(Phase 11 A 교훈).

**변경 범위** — production 은 `src/generators/emotion/aiSelect.ts` 의 **프롬프트 문자열 2곳 + 그 머리
주석**뿐이다. `collectEmotionTargets`·`contextWindow`·`planEmotionChunks`·payload 구조·
`parseEmotionResponse`·`validateEmotionUpdates`·`estimate.ts`·`resolve.ts`/`availableExpressions`·
renderer·store·schema·save/load·`.npproj.zip`·협업·Ren'Py export **전부 무변경**. Outfit 은 Phase 14 동결 그대로.
`PROMPT_OVERHEAD_TOKENS_PER_REQUEST = 250` 은 근사 estimator 계약이라 **손대지 않았다**(새 문안이 ~35토큰
더 길어 그만큼 과소 추정이 된다 — 근사 성격 유지가 사용자 결정).

**고정한 regression 축**(`tests/emotion-ai.test.ts`): 로컬 프롬프트 **사본** 갱신(조건부 게이트가 무조건
켜지는 회귀 + 모르는 사이의 프롬프트 변경 방지) · **T-A** 옛 줄 단위 문구 부재 + 화자 소유 문구 존재 +
same-speaker anti-flicker 생존 · **T-B** evidence 축소 방지 · **T-C** 문맥 `expr` 소유자 명시 + 문맥 줄이
계속 정보원 + 기존 계약(문맥 인덱스로 답 금지·답은 후보에서만) 생존 · 기존 2화자 fixture 에 **items 가
화자별 그룹이 아니라 원본 줄 순서 interleave** 라는 전제 assertion 보강(context 쪽 전제는 기존 T7 이 이미
고정하므로 독립 테스트를 새로 만들지 않았다). mutation check: 옛 프롬프트로 되돌리면 **8건 실패**.

**검증** — typecheck · vitest 50파일/**775**(772→+3, 기존 772 회귀 0) · mutation check 8건 ·
`dump:rpy` 22구성 245파일 **diff 0** · 스크래치 outDir 빌드 · **live 6회**.

**live 실측(정확히 이만큼)** — `gpt-4o-mini` · curated **synthetic** fixture 3개 · before/after 각 1회 ·
**총 6회** · 반복 측정 없음. 두 트리(`268faf7` vs 구현)의 **user payload 바이트 동일**을 먼저 확인해
차이를 system prompt 하나로 통제했다.

| fixture | before | after |
|---|---|---|
| `P16-A` cross-speaker carry | 민주=화남 / 지수=슬픔 / 민주=화남 | **동일** |
| `P16-B` same-speaker 유지(대조군) | 민주=기쁨 / 민주=기쁨 | **동일** |
| `P16-C` context expr ownership | 지수=기본 | **동일** |

**⚠️ limitation — 과장해서 인용하지 말 것**
- **`invalid continuity scope` 는 deterministic 하게 확인됐으나, 이번 최소 live fixture 에서는
  baseline user-facing cross-speaker bleed 가 재현되지 않았다.** baseline 부터 이미 올바른 선택이었고
  before/after 선택도 **모두 동일**했다.
- ⇒ **실제 사용자 영향 크기와 표정 선택 품질 개선은 입증되지 않았다.** *"cross-speaker bleed 를 고쳤다"*,
  *"semantic FP 를 해결했다"*, *"선택 품질을 개선했다"*, *"live 에서 개선을 확인했다"* 로 쓰지 말 것.
- 다만 corrected side 의 **방향성 regression 도 관측되지 않았다**(P16-B guard 악화·신규 flicker 없음).
- synthetic curated fixture 한정이다(Phase 10/13 과 같은 등급). **same-input variance·stability
  campaign 으로 확대하지 않는다.**

**이번에 해결하지 않은 것**(해결 과제가 아니라 기록, Phase 15 목록 그대로 유지 + 1건 추가):
**F-2** 청크 간 run-local 연속성 정보 0 · **F-3** target 수집에 export `optedIn` 게이트 없음 ·
후보 1개뿐인 줄의 호출 생략 · 파서가 "후보 밖"으로 버린 건수 미보고 · **`P16-F2`** 표정의 denotation
정의 부재(부정·시제·타인 감정 언급) — evidence 가 *부재* 라 등급이 낮고 `"나 진짜 화났어"` 류를 함께
억누를 suppression 회귀 위험이 있어 **별도 evidence 확보 시 독립 Phase**.

## Phase 17 확정 — Expression AI 시제 denotation limitation (**구현 커밋 없음 · Outcome C**)

**성격**: Phase 16 이 남긴 후보 `P16-F2`(표정 denotation 정의 부재) **하나만** 좁게 조사했다. 결과는
**Outcome C** — 실제 semantic misselection 을 관측했으나 한 번의 minimal correction 이 그 선택을 바꾸지
못해 **폐기**했다. **production/test tracked 변경 0**, baseline 은 Phase 16 상태 그대로다.

**조사 축과 계약** — Phase 16 이 고친 두 축과 **직교**한다(합치지 말 것):
```
evidence scope        (#3, Phase 16) = 어디를 보는가            — 전체 scene/context
continuity ownership  (#4, Phase 16) = 이전 상태가 누구 것인가  — same-speaker
denotation            (P16-F2)       = 그 줄이 언급하는 감정이 지금 보여야 할 얼굴인가
```

**before-live evidence**(`gpt-4o-mini` · `temperature 0` · production request path · curated fixture
6개 × **각 1회** · **parser-valid 6/6**):

| id | 축 | expected | before | after | pass |
|---|---|---|---|---|---|
| `F2-N1` | 타인 감정 귀속 | ≠화남 | 기본 | 기본 | ✅ |
| `F2-N2` | **과거 vs 현재** | ≠화남 | **화남** | **화남** | ❌ |
| `F2-N3` | 부정 | ≠화남 | 기본 | 기본 | ✅ |
| `F2-P1` | 현재 분노 guard | =화남 | 화남 | 화남 | ✅ |
| `F2-P2` | 과거+현재 guard | =화남 | 화남 | 화남 | ✅ |
| `F2-P3` | 현재 슬픔 guard | =슬픔 | 슬픔 | 슬픔 | ✅ |

관측된 defect 는 `F2-N2` 하나다:
```
"그때는 정말 화가 났었지. 지금은 다 웃어넘길 수 있어."   기대: 화남 아님 → 실제: 화남
```
정확한 표현: **과거의 분노와 현재의 해소된 상태가 명시적으로 대비됐는데도 과거 분노가 현재 expression
으로 선택됐다.** ⚠️ *"현재 분노가 문법적으로 명시 부정됐다"* 로 과장하지 말 것.

**폐기한 temporary correction** — 실제 실패한 **시제 축만** 겨냥해 evidence-scope 문장 뒤에 denotation
clause **1개**를 넣었다(의미 계약: target line 순간의 current visible emotional state 가 선택 대상 ·
과거 감정도 scene evidence 로 **유지** · 과거 감정을 현재 expression 으로 **자동 승계하지 않음** · line 이
현재까지 지속됨을 나타내면 현재 expression 으로 **선택 가능**). Phase 16 의 evidence scope·continuity
ownership 문장은 **변경하지 않았다**. 타인 감정·부정·인용·가정은 clause 에 **나열하지 않았다**.

deterministic 검증(전부 통과): typecheck · vitest **50파일/776**(775→+1) · 기존 **T-A/T-B/T-C 무수정 통과**
· mutation(clause 제거 시 **6건 실패**) · `dump:rpy` 22구성 245파일 **diff 0** · 스크래치 outDir 빌드.
⚠️ 이 검증이 확인한 것은 **폐기된 correction 의 deterministic contract 와 회귀 안전성**이지 **모델 선택
품질 개선의 증거가 아니다.**

**after-live** — 동일 6 fixture 각 1회 추가(누적 **12회 = before 6 + after 6**, 계획 상한 정확히 준수,
반복·seed·model 비교·prompt variant **없음**). user payload **6/6 byte-identical**(의도된 차이는 system
prompt 의 denotation clause 하나뿐). 결과는 위 표대로 **before/after 선택 6/6 동일**.
⇒ **positive guard regression 은 관측되지 않았으나 실제 defect `F2-N2` 도 개선되지 않았다.**
확정 Plan 규칙(*N2 unchanged → Outcome C*)을 적용하고 **두 번째 prompt wording/variant 는 시도하지 않았다**
(correction attempt 1회 고정).

**폐기 처리** — temporary production/test 변경은 전부 되돌렸다. tracked production 변경 0 · tracked test
변경 0 · production baseline = Phase 16 상태 · **correction implementation commit 없음** · live correction
효과 입증 없음. (로컬 harness·산출물·폐기 patch 는 gitignore 대상이라 커밋하지 않았고, **정본은 이 문서의
evidence 요약**이다 — local artifact 존재에 의존하지 않는다.)

**accepted limitation (Phase 18 로 가져간다)**
> 작은 curated fixture 에서 Expression AI 가 **과거에 언급된 감정을 현재 visible expression 으로 귀속하는
> 실제 semantic misselection** 이 관측됐다. 시제 축만 겨냥한 **한 번의** minimal prompt correction 은
> deterministic contract 검증과 positive guards 를 통과했지만 해당 live 선택을 바꾸지 못해 폐기했다.

⚠️ **다음처럼 쓰지 말 것**: *"Phase 17 에서 문제를 해결했다"* · *"prompt 품질이 개선됐다"* ·
*"`gpt-4o-mini` 는 일반적으로 과거 감정을 구분하지 못한다"* · *"동일 입력에서 안정적으로 반복되는 defect
가 입증됐다"*(같은 입력 반복 측정을 하지 않았다) · *"모든 tense/negation/quotation/hypothetical 문제가
존재한다"*. **타인 감정 귀속·부정 fixture 는 이번 최소 live 에서 통과했고, 인용·가정·미래는 조사를
확장하지 않았다.**

## Phase 18 확정 — Expression AI production baseline 동결 (docs-only finalization · **Outcome A**)

**성격**: 새 기능 Phase 가 아니다. Phase 15~17 에서 확정된 production 계약·evidence·accepted limitation 을
최신 production source 와 대조해 **현재 상태를 실사용 baseline 으로 동결**했다. **production/test/프롬프트
변경 0 · live 호출 0 · 새 benchmark 0.** 결과물은 docs 3파일뿐이다.

**동결 baseline** — Expression AI production baseline = **`931a2cc`**(Phase 16 구현) 코드 상태.
```
git diff --name-only 931a2cc..b1adab3                  → CLAUDE.md · HANDOFF.md · PHASES.md
git diff --stat 931a2cc..b1adab3 -- src tests scripts package.json package-lock.json → (empty)
```
⇒ Phase 17 이후의 tracked code tree 는 Phase 16 구현과 **동일**하다(Outcome C 라 구현 커밋이 없고, 폐기한
임시 correction 은 트리에 남지 않았다). **그래서 Phase 18 은 재검증 ceremony 를 돌리지 않았다** — 같은
트리에 대한 Phase 16 시점 검증(typecheck · vitest 50파일/775 · mutation 8건 · `dump:rpy` 22구성 245파일
diff 0 · 스크래치 outDir 빌드)이 그대로 유효하다.

### 동결한 baseline contract (source 는 파일 + symbol 로 기록 — 줄 번호를 심지 않는다)

| Area | Production contract | Source (file · symbol) |
|---|---|---|
| resolution priority | `emotion`(작가/수동, **검증 없음**) > `emotionAuto`(선언 목록 검증) > 휴리스틱(검증) > `기본` | `emotion/resolve.ts` · `resolveEmotionDetailed`/`resolveEmotion` |
| candidate pool | 추가 의상이 **직접 소유한** truthy asset ≥1 → 그 소유분만 · 0 → 기본 의상 pool 재진입 | `emotion/resolve.ts` · `availableExpressions` |
| candidate ordering / identity | 최종 후보 = 선언 순서(`effectiveExpressions`)로 거른 교집합 · 반환 Set 은 멤버십 전용 · 키는 `candidateKey` · 설명은 라벨과 결합하지 않음 | `emotion/aiSelect.ts` · `collectEmotionTargets`/`candidateKey`/`buildEmotionRequest` |
| target selection | dialogue ∧ ¬`members` ∧ ¬`isProtagonist` ∧ (`emotion`·`emotionAuto` 없음) ∧ 후보 ≥1. 후보 0이면 그 줄 제외가 **정상** | `emotion/aiSelect.ts` · `collectEmotionTargets` |
| context source | 장면의 **모든** 대사·지문(target 포함) · 빈 텍스트만 제외 · `expr` 은 저장값(`emotion \|\| emotionAuto`)만 | `emotion/aiSelect.ts` · `collectEmotionTargets` |
| planner / estimate | target 청크(`chunkItems`) + 요청별 읽기 전용 문맥(no look-ahead, 상한 초과 시 **오래된 쪽** 폐기). 견적이 **같은 planner** 를 재사용 | `emotion/aiSelect.ts` · `contextWindow`/`planEmotionChunks` · `emotion/estimate.ts` · `estimateEmotionCost` |
| prompt semantic evidence | 감정 판단 근거 = 타 화자 대사·지문·scene 메타 포함 전체 문맥 | `emotion/aiSelect.ts` · `BASE_SYSTEM_PROMPT`/`CONTEXT_RULE` |
| continuity ownership | previous state 는 **그 화자 자신**의 이전 표정만 · anti-flicker 는 범위만 축소(제거 아님) | 同上 |
| denotation | production 문안 **없음**(Phase 17 correction 폐기) | — |
| parser write boundary | 쓰기 대상은 **그 요청의 target** 뿐 · (화자,의상)별 후보 exact 검증 · 불일치·유령 인덱스는 추측 없이 폐기 | `emotion/aiSelect.ts` · `parseEmotionResponse` |
| emotionAuto write / validation | 커밋 직전 현재 snapshot 으로 planner·builder 재실행 → 축 1~9 재검증, 어긋난 것만 skip · 검증~쓰기는 **동기 구간** · 쓰기 base 는 현재 scenes | `store/aiBatchSlice.ts` · `autoAssignEmotionAll`/`validateEmotionUpdates`/`emotionRequestKey` · `store/helpers.ts` · `applyEmotionUpdates` |
| re-run | 기존 `emotionAuto` 가 있는 줄은 target selection 에서 제외되며 **자동 소급 invalidation 은 하지 않는다** · 회수는 `clearEmotionAuto` 와 수동 override | `emotion/aiSelect.ts` · `collectEmotionTargets` · `store/scriptSlice.ts` · `clearEmotionAuto`/`setLineEmotion` |
| 표정 rename/delete | `emotion`·`emotionAuto` 를 **대칭**으로 이전/삭제(사용자 명시 액션) | `store/characterSlice.ts` · `renameExpression`/`removeExpression` |
| Preview | 생성기와 `resolveEmotion`·`spriteSlots`·`selectSprite` 공유 · 표시 attr carry · `optedIn` 게이트가 slot 계산보다 앞 · D3 는 레거시 경로 유지 | `components/ScenePlayer.tsx` · `computeSpriteDisplay` |
| Ren'Py export | 유효 표정 판정을 `resolveEmotion` 에 위임(단일 소스) | `renpy/generate.ts` · `effectiveEmotion`/`expressionPlan`/`selectSprite` |
| save/load · `.npproj.zip` · 협업 | `Line.emotionAuto` 는 Project schema 필드이고 직렬화는 project **통째** JSON — 필드 allowlist 가 없어 세 경로 모두 자동 포함 | `types/project.ts` · `Line` · `project/transfer.ts` · `exportProjectFile`/`importProjectFile` · `store/persistenceSlice.ts` · `collab/sync.ts` · `pushProject` |
| 재분석 병합 | 텍스트가 같은 줄만 `emotionAuto` 승계 · 사라진 줄의 배정은 손실로 집계 | `project/mergeScenes.ts` · `mergeScenes` |

### evidence 등급 (섞지 말 것)

- **deterministic contract evidence** — `931a2cc` 트리 기준: typecheck · vitest **50파일/775** ·
  mutation check 8건(Phase 15) + 8건(Phase 16) · `dump:rpy` 22구성 245파일 **diff 0** · 스크래치 outDir 빌드.
- **existing regression evidence** — `emotion-resolve` · `emotion-ai` · `emotion-commit` · `emotion-estimate` ·
  `emotion-recovery` · `preview-export-fallback` · `merge-scenes` · `transfer-roundtrip` · `integration-workflow`.
- **live model-behavior evidence** — 누적 **18회**(Phase 16 6 + Phase 17 12), 전부 `gpt-4o-mini` ·
  curated **synthetic** fixture · 반복 측정 없음. Phase 16 은 before/after 전부 동일, Phase 17 은 `F2-N2` 하나만 실패.
- **accepted limitation** — 아래 목록.

⚠️ **deterministic 통과를 모델 품질 개선으로 인용하지 말 것.** Phase 17 이 그 반례다 — 폐기된 correction 은
typecheck·776 tests·mutation·`dump:rpy` diff 0 을 전부 통과하고도 live 선택을 하나도 바꾸지 못했다.

### accepted limitation (기존 확정분을 그대로 승계 — Phase 18 은 새 limitation 발굴 Phase가 아니다)

1. **`P16-F2` 시제 denotation**(Phase 17 절이 정본) — 과거에 언급된 감정이 현재 visible expression 으로
   귀속되는 실제 misselection 관측. minimal correction 1회 후 폐기. **재튜닝·2차 문안·variant 금지.**
   타인 감정 귀속·부정은 통과했고 인용·가정·미래는 조사하지 않았다.
2. **F-2** 청크 경계를 넘는 run-local 연속성 정보 0(Phase 15/16 절).
3. **F-3** AI target selection 과 Ren'Py export 의 `optedIn` 게이트가 **비대칭** — export 대상이 아닌
   캐릭터의 줄에도 AI 호출이 발생할 수 있다. Ren'Py export 는 자체 `optedIn` 게이트를 갖고 있으므로 이
   항목은 **불필요한 AI 비용·targeting·UI 노이즈** 측면의 backlog 로 유지한다(Phase 9 D3 와 결합).
4. 후보 1개뿐인 줄의 호출 생략 미구현 · 파서가 "후보 밖"으로 버린 건수 미보고 · heuristic negation(Phase 15/16 절).
5. **D5/D6** 커스텀 표정·의상 속성 해시 충돌 — pool 내부 승자 미보장(Phase 9 절).
6. estimate 의 요청당 프롬프트 오버헤드는 **근사값 계약**이다(Phase 16 절 기록 — 근사 유지가 사용자 결정).
7. **live evidence 의 범위** — 기존 live evidence 는 소규모 curated synthetic fixture 에 한정되며, 실제 제작
   대본 전반에 대한 Expression AI semantic quality 의 **일반화된 품질 평가는 수행하지 않았다**. 이는
   *"production baseline 으로 쓸 수 없다"* 는 뜻이 **아니다** — 이번 freeze 판정은 deterministic contract ·
   integration path(Preview/export/save/전송/병합) · known limitation · 사람 검수 workflow(`emotion` 우선 ·
   `clearEmotionAuto` · 장면 카드 🤖 표시)를 함께 보고 내린 것이다.

### Phase 18 에서 다시 열지 않는 것

`P16-F2` prompt 재튜닝 · live prompt experiment · same-input 반복 측정 · 새 semantic benchmark ·
F-2/F-3 구현 · 후보 1개 optimization · parser observability · heuristic negation · Outfit 수정 ·
renderer/candidate 재설계 · 새 ontology/classifier/state machine · stable Line ID · review/suggestion state ·
save/load schema 변경 · Ren'Py export redesign · UI 리팩터 · TTS.

### 종료 전략

```
Phase 18  Expression AI production baseline 동결
   ↓ (필요 시)
Phase 19  Novel-Agent 전체 production stabilization / v1 checkpoint
   ↓
핵심 개발 종료
```
Phase 19 는 **필수 기능 Phase 가 아니고** 새 AI 기능 개발도 아니다. 진행하더라도 범위는 전체 stabilization /
checkpoint 이며 Expression prompt tuning · Outfit semantic 변경 · F-2/F-3 등 backlog 구현을 **자동 포함하지
않는다**. **새 blocker 가 없는 한 Phase 20+ 는 만들지 않는다.**

## Phase 19 확정 — Novel-Agent 전체 production stabilization / **v1 checkpoint** (docs-only finalization · **Outcome A**)

**성격**: 새 기능 Phase 가 아니다. 제품 **전체**(Preview · save/load · `.npproj.zip` · Ren'Py export ·
Outfit AI · Expression AI · build/test)를 v1 production baseline 으로 확정할 수 있는지 검증한 checkpoint
Phase 다. **production 변경 0 · test 변경 0 · live OpenAI 0 · 새 benchmark/harness/e2e 0.** 결과물은 docs 뿐이다.

### baseline SHA 는 두 축이다 (섞지 말 것)

| 축 | 값 | 의미 |
|---|---|---|
| **Production implementation baseline** | **`931a2cc`** (`fix: Expression AI 연속성 소유 범위를 화자 단위로 한정 (Phase 16)`) | 현재 production/test 코드 트리의 구현 baseline. Phase 17(Outcome C · 구현 커밋 없음) · Phase 18(docs-only) · Phase 19(docs-only) 를 지나도록 `src`/`tests`/`scripts`/`package*` 가 한 줄도 바뀌지 않았다 |
| **Final v1 repository checkpoint** | **이 문서를 반영한 Phase 19 확정 commit** | 문서·이력까지 포함한 저장소 기준점. verification 을 돌린 시점의 `b1adab3` 는 **최종 repository checkpoint 가 아니다**(그때는 이 절이 아직 없었다) |

검증 시점 실측:
```
git diff --stat 931a2cc..b1adab3 -- src tests scripts package.json package-lock.json → (empty)
```

### canonical verification (전부 기존 repository 명령 · 새 harness 0)

| 단계 | 명령 | 결과 |
|---|---|---|
| V0 | `git fetch` · `rev-parse` · `status` | HEAD = origin/main = `b1adab3` · working tree clean |
| V1 | `npm run typecheck` | **PASS** (exit 0 · error 0) |
| V2 | `npm run test` | **PASS** — Test Files **50 passed (50)** · Tests **775 passed (775)** · fail 0 · **skip 0** |
| V3 | `npx vite build --outDir <스크래치>/dist --emptyOutDir` | **PASS** — vite 5.4.21 · 190 modules · `built in 3.69s` · `index.html`/`assets/`/`fonts/`/`_redirects` 실재 확인 |
| V4 | `npm run dump:rpy -- <스크래치>/rpy-v1` | **PASS** — `덤프 완료: 22구성 / 245파일`(파일시스템 독립 실측도 22/245 일치) |
| V5 | V3 산출물로 `vite preview --port 4173 --strictPort` → `npm run test:e2e` | **PASS** — `=== 결과: 전체 통과 ✅ ===` · assert 실패 0 |
| V6-a | `npm run gen:lint` (옛 `.lint-tmp` 사전 삭제 후) | **PASS** — `생성 완료` · 신규 21파일 |
| V6-b | `renpy.exe .lint-tmp lint` (SDK 8.5.3) | **PASS** — Ren'Py 8.5.3.26051504 · **error 0 · warning 0** |

⚠️ **`npm run build` 를 쓰지 않았다** — OneDrive 에서 조용히 exit 127 로 죽고 옛 `dist` 가 남는 함정 때문이다(CLAUDE.md 환경 함정).
⚠️ **V5 는 이번 V3 산출물을 대상으로 했다** — `--strictPort` 로 포트를 고정해 좀비 preview 가 옛 dist 를
서빙한 채 e2e 가 통과하는 경우를 구조적으로 배제했고, 끝난 뒤 **그 preview 프로세스만** 종료했다
(전역 `node` kill 을 쓰지 않는다 — 무관한 프로세스까지 죽는다).
⚠️ **V6 의 `.lint-tmp` 는 lint 용 stub/fixture 이지 실행용 export project 가 아니다** — 그 fixture 를 GUI 로
실행했을 때의 known runtime failure 는 production blocker 판정 근거가 **아니다**. 반대로 실제 production
export 생성 실패 · ZIP 손상 · production `.rpy` 의 lint error 는 이 문장으로 면제되지 않는다.

### live 계약

**live OpenAI 호출 0.** V5 는 `page.route('**/v1/chat/completions')` 전량 mock + 더미 키(`sk-e2e-dummy`)를
쓴다 — route 를 빠져나가도 과금이 아니라 401 이다. **새 semantic benchmark · same-input stability 측정 ·
prompt experiment 를 하지 않았다.**

### product checkpoint — 새 v1 blocker 0

Preview · Preview↔export parity · save/load · `.npproj.zip` export/import · Ren'Py export ·
Outfit AI 실행 · Outfit AI 재실행/수락/회수 · Expression AI 실행 · Expression AI commit validation ·
Expression AI 재실행/회수 · estimate/planner parity · 재분석 병합 · 협업 경계 · production build ·
typecheck · full automated tests — **전 경로에서 새 blocker 가 관측되지 않았다.**

V5 가 실제 브라우저에서 통과시킨 workflow: Preview 실렌더 → 장면 승인 → 에셋 업로드 → Ren'Py 생성 →
ZIP 내용 확인 → 새로고침 자동복원 → **Outfit AI 배치 실주행(route mock 3요청)** → 제안 적용/무시/
모두적용/모두무시 → `.npproj.zip` 내보내기 → 초기화 → 가져오기(5장면 + 에셋 blob 복원).

⚠️ **Expression AI 의 브라우저 e2e 는 현재 리포에 없다**(실측). Phase 19 는 그것을 **새로 만들지 않았다** —
Expression 실행/커밋/회수 계약은 기존 canonical vitest(`emotion-ai` · `emotion-commit` · `emotion-recovery` ·
`emotion-resolve` · `emotion-estimate` · `integration-workflow`)가 덮는다는 사실을 그대로 기록한다.

### 동결 상태 (Phase 19 는 이 둘을 다시 열지 않았다)

**Outfit AI — Phase 14 freeze**: curated synthetic fixture 기준 `TP/FP/FN = 17/1/1` ·
`Precision = Recall = F1 = 0.944`. 파서 게이트 순서 · `kind` wire 계약 · `FIXED_RULE` 두 의미 모두 무변경.

**Expression AI — Phase 18 freeze**(구현 baseline `931a2cc`):
```
manual emotion > emotionAuto > heuristic > default    (resolveEmotion 단일 소스)
candidate pool = 실제 렌더 pool 과 일치                (Phase 15)
semantic evidence     = 전체 context                  (Phase 16)
continuity ownership  = same-speaker                  (Phase 16)
tense denotation      = accepted limitation           (Phase 17 · Outcome C)
```

### v1 판정 기준 (오해하지 말 것)

**AI semantic accuracy 100% 는 v1 조건이 아니다.** Outfit·Expression AI 의 production contract 는
**"AI 초벌 → 사람 검수"** workflow 이고(작가 값 우선 · `clearEmotionAuto` · 제안 수락/무시 · 장면 카드 🤖 표시),
개별 semantic 오답 가능성은 그 자체로 v1 blocker 가 아니다. Phase 19 의 판정 기준은 **동결 계약이 깨지지
않았는가 + 실제 workflow/데이터 무결성이 정상인가** 였다.

### accepted limitation (기존 확정분 승계 — 새로 발굴하지 않았다)

`P16-F2` 시제 denotation(Phase 17 절이 정본 · **backlog 로 중복 분류하지 않는다**) · Outfit `P12-59`
residual FP · same-input raw emission variability · `N1`/`N4` raw 미출력 · D3 export `optedIn` 비대칭 ·
D5/D6 커스텀 표정·의상 속성 해시 충돌 · estimate 의 요청당 프롬프트 오버헤드 근사값 계약 ·
live evidence 가 curated **synthetic** fixture 범위라는 제한 · 협업 Storage 노출 범위(2026-08-05 감수).

### v1 비차단 backlog (기존 정본 승계 — Phase 19 가 새로 만든 항목은 없다)

Expression **F-2** · **F-3** · 후보 1개뿐인 줄의 호출 생략 · 파서 폐기 건수 미보고 · heuristic negation ·
Outfit 장기 개선(look-ahead 등) · stable Line ID · review/suggestion state · 장기 architecture 개선 ·
(HANDOFF 기존 항목) 탭 컴포넌트 코드 스플리팅 · `screensRpy.ts`/`AssetsTab.tsx` 분리 · store 긴 로직의
services 추출. ⚠️ **backlog 가 존재한다는 사실이 v1 상태를 약화시키지 않는다.**

### 결론

> **Novel-Agent v1 production baseline 을 확정한다.**
> 현재의 accepted limitation 과 비차단 backlog 는 **여러 Ren'Py 노벨 게임을 반복 제작하는 실사용을 막지
> 않는다.** Phase 19 를 끝으로 **계획된 v1 핵심 개발을 종료한다.**
> **새 blocker 가 없는 한 Phase 20+ 를 자동 생성하지 않는다.**

⚠️ 이것은 *"프로젝트가 영원히 완성돼 추가 개발이 불가능하다"* 는 뜻이 **아니다**. 정확히는 **현재 계획된
v1 핵심 개발의 종료**이며, 실제 제작에 쓰는 중 새 blocker 나 필요가 확인되면 그때 별도 작업으로 판단한다.

## 계획 입력: 지금 코드에 이미 있는 것 (재발명 금지)

**표정 파이프라인은 이미 존재한다.** LLM 배정도 들어와 있다.
- 판정 단일 소스 `resolveEmotion`(`src/generators/emotion/resolve.ts`) — **동기·순수**여야 한다(ScenePlayer·SceneCard가 렌더 중 호출). 우선순위 = 작가 태그 `Line.emotion` > AI `Line.emotionAuto` > 휴리스틱(`infer.ts`) > `기본`.
- 그래서 AI 값은 **렌더 시점 조회가 아니라 미리 계산해 Line에 저장**하는 구조다. 새 추론도 이 계약을 따라야 한다.
- 배치 실행 `autoAssignEmotionAll`(`src/store/aiBatchSlice.ts`) + `aiSelect.ts` + 비용 견적 `estimate.ts`. 증분(이미 채운 줄은 재호출 안 함)·busy 키·진행률·PACE·단일 커밋 구조를 공유한다.
- 후보 집합이 **두 종류**다: AI가 고를 수 있는 건 `availableExpressions`(실제 업로드된 것만), 최종 검증은 `effectiveExpressions`(선언 목록). 같게 만들면 "업로드 전 임시 실루엣" 워크플로가 죽는다.

**복장은 규칙 기반뿐 — LLM 추론이 없다(여기가 빈자리).**
- `resolveOutfit`(`src/types/project.ts`): 장면 직접 지정 `Scene.outfits[charName]` > `OutfitRule`(배경 이름 부분 일치, 긴 키워드 우선) > `기본`.
- 표정처럼 "AI 값 전용 필드 + 사람 값 우선"이라는 대칭 구조가 아직 없다.

**⚠️ `Line`에는 stable id가 없다.** 줄은 **배열 인덱스**로 참조된다(`setLineEmotion(sceneId, lineIndex)`, `line.voiceAssetIds`, 음성 파일명 `{charId}_{sceneLabel}_{lineIdx}`). "index 의존 금지"를 요구하면 그건 저장 포맷 마이그레이션 + 음성 파일 경로 + `mergeScenes` 매칭까지 건드리는 **별도 대형 작업**이다 — Phase 안에 슬쩍 넣지 말 것. `Scene.id`는 있다.

**새 필드를 Line/Scene/Project에 추가할 때 따라오는 경로**(대부분 자동, 마지막 둘은 수동 확인 필요)
1. localStorage 저장(project 통째) · IndexedDB(바이너리만) — 자동
2. `.npproj.zip` 내보내기/가져오기(`src/project/transfer.ts`) — project JSON 통째라 자동
3. 협업 LWW push(`src/collab/`) — 자동
4. **재분석 병합(`src/project/mergeScenes.ts`)** — 수동. `emotion`/`emotionAuto`를 왜 갈랐는지가 여기 있다(`next.emotion ?? prev.emotion` 규칙 때문에 AI 값이 작가 태그인 척 살아남는 문제).
5. **Ren'Py 출력(`src/renpy/generate.ts`)** — 수동. 사용자 텍스트는 반드시 `esc`/`escRpyText` 경유.

## 매 Phase 체크리스트

- [ ] 기존 `resolveEmotion`/`resolveOutfit` **단일 소스 계약**을 깨지 않는가(생성기·미리보기·장면카드가 각자 계산하면 어긋난다)
- [ ] 기존 휴리스틱(`infer.ts`)·폴백·워크어라운드를 이유 확인 없이 제거하지 않는가
- [ ] 사람이 정한 값(작가 태그·직접 지정)이 **항상 AI보다 우선**인가, 되돌릴 수 있는가
- [ ] 저장·`.npproj.zip`·협업·재분석 병합·Ren'Py export 5경로를 다 고려했는가
- [ ] timeline/event 같은 **새 추상화를 필요 없이 도입**하지 않는가(범위 확대 금지)
- [ ] AI 호출은 증분·비용 견적·진행률·중단 가능 구조를 기존 배치와 **같은 방식**으로 쓰는가
- [ ] 회귀 0: 기능을 안 켠 프로젝트의 생성 `.rpy`가 바이트 단위로 동일한가(CLAUDE.md "출력 회귀 0 증명법")
- [ ] 검증: `npm run typecheck` · `npm run test` · 스크래치 outDir 빌드 · 필요하면 `npm run test:e2e`
      (⚠️ `npm run build`는 OneDrive에서 조용히 죽고 옛 dist가 남는다 — CLAUDE.md 명령 절 참고)
