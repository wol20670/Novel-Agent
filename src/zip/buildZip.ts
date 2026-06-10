// Ren'Py 프로젝트 ZIP 패키징.
// 텍스트 .rpy 는 generate.ts, 바이너리는 IndexedDB 의 생성 에셋을 쓰되
// 아직 생성되지 않은 배경/CG/BGM 은 즉석 폴백(Canvas/합성)으로 채워 실행 가능한 ZIP 을 보장한다.

import JSZip from 'jszip';
import type { Project } from '../types';
import { generateRenpyFiles } from '../renpy/generate';
import { getAsset } from '../storage/assetStore';
import { canvasImage } from '../generators/image/canvasProvider';
import { canvasSprite } from '../generators/image/canvasSprite';
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

/** Ren'Py 프로젝트의 모든 파일(텍스트+바이너리). path 는 프로젝트 루트 기준. */
export interface ProjectFile {
  path: string;
  data: string | Blob;
}

/**
 * 프로젝트의 전체 파일 목록을 수집한다(ZIP·폴더 직접쓰기 공용).
 * 미생성 배경/CG/BGM 은 폴백으로 채우고, 한글 폰트도 포함한다.
 */
export async function collectProjectFiles(
  project: Project,
): Promise<{ files: ProjectFile[]; placeholders: number }> {
  const { files: textFiles, refs, sprites } = generateRenpyFiles(project);
  const out: ProjectFile[] = textFiles.map((f) => ({ path: f.path, data: f.content }));

  let placeholders = 0;

  // 캐릭터 스프라이트 (생성된 assetId → blob, 없으면 Canvas 폴백)
  for (const sp of sprites) {
    let blob = await getAsset(sp.assetId);
    if (!blob) {
      const color = project.characters.find((c) => c.name === sp.charName)?.color ?? '#9fd3ff';
      blob = await canvasSprite(sp.charName, sp.expr, color);
      placeholders++;
    }
    out.push({ path: `game/images/${sp.file}`, data: blob });
  }
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
    out.push({ path: `game/images/${ref.bgFile}`, data: bg });

    // CG (모델에 별도 assetId 미보관 → 항상 폴백)
    for (let j = 0; j < ref.cgFiles.length; j++) {
      const cg = await canvasImage(s.cg[j], `CG: ${s.cg[j]}`, project.width, project.height);
      placeholders++;
      out.push({ path: `game/images/${ref.cgFiles[j]}`, data: cg });
    }

    // BGM
    if (ref.bgmFile) {
      const hadBgm = !!s.bgmAssetId && !!(await getAsset(s.bgmAssetId));
      const bgm = await blobForBgm(s.bgmAssetId, s.bgm || s.title);
      if (!hadBgm) placeholders++;
      out.push({ path: `game/audio/${ref.bgmFile}`, data: bgm });
    }
  }

  // 한글 폰트(나눔고딕, OFL) — Ren'Py 기본 폰트는 한글 글리프가 없다.
  for (const f of await koreanFontFiles()) out.push(f);

  return { files: out, placeholders };
}

export async function buildRenpyZip(project: Project): Promise<ZipResult> {
  const { files, placeholders } = await collectProjectFiles(project);
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const safeName = (project.title || 'visual-novel').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
  return { blob, filename: `${safeName}_renpy.zip`, placeholders };
}

/** 앱에 번들된 한글 폰트 파일들. 실패 시 빈 배열(한글이 □ 로 보일 수 있음). */
async function koreanFontFiles(): Promise<ProjectFile[]> {
  const base = import.meta.env.BASE_URL || '/';
  try {
    const [font, license] = await Promise.all([
      fetch(`${base}fonts/NanumGothic.ttf`),
      fetch(`${base}fonts/OFL.txt`),
    ]);
    const files: ProjectFile[] = [];
    if (font.ok) files.push({ path: 'game/fonts/NanumGothic.ttf', data: await font.blob() });
    if (license.ok) files.push({ path: 'game/fonts/OFL.txt', data: await license.text() });
    return files;
  } catch {
    return [];
  }
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
