import type { Project } from './project';
// 파일명 키워드 매칭은 프로젝트 도메인(표정 파일명)과 공유하는 순수 유틸 — project.ts 에 둔다.
import { matchLongestKeyword } from './project';

/**
 * ESC 메뉴 텍스트 팔레트. 롤은 다섯뿐이고 각각이 여러 Ren'Py 스타일에 퍼진다(어느 스타일에
 * 꽂히는지는 screensRpy 의 buildEscMenuStyles 가 단일 소스).
 */
export interface EscColors {
  /** 본문·설명·대사 기록·슬롯 캡션 — 카드 위에서 가장 많이 읽히는 색. */
  body?: string;
  /** 화면 제목(저장/설정/기록…). */
  title?: string;
  /** 그룹 라벨·도움말 키 이름·페이지 라벨 등 강조 텍스트. */
  accent?: string;
  /** 날짜·페이지 번호·잠긴 항목 같은 보조 텍스트. */
  muted?: string;
  /** 선택된 항목의 배경(페이지 번호·도움말 탭). 그 위 글자는 자동으로 밝은 색이 된다. */
  selectedBg?: string;
}

/** 밝은 아이보리 카드 아트 기준 기본 팔레트(카페테리아 에셋에 맞춰 실기에서 조정). */
export const DEFAULT_ESC_COLORS: Required<EscColors> = {
  body: '#4a3a2f',
  title: '#4a3730',
  accent: '#8a6a4f',
  muted: '#9b8977',
  selectedBg: '#6b4f3a',
};

/** escMenuUi.colors + 기본값 병합(부분 지정·빈 문자열 모두 기본값으로 떨어진다). */
export function escColors(colors?: EscColors): Required<EscColors> {
  return {
    body: colors?.body || DEFAULT_ESC_COLORS.body,
    title: colors?.title || DEFAULT_ESC_COLORS.title,
    accent: colors?.accent || DEFAULT_ESC_COLORS.accent,
    muted: colors?.muted || DEFAULT_ESC_COLORS.muted,
    selectedBg: colors?.selectedBg || DEFAULT_ESC_COLORS.selectedBg,
  };
}

/** 메인 메뉴 버튼 슬롯(순서 고정 — 처음부터→이어하기→불러오기→환경설정→갤러리→게임종료). */
export type MenuButtonSlot = 'start' | 'continue' | 'load' | 'prefs' | 'gallery' | 'quit';
/** 버튼 이미지 상태 4종(사용자 제공 에셋 기준). */
export type MenuButtonState = 'idle' | 'hover' | 'press' | 'disabled';

/**
 * 메인 메뉴 이미지 GUI 좌표(전부 1920×1080 기준 px — 다른 해상도는 렌더 시점에 height/1080 배율을
 * 곱해 구운다, MainMenuPlan.scale 참고). gap 은 버튼 세로 간격(78px 버튼 + 12px 간격 = 90px 행 간격이
 * 스펙 좌표와 정확히 맞아떨어져, 절대좌표 6개 대신 vbox spacing 하나로 재현된다).
 */
export interface MainMenuLayout {
  x?: number;
  y?: number;
  gap?: number;
  hoverShiftX?: number;
  logoX?: number;
  logoY?: number;
  logoWidth?: number;
}

/** 사용자 제공 스펙의 권장 좌표(처음부터 X96/Y350, 78px 버튼 + 12px 간격). */
const DEFAULT_MAIN_MENU_LAYOUT: Required<MainMenuLayout> = {
  x: 96,
  y: 350,
  gap: 12,
  hoverShiftX: 8,
  logoX: 96,
  logoY: 90,
  logoWidth: 700,
};

