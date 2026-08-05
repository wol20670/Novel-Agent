// 장르별 GUI 테마 — "데이터로서의 테마".
// AI(T2)가 채우거나(추후) 프리셋에서 고르는 GuiTheme 객체 하나가
// gui.rpy / screens.rpy / 메뉴 아트를 전부 결정한다. 컴파일러(guiRpy/screensRpy)는
// 이 객체만 읽으므로, 겉모습은 장르마다 완전히 달라지되 생성된 코드는 항상 유효하다.

import { fontGamePath } from '../../fonts/fontCatalog';

export type GenreId = 'romance' | 'horror' | 'scifi' | 'thriller' | 'slice';

export interface GuiTheme {
  id: GenreId;
  label: string; // 한글 표시명

  // ── 팔레트 (메뉴/인터페이스) ──
  accent: string; // 강조색 (이름·선택값·포인트)
  accentHover: string; // hover 시
  bgTop: string; // 메뉴 배경 그라데이션 상단
  bgBottom: string; // 하단
  menuOverlay: string; // 메뉴 위 반투명 베일 (밝게/어둡게)
  interfaceText: string; // 메뉴 텍스트색
  idle: string; // 비활성 버튼 텍스트
  frameBg: string; // 패널/프레임 배경 (반투명)

  // ── 인게임 대사 ──
  dialogueBox: string; // 텍스트박스 배경 (반투명)
  dialogueText: string; // 대사 글자색
  nameText: string; // 화자 이름색

  // ── 바/슬라이더 (설정 화면) ──
  barTrack: string; // 트랙(빈 부분)
  barThumb: string; // 채워진 부분/손잡이

  // ── 선택지 버튼 ──
  choiceHoverBg: string; // hover 배경 (Solid) — 세이브 슬롯 등과 공용 보조 틴트
  choiceIdleBg: string; // 선택지 평상시(비호버) 패널 배경 (반투명, 가시성 확보)
  choiceHoverText: string; // 선택지 hover 글자색 (accent 채움 위에서 대비)

  // ── 폰트 (game/fonts/ 기준 경로 또는 엔진 내장) ──
  textFont: string;
  nameFont: string;
  interfaceFont: string;

  // ── 전환/분위기 ──
  sceneTransition: string; // 장면 전환 — script.rpy `with <token>` (dissolve/fade)
  uiTransition: string; // 메뉴 enter/exit — Ren'Py 표현식 (예: "Dissolve(0.3)")
}

const FONT = 'fonts/NanumGothic.ttf'; // 현재 번들 폰트(공통). 추후 장르 폰트로 분기 예정.

