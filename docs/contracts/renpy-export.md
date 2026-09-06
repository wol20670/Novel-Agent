# Contract — Ren'Py 생성·내보내기 (생성기 · GUI 실기 함정 · golden · 검증 절차)

> 이 문서는 **"앞으로 무엇을 깨면 안 되는가"의 정본**이다. 무슨 일이 있었는가는
> [`stabilization-r0-r4.md`](../history/stabilization-r0-r4.md) · [`v1-ai-phases.md`](../history/v1-ai-phases.md).
> **이 문서와 코드가 다르면 코드가 이긴다.** history 는 현재 contract 를 override 하지 못한다.
>
> ⚠️ **repo 의 코드 주석이 말하는 "CLAUDE.md 최상위 함정 / CLAUDE.md 규칙 / CLAUDE.md 참고" 중
> Ren'Py·GUI·검증 관련 항목의 현재 정본이 이 문서다**(주석은 이번 정리에서 수정하지 않았다).

## lint 로도 typecheck 로도 못 잡는 런타임 크래시 (최우선)

- **화면 언어의 `add x:` 블록엔 애니메이션 ATL(`easein` 등) 금지** — 정적 속성만.
  애니메이션은 `add x at transform:` 으로 감쌀 것(`src/renpy/gui/screensRpy.ts`).
- **사용자 텍스트는 반드시 `esc`/`escRpyText` 를 거칠 것**(`src/renpy/generate.ts`) —
  `%`·`[`·`{` 미이스케이프는 typecheck·lint 둘 다 못 잡는 **런타임** 크래시다("할인 20%", "[속보]").
  **새 `.rpy` 출력 경로를 추가할 땐 이스케이프부터 확인.**
  이스케이프 헬퍼는 순환 import(`generate`↔`screensRpy`)를 피하려 별도 모듈(`src/renpy/escape.ts`)에 있고
  `generate.ts` 가 재수출한다. 메뉴 라벨도 사용자 입력이라 예외 없이 경유한다.
- **`style_prefix` 로 정의된 적 없는 스타일을 부르면 죽는다**(`radio_hbox` 등).
  ESC 설정 카드 배치가 위젯마다 스타일을 명시하는 이유다.
  frame 에 `style_prefix` 를 걸면 프레임 자신이 `<prefix>_frame` 이 돼 카드 배경도 날아간다.
- **`imagebutton` 에 `focus_mask True` 금지** — 히트박스가 "불투명 픽셀"로 좁아지는데 메뉴 버튼 아트는
  대개 여백이 투명이라 **hover·클릭이 아예 안 먹는다**(실기 재현 확인).
- **참조하는 파일은 zip 에 반드시 들어가야 한다** — `tests/zip-asset-invariant.test.ts` 가 지킨다
  (`collectProjectFiles` 결과의 `.rpy` 텍스트가 참조하는 `images|gui|fonts|audio/…` 경로가 전부 파일 목록에
  있는지 교차 검증, 프리셋·폰트·로케일 매트릭스). **새 에셋 출력 경로를 추가하면 이 테스트 매트릭스에도 추가할 것.**
  참조 쪽(`screensRpy`/`guiRpy`)과 배치 쪽(`buildZip`)이 따로 판단하면 안 되고,
  `buildZip` 이 **생성 전에** blob 유무를 확인해 `mainMenuUi` 를 가지친다(`resolveMainMenuArt`).

## 스프라이트 — 미리보기와 생성기가 판정을 공유한다

**"어느 그림을 세울지"는 `spriteSlots`/`selectSprite`(`src/renpy/generate.ts`) 공유**다.
예전엔 미리보기가 `spriteAssetId`(의상을 버리고 표정 유지), 생성기가 `pickSpriteAttrs`(의상 유지, 표정 강등)로
**같은 줄에서 다른 그림**을 냈다. 폴백은 `요청 의상 pool → '기본' → 전체`, 그 pool 안에서
`wantAttr → neutral → pool[0]`.