/** 메뉴 버튼 슬롯 정의(순서 = 메뉴 표시 순서). fileKeywords 는 일괄 업로드 파일명 자동 매칭용. */
export const MAIN_MENU_SLOTS: { id: MenuButtonSlot; label: string; fileKeywords: string[] }[] = [
  { id: 'start', label: '처음부터', fileKeywords: ['처음부터', '시작'] },
  { id: 'continue', label: '이어하기', fileKeywords: ['이어하기', '계속'] },
  { id: 'load', label: '불러오기', fileKeywords: ['불러오기', '로드'] },
  { id: 'prefs', label: '환경설정', fileKeywords: ['환경설정', '설정'] },
  { id: 'gallery', label: '갤러리', fileKeywords: ['갤러리'] },
  { id: 'quit', label: '게임 종료', fileKeywords: ['게임종료', '게임 종료', '종료', '끝내기'] },
];

/**
 * 버튼 상태 정의. fileKeywords 는 일괄 업로드 파일명 자동 매칭용.
 * renpySupported=false(press) 는 Ren'Py imagebutton 이 "누르는 중" 전용 이미지 슬롯을 지원하지
 * 않아(엔진 전수 조사 결과 activate_ 프리픽스를 실제로 세팅하는 코드가 없는 죽은 슬롯) 업로드는
 * 받되 저장·출력하지 않는다 — 그래도 매칭 자체는 계속 인식해야 "건너뜀" 안내를 낼 수 있어 목록엔 남긴다.
 */
export const MENU_BUTTON_STATES: { id: MenuButtonState; label: string; fileKeywords: string[]; renpySupported: boolean }[] = [
  { id: 'idle', label: '기본', fileKeywords: ['기본'], renpySupported: true },
  { id: 'hover', label: '마우스오버', fileKeywords: ['마우스오버', '마우스 오버', '호버', 'hover'], renpySupported: true },
  { id: 'press', label: '클릭', fileKeywords: ['클릭', '눌림', 'press'], renpySupported: false },
  { id: 'disabled', label: '비활성화', fileKeywords: ['비활성화', '비활성', 'disabled'], renpySupported: true },
];

/**
 * 인게임 우측 퀵메뉴 버튼 슬롯(순서 = 화면 표시 순서). 'menu' 는 나머지를 펼치는 토글이라
 * 목록에서 따로 떼어 맨 위 고정 위치에 그린다(QUICK_LIST_SLOTS 참고).
 * fileKeywords 는 일괄 업로드 파일명 자동 매칭용 — '저장'이 '빠른저장'의 부분문자열이지만
 * matchLongestKeyword 가 긴 키워드부터 검사해 정확히 갈린다.
 */
export type QuickButtonSlot =
  | 'menu'
  | 'back'
  | 'history'
  | 'skip'
  | 'auto'
  | 'hide'
  | 'save'
  | 'qsave'
  | 'qload'
  | 'prefs';

/**
 * 퀵메뉴 버튼 이미지 상태. 메인 메뉴 4종에 'selected'(활성화)를 더한 것 —
 * 스킵·자동은 켜져 있는 동안 Ren'Py 가 selected 상태가 되므로 전용 이미지를 쓸 수 있다.
 * (메인 메뉴 쪽 MENU_BUTTON_STATES 에는 selected 를 넣지 않는다 — 거기엔 토글 버튼이 없어
 *  업로드 그리드에 의미 없는 열이 하나 늘 뿐이다.)
 */
export type QuickButtonState = MenuButtonState | 'selected';

export const QUICK_MENU_SLOTS: {
  id: QuickButtonSlot;
  label: string;
  fileKeywords: string[];
  /** 이 슬롯이 selected(활성화) 이미지를 쓰는가 — 스킵·자동만 해당. */
  selectable?: boolean;
}[] = [
  { id: 'menu', label: '메뉴', fileKeywords: ['메뉴'] },
  { id: 'back', label: '뒤로', fileKeywords: ['뒤로'] },
  { id: 'history', label: '기록', fileKeywords: ['기록'] },
  { id: 'skip', label: '스킵', fileKeywords: ['스킵'], selectable: true },
  { id: 'auto', label: '자동', fileKeywords: ['자동'], selectable: true },
  { id: 'hide', label: '숨기기', fileKeywords: ['숨기기'] },
  { id: 'save', label: '저장', fileKeywords: ['저장'] },
  { id: 'qsave', label: '빠른저장', fileKeywords: ['빠른저장'] },
  { id: 'qload', label: '빠른불러오기', fileKeywords: ['빠른불러오기'] },
  { id: 'prefs', label: '설정', fileKeywords: ['설정'] },
];

