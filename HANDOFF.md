# 인수인계 (HANDOFF) — PC → 노트북

> PC 세션에서 작성. **노트북 세션의 Claude Code 가 이어받기 위한 문서**입니다.
> (사용자 메모리 `~/.claude/.../memory/` 는 기기 간 동기가 안 되므로, git 으로 동기되는 이 파일이 유일한 인수인계 경로입니다.)
> 작성: 2026-07-02 (PC) · 갱신: 2026-07-03 (노트북 — 다국어 음성 파이프라인 추가)
> **남은 실측 2건 — ① ElevenLabs BGM(§3) ② 다국어 음성 TTS(§3-2) — 이 둘이 모두 끝나면 이 파일과 `CLAUDE.md` 상단 포인터 줄을 삭제하세요.**

---

## 0. 시작 전
1. `git pull`(origin/main 최신 = 오늘 작업 반영본).
2. `npm install`(필요 시) → `npm run typecheck` 로 정상 확인.
3. **`test/` 폴더(NovelAI 가이드 PDF·`러브인커피.xlsx`)는 로컬 전용이라 git 에 없음** — 노트북엔 안 따라옵니다(필요하면 따로 복사).

## 1. 오늘(PC 세션) 한 일 — 전부 반영·검증 완료

### A. 최신 코드 리뷰 (main = ElevenLabs BGM 통합)
- 구조/모듈 파악 + BGM 통합이 **ElevenLabs 공식 API 명세와 정확히 일치**함을 문서로 확인(엔드포인트·바디·헤더·응답형).

### B. ElevenLabs BGM — raw PCM 무손실 최적화  *(commit `01e9289`)*
- 출력 포맷 `mp3_44100_128` → **`pcm_44100`**. raw PCM 을 받아 **WAV 헤더만 붙임** → 손실 mp3 인코딩 + AudioContext `decodeAudioData` 를 **둘 다 제거**(음질↑, 코드 단순).
- **채널 수는 하드코딩 대신 응답 바이트 길이로 추정**(모노≈1배/스테레오≈2배, 1.5 임계) → music 이 스테레오여도 재생 속도/피치 안 깨짐. 생성 시 콘솔에 `[ElevenLabs] PCM→WAV (무손실 랩)` 로 `sampleRate/channels/bytes` 를 찍음(실측 때 확인용).
- `mp3`/`opus` 등 컨테이너 포맷으로 되돌리면 기존 `decodeAudioData` 폴백 유지.
- 파일: `src/generators/audio/elevenProvider.ts`, `src/config/aiConfig.ts`.

