// 오프라인 폴백 배경/CG: Canvas 2D 로 분위기 있는 그라데이션 + 라벨 PNG 를 즉시 만든다.

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Palette {
  top: string;
  bottom: string;
  accent: string;
}

// 프롬프트 키워드 → 분위기 색. 키워드 없으면 해시 기반.
function pickPalette(prompt: string): Palette {
  const p = prompt;
  const has = (...ws: string[]) => ws.some((w) => p.includes(w));
  if (has('밤', '저녁', '야간', 'night')) return { top: '#0f1228', bottom: '#2a2350', accent: '#8a7dff' };
  if (has('아침', '맑', '햇살', 'morning')) return { top: '#7ec8ff', bottom: '#dff3ff', accent: '#ffd479' };
  if (has('비', '우울', '슬픔', 'rain')) return { top: '#3a4a5a', bottom: '#6d7e8c', accent: '#aac4d6' };
  if (has('학교', '교실', '운동장')) return { top: '#ffe1a8', bottom: '#ffd0d0', accent: '#9fd3ff' };
  if (has('상가', '거리', '도시', 'city')) return { top: '#2a2140', bottom: '#5a3a6a', accent: '#ff9ec4' };
  const h = hash(prompt);
  const hue = h % 360;
  return {
    top: `hsl(${hue}, 45%, 28%)`,
    bottom: `hsl(${(hue + 40) % 360}, 50%, 55%)`,
    accent: `hsl(${(hue + 180) % 360}, 70%, 70%)`,
  };
}

export function canvasImage(
  prompt: string,
  label: string,
  width = 1280,
  height = 720,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const pal = pickPalette(prompt + ' ' + label);

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, pal.top);
  grad.addColorStop(1, pal.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 은은한 광원/도형
  const h = hash(prompt);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 6; i++) {
    // 부호 없는 시프트(>>>)로 음수 반지름/좌표를 방지한다.
    const r = 80 + ((h >>> (i * 3)) % 220);
    const x = (h >>> (i * 4)) % width;
    const y = (h >>> (i * 5)) % height;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 하단 비네팅
  const vg = ctx.createLinearGradient(0, height * 0.5, 0, height);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);

  // 라벨
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${Math.round(height / 16)}px "Malgun Gothic", system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillText(label || '배경', 48, height - 48, width - 96);
  ctx.shadowBlur = 0;
  ctx.font = `${Math.round(height / 36)}px "Malgun Gothic", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('임시 배경 (Canvas) · 정식 일러스트로 교체 예정', 48, height - 24, width - 96);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
}