/** 'menu'(토글) 를 뺀 펼침 목록 — 화면에서 listY 부터 listStep 간격으로 쌓인다. */
export const QUICK_LIST_SLOTS = QUICK_MENU_SLOTS.filter((s) => s.id !== 'menu');

/**
 * 퀵메뉴 버튼 상태 정의. press 가 renpySupported=false 인 이유는 MENU_BUTTON_STATES 와 같다
 * (엔진에 "누르는 중" 이미지 슬롯이 없다 — 누르는 동안엔 hover 가 보인다).
 * '비활성화'가 '활성화'를 포함하지만 matchLongestKeyword 가 긴 쪽을 먼저 보므로 안전하다.
 */
export const QUICK_BUTTON_STATES: {
  id: QuickButtonState;
  label: string;
  fileKeywords: string[];
  renpySupported: boolean;
}[] = [
  { id: 'idle', label: '기본', fileKeywords: ['기본'], renpySupported: true },
  { id: 'hover', label: '마우스오버', fileKeywords: ['마우스오버', '마우스 오버', '호버', 'hover'], renpySupported: true },
  { id: 'press', label: '클릭', fileKeywords: ['클릭', '눌림', 'press'], renpySupported: false },
  { id: 'disabled', label: '비활성화', fileKeywords: ['비활성화', '비활성', 'disabled'], renpySupported: true },
  { id: 'selected', label: '활성화', fileKeywords: ['활성화', 'selected', 'active'], renpySupported: true },
];

/**
 * 퀵메뉴 좌표(전부 1920×1080 기준 px — 렌더 시점에 height/1080 배율을 곱해 굽는다).
 * 사용자 제공 스펙: 패널 X1688/Y0(232×625), 버튼 X1718, 메뉴 Y16, 목록 Y82 부터 53px 간격.
 * 메뉴(토글)와 목록 시작 Y 를 따로 두는 건 스펙상 그 사이만 간격이 다르기(66px) 때문이다.
 */
export interface QuickMenuLayout {
  panelX?: number;
  panelY?: number;
  btnX?: number;
  menuY?: number;
  listY?: number;
  /** 목록 버튼의 행 간격(버튼 높이 포함한 시작점 간 거리). */
  listStep?: number;
}

export const DEFAULT_QUICK_MENU_LAYOUT: Required<QuickMenuLayout> = {
  panelX: 1688,
  panelY: 0,
  btnX: 1718,
  menuY: 16,
  listY: 82,
  listStep: 53,
};

/** 프로젝트에 저장된 값 위에 기본값을 덮어 최종 좌표를 만든다. */
export function quickMenuLayout(p: Project): Required<QuickMenuLayout> {
  return { ...DEFAULT_QUICK_MENU_LAYOUT, ...p.quickMenuUi?.layout };
}

/**
 * Ren'Py 프로젝트 안의 퀵메뉴 이미지 경로(game/ 기준). screensRpy·buildZip 공용 —
 * menuButtonFile 과 같은 이유로 여기가 단일 소스다(어긋나면 없는 파일 참조 → 런타임 크래시).
 * 메인 메뉴는 `gui/menu/`, 퀵메뉴는 `gui/quick/` 로 네임스페이스를 분리한다.
 */
export function quickButtonFile(slot: QuickButtonSlot, state: QuickButtonState): string {
  return `gui/quick/${slot}_${state}.png`;
}

/** 퀵메뉴 보조 패널(버튼 뒤에 깔리는 아이보리 판) 경로. */
export const QUICK_PANEL_FILE = 'gui/quick/panel.png';

