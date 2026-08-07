// game/screens.rpy — 모든 필수 화면을 자체 정의(상업 배포 시 누락 화면 크래시 방지).
// Ren'Py 8.5.3 기본 screens.rpy 를 토대로 하되:
//   - 모든 이미지 의존(button/bar/frame/overlay/textbox PNG)을 Solid/색으로 대체 → 외부 PNG 0개
//   - 색·폰트는 전부 gui.rpy 의 define gui.* 참조 → 테마만 바꾸면 전체 룩 전환
//   - nvl/bubble 화면과 phone 전용(이미지) 스타일은 제외(우리는 ADV 일반 대사)
// 테마 의존 값이 없으므로 정적이지만, 다국어 선택 UI 주입을 위해 인자를 받는다.

import type {
  Locale,
  MenuButtonSlot,
  MenuButtonState,
  MainMenuLayout,
  MainMenuPresetDef,
  QuickButtonSlot,
  QuickButtonState,
  QuickMenuLayout,
} from '../../types';
import {
  RENPY_LANG,
  LOCALE_LABEL,
  MAIN_MENU_SLOTS,
  menuButtonFile,
  TITLE_LOGO_FILE,
  QUICK_LIST_SLOTS,
  quickButtonFile,
  QUICK_PANEL_FILE,
} from '../../types';
import type { GuiLocales } from './index';
// '../generate' 가 아니라 '../escape' 에서 직접 가져온다 — generate.ts → gui/index.ts →
// screensRpy.ts 로 이미 한 방향 의존이 있어, 여기서 '../generate' 를 다시 참조하면 순환 import가
// 된다(escape.ts 는 어느 쪽도 참조하지 않는 잎 모듈이라 순환이 생기지 않는다). 사용자가 입력하는
// 메뉴 라벨은 %/[/{ 를 이스케이프하지 않으면 런타임 크래시라(CLAUDE.md 최상위 함정) 예외 없이
// 이 함수를 거쳐야 한다.
import { escRpyText } from '../escape';

/**
 * ▶ U+25B6 — 나눔고딕(번들 기본 폰트) cmap 에 존재 확인함(fontTools 로 확인). U+25BA·U+25B8·✦(U+2726)
 * 등은 나눔고딕에 없어 빈 네모(□)로 깨지므로 절대 다른 글리프로 바꾸지 말 것.
 * 대체 후보 전수 조사 결과(실기 검증): 이모지가 아니면서 나눔고딕에도 있는 채워진 도형은
 * ▷U+25B7(속 빈 삼각형)·◆U+25C6·★U+2605·•U+2022·●U+25CF 뿐이고, "채워진 오른쪽 삼각형"은
 * U+25B6 이 유일하다(U+25B8·U+2023·U+27A4 는 나눔고딕에 글리프가 없어 두부가 된다) — 렌더
 * 문제(파란 이모지 박스)는 글리프 자체가 아니라 Ren'Py 이모지 치환 때문이었다(mm_marker_text 의
 * emoji_font None 참고).
 */
const MARKER_GLYPH = '▶';

/**
 * 메인 메뉴 이미지 GUI 렌더 계획(generate.ts 가 project.mainMenuUi + resolveItems/resolveCgs 결과로
 * 만들어 넘긴다). 이미지가 하나도 없으면(buttons 비고 hasLogo=false) screensRpy 는 기존 텍스트
 * 메뉴를 글자 하나 안 바꾸고 그대로 방출한다(회귀 0 — 기존 프로젝트는 이 타입 자체를 모른다).
 */
export interface MainMenuPlan {
  /** 슬롯 → 실제 존재하는 상태 이미지 집합. idle 이 없는 슬롯은 텍스트 버튼으로 폴백. */
  buttons: Partial<Record<MenuButtonSlot, Partial<Record<MenuButtonState, true>>>>;
  hasLogo: boolean;
  /** 로고 원본 가로/세로 비율(naturalWidth/naturalHeight). 모르면 generate.ts 가 3(폴백)을 채운다. */
  logoAspect: number;
  /** 1920 기준 px(이미 mainMenuLayout() 으로 기본값 병합됨). */
  layout: Required<MainMenuLayout>;
  /** height / 1080 — 좌표를 이 배율로 곱해 최종 픽셀 값을 굽는다(런타임 계산 없음). */
  scale: number;
  /** 갤러리 버튼이 열 화면. 아이템·CG 둘 다 있으면 'hub', 하나면 그것, 없으면 버튼 비활성화. */
  galleryTarget?: 'hub' | 'cg' | 'items';
  /** 배치 프리셋(정렬 축·라벨 2줄 여부·마커·글자 크기) — types.ts 의 mainMenuPreset() 결과. */
  preset: MainMenuPresetDef;
  /** 최종 라벨(프리셋 기본값 위에 사용자 편집 덮음) — types.ts 의 mainMenuLabels() 결과. */
  labels: Record<MenuButtonSlot, { main: string; sub: string }>;
  /** 실제 화면 폭(px, project.width) — 우측 정렬 xpos 계산에 1920 하드코딩 대신 이 값을 쓴다. */
  screenWidth: number;
  /**
   * 텍스트 프리셋 글자 외곽선(기본 true). 이미지 버튼 경로에서 main_menu_frame(좌측 스크림)을
   * 없앤 탓에 텍스트 프리셋은 배경 아트 위에 맨몸으로 놓인다 — 외곽선으로 자체 대비를 만든다.
   */
  textOutline: boolean;
}

/**
 * 인게임 우측 퀵메뉴 이미지 GUI 렌더 계획(generate.ts 가 project.quickMenuUi 로 만들어 넘긴다).
 * mainMenuUi 와 같은 계약 — 'menu'(토글) 슬롯의 idle 이미지가 없으면 generate.ts 의
 * buildQuickMenuPlan 이 undefined 를 반환하고, screensRpy 는 기존 텍스트 알약 퀵메뉴를 그대로 낸다.
 */
