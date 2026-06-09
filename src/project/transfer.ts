// 프로젝트 내보내기/가져오기 — 기기 간 작업 이동용 단일 파일(.npproj.zip).
// 메타데이터(project + assets 맵)는 project.json 에, 바이너리(PNG/WAV)는 assets/ 에 담는다.
// base64 JSON 대비 바이너리를 그대로 저장 + DEFLATE 압축이라 용량 효율이 좋다.

import JSZip from 'jszip';
import type { Project, AssetMeta } from '../types';
import { getAsset, putAsset } from '../storage/assetStore';

export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXT = 'npproj.zip';

interface ProjectManifest {
  version: number;
  exportedAt: number;
  app: 'novel-agent';
  project: Project;
  assets: Record<string, AssetMeta>;
}

function extFor(mime: string): string {
  return mime === 'audio/wav' ? 'wav' : 'png';
}

function safeName(title: string): string {
  return (title || 'novel-project').replace(/[^\w가-힣-]+/g, '_').slice(0, 40);
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  assetCount: number;
}

/** 현재 프로젝트 + 모든 에셋 바이너리를 하나의 .npproj.zip 으로 묶는다. */
export async function exportProjectFile(
  project: Project,
  assets: Record<string, AssetMeta>,
): Promise<ExportResult> {
  const zip = new JSZip();
  const manifest: ProjectManifest = {
    version: PROJECT_FILE_VERSION,
    exportedAt: Date.now(),
    app: 'novel-agent',
    project,
    assets,
  };
  zip.file('project.json', JSON.stringify(manifest, null, 2));

  let assetCount = 0;
  for (const [id, meta] of Object.entries(assets)) {
    const blob = await getAsset(id);
    if (!blob) continue; // 메타만 있고 바이너리 유실 → 건너뜀
    zip.file(`assets/${id}.${extFor(meta.mime)}`, blob);
    assetCount++;
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return {
    blob,
    filename: `${safeName(project.title)}.${PROJECT_FILE_EXT}`,
    assetCount,
  };
}

export interface ImportResult {
  project: Project;
  assets: Record<string, AssetMeta>;
  assetCount: number;
}

/** .npproj.zip 을 읽어 에셋 바이너리를 IndexedDB 에 복원하고 메타를 반환한다. */
export async function importProjectFile(file: File | Blob): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestFile = zip.file('project.json');
  if (!manifestFile) {
    throw new Error('올바른 프로젝트 파일이 아닙니다 (project.json 없음).');
  }
  const manifest = JSON.parse(await manifestFile.async('string')) as ProjectManifest;
  if (manifest.app !== 'novel-agent' || !manifest.project) {
    throw new Error('Novel-Agent 프로젝트 파일이 아닙니다.');
  }

  let assetCount = 0;
  for (const [id, meta] of Object.entries(manifest.assets ?? {})) {
    const f = zip.file(`assets/${id}.${extFor(meta.mime)}`);
    if (!f) continue;
    const buf = await f.async('arraybuffer');
    // mime 을 명시해 복원(미리듣기/표시 호환성).
    await putAsset(id, new Blob([buf], { type: meta.mime }));
    assetCount++;
  }

  return { project: manifest.project, assets: manifest.assets ?? {}, assetCount };
}