/**
 * ESC 게임 메뉴 이미지 역할 id. 사용자 에셋 23장과 1:1 대응한다.
 * 이름은 "무엇을 칠하는가"가 아니라 "어느 위젯의 어느 상태인가"로 지었다 — screensRpy 가 스타일
 * 배경으로 꽂을 때 그대로 읽히도록.
 */
export type EscImageId =
  | 'bg'
  | 'nav_idle'
  | 'nav_hover'
  | 'nav_selected'
  | 'card'
  | 'choice_idle'
  | 'choice_hover'
  | 'choice_selected'
  | 'choice_disabled'
  | 'slider_track'
  | 'slider_fill'
  | 'slider_thumb'
  | 'save_idle'
  | 'save_hover'
  | 'save_empty'
  | 'gallery_idle'
  | 'gallery_locked'
  | 'scroll_track'
  | 'scroll_thumb'
  | 'popup_bg'
  | 'popup_btn_idle'
  | 'popup_btn_hover'
  | 'popup_btn_selected';

/**
 * ESC 메뉴 이미지 정의(업로드 UI 표시 순서 = 이 배열 순서).
 * fileKeywords 는 일괄 업로드 파일명 자동 매칭용 — matchEscImageFile 이 `_`·공백을 지운 뒤 비교하므로
 * 여기 키워드도 붙여 쓴다('좌측메뉴기본'). 긴 키워드가 먼저 검사되므로 '선택버튼선택'이
 * '선택버튼'에 잡아먹히지 않는다(메뉴 쪽 '저장' vs '빠른저장'과 같은 함정).
 */