export interface QuickMenuPlan {
  /** 슬롯 → 실제 존재하는 상태 이미지 집합. press 도 담길 수 있으나 렌더링에서 절대 참조하지 않는다
   * (엔진에 "누르는 중" 이미지 슬롯이 없다 — MainMenuPlan.buttons 와 동일한 이유). */
  buttons: Partial<Record<QuickButtonSlot, Partial<Record<QuickButtonState, true>>>>;
  /** 버튼 뒤 보조 패널 이미지 존재 여부 — 없으면 패널 없이 버튼만 그린다. */
  hasPanel: boolean;
  /** 패널 원본 px(기본값 232×625 병합 완료). */
  panelWidth: number;
  panelHeight: number;
  /** 1920 기준 px(quickMenuLayout() 으로 기본값 병합됨). */
  layout: Required<QuickMenuLayout>;
  /** height / 1080 — 좌표를 이 배율로 곱해 최종 픽셀 값을 굽는다(런타임 계산 없음, gui.scale() 사용 금지). */
  scale: number;
}

/**
 * 원본(텍스트 메뉴) screen main_menu() 정의 — base 템플릿의 `${mainMenuScreen}` 자리에 그대로
 * 보간되는 "기본값"이다(이미지 비활성일 때). 원본 텍스트가 여기 단 한 곳에만 존재하므로(예전처럼
 * base 템플릿 안에 같은 텍스트를 또 하드코딩해 "양쪽 일치 필수" 함정을 만들지 않는다), 항상 base 의
 * `${mainMenuScreen}` 삽입 지점과 정확히 같은 문자열이 나온다 — 별도 검색·스플라이스 불필요.
 */
const DEFAULT_MAIN_MENU_SCREEN = `screen main_menu():

    tag menu

    add Transform(gui.main_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))

    frame:
        style "main_menu_frame"

    use navigation

    if gui.show_name:

        vbox:
            style "main_menu_vbox"

            text "[config.name!t]":
                style "main_menu_title"

            text "[config.version]":
                style "main_menu_version"`;

/** 슬롯별 Ren'Py action(+선택 sensitive 조건식). galleryTarget 에 따라 갤러리 진입 화면이 갈린다. */
function mainMenuAction(
  slot: MenuButtonSlot,
  galleryTarget: MainMenuPlan['galleryTarget'],
): { action: string; sensitive?: string } {
  switch (slot) {
    case 'start':
      return { action: 'Start()' };
    case 'continue':
      // renpy.newest_slot 로 가장 최근 저장 슬롯을 찾는다 — 없으면 None(비활성화 이미지/버튼).
      // 밑줄 접두 이름(_continue_slot)은 Ren'Py 가 엔진 예약으로 취급해 continue_slot 을 쓴다.
      return { action: 'FileLoad(continue_slot, slot=True, confirm=False)', sensitive: 'continue_slot is not None' };
    case 'load':
      return { action: 'ShowMenu("load")' };
    case 'prefs':
      return { action: 'ShowMenu("preferences")' };
    case 'gallery':
      if (galleryTarget === 'hub') return { action: 'ShowMenu("gallery_hub")' };
      if (galleryTarget === 'cg') return { action: 'ShowMenu("cg_gallery")' };
      if (galleryTarget === 'items') return { action: 'ShowMenu("item_gallery")' };
      return { action: 'NullAction()', sensitive: 'False' }; // 아이템·CG 둘 다 없으면 갤러리 자체가 없다.
    case 'quit':
      return { action: 'Quit(confirm=False)' };
  }
}

/**
 * 이미지 기반 screen main_menu() 정의를 만든다(base 템플릿의 `${mainMenuScreen}` 자리에 보간).
 * - vbox spacing 하나로 스펙 좌표(78px 버튼 + 12px 간격 = 90px 행 간격)를 재현(절대좌표 6개 불필요).
 * - press(클릭 중) 이미지는 방출하지 않는다 — Ren'Py 8.5.3 엔진 소스 전수 조사 결과 activate_
 *   프리픽스(눌림 상태)를 실제로 세팅하는 코드가 없는 죽은 슬롯이라 영원히 못 쓴다(store 단에서부터
 *   업로드를 막는다 — renpySupported=false).
 * - hover 시 오른쪽 이동(스펙 4번)은 hover_xoffset 으로 방출한다 — xoffset 은 Position 스타일
 *   속성이고 hover_ 는 정식 스타일 프리픽스라(displayable.py 가 포커스 시 set_style_prefix(role+
 *   "hover_") 를 실제로 호출) 실제로 먹는다. press 2px 이동은 press 상태 자체가 없어 대응 항목이 없다.
 * - 정보/크레딧/도움말은 별도 vbox 가 아니라 이미지 버튼과 **같은 vbox** 안에 이어서 낸다(널 스페이서로
 *   간격만 벌림) — 별도 vbox 로 y 를 따로 계산하면 사용자가 다른 높이의 버튼 PNG 를 올렸을 때
 *   (78px 하드코딩과) 어긋나는데, 같은 vbox 라 항상 자연스럽게 이미지 버튼들 바로 아래에 붙는다.
 */
/** buildImageMainMenuScreen 의 결과 — usesMmStyles 는 mm_* 스타일 정의를 실제로 낼지(회귀 0용). */
interface MainMenuScreenResult {
  text: string;
  /** case2(1줄 텍스트)/case3(2줄)/마커가 한 번이라도 쓰였는지. false 면 screensRpy 가 mm_* 스타일
   *  정의 자체를 생략한다 — "6슬롯 전부 이미지 업로드" 같은 조합은 예전 출력과 바이트가 완전히 같다. */
  usesMmStyles: boolean;
}