### C. NAI 배경 letterbox 정리  *(commit `01e9289`)*
- 배경 프롬프트에서 `16:9`·widescreen 문구 제거 + `letterboxed/black bars/border/frame` 네거티브. V4.5 가 비율 문구를 검은 띠로 굽는 문제 대응(화면 채움은 해상도 + Ren'Py fit cover).
- 파일: `src/generators/image/index.ts`, `src/config/aiConfig.ts`.

### D. 인게임/메뉴 GUI 가독성  *(오늘 커밋)*
- **이름 배경 박스·테두리 제거**: `screensRpy.ts` `style namebox` → `background None`. 이름은 외곽선(`name_outlines`)으로만 가독(대사 본문과 동일).
- **대사창 불투명 기본값 정합**: 3곳이 제각각(슬라이더 표시 0.15 vs 내보내기 0.45 vs 단색 0.15)이던 걸 **0.40 으로 통일** + 안내문구 수정. (`buildZip.ts`, `LeftPanel.tsx`, `theme.ts`, `types.ts`)
- **메뉴 가독성 가드 `ensureReadableMenu`**(`theme.ts`, `resolveTheme` 마지막에 적용): 테마 메뉴 베일이 **밝은 색(휘도>0.5)이면** 메뉴만 **어두운 스크림 + 밝은 텍스트 + 어두운 패널**로 강제. **프리셋·AI 커스텀 테마 모두 생성 시점 적용 → 테마 재생성 불필요**. 어두운 테마(호러/SF)는 건드리지 않음.
  - 함께 어둡게: `frameBg`(확인창 예/아니오·게임종료 확인·세이브 슬롯·스킵/알림 상자), `choiceIdleBg`(인게임 선택지 상자), `choiceHoverBg`(슬롯 hover). → 밝은 글자↔밝은 패널 겹침 방지.
  - **왜 프리셋 수정만으론 안 됐나**: 사용자가 커스텀 AI 테마(라이트)를 써서 `resolveTheme` 가 프리셋을 무시 → 가드를 생성 파이프라인에 넣어 해결.

### E. 스킵/자동 기본값  *(오늘 커밋)*
- `src/renpy/generate.ts` `optionsRpy` 에 추가:
  - `default preferences.skip_unseen = True` — 첫 플레이(안 읽은 대사)에서도 **스킵 동작**.
  - `default preferences.afm_time = 15` — **자동 진행** 기본 대기시간 명시(기본값 극단이라 "안 되는 것처럼" 보이던 것 해결). *자동은 화면 클릭 시 해제되는 게 정상.*

## 1-B. 노트북 세션(2026-07-03) 추가 — 글로벌 다국어(자막·음성 독립)  *(commit `ba2986f`)*
- **자막 언어(글언어)와 음성 언어(목소리언어)를 완전 분리** → 인게임 설정에서 각각 라디오로 골라 **교차 선택**(자막 KO/음성 JA) 가능.
  - 자막 = Ren'Py 공식 번역시스템(`config.language` + `game/tl/<lang>/script.rpy` 의 `translate <lang> strings:` old/new).
  - 음성 = `persistent.voice_language` + `voices.rpy` 의 `vo()` 헬퍼(`renpy.loadable` 가드 → 파일 없으면 무음 폴백). 둘이 다른 메커니즘이라 교차 성립.
- **데이터/입력:** `Locale`(ko/en/ja)·`Line.i18n`·`Line.voiced`(opt-in, 크레딧 폭탄 방지)·`Project.baseLocale/textLocales/voiceLocales`·`Character.voiceIds`. 엑셀 **C열=en·D열=ja** 번역 검수, `#설정_글언어`/`#설정_목소리언어` 태그(텍스트 대본은 `글언어:`/`목소리언어:`).
- **성우 provider:** `src/generators/audio/elevenVoiceProvider.ts`(`eleven_multilingual_v2`, BGM 과 키 `na_eleven_key`·`/eleven` 프록시 공유, mp3 직결, 결정적 파일명 `voices/{lang}/{charId}_{sceneLabel}_{idx}.mp3` — timestamp 금지). 설정 = `aiConfig.audio.elevenVoice`.
- **하위호환:** 로케일 미설정 프로젝트는 다국어 산출물 0(기존 프로젝트 무영향 — 검증됨).
- 파일: `types.ts`·`parser/*`·`store.ts`·`renpy/generate.ts`·`renpy/gui/{index,screensRpy}.ts`·`config/aiConfig.ts` + provider 신규.

## 1-C. 노트북 세션(2026-07-03) 추가 — GUI·확인창 문구 언어 일관성  *(commit `1ffa554`)*
- **증상:** 게임 종료/메인메뉴 확인창이 엔진 기본 **영어**로 뜨고(우리 UI 는 한국어라 불일치), 언어를
  영어로 바꿔도 우리 메뉴 리터럴("예/아니오/설정")은 한국어 고정이었음.
- **해결:** UI 전체(메뉴·설정·도움말·확인창)를 자막/음성과 함께 **선택 언어(한/영/일)로 일관 표시**.
  - `src/renpy/gui/uiStrings.ts`(신규) = GUI 문자열 정적 번역표: 엔진 확인창 12종(quit/main menu/삭제/
    덮어쓰기/스킵 등) + 우리 `screensRpy` 리터럴 ~80종, ko/en/ja.
  - `generate.ts` → `game/ui_strings.rpy`: 엔진 확인창(`layout.*`·`gui.*`)을 **게임 기본 언어로 재정의**
    (init 999). **단일 언어 프로젝트에도 항상** 적용 → 한국어 게임의 확인창이 한국어로.
  - `generate.ts` → `game/tl/<lang>/ui.rpy`: 자막 언어별 `translate strings`(확인창 + 우리 UI 전체).
  - **원리:** Ren'Py `substitute()` 가 표시되는 모든 문자열을 `translate_string` 으로 런타임 치환
    (엔진 소스 `substitutions.py`에서 확인). base=한국어 소스 → en/ja 는 tl 로 치환.
- **주의(추후 UI 문구 추가 시):** `screensRpy.ts` 에 새 `_("한국어")` 리터럴을 넣으면 **`uiStrings.ts`
  에도 같은 ko/en/ja 항목을 추가**해야 그 문자열이 번역됨(안 넣으면 그 문자열만 한국어로 남음).
- 파일: `renpy/gui/uiStrings.ts`(신규)·`renpy/generate.ts`.

## 1-D. 노트북 세션(2026-07-03) 추가 — 다국어 UX·일본어 폰트  *(commit 별도)*
- **자막 언어 자동감지**: 엑셀 **C열(en)·D열(ja)에 번역만** 넣으면 `#설정_글언어` 태그 없이도 그 언어가
  인게임 전환 목록에 자동 포함(`effectiveTextLocales` 가 `line.i18n` 을 스캔 → 태그는 명시 override 로 계속 유효).
  번역 0개 프로젝트는 그대로 단일 언어(하위호환 검증됨). 파일: `types.ts`.
  - *왜:* C/D열 규칙을 이미 정한 이상 번역=출력 의사이므로 별도 태그 요구는 불필요한 이중작업이었음.
- **멘트·번역 실시간 인라인 편집**: 장면 카드 대사 미리보기의 각 줄에 `✏️` 버튼(표정 셀렉트 왼쪽) →
  원문·EN·JA 를 그 자리에서 수정(자동세이브). 평소엔 번역을 회색으로 표시. 지문(내레이션)도 편집·번역 가능.
  파일: `store.ts`(`setLineText`/`setLineTranslation`), `components/SceneCard.tsx`(`LineRow`).
- **일본어 폰트 렌더링(FontGroup)**: NanumGothic 은 **일본어 글리프가 0개** → 일본어 자막/UI 가 빈칸(□)이던 문제.
  `gui.rpy` 폰트를 Ren'Py `FontGroup` 으로 감싸 **일본어 범위(かな·한자·전각)만 Source Han Sans
  (SDK 동봉 `SourceHanSansLite.ttf`, SIL OFL)로 폴백**하고 한글·라틴은 NanumGothic 유지. 언어 전환 로직
  불필요·한/일 혼용 자동. **실제 Ren'Py 8.5.3 렌더링으로 실증**(미니 프로젝트 실행 → 스크린샷: 한국어 유지 +
  일본어 정상). 파일: `renpy/gui/guiRpy.ts`(`_font_jp` FontGroup), `zip/buildZip.ts`(폰트 zip 포함),
  `public/fonts/SourceHanSansLite.ttf`(신규), 크레딧 표기(`uiStrings.ts`·`screensRpy.ts`).
  - **한계:** SourceHanSansLite 는 "Lite" 서브셋 → 아주 드문 한자 누락 가능(풀 Noto Sans JP 교체 가능, 경로만 변경).
  - ✅ **조건부 번들링 완료(2026-07-04)**: JP 폰트(~2.9MB)와 `_font_jp` FontGroup 래핑을 **`ja ∈ effectiveTextLocales|effectiveVoiceLocales` 일 때만** 방출/번들(그 외 KO·KO+EN 프로젝트는 평문 폰트, 폰트 fetch 자체 skip). `guiRpy.ts`(japanese 인자)·`gui/index.ts`(조건 계산)·`buildZip.ts`(조건부 fetch) 세 곳이 **동일 규칙**으로 일치. gui.rpy 4개 로케일 조합으로 출력 검증.