export const ESC_IMAGES: {
  id: EscImageId;
  label: string;
  group: string;
  hint: string;
  fileKeywords: string[];
}[] = [
  { id: 'bg', label: '공통 배경', group: '공통', hint: '1920×1080 · 사이드바 폭 361 · 카드 안쪽 361~1868 × 51~1028', fileKeywords: ['esc공통배경', '공통배경'] },
  { id: 'nav_idle', label: '좌측메뉴 기본', group: '공통', hint: '226×50 · 평상시엔 전부 투명(배경 없음이 의도)', fileKeywords: ['좌측메뉴기본'] },
  { id: 'nav_hover', label: '좌측메뉴 마우스오버', group: '공통', hint: '226×50 · 모서리 19', fileKeywords: ['좌측메뉴마우스오버'] },
  { id: 'nav_selected', label: '좌측메뉴 선택', group: '공통', hint: '226×50 · 모서리 18', fileKeywords: ['좌측메뉴선택'] },
  { id: 'card', label: '콘텐츠 카드', group: '공통', hint: '96×96 9slice · 테두리 24px · 모서리 21', fileKeywords: ['콘텐츠카드'] },
  { id: 'choice_idle', label: '선택버튼 기본', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼기본'] },
  { id: 'choice_hover', label: '선택버튼 마우스오버', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼마우스오버'] },
  { id: 'choice_selected', label: '선택버튼 선택', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼선택'] },
  { id: 'choice_disabled', label: '선택버튼 비활성화', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼비활성화'] },
  { id: 'slider_track', label: '슬라이더 트랙', group: '슬라이더', hint: '600×14 · 모서리 3', fileKeywords: ['슬라이더트랙'] },
  { id: 'slider_fill', label: '슬라이더 채움', group: '슬라이더', hint: '600×14 · 모서리 3', fileKeywords: ['슬라이더채움'] },
  { id: 'slider_thumb', label: '슬라이더 핸들', group: '슬라이더', hint: '28×28 · 모서리 11', fileKeywords: ['슬라이더핸들'] },
  { id: 'save_idle', label: '저장슬롯 기본', group: '슬롯', hint: '320×190 · 안쪽 칸 298×132(여백 좌우상 11, 하 47) · 모서리 15', fileKeywords: ['저장슬롯기본'] },
  { id: 'save_hover', label: '저장슬롯 마우스오버', group: '슬롯', hint: '320×190 · 안쪽 칸 298×132(여백 좌우상 11, 하 47) · 모서리 15', fileKeywords: ['저장슬롯마우스오버'] },
  { id: 'save_empty', label: '저장슬롯 빈슬롯', group: '슬롯', hint: '320×190 · 안쪽 칸 298×132(여백 좌우상 11, 하 47) · 모서리 15', fileKeywords: ['저장슬롯빈슬롯'] },
  { id: 'gallery_idle', label: '갤러리슬롯 기본', group: '슬롯', hint: '300×180 · 안쪽 칸 278×126(여백 좌우상 11, 하 43) · 모서리 15 · 아이템·CG 갤러리 공용(칸 비율에 맞춰 늘어남)', fileKeywords: ['갤러리슬롯기본'] },
  { id: 'gallery_locked', label: '갤러리슬롯 잠김', group: '슬롯', hint: '300×180 · 안쪽 칸 278×126(여백 좌우상 11, 하 43) · 모서리 15 · 아이템·CG 갤러리 공용(칸 비율에 맞춰 늘어남)', fileKeywords: ['갤러리슬롯잠김'] },
  { id: 'scroll_track', label: '스크롤바 트랙', group: '스크롤', hint: '10×600', fileKeywords: ['스크롤바트랙'] },
  { id: 'scroll_thumb', label: '스크롤바 핸들', group: '스크롤', hint: '10×180', fileKeywords: ['스크롤바핸들'] },
  { id: 'popup_bg', label: '종료팝업 배경', group: '팝업', hint: '680×330 · 모서리 27', fileKeywords: ['종료팝업배경'] },
  { id: 'popup_btn_idle', label: '종료버튼 기본', group: '팝업', hint: '200×58 · 모서리 22', fileKeywords: ['종료버튼기본'] },
  { id: 'popup_btn_hover', label: '종료버튼 마우스오버', group: '팝업', hint: '200×58 · 모서리 22', fileKeywords: ['종료버튼마우스오버'] },
  { id: 'popup_btn_selected', label: '종료버튼 선택', group: '팝업', hint: '200×58 · 모서리 22', fileKeywords: ['종료버튼선택'] },
];

/**
 * Ren'Py 프로젝트 안의 ESC 메뉴 이미지 경로(game/ 기준) — screensRpy·buildZip 공용 단일 소스.
 * ⚠️ 예외 하나: 'bg' 는 이 경로를 쓰지 않는다. 공통배경은 곧 `gui.game_menu_background` 이므로
 * buildZip 이 `gui/game_menu.png` 자리에 직접 써서 낸다(파일을 둘로 안 늘린다).
 */
export function escImageFile(id: EscImageId): string {
  return `gui/esc/${id}.png`;
}

/**
 * 저장 슬롯 썸네일 둥근 마스크 PNG 경로(game/ 기준) — 업로드 에셋이 아니라 앱이 직접 굽는 생성물
 * (roundedMaskPng, escSlotThumbMetrics 가 크기 단일 소스)이라 escImageFile 의 `gui/esc/<id>.png`
 * 패턴 밖에 별도 상수로 둔다. screensRpy(AlphaMask 참조)와 buildZip(실제 PNG 배치) 양쪽이 이
 * 상수 하나만 봐야 경로가 어긋나지 않는다.
 */
export const ESC_SAVE_THUMB_MASK_FILE = 'gui/esc/save_thumb_mask.png';

/**
 * 감상한 CG 갤러리 썸네일 둥근 마스크 PNG 경로(game/ 기준) — ESC_SAVE_THUMB_MASK_FILE 과 같은 이유로
 * 별도 생성물 상수(escCgThumbMetrics 가 크기 단일 소스, renpy/gui). 발견한 아이템 쪽은 `fit "contain"`
 * 으로 절대 자르지 않아 마스크가 필요 없다 — CG 만 `fit "cover"` + 이 마스크로 둥근 모서리를 낸다.
 */
export const ESC_CG_THUMB_MASK_FILE = 'gui/esc/cg_thumb_mask.png';

/**
 * 파일명 → ESC 이미지 역할. 메뉴 버튼 매칭과 같은 규칙에 **`_`·`-` 제거**를 더한다
 * (`GUI_좌측메뉴_기본.png` → `좌측메뉴기본`) — 에셋 파일명이 밑줄로 낱말을 끊어놨기 때문.
 */
export function matchEscImageFile(filename: string): EscImageId | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/^GUI_/i, '').replace(/[\s_-]+/g, '').toLowerCase();
  return matchLongestKeyword(norm, ESC_IMAGES);
}

/** 파일명 → 퀵메뉴 슬롯·상태. matchMenuButtonFile 과 동일한 정규화 규칙. */
export function matchQuickButtonFile(
  filename: string,
): { slot: QuickButtonSlot; state: QuickButtonState } | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/^GUI_/i, '').replace(/\s+/g, '').toLowerCase();
  const slot = matchLongestKeyword(norm, QUICK_MENU_SLOTS);
  const state = matchLongestKeyword(norm, QUICK_BUTTON_STATES);
  if (!slot || !state) return undefined;
  return { slot, state };
}

