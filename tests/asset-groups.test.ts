// 에셋 탭 그룹화(`assetGroups.ts`) — 배경/BGM 그룹의 파생 데이터 계약.
//
// 이 파일이 고정하는 핵심:
//   1. `sceneIds` 와 `sceneLabels` 는 **같은 인덱스가 같은 장면**이다(장면 이동 picker 가 이 정렬에
//      의존한다 — 어긋나면 고른 장면과 다른 장면으로 간다).
//   2. 라벨의 번호는 **`scenes` 배열의 전역 인덱스**다. ⚠️ `include()` 로 거른 뒤의 순번이 아니다 —
//      BGM 그룹은 `hasBgm` 으로 걸러지므로 필터 후 번호를 쓰면 화면의 장면 카드 번호와 어긋난다.
//   3. **같은 제목의 장면이 여럿 있어도 라벨은 서로 구별된다**(파서가 `장면:` 마다 무조건 새 Scene 을
//      만들어 실제로 중복 제목이 생긴다 — 샘플 대본에도 "밤, 상가거리" 가 둘이다).
//   4. 기존 grouping semantics(키 병합·`count` 누적·첫 `repAssetId` 채택)는 그대로다.

import { describe, it, expect } from 'vitest';
import { backgroundKey, bgmKey, hasBgm, type Scene } from '../src/types';
import { groupBy, cgGroups, itemNames } from '../src/components/assetGroups';
import { scene } from './fixtures';

/** 배경 그룹 — AssetsTab 의 호출과 같은 인자(모든 장면 포함). */
const bgGroups = (scenes: Scene[]) =>
  groupBy(scenes, backgroundKey, (s) => s.background ?? '', (s) => s.backgroundAssetId, () => true);

/** BGM 그룹 — AssetsTab 의 호출과 같은 인자(hasBgm 으로 거른다). */
const bgmGroups = (scenes: Scene[]) =>
  groupBy(scenes, bgmKey, (s) => s.bgm ?? '', (s) => s.bgmAssetId, hasBgm);

describe('assetGroups.groupBy — sceneIds/sceneLabels 병렬 계약', () => {
  it('sceneIds 와 sceneLabels 는 길이가 같고 같은 인덱스가 같은 장면을 가리킨다', () => {
    const scenes = [
      scene({ id: 'a', title: '아침', background: '교실' }),
      scene({ id: 'b', title: '점심', background: '복도' }),
      scene({ id: 'c', title: '저녁', background: '교실' }),
    ];
    const g = bgGroups(scenes).find((x) => x.key === '교실')!;
    expect(g.sceneIds).toEqual(['a', 'c']);
    expect(g.sceneLabels).toHaveLength(g.sceneIds.length);
    // 인덱스 0 은 장면 a(#1 아침), 인덱스 1 은 장면 c(#3 저녁) — 짝이 어긋나면 여기서 깨진다.
    expect(g.sceneLabels).toEqual(['#1 아침', '#3 저녁']);
  });

  it('라벨 번호는 scenes 의 전역 인덱스다 — include() 로 거른 뒤의 순번이 아니다', () => {
    // 1·2번 장면엔 BGM 이 없어 BGM 그룹에서 빠진다. 필터 후 순번이면 3번 장면이 "#1" 이 된다.
    const scenes = [
      scene({ id: 'a', title: '무음1' }),
      scene({ id: 'b', title: '무음2' }),
      scene({ id: 'c', title: '밤거리', bgm: 'city_night' }),
      scene({ id: 'd', title: '새벽', bgm: 'city_night' }),
    ];
    const g = bgmGroups(scenes).find((x) => x.key === 'city_night')!;
    expect(g.sceneIds).toEqual(['c', 'd']);
    expect(g.sceneLabels).toEqual(['#3 밤거리', '#4 새벽']);
  });

  it('같은 제목의 장면이 한 그룹에 있어도 라벨이 서로 구별된다', () => {
    // 샘플 대본의 실제 모양: "밤, 상가거리" 두 장면이 같은 배경을 쓴다.
    const scenes = [
      scene({ id: 's1', title: '맑은 아침, 운동장', background: '학교 운동장' }),
      scene({ id: 's2', title: '밤, 상가거리', background: '네온이 빛나는 상가 거리' }),
      scene({ id: 's3', title: '배민규와의 대화', background: '가로등 아래' }),
      scene({ id: 's4', title: '안재현과의 대화', background: '가로등 아래' }),
      scene({ id: 's5', title: '밤, 상가거리', background: '네온이 빛나는 상가 거리' }),
    ];
    const g = bgGroups(scenes).find((x) => x.key === '네온이 빛나는 상가 거리')!;
    expect(g.count).toBe(2);
    expect(g.sceneIds).toEqual(['s2', 's5']);
    expect(g.sceneLabels).toEqual(['#2 밤, 상가거리', '#5 밤, 상가거리']);
    // 제목이 같아도 두 라벨은 달라야 한다 — 이게 깨지면 picker 에서 장면을 고를 수 없다.
    expect(new Set(g.sceneLabels).size).toBe(g.sceneLabels.length);
  });

  it('제목이 비어 있으면 번호만으로 식별한다', () => {
    const scenes = [
      scene({ id: 'a', title: '  ', background: '교실' }),
      scene({ id: 'b', title: '점심', background: '교실' }),
    ];
    const g = bgGroups(scenes).find((x) => x.key === '교실')!;
    expect(g.sceneLabels).toEqual(['#1', '#2 점심']);
  });
});