export const PRESETS: Record<GenreId, GuiTheme> = {
  romance: {
    id: 'romance',
    label: '로맨스 (부드러운 라이트)',
    accent: '#d98aa6',
    accentHover: '#e7a8c0',
    bgTop: '#fdf3f7',
    bgBottom: '#f3e6f0',
    menuOverlay: '#ffffff59',
    interfaceText: '#5a4a55',
    idle: '#b09aa6',
    frameBg: '#fdeef5f2',
    dialogueBox: '#ffffffe0',
    dialogueText: '#3a2f38',
    nameText: '#c25d86',
    barTrack: '#e8d0dc',
    barThumb: '#d98aa6',
    choiceHoverBg: '#f3d9e4',
    choiceIdleBg: '#ffffffdb',
    choiceHoverText: '#2a2228',
    textFont: FONT,
    nameFont: FONT,
    interfaceFont: FONT,
    sceneTransition: 'dissolve',
    uiTransition: 'Dissolve(0.25)',
  },
  horror: {
    id: 'horror',
    label: '공포 (핏빛 다크)',
    accent: '#b01e2e',
    accentHover: '#e23b4d',
    bgTop: '#0a0708',
    bgBottom: '#1a0e10',
    menuOverlay: '#00000099',
    interfaceText: '#d8cfcf',
    idle: '#6a5a5c',
    frameBg: '#120a0bf2',
    dialogueBox: '#0a0606e0',
    dialogueText: '#e8dede',
    nameText: '#d23b4a',
    barTrack: '#2a1a1c',
    barThumb: '#b01e2e',
    choiceHoverBg: '#2a1012',
    choiceIdleBg: '#1c1012e6',
    choiceHoverText: '#ffffff',
    textFont: FONT,
    nameFont: FONT,
    interfaceFont: FONT,
    sceneTransition: 'fade',
    uiTransition: 'Dissolve(0.5)',
  },
  scifi: {
    id: 'scifi',
    label: 'SF (네온 사이언스)',
    accent: '#2fd6e0',
    accentHover: '#6ff0f7',
    bgTop: '#060a16',
    bgBottom: '#0e1830',
    menuOverlay: '#001120a6',
    interfaceText: '#cfe6ee',
    idle: '#5a7a86',
    frameBg: '#08131ff2',
    dialogueBox: '#06101ce6',
    dialogueText: '#def0f5',
    nameText: '#2fd6e0',
    barTrack: '#142838',
    barThumb: '#2fd6e0',
    choiceHoverBg: '#0c2230',
    choiceIdleBg: '#0c1a28e6',
    choiceHoverText: '#03222a',
    textFont: FONT,
    nameFont: FONT,
    interfaceFont: FONT,
    sceneTransition: 'dissolve',
    uiTransition: 'Dissolve(0.2)',
  },
  thriller: {
    id: 'thriller',
    label: '스릴러 (차콜 앰버)',
    accent: '#e0a02f',
    accentHover: '#f5bf5a',
    bgTop: '#0c0d0f',
    bgBottom: '#1a1c20',
    menuOverlay: '#00000099',
    interfaceText: '#d8d4cc',
    idle: '#6e6a62',
    frameBg: '#121316f2',
    dialogueBox: '#0c0d0fe6',
    dialogueText: '#ece8e0',
    nameText: '#e0a02f',
    barTrack: '#26282c',
    barThumb: '#e0a02f',
    choiceHoverBg: '#20160a',
    choiceIdleBg: '#1a1c20e6',
    choiceHoverText: '#241a06',
    textFont: FONT,
    nameFont: FONT,
    interfaceFont: FONT,
    sceneTransition: 'fade',
    uiTransition: 'Dissolve(0.2)',
  },
  slice: {
    id: 'slice',
    label: '일상 (산뜻 라이트)',
    accent: '#4fb0c4',
    accentHover: '#79cdde',
    bgTop: '#f0f8fb',
    bgBottom: '#e3f1ee',
    menuOverlay: '#ffffff59',
    interfaceText: '#3f5158',
    idle: '#94a8ad',
    frameBg: '#f2fbfdf2',
    dialogueBox: '#ffffffe0',
    dialogueText: '#2f3d42',
    nameText: '#2f8fa3',
    barTrack: '#d0e6ea',
    barThumb: '#4fb0c4',
    choiceHoverBg: '#d6edf1',
    choiceIdleBg: '#ffffffdb',
    choiceHoverText: '#06262d',
    textFont: FONT,
    nameFont: FONT,
    interfaceFont: FONT,
    sceneTransition: 'dissolve',
    uiTransition: 'Dissolve(0.25)',
  },
};

export const DEFAULT_GENRE: GenreId = 'romance';

/** 장르 선택 UI 용 목록. */
export const GENRE_OPTIONS: { id: GenreId; label: string }[] = (
  Object.keys(PRESETS) as GenreId[]
).map((id) => ({ id, label: PRESETS[id].label }));

/**
 * '#rrggbb(aa)' 의 RGB 상대 휘도(0~1). 알파는 무시 — 베일 "색"이 밝은지만 본다.
 * ⚠️ generators/theme/color.ts 의 relLuminance()(WCAG sRGB 감마 디코딩, isLight 에서 `> 0.4` 기준)와
 * 의도적으로 다르다 — 이건 선형(감마 미보정) 근사치이고 임계값도 `< 0.5`라, 같은 hex 에 다른 답을
 * 낼 수 있다. ensureReadableMenu 는 이 함수 도입 당시부터 이 임계값으로 실기 검증된 상태라, 지금
 * relLuminance 로 바꾸면 "밝다/어둡다" 판정이 바뀌어 이미 검증된 메뉴 가독성 보정이 흔들린다.
 * 병합하지 말 것 — 필요하면 새 호출부만 relLuminance/isLight 를 쓰도록.
 */
