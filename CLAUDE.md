# CLAUDE.md

> 🔵 **세션 시작 시 [`HANDOFF.md`](./HANDOFF.md) 먼저 확인** — 짧은 살아있는 상태 문서(🎯 다음 할 일 + ✅ 방금 반영됨). 관리 규칙은 아래 워크플로우.

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind). BYO 키, 한국어 코드베이스.
이미지·BGM은 **앱이 생성하지 않음** — 외부 도구에서 만들어 에셋 탭에 업로드. 앱의 AI는 텍스트·보이스 전용(OpenAI `gpt-4o-mini`): 대본 번역(영/일), GUI 테마, Typecast TTS.
`.claude/settings.json`(SessionStart 훅·권한)이 repo에 커밋돼 있어 새 기기는 clone만 하면 인수인계 자동.

## 명령
- `npm run dev`(5173) · `npm run build` · `npm run typecheck`(**코드 변경 후 항상**) · `npm run test`(vitest)
- `npm run gen:lint` — 샘플 대본으로 `.lint-tmp/`에 실제 `.rpy` 생성(+참조 이미지 스텁). 이후 `renpy.exe .lint-tmp lint`. ⚠️ OneDrive에선 산출물은 정상인데 **exit 127로 죽는다**(위 함정) — 파일이 생겼으면 성공이다.
- `npm run test:e2e` — Playwright 풀 파이프라인(분석→업로드→ZIP 내용 검증). `npm run build && npm run preview`(4173)가 먼저 떠 있어야 한다.