- ⚠️ **판정 기준은 Expression 이름이 아니라 `attr` 존재**다 — 커스텀 표정 속성이 32비트 FNV-1a 해시라
  injective 가 아니어서(**D5**) identity 비교로 바꾸면 기존 게임 출력이 달라진다.
  반대로 `'neutral'` 은 커스텀이 항상 `'x'` 접두사라 `'기본'` 전용이 보장되고, base pool 엔 리터럴 `'기본'`
  슬롯이 늘 있어 **base 재진입은 항상 `'기본'` 착지**다.
- ⚠️ **미리보기 carry 는 논리 표정이 아니라 실제 표시된 attr**(생성기 `lastShown.attr` 대응).
  **화자 줄에서만** 논리 표정을 다시 계산하고, 비화자 의상 동기화·숨김 복원은 표시 attr 을 이어받아
  다시 폴백을 태운다. **미리보기에 별도 폴백 state machine 을 만들지 말 것.**
- ⚠️ `optedIn=false`(기본 의상 스프라이트 0)인 캐릭터는 **게임에 아예 안 나오므로** 미리보기가
  예전 `spriteAssetId` 경로를 그대로 유지한다(**D3** 보존 · 임의로 통합하지 말 것).
  `optedIn` 게이트는 `spriteSlots` 호출보다 **앞**에 있어야 한다.
  → D3 를 AI target 축에서 다루는 정본은 [ai-workflows.md](./ai-workflows.md)
- 커스텀 **의상** 속성도 같은 해시라 충돌 가능(**D6**) — 그래서 미리보기 칸 조회는 `outfitAttr` 이 아니라
  **논리 의상 이름**으로 한다. **D5/D6 충돌 자체는 미해결**이며 그 영역의 중복 image 승자는 보장 대상이 아니다.

## 스프라이트 숨김 · CG 복원

- **인물 스프라이트 숨김 판정은 `spriteHiddenFlags`(`src/types/project.ts`) 단일 소스** —
  장면(`Scene.hideSprites`)에서 출발해 줄(`Line.hideSprites`, 3-state)로 뒤집는다.
  생성기·미리보기가 각자 계산하면 어긋난다. `#CG` 는 별개 상태라 호출 측이 OR 로 합친다
  (CG 중엔 `scene` 문이 이미 다 지웠으므로 hide/복원을 내지 말 것).
- ⚠️ **`hide` 뒤의 `show` 는 반드시 속성 전체(`<의상> <표정>`)를 다시 줄 것** —
  태그의 속성 기억이 사라져 속성 없는 `show` 는 없는 이미지 참조로 죽는다
  (그래서 `lastShown` 에 마지막 속성을 기록해 복원한다).
- **CG 종료 복원은 기존 runtime state 재사용**이다 — `revealedOrder`·`currentPos`·`lastShown`·`outfitAt` 를
  그대로 쓰고, **기존 `#인물숨김 → #인물표시` 복원과 generator-local helper 한 벌(`restoreShownSprites`)을 공유**한다.
  ⚠️ **새 snapshot·history·state-machine 을 만들지 말 것.**
  복원값 = 의상은 복원 줄의 fold 값 · 표정은 마지막으로 **실제 표시된** attr(CG 중 대사만 한 표정이 아니다) ·
  위치는 기존 값. **CG 중 처음 등장한 화자는 복원 대상이 아니다**(post-CG 첫 발화에서 정상 등장).
  ⚠️ `hideSprites` 는 캐릭터별이 아니라 **장면 전체 boolean** 이라, 종료 시점에 숨김이면 **아무도** 복원하지 않는다.
- `#CG끝` 에서 생성기는 즉시 ① `scene <일반 배경> at vn_bg with dissolve` ② CG active 종료
  ③ 현재 `hideSprites` 확인 ④ 표시 가능하면 revealed 스프라이트 **즉시** 복원 ⑤ generator hidden 상태 동기화.
  **복원을 다음 대사로 미루지 않는다.** CG 복귀 transition 은 `dissolve` 고정(설정 노출 없음).
  → CG 마커 semantic 전체는 [scene-editor.md](./scene-editor.md)

