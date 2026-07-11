// 테마별 메뉴 배경(main_menu/game_menu) 을 Canvas 2D 로 생성.
// 외부 PNG 0개 원칙의 유일한 "그림". AI 키 없이 오프라인 동작하며,
// 추후 T3(이미지 모델)로 교체될 자리. menuArtStyle 에 따라 분위기를 달리한다.

import type { GuiTheme, MenuArtStyle } from '../../renpy/gui/theme';

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function softBlobs(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, seed: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = accent;
  for (let i = 0; i < 6; i++) {
    const r = 120 + ((seed >>> (i * 3)) % 280);
    const x = (seed >>> (i * 4)) % w;
    const y = (seed >>> (i * 5)) % h;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function neonGrid(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, seed: number) {
  softBlobs(ctx, w, h, accent, seed, 0.1);
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1.5;
  const horizon = h * 0.55;
  // 원근 가로선
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = horizon + (h - horizon) * t * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // 원근 세로선 (소실점으로 수렴)
  const vx = w / 2;
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(vx, horizon);
    ctx.lineTo(vx + i * (w / 12), h);
    ctx.stroke();
  }
  ctx.restore();
}

function grunge(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, seed: number) {
  // 거친 노이즈 점
  ctx.save();
  let s = seed;
  const next = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0);
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 1400; i++) {
    const x = next() % w;
    const y = next() % h;
    const r = next() % 2;
    ctx.fillRect(x, y, r + 1, r + 1);
  }
  // 긁힌 자국
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const x = next() % w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + ((next() % 80) - 40), h);
    ctx.stroke();
  }
  ctx.restore();
}

const drawByStyle: Record<MenuArtStyle, (ctx: CanvasRenderingContext2D, w: number, h: number, t: GuiTheme, seed: number) => void> = {
  'gradient-soft': (ctx, w, h, t, seed) => {
    fillGradient(ctx, w, h, t.bgTop, t.bgBottom);
    softBlobs(ctx, w, h, t.accent, seed, 0.16);
  },
  'dark-vignette': (ctx, w, h, t, seed) => {
    fillGradient(ctx, w, h, t.bgTop, t.bgBottom);
    softBlobs(ctx, w, h, t.accent, seed, 0.1);
    vignette(ctx, w, h, 0.55);
  },
  'neon-grid': (ctx, w, h, t, seed) => {
    fillGradient(ctx, w, h, t.bgTop, t.bgBottom);
    neonGrid(ctx, w, h, t.accent, seed);
    vignette(ctx, w, h, 0.4);
  },
  'noise-grunge': (ctx, w, h, t, seed) => {
    fillGradient(ctx, w, h, t.bgTop, t.bgBottom);
    grunge(ctx, w, h, t.accent, seed);
    vignette(ctx, w, h, 0.65);
  },
};

/**
 * 테마 메뉴 배경 PNG 생성.
 * @param variant 'main' | 'game' — game 메뉴는 살짝 더 어둡게(가독성).
 */
export function canvasMenuArt(
  theme: GuiTheme,
  width = 1280,
  height = 720,
  variant: 'main' | 'game' = 'main',
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const seed = hash(theme.id + variant);

  drawByStyle[theme.menuArtStyle](ctx, width, height, theme, seed);

  // 게임 메뉴는 콘텐츠 가독성을 위해 약간 더 어둡게 덮는다.
  if (variant === 'game') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, width, height);
  }

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
}

/** '#rgb'·'#rrggbb' → {r,g,b} (앞 6자리만, 알파는 무시). */
function rgbOf(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  h = h.slice(0, 6).padEnd(6, '0');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/**
 * 대사창용 세로 그라데이션 PNG — 위는 완전 투명, 아래로 갈수록 color 가 maxAlpha 까지 진해진다.
 * (상단이 장면으로 자연스럽게 사라지는 시네마틱 대사창. screens 의 window 가 Frame 으로 늘려 쓴다.)
 * 세로 변화만 있어 가로는 좁아도 되므로 16×256 작은 이미지로 만든다(Frame 0,0 으로 가로 stretch).
 */
export function textboxGradientPng(color: string, maxAlpha: number, w = 16, h = 256): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const { r, g, b } = rgbOf(color);
  const a = Math.max(0, Math.min(1, maxAlpha));
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  // 상단 투명 → 32% 지점에서 최대 진하기 도달 → 하단까지 유지(글자 영역 가독성 확보).
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.32, `rgba(${r},${g},${b},${a})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},${a})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((bl) => resolve(bl!), 'image/png'));
}

/** 단색(또는 투명) PNG — 버튼 배경 Frame 용. 'transparent' 면 완전 투명. */
export function solidPng(color: string, w = 24, h = 24): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  if (color !== 'transparent') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

/**
 * 퀵메뉴(우상단 드롭다운) 전용 알약(pill) 프레임 PNG. 9-patch 로 Frame() 늘려 쓰므로
 * 작은 크기(64×48)에 모서리만 확실히 둥글면 된다. 밝은 반투명 채움 + 옅은 테두리로
 * 어떤 장면 배경 위에서도 버튼 경계와 글자 대비가 확보되도록 한다(투명 idle 배경이
 * 원인이던 가시성 문제 해결, 2026-07-10).
 */
export function roundedPillPng(fill: string, border: string, w = 64, h = 48, radius = 20): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const r = Math.min(radius, w / 2, h / 2);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  path();
  ctx.stroke();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

/**
 * 퀵메뉴 알약 PNG 2종(idle/hover)의 색 — 테마 강조색을 살짝 섞은 밝은 톤이라 어떤 장면
 * 배경 위에서도 항상 밝고, 진한 텍스트(quick_button_text)와 대비가 확보된다.
 * idle: 거의 흰색(테마 강조색 아주 옅게 섞음) / hover·selected: 강조색을 더 섞어 살짝 진해짐.
 */
export function quickPillAssets(theme: GuiTheme): { name: string; fill: string; border: string }[] {
  const { r, g, b } = rgbOf(theme.accent);
  const tint = (amount: number, alpha: number) =>
    `rgba(${Math.round(255 * (1 - amount) + r * amount)},${Math.round(255 * (1 - amount) + g * amount)},${Math.round(255 * (1 - amount) + b * amount)},${alpha})`;
  return [
    { name: 'quickpill_idle.png', fill: tint(0.08, 0.9), border: tint(0.35, 0.6) },
    { name: 'quickpill_hover.png', fill: tint(0.2, 0.95), border: tint(0.5, 0.75) },
  ];
}

/**
 * gui.button_properties() 가 요구하는 제네릭 버튼 배경 PNG 목록.
 * Ren'Py 는 `gui/button/[prefix_]background.png` 를 prefix(idle/hover/insensitive/selected) 검색하므로
 * 제네릭만 있으면 모든 버튼 종류(navigation/page/radio/check/help/quick/confirm/slider)가 폴백으로 해결된다.
 * 평소 버튼은 텍스트색만으로 표현(idle 투명), hover/selected 만 강조색 반투명.
 */
export function buttonBgAssets(theme: GuiTheme): { name: string; color: string }[] {
  return [
    { name: 'background.png', color: 'transparent' },
    { name: 'idle_background.png', color: 'transparent' },
    { name: 'insensitive_background.png', color: 'transparent' },
    { name: 'hover_background.png', color: theme.accent + '38' },
    { name: 'selected_background.png', color: theme.accent + '55' },
  ];
}