describe('assetGroups.groupBy — 기존 semantics 보존', () => {
  it('같은 키는 하나로 병합하고 count 를 누적한다', () => {
    const scenes = [
      scene({ id: 'a', title: '1', background: '교실' }),
      scene({ id: 'b', title: '2', background: '복도' }),
      scene({ id: 'c', title: '3', background: '교실' }),
    ];
    const gs = bgGroups(scenes);
    expect(gs.map((g) => g.key)).toEqual(['교실', '복도']); // 첫 등장 순서
    expect(gs.find((g) => g.key === '교실')!.count).toBe(2);
    expect(gs.find((g) => g.key === '복도')!.count).toBe(1);
  });

  it('repTitle 은 첫 장면 제목, repAssetId 는 처음 발견한 에셋 하나를 채택한다', () => {
    const scenes = [
      scene({ id: 'a', title: '첫', background: '교실' }),
      scene({ id: 'b', title: '둘', background: '교실', backgroundAssetId: 'asset-b' }),
      scene({ id: 'c', title: '셋', background: '교실', backgroundAssetId: 'asset-c' }),
    ];
    const g = bgGroups(scenes)[0];
    expect(g.repTitle).toBe('첫');
    expect(g.repAssetId).toBe('asset-b'); // 뒤 값(asset-c)이 덮어쓰지 않는다
  });

  it('이름이 비어 있으면 backgroundKey 는 제목으로 떨어지고 name 은 뒤늦게 채워진다', () => {
    // backgroundKey = (background || title).trim() — 이름 없는 배경은 장면별로 분리된다.
    const scenes = [
      scene({ id: 'a', title: '이름없는 장면' }),
      scene({ id: 'b', title: '다른 장면' }),
    ];
    const gs = bgGroups(scenes);
    expect(gs.map((g) => g.key)).toEqual(['이름없는 장면', '다른 장면']);
    expect(gs.every((g) => g.name === '')).toBe(true);
  });

  it('BGM 그룹은 hasBgm 을 통과한 장면만 담는다(그래서 zero-usage 그룹이 생기지 않는다)', () => {
    const scenes = [
      scene({ id: 'a', title: '무음' }),
      scene({ id: 'b', title: '밤', bgm: 'city_night' }),
    ];
    const gs = bgmGroups(scenes);
    expect(gs).toHaveLength(1);
    expect(gs[0].key).toBe('city_night');
    expect(gs[0].sceneIds).toEqual(['b']);
    expect(gs.every((g) => g.sceneIds.length > 0)).toBe(true);
  });
});

describe('assetGroups — CG/아이템은 이번 변경의 대상이 아니다', () => {
  it('CgGroup 에는 sceneIds/sceneLabels 가 없다(CG 이동은 비목표)', () => {
    const scenes = [
      scene({ id: 'a', title: '1', cg: ['포옹'], cgAssetIds: ['cg-a'] }),
      scene({ id: 'b', title: '2', cg: ['포옹'] }),
    ];
    const gs = cgGroups(scenes);
    expect(gs).toHaveLength(1);
    expect(gs[0]).toEqual({ desc: '포옹', count: 2, repTitle: '1', repAssetId: 'cg-a' });
    expect('sceneIds' in gs[0]).toBe(false);
  });

  it('itemNames 는 등장 순서의 고유 이름 목록이고 닫기 마커는 뺀다', () => {
    const scenes = [
      scene({ id: 'a', title: '1', lines: [{ kind: 'item', name: '편지' }, { kind: 'item', name: '' }] }),
      scene({ id: 'b', title: '2', lines: [{ kind: 'item', name: '반지' }, { kind: 'item', name: '편지' }] }),
    ];
    expect(itemNames(scenes)).toEqual(['편지', '반지']);
  });
});