function buildImageMainMenuScreen(plan: MainMenuPlan): MainMenuScreenResult {
  const L = plan.layout;
  const s = plan.scale;
  const preset = plan.preset;
  const bx = Math.round(L.x * s);
  const by = Math.round(L.y * s);
  const bgap = Math.round(L.gap * s);
  const hoverX = Math.round(L.hoverShiftX * s);
  const logoX = Math.round(L.logoX * s);
  const logoY = Math.round(L.logoY * s);
  const logoW = Math.round(L.logoWidth * s);
  const logoH = Math.round(logoW / plan.logoAspect);
  const linkGap = Math.round(24 * s); // 버튼들과 정보/크레딧/도움말 사이 스페이서.

  const I = (n: number) => ' '.repeat(n);
  const lines: string[] = [];
  lines.push('screen main_menu():');
  lines.push('');
  lines.push(`${I(4)}tag menu`);
  lines.push('');
  lines.push(
    `${I(4)}add Transform(gui.main_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))`,
  );
  lines.push('');
  lines.push(`${I(4)}$ continue_slot = renpy.newest_slot(r"\\d+")`);
  lines.push('');

  // 배치 축 3종: left(기존 좌측 세로) / right(우측 세로, 컨테이너+항목 모두 오른쪽 정렬) /
  // center(하단 가로 hbox, x 는 안 쓴다 — 가운데 정렬이라 무의미). right 는 1920 하드코딩 대신
  // 실제 화면 폭(plan.screenWidth = project.width)에서 x 를 빼 우측 여백을 재현한다.
  const isHorizontal = preset.direction === 'horizontal';
  const isRight = preset.align === 'right';
  if (isHorizontal) {
    lines.push(`${I(4)}hbox:`);
    lines.push(`${I(8)}xalign 0.5`);
    lines.push(`${I(8)}ypos ${by}`);
    lines.push(`${I(8)}spacing ${bgap}`);
  } else if (isRight) {
    const rx = Math.round(plan.screenWidth - bx);
    lines.push(`${I(4)}vbox:`);
    lines.push(`${I(8)}xpos ${rx}`);
    lines.push(`${I(8)}xanchor 1.0`);
    lines.push(`${I(8)}ypos ${by}`);
    lines.push(`${I(8)}spacing ${bgap}`);
  } else {
    lines.push(`${I(4)}vbox:`);
    lines.push(`${I(8)}xpos ${bx}`);
    lines.push(`${I(8)}ypos ${by}`);
    lines.push(`${I(8)}spacing ${bgap}`);
  }
  lines.push('');

  // mm_* 스타일(작업 2 스타일 블록)은 실제로 텍스트/마커 렌더가 한 번이라도 쓰였을 때만 정의한다
  // (그래야 "6슬롯 전부 이미지 업로드" 조합은 이 플래그가 끝까지 false 로 남아 스타일 블록 자체가
  // 안 나오고, 예전 출력과 바이트 단위로 완전히 같다 — 회귀 0).
  let usesMmStyles = false;

  // 가로 배치(hbox, 현재 bottom-row 만 해당) 항목 고정 폭 — 실기 확인: 고정폭이 없으면 긴 설명문
  // 하나로 전체 폭이 1920px 를 넘어 첫 항목이 화면 밖으로 잘린다. 6×270 + 5×gap(30, bottom-row
  // 기준) = 1770 < 1920 로 화면 안에 들어간다(사용자가 문구를 길게 넣어도 이 폭 안에서 줄바꿈된다).
  // 지금은 가로 프리셋이 bottom-row 하나뿐이라 상수로 고정했다 — 다른 슬롯 수의 가로 프리셋이
  // 추가되면 이 값도 프리셋 정의로 옮겨야 한다.
  const HORIZONTAL_ITEM_WIDTH = 270;
  const itemW = Math.round(HORIZONTAL_ITEM_WIDTH * s);

  for (const slotDef of MAIN_MENU_SLOTS) {
    const states = plan.buttons[slotDef.id] ?? {};
    const { action, sensitive } = mainMenuAction(slotDef.id, plan.galleryTarget);
    const label = plan.labels[slotDef.id] ?? { main: slotDef.label, sub: '' };
    const sensitivePart = sensitive ? ` sensitive ${sensitive}` : '';

    if (states.idle) {
      // 1) 업로드 idle 이미지가 있는 슬롯 — 이미지 우선(사용자 확정). 프리셋이 텍스트형이어도
      // 이미지가 있으면 이미지를 쓴다.
      lines.push(`${I(8)}imagebutton:`);
      lines.push(`${I(12)}idle "${menuButtonFile(slotDef.id, 'idle')}"`);
      if (states.hover) lines.push(`${I(12)}hover "${menuButtonFile(slotDef.id, 'hover')}"`);
      if (states.disabled) lines.push(`${I(12)}insensitive "${menuButtonFile(slotDef.id, 'disabled')}"`);
      if (isRight) lines.push(`${I(12)}xalign 1.0`); // 폭이 제각각인 이미지도 오른쪽 끝을 맞춘다.
      // focus_mask 는 쓰지 않는다 — 히트박스가 "불투명 픽셀"로 좁아지는데, 이런 메뉴 버튼 아트는
      // 420×78 중 대부분이 투명(글자 획만 불투명)이라 hover·클릭이 사실상 불가능해진다.
      // (실제 Ren'Py 8.5.3 + 사용자 실물 PNG 로 재현·확인함. 스펙상 버튼 박스는 사각형 420×78.)
      if (hoverX) lines.push(`${I(12)}hover_xoffset ${hoverX}`);
      if (sensitive) lines.push(`${I(12)}sensitive ${sensitive}`);
      lines.push(`${I(12)}action ${action}`);
      lines.push('');
    } else if (preset.marker === 'triangle') {
      // 2b) 마커(▶) 프리셋 — 라벨 왼쪽에 마커. 항상 자리를 차지하되 평상시엔 완전 투명(숨김이
      // 아님)이라 hover 때 색이 바뀌어도 글자가 옆으로 밀리지 않는다(mm_marker_text 참고).
      usesMmStyles = true;
      lines.push(`${I(8)}button:`);
      lines.push(`${I(12)}style "mm_button"`);
      lines.push(`${I(12)}action ${action}`);
      if (sensitive) lines.push(`${I(12)}sensitive ${sensitive}`);
      if (isHorizontal) lines.push(`${I(12)}xsize ${itemW}`);
      if (isRight) lines.push(`${I(12)}xalign 1.0`);
      lines.push(`${I(12)}hbox:`);
      lines.push(`${I(16)}spacing ${Math.round(6 * s)}`);
      lines.push(`${I(16)}text "${MARKER_GLYPH}" style "mm_marker_text"`);
      lines.push(`${I(16)}text "${escRpyText(label.main)}" style "mm_button_text"`);
      lines.push('');
    } else if (!preset.dualLabel) {
      // 2a) 이미지 없음 + 1줄 라벨 — textbutton 하나로 끝(style_prefix "mm" → mm_button/mm_button_text).
      usesMmStyles = true;
      const alignPart = isRight ? ' xalign 1.0' : '';
      lines.push(
        `${I(8)}textbutton _("${escRpyText(label.main)}") action ${action}${sensitivePart}${alignPart} style_prefix "mm"`,
      );
      lines.push('');
    } else {
      // 3) 이미지 없음 + 2줄(주+부) — textbutton 은 라벨이 하나뿐이라 2줄이 안 된다. button: + 내부
      // vbox 로 구성. sub 가 빈 문자열이면 그 text 줄을 아예 내지 않는다(1줄 렌더로 자연 축소).
      usesMmStyles = true;
      lines.push(`${I(8)}button:`);
      lines.push(`${I(12)}style "mm_button"`);
      lines.push(`${I(12)}action ${action}`);
      if (sensitive) lines.push(`${I(12)}sensitive ${sensitive}`);
      if (isHorizontal) {
        lines.push(`${I(12)}xsize ${itemW}`);
        lines.push(`${I(12)}xalign 0.5`);
      } else if (isRight) {
        lines.push(`${I(12)}xalign 1.0`);
      }
      lines.push(`${I(12)}vbox:`);
      lines.push(`${I(16)}text "${escRpyText(label.main)}" style "mm_main_text"`);
      if (label.sub) lines.push(`${I(16)}text "${escRpyText(label.sub)}" style "mm_sub_text"`);
      lines.push('');
    }
  }

  if (isHorizontal) {
    // 가로 배치(hbox)에서는 정보/크레딧/도움말을 같은 hbox 에 이어붙이면 6번째 항목처럼 메뉴 행
    // 오른쪽 끝에 붙거나(칸이 남으면) 화면 밖으로 밀려난다(실기 확인 — bottom-row 스크린샷에서
    // "정보"가 메뉴 행에 끼어들고 크레딧·도움말은 아예 안 보였다). 세로 배치의 "같은 컨테이너에
    // 이어붙이기"(다른 높이의 버튼과도 자연스럽게 붙는 장점)는 가로에선 성립하지 않으므로,
    // 메뉴 행 아래 별도 hbox 로 뺀다(메뉴 행 y + 150px, 가운데 정렬).
    const linkY = Math.round((L.y + 150) * s);
    lines.push('');
    lines.push(`${I(4)}hbox:`);
    lines.push(`${I(8)}xalign 0.5`);
    lines.push(`${I(8)}ypos ${linkY}`);
    lines.push(`${I(8)}spacing ${linkGap}`);
    lines.push('');
    lines.push(`${I(8)}textbutton _("정보") action ShowMenu("about") style_prefix "mm_link"`);
    lines.push(`${I(8)}textbutton _("크레딧") action ShowMenu("credits") style_prefix "mm_link"`);
    lines.push('');
    lines.push(`${I(8)}if renpy.variant("pc") or (renpy.variant("web") and not renpy.variant("mobile")):`);
    lines.push('');
    lines.push(`${I(12)}textbutton _("도움말") action ShowMenu("help") style_prefix "mm_link"`);
    lines.push('');
  } else {
    // 세로 배치(vbox)는 기존 그대로 — 이미지 버튼 6개와 같은 vbox 안에 null 스페이서로 간격만
    // 벌려 이어붙인다(사용자가 다른 높이의 버튼 PNG 를 올려도 자연스럽게 바로 아래 붙는다).
    lines.push(`${I(8)}null height ${linkGap}`);
    lines.push('');
    lines.push(`${I(8)}textbutton _("정보") action ShowMenu("about") style_prefix "mm_link"`);
    lines.push(`${I(8)}textbutton _("크레딧") action ShowMenu("credits") style_prefix "mm_link"`);
    lines.push('');
    lines.push(`${I(8)}if renpy.variant("pc") or (renpy.variant("web") and not renpy.variant("mobile")):`);
    lines.push('');
    lines.push(`${I(12)}textbutton _("도움말") action ShowMenu("help") style_prefix "mm_link"`);
    lines.push('');
  }

  if (plan.hasLogo) {
    // 정적 속성만(fit/xysize/xpos/ypos) — CLAUDE.md 규칙: add 블록엔 애니메이션 ATL 금지.
    // 박스를 로고의 실제 비율(logoAspect)에 맞춰야 한다 — 정사각 박스(w,w)+fit="contain" 이면
    // 가로로 긴 로고가 박스 안에서 세로 중앙 정렬돼 logoY 가 "왼쪽 위" 기준에서 아래로 밀린다.
    lines.push(`${I(4)}add Transform("${TITLE_LOGO_FILE}", fit="contain", xysize=(${logoW}, ${logoH})):`);
    lines.push(`${I(8)}xpos ${logoX}`);
    lines.push(`${I(8)}ypos ${logoY}`);
  } else {
    lines.push(`${I(4)}if gui.show_name:`);
    lines.push('');
    lines.push(`${I(8)}vbox:`);
    lines.push(`${I(12)}style "main_menu_vbox"`);
    lines.push('');
    lines.push(`${I(12)}text "[config.name!t]":`);
    lines.push(`${I(16)}style "main_menu_title"`);
    lines.push('');
    lines.push(`${I(12)}text "[config.version]":`);
    lines.push(`${I(16)}style "main_menu_version"`);
  }

  return { text: lines.join('\n'), usesMmStyles };
}

