// 프로젝트 메타데이터(텍스트/JSON) — localStorage. 바이너리는 assetStore(IndexedDB) 가 담당.

import type { Project, AssetMeta } from '../types';

const PROJECT_KEY = 'novel-agent:project';
const ASSETS_KEY = 'novel-agent:assets';
const APIKEY_KEY = 'novel-agent:openai-key';

export function saveProject(project: Project, assets: Record<string, AssetMeta>): void {
  localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
}

export function loadProject(): { project: Project; assets: Record<string, AssetMeta> } | null {
  const raw = localStorage.getItem(PROJECT_KEY);
  if (!raw) return null;
  try {
    const project = JSON.parse(raw) as Project;
    const assets = JSON.parse(localStorage.getItem(ASSETS_KEY) ?? '{}') as Record<string, AssetMeta>;
    return { project, assets };
  } catch {
    return null;
  }
}

export function saveApiKey(key: string): void {
  if (key) localStorage.setItem(APIKEY_KEY, key);
  else localStorage.removeItem(APIKEY_KEY);
}

export function loadApiKey(): string {
  return localStorage.getItem(APIKEY_KEY) ?? '';
}

export function clearProject(): void {
  localStorage.removeItem(PROJECT_KEY);
  localStorage.removeItem(ASSETS_KEY);
}
