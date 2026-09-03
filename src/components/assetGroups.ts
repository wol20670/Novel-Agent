// 에셋 탭의 이름(의미) 기준 그룹화 — 같은 이름 = 하나의 에셋(업로드 1회, 모든 장면 공유).
//
// JSX 가 없는 순수 파생 로직이라 AssetsTab.tsx 에서 떼어냈다(assetRefs.ts·store/helpers.ts 와 같은
// leaf 모듈 관례) — import 는 Scene 타입 하나뿐이고, 여기서 다른 컴포넌트를 가져오지 말 것(순환).

import type { Scene } from '../types';

export interface Group {
  key: string; // 공유 키 (배경/BGM 이름, CG 설명)
  name: string; // 표시 이름(비었으면 이름 없음)
  repTitle: string; // 대표 장면 제목
  sceneIds: string[];
  /**
   * sceneIds 와 **같은 인덱스가 같은 장면**인 표시 전용 라벨(`#3 밤, 상가거리`).
   *
   * ⚠️ 제목만으로는 안 된다 — 파서(sceneBuilder.startScene)가 `장면:` 마다 무조건 새 Scene 을
   * 만들어 **같은 제목의 장면이 여럿 존재할 수 있고**(샘플에도 "밤, 상가거리" 가 둘), 그러면
   * 이동 picker 에 구별 불가능한 항목이 나란히 뜬다. 그래서 장면 카드에 보이는 번호(전역 순번)를
   * 앞에 붙인다.
   *
   * UI 전용 파생 데이터다 — Project/Scene/store/아카이브 스키마 어디에도 넣지 않는다.
   */
  sceneLabels: string[];
  count: number; // 사용 장면 수
  repAssetId?: string; // 미리보기용 (업로드된 에셋)
}

/** 장면 카드(SceneCard 의 `{index + 1}` 배지)와 같은 번호를 앞에 붙인 식별 라벨. 제목이 비면 번호만. */
function sceneLabel(s: Scene, globalIndex: number): string {
  const t = s.title.trim();
  return t ? `#${globalIndex + 1} ${t}` : `#${globalIndex + 1}`;
}

export function groupBy(scenes: Scene[], keyOf: (s: Scene) => string, nameOf: (s: Scene) => string, assetOf: (s: Scene) => string | undefined, include: (s: Scene) => boolean): Group[] {
  const map = new Map<string, Group>();
  // ⚠️ 인덱스는 include() 로 거른 **뒤의 순번이 아니라** scenes 배열의 전역 인덱스여야 한다 —
  // BGM 그룹은 hasBgm 으로 걸러지므로 필터 후 번호를 쓰면 화면의 장면 카드 번호와 어긋난다.
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!include(s)) continue;
    const key = keyOf(s);
    let g = map.get(key);
    if (!g) {
      g = { key, name: nameOf(s), repTitle: s.title, sceneIds: [], sceneLabels: [], count: 0, repAssetId: undefined };
      map.set(key, g);
    }
    g.sceneIds.push(s.id);
    g.sceneLabels.push(sceneLabel(s, i));
    g.count += 1;
    if (!g.name && nameOf(s)) g.name = nameOf(s);
    if (!g.repAssetId && assetOf(s)) g.repAssetId = assetOf(s);
  }
  return [...map.values()];
}

export interface CgGroup {
  desc: string;
  count: number;
  repTitle: string;
  repAssetId?: string;
}

export function cgGroups(scenes: Scene[]): CgGroup[] {
  const map = new Map<string, CgGroup>();
  for (const s of scenes) {
    s.cg.forEach((desc, i) => {
      const key = desc.trim();
      let g = map.get(key);
      if (!g) {
        g = { desc, count: 0, repTitle: s.title, repAssetId: undefined };
        map.set(key, g);
      }
      g.count += 1;
      const aid = s.cgAssetIds?.[i] || undefined;
      if (!g.repAssetId && aid) g.repAssetId = aid;
    });
  }
  return [...map.values()];
}

/** 대본에서 쓰인 고유 아이템 이름(등장 순서, 빈 이름=닫기 마커 제외). */
export function itemNames(scenes: Scene[]): string[] {
  const seen = new Set<string>();
  for (const sc of scenes)
    for (const l of sc.lines) if (l.kind === 'item' && l.name.trim()) seen.add(l.name.trim());
  return [...seen];
}
