// Ren'Py 프로젝트 ZIP 패키징.
// 텍스트 .rpy 는 generate.ts, 바이너리는 IndexedDB 의 생성 에셋을 쓰되
// 아직 생성되지 않은 배경/CG/BGM 은 즉석 폴백(Canvas/합성)으로 채워 실행 가능한 ZIP 을 보장한다.

import type { Project } from '../types';
import { generateRenpyFiles } from '../renpy/generate';
import { getAsset } from '../storage/assetStore';
import { canvasImage } from '../generators/image/canvasProvider';
import { canvasSprite } from '../generators/image/canvasSprite';
import { canvasMenuArt, solidPng, buttonBgAssets, textboxGradientPng } from '../generators/image/canvasMenu';
import { synthBgm } from '../generators/audio/synthProvider';
import { resolveTheme } from '../renpy/gui';

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
    let blob = sp.assetId ? await getAsset(sp.assetId) : undefined;
    if (!blob) {
      const color = project.characters.find((c) => c.name === sp.charName)?.color ?? '#9fd3ff';
      blob = await canvasSprite(sp.charName, sp.expr, color);
      placeholders++;
    }
    out.push({ path: `game/images/${sp.file}`, data: blob });
  }
  // 배경/BGM/CG 는 "이름" 기준으로 공유되므로, 파일 1개당 1회만 생성한다.
  // (같은 파일을 여러 장면이 참조 → 800장면이라도 고유 배경 수만큼만 생성/포함)
  // assetId 가 있는 장면을 대표로 우선 선택(실제 생성/업로드본 사용).
  interface AssetPick {
    assetId?: string;
    prompt: string;
    label: string;
  }
  const bgByFile = new Map<string, AssetPick>();
  const bgmByFile = new Map<string, AssetPick>();
  const cgByFile = new Map<string, AssetPick>();
  const consider = (
    map: Map<string, AssetPick>,
    file: string,
    assetId: string | undefined,
    prompt: string,
    label: string,
  ) => {
    const cur = map.get(file);
    if (!cur) map.set(file, { assetId, prompt, label });
    else if (assetId && !cur.assetId) cur.assetId = assetId; // 대표를 실제 에셋 보유 장면으로 승격
  };

  for (const ref of refs) {
    const s = ref.scene;
    consider(
      bgByFile,
      ref.bgFile,
      s.backgroundAssetId,
      [s.background || s.title, ...s.direction].join(', '),
      s.background || s.title,
    );
    ref.cgFiles.forEach((file, j) =>
      consider(cgByFile, file, s.cgAssetIds?.[j], s.cg[j], `CG: ${s.cg[j]}`),
    );
    if (ref.bgmFile) consider(bgmByFile, ref.bgmFile, s.bgmAssetId, s.bgm || s.title, s.bgm || s.title);
  }

  for (const [file, p] of bgByFile) {
    const had = !!p.assetId && !!(await getAsset(p.assetId));
    const bg = await blobForBackground(p.assetId, p.prompt, p.label, project.width, project.height);
    if (!had) placeholders++;
    out.push({ path: `game/images/${file}`, data: bg });
  }
  for (const [file, p] of cgByFile) {
    const up = p.assetId ? await getAsset(p.assetId) : null;
    const cg = up ?? (await canvasImage(p.prompt, p.label, project.width, project.height));
    if (!up) placeholders++;
    out.push({ path: `game/images/${file}`, data: cg });
  }
  for (const [file, p] of bgmByFile) {
    const had = !!p.assetId && !!(await getAsset(p.assetId));
    const bgm = await blobForBgm(p.assetId, p.prompt);
    if (!had) placeholders++;
    out.push({ path: `game/audio/${file}`, data: bgm });
  }

  // 자체 GUI 메뉴 배경(테마별 Canvas 생성) — gui.rpy 가 참조하는 유일한 그림.
  const theme = resolveTheme(project.genre, project.guiTheme);
  // 업로드한 메뉴 배경이 있으면 그것을, 없으면 Canvas 생성본을 쓴다.
  const menuArtFor = async (which: 'main' | 'game'): Promise<Blob> => {
    const upId = project.menuArt?.[which];
    if (upId) {
      const up = await getAsset(upId);
      if (up) return up;
    }
    placeholders += 1;
    return canvasMenuArt(theme, project.width, project.height, which);
  };
  out.push({ path: 'game/gui/main_menu.png', data: await menuArtFor('main') });
  out.push({ path: 'game/gui/game_menu.png', data: await menuArtFor('game') });

  // 버튼 배경 PNG(gui.button_properties 요구) — 제네릭 prefix 세트.
  for (const b of buttonBgAssets(theme)) {
    out.push({ path: `game/gui/button/${b.name}`, data: await solidPng(b.color) });
  }

  // 대사창 그라데이션(투명) 켜짐 → 세로 그라데이션 텍스트박스 PNG 생성(색·불투명도는 사용자 조정값).
  if (project.guiOverrides?.dialogueGradient) {
    const boxColor = project.guiOverrides.dialogueBoxColor ?? '#000000';
    // 기본 0.40 — 그라데이션 하단이 이 정도는 진해야 배경 위 글자 대비가 확보된다(패널 표시값과 일치).
    const maxAlpha = project.guiOverrides.dialogueOpacity ?? 0.4;
    out.push({ path: 'game/gui/textbox.png', data: await textboxGradientPng(boxColor, maxAlpha) });
  }

  // 한글 폰트(나눔고딕, OFL) — Ren'Py 기본 폰트는 한글 글리프가 없다.
  for (const f of await koreanFontFiles()) out.push(f);

  return { files: out, placeholders };
}

export async function buildRenpyZip(project: Project): Promise<ZipResult> {
  const { default: JSZip } = await import('jszip'); // 지연 로딩(초기 번들 경량화)
  const { files, placeholders } = await collectProjectFiles(project);
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const safeName = (project.title || 'visual-novel').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
  return { blob, filename: `${safeName}_renpy.zip`, placeholders };
}

/**
 * 앱에 번들된 폰트 파일들. 실패 시 빈 배열(글자가 □ 로 보일 수 있음).
 * - NanumGothic: 한글·라틴 본문(Ren'Py 기본 폰트는 한글 글리프 없음).
 * - SourceHanSansLite: 일본어(かな·한자) 자막/UI 용. gui.rpy 의 FontGroup 이 일본어 범위만 이 폰트로 폴백한다.
 *   (NanumGothic 은 일본어 글리프가 없어 일본어 자막이 빈칸으로 나오는 문제 대응. 둘 다 SIL OFL 1.1.)
 */
async function koreanFontFiles(): Promise<ProjectFile[]> {
  const base = import.meta.env.BASE_URL || '/';
  try {
    const [font, jpFont, license] = await Promise.all([
      fetch(`${base}fonts/NanumGothic.ttf`),
      fetch(`${base}fonts/SourceHanSansLite.ttf`),
      fetch(`${base}fonts/OFL.txt`),
    ]);
    const files: ProjectFile[] = [];
    if (font.ok) files.push({ path: 'game/fonts/NanumGothic.ttf', data: await font.blob() });
    if (jpFont.ok) files.push({ path: 'game/fonts/SourceHanSansLite.ttf', data: await jpFont.blob() });
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