function veilLuminance(hex: string): number {
  const h = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 메뉴 가독성 보정 — 타이틀/인게임(ESC) 메뉴는 임의의 밝은 배경(장면·업로드 사진) 위에 뜬다.
 * 테마의 메뉴 베일이 "밝은 색"이면(예: 흰 반투명) 글자가 배경에 묻혀 못 읽으므로, 메뉴만
 * 어두운 스크림 + 밝은 텍스트로 강제한다(강조색·대사 팔레트는 그대로 → 테마 정체성 유지).
 * 이미 어두운 베일(호러/SF 등)은 건드리지 않는다. 프리셋·AI 커스텀 테마 모두에 적용된다.
 */
export function ensureReadableMenu(theme: GuiTheme): GuiTheme {
  if (veilLuminance(theme.menuOverlay) < 0.5) return theme; // 어두운 베일이면 손대지 않음
  // 텍스트를 밝게 하는 것과 짝으로, 텍스트가 얹히는 "불투명 패널"들도 어둡게 바꿔야 겹침(밝은 글자↔밝은 패널)이 없다.
  //  - frameBg: 확인창(예/아니오)·세이브 슬롯·스킵/알림 상자 배경
  //  - choiceIdleBg: 인게임 선택지 상자(글자색이 interfaceText 라 함께 어둡게)
  //  - choiceHoverBg: 세이브 슬롯 hover (인게임 선택지 hover 는 accent 라 무관)
  return {
    ...theme,
    menuOverlay: '#0c0a10d0', // 어두운 스크림(~82%) — 밝은 배경 위에서도 글자 대비 확보
    frameBg: '#17121ff2', // 확인창·세이브 슬롯·스킵/알림 패널(어둡게)
    choiceIdleBg: '#15111ce0', // 인게임 선택지 패널(어둡게)
    choiceHoverBg: '#241d33', // 세이브 슬롯 hover(어둡게)
    interfaceText: '#f2edf4', // 메뉴/선택지 텍스트(밝게)
    idle: '#e6dde6', // 비활성 버튼·세이브 슬롯·퀵메뉴 텍스트(밝게)
  };
}

/**
 * 적용할 GuiTheme 결정. 커스텀(AI/오프라인 생성) 테마가 있으면 그것을 우선,
 * 없으면 장르 프리셋(미지정 시 기본). 마지막에 메뉴 가독성 보정을 항상 통과시킨다.
 */
export function resolveTheme(genre: GenreId | undefined, custom?: GuiTheme): GuiTheme {
  const base = custom ?? PRESETS[genre ?? DEFAULT_GENRE] ?? PRESETS[DEFAULT_GENRE];
  return ensureReadableMenu(base);
}

/**
 * #rrggbb(또는 #rrggbbaa) + 불투명도(0~1) → #rrggbbaa.
 * ⚠️ generators/theme/color.ts 의 withAlpha()와 의도적으로 다르다 — 이쪽은 항상 8자리(`#rrggbbaa`)로
 * 알파를 명시(a=1 이어도 "ff"를 붙임)하고, 3자리 축약 hex 는 지원하지 않는다(6자리로만 패딩/슬라이스).
 * withAlpha()는 a>=1 이면 알파를 아예 생략하고(`#rrggbb`) 3자리 hex 도 parseHex 로 정식 지원한다.
 * 이 함수의 호출부(withGuiOverrides 등)는 항상 8자리 결과를 기대하므로 병합 시 알파 생략 분기가
 * 섞이면 색상 문자열 포맷이 달라져 회귀가 난다. 필요하면 새 호출부만 withAlpha 를 쓰도록.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${rgb}${aa}`;
}

export const DEFAULT_GRADIENT_OPACITY = 0.65;
export const DEFAULT_GRADIENT_HEIGHT = 0.45;

/**
 * 그라데이션 대사창의 창 높이와 글자 위치 보정량.
 * guiRpy(창 크기)와 buildZip(PNG 픽셀 높이)이 반드시 같은 값을 써야 한다 —
 * 어긋나면 Frame 이 이미지를 늘려/줄여 애써 만든 곡선이 뭉개진다.
 */
export function dialogueGradientMetrics(
  height: number,
  fadeRatio: number,
): { boxHeight: number; delta: number } {
  const clampedRatio = Math.max(0.25, Math.min(0.65, fadeRatio));
  const boxHeight = Math.round(height * clampedRatio);
  const baseHeight = Math.round(height / 4); // 기존 단색 박스 높이(화면의 1/4) — 글자 ypos 의 기준선
  // fadeRatio 하한(0.25)이 baseHeight 비율과 같으므로 이론상도 0 미만이 안 나오지만,
  // 반올림 오차로 인한 -1 같은 미세한 음수까지 방어적으로 막는다.
  const delta = Math.max(0, boxHeight - baseHeight);
  return { boxHeight, delta };
}

/**
 * 그라데이션 대사창의 기본색 결정 — 사용자가 dialogueBoxColor 를 지정했으면 그게 우선(override).
 * 미지정이면 "검정"으로 하드코딩하지 않고 테마의 dialogueBox 색(RGB 만, 알파는 버림 — 진하기는
 * dialogueGradientOpacity 가 따로 결정)을 쓴다. 단색 박스 경로(withGuiOverrides → theme.dialogueBox)가
 * 이미 이 색을 쓰고 있어서, 그라데이션도 같은 색을 기본으로 삼아야 테마의 글자색(dialogueText)과
 * 대비가 맞는다. 하드코딩 검정은 밝은 테마(romance/slice: 흰 배경 + 어두운 글자)에서 본문 글자를
 * 거의 안 보이게 만든다(실기 확인).
 */
export function dialogueGradientColor(theme: GuiTheme, override?: string): string {
  if (override) return override;
  return `#${theme.dialogueBox.replace('#', '').slice(0, 6)}`;
}

/**
 * GUI 대사창·폰트 사용자 조정(테마 위에 덮어씀) — canonical 정의. types.ts 의 Project.guiOverrides 가
 * 이 타입을 그대로 가져다 쓴다(예전엔 두 곳에 12개 필드를 복붙해 하나만 고치면 어긋나는 버그가 있었음).
 * types.ts 가 이미 이 파일에서 GenreId/GuiTheme 를 import 하므로, canonical 정의는 여기 두고
 * types.ts 가 가져가는 방향으로 잡았다(반대로 하면 theme.ts→types.ts→theme.ts 순환 import).
 */
export interface GuiOverrides {
  /** 대사창·선택지 배경색(기본 검정). 불투명도와 함께 적용. */
  dialogueBoxColor?: string;
  dialogueOpacity?: number;
  textColor?: string;
  nameColor?: string;
  outline?: boolean;
  outlineColor?: string;
  /**
   * 대사창을 단색 박스 대신 "세로 그라데이션"(위로 투명하게 사라지는)으로 렌더한다.
   * 켜면 buildZip 이 gui/textbox.png 를 생성하고 screens 의 window 배경이 그 이미지를 쓴다.
   * 매우 투명한 시네마틱 대사창에 적합.
   */
  dialogueGradient?: boolean;
  /** 그라데이션 하단 진하기(0.3~0.85, 기본 0.65). 단색 박스용 dialogueOpacity 와 분리한다. */
  dialogueGradientOpacity?: number;
  /** 페이드가 화면 아래 몇 비율까지 올라오는지(0.25~0.65, 기본 0.45). */
  dialogueGradientHeight?: number;
  /**
   * 본문(대사) 폰트 · 이름(화자) 폰트 — src/fonts/fontCatalog.ts 의 FontPreset id.
   * 미지정이면 기본 폰트(나눔고딕). nameFontId 미지정이면 bodyFontId 를 따라간다.
   */
  bodyFontId?: string;
  nameFontId?: string;
  /** 캐릭터 스프라이트 크기 배수(기본 1.0). 클수록 화면에서 크게(=가깝게) 보인다. */
  characterScale?: number;
}

/** 테마 위에 사용자 GUI 조정(대사창 색·불투명도·글자색·이름색)을 덮어쓴 새 테마. */
export function withGuiOverrides(theme: GuiTheme, ov?: GuiOverrides): GuiTheme {
  if (!ov) return theme;
  const boxOn = ov.dialogueOpacity != null || !!ov.dialogueBoxColor;
  const boxColor = ov.dialogueBoxColor ?? '#000000';
  const boxAlpha = ov.dialogueOpacity ?? 0.4; // 패널 표시값·buildZip 기본과 일치
  // 폰트: 미지정이면 테마 기본값 그대로(회귀 없음). 메뉴/UI(interfaceFont)는 본문 폰트를 따라가고,
  // 이름 폰트는 별도 지정 없으면 본문 폰트를 따라간다.
  const bodyFont = ov.bodyFontId ? fontGamePath(ov.bodyFontId) : theme.textFont;
  const nameFont = ov.nameFontId ? fontGamePath(ov.nameFontId) : bodyFont;
  return {
    ...theme,
    dialogueBox: boxOn ? hexWithAlpha(boxColor, boxAlpha) : theme.dialogueBox,
    // 선택지 버튼도 같은 색으로, 버튼 가시성을 위해 약간 더 진하게.
    choiceIdleBg: boxOn ? hexWithAlpha(boxColor, Math.min(boxAlpha + 0.1, 0.9)) : theme.choiceIdleBg,
    dialogueText: ov.textColor || theme.dialogueText,
    nameText: ov.nameColor || theme.nameText,
    textFont: bodyFont,
    interfaceFont: bodyFont,
    nameFont,
  };
}
