// 색 유틸 — hex 파싱/포맷 + WCAG 명암대비 계산 및 가독성 자동 보정.
// AI가 어떤 색을 내든 대사/메뉴 글자가 읽히도록 보장하는 게 핵심.

export interface RGB {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

/** '#rgb' | '#rrggbb' | '#rrggbbaa' → RGB. 실패 시 null. */
export function parseHex(hex: string): RGB | null {
  const s = hex.trim().replace(/^#/, '');
  const m3 = /^([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (m3) {
    return { r: parseInt(m3[1] + m3[1], 16), g: parseInt(m3[2] + m3[2], 16), b: parseInt(m3[3] + m3[3], 16), a: 1 };
  }
  const m6 = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(s);
  if (m6) {
    return {
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16),
      a: m6[4] !== undefined ? parseInt(m6[4], 16) / 255 : 1,
    };
  }
  return null;
}

export function isHex(hex: unknown): hex is string {
  return typeof hex === 'string' && parseHex(hex) !== null;
}

const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** RGB → '#rrggbb' (a=1) 또는 '#rrggbbaa'. */
export function toHex({ r, g, b, a }: RGB): string {
  const base = `#${h2(r)}${h2(g)}${h2(b)}`;
  return a >= 1 ? base : base + h2(Math.round(a * 255));
}

/** alpha 만 교체한 hex 반환. */
export function withAlpha(hex: string, a: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return toHex({ ...c, a });
}

/** a, b 를 t(0..1) 로 선형 보간(알파 무시, 불투명 가정). */
export function mix(aHex: string, bHex: string, t: number): string {
  const a = parseHex(aHex) ?? { r: 0, g: 0, b: 0, a: 1 };
  const b = parseHex(bHex) ?? { r: 255, g: 255, b: 255, a: 1 };
  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: 1,
  });
}

function relLuminance({ r, g, b }: RGB): number {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 대비비 (1..21). 알파는 무시(불투명 RGB 기준). */
export function contrast(aHex: string, bHex: string): number {
  const a = parseHex(aHex);
  const b = parseHex(bHex);
  if (!a || !b) return 1;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * text 색을 bg 대비 `min` 이상이 되도록 흰색/검정 쪽으로 점진 보정.
 * bg 가 밝으면 검정 쪽, 어두우면 흰색 쪽으로 민다(원색 톤은 최대한 유지).
 */
export function enforceContrast(textHex: string, bgHex: string, min = 4.5): string {
  if (!isHex(textHex) || !isHex(bgHex)) return textHex;
  if (contrast(textHex, bgHex) >= min) return textHex;
  const bg = parseHex(bgHex)!;
  const target = relLuminance(bg) > 0.4 ? '#000000' : '#ffffff';
  let best = textHex;
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    best = mix(textHex, target, t);
    if (contrast(best, bgHex) >= min) return best;
  }
  return best; // 끝까지 못 맞추면 가장 가까운 값(흰/검)
}

/** hex 의 명도가 0.4 초과면 '밝음'(라이트 테마). */
export function isLight(hex: string): boolean {
  const c = parseHex(hex);
  return c ? relLuminance(c) > 0.4 : false;
}

function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb),
    min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v, a: 1 };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255, a: 1 };
}

/** 색상(hue)만 deg 만큼 회전(채도·명도 유지). 알파는 무시. */
export function rotateHue(hex: string, deg: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const [h, s, l] = rgbToHsl(c);
  return toHex(hslToRgb(h + deg, s, l));
}