## BGM

- **BGM 재생은 기본이 `if_changed`**(`project.bgmPlayback`, `playMusicLine`) — Ren'Py 는 `renpy.music.play()` 가
  기본적으로 dequeue+fadeout 후 재큐잉이라 **같은 곡이어도 장면이 바뀌면 처음부터 다시 재생**된다.
  `restartSameBgm: true` 로 옛 동작으로 되돌릴 수 있다.
- `stopWhenUnset: true` 는 `#BGM` 미지정 장면에서 `stop music fadeout 1.0` 을 내는데, 판정은
  **`hasBgm(scene)`(`src/types/project.ts`)** 이지 `generate.ts` 안의 `!r.bgmFile` 이 아니다 —
  *"`#BGM` 을 안 적었다"* 와 *"적었지만 아직 업로드를 안 했다"* 는 다르고, 후자는 작가가 곡을 의도한 자리다.
- **타이틀 화면 BGM 은 `config.main_menu_music`(options.rpy)** — 화면(`screens.rpy`)을 건드릴 일이 아니다.
  엔진 `_main_menu` 가 메인 메뉴 진입마다 `renpy.music.play(..., if_changed=True, ...)` 를 부른다.
  경로는 `titleBgmFile()`(`src/types/menu.ts`) 단일 소스, 업로드가 있을 때만 define 을 낸다.
  ⚠️ **`label start` 에서 곡을 멈추지 않는다**(사용자 결정) — 첫 장면에 `#BGM` 이 없으면 타이틀 곡이
  게임까지 이어지고, 그걸 끊는 건 기존 토글 `bgmPlayback.stopWhenUnset` 하나뿐이다.

## 이미지 GUI · 메뉴 (실기에서만 드러난 함정들)

- **이미지 GUI 에 글자를 굽지 말 것** — 이 앱은 다국어(ko/en/ja)가 핵심인데 글자가 박힌 버튼 이미지는
  언어를 바꿔도 그대로 남는다. 라벨은 Ren'Py 가 그리게 두고 이미지는 틀만(ESC 메뉴 에셋이 그 설계).
  부득이 글자를 구웠다면 **`game/tl/<언어>/` 에 같은 파일명으로 두면 Ren'Py 가 자동 치환**한다
  (`renpy/loader.py` 의 `get_prefixes()`). 없으면 원본으로 폴백.
  ⚠️ **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09 사용자 결정) — 다국어는 텍스트 번역 + 폰트 교체로만.
- **이미지 GUI 3종(메인·퀵·ESC)은 전부 opt-in** — 아무것도 안 올리면 생성 `.rpy` 가 기존과
  **바이트 단위로 같아야 한다**(회귀 0 — `tests/main-menu-ui.test.ts` 가 지킨다).
  좌표는 1920×1080 기준 px 를 `height/1080` 배율로 굽는다 — **`gui.scale()`(720p 기준)을 쓰지 말 것.**
- **ESC 메뉴 이미지 GUI 는 스타일 배경 교체** — 화면을 새로 짜지 않고 `screens.rpy` 끝에 조건부 `style`
  블록만 덧붙인다(`buildEscMenuStyles`). 실기 함정 둘:
  ① 공통배경을 올리면 `game_menu_outer_frame` 의 `Solid(gui.menu_overlay_color)` 스크림이 그 위를 덮어
  **배경이 통째로 안 보인다** → `background None` 필요
  ② 버튼 글자색 규칙이 **좌측 내비와 나머지가 정반대**다(내비는 어두운 사이드바 위라 평상시 밝은 글자,
  선택버튼·슬롯·팝업은 밝은 아트 위라 평상시 어두운 글자). 하나로 통일하면 한쪽이 반드시 안 읽힌다.
