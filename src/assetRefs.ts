// 프로젝트가 실제로 참조하는 에셋 id 수집 — 고아 에셋 정리(findOrphanAssets/deleteOrphanAssets)와
// clearGeneratedAssets, 프로젝트 내보내기(project/transfer.ts)가 함께 쓰는 단일 소스(중복 로직 방지).

import type { Project, AssetMeta } from './types';

/**
 * 프로젝트 전체에서 참조되는 에셋 id 집합을 모은다(배경·BGM·CG·표정·의상·아이템·메뉴아트).
 * opts.includeVoice 가 true 면 대사별 성우 음성(voiceAssetIds)도 포함한다 — 기본은 제외
 * (clearGeneratedAssets 는 업로드 에셋만 비우고 성우 음성은 보존해야 하기 때문).
 * ⚠️ 필드를 추가/변경하면 이 파일의 collectReferencedAssetKinds 도 반드시 같이 고칠 것 — 두 함수가
 * 프로젝트를 훑는 필드 목록이 구조적으로 나란해야 한다(하나만 갱신하면 고아 판정은 맞는데 내보내기
 * kind 복원이 어긋나는, 혹은 그 반대인 조용한 버그가 생긴다).
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

/**
 * store.ts 의 cleanupOrphanAssets(현 findOrphanAssets)에 인라인돼 있던 계산을 순수 함수로 뺀 것
 * (테스트 가능하도록 — store 액션은 IndexedDB/zustand 를 끼고 있어 단위 테스트가 어렵다).
 * "IDB 에 실제 저장된 blob 키"와 "메타 맵의 키"는 서로 어긋날 수 있다(메타만 있고 바이너리
 * 유실 / 바이너리는 있는데 메타 없음 — ensureAsset 이 협업 다운로드를 캐싱할 때가 후자다) — 그래서
 * 합집합을 구한 뒤 참조 집합을 뺀다.
 */
export function diffOrphanIds(referenced: Set<string>, idbKeys: string[], metaKeys: string[]): string[] {
  return [...new Set([...idbKeys, ...metaKeys])].filter((id) => !referenced.has(id));
}

/**
 * 참조 id → 그 id 가 쓰이는 자리에서 유추한 kind. collectReferencedAssetIds 와 훑는 필드가
 * 하나하나 대응하도록 구조를 나란히 유지한다(위 경고 주석 참고). 메타가 없는 blob(협업 다운로드
 * 캐시 등)의 kind 를 내보내기 시점에 복원하는 용도 — AssetMeta 자체가 없으니 kind 를 어딘가에서
 * 유추해야 하고, "그 id 가 프로젝트의 어느 필드에 꽂혀 있는가"가 유일한 단서다.
 * 메뉴 아트(menuArt/mainMenuUi 로고·버튼)는 AssetKind 에 전용 항목이 없어 'cg'(정지 이미지)로
 * 매핑한다 — 새 kind 를 추가하는 대신 기존 값 중 의미가 가장 가까운 쪽을 재사용.
 */
export function collectReferencedAssetKinds(project: Project): Map<string, AssetMeta['kind']> {
  const kinds = new Map<string, AssetMeta['kind']>();
  const add = (id: string | undefined, kind: AssetMeta['kind']) => {
    if (id) kinds.set(id, kind);
  };
  for (const sc of project.scenes) {
    add(sc.backgroundAssetId, 'background');
    add(sc.bgmAssetId, 'bgm');
    sc.cgAssetIds?.forEach((id) => add(id, 'cg'));
    for (const line of sc.lines) {
      if (line.kind === 'dialogue') {
        Object.values(line.voiceAssetIds ?? {}).forEach((id) => add(id, 'voice'));
      }
    }
  }
  for (const c of project.characters) {
    Object.values(c.expressions).forEach((id) => add(id, 'sprite'));
    c.outfits?.forEach((o) => Object.values(o.expressions).forEach((id) => add(id, 'sprite')));
  }
  Object.values(project.itemAssetIds ?? {}).forEach((id) => add(id, 'item'));
  add(project.menuArt?.main, 'cg');
  add(project.menuArt?.game, 'cg');
  add(project.mainMenuUi?.logo, 'cg');
  for (const states of Object.values(project.mainMenuUi?.buttons ?? {})) {
    Object.values(states ?? {}).forEach((id) => add(id, 'cg'));
  }
  return kinds;
}
