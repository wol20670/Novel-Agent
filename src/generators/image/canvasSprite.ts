// 오프라인 폴백 캐릭터 스프라이트: Canvas 2D 로 투명 배경 위에 단순 캐릭터 + 표정을 그린다.
// 정식 일러스트 자리에 들어갈 테스트용. 투명 PNG 라 Ren'Py 에서 배경 위에 합성된다.

import type { Expression } from '../../types';

function shade(hex: string, amt: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/** 표정별 얼굴(눈·입·기타)을 그린다. cx,cy = 얼굴 중심, r = 얼굴 반지름. */
function drawFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, expr: Expression) {
  const eyeY = cy - r * 0.1;
  const eyeDx = r * 0.4;
  const eyeR = r * 0.1;
  ctx.fillStyle = '#3a3a3a';
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.lineCap = 'round';

  const eye = (x: number, open = 1) => {
    ctx.beginPath();
    if (open >= 1) ctx.arc(x, eyeY, eyeR, 0, Math.PI * 2);
    else {
      ctx.moveTo(x - eyeR, eyeY);
      ctx.quadraticCurveTo(x, eyeY + eyeR * 1.4, x + eyeR, eyeY);
    }
    open >= 1 ? ctx.fill() : ctx.stroke();
  };

  // 표정별 변형
  switch (expr) {
    case '기쁨':
      eye(cx - eyeDx, 0.3);
      eye(cx + eyeDx, 0.3); // 웃는 눈
      arcMouth(ctx, cx, cy + r * 0.35, r * 0.35, true);
      break;
    case '슬픔':
      eye(cx - eyeDx);
      eye(cx + eyeDx);
      arcMouth(ctx, cx, cy + r * 0.55, r * 0.3, false); // 처진 입
      // 눈물
      ctx.fillStyle = '#7ec8ff';
      ctx.beginPath();
      ctx.arc(cx + eyeDx, eyeY + eyeR * 2, eyeR * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case '화남':
      eye(cx - eyeDx);
      eye(cx + eyeDx);
      // 찌푸린 눈썹
      ctx.beginPath();
      ctx.moveTo(cx - eyeDx - eyeR, eyeY - eyeR * 1.8);
      ctx.lineTo(cx - eyeDx + eyeR, eyeY - eyeR * 0.8);
      ctx.moveTo(cx + eyeDx + eyeR, eyeY - eyeR * 1.8);
      ctx.lineTo(cx + eyeDx - eyeR, eyeY - eyeR * 0.8);
      ctx.stroke();
      arcMouth(ctx, cx, cy + r * 0.5, r * 0.28, false);
      break;
    case '놀람':
      eye(cx - eyeDx);
      eye(cx + eyeDx);
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.45, r * 0.16, 0, Math.PI * 2); // O 입
      ctx.stroke();
      break;
    case '수줍음':
      eye(cx - eyeDx, 0.3);
      eye(cx + eyeDx, 0.3);
      // 볼터치
      ctx.fillStyle = 'rgba(255,140,150,0.5)';
      ctx.beginPath();
      ctx.arc(cx - eyeDx, cy + r * 0.2, eyeR * 1.3, 0, Math.PI * 2);
      ctx.arc(cx + eyeDx, cy + r * 0.2, eyeR * 1.3, 0, Math.PI * 2);
      ctx.fill();
      arcMouth(ctx, cx, cy + r * 0.4, r * 0.18, true);
      break;
    default: // 기본
      eye(cx - eyeDx);
      eye(cx + eyeDx);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.18, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.18, cy + r * 0.45); // 일자 입
      ctx.stroke();
  }
}

function arcMouth(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, smile: boolean) {
  ctx.beginPath();
  if (smile) ctx.arc(cx, cy, r, 0.15 * Math.PI, 0.85 * Math.PI);
  else ctx.arc(cx, cy + r, r, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
}

export function canvasSprite(
  name: string,
  expr: Expression,
  color: string,
  width = 512,
  height = 1024,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height); // 투명 배경

  const cx = width / 2;
  const faceR = width * 0.28;
  const headCy = height * 0.26;

  // 몸통(둥근 사다리꼴 느낌의 옷)
  ctx.fillStyle = color;
  ctx.beginPath();
  const bodyTop = headCy + faceR * 0.8;
  ctx.moveTo(cx - width * 0.22, bodyTop);
  ctx.lineTo(cx + width * 0.22, bodyTop);
  ctx.lineTo(cx + width * 0.36, height);
  ctx.lineTo(cx - width * 0.36, height);
  ctx.closePath();
  ctx.fill();
  // 옷 음영
  ctx.fillStyle = shade(color, -25);
  ctx.fillRect(cx - width * 0.04, bodyTop, width * 0.08, height - bodyTop);

  // 목
  ctx.fillStyle = '#f2d3b8';
  ctx.fillRect(cx - faceR * 0.25, headCy + faceR * 0.5, faceR * 0.5, faceR * 0.6);

  // 머리(피부)
  ctx.fillStyle = '#f7dcc2';
  ctx.beginPath();
  ctx.arc(cx, headCy, faceR, 0, Math.PI * 2);
  ctx.fill();

  // 머리카락(색 어둡게)
  ctx.fillStyle = shade(color, -60);
  ctx.beginPath();
  ctx.arc(cx, headCy, faceR * 1.04, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineTo(cx + faceR * 0.7, headCy - faceR * 0.2);
  ctx.arc(cx, headCy, faceR * 0.96, Math.PI * 1.9, Math.PI * 1.1, true);
  ctx.closePath();
  ctx.fill();

  // 표정
  drawFace(ctx, cx, headCy, faceR, expr);

  // 이름표
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const plateH = height * 0.07;
  ctx.fillRect(cx - width * 0.34, height - plateH, width * 0.68, plateH);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(width * 0.09)}px "Malgun Gothic", system-ui, sans-serif`;
  ctx.fillText(`${name} · ${expr}`, cx, height - plateH / 2, width * 0.64);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}
