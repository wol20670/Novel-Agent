// GuiTheme → game/gui.rpy.
// 테마에 따라 달라지는 값(색·폰트·전환·커스텀 vars)은 전부 여기 define gui.* 로 모이고,
// screens.rpy 는 이 변수들만 참조하므로 거의 정적이다(= 테마별 표면적 최소화).
// 레이아웃 수치는 Ren'Py 8.5.3 기본값을 따른다(검증된 값). gui.scale() 은 guisupport.rpy 제공.

import { dialogueGradientMetrics, type GuiTheme } from './theme';

/** guiRpy 그라데이션 인자 — bool 하나로는 페이드 높이 비율까지 못 실어 옵션 객체로 뺐다. */
export interface DialogueGradientOptions {
  enabled: boolean;
  /** 화면 높이 대비 페이드 비율(0.25~0.65) — dialogueGradientMetrics 가 클램프한다. */
  heightRatio: number;
}

export function guiRpy(
  theme: GuiTheme,
  width: number,
  height: number,
  outline?: { enabled: boolean; color: string },
  dialogueGradient?: DialogueGradientOptions,
  japanese?: boolean,
  /**
   * 메인 메뉴 버튼 텍스트 폰트(주/부) — 이미 fontGamePath 로 해석된 게임 내 경로. 미지정이면
   * generate.ts 의 폴백 규칙(main=본문 폰트, sub=main)이 적용된 값이 넘어오지만, 여기서도 같은
   * 규칙으로 한 번 더 방어한다(guiRpy 를 다른 경로에서 직접 호출해도 항상 유효한 값이 나가도록).
   */
  menuFonts?: { main: string; sub: string },
): string {
  const gradientOn = !!dialogueGradient?.enabled;
  // 그라데이션 꺼짐 = 기존 고정값(화면 높이의 1/4), delta 0 → 아래 ypos 식이 "+ 0" 없이 예전과 바이트 동일.
  const metrics = gradientOn ? dialogueGradientMetrics(height, dialogueGradient!.heightRatio) : undefined;
  const textboxHeight = metrics ? metrics.boxHeight : Math.round(height / 4);
  const gradientDelta = metrics ? metrics.delta : 0;
  // window 는 yalign 1.0 + ysize gui.textbox_height 라 "아래 고정, 위로만 자란다".
  // 대사/이름 ypos 는 그 창의 "위쪽 기준" 좌표라서, 창이 delta 만큼 위로 커진 만큼 ypos 에도 같은
  // delta 를 더해야 글자의 화면상 절대 위치가 1px 도 안 바뀐 채 배경(그라데이션)만 위로 확장된다.
  // 즉 delta 보정은 "글자는 그대로 두고 페이드만 길게" 하기 위한 장치 — 없으면 페이드가 길어질수록
  // 글자가 화면 위쪽으로 밀려 올라가 버린다.
  const nameYpos = gradientOn ? `gui.scale(0) + ${gradientDelta}` : 'gui.scale(0)';
  const dialogueYpos = gradientOn ? `gui.scale(50) + ${gradientDelta}` : 'gui.scale(50)';
  // small(모바일) variant 는 원래 대사창 높이를 고정값(240)으로 덮어쓴다. 그라데이션 모드에서
  // 이 줄을 그대로 두면 위에서 delta 만큼 보정한 name/dialogue ypos 와 실제 창 높이가 어긋나
  // 글자가 창 밖으로 밀려난다 — 그라데이션 켜짐이면 이 줄 자체를 내지 않는다(나머지 small 설정은 유지).
  const smallTextboxLine = gradientOn ? '' : '\n        gui.textbox_height = gui.scale(240)';
  // 글자 외곽선(가독성) — 켜면 본문·이름에 동일 외곽선, 끄면 빈 리스트.
  const outlineList = outline?.enabled
    ? `[ (absolute(2), "${outline.color}", absolute(0), absolute(0)) ]`
    : '[]';
  // 일본어 자막/UI(日本語 라벨·JA 번역)가 하나도 없으면 Source Han Sans(≈2.9MB) 폰트와
  // FontGroup 래핑을 통째로 생략한다 — KO/EN 전용 프로젝트의 배포 zip 을 그만큼 줄인다.
  // (buildZip 도 같은 조건으로 폰트 파일 번들을 건너뛴다 — 두 곳이 반드시 함께여야 한다.)
  const jpDef = japanese
    ? `
    def _font_jp(base):
        # 다국어 폰트: 일본어 글자(かな·한자·전각)만 Source Han Sans, 그 외(한글·라틴)는 base 폰트.
        # NanumGothic 은 일본어 글리프가 없어 자막/UI 일본어가 빈칸(□)으로 나오는 문제를 FontGroup 으로 해결.
        # FontGroup 은 "먼저 add 한 범위가 우선" → 일본어 범위를 먼저, 기본(base)을 맨 끝(None)으로.
        fg = FontGroup()
        fg.add("fonts/SourceHanSansLite.ttf", 0x3000, 0x30ff)  # CJK 기호·구두점 + 히라가나 + 가타카나
        fg.add("fonts/SourceHanSansLite.ttf", 0x31f0, 0x31ff)  # 가타카나 음성 확장
        fg.add("fonts/SourceHanSansLite.ttf", 0x3400, 0x4dbf)  # CJK 확장 A
        fg.add("fonts/SourceHanSansLite.ttf", 0x4e00, 0x9fff)  # CJK 통합 한자
        fg.add("fonts/SourceHanSansLite.ttf", 0xf900, 0xfaff)  # CJK 호환 한자
        fg.add("fonts/SourceHanSansLite.ttf", 0xff00, 0xffef)  # 전각/반각 형태
        fg.add(base, None, None)  # 나머지(한글·라틴 등) 기본 폰트
        return fg
`
    : '';
  // 폰트 값: 일본어가 있으면 FontGroup(_font_jp)로 감싸고, 없으면 테마 폰트를 그대로 쓴다.
  const fontVal = (f: string) => (japanese ? `_font_jp("${f}")` : `"${f}"`);
  // 메뉴 버튼 폰트(주/부) — 미지정이면 주=본문 폰트, 부=주 폰트를 따라간다(generate.ts 와 동일 규칙,
  // 여기서 한 번 더 방어). 일본어 FontGroup 처리는 본문/이름/인터페이스 폰트와 동일하게 적용한다.
  const menuMainFont = menuFonts?.main ?? theme.textFont;
  const menuSubFont = menuFonts?.sub ?? menuMainFont;
  // 대사창 배경: 그라데이션이면 buildZip 이 만든 gui/textbox.png 를 Frame(0,0)으로 늘려 쓰고(위로 투명),
  // 아니면 기존 단색 Solid. screens.rpy 의 window 가 이 변수만 참조한다(테마 표면적 최소화).
  const dialogueBg = gradientOn
    ? 'Frame("gui/textbox.png", 0, 0, tile=False)'
    : 'Solid(gui.dialogue_box_color)';
  return `# 자동 생성: GUI 변수 (테마: ${theme.label})
# 색/폰트/전환만 테마로 주입되고 레이아웃은 Ren'Py 8.5.3 기본값을 따른다.

init offset = -2

init python:
    gui.init(${width}, ${height})
${jpDef}
define config.check_conflicting_properties = True


## 색상 (테마) ##################################################################
define gui.accent_color = "${theme.accent}"
define gui.idle_color = "${theme.idle}"
define gui.idle_small_color = "${theme.idle}"
define gui.hover_color = "${theme.accentHover}"
define gui.selected_color = "${theme.accent}"
define gui.insensitive_color = "#7f7f7f80"
define gui.muted_color = "${theme.barTrack}"
define gui.hover_muted_color = "${theme.barThumb}"
define gui.text_color = "${theme.dialogueText}"
define gui.interface_text_color = "${theme.interfaceText}"

## 인게임/인터페이스 보조색 (커스텀 — screens.rpy 의 Solid 배경이 참조)
define gui.dialogue_box_color = "${theme.dialogueBox}"
## 대사창 배경 displayable (단색 또는 투명 그라데이션) — screens.rpy 의 window 가 참조.
define gui.dialogue_background = ${dialogueBg}
define gui.dialogue_name_color = "${theme.nameText}"
define gui.menu_overlay_color = "${theme.menuOverlay}"
define gui.frame_bg_color = "${theme.frameBg}"
define gui.bar_track_color = "${theme.barTrack}"
define gui.bar_thumb_color = "${theme.barThumb}"
define gui.choice_hover_bg = "${theme.choiceHoverBg}"
define gui.choice_idle_bg = "${theme.choiceIdleBg}"


## 폰트 (테마) ##################################################################
define gui.text_font = ${fontVal(theme.textFont)}
define gui.name_text_font = ${fontVal(theme.nameFont)}
define gui.interface_text_font = ${fontVal(theme.interfaceFont)}
## 메인 메뉴 버튼 텍스트 전용(주/부) — screensRpy.ts 의 mm_button_text/mm_main_text/mm_sub_text 가 참조.
define gui.menu_text_font = ${fontVal(menuMainFont)}
define gui.menu_sub_text_font = ${fontVal(menuSubFont)}

## 글자 외곽선 (가독성 — 대사창 위 흰 글자 등). screens.rpy 의 say 스타일이 참조.
define gui.dialogue_outlines = ${outlineList}
define gui.name_outlines = ${outlineList}

define gui.text_size = gui.scale(22)
define gui.name_text_size = gui.scale(30)
define gui.interface_text_size = gui.scale(22)
define gui.label_text_size = gui.scale(24)
define gui.notify_text_size = gui.scale(16)
define gui.title_text_size = gui.scale(50)


## 메인/게임 메뉴 배경 (Canvas 생성 이미지) #####################################
define gui.main_menu_background = "gui/main_menu.png"
define gui.game_menu_background = "gui/game_menu.png"

## 메인 메뉴에 타이틀/버전 표시 (런처 GUI 생성기가 주입하던 값 — 직접 정의).
define gui.show_name = True


## 대사창 ######################################################################
## 720p 스케일값 대신 화면 높이의 1/4 로 고정(대사창이 화면 대비 너무 얇아지는 문제 방지).
define gui.textbox_height = ${textboxHeight}
define gui.textbox_yalign = 1.0

define gui.name_xpos = gui.scale(240)
define gui.name_ypos = ${nameYpos}
define gui.name_xalign = 0.0
define gui.namebox_width = None
define gui.namebox_height = None
define gui.namebox_borders = Borders(gui.scale(12), gui.scale(6), gui.scale(12), gui.scale(6))
define gui.namebox_tile = False

define gui.dialogue_xpos = gui.scale(268)
define gui.dialogue_ypos = ${dialogueYpos}
define gui.dialogue_width = gui.scale(744)
define gui.dialogue_text_xalign = 0.0


## 버튼 ########################################################################
define gui.button_width = None
define gui.button_height = None
define gui.button_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.button_tile = False
define gui.button_text_font = gui.interface_text_font
define gui.button_text_size = gui.interface_text_size
define gui.button_text_idle_color = gui.idle_color
define gui.button_text_hover_color = gui.hover_color
define gui.button_text_selected_color = gui.selected_color
define gui.button_text_insensitive_color = gui.insensitive_color
define gui.button_text_xalign = 0.0

define gui.radio_button_borders = Borders(gui.scale(18), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.check_button_borders = Borders(gui.scale(18), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.confirm_button_text_xalign = 0.5
define gui.page_button_borders = Borders(gui.scale(10), gui.scale(4), gui.scale(10), gui.scale(4))

define gui.quick_button_borders = Borders(gui.scale(10), gui.scale(4), gui.scale(10), gui.scale(0))
define gui.quick_button_text_size = gui.scale(14)
define gui.quick_button_text_idle_color = gui.idle_small_color
define gui.quick_button_text_selected_color = gui.accent_color


## 선택지 버튼 #################################################################
define gui.choice_button_width = gui.scale(790)
define gui.choice_button_height = None
define gui.choice_button_tile = False
define gui.choice_button_borders = Borders(gui.scale(100), gui.scale(8), gui.scale(100), gui.scale(8))
define gui.choice_button_text_font = gui.text_font
define gui.choice_button_text_size = gui.text_size
define gui.choice_button_text_xalign = 0.5
define gui.choice_button_text_idle_color = "${theme.interfaceText}"
define gui.choice_button_text_hover_color = "${theme.choiceHoverText}"
define gui.choice_button_text_selected_color = "${theme.choiceHoverText}"
define gui.choice_button_text_insensitive_color = "#7f7f7f80"


## 세이브 슬롯 #################################################################
define gui.slot_button_width = gui.scale(276)
define gui.slot_button_height = gui.scale(206)
define gui.slot_button_borders = Borders(gui.scale(10), gui.scale(10), gui.scale(10), gui.scale(10))
define gui.slot_button_text_size = gui.scale(14)
define gui.slot_button_text_xalign = 0.5
define gui.slot_button_text_idle_color = gui.idle_small_color
define gui.slot_button_text_selected_idle_color = gui.selected_color
define gui.slot_button_text_selected_hover_color = gui.hover_color

define config.thumbnail_width = gui.scale(256)
define config.thumbnail_height = gui.scale(144)
define gui.file_slot_cols = 3
define gui.file_slot_rows = 2


## 위치·간격 ###################################################################
define gui.navigation_xpos = gui.scale(40)
define gui.skip_ypos = gui.scale(10)
define gui.notify_ypos = gui.scale(45)
define gui.choice_spacing = gui.scale(22)
define gui.navigation_spacing = gui.scale(4)
define gui.pref_spacing = gui.scale(10)
define gui.pref_button_spacing = gui.scale(0)
define gui.page_spacing = gui.scale(0)
define gui.slot_spacing = gui.scale(10)
define gui.main_menu_text_xalign = 1.0


## 프레임·바 ###################################################################
define gui.frame_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.confirm_frame_borders = Borders(gui.scale(40), gui.scale(40), gui.scale(40), gui.scale(40))
define gui.skip_frame_borders = Borders(gui.scale(24), gui.scale(8), gui.scale(60), gui.scale(8))
define gui.notify_frame_borders = Borders(gui.scale(24), gui.scale(8), gui.scale(60), gui.scale(8))
define gui.frame_tile = False

define gui.bar_size = gui.scale(25)
define gui.scrollbar_size = gui.scale(12)
define gui.slider_size = gui.scale(25)
define gui.bar_tile = False
define gui.scrollbar_tile = False
define gui.slider_tile = False
define gui.bar_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.scrollbar_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.slider_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.vbar_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.vscrollbar_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.vslider_borders = Borders(gui.scale(4), gui.scale(4), gui.scale(4), gui.scale(4))
define gui.unscrollable = "hide"


## 히스토리 ####################################################################
define config.history_length = 250
define gui.history_height = gui.scale(140)
define gui.history_spacing = 0
define gui.history_name_xpos = gui.scale(155)
define gui.history_name_ypos = 0
define gui.history_name_width = gui.scale(155)
define gui.history_name_xalign = 1.0
define gui.history_text_xpos = gui.scale(170)
define gui.history_text_ypos = gui.scale(2)
define gui.history_text_width = gui.scale(740)
define gui.history_text_xalign = 0.0


## 전환 (테마) #################################################################
define config.enter_transition = ${theme.uiTransition}
define config.exit_transition = ${theme.uiTransition}
define config.intra_transition = ${theme.uiTransition}
define config.after_load_transition = ${theme.uiTransition}
define config.end_game_transition = ${theme.uiTransition}


## 현지화 ######################################################################
define gui.language = "korean-with-spaces"


################################################################################
## 모바일 변형 (크기만 — 이미지 의존 없음)
################################################################################
init python:

    @gui.variant
    def touch():
        gui.quick_button_borders = Borders(gui.scale(40), gui.scale(14), gui.scale(40), gui.scale(0))

    @gui.variant
    def small():
        gui.text_size = gui.scale(30)
        gui.name_text_size = gui.scale(36)
        gui.notify_text_size = gui.scale(25)
        gui.interface_text_size = gui.scale(30)
        gui.button_text_size = gui.scale(30)
        gui.label_text_size = gui.scale(34)
${smallTextboxLine}
        gui.name_xpos = gui.scale(80)
        gui.dialogue_xpos = gui.scale(90)
        gui.dialogue_width = gui.scale(1100)

        gui.slider_size = gui.scale(36)

        gui.choice_button_width = gui.scale(1240)
        gui.choice_button_text_size = gui.scale(30)

        gui.navigation_spacing = gui.scale(20)
        gui.pref_button_spacing = gui.scale(10)

        gui.history_height = gui.scale(190)
        gui.history_text_width = gui.scale(690)

        gui.quick_button_text_size = gui.scale(20)

        gui.file_slot_cols = 2
        gui.file_slot_rows = 2
`;
}