/**
 * 메인 메뉴 배치 프리셋 5종. `align`/`direction` 은 screensRpy 의 컨테이너(vbox/hbox)·정렬 축을
 * 결정하고, `layout` 은 그 프리셋을 골랐을 때 기본으로 쓰일 좌표(mainMenuLayout 이 병합).
 * `labels` 는 프리셋별 기본 라벨(main=주 텍스트, sub=부 텍스트) — 비어 있는 슬롯은 mainMenuLabels
 * 가 MAIN_MENU_SLOTS 의 원래 label 로 폴백한다(1줄 프리셋은 굳이 여기 채우지 않는다).
 */
export type MainMenuPresetId = 'left-column' | 'bottom-row' | 'right-dual' | 'right-marker' | 'renpy-classic';

export interface MainMenuPresetDef {
  id: MainMenuPresetId;
  label: string; // 한글 표시명(UI 프리셋 선택 카드)
  hint: string; // UI 한 줄 설명
  align: 'left' | 'right' | 'center'; // center = 하단 가로
  direction: 'vertical' | 'horizontal';
  dualLabel: boolean; // 주+부 2줄 표시 여부
  marker: 'none' | 'triangle'; // 좌측 마커 글리프(▶) 사용 여부
  mainSize: number; // 주 텍스트 크기(1920 기준 px)
  subSize: number; // 부 텍스트 크기(1920 기준 px)
  layout: Required<MainMenuLayout>;
  labels: Partial<Record<MenuButtonSlot, { main?: string; sub?: string }>>;
}

/**
 * 프리셋 5종 정의. `left-column` 의 layout 은 DEFAULT_MAIN_MENU_LAYOUT 을 그대로 참조한다
 * (같은 값을 두 곳에 따로 적으면 언젠가 어긋난다 — 회귀 0 의 핵심이라 단일 소스로 강제).
 */