## 2. 검증 상태
- ✅ `npm run typecheck` · `vite build`(OneDrive 밖 경로) 통과.
- ✅ **인게임 확인 완료(PC)**: 이름 박스 제거 · 대사창 대비 · 게임 메뉴/세이브/설정 가시성 · 스킵 · 자동 · **확인창(예/아니오)** 모두 정상.
- ✅ **다국어 컴파일단 검증 완료(노트북)**: Ren'Py 8.5.3 SDK `lint` 0에러 + **실게임 전체 플레이**(자막·음성 일본어 런타임 전환, `C:\renpy\renpy-8.5.3-sdk`) 런타임 에러 0. tl/english·tl/japanese·voices.rpy·설정 언어 라디오 모두 동작.
- ✅ **GUI 언어 일관성 검증 완료(노트북)**: `lint` 0에러 + 런타임 `translate_string` 실측(base/영/일 전 UI 문자열 정확 치환 — 확인창·메뉴·예/아니오 포함) + `screensRpy` 리터럴 커버리지 100%(누락 검출 스크립트).
- ✅ **일본어 폰트 렌더링 실증(노트북, 2026-07-03)**: 실제 Ren'Py 8.5.3 로 FontGroup 미니 프로젝트 실행 → 스크린샷 확인. NanumGothic 단독은 일본어가 빈칸, FontGroup 수정본은 `한국어 ABC 日本語 愛してる 字幕言語` 전부 정상. 자동감지(C/D열)·인라인 편집은 `typecheck` + 실제 엑셀 파이프라인(`effectiveTextLocales`=`["ko","en","ja"]`)으로 검증.
- ⚠️ **미검증 ①: ElevenLabs BGM 실제 API 호출(유료 키 필요)** — PCM→WAV 실측(생성·콘솔 채널 로그·재생·`music/` 저장·ZIP 포함). → §3.
- ⚠️ **미검증 ②: 다국어 음성 TTS 실제 호출 + 음성생성 UI/store(현재 미구현)** → §3-2.

