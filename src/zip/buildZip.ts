// Ren'Py 프로젝트 ZIP 패키징.
// 텍스트 .rpy 는 generate.ts, 바이너리는 IndexedDB 의 생성 에셋을 쓰되
// 아직 생성되지 않은 배경/CG/BGM 은 즉석 폴백(Canvas/합성)으로 채워 실행 가능한 ZIP 을 보장한다.

import JSZip from 'jszip';
import type { Project } from '../types';
import { generateRenpyFiles } from '../renpy/generate';
import { getAsset } from '../storage/assetStore';
import { canvasImage } from '../generators/image/canvasProvider';
import { synthBgm } from '../generators/audio/synthProvider';

async function blobForBackground(
  assetId: string | undefined,
  prompt: string,
  label: string,
  w: number,
  h: number,
): Promise<Blob> {
  if (assetId) {
    const existing = await getAsset(assetId);
    if (existing) return existing;
  }
  return canvasImage(prompt, label, w, h);
}

async function blobForBgm(assetId: string | undefined, prompt: string): Promise<Blob> {
  if (assetId) {
    const existing = await getAsset(assetId);
    if (existing) return existing;
  }
  const { blob } = await synthBgm(prompt);
  return blob;
}

export interface ZipResult {
  blob: Blob;
  filename: string;
  /** 폴백으로 즉석 생성된 에셋 수(사용자 안내용). */
  placeholders: number;
}

export async function buildRenpyZip(project: Project): Promise<ZipResult> {
  const { files, refs } = generateRenpyFiles(project);
  const zip = new JSZip();

  for (const f of files) zip.file(f.path, f.content);

  let placeholders = 0;
  for (const ref of refs) {
    const s = ref.scene;

    // 배경
    const hadBg = !!s.backgroundAssetId && !!(await getAsset(s.backgroundAssetId));
    const bg = await blobForBackground(
      s.backgroundAssetId,
      [s.background || s.title, ...s.direction].join(', '),
      s.background || s.title,
      project.width,
      project.height,
    );
    if (!hadBg) placeholders++;
    zip.file(`game/images/${ref.bgFile}`, bg);

    // CG (모델에 별도 assetId 미보관 → 항상 폴백)
    for (let j = 0; j < ref.cgFiles.length; j++) {
      const cg = await canvasImage(s.cg[j], `CG: ${s.cg[j]}`, project.width, project.height);
      placeholders++;
      zip.file(`game/images/${ref.cgFiles[j]}`, cg);
    }

    // BGM
    if (ref.bgmFile) {
      const hadBgm = !!s.bgmAssetId && !!(await getAsset(s.bgmAssetId));
      const bgm = await blobForBgm(s.bgmAssetId, s.bgm || s.title);
      if (!hadBgm) placeholders++;
      zip.file(`game/audio/${ref.bgmFile}`, bgm);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const safeName = (project.title || 'visual-novel').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
  return { blob, filename: `${safeName}_renpy.zip`, placeholders };
}

/** 브라우저 다운로드 트리거. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