/** 대사 글자(gui.dialogue_outlines)와 같은 형태의 고정 외곽선 — 2px 검정, 오프셋 0. */
const MM_OUTLINE = '[ (absolute(2), "#000000", absolute(0), absolute(0)) ]';
/** 완전 투명 외곽선 — 마커의 "평상시엔 자리만 차지, 아무것도 안 보임"을 외곽선까지 포함해 유지. */
const MM_OUTLINE_TRANSPARENT = '[ (absolute(2), "#00000000", absolute(0), absolute(0)) ]';

/**
 * mm_button(마커/2줄용 button:) / mm_button_text(1줄 textbutton) / mm_main_text·mm_sub_text(2줄) /
 * mm_marker_text(▶) — 프리셋별 mainSize/subSize 를 scale 곱해 리터럴로 굽는다(런타임 계산 없음).
 * buildImageMainMenuScreen 이 usesMmStyles=true 일 때만(=실제로 이 스타일을 쓰는 렌더가 있을 때만)
 * 호출된다.
 *
 * 외곽선(plan.textOutline, 기본 true): 이미지 버튼 경로에서는 원래 텍스트 메뉴가 깔고 있던
 * main_menu_frame(좌측 어두운 스크림)을 제거했다(시안에 없는 어두운 띠라서) — 그래서 텍스트
 * 프리셋은 사용자가 올린 배경 아트 위에 아무 보호막 없이 놓인다. 아트가 밝으면 글자가 거의 안
 * 보인다(실기 확인) — 대사 글자와 같은 방식(2px 검정 외곽선)으로 배경에 기대지 않는 대비를 만든다.
 * 마커(mm_marker_text)는 "평상시 완전 투명"이 핵심 설계라(Task 2) 외곽선도 idle 땐 투명으로 두고
 * hover 에서만 불투명 검정으로 바꾼다(hover_outlines) — 안 그러면 idle 상태에서도 ▶ 모양 검정
 * 테두리만 남아 "투명"이 깨진다.
 *
 * emoji_font None(mm_marker_text): ▶(U+25B6)는 Ren'Py 이모지 트라이에서 UNQUALIFIED(레벨 1)라,
 * 기본 스타일의 prefer_emoji True 와 만나면 번들 Twemoji 로 치환돼 "파란 재생버튼 이모지"로
 * 렌더된다(실기 확인). 이 줄이 이모지 치환 자체를 끈다(renpy/text/text.py 의
 * default_font/emoji_font None 분기 — Ren'Py 자체도 UI 크롬에 이 관용구를 쓴다,
 * renpy/common/00director.rpy:1496).
 */