## 3. 노트북에서 할 일 (남은 과제)
1. `git pull` → `npm run dev`.
2. (준비되면) 좌측 **"🎵 ElevenLabs 음악(BGM) API"** 에 **유료 플랜 키** 입력(상업 배포는 Starter$6+).
3. 장면 선택 → 우측 **"음악 생성"** → 실측:
   - [ ] 생성 성공? [ ] 콘솔 `[ElevenLabs] PCM→WAV` 의 **channels 값이 맞나**(1 또는 2, 재생 속도/피치 정상)? [ ] 미리보기 재생? [ ] `music/` 저장? [ ] Ren'Py ZIP 포함?
4. 문제 시 조정 지점:
   - PCM 채널 추정이 어긋나면 `elevenProvider.ts` `inferPcmChannels`(1.5 임계) 확인.
   - 인증/포맷: `aiConfig.audio.eleven`(host/composePath/model/lengthMs/outputFormat), `vite.config.ts` `/eleven` 프록시. 401=키, 403=무료플랜 제한, 422=바디 파라미터.
5. 메뉴 스크림이 너무 어둡/밝으면 `theme.ts` `ensureReadableMenu` 색값(`#0c0a10d0` 스크림 등) 숫자만 조정.

## 3-2. 다국어 음성(TTS) 실측 할 일  *(노트북 세션 추가분)*
> **컴파일·실게임(Ren'Py)단은 검증 끝**(§2). 남은 건 **실제 ElevenLabs TTS 호출**인데, 그 전에 **음성 생성 UI/store 배선이 아직 없음**(이번 커밋은 데이터모델·파서·Ren'Py 출력·provider 까지). 아래 ①을 먼저 구현해야 실측 가능.

1. **선행 구현(현재 미구현):**
   - `Character.voiceIds`(언어별 voice_id) 입력 UI + `Line.voiced`(라인별 음성 on/off, 크레딧 안전장치) 토글.
   - store 음성 배치 액션: `elevenVoiceProvider.runVoiceBatch` 호출 → 생성 mp3 를 `assetStore` 저장(`AssetKind='voice'`).
   - `buildZip` 이 음성 에셋을 **결정적 경로** `game/voices/{lang}/{charId}_{sceneLabel}_{idx}.mp3` 로 기록(파일명 헬퍼 `voiceBaseName`/`voiceRelPath` 이미 provider 에 있음). *tl·voices.rpy 텍스트는 이미 zip 에 자동 포함됨.*
2. **키:** BGM 과 동일한 `na_eleven_key`(localStorage) 공유 — 별도 입력 불필요. 유료 플랜 필요(TTS 크레딧 = Music 과 공유).
3. **실측 체크:**
   - [ ] 대사 라인 `voiced` 켜고 캐릭터 `voiceId` 지정 → 음성 생성 성공?
   - [ ] mp3 가 `assetStore` 에 저장되고 미리보기 재생?
   - [ ] Ren'Py ZIP 에 `voices/<lang>/...mp3` 포함?
   - [ ] Ren'Py 실행 → **설정에서 자막 언어/음성 언어를 각각(교차) 바꿔** 대사 재생 시 음성이 맞는 언어로 나오나? 음성 없는 언어는 무음(에러 없음)?
4. **조정 지점:** `aiConfig.audio.elevenVoice`(model=`eleven_multilingual_v2`·outputFormat·voiceSettings), `elevenVoiceProvider.ts`, `vite.config.ts` `/eleven` 프록시. 에러코드 401=키·403=플랜/음성접근·404=voice_id·422=바디·429=크레딧.
5. **이미 끝난 것(재검증 불필요):** 자막 다국어는 **엑셀 C/D열 + 태그만으로 끝까지 동작**(생성→zip→Ren'Py 언어 전환). 음성 인프라(vo/tl/preferences)도 Ren'Py lint + 실게임 통과. 남은 건 오직 실제 TTS 호출 + 위 UI 배선.

## 4. 워크플로우 규칙 (CLAUDE.md 준수 — 반드시)
- **커밋·푸시는 사용자가 명시적으로 허락한 뒤에만.** `main` 작업은 **새 브랜치 → `--no-ff` 머지 → push → 브랜치 삭제**.
- 코드 변경 후 **항상 `npm run typecheck`**(가능하면 OneDrive 밖 경로로 `vite build` 한 번 더).
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`.
- **OneDrive 폴더 함정**: `vite build` 가 간헐적으로 에러 없이 exit 127(환경 문제, 코드 아님) → 검증 빌드는 OneDrive 밖 경로로.
- 키(NovelAI `pst-…`·OpenAI·ElevenLabs)·`.secrets/` 는 **절대 커밋 금지**(모두 localStorage/기기 로컬).

## 5. 참고
- 이미지=NovelAI 단일, 텍스트(태그변환·테마)=OpenAI, 음악=ElevenLabs.
- 이 인수인계가 끝나면 이 파일 + `CLAUDE.md` 상단 포인터 줄을 삭제할 것.
