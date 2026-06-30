// 장르별 GUI 테마 — "데이터로서의 테마".
// AI(T2)가 채우거나(추후) 프리셋에서 고르는 GuiTheme 객체 하나가
// gui.rpy / screens.rpy / 메뉴 아트를 전부 결정한다. 컴파일러(guiRpy/screensRpy)는
// 이 객체만 읽으므로, 겉모습은 장르마다 완전히 달라지되 생성된 코드는 항상 유효하다.

export type GenreId = 'romance' | 'horror' | 'scifi' | 'thriller' | 'slice';

/** Canvas 메뉴 배경 스타일(브라우저 canvasMenu 가 해석). */
export type MenuArtStyle = 'gradient-soft' | 'dark-vignette' | 'neon-grid' | 'noise-grunge';

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

  // ── 메뉴 아트 ──
  menuArtStyle: MenuArtStyle;
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
    menuArtStyle: 'gradient-soft',
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
    menuArtStyle: 'noise-grunge',
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
    menuArtStyle: 'neon-grid',
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
    menuArtStyle: 'dark-vignette',
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
    menuArtStyle: 'gradient-soft',
  },
};

export const DEFAULT_GENRE: GenreId = 'romance';

/** 장르 선택 UI 용 목록. */
export const GENRE_OPTIONS: { id: GenreId; label: string }[] = (
  Object.keys(PRESETS) as GenreId[]
).map((id) => ({ id, label: PRESETS[id].label }));

/**
 * 적용할 GuiTheme 결정. 커스텀(AI/오프라인 생성) 테마가 있으면 그것을 우선,
 * 없으면 장르 프리셋(미지정 시 기본).
 */
export function resolveTheme(genre: GenreId | undefined, custom?: GuiTheme): GuiTheme {
  if (custom) return custom;
  return PRESETS[genre ?? DEFAULT_GENRE] ?? PRESETS[DEFAULT_GENRE];
}

/** #rrggbb(또는 #rrggbbaa) + 불투명도(0~1) → #rrggbbaa. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${rgb}${aa}`;
}

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
   * 매우 투명한 시네마틱 대사창에 적합. dialogueOpacity 가 그라데이션 하단의 최대 진하기.
   */
  dialogueGradient?: boolean;
}

/** 테마 위에 사용자 GUI 조정(대사창 색·불투명도·글자색·이름색)을 덮어쓴 새 테마. */
export function withGuiOverrides(theme: GuiTheme, ov?: GuiOverrides): GuiTheme {
  if (!ov) return theme;
  const boxOn = ov.dialogueOpacity != null || !!ov.dialogueBoxColor;
  const boxColor = ov.dialogueBoxColor ?? '#000000';
  const boxAlpha = ov.dialogueOpacity ?? 0.15;
  return {
    ...theme,
    dialogueBox: boxOn ? hexWithAlpha(boxColor, boxAlpha) : theme.dialogueBox,
    // 선택지 버튼도 같은 색으로, 버튼 가시성을 위해 약간 더 진하게.
    choiceIdleBg: boxOn ? hexWithAlpha(boxColor, Math.min(boxAlpha + 0.1, 0.9)) : theme.choiceIdleBg,
    dialogueText: ov.textColor || theme.dialogueText,
    nameText: ov.nameColor || theme.nameText,
  };
}