function buildMmStyles(plan: MainMenuPlan): string {
  const s = plan.scale;
  const mainPx = Math.round(plan.preset.mainSize * s);
  const subPx = Math.round(plan.preset.subSize * s);
  const outlineLine = plan.textOutline ? `\n    outlines ${MM_OUTLINE}` : '';
  const markerOutlineLines = plan.textOutline
    ? `\n    outlines ${MM_OUTLINE_TRANSPARENT}\n    hover_outlines ${MM_OUTLINE}`
    : '';
  return `

style mm_button is button
style mm_button_text is button_text

style mm_button_text:
    font gui.menu_text_font
    size ${mainPx}
    insensitive_color gui.insensitive_color${outlineLine}

style mm_main_text is gui_text
style mm_main_text:
    font gui.menu_text_font
    size ${mainPx}
    color gui.idle_color
    hover_color gui.hover_color${outlineLine}

style mm_sub_text is gui_text
style mm_sub_text:
    font gui.menu_sub_text_font
    size ${subPx}
    color gui.idle_color
    hover_color gui.hover_color${outlineLine}

## 항상 자리를 차지하되 평상시엔 완전 투명 — 숨김(has/hide)이 아니라 색만 투명이라 hover 때
## 나타나도 옆의 라벨이 밀리지 않는다.
style mm_marker_text:
    font gui.menu_text_font
    size ${mainPx}
    emoji_font None
    color "#00000000"
    hover_color gui.accent_color${markerOutlineLines}
`;
}

/**
 * mm_link(정보·크레딧·도움말) 전용 스타일 — navigation_button 을 상속하되 글자만 작게. 화면 정의
 * 사이에 끼면 읽기 어려워 base 템플릿 맨 끝(갤러리 화면들 뒤)에 붙인다.
 */
const MM_LINK_STYLES = `

style mm_link_button is navigation_button
style mm_link_button_text is navigation_button_text

style mm_link_button_text:
    size gui.scale(16)
`;

/** galleryTarget === 'hub' 일 때만 추가되는 갤러리 허브(아이템·CG 진입점을 하나로 묶음). */
const GALLERY_HUB_SCREEN = String.raw`

################################################################################
## 갤러리 허브 — 아이템·CG 갤러리가 둘 다 있을 때 메인 메뉴 갤러리 버튼의 진입점.
################################################################################

screen gallery_hub():

    tag menu

    use game_menu(_("갤러리"), scroll=None):

        vbox:
            style_prefix "navigation"

            textbutton _("감상한 CG") action ShowMenu("cg_gallery")
            textbutton _("발견한 아이템") action ShowMenu("item_gallery")
`;

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

/**
 * 보관함(아이템·CG 갤러리) 공용 다시보기 라이트박스 — 모달(닫기/Esc 로 종료), tag 없음이라
 * 어느 갤러리 위에 겹쳐 떠도 상관없다. hasItems 또는 hasCg 둘 중 하나라도 있으면 딱 1번만 방출된다
 * (둘 다 있다고 두 번 내면 Ren'Py 의 "화면 중복 정의" 에러가 난다).
 */
const GALLERY_LIGHTBOX = String.raw`

## 보관함에서 다시보기 — 모달 라이트박스(닫기/Esc 로 종료). tag 없음 = 갤러리 위에 겹쳐 뜬다.
screen gallery_lightbox(img, caption):
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
        action Hide("gallery_lightbox")
    key "game_menu" action Hide("gallery_lightbox")
`;

/** 아이템(소품) 팝업(인게임) + 발견한 아이템 보관함 화면(hasItems 일 때만 방출). */
const ITEM_SCREENS = String.raw`

################################################################################
## 아이템(소품) 팝업 + 발견한 아이템 보관함
################################################################################

## 인게임 팝업 — 배경 살짝 딤 + 중앙 컷아웃(이름 캡션은 표시 안 함, 이미지 자체에 라벨 포함).
## zorder 를 대사창(say=0)보다 낮게 둬서 배경·인물만 어둡게 덮고 대사 글자는 안 가린다.
## modal True 로 닫기 전까진 대사 진행이 막힌다(안 그러면 대사창의 클릭-진행 레이어가 닫기 버튼
## 클릭을 먼저 가로챌 위험 — gallery_lightbox 로 이미 검증된 패턴). 이미지를 포함해 화면 아무 곳이나
## 클릭하면 닫히도록 dismiss 사용(이전엔 텍스트버튼을 뒀으나 기본 색이 딤 배경과 대비가 약해
## 거의 안 보였음 — 사용자 요청대로 "이미지 클릭 시 닫힘"으로 교체).
screen item_popup(img, caption):
    modal True
    zorder -5
    add Solid("#00000073")
    add img at transform:
        fit "contain"
        ysize int(config.screen_height * 0.45)
        anchor (0.5, 0.5)
        pos (0.5, 0.42)
        alpha 0.0 zoom 0.9
        easein 0.22 alpha 1.0 zoom 1.0
    key "game_menu" action Hide("item_popup")
    dismiss action Hide("item_popup")

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
                            action Show("gallery_lightbox", img=it_tag, caption=it_name)
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

/**
 * 감상한 CG 갤러리(hasCg 일 때만 방출). CG 는 배경과 같은 와이드스크린 비율이라 아이템 갤러리보다
 * 열을 줄이고(3열) 셀을 16:9-ish 로 넓게 잡는다. 감상 기록은 persistent.cg_seen(scriptBody 가
 * scene <tag>_scene 진입 시 기록), 목록은 gui.cgs_all(cg.rpy, resolveCgs 가 assets.rpy 와 같은
 * 태그 번호를 재사용해 계산).
 */
const CG_SCREENS = String.raw`

