# 인수인계 (2026-07-07 세션, 오후~저녁)

다른 기기에서 이어받을 때: **`git pull`만 하면 됩니다.** 아래 내용은 전부 이미 `main`에 커밋·push되어 있습니다. 이 파일은 "무슨 일이 있었는지 + 뭐가 아직 남았는지"를 빠르게 파악하기 위한 것입니다.

## 오늘 main에 반영된 것 (커밋 순서대로)

1. **`5cca9e5` 인수인계 정리** — 낮 세션 HANDOFF.md 삭제·CLAUDE.md 안내줄 제거(낡은 브랜치·NovelAI 메모리 정리 포함, 별도 커밋).
2. **`e330464` 미리보기 대사창 글자색 수정** — 어두운 반투명 배경과 겹쳐 안 보이던 문제(`text-gray-100`→`text-white`).
3. **`a55a287` 캐릭터 외형·성격 입력칸 제거** — 이미지가 이제 외부 제작 후 업로드 방식이라 ChatGPT 프롬프트 메모용이던 캐릭터 외형/성격, 의상별 복장묘사/제외메모 필드 전부 삭제(타입까지 제거).
4. **`ccca82e` 장면 리모컨(🎮) 추가** — 오른쪽 패널에서 장면을 드롭다운/이전·다음으로 바로 스크롤 이동. 협업 중인 상대방 화면엔 영향 없음(순수 로컬 스크롤).
5. **`50f1a26` ~ `bd917ca` Supertone TTS 통합 (이번 세션 최대 작업)**:
   - `50f1a26` 멘트별 보이스 테스트 하네스 최초 구현 — Vercel Edge 프록시(`api/supertone`)로 CORS 우회, `VoiceLab.tsx`(🎙 버튼)로 언어·음성검색·감정·속도·음높이·억양변화 조절 후 생성·재생.
   - `b3572c4` **프록시 버그 수정** — catch-all 라우팅(`api/supertone/[...path].ts`)이 이 Vite 프로젝트의 Vercel 배포에서 경로 2단계 이상(`voices/search` 등)을 전부 404 내는 걸 실제 배포에서 발견 → 고정 경로 `api/supertone.ts` + `?path=` 쿼리스트링 방식으로 근본 수정.
   - `a1cc255` **대사별 성우 음성을 실제 Ren'Py에 반영** — 기존엔 "캐릭터에 저장"해도 게임엔 소리가 전혀 안 나던 걸(테스트 전용 범위였음) `Line.voiceAssetIds`(로케일별) + `attachLineVoice`/`detachLineVoice` + `buildZip.ts`가 `game/voices/{lang}/*.mp3` 로 실제 포함하도록 연결. 기존 반쯤 있던 `voices.rpy`/`vo()`/자막-음성 독립 언어전환 스캐폴딩을 그대로 재사용(신규 시스템 안 만듦).
   - `0cc4eeb` **파일로 바로 적용** — 재생성(크레딧 소모) 없이 이미 다운로드한 mp3를 언어별로 바로 매다는 "📁 파일로 적용" 버튼 추가.
   - `bd917ca` **`voice()` AttributeError 실사용 버그 수정** — `voices.rpy`가 `renpy.voice(path)`를 호출해 실제 플레이 시 크래시(`AttributeError: module 'renpy.exports' has no attribute 'voice'`). `voice()`는 Ren'Py 내장 `00voice.rpy`가 store(전역)에 정의한 함수라 `renpy.` 접두어 없이 불러야 함 — 실제 SDK 소스 확인 후 수정, 실제 워프 실행으로 재검증.
6. **`b95c166` 배경·BGM·아이템 라이브러리에 "해제" 버튼 추가** — CG는 이미 있었는데 나머지 3곳엔 업로드/교체만 있고 제거가 없던 문제. `clearBackgroundGroup`/`clearBgmGroup`/`removeItem` 추가(전부 이름 그룹 단위 일괄 반영).
7. **`fe373a5` 자막 언어 전환 시 대사 기록(History) 전체 삭제되던 문제 수정** — Ren'Py 엔진 기본값 `config.clear_history_on_language_change=True` 때문(엔진 소스로 원인 확인). `False`로 끔.
8. **`3273234` 위 수정의 부작용(기록 중복) 수정** — 언어 전환 시 Ren'Py가 현재 문장을 재실행해(`check_language()`) 기록에 같은 줄이 한 번 더 쌓이던 것. `config.history_callbacks` 훅으로 직전 항목과 완전히 같으면 지우는 dedup 콜백 추가.
9. **(이번 커밋) 퀵메뉴 UI 개편** — 화면 하단에 8개 버튼이 항상 쭉 나열되던 것을, 우상단 "메뉴" 버튼 하나 + 누르면 아래로 펼쳐지는 드롭다운 패널로 변경(`src/renpy/gui/screensRpy.ts`). 진짜 원형 아이콘은 별도 PNG 에셋이 필요해 이번엔 알약형(pill)으로 구현 — 요청 시 원형 에셋 추가 가능.

## ⚠️ 뒤로가기(Back/Rollback) 제한 — 의도적으로 손 안 댐

