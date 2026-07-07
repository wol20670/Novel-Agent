// game/screens.rpy — 모든 필수 화면을 자체 정의(상업 배포 시 누락 화면 크래시 방지).
// Ren'Py 8.5.3 기본 screens.rpy 를 토대로 하되:
//   - 모든 이미지 의존(button/bar/frame/overlay/textbox PNG)을 Solid/색으로 대체 → 외부 PNG 0개
//   - 색·폰트는 전부 gui.rpy 의 define gui.* 참조 → 테마만 바꾸면 전체 룩 전환
//   - nvl/bubble 화면과 phone 전용(이미지) 스타일은 제외(우리는 ADV 일반 대사)
// 테마 의존 값이 없으므로 정적이지만, 다국어 선택 UI 주입을 위해 인자를 받는다.

import type { Locale } from '../../types';
import { RENPY_LANG, LOCALE_LABEL } from '../../types';
import type { GuiLocales } from './index';

/**
 * 설정 화면 preferences 에 주입할 "자막 언어 / 음성 언어" 선택 블록(Ren'Py).
 * 자막(config.language)과 음성(persistent.voice_language)은 독립 라디오라 교차 선택이 된다.
 * 각 목록이 2개 이상일 때만 해당 블록이 나온다. 12칸 들여쓰기(preferences 의 바깥 vbox 기준).
 */