- **ESC 메뉴는 이미지를 깔아도 글자는 Ren'Py 가 그린다** — 세이브 날짜·대사 기록·페이지 번호·버전 문자열이
  전부 동적이라 이미지 버튼으로 대체 불가. 색은 `escMenuUi.colors` → `escColors()` 로 병합해
  `buildEscMenuStyles` 가 꽂는다. **하드코딩 금지**(어두운 아트 게임에선 정확히 반대가 된다).
  ⚠️ 좌측 내비 글자색만 리터럴로 남아 있다(카드가 아니라 배경 아트의 사이드바 위 색이라 팔레트가 답을 모른다).
- **ESC 메뉴 글꼴(`escMenuUi.fontId`)은 gui.rpy define 경유** — `escFontStyles` 가 ESC 텍스트 스타일에
  `font gui.esc_text_font` 만 얹고 실제 경로는 `guiRpy.ts` 가 `fontVal()` 로 낸다
  (일본어 프로젝트는 `_font_jp` FontGroup 으로 감싸야 가나가 두부가 안 된다 — 경로를 스타일에 직접 굽지 말 것).
  이 블록은 **항상 맨 마지막**이어야 한다(이름이 색 블록과 겹치는데 테스트 헬퍼 `styleBlock()` 이 첫 등장만 잘라낸다).
- **`gui.history_height = None` 이면 기록 화면이 통째로 다른 배치가 된다** —
  `screen history()` 가 `scroll=("vpgrid" if gui.history_height else "viewport")` 라 엔진이 스스로 갈아탄다.
  ESC 이미지 모드에서만 켜며 **모바일 `small` 변형의 190 도 같이 None** 으로 안 바꾸면 그쪽에서 되살아난다.
  행 사이 여백·구분선은 `escHistoryMetrics()` 단일 소스.
- **ESC 기록 본문은 `style_prefix "history"` 를 쓰지 않는다** — 항목을 `vbox` 로 감쌌는데 prefix 가 살아 있으면
  정의된 적 없는 `history_vbox` 를 찾다 죽는다. 화자 이름의 캐릭터별 색도 ESC 분기에서만 뺐다.
- **`screen navigation()` 은 ESC 메뉴와 텍스트 메인 메뉴가 공용, `screen game_menu()` 는 메뉴 화면 전용** —
  `navigation` 에 조건 없이 추가하면 메인 메뉴 자체 로고와 겹쳐 타이틀 화면에 두 번 나온다(`if not main_menu:` 필요).
  좌측 사이드바 타이틀 로고는 반대로 **`game_menu` 에 조건 없이** 얹는다(사용자 결정).
  로고 파일은 `mainMenuUi.logo` blob 이 있을 때만 zip 에 들어가므로 참조 게이트도 같아야 한다.
- **타이틀에서 연 메뉴도 ESC 공통배경으로 통일**(사용자 결정) — `game_menu()` 의
  `if main_menu: gui.main_menu_background else: ...` 분기는 ESC `bg` 를 올렸을 때만 없앤다.
  게이트는 `buildEscMenuStyles` 가 스크림을 걷는 조건(`has('bg')`)과 **반드시 같아야** 한다.
- **ESC 메뉴 좌표는 `ESC_LAYOUT`(`screensRpy.ts`, 1920 기준 px) 단일 소스** — 기존 스타일은 전부
  `gui.scale()` 상대값이라 업로드 배경이 카드를 어디 그렸는지 모른다. 그대로 두면 제목이 사이드바의
  게임 타이틀을 덮고 격자가 카드 밖으로 흘러내린다(lint·테스트 전부 통과, 시안 대조로만 잡힘).
- **`game_menu_label` 엔 `ypos` 가 필요** — 없으면 제목이 y=0 부터 그려져 카드 위쪽에 걸쳐 잘린 것처럼 보인다.
- **버튼 배경만 이미지로 갈아끼우면 크기는 글자 폭 그대로** — `xminimum`/`yminimum` 을 에셋 규격으로 안 주면
  "예" 버튼이 넓은 알약이 아니라 글자에 테두리만 두른 꼴이 된다(`confirm_button` 200×58, `confirm_frame` 680×330).
  `xysize` 가 아니라 **최소값**이어야 긴 문구에서 넘치지 않는다.