################################################################################
## 감상한 CG 갤러리
################################################################################

screen cg_gallery():
    tag menu
    use game_menu(_("감상한 CG"), scroll="viewport"):
        vpgrid:
            cols 3
            spacing gui.scale(18)
            for cg_tag, cg_name in gui.cgs_all:
                vbox:
                    spacing gui.scale(4)
                    xsize gui.scale(300)
                    if persistent.cg_seen.get(cg_tag, False):
                        button:
                            xysize (gui.scale(300), gui.scale(190))
                            action Show("gallery_lightbox", img=cg_tag, caption=cg_name)
                            add cg_tag:
                                fit "contain"
                                xysize (gui.scale(288), gui.scale(162))
                                align (0.5, 0.5)
                        text cg_name xalign 0.5 size gui.scale(16)
                    else:
                        frame:
                            xysize (gui.scale(300), gui.scale(190))
                            background Solid(gui.frame_bg_color)
                            text "???" align (0.5, 0.5) size gui.scale(34) color gui.insensitive_color
                        text _("???") xalign 0.5 size gui.scale(16) color gui.insensitive_color
`;

/**
 * 원본(텍스트 알약 메뉴) screen quick_menu() 정의(데스크톱) — base 템플릿의 `${quickMenuScreen}` 자리에
 * 그대로 보간되는 "기본값"(quickMenuUi 미지정일 때). mainMenuUi 와 같은 회귀 0 계약 — 원본 텍스트가
 * 여기 단 한 곳에만 존재한다(DEFAULT_MAIN_MENU_SCREEN 과 동일 패턴). 터치 variant(별도
 * `screen quick_menu(): variant "touch"`)와 style quick_button/quick_gear_button 블록은 이 상수와
 * 무관하게 base 템플릿에 항상 그대로 남는다(둘 다 텍스트 폴백·터치에서 계속 쓰인다).
 */
const DEFAULT_QUICK_MENU_SCREEN = `screen quick_menu():

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
            # 개별 알약 버튼을 세로로 붙여 쌓는다 — 공용 style quick_menu(xoffset -12, spacing 8,
            # 터치 variant 가 사용)는 쓰지 않고 인라인 속성으로 메뉴 버튼과 우측 끝을 맞춘다.
            vbox:
                style_prefix "quick"
                xalign 1.0
                yalign 0.0
                yoffset gui.scale(56)
                spacing 0

                textbutton _("뒤로") action [Rollback(), SetVariable("quick_menu_expanded", False)]
                textbutton _("기록") action [ShowMenu('history'), SetVariable("quick_menu_expanded", False)]
                textbutton _("스킵") action [Skip(), SetVariable("quick_menu_expanded", False)] alternate Skip(fast=True, confirm=True)
                textbutton _("자동") action [Preference("auto-forward", "toggle"), SetVariable("quick_menu_expanded", False)]
                # 대사창·메뉴를 숨기고 CG/배경을 감상 — 아무 곳이나 클릭하면 자동으로 돌아온다
                # (Ren'Py 기본 h 키·가운데 클릭과 동일한 동작을 버튼으로도 노출). 드롭다운을 먼저
                # 접어야(SetVariable 먼저) HideInterface 가 클릭을 기다리는 동안 메뉴가 깔끔하게 사라진다.
                textbutton _("숨기기") action [SetVariable("quick_menu_expanded", False), HideInterface()]
                textbutton _("저장") action [ShowMenu('save'), SetVariable("quick_menu_expanded", False)]
                textbutton _("빠른저장") action [QuickSave(), SetVariable("quick_menu_expanded", False)]
                textbutton _("빠른불러오기") action [QuickLoad(), SetVariable("quick_menu_expanded", False)]
                textbutton _("설정") action [ShowMenu('preferences'), SetVariable("quick_menu_expanded", False)]`;

/**
 * 퀵메뉴 슬롯 → Ren'Py action(+선택 alternate). 기존 텍스트 구현과 완전히 동일한 액션 리스트를
 * 그대로 재사용한다(이미지 모드·텍스트 폴백 둘 다 이 함수를 공유) — 순서가 중요한 hide(SetVariable
 * 먼저, HideInterface 나중 — 안 그러면 드롭다운이 접히기 전에 인터페이스가 사라져 버튼이 화면에
 * 남는다)와 skip 의 alternate(길게 누르면 확인창과 함께 빠른 스킵) 는 CLAUDE.md/기존 구현 그대로.
 */
function quickMenuAction(slot: QuickButtonSlot): { action: string; alternate?: string } {
  switch (slot) {
    case 'menu':
      return { action: 'ToggleVariable("quick_menu_expanded")' };
    case 'back':
      return { action: '[Rollback(), SetVariable("quick_menu_expanded", False)]' };
    case 'history':
      return { action: `[ShowMenu('history'), SetVariable("quick_menu_expanded", False)]` };
    case 'skip':
      return {
        action: '[Skip(), SetVariable("quick_menu_expanded", False)]',
        alternate: 'Skip(fast=True, confirm=True)',
      };
    case 'auto':
      return { action: '[Preference("auto-forward", "toggle"), SetVariable("quick_menu_expanded", False)]' };
    case 'hide':
      return { action: '[SetVariable("quick_menu_expanded", False), HideInterface()]' };
    case 'save':
      return { action: `[ShowMenu('save'), SetVariable("quick_menu_expanded", False)]` };
    case 'qsave':
      return { action: '[QuickSave(), SetVariable("quick_menu_expanded", False)]' };
    case 'qload':
      return { action: '[QuickLoad(), SetVariable("quick_menu_expanded", False)]' };
    case 'prefs':
      return { action: `[ShowMenu('preferences'), SetVariable("quick_menu_expanded", False)]` };
  }
}

/**
 * 이미지 기반 screen quick_menu() 정의를 만든다(base 템플릿의 `${quickMenuScreen}` 자리에 보간).
 * - 패널은 버튼(메뉴 토글 포함)보다 **먼저** add 해야 화면에서 뒤에 깔린다 — 패널이 Y0~625 를 덮는데
 *   메뉴 토글이 Y16 이라 패널 뒤에 있으면 토글이 안 보인다. 정적 속성만(fit/xysize/xpos/ypos) —
 *   CLAUDE.md 규칙: add 블록엔 애니메이션 ATL 금지.
 * - 'menu'(토글)는 buildQuickMenuPlan 의 게이트 조건(idle 필수) 덕에 항상 imagebutton 이다.
 * - 목록 9개는 슬롯별로 idle 이미지가 있으면 imagebutton, 없으면 원래 알약 textbutton 으로
 *   폴백한다(같은 절대좌표) — buildMainMenuPlan/buildImageMainMenuScreen 과 동일한 "슬롯별 폴백"
 *   패턴(half-image/half-text 를 피하되, 없는 파일을 참조해 크래시하지도 않는다).
 * - press(클릭 중) 이미지는 절대 참조하지 않는다 — 엔진에 그 상태 이미지 슬롯이 없다(activate_
 *   프리픽스는 죽은 슬롯, CLAUDE.md). selected_idle/selected_hover 는 selectable 슬롯(스킵·자동)만.
 * - focus_mask 는 쓰지 않는다 — 투명 여백이 많은 버튼 아트의 히트박스가 좁아져 클릭이 막힌다.
 * - 좌표는 quickMenuLayout() 이 준 1920 기준 px 에 scale(=height/1080)을 곱해 리터럴로 굽는다.
 *   gui.scale()(720p 기준)은 쓰지 않는다.
 */
function buildQuickMenuScreen(plan: QuickMenuPlan): string {
  const L = plan.layout;
  const s = plan.scale;
  const I = (n: number) => ' '.repeat(n);
  const lines: string[] = [];
  lines.push('screen quick_menu():', '', `${I(4)}zorder 100`, '', `${I(4)}if quick_menu:`, '');

  if (plan.hasPanel) {
    const pw = Math.round(plan.panelWidth * s);
    const ph = Math.round(plan.panelHeight * s);
    const px = Math.round(L.panelX * s);
    const py = Math.round(L.panelY * s);
    lines.push(`${I(8)}if quick_menu_expanded:`);
    // 버튼(메뉴 토글 포함)보다 먼저 add 해야 뒤에 깔린다 — 정적 속성만, 애니메이션 ATL 금지(CLAUDE.md).
    lines.push(`${I(12)}add Transform("${QUICK_PANEL_FILE}", fit="contain", xysize=(${pw}, ${ph})):`);
    lines.push(`${I(16)}xpos ${px}`);
    lines.push(`${I(16)}ypos ${py}`);
    lines.push('');
  }

  const btnX = Math.round(L.btnX * s);
  const menuStates = plan.buttons.menu ?? {};
  lines.push(`${I(8)}imagebutton:`);
  lines.push(`${I(12)}idle "${quickButtonFile('menu', 'idle')}"`);
  if (menuStates.hover) lines.push(`${I(12)}hover "${quickButtonFile('menu', 'hover')}"`);
  if (menuStates.disabled) lines.push(`${I(12)}insensitive "${quickButtonFile('menu', 'disabled')}"`);
  lines.push(`${I(12)}xpos ${btnX}`);
  lines.push(`${I(12)}ypos ${Math.round(L.menuY * s)}`);
  lines.push(`${I(12)}action ToggleVariable("quick_menu_expanded")`);
  lines.push('');

  lines.push(`${I(8)}if quick_menu_expanded:`, '');
  const itemBlocks: string[] = [];
  QUICK_LIST_SLOTS.forEach((slotDef, i) => {
    const states = plan.buttons[slotDef.id] ?? {};
    const y = Math.round((L.listY + i * L.listStep) * s);
    const { action, alternate } = quickMenuAction(slotDef.id);
    const b: string[] = [];
    if (states.idle) {
      b.push(`${I(12)}imagebutton:`);
      b.push(`${I(16)}idle "${quickButtonFile(slotDef.id, 'idle')}"`);
      if (states.hover) b.push(`${I(16)}hover "${quickButtonFile(slotDef.id, 'hover')}"`);
      if (states.disabled) b.push(`${I(16)}insensitive "${quickButtonFile(slotDef.id, 'disabled')}"`);
      if (slotDef.selectable && states.selected) {
        b.push(`${I(16)}selected_idle "${quickButtonFile(slotDef.id, 'selected')}"`);
        // "누르는 중" 전용 에셋이 없듯 "선택+호버" 전용 에셋도 없다 — hover 이미지를 selected_hover 에 재사용.
        if (states.hover) b.push(`${I(16)}selected_hover "${quickButtonFile(slotDef.id, 'hover')}"`);
      }
      b.push(`${I(16)}xpos ${btnX}`);
      b.push(`${I(16)}ypos ${y}`);
      b.push(`${I(16)}action ${action}`);
      if (alternate) b.push(`${I(16)}alternate ${alternate}`);
    } else {
      // idle 이미지가 없는 슬롯 — 원래 알약 textbutton 으로 폴백(같은 절대좌표에 배치).
      b.push(`${I(12)}textbutton _("${slotDef.label}"):`);
      b.push(`${I(16)}style "quick_button"`);
      b.push(`${I(16)}xpos ${btnX}`);
      b.push(`${I(16)}ypos ${y}`);
      b.push(`${I(16)}action ${action}`);
      if (alternate) b.push(`${I(16)}alternate ${alternate}`);
    }
    itemBlocks.push(b.join('\n'));
  });
  lines.push(itemBlocks.join('\n\n'));

  return lines.join('\n');
}

/** screensRpy 옵션(위치 인자가 너무 늘어나 객체로 통합 — generateGuiFiles 의 GuiGenOptions 와 동형). */
interface ScreensRpyOptions {
  locales?: GuiLocales;
  hasItems?: boolean;
  hasCg?: boolean;
  /** 있으면(버튼 이미지·로고 중 하나라도) 이미지 기반 main_menu 를, 없으면 기존 텍스트 메뉴를 낸다. */
  mainMenu?: MainMenuPlan;
  /** 있으면(메뉴 토글 idle 이미지) 이미지 기반 quick_menu 를, 없으면 기존 텍스트 알약 퀵메뉴를 낸다. */
  quickMenu?: QuickMenuPlan;
}

export function screensRpy(opts?: ScreensRpyOptions): string {
  const { locales, hasItems, hasCg, mainMenu, quickMenu } = opts ?? {};
  const languagePrefs = languagePrefsBlock(locales);
  // 아이템/CG 가 있을 때만 각각의 보관함 진입 버튼(내비)을 낸다.
  const galleryNav = [
    hasItems ? '        textbutton _("발견한 아이템") action ShowMenu("item_gallery")' : '',
    hasCg ? '        textbutton _("감상한 CG") action ShowMenu("cg_gallery")' : '',
  ]
    .filter(Boolean)
    .join('\n');
  // 라이트박스는 아이템·CG 둘 중 하나라도 있으면 딱 1번만(중복 screen 정의 방지).
  const galleryScreens =
    (hasItems ? ITEM_SCREENS : '') + (hasCg ? CG_SCREENS : '') + (hasItems || hasCg ? GALLERY_LIGHTBOX : '');

  // 활성화 여부는 generate.ts 의 buildMainMenuPlan 이 이미 판단해서 넘긴다(이미지/로고뿐 아니라
  // 프리셋 변경·라벨 편집·메뉴 폰트 지정도 활성화 사유 — mainMenuUi 자체가 없거나 전부 기본값이면
  // undefined 를 넘겨 기존 텍스트 메뉴(DEFAULT_MAIN_MENU_SCREEN) 그대로 나간다(회귀 0).
  const active = !!mainMenu;
  const built = mainMenu ? buildImageMainMenuScreen(mainMenu) : undefined;
  const mainMenuScreen = built ? built.text : DEFAULT_MAIN_MENU_SCREEN;
  const mmLinkStyles = active ? MM_LINK_STYLES : '';
  // mm_* 스타일은 실제로 텍스트/마커 렌더가 한 번이라도 쓰였을 때만(회귀 0 — 전 슬롯 이미지 조합은
  // usesMmStyles 가 끝까지 false 라 이 블록 자체가 안 나온다).
  const mmStyles = built?.usesMmStyles ? buildMmStyles(mainMenu!) : '';
  const galleryHubScreen = active && mainMenu?.galleryTarget === 'hub' ? GALLERY_HUB_SCREEN : '';

  // quickMenu 활성화 여부도 generate.ts 의 buildQuickMenuPlan 이 이미 판단해서 넘긴다(게이트: 'menu'
  // 토글 idle 이미지). 없으면 undefined 를 넘겨 기존 텍스트 알약 퀵메뉴(DEFAULT_QUICK_MENU_SCREEN)
  // 그대로 나간다(회귀 0 — mainMenuUi 와 같은 계약).
  const quickMenuScreen = quickMenu ? buildQuickMenuScreen(quickMenu) : DEFAULT_QUICK_MENU_SCREEN;

  const base = String.raw`################################################################################
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

