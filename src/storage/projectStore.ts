// 프로젝트 메타데이터(텍스트/JSON) — localStorage. 바이너리는 assetStore(IndexedDB) 가 담당.

import type { Project, AssetMeta } from '../types';

const PROJECT_KEY = 'novel-agent:project';
const ASSETS_KEY = 'novel-agent:assets';

// localStorage 한도(약 5MB)의 60% — 이 이상이면 조만간 QuotaExceededError 로 저장이 통째로 막힐 수
// 있다는 조기 경고 기준선(문자 수 기준, UTF-16 이라 바이트 수와는 다르지만 대략적인 가늠으로 충분).
const SIZE_WARN_THRESHOLD = 3_000_000;

/**
 * 프로젝트 메타데이터를 저장한다. ASSETS 를 먼저 쓰고 PROJECT 를 나중에 쓴다 — 프로젝트가 자기보다
 * 오래된 에셋 맵을 참조하는 상태(저장 중간에 실패했을 때)를 피하려고 에셋을 먼저 쓴다.
 * 반환값은 "합산 크기가 경고 기준선을 넘었는지"(nearQuota) — 호출측(store.ts)이 세션당 1회만
 * 경고하는 데 쓴다. 쿼터 초과 자체는 기존과 동일하게 예외를 던진다(호출측이 처리).
 */
export function saveProject(project: Project, assets: Record<string, AssetMeta>): boolean {
  const assetsRaw = JSON.stringify(assets);
  const projectRaw = JSON.stringify(project);
  try {
    localStorage.setItem(ASSETS_KEY, assetsRaw);
    localStorage.setItem(PROJECT_KEY, projectRaw);
  } catch (e) {
    // QuotaExceededError 등 — 대본이 매우 크면 localStorage(약 5MB) 한도를 넘을 수 있다.
    // 바이너리는 IndexedDB 라 보통 텍스트(대본·메타)만으로 한도를 넘는 건 드물지만, 넘으면
    // 조용히 유실되지 않도록 호출 측이 사용자에게 알릴 수 있게 의미 있는 에러로 다시 던진다.
    throw new Error(
      '브라우저 저장 공간(localStorage)이 부족해 자동저장에 실패했습니다. ' +
        '"프로젝트 내보내기"로 파일 백업을 권장합니다. (' + ((e as Error).message || 'QuotaExceeded') + ')',
    );
  }
  return assetsRaw.length + projectRaw.length > SIZE_WARN_THRESHOLD;
}

export function loadProject(): { project: Project; assets: Record<string, AssetMeta> } | null {
  const raw = localStorage.getItem(PROJECT_KEY);
  if (!raw) return null;
  // project/assets 파싱을 독립 try·catch 로 분리한다 — 예전엔 한 try 안이라 assets 키만 손상돼도
  // 멀쩡한 대본까지 통째로 null(무음 폐기)이 됐다. assets 만 깨졌으면 project + 빈 assets 로
  // 복원해 작업 유실을 막고, project 자체가 깨졌을 때만 진짜로 복구 불가(null)로 취급한다.
  let project: Project;
  try {
    project = JSON.parse(raw) as Project;
  } catch (e) {
    console.error('[projectStore] project 파싱 실패 — 복구 불가:', e);
    return null;
  }
  let assets: Record<string, AssetMeta> = {};
  try {
    assets = JSON.parse(localStorage.getItem(ASSETS_KEY) ?? '{}') as Record<string, AssetMeta>;
  } catch (e) {
    console.error('[projectStore] assets 파싱 실패 — project 는 살리고 assets 는 빈 값으로 복원:', e);
  }
  return { project, assets };
}

export function clearProject(): void {
  localStorage.removeItem(PROJECT_KEY);
  localStorage.removeItem(ASSETS_KEY);
}
