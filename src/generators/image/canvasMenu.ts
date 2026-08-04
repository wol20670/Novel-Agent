// 메뉴 배경(main_menu/game_menu) 폴백 + 대사창/버튼/알약 PNG 생성용 Canvas 2D 유틸.
// 메뉴 배경은 이제 앱이 그림을 그리지 않는다(업로드 전용) — 여기선 업로드 전에도 게임이
// 깨지지 않게 테마색 그라데이션만 까는 슬림한 폴백만 남긴다.

import type { GuiTheme } from '../../renpy/gui/theme';

function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** 메뉴 배경 폴백 — 업로드 전에도 게임이 깨지지 않게 테마색 2스톱 그라데이션만 깐다(장식 아트 없음). */
export async function menuBackdropPng(theme: GuiTheme, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  fillGradient(ctx, w, h, theme.bgTop, theme.bgBottom);
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

/** 그라데이션 PNG 가로 폭 — 세로 그라데이션이라 가로는 Frame(0,0) 이 늘려 쓰므로 최소값이면 충분. */
const GRADIENT_WIDTH = 8;

/**
 * 대사창 그라데이션 곡선 — t(0=창 맨 위, 1=창 맨 아래) → 알파(0~maxAlpha).
 * 하단 14%(t≥0.86)는 최대 진하기로 평평(글자가 실제로 놓이는 구간의 대비를 균일하게 유지),
 * 그 위는 smoothstep(3t²-2t³)으로 시작·끝 둘 다 부드럽게 이어 눈에 띄는 꺾임이 없게 한다.
 * t=0.1(창 상단 10% 지점)에서 이미 maxAlpha 의 3.7% 수준이라 배경(장면)과의 경계가 사실상
 * 안 보인다 — 예전 3-스톱(0%→32%에서 최대→평평) 방식은 같은 지점에서 이미 31% 였어서
 * 32% 지점에 눈에 띄는 선이 생겼었다. 별도 export 해 커브 자체를 테스트로 고정한다.
 */
export function gradientAlphaAt(t: number, maxAlpha: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  const p = Math.min(clampedT / 0.86, 1);
  const ease = p * p * (3 - 2 * p); // smoothstep
  return maxAlpha * ease;
}

/**
 * 대사창용 세로 그라데이션 PNG — 위는 완전 투명, 아래로 갈수록 color 가 maxAlpha 까지 진해진다.
 * (상단이 장면으로 자연스럽게 사라지는 시네마틱 대사창. screens 의 window 가 Frame 으로 늘려 쓴다.)
 * height 는 실제 창 픽셀 높이(dialogueGradientMetrics().boxHeight) 와 반드시 같아야 한다 —
 * PNG 를 늘리지 않고 1:1로 그려야 여기서 계산한 곡선 모양이 그대로 화면에 나온다.
 * createLinearGradient 의 색상 스톱 보간(스톱 사이 선형)으로는 smoothstep 곡선을 정확히
 * 재현할 수 없어, 행마다 알파를 직접 계산해 1px 높이 사각형으로 채운다.
 */
export function textboxGradientPng(color: string, maxAlpha: number, height: number): Promise<Blob> {
  const w = GRADIENT_WIDTH;
  const h = Math.max(2, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const { r, g, b } = rgbOf(color);
  const a = Math.max(0, Math.min(1, maxAlpha));
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1); // 0 = 위, 1 = 아래
    const alpha = gradientAlphaAt(t, a);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(0, y, w, 1);
  }
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