export const MAIN_MENU_PRESETS: Record<MainMenuPresetId, MainMenuPresetDef> = {
  'left-column': {
    id: 'left-column',
    label: '좌측 세로 (기본)',
    hint: '화면 좌측 상단에 버튼이 세로로 나열됩니다(기존 기본 배치).',
    align: 'left',
    direction: 'vertical',
    dualLabel: false,
    marker: 'none',
    mainSize: 42,
    subSize: 22,
    layout: DEFAULT_MAIN_MENU_LAYOUT,
    labels: {},
  },
  'bottom-row': {
    id: 'bottom-row',
    label: '하단 가로 (제목+설명)',
    hint: '화면 하단에 버튼이 가로로 나열되고, 버튼마다 제목+설명 2줄이 표시됩니다.',
    align: 'center',
    direction: 'horizontal',
    dualLabel: true,
    marker: 'none',
    mainSize: 40,
    // gap 60→30·subSize 20→18(실기 확인: 원래 값은 1920px 폭을 넘겨 첫 항목이 화면 밖으로
    // 잘렸다). screensRpy.ts 가 항목마다 xsize round(270*scale) 고정폭을 주므로
    // 6×270 + 5×30(gap) = 1770 < 1920 — 화면 안에 정확히 들어간다(HORIZONTAL_ITEM_WIDTH 참고).
    subSize: 18,
    layout: { x: 0, y: 830, gap: 30, hoverShiftX: 0, logoX: 610, logoY: 60, logoWidth: 700 },
    labels: {
      // 고정 xsize(270px) 안에서 줄바꿈 없이 들어가도록 기본 문구도 짧게(실기 확인).
      start: { main: '게임 시작', sub: '새로운 이야기 시작' },
      continue: { main: '이어하기', sub: '이어서 진행합니다' },
      load: { main: '불러오기', sub: '저장 기록 불러오기' },
      prefs: { main: '환경 설정', sub: '세부 설정 조절' },
      gallery: { main: '엑스트라', sub: 'CG·이벤트 감상' },
      quit: { main: '게임 종료', sub: '게임을 끝냅니다' },
    },
  },
  'right-dual': {
    id: 'right-dual',
    label: '우측 2줄 (영문+한글)',
    hint: '화면 우측에 버튼이 세로로 나열되고, 버튼마다 영문 주 라벨 + 한글 부 라벨이 표시됩니다.',
    align: 'right',
    direction: 'vertical',
    dualLabel: true,
    marker: 'none',
    mainSize: 40,
    subSize: 22,
    layout: { x: 120, y: 320, gap: 28, hoverShiftX: 8, logoX: 1180, logoY: 80, logoWidth: 620 },
    labels: {
      start: { main: 'New Game', sub: '새로하기' },
      continue: { main: 'Continue', sub: '이어하기' },
      load: { main: 'Load Data', sub: '불러오기' },
      prefs: { main: 'Settings', sub: '시스템' },
      gallery: { main: 'Extra', sub: '콘텐츠 감상' },
      quit: { main: 'Exit', sub: '나가기' },
    },
  },
  'right-marker': {
    id: 'right-marker',
    label: '우측 마커 (▶)',
    hint: '화면 우측에 버튼이 세로로 나열되고, 호버 시 왼쪽에 ▶ 마커가 나타납니다.',
    align: 'right',
    direction: 'vertical',
    dualLabel: false,
    marker: 'triangle',
    mainSize: 38,
    subSize: 20,
    layout: { x: 140, y: 400, gap: 24, hoverShiftX: 0, logoX: 1180, logoY: 80, logoWidth: 620 },
    labels: {},
  },
  'renpy-classic': {
    id: 'renpy-classic',
    label: '렌파이 기본 (좌측 단순)',
    hint: "Ren'Py 기본 템플릿과 비슷한 좌측 단순 배치입니다(로고는 하단).",
    align: 'left',
    direction: 'vertical',
    dualLabel: false,
    marker: 'none',
    mainSize: 34,
    subSize: 20,
    layout: { x: 120, y: 380, gap: 18, hoverShiftX: 0, logoX: 1100, logoY: 800, logoWidth: 700 },
    labels: {},
  },
};

/** 프리셋 미지정 프로젝트의 기본값 — 기존 좌측 세로 1열(회귀 0). */
export const DEFAULT_MAIN_MENU_PRESET: MainMenuPresetId = 'left-column';

/** 프로젝트가 고른 프리셋 정의(미지정이면 DEFAULT_MAIN_MENU_PRESET). 잘못된 id 도 기본값으로 방어. */
export function mainMenuPreset(p: Project): MainMenuPresetDef {
  const id = p.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET;
  return MAIN_MENU_PRESETS[id] ?? MAIN_MENU_PRESETS[DEFAULT_MAIN_MENU_PRESET];
}

/**
 * 기본값 위에 프로젝트가 저장한 값을 병합한 유효 레이아웃. 기본값은 이제 고정된
 * DEFAULT_MAIN_MENU_LAYOUT 이 아니라 "선택된 프리셋의 layout"이다 — preset 미지정이면
 * left-column=DEFAULT_MAIN_MENU_LAYOUT 이라 기존 동작과 완전히 동일하다(회귀 0).
 */
