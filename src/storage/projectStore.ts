// 프로젝트 메타데이터(텍스트/JSON) — localStorage. 바이너리는 assetStore(IndexedDB) 가 담당.

import type { Project, AssetMeta } from '../types';

const PROJECT_KEY = 'novel-agent:project';
const ASSETS_KEY = 'novel-agent:assets';
// 이미지 생성 API 키(현재 NovelAI persistent token)를 담는다. 저장 문자열은 과거 OpenAI 시절
// 잔재라 'openai-key' 지만, 기존 사용자 키 호환을 위해 값은 그대로 둔다(이름만 의미상 image key).
const IMAGE_APIKEY_KEY = 'novel-agent:openai-key';

export function saveProject(project: Project, assets: Record<string, AssetMeta>): void {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
    localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
  } catch (e) {
    // QuotaExceededError 등 — 대본이 매우 크면 localStorage(약 5MB) 한도를 넘을 수 있다.
    // 바이너리는 IndexedDB 라 보통 텍스트(대본·메타)만으로 한도를 넘는 건 드물지만, 넘으면
    // 조용히 유실되지 않도록 호출 측이 사용자에게 알릴 수 있게 의미 있는 에러로 다시 던진다.
    throw new Error(
      '브라우저 저장 공간(localStorage)이 부족해 자동저장에 실패했습니다. ' +
        '"프로젝트 내보내기"로 파일 백업을 권장합니다. (' + ((e as Error).message || 'QuotaExceeded') + ')',
    );
  }
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
  if (key) localStorage.setItem(IMAGE_APIKEY_KEY, key);
  else localStorage.removeItem(IMAGE_APIKEY_KEY);
}

export function loadApiKey(): string {
  return localStorage.getItem(IMAGE_APIKEY_KEY) ?? '';
}

export function clearProject(): void {
  localStorage.removeItem(PROJECT_KEY);
  localStorage.removeItem(ASSETS_KEY);
}
