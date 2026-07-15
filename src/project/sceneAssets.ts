// 배경/BGM/CG "그룹 단위 에셋 적용·해제" 순수 함수 — store.ts 하단의 applyBackgroundToGroup/
// applyCgToGroup 을 이관·일반화했다(부수효과 없음 — 단위테스트 대상). 같은 이름(키)을 쓰는 모든
// 장면에 한 번의 업로드를 일괄 적용/해제하는 6개 경로(배경 적용·해제, BGM 적용·해제, CG 그룹
// 적용·해제)가 이 두 함수를 공유한다. 배경/BGM 키는 renpy/generate.ts 의 backgroundKey/bgmKey 를
// 그대로 재사용하고, CG 는 컷 설명 문자열을 키로 쓴다(호출측 store.ts 에서 구성).

import type { Scene } from '../types';

export interface GroupApplyResult {
  scenes: Scene[];
  /** 교체·해제되어 삭제 대상이 된 이전 assetId 목록(중복 제거, 새 id 는 코어에서 제외). */
  prevIds: string[];
  /** matches 에 해당해 실제로 손댄 장면 수(배경 count>1 안내 등에 사용). */
  count: number;
}

/**
 * matches(sc) 인 모든 장면에 patch(sc, id) 로 새 assetId 를 적용한다. getPrevIds 로 각 장면이
 * 그 전에 들고 있던 assetId(들)를 모아 새 id 와 다른 것만 prevIds 로 돌려준다(자기 자신 교체 방지).
 */
export function applyAssetToGroup(
  scenes: Scene[],
  matches: (s: Scene) => boolean,
  id: string,
  getPrevIds: (s: Scene) => string[],
  patch: (s: Scene, id: string) => Scene,
): GroupApplyResult {
  const prevSet = new Set<string>();
  let count = 0;
  const next = scenes.map((sc) => {
    if (!matches(sc)) return sc;
    count++;
    for (const prev of getPrevIds(sc)) {
      if (prev && prev !== id) prevSet.add(prev);
    }
    return patch(sc, id);
  });
  return { scenes: next, prevIds: [...prevSet], count };
}

/** matches(sc) 인 모든 장면의 업로드를 해제(clear)하고, 해제된 이전 assetId(들)를 prevIds 로 모은다. */
export function clearAssetFromGroup(
  scenes: Scene[],
  matches: (s: Scene) => boolean,
  getPrevIds: (s: Scene) => string[],
  clear: (s: Scene) => Scene,
): GroupApplyResult {
  const prevSet = new Set<string>();
  let count = 0;
  const next = scenes.map((sc) => {
    if (!matches(sc)) return sc;
    count++;
    for (const prev of getPrevIds(sc)) {
      if (prev) prevSet.add(prev);
    }
    return clear(sc);
  });
  return { scenes: next, prevIds: [...prevSet], count };
}