export function mainMenuLayout(p: Project): Required<MainMenuLayout> {
  return { ...mainMenuPreset(p).layout, ...(p.mainMenuUi?.layout ?? {}) };
}

/**
 * 프리셋 기본 라벨 위에 사용자 편집(mainMenuUi.labels)을 덮은 최종 라벨(6슬롯 전부 채워 반환).
 * 프리셋이 그 슬롯의 기본 라벨을 안 갖고 있으면(1줄 프리셋 대부분) MAIN_MENU_SLOTS 의 원래
 * label 로 폴백하고 sub 는 빈 문자열(=1줄 렌더, screensRpy 가 sub 빈 문자열이면 text 줄 자체를 안 낸다).
 */
export function mainMenuLabels(p: Project): Record<MenuButtonSlot, { main: string; sub: string }> {
  const preset = mainMenuPreset(p);
  const overrides = p.mainMenuUi?.labels ?? {};
  const out = {} as Record<MenuButtonSlot, { main: string; sub: string }>;
  for (const slot of MAIN_MENU_SLOTS) {
    const presetLabel = preset.labels[slot.id];
    const override = overrides[slot.id];
    out[slot.id] = {
      main: override?.main ?? presetLabel?.main ?? slot.label,
      sub: override?.sub ?? presetLabel?.sub ?? '',
    };
  }
  return out;
}

/**
 * Ren'Py 프로젝트 안의 메뉴 버튼 이미지 경로(game/ 기준). screensRpy·buildZip 공용 —
 * 파일명 규칙의 단일 소스라 여기서만 만든다(어긋나면 없는 파일 참조 → 런타임 크래시).
 */
export function menuButtonFile(slot: MenuButtonSlot, state: MenuButtonState): string {
  return `gui/menu/${slot}_${state}.png`;
}

/** 타이틀 로고 이미지 경로(game/ 기준). */
export const TITLE_LOGO_FILE = 'gui/title_logo.png';

/**
 * Windows exe 아이콘 — **프로젝트 루트**(game/ 의 형제) 경로다. Ren'Py 런처가 배포 빌드 때
 * `os.path.join(project.path, "icon.ico")` 로 딱 이 이름만 찾으므로 바꾸면 안 된다.
 * (루트 파일 출력은 README.md 가 이미 쓰는 경로라 별도 배관이 필요 없다.)
 */
export const GAME_ICON_FILE = 'icon.ico';

/** 실행 중 창·작업표시줄 아이콘(game/ 기준). gui.window_icon 이 가리킨다. */
export const WINDOW_ICON_FILE = 'gui/window_icon.png';

/**
 * 타이틀 화면 BGM 경로(game/ 기준). 참조 쪽(generate.ts)과 배치 쪽(buildZip.ts)이 각자
 * 문자열을 만들면 어긋난 순간 없는 파일 참조로 런타임에 죽는다 — 단일 소스로만 만들 것.
 */
export function titleBgmFile(ext: 'mp3' | 'wav' = 'mp3'): string {
  return `audio/title_bgm.${ext}`;
}


/**
 * 파일명(예 `GUI_처음부터_기본.png`)에서 확장자·`GUI_` 접두어·공백을 제거한 뒤 슬롯·상태를
 * keyword substring 매칭으로 판정한다. 슬롯·상태 둘 다 매칭돼야 성공, 하나라도 실패하면 undefined
 * (importMenuButtons 가 이 결과로 매칭 실패 파일을 사용자에게 알린다 — 조용히 버리지 않기 위함).
 */
export function matchMenuButtonFile(filename: string): { slot: MenuButtonSlot; state: MenuButtonState } | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/^GUI_/i, '').replace(/\s+/g, '').toLowerCase();
  const slot = matchLongestKeyword(norm, MAIN_MENU_SLOTS);
  const state = matchLongestKeyword(norm, MENU_BUTTON_STATES);
  if (!slot || !state) return undefined;
  return { slot, state };
}
