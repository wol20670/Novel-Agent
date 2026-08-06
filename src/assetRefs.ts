// 프로젝트가 실제로 참조하는 에셋 id 수집 — 고아 에셋 정리(findOrphanAssets/deleteOrphanAssets)와
// clearGeneratedAssets, 프로젝트 내보내기(project/transfer.ts)가 함께 쓰는 단일 소스(중복 로직 방지).
// diffRemoteOrphans(원격 Storage 스윕)도 여기 있다 — supabase 의존 없는 순수 함수로 둬야 node 환경
// 단위 테스트가 가능해서(collab/assetsGc.ts 는 동적 import 로 supabase-js 를 끌어오므로 제외).

import type { Project, AssetMeta } from './types';

/** collab/assetsGc.ts 의 RemoteAsset 과 동일 shape. 순환 import 방지를 위해 여기서 선언하고
 * assetsGc.ts 가 이 타입을 재사용한다(반대 방향으로 하면 이 파일이 collab/* 를 참조하게 됨 — 금지). */
export interface RemoteAsset {
  id: string;
  size: number;
  createdAt?: number;
}

/** 방금 올라온 에셋이 아직 어떤 프로젝트 JSON 에도 반영되지 않았을 수 있는 유예 기간(7일).
 * autoSave 는 저장마다 600ms 디바운스로 push 하고, 상대방은 아예 안 켜져 있을 수도 있어
 * "지금 스캔했을 때 참조가 안 보인다"가 "고아다"를 뜻하지 않는다 — 업로드 직후 몇 초~몇 분은
 * 흔한 정상 상태다. 7일은 충분히 넉넉하게 잡은 안전 마진(며칠 접속 안 해도 안 지워지게). */
export const DEFAULT_REMOTE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** id(a_<base36 ms>_<n>) 에서 생성 시각(ms)을 복원한다. 형식이 아니면 undefined. */
function parseCreatedAtFromId(id: string): number | undefined {
  const m = /^a_([0-9a-z]+)_/.exec(id);
  if (!m) return undefined;
  const ms = parseInt(m[1], 36);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * 원격 Storage 오브젝트 중 "지워도 안전한" 것만 추린다. 두 안전장치 모두 빠뜨리면 안 된다:
 *  1) referenced 에 있으면 무조건 제외 — 어느 방이든 지금 쓰고 있는 에셋.
 *  2) 생성된 지 graceMs 보다 짧으면 제외 — 방금 올라와 아직 어느 프로젝트 JSON 에도 반영 안 됐을
 *     수 있는 것(위 DEFAULT_REMOTE_GRACE_MS 설명 참고). createdAt 이 없으면 id 에서 복원을 시도하고,
 *     그것도 실패하면 나이를 알 수 없는 것이므로 **삭제하지 않고 보존**한다(fail safe — 애매하면
 *     지우지 않는 쪽으로 기운다. 반대로 하면 "판별 불가"가 조용히 "지워도 됨"이 되는 게 더 위험하다).
 */
export function diffRemoteOrphans(
  remote: RemoteAsset[],
  referenced: Set<string>,
  opts: { now: number; graceMs: number },
): RemoteAsset[] {
  return remote.filter((asset) => {
    if (referenced.has(asset.id)) return false;
    const createdAt = asset.createdAt ?? parseCreatedAtFromId(asset.id);
    if (createdAt === undefined) return false; // 나이 불명 — 보존
    return opts.now - createdAt >= opts.graceMs;
  });
}

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
