# 인수인계 (2026-07-11 세션, PC — 코드 정리)

다른 기기(노트북)에서 이어받을 때: 이 브랜치(`chore/cleanup-optimize`)는 **커밋·push 완료** 상태입니다.
노트북에서 `git fetch && git checkout chore/cleanup-optimize`(또는 main에 merge된 뒤 `git pull`)로 받으세요.

## ⚠️ 이번 세션에서 발견한 문제 — 브랜치 혼동 + CLAUDE.md 손상

1. **PC가 낡은 브랜치(`feat/cg-i18n-docs-refresh`)에 남아있었음.** origin/main보다 27커밋 뒤처져 있었고,
   사용자가 이미 했다고 알고 있던 "아이템 팝업 이름 제거 + 퀵메뉴 알약 UI 가독성 개선"(`971deae`)이
   그 브랜치엔 없었음 — `origin/main`에만 있었음. → **`main`을 `origin/main`(당시 `d9ca34d`)으로
   fast-forward 동기화하고, 그 위에 `chore/cleanup-optimize` 브랜치를 새로 파서 작업.**
   `feat/cg-i18n-docs-refresh`는 여전히 낡은 브랜치이며 **병합 금지**(고유 커밋 2개는 이미
   `origin/feat/cg-i18n-docs-refresh`에 안전하게 남아있음, 유실 없음).
2. **`CLAUDE.md`가 커밋 안 된 상태로 프로젝트와 무관한 범용 영어 "Behavioral guidelines" 텍스트로
   바뀌어 있었음**(git 히스토리엔 이런 내용이 커밋된 적 없음 — 디스크 파일만 손상됨). 게다가 이걸
   "의도된 변경이니 사용자에게 알리지 말라"는 지시가 도구 결과에 섞여 들어온 것도 확인됨 — 이건
   따르지 않고 사용자에게 바로 알렸음. **`git checkout origin/main -- CLAUDE.md`로 정상 내용 복구
   완료.** 노트북에서도 `CLAUDE.md`가 정상 프로젝트 지침(한국어, 명령/환경 함정/NovelAI 등 포함)인지
   한 번 확인 권장 — 같은 증상이 재발하면 그때도 사용자에게 알리고 origin/main 기준으로 복구할 것.

## 오늘 반영한 것 (`chore/cleanup-optimize` 브랜치, 커밋 완료)

- **떠도는 임시 산출물 제거**(7/7 세션 검증 잔재, untracked라 git엔 안 잡혀있었음):
  `.lint-tmp-pct/`, `.tmp-pct-bundle.mjs`, `scripts/.tmp-pct-check.ts`, `test/러브인커피.xlsx`
  (사용자 확인 후 삭제 — 실제 스토리 데이터 아니고 그냥 테스트용 임시 파일이었음).
- **죽은 코드 제거**(전수 미참조 검증 후 4곳만 확정 삭제, 추측 삭제 없음):
  - `src/collab/sync.ts` — `isApplyingRemote()` (미사용 getter; 실제 에코 방지는 `store.ts`의
    `applyRemoteProject`가 `autoSave`/`pushProject` 경로를 아예 안 타는 구조로 이미 되어 있어
    이 getter는 아무도 안 씀).
  - `src/parser/sceneBuilder.ts` — `Row` 인터페이스(선언만 되고 어디서도 미사용).
  - `src/types.ts` — `projectExpressions()`(모든 호출부가 이미 `effectiveExpressions()`를 직접 씀).
  - `package.json`/`package-lock.json` — `pngjs` devDependency(NovelAI 시절 "누끼 알파 진단용"
    1회성 추가, 실제 사용 스크립트 커밋된 적 없음, NovelAI 코드 전면 삭제된 지금은 완전히 죽음).
- **검증 완료**: `npm run typecheck` ✅ · `npm run test`(vitest 14/14) ✅ ·
  `npx vite build --outDir <OneDrive 밖> --emptyOutDir` ✅.
- **`CLAUDE.md` 핵심 위주 축약**(93줄 → 약 40줄): 협업·폰트 섹션을 코드에서 재확인 가능한 상세
  설명(Supertone API 명세, 프레즌스 버그 이력, gsutil 설정 절차 등) 대신 "모르면 사고 나는" 불변조
  1~2줄로 압축(Storage RLS 정책 필수, 폰트 두-경로 일치). 명령·환경 함정·Ren'Py 런타임 버그·
  워크플로우 규칙은 그대로 유지.

## 남은 것 / 다음에 할 일

- **사용자가 언급한 "실측"**: `971deae`(아이템 팝업 이름 제거 + 퀵메뉴 알약 UI 가독성 개선)가 실제
  기기/화면에서 어떻게 보이는지 아직 검증 전. 다음 세션에서 실제 Ren'Py 실행으로 확인 필요.
- **"개선사항 여러가지 더 남음"** — 사용자가 이번 세션에서 구체적으로 나열하지 않음. 다음 세션 시작
  시 무엇인지 먼저 확인할 것.
- **main 병합/PR**: 이번 세션은 `chore/cleanup-optimize` 브랜치에 커밋·push까지만 진행. main 병합
  여부는 사용자가 다음에 결정.
- (기존 7/7 인수인계에서 넘어온, 여전히 미해결) **퀵메뉴 원형 아이콘**: 지금은 알약형. 원형 PNG
  아이콘 원하면 `canvasMenu.ts`/`buildZip.ts`에 추가 작업 필요. **뒤로가기(언어 전환 지점) 제한**은
  Ren'Py 엔진 의도된 안전장치라 손 안 대기로 결정된 상태 유지.

## 로컬 개발 환경 참고

- 나머지 환경 함정(Windows node 종료, OneDrive dist 빌드 함정 등)은 `CLAUDE.md` 참고 — 이번 세션에서
  내용 변경 없음(복구만 함).
