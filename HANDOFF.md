# 인수인계 (HANDOFF) — PC → 노트북

> PC 세션에서 작성. **노트북 세션의 Claude Code 가 이어받기 위한 문서**입니다.
> (사용자 메모리 `~/.claude/.../memory/` 는 기기 간 동기가 안 되므로, git 으로 동기되는 이 파일이 유일한 인수인계 경로입니다.)
> 작성: 2026-07-02 (PC)
> **남은 과제(ElevenLabs 실측)가 끝나면 이 파일과 `CLAUDE.md` 상단 포인터 줄을 삭제하세요.**

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

## 2. 검증 상태
- ✅ `npm run typecheck` · `vite build`(OneDrive 밖 경로) 통과.
- ✅ **인게임 확인 완료(오늘 PC)**: 이름 박스 제거 · 대사창 대비 · 게임 메뉴/세이브/설정 가시성 · 스킵 · 자동 · **확인창(예/아니오)** 모두 정상.
- ⚠️ **미검증: ElevenLabs 실제 API 호출(유료 키 필요)** — PCM→WAV 실측(생성·콘솔 채널 로그·재생·`music/` 저장·ZIP 포함). ← **노트북에서(준비되면) 할 유일한 남은 일.**

## 3. 노트북에서 할 일 (남은 과제)
1. `git pull` → `npm run dev`.
2. (준비되면) 좌측 **"🎵 ElevenLabs 음악(BGM) API"** 에 **유료 플랜 키** 입력(상업 배포는 Starter$6+).
3. 장면 선택 → 우측 **"음악 생성"** → 실측:
   - [ ] 생성 성공? [ ] 콘솔 `[ElevenLabs] PCM→WAV` 의 **channels 값이 맞나**(1 또는 2, 재생 속도/피치 정상)? [ ] 미리보기 재생? [ ] `music/` 저장? [ ] Ren'Py ZIP 포함?
4. 문제 시 조정 지점:
   - PCM 채널 추정이 어긋나면 `elevenProvider.ts` `inferPcmChannels`(1.5 임계) 확인.
   - 인증/포맷: `aiConfig.audio.eleven`(host/composePath/model/lengthMs/outputFormat), `vite.config.ts` `/eleven` 프록시. 401=키, 403=무료플랜 제한, 422=바디 파라미터.
5. 메뉴 스크림이 너무 어둡/밝으면 `theme.ts` `ensureReadableMenu` 색값(`#0c0a10d0` 스크림 등) 숫자만 조정.

## 4. 워크플로우 규칙 (CLAUDE.md 준수 — 반드시)
- **커밋·푸시는 사용자가 명시적으로 허락한 뒤에만.** `main` 작업은 **새 브랜치 → `--no-ff` 머지 → push → 브랜치 삭제**.
- 코드 변경 후 **항상 `npm run typecheck`**(가능하면 OneDrive 밖 경로로 `vite build` 한 번 더).
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`.
- **OneDrive 폴더 함정**: `vite build` 가 간헐적으로 에러 없이 exit 127(환경 문제, 코드 아님) → 검증 빌드는 OneDrive 밖 경로로.
- 키(NovelAI `pst-…`·OpenAI·ElevenLabs)·`.secrets/` 는 **절대 커밋 금지**(모두 localStorage/기기 로컬).

## 5. 참고
- 이미지=NovelAI 단일, 텍스트(태그변환·테마)=OpenAI, 음악=ElevenLabs.
- 이 인수인계가 끝나면 이 파일 + `CLAUDE.md` 상단 포인터 줄을 삭제할 것.
