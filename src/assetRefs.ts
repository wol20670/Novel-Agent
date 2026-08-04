// 프로젝트가 실제로 참조하는 에셋 id 수집 — 고아 에셋 정리(cleanupOrphanAssets)와
// 기존 clearGeneratedAssets 가 함께 쓰는 단일 소스(중복 로직 방지).

import type { Project } from './types';

/**
 * 프로젝트 전체에서 참조되는 에셋 id 집합을 모은다(배경·BGM·CG·표정·의상·아이템·메뉴아트).
 * opts.includeVoice 가 true 면 대사별 성우 음성(voiceAssetIds)도 포함한다 — 기본은 제외
 * (clearGeneratedAssets 는 업로드 에셋만 비우고 성우 음성은 보존해야 하기 때문).
 */
export function collectReferencedAssetIds(project: Project, opts?: { includeVoice?: boolean }): Set<string> {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) ids.add(id);
  };
  for (const sc of project.scenes) {
    add(sc.backgroundAssetId);
    add(sc.bgmAssetId);
    sc.cgAssetIds?.forEach(add);
    if (opts?.includeVoice) {
      for (const line of sc.lines) {
        if (line.kind === 'dialogue') {
          Object.values(line.voiceAssetIds ?? {}).forEach(add);
        }
      }
    }
  }
  for (const c of project.characters) {
    Object.values(c.expressions).forEach(add);
    c.outfits?.forEach((o) => Object.values(o.expressions).forEach(add));
  }
  Object.values(project.itemAssetIds ?? {}).forEach(add);
  add(project.menuArt?.main);
  add(project.menuArt?.game);
  add(project.mainMenuUi?.logo);
  for (const states of Object.values(project.mainMenuUi?.buttons ?? {})) {
    Object.values(states ?? {}).forEach(add);
  }
  return ids;
}
