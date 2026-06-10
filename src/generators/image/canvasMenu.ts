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
