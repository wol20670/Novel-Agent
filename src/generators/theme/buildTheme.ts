// 테마 빌더 — AI(또는 오프라인 시드)가 고른 "코어 색/스타일"을 받아
// 전체 GuiTheme 으로 안전하게 파생한다. 잘못된 값은 프리셋으로 클램프하고,
// 대사/메뉴 글자는 명암대비를 강제해 가독성을 보장한다(항상 출하 가능 보장).

import type { GenreId, GuiTheme, MenuArtStyle } from '../../renpy/gui/theme';
import { PRESETS } from '../../renpy/gui/theme';
import { contrast, enforceContrast, isHex, isLight, mix, parseHex, rotateHue, toHex, withAlpha } from './color';

/** AI/시드가 결정하는 최소 코어. 나머지는 전부 여기서 파생. */
export interface ThemeCore {
  accent: string;
  bgTop: string;
  bgBottom: string;
  interfaceText: string;
  dialogueBox: string; // 불투명 베이스(투명도는 우리가 부여)
  dialogueText: string;
  nameText: string;
  menuArtStyle: MenuArtStyle;
  sceneTransition: 'dissolve' | 'fade';
  rationale?: string;
}

const ART_STYLES: MenuArtStyle[] = ['gradient-soft', 'dark-vignette', 'neon-grid', 'noise-grunge'];

const pick = (v: unknown, fallback: string): string => (isHex(v) ? (v as string) : fallback);

/** 프리셋 → 코어(불투명 베이스로 정규화). 오프라인 변형의 출발점. */
export function presetCore(genre: GenreId): ThemeCore {
  const p = PRESETS[genre] ?? PRESETS.romance;
  const opaque = (hex: string) => toHex({ ...(parseHex(hex) ?? { r: 0, g: 0, b: 0, a: 1 }), a: 1 });
  return {
    accent: p.accent,
    bgTop: p.bgTop,
    bgBottom: p.bgBottom,
    interfaceText: p.interfaceText,
    dialogueBox: opaque(p.dialogueBox),
    dialogueText: p.dialogueText,
    nameText: p.nameText,
    menuArtStyle: p.menuArtStyle,
    sceneTransition: p.sceneTransition as 'dissolve' | 'fade',
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 키워드 → 메뉴 아트 스타일 힌트(오프라인 변형용). */
function artHint(text: string): MenuArtStyle | null {
  const t = text.toLowerCase();
  if (/네온|사이버|사이언스|sf|우주|미래|neon|cyber/.test(t)) return 'neon-grid';
  if (/공포|호러|피|유령|괴물|horror|blood|grunge|폐허/.test(t)) return 'noise-grunge';
  if (/스릴러|추리|범죄|느와르|밤거리|thriller|noir|어둠/.test(t)) return 'dark-vignette';
  if (/로맨스|일상|봄|햇살|따뜻|romance|soft|pastel/.test(t)) return 'gradient-soft';
  return null;
}

/**
 * 오프라인(키 없음) 결정적 변형 — 프리셋을 시드 텍스트로 살짝 비틀어
 * 작품마다 다른 느낌을 준다. 톤은 장르를 유지.
 */
export function seededVariation(genre: GenreId, seedText: string): ThemeCore {
  const core = presetCore(genre);
  const h = hash(genre + '|' + seedText);
  const rot = ((h % 41) - 20) * 0.8; // -16°~+16°
  const shift = (hex: string) => rotateHue(hex, rot);
  return {
    ...core,
    accent: shift(core.accent),
    bgTop: shift(core.bgTop),
    bgBottom: shift(core.bgBottom),
    nameText: shift(core.nameText),
    menuArtStyle: artHint(seedText) ?? core.menuArtStyle,
  };
}

/**
 * 코어 → 완전한 GuiTheme. 잘못된 색은 프리셋으로 대체, 종속색은 파생,
 * 대사/메뉴 글자는 대비 강제. label 로 출처를 표시.
 */
export function buildTheme(coreIn: Partial<ThemeCore>, genre: GenreId, label: string): GuiTheme {
  const base = presetCore(genre);
  const p = PRESETS[genre] ?? PRESETS.romance;

  const accent = pick(coreIn.accent, base.accent);
  const bgTop = pick(coreIn.bgTop, base.bgTop);
  const bgBottom = pick(coreIn.bgBottom, base.bgBottom);
  const dialogueBoxBase = pick(coreIn.dialogueBox, base.dialogueBox);
  const light = isLight(bgTop);

  // 메뉴 패널(오버레이) 위에 올라가는 인터페이스 글자의 유효 배경 근사
  const panel = mix(mix(bgTop, bgBottom, 0.5), light ? '#ffffff' : '#000000', 0.4);

  let interfaceText = pick(coreIn.interfaceText, base.interfaceText);
  interfaceText = enforceContrast(interfaceText, panel, 3.2);

  let dialogueText = pick(coreIn.dialogueText, base.dialogueText);
  dialogueText = enforceContrast(dialogueText, dialogueBoxBase, 4.5);

  let nameText = pick(coreIn.nameText, base.nameText);
  nameText = enforceContrast(nameText, dialogueBoxBase, 3.0);

  const menuArtStyle = (ART_STYLES.includes(coreIn.menuArtStyle as MenuArtStyle)
    ? coreIn.menuArtStyle
    : base.menuArtStyle) as MenuArtStyle;
  const sceneTransition = coreIn.sceneTransition === 'fade' ? 'fade' : 'dissolve';

  return {
    id: genre,
    label,
    accent,
    accentHover: light ? mix(accent, '#000000', 0.25) : mix(accent, '#ffffff', 0.3),
    bgTop,
    bgBottom,
    menuOverlay: light ? withAlpha('#ffffff', 0.35) : withAlpha('#000000', 0.6),
    interfaceText,
    idle: mix(interfaceText, light ? '#ffffff' : '#000000', 0.4),
    frameBg: withAlpha(mix(mix(bgTop, bgBottom, 0.5), light ? '#ffffff' : '#000000', 0.5), 0.95),
    dialogueBox: withAlpha(dialogueBoxBase, light ? 0.88 : 0.9),
    dialogueText,
    nameText,
    barTrack: mix(accent, light ? '#ffffff' : '#000000', 0.7),
    barThumb: accent,
    choiceHoverBg: mix(accent, light ? '#ffffff' : '#000000', 0.62),
    textFont: p.textFont,
    nameFont: p.nameFont,
    interfaceFont: p.interfaceFont,
    sceneTransition,
    uiTransition: sceneTransition === 'fade' ? 'Dissolve(0.5)' : 'Dissolve(0.25)',
    menuArtStyle,
  };
}

/** 디버그/표시용: 대비 점검 결과(통과 여부). */
export function contrastReport(t: GuiTheme): { dialogue: number; name: number } {
  const boxOpaque = toHex({ ...(parseHex(t.dialogueBox) ?? { r: 0, g: 0, b: 0, a: 1 }), a: 1 });
  return { dialogue: contrast(t.dialogueText, boxOpaque), name: contrast(t.nameText, boxOpaque) };
}