function languagePrefsBlock(locales?: GuiLocales): string {
  if (!locales) return '';
  const text = locales.text ?? [];
  const voice = locales.voice ?? [];
  const showText = text.length > 1;
  const showVoice = voice.length > 1;
  if (!showText && !showVoice) return '';

  const base = text[0]; // effectiveTextLocales 는 base 를 맨 앞에 둔다.
  const I = (n: number) => ' '.repeat(n);
  const lines: string[] = [];
  lines.push(`${I(12)}hbox:`);
  lines.push(`${I(16)}box_wrap True`);
  lines.push('');

  if (showText) {
    lines.push(`${I(16)}vbox:`);
    lines.push(`${I(20)}style_prefix "radio"`);
    lines.push(`${I(20)}label _("자막 언어")`);
    for (const loc of text) {
      // 기본 언어(대본 원문)는 번역 블록이 없어 Language(None).
      const action = loc === base ? 'Language(None)' : `Language("${RENPY_LANG[loc]}")`;
      lines.push(`${I(20)}textbutton _("${LOCALE_LABEL[loc]}") action ${action}`);
    }
    lines.push('');
  }

  if (showVoice) {
    lines.push(`${I(16)}vbox:`);
    lines.push(`${I(20)}style_prefix "radio"`);
    lines.push(`${I(20)}label _("음성 언어")`);
    for (const loc of voice as Locale[]) {
      lines.push(
        `${I(20)}textbutton _("${LOCALE_LABEL[loc]}") action SetField(persistent, "voice_language", "${loc}")`,
      );
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

/** 아이템 팝업(인게임) + 다시보기 라이트박스 + 발견한 아이템 보관함 화면(hasItems 일 때만 방출). */
const ITEM_SCREENS = String.raw`

################################################################################
## 아이템(소품) 팝업 + 발견한 아이템 보관함
################################################################################

## 인게임 팝업 — 배경 살짝 딤 + 중앙 컷아웃 + 이름 캡션.
## zorder 를 대사창(say=0)보다 낮게 둬서 배경·인물만 어둡게 덮고 대사 글자는 안 가린다.
screen item_popup(img, caption):
    zorder -5
    add Solid("#00000073")
    add img at transform:
        fit "contain"
        ysize int(config.screen_height * 0.45)
        anchor (0.5, 0.5)
        pos (0.5, 0.42)
        alpha 0.0 zoom 0.9
        easein 0.22 alpha 1.0 zoom 1.0
    text caption:
        xalign 0.5
        ypos 0.72
        size gui.name_text_size
        color gui.accent_color
        outlines [ (absolute(2), "#000000", absolute(0), absolute(0)) ]

## 보관함에서 다시보기 — 모달 라이트박스(닫기/Esc 로 종료). tag 없음 = 갤러리 위에 겹쳐 뜬다.
screen item_lightbox(img, caption):
    modal True
    zorder 100
    add Solid("#000000cc")
    add img:
        fit "contain"
        ysize int(config.screen_height * 0.6)
        anchor (0.5, 0.5)
        pos (0.5, 0.45)
    text caption:
        xalign 0.5
        ypos 0.82
        size gui.name_text_size
        color gui.accent_color
    textbutton _("닫기"):
        xalign 0.5
        ypos 0.9
        action Hide("item_lightbox")
    key "game_menu" action Hide("item_lightbox")

## 발견한 아이템 보관함 — 발견=썸네일(클릭 시 라이트박스), 미발견=??? 잠김.
screen item_gallery():
    tag menu
    use game_menu(_("발견한 아이템"), scroll="viewport"):
        vpgrid:
            cols 4
            spacing gui.scale(18)
            for it_tag, it_name in gui.items_all:
                vbox:
                    spacing gui.scale(4)
                    xsize gui.scale(200)
                    if persistent.item_found.get(it_tag, False):
                        button:
                            xysize (gui.scale(200), gui.scale(200))
                            action Show("item_lightbox", img=it_tag, caption=it_name)
                            add it_tag:
                                fit "contain"
                                xysize (gui.scale(184), gui.scale(184))
                                align (0.5, 0.5)
                        text it_name xalign 0.5 size gui.scale(16)
                    else:
                        frame:
                            xysize (gui.scale(200), gui.scale(200))
                            background Solid(gui.frame_bg_color)
                            text "???" align (0.5, 0.5) size gui.scale(34) color gui.insensitive_color
                        text _("???") xalign 0.5 size gui.scale(16) color gui.insensitive_color
`;

export function screensRpy(locales?: GuiLocales, hasItems?: boolean): string {
  const languagePrefs = languagePrefsBlock(locales);
  // 아이템이 있을 때만 보관함 진입 버튼(내비)과 아이템 화면들을 낸다.
  const galleryNav = hasItems ? '        textbutton _("발견한 아이템") action ShowMenu("item_gallery")' : '';
  const galleryScreens = hasItems ? ITEM_SCREENS : '';
  return String.raw`################################################################################
## 자동 생성: 자체 GUI 화면 (zero-PNG, Solid 기반)
################################################################################

init offset = -1


################################################################################
## Styles
################################################################################

style default:
    properties gui.text_properties()
    language gui.language

style input:
    properties gui.text_properties("input", accent=True)
    adjust_spacing False

style hyperlink_text:
    properties gui.text_properties("hyperlink", accent=True)
    hover_underline True

style gui_text:
    properties gui.text_properties("interface")


style button:
    properties gui.button_properties("button")

style button_text is gui_text:
    properties gui.text_properties("button")
    yalign 0.5


style label_text is gui_text:
    properties gui.text_properties("label", accent=True)

style prompt_text is gui_text:
    properties gui.text_properties("prompt")


## 바/스크롤바/슬라이더 — 전부 Solid (이미지 없음)
style bar:
    ysize gui.bar_size
    left_bar Solid(gui.bar_thumb_color)
    right_bar Solid(gui.bar_track_color)

style vbar:
    xsize gui.bar_size
    top_bar Solid(gui.bar_thumb_color)
    bottom_bar Solid(gui.bar_track_color)

style scrollbar:
    ysize gui.scrollbar_size
    base_bar Solid(gui.bar_track_color)
    thumb Solid(gui.bar_thumb_color)

style vscrollbar:
    xsize gui.scrollbar_size
    base_bar Solid(gui.bar_track_color)
    thumb Solid(gui.bar_thumb_color)

style slider:
    ysize gui.slider_size
    left_bar Solid(gui.bar_thumb_color)
    right_bar Solid(gui.bar_track_color)
    thumb Transform(Solid(gui.accent_color), xysize=(gui.scale(8), gui.slider_size))

style vslider:
    xsize gui.slider_size
    top_bar Solid(gui.bar_thumb_color)
    bottom_bar Solid(gui.bar_track_color)
    thumb Transform(Solid(gui.accent_color), xysize=(gui.slider_size, gui.scale(8)))


style frame:
    padding gui.frame_borders.padding
    background Solid(gui.frame_bg_color)



################################################################################
## In-game screens
################################################################################

## Say screen ##################################################################

screen say(who, what):

    window:
        id "window"

        if who is not None:

            window:
                id "namebox"
                style "namebox"
                text who id "who"

        text what id "what"

    if not renpy.variant("small"):
        add SideImage() xalign 0.0 yalign 1.0


init python:
    config.character_id_prefixes.append('namebox')

style window is default
style say_label is default
style say_dialogue is default
style say_thought is say_dialogue

style namebox is default
style namebox_label is say_label


style window:
    xalign 0.5
    xfill True
    yalign gui.textbox_yalign
    ysize gui.textbox_height
    background gui.dialogue_background

style namebox:
    xpos gui.name_xpos
    xanchor gui.name_xalign
    xsize gui.namebox_width
    ypos gui.name_ypos
    ysize gui.namebox_height
    ## 이름 배경 박스·테두리 제거 — 이름은 name_outlines(외곽선)로만 가독성 확보(대사 본문과 동일).
    ## (기존: Frame(Solid(gui.frame_bg_color), ...) 로 하늘색 박스가 그려져 거슬렸음.)
    background None
    padding gui.namebox_borders.padding

style say_label:
    properties gui.text_properties("name", accent=True)
    color gui.dialogue_name_color
    outlines gui.name_outlines
    bold True
    xalign gui.name_xalign
    yalign 0.5

style say_dialogue:
    properties gui.text_properties("dialogue")
    outlines gui.dialogue_outlines
    xpos gui.dialogue_xpos
    xsize gui.dialogue_width
    ypos gui.dialogue_ypos
    adjust_spacing False


## Input screen ################################################################

screen input(prompt):
    style_prefix "input"

    window:

        vbox:
            xanchor gui.dialogue_text_xalign
            xpos gui.dialogue_xpos
            xsize gui.dialogue_width
            ypos gui.dialogue_ypos

            text prompt style "input_prompt"
            input id "input"

style input_prompt is default

style input_prompt:
    xalign gui.dialogue_text_xalign
    properties gui.text_properties("input_prompt")

style input:
    xalign gui.dialogue_text_xalign
    xmaximum gui.dialogue_width


## Choice screen ###############################################################

screen choice(items):
    style_prefix "choice"

    vbox:
        for i in items:
            textbutton i.caption action i.action


style choice_vbox is vbox
style choice_button is button
style choice_button_text is button_text

style choice_vbox:
    xalign 0.5
    ypos gui.scale(270)
    yanchor 0.5
    spacing gui.choice_spacing

style choice_button is default:
    properties gui.button_properties("choice_button")
    padding (gui.scale(26), gui.scale(12))
    background Solid(gui.choice_idle_bg)
    hover_background Solid(gui.accent_color)
    selected_background Solid(gui.accent_color)
    insensitive_background Solid(gui.choice_idle_bg)

style choice_button_text is default:
    properties gui.text_properties("choice_button")


## Quick Menu screen ###########################################################

screen quick_menu():

    zorder 100

    if quick_menu:

        # 우상단에 항상 떠 있는 톱니바퀴(메뉴) 버튼 — 누르면 바로 아래로 목록이 펼쳐진다.
        # (진짜 원형 아이콘은 별도 PNG 에셋이 있어야 해서, 우선 둥근 느낌의 알약형 버튼으로 구현.)
        textbutton _("메뉴"):
            style "quick_gear_button"
            xalign 1.0
            yalign 0.0
            action ToggleVariable("quick_menu_expanded")

        if quick_menu_expanded:
            vbox:
                style_prefix "quick"
                style "quick_menu"
                xalign 1.0
                yalign 0.0

                textbutton _("뒤로") action [Rollback(), SetVariable("quick_menu_expanded", False)]
                textbutton _("기록") action [ShowMenu('history'), SetVariable("quick_menu_expanded", False)]
                textbutton _("스킵") action [Skip(), SetVariable("quick_menu_expanded", False)] alternate Skip(fast=True, confirm=True)
                textbutton _("자동") action [Preference("auto-forward", "toggle"), SetVariable("quick_menu_expanded", False)]
                textbutton _("저장") action [ShowMenu('save'), SetVariable("quick_menu_expanded", False)]
                textbutton _("빠른저장") action [QuickSave(), SetVariable("quick_menu_expanded", False)]
                textbutton _("빠른불러오기") action [QuickLoad(), SetVariable("quick_menu_expanded", False)]
                textbutton _("설정") action [ShowMenu('preferences'), SetVariable("quick_menu_expanded", False)]


init python:
    config.overlay_screens.append("quick_menu")

default quick_menu = True
## 메뉴 펼침 상태(로컬 변수 아님 — 게임 진행 변수라 세이브/롤백에도 자연히 포함됨).
default quick_menu_expanded = False

style quick_menu is vbox
style quick_button is default
style quick_button_text is button_text

style quick_menu:
    xalign 1.0
    yalign 0.0
    yoffset gui.scale(56)
    spacing gui.scale(2)

style quick_button:
    properties gui.button_properties("quick_button")

style quick_button_text:
    properties gui.text_properties("quick_button")

## 톱니바퀴(메뉴) 토글 버튼 — quick_button 과 같은 색감, 위치만 화면 우상단 고정.
style quick_gear_button is quick_button
style quick_gear_button_text is quick_button_text

style quick_gear_button:
    xpadding gui.scale(16)
    ypadding gui.scale(10)


################################################################################
## Main and Game Menu Screens
################################################################################

## Navigation screen ###########################################################

screen navigation():

    vbox:
        style_prefix "navigation"

        xpos gui.navigation_xpos
        yalign 0.5
        spacing gui.navigation_spacing

        if main_menu:

            textbutton _("시작") action Start()

        else:

            textbutton _("기록") action ShowMenu("history")
            textbutton _("저장") action ShowMenu("save")

        textbutton _("불러오기") action ShowMenu("load")
        textbutton _("설정") action ShowMenu("preferences")

        if _in_replay:

            textbutton _("리플레이 종료") action EndReplay(confirm=True)

        elif not main_menu:

            textbutton _("메인 메뉴") action MainMenu()

        textbutton _("정보") action ShowMenu("about")

        textbutton _("크레딧") action ShowMenu("credits")
${galleryNav}
        if renpy.variant("pc") or (renpy.variant("web") and not renpy.variant("mobile")):

            textbutton _("도움말") action ShowMenu("help")

        if renpy.variant("pc"):

            textbutton _("종료") action Quit(confirm=not main_menu)


style navigation_button is gui_button
style navigation_button_text is gui_button_text

style navigation_button:
    size_group "navigation"
    properties gui.button_properties("navigation_button")

style navigation_button_text:
    properties gui.text_properties("navigation_button")


## Main Menu screen ############################################################

screen main_menu():

    tag menu

    add gui.main_menu_background

    frame:
        style "main_menu_frame"

    use navigation

    if gui.show_name:

        vbox:
            style "main_menu_vbox"

            text "[config.name!t]":
                style "main_menu_title"

            text "[config.version]":
                style "main_menu_version"


style main_menu_frame is empty
style main_menu_vbox is vbox
style main_menu_text is gui_text
style main_menu_title is main_menu_text
style main_menu_version is main_menu_text

style main_menu_frame:
    xsize gui.scale(320)
    yfill True
    background Solid(gui.menu_overlay_color)

style main_menu_vbox:
    xalign 1.0
    xoffset gui.scale(-30)
    xmaximum gui.scale(1200)
    yalign 1.0
    yoffset gui.scale(-30)

style main_menu_text:
    properties gui.text_properties("main_menu", accent=True)

style main_menu_title:
    properties gui.text_properties("title")

style main_menu_version:
    properties gui.text_properties("version")


## Game Menu screen ############################################################

screen game_menu(title, scroll=None, yinitial=0.0, spacing=0):

    style_prefix "game_menu"

    if main_menu:
        add gui.main_menu_background
    else:
        add gui.game_menu_background

    frame:
        style "game_menu_outer_frame"

        hbox:

            frame:
                style "game_menu_navigation_frame"

            frame:
                style "game_menu_content_frame"

                if scroll == "viewport":

                    viewport:
                        yinitial yinitial
                        scrollbars "vertical"
                        mousewheel True
                        draggable True
                        pagekeys True

                        side_yfill True

                        vbox:
                            spacing spacing
                            transclude

                elif scroll == "vpgrid":

                    vpgrid:
                        cols 1
                        yinitial yinitial
                        scrollbars "vertical"
                        mousewheel True
                        draggable True
                        pagekeys True

                        side_yfill True
                        spacing spacing
                        transclude

                else:

                    transclude

    use navigation

    textbutton _("돌아가기"):
        style "return_button"
        action Return()

    label title

    if main_menu:
        key "game_menu" action ShowMenu("main_menu")


style game_menu_outer_frame is empty
style game_menu_navigation_frame is empty
style game_menu_content_frame is empty
style game_menu_viewport is gui_viewport
style game_menu_side is gui_side
style game_menu_scrollbar is gui_vscrollbar

style game_menu_label is gui_label
style game_menu_label_text is gui_label_text

style return_button is navigation_button
style return_button_text is navigation_button_text

style game_menu_outer_frame:
    bottom_padding gui.scale(30)
    top_padding gui.scale(120)
    background Solid(gui.menu_overlay_color)

style game_menu_navigation_frame:
    xsize gui.scale(320)
    yfill True

style game_menu_content_frame:
    left_margin gui.scale(40)
    right_margin gui.scale(20)
    top_margin gui.scale(10)

style game_menu_viewport:
    xsize gui.scale(920)

style game_menu_vscrollbar:
    unscrollable gui.unscrollable

style game_menu_side:
    spacing gui.scale(10)

style game_menu_label:
    xpos gui.scale(50)
    ysize gui.scale(120)

style game_menu_label_text:
    size gui.scale(50)
    color gui.accent_color
    yalign 0.5

style return_button:
    xpos gui.navigation_xpos
    yalign 1.0
    yoffset gui.scale(-30)


## About screen ################################################################

screen about():

    tag menu

    use game_menu(_("정보"), scroll="viewport"):

        style_prefix "about"

        vbox:

            label "[config.name!t]"
            text _("버전 [config.version!t]\n")

            if gui.about:
                text "[gui.about!t]\n"

            text _("Made with {a=https://www.renpy.org/}Ren'Py{/a} [renpy.version_only].\n\n[renpy.license!t]")


style about_label is gui_label
style about_label_text is gui_label_text
style about_text is gui_text

style about_label_text:
    size gui.label_text_size


## Credits screen #############################################################
## 크레딧/라이선스 고지 — 사용한 에셋 출처와 엔진/폰트 라이선스를 표기(상업 배포용).
## gui.credits_extra 는 game/credits.rpy 에서 항상 정의된다(작성 내용은 앱에서 입력).

screen credits():

    tag menu

    use game_menu(_("크레딧"), scroll="viewport"):

        style_prefix "about"

        vbox:
            spacing gui.scale(6)

            label "[config.name!t]"
            text _("버전 [config.version!t]\n")

            if gui.about:
                text "[gui.about!t]\n"

            text "[gui.credits_extra]\n"

            text _("{b}엔진{/b}\nMade with {a=https://www.renpy.org/}Ren'Py{/a} [renpy.version_only].\n[renpy.license!t]\n")

            text _("{b}폰트{/b}\n나눔고딕(NanumGothic), Source Han Sans — 모두 SIL Open Font License 1.1 (상업적 사용 허용).")


## Load and Save screens #######################################################

screen save():

    tag menu

    use file_slots(_("저장"))


screen load():

    tag menu

    use file_slots(_("불러오기"))


screen file_slots(title):

    default page_name_value = FilePageNameInputValue(pattern=_("페이지 {}"), auto=_("자동 저장"), quick=_("빠른 저장"))

    use game_menu(title):

        fixed:

            order_reverse True

            button:
                style "page_label"

                key_events True
                xalign 0.5
                action page_name_value.Toggle()

                input:
                    style "page_label_text"
                    value page_name_value

            grid gui.file_slot_cols gui.file_slot_rows:
                style_prefix "slot"

                xalign 0.5
                yalign 0.5
                spacing gui.slot_spacing

                for i in range(gui.file_slot_cols * gui.file_slot_rows):

                    $ slot = i + 1

                    button:
                        action FileAction(slot)

                        has vbox

                        add FileScreenshot(slot) xalign 0.5

                        text FileTime(slot, format=_("{#file_time}%Y.%m.%d (%A) %H:%M"), empty=_("빈 슬롯")):
                            style "slot_time_text"

                        text FileSaveName(slot):
                            style "slot_name_text"

                        key "save_delete" action FileDelete(slot)

            vbox:
                style_prefix "page"

                xalign 0.5
                yalign 1.0

                hbox:
                    xalign 0.5
                    spacing gui.page_spacing

                    textbutton _("<") action FilePagePrevious()
                    key "save_page_prev" action FilePagePrevious()

                    if config.has_autosave:
                        textbutton _("{#auto_page}A") action FilePage("auto")

                    if config.has_quicksave:
                        textbutton _("{#quick_page}Q") action FilePage("quick")

                    for page in range(1, 10):
                        textbutton "[page]" action FilePage(page)

                    textbutton _(">") action FilePageNext()
                    key "save_page_next" action FilePageNext()


style page_label is gui_label
style page_label_text is gui_label_text
style page_button is gui_button
style page_button_text is gui_button_text

style slot_button is gui_button
style slot_button_text is gui_button_text
style slot_time_text is slot_button_text
style slot_name_text is slot_button_text

style page_label:
    xpadding gui.scale(50)
    ypadding gui.scale(3)
    xalign 0.5

style page_label_text:
    textalign 0.5
    layout "subtitle"
    hover_color gui.hover_color

style page_button:
    properties gui.button_properties("page_button")

style page_button_text:
    properties gui.text_properties("page_button")

style slot_button:
    properties gui.button_properties("slot_button")
    background Solid(gui.frame_bg_color)
    hover_background Solid(gui.choice_hover_bg)
    padding (gui.scale(6), gui.scale(6))

style slot_button_text:
    properties gui.text_properties("slot_button")


## Preferences screen ##########################################################

screen preferences():

    tag menu

    use game_menu(_("설정"), scroll="viewport"):

        vbox:

            hbox:
                box_wrap True

                if renpy.variant("pc") or renpy.variant("web"):

                    vbox:
                        style_prefix "radio"
                        label _("디스플레이")
                        textbutton _("창 모드") action Preference("display", "window")
                        textbutton _("전체 화면") action Preference("display", "fullscreen")

                vbox:
                    style_prefix "check"
                    label _("스킵")
                    textbutton _("읽지 않은 대사") action Preference("skip", "toggle")
                    textbutton _("선택 후에도") action Preference("after choices", "toggle")
                    textbutton _("전환 효과") action InvertSelected(Preference("transitions", "toggle"))

            null height (4 * gui.pref_spacing)

${languagePrefs}            hbox:
                style_prefix "slider"
                box_wrap True

                vbox:

                    label _("텍스트 속도")
                    bar value Preference("text speed")

                    label _("자동 진행 시간")
                    bar value Preference("auto-forward time")

                vbox:

                    if config.has_music:
                        label _("음악 볼륨")

                        hbox:
                            bar value Preference("music volume")

                    if config.has_sound:

                        label _("효과음 볼륨")

                        hbox:
                            bar value Preference("sound volume")

                            if config.sample_sound:
                                textbutton _("테스트") action Play("sound", config.sample_sound)

                    if config.has_voice:
                        label _("음성 볼륨")

                        hbox:
                            bar value Preference("voice volume")

                            if config.sample_voice:
                                textbutton _("테스트") action Play("voice", config.sample_voice)

                    if config.has_music or config.has_sound or config.has_voice:
                        null height gui.pref_spacing

                        textbutton _("전체 음소거"):
                            action Preference("all mute", "toggle")
                            style "mute_all_button"


style pref_label is gui_label
style pref_label_text is gui_label_text
style pref_vbox is vbox

style radio_label is pref_label
style radio_label_text is pref_label_text
style radio_button is gui_button
style radio_button_text is gui_button_text
style radio_vbox is pref_vbox

style check_label is pref_label
style check_label_text is pref_label_text
style check_button is gui_button
style check_button_text is gui_button_text
style check_vbox is pref_vbox

style slider_label is pref_label
style slider_label_text is pref_label_text
style slider_slider is gui_slider
style slider_button is gui_button
style slider_button_text is gui_button_text
style slider_pref_vbox is pref_vbox

style mute_all_button is check_button
style mute_all_button_text is check_button_text

style pref_label:
    top_margin gui.pref_spacing
    bottom_margin gui.scale(2)

style pref_label_text:
    yalign 1.0

style pref_vbox:
    xsize gui.scale(225)

style radio_vbox:
    spacing gui.pref_button_spacing

style radio_button:
    properties gui.button_properties("radio_button")

style radio_button_text:
    properties gui.text_properties("radio_button")

style check_vbox:
    spacing gui.pref_button_spacing

style check_button:
    properties gui.button_properties("check_button")

style check_button_text:
    properties gui.text_properties("check_button")

style slider_slider:
    xsize gui.scale(350)

style slider_button:
    properties gui.button_properties("slider_button")
    yalign 0.5
    left_margin gui.scale(10)

style slider_button_text:
    properties gui.text_properties("slider_button")

style slider_vbox:
    xsize gui.scale(450)


## History screen ##############################################################

screen history():

    tag menu

    predict False

    use game_menu(_("기록"), scroll=("vpgrid" if gui.history_height else "viewport"), yinitial=1.0, spacing=gui.history_spacing):

        style_prefix "history"

        for h in _history_list:

            window:

                has fixed:
                    yfit True

                if h.who:

                    label h.who:
                        style "history_name"
                        substitute False

                        if "color" in h.who_args:
                            text_color h.who_args["color"]

                $ what = renpy.filter_text_tags(h.what, allow=gui.history_allow_tags)
                text what:
                    substitute False

        if not _history_list:
            label _("대화 기록이 비어 있습니다.")


define gui.history_allow_tags = { "alt", "noalt", "rt", "rb", "art" }


style history_window is empty

style history_name is gui_label
style history_name_text is gui_label_text
style history_text is gui_text

style history_label is gui_label
style history_label_text is gui_label_text

style history_window:
    xfill True
    ysize gui.history_height

style history_name:
    xpos gui.history_name_xpos
    xanchor gui.history_name_xalign
    ypos gui.history_name_ypos
    xsize gui.history_name_width

style history_name_text:
    min_width gui.history_name_width
    textalign gui.history_name_xalign

style history_text:
    xpos gui.history_text_xpos
    ypos gui.history_text_ypos
    xanchor gui.history_text_xalign
    xsize gui.history_text_width
    min_width gui.history_text_width
    textalign gui.history_text_xalign
    layout ("subtitle" if gui.history_text_xalign else "tex")

style history_label:
    xfill True

style history_label_text:
    xalign 0.5


## Help screen #################################################################

screen help():

    tag menu

    default device = "keyboard"

    use game_menu(_("도움말"), scroll="viewport"):

        style_prefix "help"

        vbox:
            spacing gui.scale(15)

            hbox:

                textbutton _("키보드") action SetScreenVariable("device", "keyboard")
                textbutton _("마우스") action SetScreenVariable("device", "mouse")

                if GamepadExists():
                    textbutton _("게임패드") action SetScreenVariable("device", "gamepad")

            if device == "keyboard":
                use keyboard_help
            elif device == "mouse":
                use mouse_help
            elif device == "gamepad":
                use gamepad_help


screen keyboard_help():

    hbox:
        label _("Enter")
        text _("대사를 진행하고 인터페이스를 활성화합니다.")

    hbox:
        label _("Space")
        text _("선택지를 고르지 않고 대사를 진행합니다.")

    hbox:
        label _("방향키")
        text _("인터페이스를 탐색합니다.")

    hbox:
        label _("Escape")
        text _("게임 메뉴를 엽니다.")

    hbox:
        label _("Ctrl")
        text _("누르고 있는 동안 대사를 스킵합니다.")

    hbox:
        label _("Tab")
        text _("대사 스킵을 토글합니다.")

    hbox:
        label _("Page Up")
        text _("이전 대사로 롤백합니다.")

    hbox:
        label _("Page Down")
        text _("이후 대사로 롤포워드합니다.")

    hbox:
        label "H"
        text _("사용자 인터페이스를 숨깁니다.")

    hbox:
        label "S"
        text _("스크린샷을 찍습니다.")

    hbox:
        label "V"
        text _("보조 {a=https://www.renpy.org/l/voicing}셀프 보이싱{/a}을 토글합니다.")

    hbox:
        label "Shift+A"
        text _("접근성 메뉴를 엽니다.")


screen mouse_help():

    hbox:
        label _("왼쪽 클릭")
        text _("대사를 진행하고 인터페이스를 활성화합니다.")

    hbox:
        label _("가운데 클릭")
        text _("사용자 인터페이스를 숨깁니다.")

    hbox:
        label _("오른쪽 클릭")
        text _("게임 메뉴를 엽니다.")

    hbox:
        label _("휠 위로")
        text _("이전 대사로 롤백합니다.")

    hbox:
        label _("휠 아래로")
        text _("이후 대사로 롤포워드합니다.")


screen gamepad_help():

    hbox:
        label _("오른쪽 트리거\nA/아래 버튼")
        text _("대사를 진행하고 인터페이스를 활성화합니다.")

    hbox:
        label _("왼쪽 트리거\n왼쪽 숄더")
        text _("이전 대사로 롤백합니다.")

    hbox:
        label _("오른쪽 숄더")
        text _("이후 대사로 롤포워드합니다.")

    hbox:
        label _("D-패드, 스틱")
        text _("인터페이스를 탐색합니다.")

    hbox:
        label _("Start, Guide, B/오른쪽 버튼")
        text _("게임 메뉴를 엽니다.")

    hbox:
        label _("Y/위 버튼")
        text _("사용자 인터페이스를 숨깁니다.")

    textbutton _("보정") action GamepadCalibrate()


style help_button is gui_button
style help_button_text is gui_button_text
style help_label is gui_label
style help_label_text is gui_label_text
style help_text is gui_text

style help_button:
    properties gui.button_properties("help_button")
    xmargin gui.scale(8)

style help_button_text:
    properties gui.text_properties("help_button")

style help_label:
    xsize gui.scale(250)
    right_padding gui.scale(20)

style help_label_text:
    size gui.text_size
    xalign 1.0
    textalign 1.0



################################################################################
## Additional screens
################################################################################

## Confirm screen ##############################################################

screen confirm(message, yes_action, no_action):

    modal True

    zorder 200

    style_prefix "confirm"

    add Solid("#00000099")

    frame:

        vbox:
            xalign .5
            yalign .5
            spacing gui.scale(30)

            label _(message):
                style "confirm_prompt"
                xalign 0.5

            hbox:
                xalign 0.5
                spacing gui.scale(100)

                textbutton _("예") action yes_action
                textbutton _("아니오") action no_action

    key "game_menu" action no_action


style confirm_frame is gui_frame
style confirm_prompt is gui_prompt
style confirm_prompt_text is gui_prompt_text
style confirm_button is gui_medium_button
style confirm_button_text is gui_medium_button_text

style confirm_frame:
    background Frame(Solid(gui.frame_bg_color), gui.confirm_frame_borders, tile=gui.frame_tile)
    padding gui.confirm_frame_borders.padding
    xalign .5
    yalign .5

style confirm_prompt_text:
    textalign 0.5
    layout "subtitle"

style confirm_button:
    properties gui.button_properties("confirm_button")

style confirm_button_text:
    properties gui.text_properties("confirm_button")


## Skip indicator screen #######################################################

screen skip_indicator():

    zorder 100
    style_prefix "skip"

    frame:

        hbox:
            spacing gui.scale(6)

            text _("스킵 중")

            text "▸" at delayed_blink(0.0, 1.0) style "skip_triangle"
            text "▸" at delayed_blink(0.2, 1.0) style "skip_triangle"
            text "▸" at delayed_blink(0.4, 1.0) style "skip_triangle"


transform delayed_blink(delay, cycle):
    alpha .5

    pause delay

    block:
        linear .2 alpha 1.0
        pause .2
        linear .2 alpha 0.5
        pause (cycle - .4)
        repeat


style skip_frame is empty
style skip_text is gui_text
style skip_triangle is skip_text

style skip_frame:
    ypos gui.skip_ypos
    background Frame(Solid(gui.frame_bg_color), gui.skip_frame_borders, tile=gui.frame_tile)
    padding gui.skip_frame_borders.padding

style skip_text:
    size gui.notify_text_size

style skip_triangle:
    ## ▸ 글리프가 있는 엔진 내장 폰트 사용.
    font "DejaVuSans.ttf"


## Notify screen ###############################################################

screen notify(message):

    zorder 100
    style_prefix "notify"

    frame at notify_appear:
        text "[message!tq]"

    timer 3.25 action Hide('notify')


transform notify_appear:
    on show:
        alpha 0
        linear .25 alpha 1.0
    on hide:
        linear .5 alpha 0.0


style notify_frame is empty
style notify_text is gui_text

style notify_frame:
    ypos gui.notify_ypos
    background Frame(Solid(gui.frame_bg_color), gui.notify_frame_borders, tile=gui.frame_tile)
    padding gui.notify_frame_borders.padding

style notify_text:
    properties gui.text_properties("notify")



################################################################################
## Mobile Variants (크기만 — 이미지 의존 없음)
################################################################################

style pref_vbox:
    variant "medium"
    xsize gui.scale(450)

## 터치 환경: 더 적고 큰 버튼의 퀵메뉴.
screen quick_menu():
    variant "touch"

    zorder 100

    if quick_menu:

        hbox:
            style "quick_menu"
            style_prefix "quick"

            textbutton _("뒤로") action Rollback()
            textbutton _("스킵") action Skip() alternate Skip(fast=True, confirm=True)
            textbutton _("자동") action Preference("auto-forward", "toggle")
            textbutton _("메뉴") action ShowMenu()


style game_menu_navigation_frame:
    variant "small"
    xsize gui.scale(340)

style game_menu_content_frame:
    variant "small"
    top_margin 0

style game_menu_viewport:
    variant "small"
    xsize gui.scale(870)

style pref_vbox:
    variant "small"
    xsize gui.scale(400)

style slider_vbox:
    variant "small"
    xsize None

style slider_slider:
    variant "small"
    xsize gui.scale(600)
${galleryScreens}`;
}