## 환경 함정 (중요)
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`. bash `pkill`/`taskkill`은 자주 실패(좀비 `vite preview`가 옛 빌드를 계속 서빙).
- **OneDrive dist 빌드 함정**: `vite build`가 `dist/`에 쓸 때 간헐적으로 에러 없이 exit 127로 죽음 — 코드 문제 아님. 검증만이면 `npx vite build --outDir <OneDrive 밖> --emptyOutDir`(tsc는 무관하게 통과).

## Ren'Py 생성 주의 (lint로도 못 잡는 런타임 버그)
- 화면 언어의 `add x:` 블록엔 애니메이션 ATL(`easein` 등) 금지 — 정적 속성만. 애니메이션은 `add x at transform:`으로 감쌀 것(`src/renpy/gui/screensRpy.ts`).
- **사용자 텍스트는 반드시 `esc`/`escRpyText`를 거칠 것**(`src/renpy/generate.ts`) — `%`·`[`·`{` 미이스케이프는 typecheck·lint 둘 다 못 잡는 **런타임** 크래시("할인 20%", "[속보]"). 새 .rpy 출력 경로를 추가할 땐 이스케이프부터 확인.
- **표정 판정은 `resolveEmotion`(`src/generators/emotion/resolve.ts`) 단일 소스** — 생성기·미리보기·장면카드가 각자 계산하면 어긋난다. 우선순위 = 작가 태그(`Line.emotion`) > AI 배정(`Line.emotionAuto`) > 휴리스틱 > `기본`. ⚠️ **작가 태그는 검증하지 않는다**(파서가 `이름(당황):`을 "작가 신뢰"로 자유 문자열 채택하므로, 선언 목록으로 거르면 대본 태그가 조용히 무시된다). 검증 대상은 사람이 안 쓴 값(AI·휴리스틱)뿐 — 휴리스틱은 `project.expressions`를 모른 채 옛 기본 6종만 뱉어서, 커스텀 세트에선 유령 표정 슬롯 + 플레이스홀더가 게임에 섞인다. **AI 후보 집합(`availableExpressions`, 업로드된 것만)과 최종 검증 집합(선언 목록)은 다르다** — 같게 만들면 "업로드 전 임시 실루엣" 워크플로가 죽는다.
- **이미지 GUI에 글자를 굽지 말 것** — 이 앱은 다국어(ko/en/ja)가 핵심인데 글자가 박힌 버튼 이미지는 언어를 바꿔도 그대로 남는다. 라벨은 Ren'Py가 그리게 두고 이미지는 틀만(ESC 메뉴 에셋이 그 설계). 부득이 글자를 구웠다면 **`game/tl/<언어>/` 에 같은 파일명으로 두면 Ren'Py가 자동 치환**한다(`renpy/loader.py`의 `get_prefixes()`가 모든 탐색 앞에 `tl/<언어>/`를 붙이고, 언어 변경 시 이미지 캐시를 비운다). 없으면 원본으로 폴백.
- **ESC 메뉴 이미지 GUI는 스타일 배경 교체** — 화면을 새로 짜지 않고 `screens.rpy` 끝에 조건부 `style` 블록만 덧붙인다(`buildEscMenuStyles`). ⚠️ 실기에서만 드러난 함정 둘: ① 공통배경을 올리면 `game_menu_outer_frame`의 `Solid(gui.menu_overlay_color)` 스크림이 그 위를 덮어 **배경이 통째로 안 보인다** → `background None` 필요 ② 버튼 글자색 규칙이 **좌측 내비와 나머지가 정반대**다(내비는 어두운 사이드바 위라 평상시 밝은 글자, 선택버튼·슬롯·팝업은 밝은 아트 위라 평상시 어두운 글자). 하나로 통일하면 한쪽이 반드시 안 읽힌다.
- **게임 아이콘은 두 군데, 이름도 다르다** — exe 아이콘은 **프로젝트 루트의 `icon.ico`**(빌드 시 런처가 exe 리소스에 박음, `launcher/game/distribute.rpy`), 실행 중 창 아이콘은 **`config.window_icon`**(options.rpy). ⚠️ `gui.window_icon`으로 정의하면 **조용히 무시된다** — 그 값을 config로 옮겨주는 코드가 엔진에 없다(실기에서 아이콘이 안 바뀌는 걸로 발견). 경로는 `GAME_ICON_FILE`/`WINDOW_ICON_FILE`(`src/types.ts`) 단일 소스.
- **`imagebutton`에 `focus_mask True` 금지** — 히트박스가 "불투명 픽셀"로 좁아지는데 메뉴 버튼 아트는 대개 여백이 투명(글자 획만 불투명)이라 **hover·클릭이 아예 안 먹는다**(실기 재현 확인). lint·typecheck 둘 다 못 잡음.
- **버튼 "눌린 상태" 이미지는 엔진이 지원 안 함** — `imagebutton` 상태는 idle/hover/selected_*/insensitive 뿐. `ImageButton`에 `activate_image` 슬롯이 남아 있으나 `activate_` 프리픽스를 세팅하는 코드가 엔진에 없다(레거시). 누르는 동안엔 hover 이미지가 보인다.
- **메뉴 버튼·로고 파일 경로는 `menuButtonFile()`/`TITLE_LOGO_FILE`(`src/types.ts`) 단일 소스**로만 만들 것 — `screensRpy.ts`(참조)와 `buildZip.ts`(배치)가 어긋나면 없는 파일 참조로 런타임 크래시(폰트 `guiOverrides` 함정과 같은 종류). **메뉴 폰트(`menuFontId`/`menuSubFontId`)도 같은 대상** — `buildZip`의 `selectedFontFiles`에 빠뜨리면 커스텀 폰트 선택 순간 게임이 안 켜진다.
- **메뉴 라벨은 사용자 입력** — `.rpy`로 낼 때 반드시 `escRpyText`(`src/renpy/escape.ts`) 경유. 이스케이프 헬퍼는 순환 import(`generate`↔`screensRpy`)를 피하려 별도 모듈에 있고 `generate.ts`가 재수출한다.
- **메뉴 글자엔 외곽선이 필요**(`mainMenuUi.textOutline`, 기본 켜짐) — 이미지 버튼 경로에서 좌측 스크림 프레임을 없앴기 때문에 텍스트 메뉴는 업로드 배경 위에 맨몸으로 놓인다. 밝은 아트면 글자가 사라진다(실기 확인).
- **ESC 메뉴는 이미지를 깔아도 글자는 Ren'Py가 그린다** — 세이브 날짜·대사 기록·페이지 번호·버전 문자열이 전부 동적이라 이미지 버튼으로 대체 불가. 색은 `escMenuUi.colors`(앱에서 조절, 기본값=**밝은 아이보리 아트** 기준) → `escColors()`(`types.ts`)로 병합해 `buildEscMenuStyles`가 꽂는다. 하드코딩 금지 — 어두운 아트 게임에선 정확히 반대가 된다. ⚠️ 좌측 내비 글자색만 리터럴로 남아 있다(카드가 아니라 배경 아트의 **사이드바 위** 색이라 팔레트가 답을 모른다).
- **ESC 메뉴 글꼴(`escMenuUi.fontId`)은 gui.rpy define 경유** — `escFontStyles`(`screensRpy.ts`)가 ESC 텍스트 스타일들에 `font gui.esc_text_font`만 얹고, 실제 경로는 `guiRpy.ts`가 `fontVal()`로 낸다(일본어 프로젝트는 `_font_jp` FontGroup으로 감싸야 가나가 두부가 안 된다 — 경로를 스타일에 직접 굽지 말 것). 이 블록은 **항상 맨 마지막**이어야 한다(`navigation_button_text` 등 이름이 색 블록과 겹치는데, 테스트 헬퍼 `styleBlock()`이 첫 등장만 잘라낸다). 폰트 파일은 `buildZip`의 `selectedFontFiles`에 반드시 포함(빠뜨리면 폰트 고르는 순간 게임이 안 켜지는 `menuFontId` 함정 재현).
- **`gui.history_height = None`이면 기록 화면이 통째로 다른 배치가 된다** — `screen history()`가 `scroll=("vpgrid" if gui.history_height else "viewport")`라 엔진이 스스로 갈아타고 행이 내용 높이에 맞는다(고정 140px의 성긴 간격·긴 대사 잘림이 한 번에 사라진다). ESC 이미지 모드에서만 켜며 **모바일 `small` 변형의 190도 같이 None**으로 안 바꾸면 그쪽에서 되살아난다.
- **`screen navigation()`은 ESC 메뉴와 텍스트 메인 메뉴가 공용** — 여기 뭔가를 추가하면 반드시 `if not main_menu:`로 감쌀 것(사이드바 타이틀 로고가 타이틀 화면에 두 번 나온다). 로고 파일은 `mainMenuUi.logo` blob이 있을 때만 zip에 들어가므로 참조 게이트도 같아야 한다(`buildEscMenuPlan`이 blob 가지치기 후의 `effectiveProject`를 보므로 자동 일치).
- **ESC 메뉴 좌표는 `ESC_LAYOUT`(`screensRpy.ts`, 1920 기준 px) 단일 소스** — 기존 스타일은 전부 `gui.scale()` 상대값이라 **업로드 배경이 카드를 어디 그렸는지 모른다**. 그대로 두면 제목이 사이드바의 게임 타이틀을 덮고 격자가 카드 밖으로 흘러내린다(lint·테스트 전부 통과, 시안 대조로만 잡힘). `game_menu_navigation_frame`은 hbox의 **빈 자리채기**일 뿐이라(실제 내비는 `use navigation`이 절대좌표로 그린다) 폭을 줄여 콘텐츠 시작 x를 옮겨도 안전하다.
- **`game_menu_label`엔 `ypos`가 필요** — 없으면 제목이 y=0부터 그려져 카드 위쪽(어두운 배경)에 걸쳐 잘린 것처럼 보인다.
- **버튼 배경만 이미지로 갈아끼우면 크기는 글자 폭 그대로** — `xminimum`/`yminimum`을 에셋 규격으로 안 주면 "예" 버튼이 시안의 넓은 알약이 아니라 글자에 테두리만 두른 꼴이 된다(`confirm_button` 200×58, `confirm_frame` 680×330). `xysize`가 아니라 최소값이어야 긴 문구에서 넘치지 않는다.
- **`add x: fit "contain" xysize(...)`는 축소 후 크기가 xysize보다 작다** — `pos`로 직접 놓으면 세로 사진이 칸 왼쪽에 쏠려 붙는다. 안쪽 `fixed`를 두고 `align (0.5, 0.5)`로 가운데 놓을 것.
- **저장 슬롯 아트 안쪽 칸은 16:9가 아니다**(298×132 = 2.26:1). `config.thumbnail_*`을 칸 비율로 바꾸면 Ren'Py가 저장 시점에 화면을 비균등 축소해 썸네일이 찌그러진다 — 캡처는 16:9로 두고 표시할 때 `fit="cover"`로 자를 것(둥근 모서리는 `AlphaMask` + 생성 마스크 PNG, 크기는 `escSlotThumbMetrics` 단일 소스 — `screensRpy.ts`/`buildZip.ts` 양쪽이 같은 값을 써야 마스크가 안 뭉개진다).
- **`style_prefix`로 정의된 적 없는 스타일을 부르면 죽는다**(`radio_hbox` 등) — ESC 설정 카드 배치가 위젯마다 스타일을 명시하는 이유. frame에 `style_prefix`를 걸면 프레임 자신이 `<prefix>_frame`이 돼 카드 배경도 날아간다.
- **`hyperlink_text`는 `color`까지 줘야 한다** — 포커스를 못 받는 문맥에선 `idle_color`가 아니라 `color`를 쓴다(정보·크레딧·도움말의 `{a=}` 링크가 테마 분홍으로 남던 원인).
- **▶ 등 기호는 이모지 치환 주의** — Ren'Py는 `TwemojiCOLRv0.ttf`를 번들하고 기본 스타일이 `prefer_emoji True`라, U+25B6(이모지 등급 UNQUALIFIED) 같은 문자가 **파란 재생버튼 이모지로 치환**된다. UI 기호엔 스타일에 `emoji_font None`을 줄 것(엔진 자체도 `00director.rpy`에서 같은 관용구 사용). 나눔고딕엔 `▶▷◆★•●`는 있고 `U+25B8·U+2023·U+27A4·✦`는 **없다**(두부).
- **참조하는 파일은 zip에 반드시 들어가야 한다** — `tests/zip-asset-invariant.test.ts`가 지킨다(`collectProjectFiles` 결과의 `.rpy` 텍스트가 참조하는 `images|gui|fonts|audio/…` 경로가 전부 파일 목록에 있는지 교차 검증, 프리셋·폰트·로케일 매트릭스). **새 에셋 출력 경로를 추가하면 이 테스트 매트릭스에도 추가할 것.** 참조 쪽(`screensRpy`/`guiRpy`)과 배치 쪽(`buildZip`)이 따로 판단하면 안 되고, `buildZip`이 **생성 전에** blob 유무를 확인해 `mainMenuUi`를 가지치기한다(`resolveMainMenuArt` — `adopt*Fonts`와 같은 패턴).
- **폰트를 하나도 못 구하면 `DejaVuSans.ttf`로 폴백**(엔진 `renpy/common/` 내장, 번들 불필요) — 없는 폰트 파일을 참조해 크래시하느니 한글이 두부로 보여도 켜지는 쪽. `collectProjectFiles`가 `fontFallbackWarning`으로 사용자에게 알린다.
- 검증: `npm run gen:lint`로 출력 생성 → 실제 `renpy.exe .lint-tmp lint`(이 PC SDK: **`C:\renpy\renpy-8.5.3-sdk`**). **lint 통과 ≠ 동작** — 화면 변경은 `renpy.exe <폴더>`로 실제 실행해 스크린샷까지 볼 것(테스트용 프로젝트: `C:\renpy\renpy-scene\`, 실기 에셋이 든 사용자 프로젝트는 `…\카페테리아`).
- **화면 스크린샷 자동 수집법**(SendKeys는 Ren'Py 창에 안 먹는다) — 임시 `zz_verify.rpy`에 `label splashscreen:`을 두고 `renpy.show_screen(...)` → `renpy.pause(...)` → `renpy.screenshot(path)` 를 돌린 뒤 `renpy.quit()`. 함정 둘: ① **모달 화면(`confirm`)은 `renpy.pause`가 안 풀린다** → 별도 화면의 `timer`로 찍고 `Return()` 시킬 것 ② **`import renpy.<x>`를 rpy 안에서 쓰면 스토어의 `renpy`(exports 파사드)를 진짜 모듈로 덮어써 게임이 죽는다**(`renpy.music` 없다며 00mixers에서 크래시) → `from renpy.x import Y` 형태만 쓸 것. 프로젝트 복제는 node `cpSync`가 이 크기에서 죽으니 `robocopy /E`로.
- **출력 회귀 0 증명법**: 작업 전 커밋에서 `generateRenpyFiles`를 여러 구성(프리셋 5종·그라데이션·i18n·메뉴 이미지)으로 돌려 `.rpy`를 덤프해두고, 작업 후 같은 덤프와 `diff -r`. 리팩터·죽은 코드 제거는 여기서 1바이트도 달라지면 안 된다.

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB — 브라우저별(기기 이동은 앱 📤/📥 `.npproj.zip`), 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`, Ren'Py 출력=`src/renpy/generate.ts`, AI 설정=`src/config/aiConfig.ts`.
- 미업로드 에셋은 Canvas 플레이스홀더로 자동 채움 — 단 **BGM은 플레이스홀더 없음**(미업로드 씬은 `play music` 미방출, 파일명 `.mp3` 고정).
- 메인 메뉴 이미지 GUI(`project.mainMenuUi`): 아무것도 안 올리면 `screens.rpy` 출력이 **바이트 단위로 기존과 동일**해야 한다(회귀 0 — `tests/main-menu-ui.test.ts`가 지킴). 좌표는 1920×1080 기준 px를 `height/1080` 배율로 구움 — **`gui.scale()`(720p 기준)을 쓰지 말 것**.
- 대사창 그라데이션: 창 높이·글자 보정량은 `dialogueGradientMetrics()`, 색은 `dialogueGradientColor()`(둘 다 `gui/theme.ts`) **단일 소스** — guiRpy(창)와 buildZip(PNG 픽셀 높이)이 어긋나면 Frame이 늘려/줄여 곡선이 뭉개진다. 색 기본값을 검정으로 하드코딩하지 말 것(밝은 테마는 본문 글자가 어두워 안 읽힘 — 실기 확인). 페이드를 늘릴 땐 `name/dialogue_ypos`에 같은 delta를 더해야 글자가 안 밀린다(`style window`는 하단 고정·위로 자람).
- 협업(src/collab/): Supabase last-write-wins relay(저장마다 600ms 디바운스 push) + 프레즌스, 에코 판정은 세션별 client_id. ⚠️ `projects` 테이블·Storage `assets` 버킷 모두 **RLS on + anon 개방 정책** 필수(정책 없이 RLS만 켜면 400). 전체 SQL=`supabase/setup.sql`(idempotent) — 재구축뿐 아니라 **스키마 바뀌는 버전업 배포 전에도 재실행**(예: client_id 컬럼, 없으면 협업 저장 400 / `assets open delete` 정책, 없으면 원격 정리 403).
  - **에셋 삭제는 로컬(IndexedDB)에만 반영된다** — 교체·해제·초기화 어디에도 원격 삭제가 없어 버킷은 단조 증가한다(업로드 경로만 있고 삭제 경로가 없던 비대칭). 회수는 에셋 탭 "☁️ 협업 Storage 정리" 스윕이 유일한 경로(`collab/assetsGc.ts` + `assetRefs.diffRemoteOrphans`). **교체 즉시 원격 삭제는 일부러 안 넣었다** — 상대가 아직 pull 안 했거나 LWW로 옛 프로젝트가 다시 올라오면 아직 쓰는 이미지를 지워 상대 화면에서 그림이 사라진다.
  - 스윕 판정은 **① projects 전 행의 참조 합집합**(Storage 키가 평면 구조라 방 구분이 없어, 내 프로젝트 기준으로만 빼면 남의 방 파일을 지운다) **② 업로드 후 유예 기간**(`REMOTE_GRACE_OPTIONS` — 기본 7일, UI에서 1일·전체로 변경 가능. 교체 직후 파일은 대부분 최근이라 7일 고정이면 정작 치우고 싶을 때 목록이 비어 나온다) 두 가드에 걸려 있다. 둘 중 하나라도 빼면 남이 쓰는 에셋을 지우는 데이터 손실이 된다.
  - **실제 노출 범위(중요 — "방 코드 아는 사람만"보다 넓다)**: anon 키는 설계상 번들에 구워져 공개된다(`supabaseClient.ts`). RLS 정책이 전부 개방(`true`)이고 Storage 오브젝트 키가 `<assetId>` 평면 구조라 **방 단위 구분이 없다** → 배포 사이트를 열 수 있는 사람은 누구나 `assets` 버킷 전체를 목록 조회·다운로드·업로드·덮어쓰기 할 수 있다. 실질 방어선은 "배포 URL을 모른다" 하나. 2인 사설 도구라 감수한 선택(2026-08-05 사용자 확인) — 뒤집으려면 공개 버킷+SELECT 정책 제거(열거 차단) 또는 Edge 함수 signed URL이 필요. **`service_role` 키는 RLS를 통째로 우회하니 절대 repo·번들에 넣지 말 것.**
  - Supabase 대시보드가 "Clients can list all files in this bucket / Remove policy"를 띄워도 **그 버튼을 누르면 안 된다** — `.download()`가 인증 엔드포인트를 타 SELECT 정책을 필요로 해서, 지우는 즉시 에셋 동기화가 400으로 깨진다(원격 정리 스윕의 목록 조회도 같이 죽는다).
  - `@supabase/supabase-js`는 **지연 로딩**(`getSupabaseClient()` 안의 동적 import) — 초기 번들에서 ~210KB 분리. 협업이 꺼져 있으면 아예 안 받는다. `supabaseClient.ts`에 최상위 `import`를 되살리지 말 것.
- 폰트(src/fonts/): GCS 공개 버킷 온디맨드 fetch→IndexedDB 캐시(기본 나눔고딕만 로컬 번들). `guiOverrides.bodyFontId`/`nameFontId`는 gui.rpy(`theme.ts`)와 zip 폰트파일(`buildZip.ts`) **양쪽 일치 필수**(하나만 바꾸면 없는 파일 참조).
- **zustand 구독은 필드 단위로**(`useStore((s) => s.project.title)`) — `s.project` 통째 구독은 프로젝트가 매번 새 객체라 **무관한 키 입력마다** 그 트리 전체가 재렌더된다. 셀렉터는 렌더 여부와 무관하게 **모든 `set()`마다 전부 재실행**되므로 셀렉터 안에서 `scenes.find(...)` 금지 — `sceneById()`(`store.ts`, `WeakMap<Scene[], Map>` 인덱스)를 쓸 것(150장면×150카드 = 키 입력당 2만 회 비교였다).
- 에셋 object URL은 `useAssetUrl`의 **ref-count 공유 캐시** 경유 — 같은 blob을 두 컴포넌트가 물어도 URL은 하나. `assetStore`의 삭제/초기화가 `subscribeAssetChange`로 무효화를 통지한다.
- gitignore: `.secrets/`, `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자 명시 허락 전까지 절대 금지.** 코드 수정·검증은 자유. `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`(가능하면 OneDrive 밖 빌드로 한 번 더). 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`).
- **병합·브랜치 정리는 자동**(사용자 명시 요청, 2026-07-11): 커밋·푸시가 이미 승인된 브랜치는 typecheck(+가능하면 test) 통과 상태면 다시 묻지 않고 `main` fast-forward 병합 → push → 로컬·원격 브랜치 삭제. **ff 불가(충돌)·검증 실패면** 자동 진행하지 말고 확인. 끝나면 요약 보고.
- **HANDOFF.md 인수인계**(삭제 금지·짧게 유지): 세션 시작 시 `✅ 방금 반영됨`이 git log에 실제 있는지 확인 후 그 줄 삭제. 작업 끝엔 완료분 1줄을 `✅`에, 남은·새 일을 `🎯`에 갱신(서술 금지 — 이력은 git log).