${quickMenuScreen}


init python:
    config.overlay_screens.append("quick_menu")

default quick_menu = True
## 메뉴 펼침 상태(로컬 변수 아님 — 게임 진행 변수라 세이브/롤백에도 자연히 포함됨).
default quick_menu_expanded = False

## quick_menu 스타일은 터치 variant(hbox style_prefix "quick")가 그대로 쓴다 —
## 데스크톱 드롭다운 vbox 는 인라인 속성으로 우측 끝 정렬(xoffset 0)·spacing 0 을 따로 지정.
style quick_menu is vbox
style quick_button is default
style quick_button_text is button_text

style quick_menu:
    xalign 1.0
    yalign 0.0
    xoffset -gui.scale(12)
    yoffset gui.scale(56)
    spacing gui.scale(8)

style quick_button:
    properties gui.button_properties("quick_button")
    # 밝은 알약 프레임(Canvas 생성, buildZip.ts 의 quickPillAssets) — 제네릭 버튼 배경(투명)이
    # 원인이던 가시성 문제를 여기서만 덮어써 해결. 다른 버튼 종류는 영향 없음.
    idle_background Frame("gui/quickpill_idle.png", gui.scale(20), gui.scale(14))
    hover_background Frame("gui/quickpill_hover.png", gui.scale(20), gui.scale(14))
    selected_background Frame("gui/quickpill_hover.png", gui.scale(20), gui.scale(14))
    # insensitive_background 미지정 시 gui.button_properties 가 심어둔 기본 DynamicImage
    # (gui/button/quick_[prefix_]background.png, 실존하지 않음)가 남아있어 quick_menu 오버레이가
    # 화면에 뜨는 첫 인터랙션(예: 첫 대사)마다 Ren'Py 프리캐시가 이 이미지를 찾다 크래시함
    # (실행 검증으로 확인 — 실제 버튼이 insensitive 상태가 되는지와 무관하게 항상 조회됨).
    insensitive_background Frame("gui/quickpill_idle.png", gui.scale(20), gui.scale(14))
    xpadding gui.scale(24)
    ypadding gui.scale(12)
    xalign 1.0

style quick_button_text:
    properties gui.text_properties("quick_button")
    # 밝은 알약 배경 위에서 항상 읽히도록 진한 색으로 고정(테마 accent_color 는 밝은 배경에 대비가 약함).
    xalign 0.5
    idle_color "#3a2540"
    hover_color "#3a2540"
    selected_color "#3a2540"

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

${mainMenuScreen}


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
        add Transform(gui.main_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))
    else:
        add Transform(gui.game_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))

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
            # 터치에는 h 키·가운데 클릭이 없어 이 버튼이 대사창을 숨기는 유일한 방법이다.
            textbutton _("숨기기") action [SetVariable("quick_menu_expanded", False), HideInterface()]
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
${galleryScreens}${mmLinkStyles}${mmStyles}${galleryHubScreen}`;

  return base;
}