- **ESC 격자는 뷰포트(콘텐츠 폭 − 스크롤바 거터) 안에 들어와야 한다** — `game_menu_viewport` 의 `xsize` 는
  스타일에 박힌 고정값이라 **스크롤 여부와 무관하게 거터가 항상 빠진다**(1810−420−40=1350).
  칸 크기는 `fitGalleryCell` 로 **뷰포트에서 역산**하고(여유 `GALLERY_GRID_SAFETY`),
  격자·그림칸·캡션이 칸 안에 있는지는 기하 불변식 테스트가 지킨다 — **숫자를 손으로 다시 못 박지 말 것.**
- **`add x: fit "contain" xysize(...)` 는 축소 후 크기가 xysize 보다 작다** — `pos` 로 직접 놓으면 세로 사진이
  칸 왼쪽에 쏠려 붙는다. 안쪽 `fixed` 를 두고 `align (0.5, 0.5)` 로 가운데 놓을 것.
- **저장 슬롯 아트 안쪽 칸은 16:9 가 아니다**(298×132 = 2.26:1). `config.thumbnail_*` 을 칸 비율로 바꾸면
  Ren'Py 가 저장 시점에 화면을 비균등 축소해 썸네일이 찌그러진다 — 캡처는 16:9 로 두고 표시할 때
  `fit="cover"` 로 자를 것(둥근 모서리는 `AlphaMask` + 생성 마스크 PNG,
  크기는 `escSlotThumbMetrics` 단일 소스 — `screensRpy.ts`/`buildZip.ts` **양쪽이 같은 값**을 써야 마스크가 안 뭉개진다).
- **`hyperlink_text` 는 `color` 까지 줘야 한다** — 포커스를 못 받는 문맥에선 `idle_color` 가 아니라 `color` 를 쓴다.
- **▶ 등 기호는 이모지 치환 주의** — Ren'Py 는 `TwemojiCOLRv0.ttf` 를 번들하고 기본 스타일이
  `prefer_emoji True` 라 U+25B6 같은 문자가 **파란 재생버튼 이모지로 치환**된다.
  UI 기호엔 스타일에 `emoji_font None` 을 줄 것. 나눔고딕엔 `▶▷◆★•●` 는 있고 `U+25B8·U+2023·U+27A4·✦` 는 **없다**.
- **버튼 "눌린 상태" 이미지는 엔진이 지원 안 함** — `imagebutton` 상태는 idle/hover/selected_*/insensitive 뿐.
  누르는 동안엔 hover 이미지가 보인다.
- **메뉴 글자엔 외곽선이 필요**(`mainMenuUi.textOutline`, 기본 켜짐) — 이미지 버튼 경로에서 좌측 스크림
  프레임을 없앴기 때문에 텍스트 메뉴는 업로드 배경 위에 맨몸으로 놓인다.
- **메뉴 버튼·로고 파일 경로는 `menuButtonFile()`/`TITLE_LOGO_FILE`(`src/types/menu.ts`) 단일 소스**로만 만들 것 —
  `screensRpy.ts`(참조)와 `buildZip.ts`(배치)가 어긋나면 없는 파일 참조로 런타임 크래시.
  **메뉴 폰트(`menuFontId`/`menuSubFontId`)도 같은 대상** — `buildZip` 의 `selectedFontFiles` 에 빠뜨리면
  커스텀 폰트 선택 순간 게임이 안 켜진다.
- **게임 아이콘은 두 군데, 이름도 다르다** — exe 아이콘은 **프로젝트 루트의 `icon.ico`**,
  실행 중 창 아이콘은 **`config.window_icon`**(options.rpy).
  ⚠️ `gui.window_icon` 으로 정의하면 **조용히 무시된다**(그 값을 config 로 옮겨주는 코드가 엔진에 없다).
  경로는 `GAME_ICON_FILE`/`WINDOW_ICON_FILE`(`src/types/menu.ts`) 단일 소스.
