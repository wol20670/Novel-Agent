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
  EscImageId,
  EscColors,
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
  escImageFile,
  ESC_SAVE_THUMB_MASK_FILE,
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
  /** 타이틀 정보/크레딧/도움말 링크 표시(기본 true) — types.ts mainMenuUi.showInfoLinks 주석 참고. */
  showInfoLinks: boolean;
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
 * ESC(게임 중) 메뉴 이미지 GUI 렌더 계획(generate.ts 가 project.escMenuUi 로 만들어 넘긴다).
 * 메인/퀵메뉴와 근본적으로 다르다 — 새 화면을 만들지 않고 기존 화면(navigation/game_menu/
 * file_slots/preferences/confirm/item_gallery/cg_gallery)을 그대로 둔 채 **style 블록만 뒤에
 * 이어붙인다**(Ren'Py 는 나중에 나온 style 문을 먼저 것 위에 얹는다). has 가 비어 있으면(즉
 * escMenuUi.images 자체가 없거나 전부 비어 있으면) generate.ts 의 buildEscMenuPlan 이 undefined 를
 * 반환해 screensRpy 는 아무 것도 추가하지 않는다(회귀 0 — mainMenuUi/quickMenuUi 와 같은 계약).
 */
export interface EscMenuPlan {
  /** 실제로 업로드된 롤 집합('bg' 도 포함될 수 있지만 화면 출력엔 관여하지 않는다 — 아래 참고). */
  has: Set<EscImageId>;
  /**
   * height / 1080. 아래 ESC_LAYOUT 의 1920×1080 기준 px 를 이 배율로 곱해 최종 값을 굽는다(런타임
   * 계산 없음). gui.scale()(720p 기준)은 금지 — CLAUDE.md, 메인/퀵메뉴와 같은 이유로 이미 굽는
   * 배율과 또 곱하면 이중 스케일링이 된다.
   */
  scale: number;
  /**
   * 원본 project.height(px) — scale 과 동시에 들고 다니는 이유는 escSlotThumbMetrics(height) 를
   * buildZip 과 **정확히 같은 인자**로 불러야 저장 슬롯 마스크 크기가 한 치도 안 어긋나기 때문
   * (scale 만으로 height 를 역산(scale*1080)하면 부동소수 오차가 낄 여지가 생긴다 — 굳이 감수할
   * 이유가 없어 원본값을 그대로 들고 온다).
   */
  height: number;
  /** ESC 메뉴 위 글자색(generate.ts 가 escColors() 로 기본값을 병합해 넘긴다 — 항상 전부 채워져 있다). */
  colors: Required<EscColors>;
}

/**
 * ESC 메뉴 레이아웃 좌표 — **1920×1080 기준 px, 업로드 배경 아트(공통배경)의 실제 그림 위치**를
 * 그대로 옮긴 값이다. 기존 화면은 gui.scale()(720p 기준) 상대 좌표라 배경 아트와 무관하게 배치되어
 * 콘텐츠가 카드 밖으로 삐져나오고 제목이 사이드바 위에 올라탔다(실기 확인 — 시안 대조로만 잡힌다).
 *
 * 카페테리아 에셋 기준 실측: 사이드바 0..318, 카드 362..1868 × 48..1028.
 * 여기 값이 곧 "카드 안쪽 여백을 둔 콘텐츠 박스"다 — 다른 아트를 쓰면 이 상수만 고치면 된다.
 */
const ESC_LAYOUT = {
  /** 콘텐츠 좌측 시작 x(카드 좌측 362 + 안쪽 여백 58). */
  contentLeft: 420,
  /** 콘텐츠 우측 끝 x(카드 우측 1868 - 안쪽 여백 58). */
  contentRight: 1810,
  /** 제목 baseline 영역 높이 — 이만큼 위를 비우고 그 아래부터 콘텐츠가 시작한다. */
  contentTop: 205,
  /** 콘텐츠 하단 끝 y(카드 하단 1028 - 안쪽 여백 8). */
  contentBottom: 1020,
  /**
   * 제목(저장/설정/…) 글자 크기·세로 영역. ⚠️ titleTop 이 없으면 제목이 y=0 부터 그려져 **카드 위쪽
   * 어두운 배경에 걸쳐 잘린 것처럼** 보인다(실기에서 확인 — 카드 상단이 y=48 이라 0..48 구간이 카드 밖).
   */
  titleTop: 60,
  titleSize: 54,
  titleBoxHeight: 118,
  /** 제목 밑 장식 밑줄(시안의 얇은 선) — 두께·길이·y. */
  ruleWidth: 200,
  ruleHeight: 2,
  ruleY: 168,
  /** 세로 스크롤바가 콘텐츠 오른쪽에 차지하는 폭(트랙+간격). */
  scrollbarGutter: 40,
  /** 설정 그룹 카드 — 2열 배치. */
  prefCardWidth: 660,
  prefCardPadX: 34,
  prefCardPadY: 26,
  prefCardSpacing: 30,
  /**
   * 갤러리 칸(발견한 아이템 4열 / 감상한 CG 3열). ⚠️ 기록만 — 저장 슬롯과 같은 종류의 미정렬이
   * 남아 있다: gallery_idle/gallery_locked 실측 규격은 300×180(안쪽 칸 278×126, ESC_IMAGES 의
   * hint 참고)인데 아래 칸 크기는 320×250/430×260 이라 비율이 안 맞아 아트가 늘어나 그려진다
   * (galleryGrid). 저장 슬롯은 이번에 slotThumb* 상수로 실측값을 맞췄지만, 갤러리는 사용자가
   * 아직 지적하지 않았고 화면도 별도라 이번 범위에서는 건드리지 않는다.
   */
  itemCellWidth: 320,
  itemCellHeight: 250,
  cgCellWidth: 430,
  cgCellHeight: 260,
  gallerySpacing: 20,
  /**
   * 화면 제목("저장" 등) 오른쪽 옆에 붙는 작은 "페이지 N" 라벨의 절대 위치·글자 크기. 시안에서
   * 실측한 값 — 실기 대조 후 어긋나면 이 상수만 고친다(escLayoutStyles 의 page_label 오버라이드).
   */
  pageLabelX: 648,
  pageLabelY: 112,
  pageLabelSize: 24,
  /** 저장 슬롯 썸네일 칸 안 "빈 슬롯" 글자, 칸 아래 "슬롯 N"/날짜 캡션 글자 크기(fileSlotsBody). */
  slotEmptySize: 26,
  slotCaptionSize: 20,
  /**
   * 좌측 내비게이션 pill 최소 크기 + 선택 시 점 자리만큼 밀 여백. xysize 가 아니라 최소값인 이유는
   * confirm_button 함정(CLAUDE.md)과 같다 — 긴 라벨("발견한 아이템")이 넘치면 안 된다. navDotGutter
   * 는 selected 아트에 박힌 점 오른쪽까지의 거리로, selected_left_padding 에만 쓴다(점은 selected
   * 상태 그림에만 있어 평상시엔 밀 이유가 없다 — 사용자가 확정한 "선택된 항목만 밀림" 정렬).
   */
  navButtonWidth: 227,
  navButtonHeight: 50,
  navTextSize: 28,
  navDotGutter: 62,
  /**
   * 저장 슬롯 썸네일 칸 — 실측 아트(카페테리아 저장슬롯 PNG, 320×190) 를 1.2배로 구운 값.
   * 1.2배인 이유: 기존 셀 폭(≈396, gui.scale(256)+여백)과 거의 같아 3열 격자가 그대로 들어맞고,
   * 320·190 둘 다 정수로 떨어진다.
   *   전체 320×190 → 슬롯 셀 384×228(slotCellWidth/Height)
   *   안쪽 회색 칸(x11..308,y11..142=298×132, 여백 좌·우·상 11/하 47) → 358×158, 좌상단 (13,13)
   *   칸 모서리 반지름 ≈6 → 8
   * ⚠️ 칸 비율(298:132 ≈ 2.26:1)은 16:9(1.78:1, 게임 스크린샷 비율)가 **아니다** — 게임 화면을
   * 그대로 썸네일 칸에 넣으면 반드시 남거나 잘린다. config.thumbnail_width/height 는 절대 이
   * 비율로 바꾸지 말 것(CLAUDE.md) — Ren'Py 가 저장 시점에 화면을 비균등 축소해 썸네일 자체가
   * 찌그러진 채로 저장된다. 대신 캡처는 16:9 그대로 두고 표시할 때 `fit="cover"` 로 채워 잘라낸다
   * (fileSlotsBody, AlphaMask 로 칸 모양대로 마스킹).
   */
  slotCellWidth: 384,
  slotCellHeight: 228,
  slotThumbLeft: 13,
  slotThumbTop: 13,
  slotThumbWidth: 358,
  slotThumbHeight: 158,
  slotThumbRadius: 8,
  /** 칸 아래 여백(172..228) 안에서 세로 가운데 — "슬롯 N"/날짜 캡션이 시작하는 y. */
  slotCaptionTop: 186,
} as const;