자막 언어를 바꾸면 그 지점 이전으로는 롤백(뒤로가기)이 안 됩니다. 이건 **버그가 아니라 Ren'Py의 의도적 안전장치**(`renpy.exports.block_rollback()` — 언어 전환 시 스타일 재구축·이미지 캐시 초기화가 일어나서 그 이전 상태로 되돌리면 깨진 참조로 크래시 위험이 있어 엔진이 막아둠, 소스로 확인). 언어 전환 지점을 넘어서까지는 절대 못 돌아가지만, 전환 후 읽은 줄들은 다시 롤백됩니다. 몽키패치로 풀 수도 있지만 다른 안전장치까지 건드릴 위험이 커서 **사용자와 상의 후 손대지 않기로 결정**. 자막 언어는 되도록 시작 화면/설정에서 고르도록 유도하는 게 안전.

## 🧭 전략 방향 논의 — Ren'Py 유지로 결정

친구분들 중 Unity로 VN 만드는 분들이 있어 Unity 전환/자체 시뮬레이터 제작을 고민했음. Gemini가 제안한 "웹앱은 에셋/시나리오 편집, 플레이어만 Unity" 안을 검토했으나:
- Gemini 문서의 핵심 근거 두 가지가 부정확함 — ① Ren'Py도 이미 Steam SDK·Android/iOS 원클릭 빌드 공식 지원(오히려 배포는 Ren'Py가 더 쉬움), ② Ren'Py도 셰이더·애니메이션·미니게임 구현 가능(Python 기반 범용 게임 프레임워크임).
- Unity 전환은 현재 `generate.ts`/`screensRpy.ts`/`buildZip.ts`가 이미 하는 것(대사·세이브·롤백·분기·다국어·성우 재생 등)을 C#으로 처음부터 재구현하는 것과 같아 지금 팀 규모·단계엔 비효율적.
- **결론: 당분간 Ren'Py 유지.** 미니게임처럼 확정 로드맵이 생기면 그때 개별 스파이크(프로토타입)로 재검토. 근거는 `docs/두 분이 하고 싶으신 게 많고(미니게임, 화려한 UIUX 확장).txt`(Gemini 원문) 참고.

## 실제 검증 방법 (계속 유효, 이번 세션에도 여러 번 씀)

```bash
# 1) 임시 스크립트로 generateRenpyFiles() 를 실제 폴더에 씀 (scripts/gen-lint-voice.ts 참고,
#    이번 세션에 자막 다국어(ko+en)+음성 다국어(ko+ja) 시나리오까지 검증하도록 개선해둠)
npx esbuild scripts/gen-lint-voice.ts --bundle --platform=node --format=esm --outfile=<번들>.mjs
node <번들>.mjs

# 2) 실제 Ren'Py SDK로 lint
"C:/renpy/renpy-8.5.3-sdk/renpy.exe" <생성폴더> lint

# 3) 필요하면 실제 실행까지 (--warp 로 특정 줄까지 건너뛰고 실행, 크래시 여부는
#    traceback.txt/log.txt 타임스탬프로 확인 — 새로 안 생기면 그 실행에서 크래시 없었다는 뜻)
"C:/renpy/renpy-8.5.3-sdk/renpy.exe" <생성폴더> run --warp script.rpy:<줄번호> --compile
```

`--warp`는 대사 재생까지는 잘 재현되지만, **화면 안의 파이썬 부작용(예: `renpy.change_language()` 호출)이 warp 도중 실행되는지는 불확실**해서 기록 중복 수정은 lint+코드 검토로만 마무리함(실제 플레이 재확인 필요).

## 남은 것 / 다음에 할 일

- **Supertone 실사용 테스트**: 자막/음성 언어를 서로 다르게 설정하고 실제 스피커로 확인하는 최종 테스트는 사용자 몫(코드·lint 검증까지만 완료).
- **음성 일괄 생성은 여전히 범위 밖**: 지금은 대사 하나씩 수동으로 "🎬 적용"해야 함. 승인된 대사 전체를 한 번에 돌리는 배치 기능은 후속 작업(스코프 크므로 별도 세션 권장).
- **퀵메뉴 원형 아이콘**: 지금은 알약형. 진짜 동그란 아이콘 원하면 원형 PNG 생성 로직을 `canvasMenu.ts`/`buildZip.ts`에 추가해야 함(작은 작업).
- **뒤로가기 제한**: 위 설명대로 의도적 미해결 — 프로덕트 설계(언어는 시작 화면에서 고르게 유도)로 흡수 권장.
- **`.env.example` 삭제 상태**: 이 기기 로컬에서 미커밋 상태로 남아있음(따로 논의: 배포엔 영향 없음, 그대로 둬도 무방 — 다른 기기엔 원본 그대로 있음, 이 기기에서만 삭제된 로컬 상태).

## 로컬 개발 환경 참고

- `.env.local`(기기마다 새로 생성): 기존 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_FONTS_BASE_URL` 외에 **새로 추가된 환경변수는 없음** — Supertone 키는 OpenAI 키와 동일하게 앱 화면에서 입력해 브라우저에만 저장(BYO, `.env` 불필요).
- Vercel 쪽도 별도 설정 불필요 — `api/supertone.ts` Edge 함수는 git push 시 자동 배포됨.
- Windows node/renpy 프로세스 종료는 PowerShell로(`Get-Process node|renpy | Stop-Process -Force`), 그 외 환경 함정은 `CLAUDE.md` 참고.