- **폰트를 하나도 못 구하면 `DejaVuSans.ttf` 로 폴백**(엔진 내장, 번들 불필요) — 없는 폰트 파일을 참조해
  크래시하느니 한글이 두부로 보여도 켜지는 쪽. `collectProjectFiles` 가 `fontFallbackWarning` 으로 알린다.
- **대사창 그라데이션**: 창 높이·글자 보정량은 `dialogueGradientMetrics()`, 색은 `dialogueGradientColor()`
  (둘 다 `gui/theme.ts`) **단일 소스** — guiRpy(창)와 buildZip(PNG 픽셀 높이)이 어긋나면 Frame 이 늘려/줄여
  곡선이 뭉개진다. 색 기본값을 검정으로 하드코딩하지 말 것(밝은 테마는 본문 글자가 어두워 안 읽힌다).
  페이드를 늘릴 땐 `name/dialogue_ypos` 에 같은 delta 를 더해야 글자가 안 밀린다.

## 플레이어 지정 주인공 이름 — 엔진 한계이지 버그가 아니다

`project.playerName` 은 **"다음 대사부터"** 반영된다(`Character(<callable>, dynamic=True)`).
`who` 는 **say 문이 실행되는 순간 한 번** 평가돼 **문자열로** say 화면에 넘어가고
(`renpy/character.py:1541`), `Text.per_interact` 는 **언어가 바뀔 때만** 재치환한다 —
그래서 설정에서 이름을 바꿔도 **화면에 이미 떠 있는 줄은 안 바뀐다**(실기 확인).
`renpy.restart_interaction()` 으로도 안 된다. 기록 화면이 옛 이름을 남기는 것도 같은 이유.
⚠️ **우회로를 찾느라 시간 쓰지 말 것.** **사용자가 지금 동작을 유지하기로 확정(2026-08-10).**

## golden 회귀 계약 (안정화 R0)

`npm run test` 안의 `tests/renpy-golden.test.ts` 가 생성 결과를 **경로 → SHA-256** 매니페스트
(`tests/golden/renpy-files.json`)와 대조해 **byte 단위 변경**을 잡는다. 현재 baseline = **23구성 / 256파일**.

- 구성의 단일 소스는 **`scripts/renpyConfigs.ts`** 다(`dump:rpy` 와 golden 이 같은 목록을 쓴다).
  **새 Ren'Py 출력 경로·새 opt-in 출력 기능을 만들면 이 파일의 coverage 를 반드시 함께 검토**할 것 —
  구성에 없으면 golden 도 `dump:rpy` 도 그 경로를 보지 못한다(실제로 의상 구성이 plain 과 똑같은 덤프를 내던 걸 잡았다).
- **테스트는 golden 을 읽기만 하고 갱신·쓰기하지 않는다.** 갱신 경로는 **`npm run golden:update` 하나뿐**이다.
  ⚠️ **`golden:update` 는 사용자 명시 승인 없이 실행 금지**이며, 어떤 skill 호출도 그 승인이 아니다.
- golden 은 **어떤 구성의 어떤 경로가 달라졌는지(added/removed/changed)까지만** 알려준다.
  실제 내용 차이는 **`dump:rpy` 두 벌 + `diff -r`** 로 본다.
- 같은 구성에서 같은 path 가 두 번 나오면 **즉시 실패**한다(Record 로 접으면 생성기의 중복 방출을 놓친다).
- ⚠️ `golden:update` 뒤 결정론 확인은 **scratch 사본 2회 byte 비교**로 한다 —
  최초 golden 은 untracked 라 `git diff` 로는 멱등성이 증명되지 않는다.

## 검증 절차

### 출력 회귀 0 증명법

작업 전 커밋에서 `generateRenpyFiles` 를 여러 구성(프리셋 5종·그라데이션·i18n·메뉴 이미지)으로 돌려
`.rpy` 를 덤프해두고, 작업 후 같은 덤프와 `diff -r`. **리팩터·죽은 코드 제거는 여기서 1바이트도 달라지면 안 된다.**
`npm run dump:rpy -- <OneDrive 밖 폴더>` 가 그 도구이고 결정론적이라 같은 코드면 항상 같은 출력이다.