/**
 * 저장 슬롯 썸네일 둥근 마스크의 실제 픽셀 크기(폭/높이/반지름) — ESC_LAYOUT.slotThumb* 를
 * height/1080 배율로 굽는다. **크기 단일 소스**: screensRpy(아래 fileSlotsBody 가 AlphaMask 의
 * xysize 로 씀)와 buildZip(마스크 PNG 를 실제 이 픽셀 크기로 그림) 이 반드시 같은 값을 써야 한다
 * (dialogueGradientMetrics 와 같은 이유, CLAUDE.md) — 둘이 어긋나면 AlphaMask/Frame 이 마스크를
 * 늘리거나 줄여 애써 만든 둥근 모서리가 뭉개진다.
 */
export function escSlotThumbMetrics(height: number): { width: number; height: number; radius: number } {
  const scale = height / 1080;
  return {
    width: Math.round(ESC_LAYOUT.slotThumbWidth * scale),
    height: Math.round(ESC_LAYOUT.slotThumbHeight * scale),
    radius: Math.round(ESC_LAYOUT.slotThumbRadius * scale),
  };
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

  // showInfoLinks=false 면 정보/크레딧/도움말 자체를 안 낸다 — 이 셋은 MAIN_MENU_SLOTS 에 없어
  // 이미지 버튼 슬롯이 없고, 이미지 GUI 를 쓰면 혼자 맨 텍스트로 겉돌기 때문(types.ts 주석 참고).
  // 세로 분기의 `null height` 스페이서도 이 조건 안에 있어야 한다 — 밖에 두면 링크는 없는데
  // 그 자리만큼 빈 여백이 버튼 아래 남는다.
  if (plan.showInfoLinks) {
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
  const groups = languagePrefGroups(locales);
  if (groups.length === 0) return '';

  const I = (n: number) => ' '.repeat(n);
  const lines: string[] = [];
  lines.push(`${I(12)}hbox:`);
  lines.push(`${I(16)}box_wrap True`);
  lines.push('');

  for (const group of groups) {
    lines.push(`${I(16)}vbox:`);
    lines.push(`${I(20)}style_prefix "radio"`);
    lines.push(`${I(20)}label _("${group.label}")`);
    for (const item of group.items) {
      lines.push(`${I(20)}textbutton _("${item.label}") action ${item.action}`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

/**
 * 자막/음성 언어 선택 그룹(라벨 + 버튼들)의 **데이터**. languagePrefsBlock(기존 텍스트 배치)과
 * escPreferencesBody(카드 배치)가 같은 목록을 두 번 계산하지 않도록 뽑아냈다 — 언어 목록이나
 * action 이 한쪽에서만 바뀌면 두 배치가 조용히 어긋난다.
 */
function languagePrefGroups(locales?: GuiLocales): { label: string; items: { label: string; action: string }[] }[] {
  if (!locales) return [];
  const text = locales.text ?? [];
  const voice = locales.voice ?? [];
  const groups: { label: string; items: { label: string; action: string }[] }[] = [];

  if (text.length > 1) {
    const base = text[0]; // effectiveTextLocales 는 base 를 맨 앞에 둔다.
    groups.push({
      label: '자막 언어',
      items: text.map((loc) => ({
        label: LOCALE_LABEL[loc],
        // 기본 언어(대본 원문)는 번역 블록이 없어 Language(None).
        action: loc === base ? 'Language(None)' : `Language("${RENPY_LANG[loc]}")`,
      })),
    });
  }

  if (voice.length > 1) {
    groups.push({
      label: '음성 언어',
      items: (voice as Locale[]).map((loc) => ({
        label: LOCALE_LABEL[loc],
        action: `SetField(persistent, "voice_language", "${loc}")`,
      })),
    });
  }

  return groups;
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

/**
 * 아이템(소품) 팝업(인게임) + 발견한 아이템 보관함 화면(hasItems 일 때만 방출).
 * 보관함 격자는 galleryGrid 가 만든다 — escMenu 가 없으면 기존 출력 그대로(회귀 0).
 *
 * 격자가 "화면 코드"를 건드려야 하는 이유(style 블록만으론 안 되는 자리): 잠금 칸의
 * `background Solid(...)` 는 인라인 프로퍼티라 나중에 오는 `style frame:` 로도 덮어쓸 수 없고
 * (인라인이 항상 이긴다), 해금 칸의 `button:` 은 원래 스타일 이름이 없어(default "button" 스타일)
 * 뒤에서 style 블록만 추가해선 대상을 지정할 수 없다 — 그래서 이름 있는 스타일을 붙이는 쪽으로
 * 대신한다(buildEscMenuStyles 의 esc_gallery_idle_button/esc_gallery_locked_frame).
 * file_slots 의 save_empty 분기와 같은 종류의 예외.
 */
function itemScreens(escMenu?: EscMenuPlan): string {
  const grid = galleryGrid(escMenu, {
    cols: 4,
    seenExpr: 'persistent.item_found.get(it_tag, False)',
    listExpr: 'gui.items_all',
    loopVars: 'it_tag, it_name',
    tagVar: 'it_tag',
    nameVar: 'it_name',
    legacyCell: 200,
    legacyImage: 184,
    cellWidth: ESC_LAYOUT.itemCellWidth,
    cellHeight: ESC_LAYOUT.itemCellHeight,
  });
  return String.raw`

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
${grid}`;
}

/**
 * 감상한 CG 갤러리(hasCg 일 때만 방출). CG 는 배경과 같은 와이드스크린 비율이라 아이템 갤러리보다
 * 열을 줄이고(3열) 셀을 16:9-ish 로 넓게 잡는다. 감상 기록은 persistent.cg_seen(scriptBody 가
 * scene <tag>_scene 진입 시 기록), 목록은 gui.cgs_all(cg.rpy, resolveCgs 가 assets.rpy 와 같은
 * 태그 번호를 재사용해 계산).
 */
function cgScreens(escMenu?: EscMenuPlan): string {
  const grid = galleryGrid(escMenu, {
    cols: 3,
    seenExpr: 'persistent.cg_seen.get(cg_tag, False)',
    listExpr: 'gui.cgs_all',
    loopVars: 'cg_tag, cg_name',
    tagVar: 'cg_tag',
    nameVar: 'cg_name',
    legacyCell: 300,
    legacyCellHeight: 190,
    legacyImage: 288,
    legacyImageHeight: 162,
    cellWidth: ESC_LAYOUT.cgCellWidth,
    cellHeight: ESC_LAYOUT.cgCellHeight,
  });
  return String.raw`

################################################################################
## 감상한 CG 갤러리
################################################################################

screen cg_gallery():
    tag menu
    use game_menu(_("감상한 CG"), scroll="viewport"):
${grid}`;
}

/** galleryGrid 인자 — 아이템(정사각 4열)·CG(와이드 3열) 두 갤러리의 차이를 전부 값으로 뽑았다. */
interface GalleryGridSpec {
  cols: number;
  /** 해금 여부 파이썬 식. */
  seenExpr: string;
  /** 목록 파이썬 식(gui.items_all / gui.cgs_all). */
  listExpr: string;
  /** for 루프 변수 선언(`it_tag, it_name`). */
  loopVars: string;
  tagVar: string;
  nameVar: string;
  /** 기존(텍스트 GUI) 칸 치수 — gui.scale() 기준. 높이 생략 시 정사각. */
  legacyCell: number;
  legacyCellHeight?: number;
  legacyImage: number;
  legacyImageHeight?: number;
  /** ESC 이미지 GUI 칸 치수 — 1920 기준 px(ESC_LAYOUT). */
  cellWidth: number;
  cellHeight: number;
}

/**
 * 갤러리 vpgrid 본문. escMenu 가 없으면 **기존 출력과 바이트 단위로 동일**하고(회귀 0), 있으면
 * 시안 배치로 바꾼다 — 캡션이 칸 **밖 아래 가운데**가 아니라 **칸 안 좌하단**으로 들어가고(업로드한
 * 갤러리슬롯 아트가 하단에 캡션 띠를 그려둔 구조다), 칸이 카드 폭에 맞게 커진다.
 *
 * escMenu 가 있을 때 캡션 색을 인라인으로 박는 이유: 이 텍스트들은 이름 있는 스타일이 없는 기본
 * `text` 라 뒤에 style 블록을 붙여선 골라 잡을 수 없고, `style text:` 를 통째로 덮으면 대사창까지
 * 딸려간다(팔레트는 ESC 메뉴에만 적용돼야 한다).
 */
function galleryGrid(escMenu: EscMenuPlan | undefined, spec: GalleryGridSpec): string {
  const cellH = spec.legacyCellHeight ?? spec.legacyCell;
  const imgH = spec.legacyImageHeight ?? spec.legacyImage;
  if (!escMenu) {
    return `        vpgrid:
            cols ${spec.cols}
            spacing gui.scale(18)
            for ${spec.loopVars} in ${spec.listExpr}:
                vbox:
                    spacing gui.scale(4)
                    xsize gui.scale(${spec.legacyCell})
                    if ${spec.seenExpr}:
                        button:
                            xysize (gui.scale(${spec.legacyCell}), gui.scale(${cellH}))
                            action Show("gallery_lightbox", img=${spec.tagVar}, caption=${spec.nameVar})
                            add ${spec.tagVar}:
                                fit "contain"
                                xysize (gui.scale(${spec.legacyImage}), gui.scale(${imgH}))
                                align (0.5, 0.5)
                        text ${spec.nameVar} xalign 0.5 size gui.scale(16)
                    else:
                        frame:
                            xysize (gui.scale(${spec.legacyCell}), gui.scale(${cellH}))
                            background Solid(gui.frame_bg_color)
                            text "???" align (0.5, 0.5) size gui.scale(34) color gui.insensitive_color
                        text _("???") xalign 0.5 size gui.scale(16) color gui.insensitive_color
`;
  }

  const s = (v: number) => px(escMenu, v);
  const { colors } = escMenu;
  // 캡션 띠(칸 아래쪽)를 뺀 나머지가 그림 영역. 좌우 14px, 위 14px 여백.
  // ⚠️ 그림은 반드시 안쪽 fixed 안에서 align (0.5, 0.5) 로 가운데 놓는다 — `add x: fit "contain"
  //    xysize(...)` 는 축소 후 크기가 xysize 보다 작아지므로, pos 로 직접 놓으면 세로 사진이 칸
  //    왼쪽에 쏠려 붙는다(실기 확인).
  const capBand = 48;
  const imgW = spec.cellWidth - 28;
  // 캡션 폭을 칸 안으로 묶는다 — 안 묶으면 긴 CG 이름이 칸을 뚫고 옆 칸·카드 밖까지 흘러나간다.
  const capW = spec.cellWidth - 36;
  const imgHeight = spec.cellHeight - capBand - 28;
  const idleStyleLine = escMenu.has.has('gallery_idle') ? '\n                        style "esc_gallery_idle_button"' : '';
  const lockedBackground = escMenu.has.has('gallery_locked')
    ? 'style "esc_gallery_locked_frame"'
    : 'background Solid(gui.frame_bg_color)';
  return `        vpgrid:
            cols ${spec.cols}
            spacing ${s(ESC_LAYOUT.gallerySpacing)}
            for ${spec.loopVars} in ${spec.listExpr}:
                if ${spec.seenExpr}:
                    button:${idleStyleLine}
                        xysize (${s(spec.cellWidth)}, ${s(spec.cellHeight)})
                        action Show("gallery_lightbox", img=${spec.tagVar}, caption=${spec.nameVar})
                        has fixed
                        fixed:
                            pos (${s(14)}, ${s(14)})
                            xysize (${s(imgW)}, ${s(imgHeight)})
                            add ${spec.tagVar}:
                                fit "contain"
                                xysize (${s(imgW)}, ${s(imgHeight)})
                                align (0.5, 0.5)
                        text ${spec.nameVar}:
                            pos (${s(18)}, ${s(spec.cellHeight - capBand + 8)})
                            xsize ${s(capW)}
                            size ${s(17)}
                            color "${colors.body}"
                else:
                    frame:
                        xysize (${s(spec.cellWidth)}, ${s(spec.cellHeight)})
                        ${lockedBackground}
                        has fixed
                        text "???":
                            pos (${s(Math.round(spec.cellWidth / 2))}, ${s(Math.round((spec.cellHeight - capBand) / 2))})
                            anchor (0.5, 0.5)
                            size ${s(34)}
                            color "${colors.muted}"
                        text _("???"):
                            pos (${s(18)}, ${s(spec.cellHeight - capBand + 8)})
                            xsize ${s(capW)}
                            size ${s(17)}
                            color "${colors.muted}"
`;
}

/** 1920×1080 기준 px 를 프로젝트 해상도로 굽는다(ESC 계획 공용 — gui.scale() 금지, CLAUDE.md). */
function px(plan: EscMenuPlan, value1080: number): number {
  return Math.round(value1080 * plan.scale);
}

/**
 * screen preferences() 의 본문. escMenu 가 없으면 **기존 출력과 바이트 단위로 동일**(회귀 0),
 * 있으면 시안대로 **그룹마다 카드 한 장**인 2열 배치로 바꾼다.
 *
 * 왜 style 만으론 안 되는가: 업로드한 콘텐츠카드는 `style frame` 배경으로 꽂히는데, 설정 그룹은
 * frame 이 아니라 **vbox** 라 배경 프로퍼티 자체가 없다(vbox 는 window 가 아니다). 카드를 씌우려면
 * 그룹을 frame 으로 감싸는 화면 코드 변경이 불가피하다 — 실기에서 카드 에셋이 어디에도 안 보이던
 * 원인이 이것이다.
 *
 * ⚠️ 카드 배치에선 `style_prefix` 를 쓰지 않고 위젯마다 스타일을 명시한다. frame 에 style_prefix 를
 * 걸면 프레임 자신이 `<prefix>_frame` 으로 바뀌어 카드 배경이 날아가고, 안쪽 vbox 에 걸면
 * `radio_hbox` 처럼 **정의된 적 없는 스타일**을 Ren'Py 가 찾다 죽는다.
 */
function preferencesBody(escMenu: EscMenuPlan | undefined, locales: GuiLocales | undefined, languagePrefs: string): string {
  if (!escMenu) {
    return `        vbox:

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
`;
  }

  const s = (v: number) => px(escMenu, v);
  const I = (n: number) => ' '.repeat(n);
  const out: string[] = [];
  // box_wrap 이 660+30+660=1350(=뷰포트 폭)에서 정확히 2열로 접힌다.
  out.push(`${I(8)}hbox:`);
  out.push(`${I(12)}box_wrap True`);
  out.push(`${I(12)}spacing ${s(ESC_LAYOUT.prefCardSpacing)}`);
  out.push(`${I(12)}box_wrap_spacing ${s(ESC_LAYOUT.prefCardSpacing)}`);

  /** 카드 한 장 = 제목 + 자식 블록. condition 이 있으면 `if` 로 감싼다. */
  const card = (title: string, body: string[], condition?: string) => {
    const base = condition ? 12 + 4 : 12;
    out.push('');
    if (condition) out.push(`${I(12)}if ${condition}:`);
    out.push(`${I(base)}frame:`);
    out.push(`${I(base + 4)}style "esc_pref_card"`);
    out.push('');
    out.push(`${I(base + 4)}vbox:`);
    out.push(`${I(base + 8)}spacing ${s(14)}`);
    out.push(`${I(base + 8)}text _("${title}") style "esc_pref_title"`);
    for (const line of body) out.push(line === '' ? '' : `${I(base + 8)}${line}`);
  };

  /** 알약 버튼 가로 줄(시안은 선택지가 옆으로 늘어선다 — 기존은 세로 나열이었다). */
  const pillRow = (buttons: { label: string; action: string }[], style: string) => {
    const lines = [`hbox:`, `    spacing ${s(12)}`, `    box_wrap True`, `    box_wrap_spacing ${s(10)}`];
    for (const b of buttons) lines.push(`    textbutton _("${b.label}") action ${b.action} style "${style}"`);
    return lines;
  };

  card(
    '디스플레이',
    pillRow(
      [
        { label: '창 모드', action: 'Preference("display", "window")' },
        { label: '전체 화면', action: 'Preference("display", "fullscreen")' },
      ],
      'radio_button',
    ),
    'renpy.variant("pc") or renpy.variant("web")',
  );

  card(
    '스킵',
    pillRow(
      [
        { label: '읽지 않은 대사', action: 'Preference("skip", "toggle")' },
        { label: '선택 후에도', action: 'Preference("after choices", "toggle")' },
        { label: '전환 효과', action: 'InvertSelected(Preference("transitions", "toggle"))' },
      ],
      'check_button',
    ),
  );

  for (const group of languagePrefGroups(locales)) {
    card(group.label, pillRow(group.items, 'radio_button'));
  }

  card('텍스트 진행', [
    `text _("텍스트 속도") style "esc_pref_sub"`,
    `bar value Preference("text speed") style "slider_slider"`,
    `text _("자동 진행 시간") style "esc_pref_sub"`,
    `bar value Preference("auto-forward time") style "slider_slider"`,
  ]);

  const audio: string[] = [];
  for (const [flag, label, pref, sample] of [
    ['config.has_music', '음악 볼륨', 'music volume', null],
    ['config.has_sound', '효과음 볼륨', 'sound volume', 'sound'],
    ['config.has_voice', '음성 볼륨', 'voice volume', 'voice'],
  ] as const) {
    audio.push(`if ${flag}:`);
    audio.push(`    text _("${label}") style "esc_pref_sub"`);
    audio.push(`    bar value Preference("${pref}") style "slider_slider"`);
    // 샘플 재생 버튼은 기존 배치에 있던 기능이라 카드 배치에서도 유지한다(config.sample_* 가
    // 있을 때만 나오므로 대개 안 보이지만, 이미지 GUI 를 켰다고 기능이 사라지면 안 된다).
    if (sample) {
      audio.push(`    if config.sample_${sample}:`);
      audio.push(`        textbutton _("테스트") action Play("${sample}", config.sample_${sample}) style "check_button"`);
    }
  }
  audio.push('if config.has_music or config.has_sound or config.has_voice:');
  audio.push('    textbutton _("전체 음소거"):');
  audio.push('        action Preference("all mute", "toggle")');
  audio.push('        style "mute_all_button"');
  card('음향', audio);

  return out.join('\n') + '\n';
}

/**
 * screen file_slots(title) 의 grid 안 슬롯 button: 본문. `escMenu` 가 없으면 지금 출력을 **글자
 * 하나 안 바꾸고** 그대로 반환한다(회귀 0 — preferencesBody 와 같은 계약).
 *
 * 있으면 실측 아트 규격(ESC_LAYOUT 의 slotCell·slotThumb 계열)대로 **절대 배치**로 바꾼다 — 예전엔
 * `has vbox` 로 스크린샷·캡션이 순서대로 쌓이기만 해서, 셀 크기가 아트의 안쪽 회색 칸(298×132,
 * 16:9 가 아니다)과 안 맞으면 썸네일이 칸보다 작게 위로 치우쳐 그려지고 "슬롯 N" 캡션이 칸을
 * 침범했다(실기 스크린샷으로 발견 — lint 로는 안 잡힌다). 지금은:
 *   - `button: xysize (slotCellWidth, slotCellHeight)` 로 셀 자체를 아트 비율(384×228)에 고정.
 *   - 안쪽 `fixed: pos(slotThumbLeft, slotThumbTop) xysize(slotThumbWidth, slotThumbHeight)` 가
 *     칸 자리. `config.thumbnail_*` 는 16:9 캡처 그대로 두고(칸 비율로 바꾸면 저장 시점에 Ren'Py 가
 *     화면을 비균등 축소해 썸네일 자체가 찌그러진다 — CLAUDE.md) `fit="cover"` 로 채워 자른 뒤,
 *     `AlphaMask` 로 둥근 모서리 마스크(escSlotThumbMetrics 가 크기 단일 소스, buildZip 이 같은
 *     크기로 PNG 를 굽는다)를 씌워 칸 모양대로 잘라낸다.
 *   - 캡션(슬롯 N/날짜·세이브명)은 칸 밖 `slotCaptionTop` 에 `pos` 로 직접 놓는다 — 이제 fixed
 *     안의 자식이라 `escPaletteStyles` 쪽 `slot_time_text`/`slot_name_text` 의 `xalign` 은
 *     제거해야 한다(앵커가 pos 와 xalign 을 동시에 두고 싸운다). 세이브명은 칸 우측 끝
 *     (slotThumbLeft+slotThumbWidth)에 `xanchor 1.0` 으로 오른쪽 정렬한다(시안 배치).
 *
 * 배경 이미지 선택(esc_save_empty_button 스타일 분기 — 기존 `fileSlotStyleBlock` 을 이 함수가
 * 흡수했다)과 이 레이아웃은 서로 독립적인 문제라 게이트 조건이 다르다: 배경 분기는 `save_empty`
 * 에셋 유무(buildEscMenuStyles 가 `esc_save_empty_button` 을 정의하는 조건과 반드시 같아야
 * "정의된 적 없는 스타일" 크래시가 안 난다 — CLAUDE.md), 레이아웃 자체는 다른 ESC 그룹들처럼
 * `escMenu` 존재 하나로만 갈린다(퀵메뉴처럼 특정 토글 이미지를 앵커로 요구하지 않는다 — "일부만
 * 이미지" 워크플로가 file_slots 에도 그대로 적용된다).
 */
function fileSlotsBody(escMenu: EscMenuPlan | undefined): string {
  const styleBranch = escMenu?.has.has('save_empty')
    ? `
                        if FileLoadable(slot):
                            style "slot_button"
                        else:
                            style "esc_save_empty_button"`
    : '';

  if (!escMenu) {
    return `                    button:${styleBranch}
                        action FileAction(slot)

                        has vbox

                        add FileScreenshot(slot) xalign 0.5

                        text FileTime(slot, format=_("{#file_time}%Y.%m.%d (%A) %H:%M"), empty=_("빈 슬롯")):
                            style "slot_time_text"

                        text FileSaveName(slot):
                            style "slot_name_text"

                        key "save_delete" action FileDelete(slot)`;
  }

  const cellW = px(escMenu, ESC_LAYOUT.slotCellWidth);
  const cellH = px(escMenu, ESC_LAYOUT.slotCellHeight);
  const thumbLeft = px(escMenu, ESC_LAYOUT.slotThumbLeft);
  const thumbTop = px(escMenu, ESC_LAYOUT.slotThumbTop);
  const thumb = escSlotThumbMetrics(escMenu.height); // buildZip 의 마스크 PNG 픽셀 크기와 같은 함수(단일 소스).
  const captionTop = px(escMenu, ESC_LAYOUT.slotCaptionTop);
  const captionRight = thumbLeft + thumb.width; // 칸 우측 끝 — 세이브명 오른쪽 정렬 기준점.

  // empty=_("슬롯 [slot]") 의 [slot] 은 화면 스코프 변수(screen file_slots 의 for 루프)를 Ren'Py
  // 가 text 보간 시점에 치환한다 — lint 로는 확인 불가, 실기에서 "슬롯 2" 로 나오는지 확인 필요.
  const I = (n: number) => ' '.repeat(n);
  return [
    `${I(20)}button:${styleBranch}`,
    `${I(24)}action FileAction(slot)`,
    `${I(24)}xysize (${cellW}, ${cellH})`,
    '',
    `${I(24)}has fixed`,
    '',
    `${I(24)}fixed:`,
    `${I(28)}pos (${thumbLeft}, ${thumbTop})`,
    `${I(28)}xysize (${thumb.width}, ${thumb.height})`,
    '',
    `${I(28)}add AlphaMask(Transform(FileScreenshot(slot), fit="cover", xysize=(${thumb.width}, ${thumb.height})), "${ESC_SAVE_THUMB_MASK_FILE}")`,
    '',
    `${I(28)}if not FileLoadable(slot):`,
    `${I(32)}text _("빈 슬롯") align (0.5, 0.5) style "esc_slot_empty_text"`,
    '',
    `${I(24)}text FileTime(slot, format=_("{#file_time}%Y.%m.%d · %H:%M"), empty=_("슬롯 [slot]")):`,
    `${I(28)}style "slot_time_text"`,
    `${I(28)}pos (${thumbLeft}, ${captionTop})`,
    // 앵커는 화면에서 명시하고 스타일엔 xalign 을 두지 않는다 — 테마 기본값
    // gui.slot_button_text_xalign(=0.5, guiRpy.ts)이 xanchor 로 남아 있으면, 위 pos 는
    // xpos 만 덮어써서 글자가 자기 폭의 절반만큼 왼쪽으로 밀린다(직전 커밋에서 slot_time_text
    // 의 xalign 을 뺐다가 실기에서 캡션이 왼쪽으로 튄 원인). FileSaveName 의 xanchor 1.0(아래)
    // 과 짝을 이룬다.
    `${I(28)}xanchor 0.0`,
    '',
    `${I(24)}text FileSaveName(slot):`,
    `${I(28)}style "slot_name_text"`,
    `${I(28)}pos (${captionRight}, ${captionTop})`,
    `${I(28)}xanchor 1.0`,
    '',
    `${I(24)}key "save_delete" action FileDelete(slot)`,
  ].join('\n');
}

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

/**
 * ESC(게임 중) 메뉴 이미지 GUI — 새 화면을 만들지 않고 기존 화면(navigation/game_menu/file_slots/
 * preferences/confirm/item_gallery/cg_gallery)의 style 블록만 뒤에 이어붙인다(base 템플릿 맨 끝,
 * Ren'Py 는 나중에 나온 style 문을 먼저 것 위에 얹는다). plan 이 undefined 면 빈 문자열 — screens.rpy
 * 가 기존과 바이트 단위로 같다(회귀 0, mainMenuUi/quickMenuUi 와 같은 계약).
 *
 * ⚠️ CRASH TRAP(퀵메뉴 이미지화 때 실제로 겪음 — CLAUDE.md 최상위 함정): `properties
 * gui.button_properties(kind)` 가 심어두는 "background" 는 실존하지 않는 gui/button/*.png 를
 * 가리키는 Frame 이다(zero-PNG 빌드). idle_background 등 상태별 프로퍼티를 "일부만" 지정하면
 * (background 단일 프로퍼티가 아니라 개별 상태 프로퍼티로 갈아끼우는 순간) 지정 안 한 상태는 그
 * 기본값에 그대로 남아, 그 화면이 열릴 때(프리캐시) 없는 파일을 찾다 크래시한다. 그래서 버튼류
 * (navigation_button/return_button/radio_button/check_button/slot_button/confirm_button/
 * esc_gallery_idle_button/esc_save_empty_button)는 이미지를 하나라도 얹을 땐 반드시
 * idle/hover/selected/insensitive 네 롤을 전부 채운다 — 대응 에셋이 없는 롤은 idle 이미지로 폴백.
 * bar/slider/vscrollbar 는 gui.button_properties 를 전혀 쓰지 않는 순수 Solid 기반이라(base 템플릿에
 * 이미 모든 상태가 명시돼 있다) 이 함정 대상이 아니다 — 준 롤만 부분 교체해도 안전하다.
 *
 * Frame 테두리(9-slice): card(96×96, 24px 테두리)만 치수가 명세돼 있다. 나머지 버튼류 에셋은
 * 폭이 라벨 길이·프리셋에 따라 달라질 수 있어 모서리 반경을 추측하지 않고 border 0 을 쓴다 — Frame
 * 이 이미지를 실제 버튼 박스 크기에 맞춰 통짜로 늘려 채우는 안전한 기본값이다.
 */
function buildEscMenuStyles(plan: EscMenuPlan | undefined): string {
  if (!plan) return '';
  const has = (id: EscImageId) => plan.has.has(id);
  const file = (id: EscImageId) => escImageFile(id);
  const parts: string[] = [];

  /**
   * 이미지 버튼 위 글자색 고정. 테마의 버튼 글자색은 **어두운 배경**을 전제로 잡혀 있어, 밝은
   * 아이보리 버튼 아트 위에 그대로 얹으면 글자가 묻혀 사라진다(실기 확인 — lint·테스트로는 절대
   * 안 잡힌다). 퀵메뉴의 quick_button_text 가 같은 이유로 이미 색을 고정하고 있다.
   *
   * ⚠️ **두 규칙이 정반대라 하나로 통일하면 안 된다**(처음에 통일했다가 실기에서 걸렸다):
   *  · 'onLight' — 선택버튼·슬롯·팝업버튼. 평상시 배경이 **밝은 크림**이고 선택됐을 때 진해진다
   *    → 평상시 어두운 글자, 선택 시 밝은 글자.
   *  · 'onDark' — 좌측 내비게이션. 평상시엔 **어두운 사이드바** 위에 맨몸으로 놓이고(nav_idle 이
   *    거의 투명) 선택됐을 때만 밝은 알약이 깔린다 → 정확히 반대.
   *
   * 팔레트(plan.colors)는 **카드 표면 위 글자**를 규정한다. 내비의 평상시/마우스오버 색만 리터럴로
   * 남아 있는데, 그건 카드가 아니라 배경 아트의 사이드바 위 색이라 팔레트가 답을 갖고 있지 않기
   * 때문이다(사이드바가 밝은 아트를 쓰게 되면 그때 롤을 하나 더 판다).
   */
  const c = plan.colors;
  const ESC_TEXT_COLORS = (styleName: string, on: 'onLight' | 'onDark') =>
    on === 'onLight'
      ? ESC_TEXT_COLORS_FOR(plan, styleName)
      : `
style ${styleName}:
    idle_color "#e8dcc8"
    hover_color "#fdf6ec"
    selected_color "${c.body}"
    insensitive_color "#7a6a58"`;

  // ── 공통 배경을 가리는 어두운 스크림 제거 ────────────────────────────────
  // game_menu_outer_frame 은 원래 화면 전체에 Solid(gui.menu_overlay_color) 를 깐다(텍스트 메뉴가
  // 대사 화면 위에서 읽히게 하는 장치). 업로드한 공통배경은 이미 사이드바+카드가 그려진 완성 아트라
  // 그 스크림이 위를 덮으면 **배경이 통째로 안 보인다** — 실기로 확인한 실제 버그다(lint·테스트 통과).
  if (has('bg')) {
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 업로드한 공통배경이 보이도록 기본 스크림을 걷는다.
style game_menu_outer_frame:
    background None
`);
  }

  // ── 좌측 내비게이션(게임 메뉴 공용 목록) + 돌아가기 ──────────────────────
  if (has('nav_idle')) {
    const idle = file('nav_idle');
    const hover = has('nav_hover') ? file('nav_hover') : idle;
    const selected = has('nav_selected') ? file('nav_selected') : idle;
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 좌측 내비게이션 버튼(기록/저장/불러오기/설정/정보/크레딧/도움말/종료 공용).
## xminimum/yminimum 인 이유는 confirm_button 함정(CLAUDE.md)과 같다 — 버튼 배경만 이미지로
## 갈아끼우고 최소 크기를 안 주면 pill 이 글자 폭으로 쪼그라들어(긴 라벨 "발견한 아이템"에서 특히)
## 점이 찌그러지고 글자가 그 위를 덮는다(실기 확인). selected_left_padding 은 점이 selected 아트
## 에만 박혀 있어 **선택된 항목만** 오른쪽으로 미는 용도 — 사용자가 확정한 정렬이다.
style navigation_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${selected}", 0, 0)
    insensitive_background Frame("${idle}", 0, 0)
    xminimum ${px(plan, ESC_LAYOUT.navButtonWidth)}
    yminimum ${px(plan, ESC_LAYOUT.navButtonHeight)}
    selected_left_padding ${px(plan, ESC_LAYOUT.navDotGutter)}

## return_button 은 "style return_button is navigation_button" 이지만, 상속 체인에 기대지 않고
## art 를 확실히 물려받도록 여기서도 명시적으로 선언한다.
style return_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${selected}", 0, 0)
    insensitive_background Frame("${idle}", 0, 0)
    xminimum ${px(plan, ESC_LAYOUT.navButtonWidth)}
    yminimum ${px(plan, ESC_LAYOUT.navButtonHeight)}
    selected_left_padding ${px(plan, ESC_LAYOUT.navDotGutter)}
${ESC_TEXT_COLORS('navigation_button_text', 'onDark')}
    size ${px(plan, ESC_LAYOUT.navTextSize)}
${ESC_TEXT_COLORS('return_button_text', 'onDark')}
    size ${px(plan, ESC_LAYOUT.navTextSize)}

## ⚠️ "style mm_link_button is navigation_button"(MM_LINK_STYLES, 파일 상단) — 정보/크레딧/도움말
## 타이틀 링크가 위 xminimum/yminimum/selected_left_padding 을 그대로 물려받는다(부모 스타일 값이
## 바뀌면 자식도 같이 바뀌는 살아있는 참조라, 여기서 새로 연 프로퍼티가 자동으로 새어 들어간다).
## 이번 범위에서는 MM_LINK_STYLES 를 건드리지 않는다 — 사용자가 그 링크를 끌 수 있어(showInfoLinks)
## 실질 영향이 적고, 건드리면 메인메뉴 구성의 회귀 0 증명이 흐려진다.
`);
  }

  // ── 공용 카드/프레임 배경 ────────────────────────────────────────────
  if (has('card')) {
    const border = Math.round(24 * plan.scale);
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 공용 카드/프레임 배경(9-slice, 96×96 원본에 테두리 24px 기준).
## 별도 style 없이 쓰는 frame: 전부(예: gallery_locked 가 없을 때의 갤러리 잠금 칸)에 적용된다.
style frame:
    background Frame("${file('card')}", ${border}, ${border})
`);
  }

  // ── 설정 화면 라디오(디스플레이)·체크(스킵) 버튼 ──────────────────────
  if (has('choice_idle')) {
    const idle = file('choice_idle');
    const hover = has('choice_hover') ? file('choice_hover') : idle;
    const selected = has('choice_selected') ? file('choice_selected') : idle;
    const disabled = has('choice_disabled') ? file('choice_disabled') : idle;
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 설정 화면의 라디오(디스플레이)·체크(스킵) 버튼.
style radio_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${selected}", 0, 0)
    insensitive_background Frame("${disabled}", 0, 0)

style check_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${selected}", 0, 0)
    insensitive_background Frame("${disabled}", 0, 0)
${ESC_TEXT_COLORS('radio_button_text', 'onLight')}
${ESC_TEXT_COLORS('check_button_text', 'onLight')}
`);
  }

  // ── 슬라이더(텍스트 속도·자동 진행·볼륨) ────────────────────────────────
  if (has('slider_track') || has('slider_fill') || has('slider_thumb')) {
    const lines = ['style slider:'];
    if (has('slider_fill')) lines.push(`    left_bar Frame("${file('slider_fill')}", 0, 0)`);
    if (has('slider_track')) lines.push(`    right_bar Frame("${file('slider_track')}", 0, 0)`);
    if (has('slider_thumb')) lines.push(`    thumb Frame("${file('slider_thumb')}", 0, 0)`);
    parts.push(`\n\n## ESC 메뉴 이미지 GUI — 슬라이더(텍스트 속도·자동 진행·볼륨). CRASH TRAP 비대상(위 코멘트\n## 참고) — 준 롤만 부분 교체해도 안전.\n${lines.join('\n')}\n`);
  }

  // ── 저장/불러오기 슬롯 ──────────────────────────────────────────────
  if (has('save_idle')) {
    const idle = file('save_idle');
    const hover = has('save_hover') ? file('save_hover') : idle;
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 저장/불러오기 슬롯. selected/insensitive 전용 에셋이 없어 idle 로 폴백한다
## (원래도 slot_button 은 background/hover_background 만 명시하고 selected/insensitive 는
## gui.button_properties 기본값에 열려 있던 자리였다 — 이미지를 얹는 김에 네 롤을 전부 닫는다).
style slot_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${idle}", 0, 0)
    insensitive_background Frame("${idle}", 0, 0)
${ESC_TEXT_COLORS('slot_button_text', 'onLight')}
`);
  }

  // 빈 저장 슬롯 — file_slots 의 유일한 화면 코드 변경(FileLoadable 분기, screensRpy() 참고)이 이
  // 스타일을 참조한다. slot_button 을 상속해 패딩 등은 그대로 두고 배경만 4롤 전부 save_empty 로.
  if (has('save_empty')) {
    const empty = file('save_empty');
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 빈 저장 슬롯(FileLoadable(slot) 이 False 일 때만 적용, file_slots 화면 참고).
style esc_save_empty_button is slot_button:
    idle_background Frame("${empty}", 0, 0)
    hover_background Frame("${empty}", 0, 0)
    selected_background Frame("${empty}", 0, 0)
    insensitive_background Frame("${empty}", 0, 0)
`);
  }

  // ── 갤러리(발견한 아이템/감상한 CG) 카드 ────────────────────────────────
  if (has('gallery_idle')) {
    const idle = file('gallery_idle');
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 갤러리 해금 카드. 상태별 전용 에셋이 없어 네 롤 전부 같은 이미지로 채운다
## (버튼이라 CRASH TRAP 대상은 그대로 — "is button" 상속만으론 배경이 없는 파일을 가리킨다).
## item_gallery/cg_gallery 의 button: 에 이 스타일 태그를 붙이는 쪽은 itemScreens/cgScreens 가 한다.
style esc_gallery_idle_button is button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${idle}", 0, 0)
    selected_background Frame("${idle}", 0, 0)
    insensitive_background Frame("${idle}", 0, 0)
`);
  }
  if (has('gallery_locked')) {
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 갤러리 잠금 카드. frame: 이라 상태가 없어(버튼 아님) CRASH TRAP 대상이
## 아니다. item_gallery/cg_gallery 의 잠금 칸이 인라인 "background Solid(...)" 대신 이 스타일을
## 참조하도록 itemScreens/cgScreens 가 바꿔치기한다(이 에셋이 없으면 원본 인라인 그대로 — 회귀 0).
style esc_gallery_locked_frame is frame:
    background Frame("${file('gallery_locked')}", 0, 0)
`);
  }

  // ── 게임 메뉴 세로 스크롤바(설정/기록/갤러리 뷰포트 공용) ────────────────
  if (has('scroll_track') || has('scroll_thumb')) {
    const lines = ['style vscrollbar:'];
    if (has('scroll_track')) lines.push(`    base_bar Frame("${file('scroll_track')}", 0, 0)`);
    if (has('scroll_thumb')) lines.push(`    thumb Frame("${file('scroll_thumb')}", 0, 0)`);
    parts.push(`\n\n## ESC 메뉴 이미지 GUI — 게임 메뉴 세로 스크롤바. CRASH TRAP 비대상(슬라이더와 같은 이유).\n${lines.join('\n')}\n`);
  }

  // ── 종료 확인 팝업 ────────────────────────────────────────────────
  if (has('popup_bg')) {
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 종료 확인 팝업(confirm) 배경. 최소 크기를 에셋 규격(680×330)으로 잡는다 —
## 안 잡으면 Frame 이 짧은 문구 폭으로 쪼그라들어 아트의 장식(모서리·좌상단 선)이 뭉개진다.
## xysize 가 아니라 최소값인 이유: 저장 덮어쓰기 확인처럼 긴 문구가 오면 넘쳐야 하는 게 아니라 늘어나야 한다.
style confirm_frame:
    background Frame("${file('popup_bg')}", 0, 0)
    xminimum ${px(plan, 680)}
    yminimum ${px(plan, 330)}
`);
  }
  if (has('popup_btn_idle')) {
    const idle = file('popup_btn_idle');
    const hover = has('popup_btn_hover') ? file('popup_btn_hover') : idle;
    const selected = has('popup_btn_selected') ? file('popup_btn_selected') : idle;
    parts.push(String.raw`

## ESC 메뉴 이미지 GUI — 종료 확인 팝업의 예/아니오 버튼. 최소 크기를 에셋 규격(200×58)으로 잡는다 —
## 버튼은 기본적으로 글자 폭에 딱 붙어서, 안 잡으면 "예" 가 글자 두 배 크기의 알약이 아니라 글자에
## 테두리만 두른 꼴이 된다(실기 확인 — 시안의 넓은 알약과 가장 크게 어긋났던 지점).
style confirm_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${selected}", 0, 0)
    insensitive_background Frame("${idle}", 0, 0)
    xminimum ${px(plan, 200)}
    yminimum ${px(plan, 58)}
    padding (0, 0)
${ESC_TEXT_COLORS('confirm_button_text', 'onLight')}
    xalign 0.5
    yalign 0.5
`);
  }

  parts.push(escLayoutStyles(plan));
  parts.push(escPaletteStyles(plan));
  return parts.join('');
}

/**
 * 콘텐츠 박스를 배경 아트의 카드 안으로 밀어 넣는 style 블록.
 *
 * 기존 값들은 전부 gui.scale()(720p 기준) 상대 좌표라 **배경 아트가 어디에 카드를 그렸는지 모른다**.
 * 그래서 실기에선 제목이 사이드바 위 "카페테리아" 자리를 덮고, 격자가 카드 아래 여백까지 흘러내렸다
 * (시안 대조로만 잡히는 종류 — lint·테스트 전부 통과했다). ESC_LAYOUT 이 좌표 단일 소스.
 *
 * navigation_frame 은 hbox 안의 **빈 자리채기**일 뿐이다(실제 내비 버튼은 `use navigation` 이
 * 화면 최상위에 절대좌표로 그린다) — 그래서 폭만 줄여 콘텐츠 시작 x 를 옮기는 데 써도 안전하다.
 */
function escLayoutStyles(plan: EscMenuPlan): string {
  const s = (v: number) => px(plan, v);
  const L = ESC_LAYOUT;
  // 자리채기 프레임 폭 + 콘텐츠 프레임 왼쪽 여백 = 콘텐츠 시작 x. 여백 60 을 남겨 두 값을 가른다.
  const navSpacer = L.contentLeft - 60;
  return String.raw`

## ESC 메뉴 이미지 GUI — 콘텐츠 박스를 배경 아트의 카드 안쪽(${L.contentLeft}..${L.contentRight} × ${L.contentTop}..${L.contentBottom},
## 1920×1080 기준)으로 맞춘다. 좌표를 gui 헬퍼가 아니라 구운 px 로 내는 이유는 CLAUDE.md 참고.
style game_menu_outer_frame:
    top_padding ${s(L.contentTop)}
    bottom_padding ${s(1080 - L.contentBottom)}

style game_menu_navigation_frame:
    xsize ${s(navSpacer)}

style game_menu_content_frame:
    left_margin ${s(L.contentLeft - navSpacer)}
    right_margin ${s(1920 - L.contentRight)}
    top_margin 0

style game_menu_viewport:
    xsize ${s(L.contentRight - L.contentLeft - L.scrollbarGutter)}

## 화면 제목(저장/설정/기록…) — 원래 xpos 가 사이드바 위라 배경 아트의 게임 타이틀을 덮고 있었다.
style game_menu_label:
    xpos ${s(L.contentLeft)}
    ypos ${s(L.titleTop)}
    ysize ${s(L.titleBoxHeight)}

style game_menu_label_text:
    size ${s(L.titleSize)}
    color "${plan.colors.title}"

## "페이지 N" — 원래 xalign 0.5 라 콘텐츠 상단 한가운데 크게 놓였다(기본값은 720p 기준 상대
## 좌표라 배경 아트와 무관). 시안은 제목 옆에 작게 붙는다. page_label 은 game_menu_content_frame(원점이
## (contentLeft, contentTop)) 의 자식이라 여기서 ypos 가 음수(제목 띠 위로) 가 된다 — fixed/frame
## 은 둘 다 자식을 자르지 않으니 잘리지 않을 것으로 보이나, lint 로는 확인 불가하니 실기 스크린샷
## 대조가 필요하다(잘리면 ESC_LAYOUT.contentTop 을 낮추고 격자를 ypos 로 되미는 게 대안). 글자
## 크기·정렬(size/textalign)은 색과 한 블록에 몰아야 해서 escPaletteStyles 의 page_label_text 에
## 같이 둔다 — 이름당 style 블록을 두 곳에 쪼개면 escStylesBlock() 테스트 헬퍼(첫 등장~다음
## "\nstyle " 직전까지만 자른다)가 뒤 블록을 못 보고, 사람이 읽을 때도 같은 스타일 설정이 파일
## 두 군데에 흩어져 헷갈린다.
style page_label:
    xalign 0.0
    xpos ${s(L.pageLabelX - L.contentLeft)}
    ypos ${s(L.pageLabelY - L.contentTop)}
    xpadding 0
    ypadding 0

## 저장 슬롯 썸네일 칸 안 "빈 슬롯" — fileSlotsBody(screensRpy() 참고, escMenu 가 있을 때만 화면
## 코드가 이 스타일 태그를 낸다)와 **반드시 같은 조건**(escMenu 존재)에서만 정의해야 한다. 짝이
## 어긋나면 "정의된 적 없는 스타일" 런타임 크래시(CLAUDE.md).
style esc_slot_empty_text is slot_button_text:
    size ${s(L.slotEmptySize)}
    color "${plan.colors.muted}"
    xalign 0.5

## 설정 그룹 카드(preferencesBody 가 이 스타일로 그룹을 감싼다). 카드 에셋이 없으면 배경은
## 기본 frame 배경을 따라가고 여백만 적용된다.
style esc_pref_card is frame:
    xsize ${s(ESC_LAYOUT.prefCardWidth)}
    xpadding ${s(ESC_LAYOUT.prefCardPadX)}
    ypadding ${s(ESC_LAYOUT.prefCardPadY)}

style esc_pref_title is gui_label_text:
    size ${s(28)}
    color "${plan.colors.accent}"

style esc_pref_sub is gui_text:
    size ${s(21)}
    color "${plan.colors.body}"

style slider_slider:
    xsize ${s(ESC_LAYOUT.prefCardWidth - ESC_LAYOUT.prefCardPadX * 2)}

## 설정 그룹이 카드로 바뀌면서 라벨 위아래 여백은 카드 패딩이 대신한다.
style pref_label:
    top_margin 0
    bottom_margin 0

## 저장 슬롯 패딩 제거 — 기본 style slot_button 은 gui.scale 함수로 구한 6,6(1080p 기준
## 9px) padding 을 갖고 있는데, ESC 모드에선 fileSlotsBody 가 썸네일·캡션을 전부 버튼
## 안쪽 fixed 의 절대좌표(pos)로 배치한다. "has fixed" 자식의 좌표 원점은 버튼의 padding 만큼
## 안쪽으로 밀린 지점이라, 패딩이 남아 있으면 pos (13,13) 로 놓은 썸네일이 실제로는 (22,22)
## 에 찍혀 회색 칸과 어긋난다(실기 스크린샷으로 발견). 다른 escLayoutStyles 블록들과 마찬가지로
## 특정 에셋 유무가 아니라 escMenu 존재 자체로만 갈린다(레이아웃 자체가 어긋나는 문제라 배경
## 이미지를 아직 안 올렸어도 패딩은 걷어내야 한다). esc_save_empty_button 은 "is slot_button"
## 으로 이 스타일을 상속하므로 빈 슬롯도 함께 보정된다.
style slot_button:
    padding (0, 0)
`;
}

/**
 * ESC 메뉴 위 **텍스트 색** 일괄 교체. 여기 있는 스타일들은 전부 `gui.accent_color`(테마 강조색 —
 * 기본 프리셋에선 분홍)나 `gui.text_color`(어두운 배경 전제의 밝은 색)를 쓰고 있어서, 밝은 아이보리
 * 카드 위에 얹으면 각각 "형광 분홍"과 "거의 안 보임"이 된다. 둘 다 실기에서만 드러난다.
 *
 * 색 값은 plan.colors(=project.escMenuUi.colors, 앱에서 조절) — 어두운 아트를 쓰는 게임은 그 값만
 * 바꾸면 코드 변경 없이 뒤집힌다.
 */
function escPaletteStyles(plan: EscMenuPlan): string {
  const c = plan.colors;
  const s = (v: number) => px(plan, v);
  const L = ESC_LAYOUT;
  const selInk = inkOn(c.selectedBg);
  return String.raw`

## ESC 메뉴 이미지 GUI — 텍스트 팔레트(카드 표면 위 글자). 위 버튼류 색과 같은 소스에서 나온다.
style about_text:
    color "${c.body}"

style about_label_text:
    color "${c.title}"

style help_text:
    color "${c.body}"

## 시안은 키 이름이 왼쪽 정렬이다(기본은 오른쪽 정렬이라 설명과 사이가 벌어져 보인다).
style help_label_text:
    color "${c.accent}"
    xalign 0.0
    textalign 0.0

style history_text:
    color "${c.body}"

style history_name_text:
    color "${c.accent}"

style history_label_text:
    color "${c.muted}"

style pref_label_text:
    color "${c.accent}"

## size/textalign(레이아웃)과 color(팔레트)를 한 블록에 몰아 둔다 — escLayoutStyles 의 page_label
## 코멘트 참고(이름당 style 블록을 두 곳에 쪼개면 escStylesBlock() 테스트 헬퍼가 뒤 블록을 놓친다).
style page_label_text:
    color "${c.accent}"
    idle_color "${c.accent}"
    hover_color "${c.title}"
    size ${s(L.pageLabelSize)}
    textalign 0.0

## 저장 슬롯 캡션 — 색·크기만 여기서 정한다(위치는 fileSlotsBody 가 fixed 안에서 pos 로 직접
## 놓는다). ⚠️ xalign 을 같이 주지 말 것 — fixed 의 자식은 pos 가 절대좌표 앵커라 xalign 과 함께
## 주면 둘이 앵커를 두고 싸운다(실기에서 캡션이 튀는 원인 — 배치시안 대조로 발견).
style slot_time_text:
    color "${c.body}"
    size ${s(L.slotCaptionSize)}

style slot_name_text:
    color "${c.muted}"
    size ${s(L.slotCaptionSize)}

style confirm_prompt_text:
    color "${c.body}"

## 페이지 번호 — gui.button_properties 가 심어둔 배경(테마 강조색 알약)을 통째로 걷는다. 시안은
## 번호를 맨 글자로 늘어놓고 현재 페이지만 진하게 표시한다(사각형 색칠은 시안에 없다).
## ⚠️ CRASH TRAP(위 주석) 대상이라 네 롤을 전부 닫는다 — 하나라도 열어두면 없는 PNG 를 찾다 죽는다.
style page_button:
    idle_background None
    hover_background None
    selected_background None
    insensitive_background None

style page_button_text:
    idle_color "${c.muted}"
    hover_color "${c.body}"
    selected_color "${c.title}"
    insensitive_color "${c.muted}"
${helpTabStyles(plan, selInk)}
## 정보/크레딧·도움말 본문의 {a=...} 링크 — 테마 강조색(분홍)이 그대로 나와 카드 위에서 튄다.
## color 까지 같이 주는 이유: 링크가 포커스를 못 받는 문맥에선 idle_color 가 아니라 color 를 쓴다.
style hyperlink_text:
    color "${c.accent}"
    idle_color "${c.accent}"
    hover_color "${c.title}"
    insensitive_color "${c.muted}"
`;
}

/**
 * 도움말 상단 장치 탭(키보드/마우스/게임패드). 선택 상태를 Solid 로 칠하면 각진 색 블록이 되어
 * 아트와 겉돌기 때문에, 업로드한 선택버튼 알약이 있으면 그걸 쓰고 없을 때만 Solid 로 떨어진다.
 * 어느 쪽이든 CRASH TRAP 대응으로 네 롤을 전부 채운다.
 */
function helpTabStyles(plan: EscMenuPlan, selInk: string): string {
  const c = plan.colors;
  const has = (id: EscImageId) => plan.has.has(id);
  if (!has('choice_idle')) {
    return `
## 도움말 장치 탭 — 선택버튼 에셋이 없어 팔레트 색으로만 구분한다.
style help_button:
    idle_background None
    hover_background None
    selected_background Solid("${c.selectedBg}")
    insensitive_background None

style help_button_text:
    idle_color "${c.muted}"
    hover_color "${c.body}"
    selected_color "${selInk}"
    insensitive_color "${c.muted}"
`;
  }
  const idle = escImageFile('choice_idle');
  const hover = has('choice_hover') ? escImageFile('choice_hover') : idle;
  const selected = has('choice_selected') ? escImageFile('choice_selected') : idle;
  const disabled = has('choice_disabled') ? escImageFile('choice_disabled') : idle;
  return `
## 도움말 장치 탭 — 설정 화면과 같은 선택버튼 알약을 쓴다(시안의 언어 선택과 같은 생김새).
style help_button:
    idle_background Frame("${idle}", 0, 0)
    hover_background Frame("${hover}", 0, 0)
    selected_background Frame("${selected}", 0, 0)
    insensitive_background Frame("${disabled}", 0, 0)
    padding (${px(plan, 20)}, ${px(plan, 8)})
${ESC_TEXT_COLORS_FOR(plan, 'help_button_text')}
`;
}

/** buildEscMenuStyles 의 onLight 규칙과 같은 색표(그 안의 클로저를 밖에서도 쓰려고 뺐다). */
function ESC_TEXT_COLORS_FOR(plan: EscMenuPlan, styleName: string): string {
  const c = plan.colors;
  return `
style ${styleName}:
    idle_color "${c.body}"
    hover_color "${c.title}"
    selected_color "${inkOn(c.selectedBg)}"
    insensitive_color "${c.muted}"`;
}

/**
 * 배경색 위에 얹을 글자색(밝기 대비로 고른다). 선택된 버튼의 배경만은 사용자가 색으로 직접 주는
 * 자리라, 그 위 글자를 팔레트에 또 받으면 "둘 다 어두운 색"으로 맞춰 놓고 안 보인다고 하기 쉽다.
 */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fdf6ec';
  const n = parseInt(m[1], 16);
  // ITU-R BT.601 휘도 근사 — 정확한 sRGB 감마 보정까지 갈 이유가 없다(밝다/어둡다 이진 판정).
  const luma = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luma > 0.6 ? '#3b2f26' : '#fdf6ec';
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
  /** 있으면(업로드된 ESC 이미지가 하나라도) 해당 화면들의 style 블록을 뒤에 이어붙인다. */
  escMenu?: EscMenuPlan;
}

export function screensRpy(opts?: ScreensRpyOptions): string {
  const { locales, hasItems, hasCg, mainMenu, quickMenu, escMenu } = opts ?? {};
  const languagePrefs = languagePrefsBlock(locales);
  // 아이템/CG 가 있을 때만 각각의 보관함 진입 버튼(내비)을 낸다.
  const galleryNav = [
    hasItems ? '        textbutton _("발견한 아이템") action ShowMenu("item_gallery")' : '',
    hasCg ? '        textbutton _("감상한 CG") action ShowMenu("cg_gallery")' : '',
  ]
    .filter(Boolean)
    .join('\n');
  // 라이트박스는 아이템·CG 둘 중 하나라도 있으면 딱 1번만(중복 screen 정의 방지). escMenu 는
  // gallery_idle/gallery_locked 가 있을 때만 셀에 style 태그를 끼워 넣는다(itemScreens/cgScreens 참고).
  const galleryScreens =
    (hasItems ? itemScreens(escMenu) : '') +
    (hasCg ? cgScreens(escMenu) : '') +
    (hasItems || hasCg ? GALLERY_LIGHTBOX : '');

  // 활성화 여부는 generate.ts 의 buildMainMenuPlan 이 이미 판단해서 넘긴다(이미지/로고뿐 아니라
  // 프리셋 변경·라벨 편집·메뉴 폰트 지정도 활성화 사유 — mainMenuUi 자체가 없거나 전부 기본값이면
  // undefined 를 넘겨 기존 텍스트 메뉴(DEFAULT_MAIN_MENU_SCREEN) 그대로 나간다(회귀 0).
  const active = !!mainMenu;
  const built = mainMenu ? buildImageMainMenuScreen(mainMenu) : undefined;
  const mainMenuScreen = built ? built.text : DEFAULT_MAIN_MENU_SCREEN;
  // showInfoLinks=false 면 링크 자체를 안 내므로(위 buildImageMainMenuScreen) mm_link 스타일도
  // 같이 뺀다 — 안 쓰는 스타일 정의만 남는 걸 막는다(usesMmStyles 와 같은 취지).
  const mmLinkStyles = active && mainMenu?.showInfoLinks ? MM_LINK_STYLES : '';
  // mm_* 스타일은 실제로 텍스트/마커 렌더가 한 번이라도 쓰였을 때만(회귀 0 — 전 슬롯 이미지 조합은
  // usesMmStyles 가 끝까지 false 라 이 블록 자체가 안 나온다).
  const mmStyles = built?.usesMmStyles ? buildMmStyles(mainMenu!) : '';
  const galleryHubScreen = active && mainMenu?.galleryTarget === 'hub' ? GALLERY_HUB_SCREEN : '';

  // quickMenu 활성화 여부도 generate.ts 의 buildQuickMenuPlan 이 이미 판단해서 넘긴다(게이트: 'menu'
  // 토글 idle 이미지). 없으면 undefined 를 넘겨 기존 텍스트 알약 퀵메뉴(DEFAULT_QUICK_MENU_SCREEN)
  // 그대로 나간다(회귀 0 — mainMenuUi 와 같은 계약).
  const quickMenuScreen = quickMenu ? buildQuickMenuScreen(quickMenu) : DEFAULT_QUICK_MENU_SCREEN;

  // ESC 메뉴 이미지 GUI — 기존 화면들 뒤에 이어붙일 style 오버라이드 텍스트(없으면 빈 문자열, 회귀 0).
  const escStyles = buildEscMenuStyles(escMenu);
  // 저장/불러오기 슬롯 grid 의 button: 본문 — escMenu 없으면 원본 그대로(byte-identical), 있으면
  // 썸네일 칸+캡션 분리 배치로 바뀐다(fileSlotsBody 참고, 배경 style 분기도 이 함수가 흡수했다).
  const fileSlotsBodyText = fileSlotsBody(escMenu);
  // 설정 화면은 그룹을 카드로 감싸야 해서 본문 전체를 분기한다(escMenu 없으면 기존 텍스트 그대로).
  const prefsBody = preferencesBody(escMenu, locales, languagePrefs);
  // 제목 밑 장식 밑줄 — 시안에 있는 얇은 선. 화면 최상위 `label title` 바로 뒤에 절대좌표로 얹는다.
  const escTitleRule = escMenu
    ? `

    add Solid("${escMenu.colors.accent}"):
        xysize (${px(escMenu, ESC_LAYOUT.ruleWidth)}, ${px(escMenu, ESC_LAYOUT.ruleHeight)})
        pos (${px(escMenu, ESC_LAYOUT.contentLeft)}, ${px(escMenu, ESC_LAYOUT.ruleY)})`
    : '';

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

    label title${escTitleRule}

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

${fileSlotsBodyText}

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

${prefsBody}

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
${galleryScreens}${mmLinkStyles}${mmStyles}${galleryHubScreen}${escStyles}`;

  return base;
}
