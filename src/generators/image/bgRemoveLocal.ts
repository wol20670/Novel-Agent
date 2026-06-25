// 브라우저 내 무료 배경 제거(누끼) — Anlas 0, 오프라인, 외부 의존성 없음.
// NovelAI 는 프롬프트로 "흰/단색 배경"을 강제해 생성하므로, 이미지 "가장자리에서 연결된 배경"만
// flood-fill 로 투명화하면 내부의 흰 옷·소품 등은 보존된다(연결되지 않아 제거 안 됨).
// 머리카락 미세 경계의 흰 헤일로는 약한 페더링(부분 알파)으로 완화한다.

export async function browserRemoveBackground(blob: Blob, opts?: { tolerance?: number }): Promise<Blob> {
  const tol = opts?.tolerance ?? 32;
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    throw new Error('canvas 2d 컨텍스트를 만들 수 없습니다.');
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // 배경색 = 네 모서리 평균(보통 흰색).
  const cornerIdx = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const c of cornerIdx) {
    br += d[c];
    bg += d[c + 1];
    bb += d[c + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  const dist2 = (i: number): number => {
    const dr = d[i] - br;
    const dg = d[i + 1] - bg;
    const db = d[i + 2] - bb;
    return dr * dr + dg * dg + db * db;
  };

  const tol2 = tol * tol;
  // 가장자리에서 배경색과 가까운 픽셀을 BFS 로 따라가며 투명화(연결된 배경만).
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (!visited[p] && dist2(p * 4) <= tol2) {
      visited[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop() as number;
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  // 약한 페더: 보존 픽셀이 투명 픽셀과 인접 + 배경색에 가까우면 알파를 낮춰 흰 헤일로 완화.
  const tolF = tol * 2;
  const tolF2 = tolF * tolF;
  const alpha = new Uint8ClampedArray(w * h); // 0=그대로, 그 외=새 알파+1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (d[p * 4 + 3] === 0) continue;
      const adj =
        (x > 0 && d[(p - 1) * 4 + 3] === 0) ||
        (x < w - 1 && d[(p + 1) * 4 + 3] === 0) ||
        (y > 0 && d[(p - w) * 4 + 3] === 0) ||
        (y < h - 1 && d[(p + w) * 4 + 3] === 0);
      if (!adj) continue;
      const dd = dist2(p * 4);
      if (dd < tolF2) {
        const a = Math.min(1, Math.sqrt(dd) / tolF);
        alpha[p] = Math.max(1, Math.round(255 * a)); // +1 표식(0은 '변경 없음')
      }
    }
  }
  for (let p = 0; p < w * h; p++) {
    if (alpha[p]) d[p * 4 + 3] = alpha[p];
  }

  ctx.putImageData(img, 0, 0);
  console.info('%c[누끼] 브라우저 무료 처리 (Anlas 0)', 'color:#4ade80', { width: w, height: h });
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 변환 실패'))), 'image/png'),
  );
}