### lint · 실행

`npm run gen:lint` 로 출력 생성 → 실제 `renpy.exe .lint-tmp lint`(이 PC SDK: **`C:\renpy-8.5.3-sdk`**).
**lint 통과 ≠ 동작** — 화면 변경은 `renpy.exe <폴더>` 로 실제 실행해 스크린샷까지 볼 것
(테스트용 프로젝트: `C:\renpy\renpy-scene\`).

- ⚠️ **`gen:lint` 는 `check`·`check:full` 어디에도 들어가지 않는다(의도적 제외)** —
  ① 실제 lint 가 아니라 `.lint-tmp` 산출 단계이고 ② 실제 lint 는 로컬 Ren'Py SDK 에 의존하며
  ③ 생성 텍스트의 byte 회귀는 golden 이 담당한다. 화면·lint 검증이 필요할 때 **수동으로** 부른다.
- ⚠️ **`gen:lint` 산출물은 lint 전용 — 실제 실행하면 메인 메뉴에서 죽는다**(재현 확인).
  `gen-lint.ts` 는 `.rpy` 텍스트에 **리터럴로 박힌** 이미지 참조만 스텁하는데, 버튼 배경은
  `gui/button/[prefix_]background.png` DynamicImage 라 스텁이 안 생기고 `buildZip` 만 굽는다.
  화면 동작 검증은 lint 폴더가 아니라 **실제 내보낸 프로젝트**로 할 것.

### 화면 스크린샷 자동 수집법 (SendKeys 는 Ren'Py 창에 안 먹는다)

임시 `zz_verify.rpy` 에 `label splashscreen:` 을 두고 `renpy.show_screen(...)` → `renpy.pause(...)` →
`renpy.screenshot(path)` 를 돌린 뒤 `renpy.quit()`. 함정 둘:
① **모달 화면(`confirm`)은 `renpy.pause` 가 안 풀린다** → 별도 화면의 `timer` 로 찍고 `Return()` 시킬 것
② **`import renpy.<x>` 를 rpy 안에서 쓰면 스토어의 `renpy`(exports 파사드)를 진짜 모듈로 덮어써 게임이 죽는다**
→ `from renpy.x import Y` 형태만 쓸 것. 프로젝트 복제는 node `cpSync` 가 이 크기에서 죽으니 `robocopy /E` 로.

### e2e 러너 (안정화 R0)

`npm run check:full` 의 러너(`scripts/e2e-run.mjs`)는 매 실행 **`mkdtemp` 새 폴더**에 빌드해
**스테일 dist 를 구조적으로 불가능**하게 만들고, **free port + `--strictPort`** 로 preview 를 띄운 뒤
**응답 본문이 방금 빌드한 `index.html` 과 같은지**까지 확인해 "옛 서버가 200 을 주는" 오탐을 막는다.
끝나면 kill → close 확인 → 임시 폴더 제거 순으로 정리한다(SIGINT/SIGTERM 포함).

⚠️ preview 는 **`--host 127.0.0.1`** 로 바인딩한다 — 기본값 `localhost` 는 Windows 에서 **::1(IPv6)에만**
붙어 127.0.0.1 폴링이 60초 내내 실패한다(실제로 겪음). 수동으로 띄울 때도 같은 함정이 있다.
⚠️ node 에는 **`FileReader` 가 없어** JSZip 이 Blob 입력을 못 읽는다(브라우저에선 정상) →
해당 테스트 파일 안에서만 shim 한다.

⚠️ **OneDrive 빌드 함정**: `vite build` 가 `dist/` 에 쓸 때 간헐적으로 에러 없이 exit 127 로 죽는다(코드 문제 아님).
검증만이면 `npx vite build --outDir <OneDrive 밖> --emptyOutDir`. 생성 폴더는 **OneDrive 밖**(스크래치패드)으로 주고,
검증 전에 gui.rpy 등에서 이번 변경이 실제로 들어갔는지 한 줄 확인할 것.
