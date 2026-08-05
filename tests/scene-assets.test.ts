import { describe, it, expect } from 'vitest';
import { applyAssetToGroup, clearAssetFromGroup } from '../src/project/sceneAssets';
import { backgroundKey, bgmKey } from '../src/renpy/generate';
import type { Scene } from '../src/types';
import { scene } from './fixtures';

describe('applyAssetToGroup', () => {
  it('같은 배경 키를 쓰는 장면 전부에 적용하고 count 를 정확히 센다', () => {
    const scenes: Scene[] = [
      scene({ id: 's1', background: '교실', backgroundAssetId: 'old1' }),
      scene({ id: 's2', background: '교실' }),
      scene({ id: 's3', background: '복도', backgroundAssetId: 'other' }),
    ];
    const key = backgroundKey(scenes[0]);
    // key 를 predicate 에 그대로 되먹이기만 하면 "핸드오버한 조건을 그대로 적용한다"만 증명한다 —
    // 실제로 backgroundKey 가 옳은 문자열(배경 이름)을 냈는지도 고정값으로 핀 해둔다.
    expect(key).toBe('교실');
    const { scenes: next, prevIds, count } = applyAssetToGroup(
      scenes,
      (sc) => backgroundKey(sc) === key,
      'new1',
      (sc) => (sc.backgroundAssetId ? [sc.backgroundAssetId] : []),
      (sc, id) => ({ ...sc, backgroundAssetId: id }),
    );
    expect(count).toBe(2); // '교실' 키를 쓰는 s1, s2 만
    expect(next.find((sc) => sc.id === 's1')?.backgroundAssetId).toBe('new1');
    expect(next.find((sc) => sc.id === 's2')?.backgroundAssetId).toBe('new1');
    expect(next.find((sc) => sc.id === 's3')?.backgroundAssetId).toBe('other'); // 다른 키는 안 건드림
    expect(prevIds).toEqual(['old1']);
  });

  it('prevIds 에서 새로 적용하는 id 자기 자신은 제외한다', () => {
    // 이미 같은 id 가 적용돼 있는 장면(재업로드 경합 등)에서 그 id 가 prevIds 에 섞이면 안 된다.
    const scenes: Scene[] = [
      scene({ id: 's1', bgm: '테마', bgmAssetId: 'same' }),
      scene({ id: 's2', bgm: '테마', bgmAssetId: 'old' }),
    ];
    const key = bgmKey(scenes[0]);
    expect(key).toBe('테마');
    const { prevIds, count } = applyAssetToGroup(
      scenes,
      (sc) => bgmKey(sc) === key,
      'same',
      (sc) => (sc.bgmAssetId ? [sc.bgmAssetId] : []),
      (sc, id) => ({ ...sc, bgmAssetId: id }),
    );
    expect(count).toBe(2);
    expect(prevIds).toEqual(['old']); // 'same' 은 새 id 와 같으므로 제외
  });

  it('BGM 키(bgmKey) 그룹에도 동일하게 동작한다 — bgm 미지정 시 title 로 폴백하고(s.bgm || s.title), bgm 이 있으면 title 과 달라도 bgm 이 이긴다', () => {
    const scenes: Scene[] = [
      scene({ id: 's1', title: '방', bgmAssetId: 'bgmOld' }), // bgm 미지정 → title 이 키
      scene({ id: 's2', title: '거실' }), // 다른 title, bgm 도 없음 → 다른 키('거실') — 매칭 안 됨
      // title 은 s2 와도 다르고(폴백이라면 안 걸릴 조합) bgm 을 's1'과 같은 '방'으로 명시 —
      // bgm 이 있으면 title 이 아니라 bgm 값으로 키가 정해진다는 걸 증명한다.
      scene({ id: 's3', title: '창고', bgm: '방', bgmAssetId: 'bgmOld2' }),
    ];
    const key = bgmKey(scenes[0]);
    expect(key).toBe('방'); // bgm 미지정이므로 title('방')로 폴백
    expect(bgmKey(scenes[1])).toBe('거실');
    expect(bgmKey(scenes[2])).toBe('방'); // title('창고')이 아니라 명시된 bgm('방')이 키
    const { scenes: next, prevIds, count } = applyAssetToGroup(
      scenes,
      (sc) => bgmKey(sc) === key,
      'bgmNew',
      (sc) => (sc.bgmAssetId ? [sc.bgmAssetId] : []),
      (sc, id) => ({ ...sc, bgmAssetId: id }),
    );
    expect(count).toBe(2); // '방' 키를 쓰는 s1(title 폴백), s3(명시 bgm) — s2 는 제외
    expect(next.find((sc) => sc.id === 's1')?.bgmAssetId).toBe('bgmNew');
    expect(next.find((sc) => sc.id === 's3')?.bgmAssetId).toBe('bgmNew');
    expect(next.find((sc) => sc.id === 's2')?.bgmAssetId).toBeUndefined(); // 안 건드림
    expect(prevIds.sort()).toEqual(['bgmOld', 'bgmOld2']);
  });

  it('CG 설명 키 그룹 — 같은 설명을 쓰는 슬롯 전부에 적용한다(한 장면에 슬롯이 여럿이어도)', () => {
    const scenes: Scene[] = [
      scene({ id: 's1', cg: ['컷A', '컷B', '컷A'], cgAssetIds: ['old1', 'other', 'old2'] }),
      scene({ id: 's2', cg: ['컷B'], cgAssetIds: ['other2'] }),
    ];
    const key = '컷A';
    const { scenes: next, prevIds, count } = applyAssetToGroup(
      scenes,
      (sc) => sc.cg.some((d) => d.trim() === key),
      'newCg',
      (sc) =>
        sc.cg.reduce<string[]>((acc, d, i) => {
          const v = sc.cgAssetIds?.[i];
          if (d.trim() === key && v) acc.push(v);
          return acc;
        }, []),
      (sc, id) => {
        const arr = [...(sc.cgAssetIds ?? [])];
        sc.cg.forEach((d, i) => {
          if (d.trim() !== key) return;
          while (arr.length <= i) arr.push('');
          arr[i] = id;
        });
        return { ...sc, cgAssetIds: arr };
      },
    );
    expect(count).toBe(1); // '컷A' 를 포함하는 장면은 s1 뿐
    expect(next.find((sc) => sc.id === 's1')?.cgAssetIds).toEqual(['newCg', 'other', 'newCg']);
    expect(next.find((sc) => sc.id === 's2')?.cgAssetIds).toEqual(['other2']); // 안 건드림
    expect(prevIds.sort()).toEqual(['old1', 'old2']);
  });
});

describe('clearAssetFromGroup', () => {
  it('같은 키 장면 전부의 assetId 를 지우고 prevIds 를 모은다', () => {
    const scenes: Scene[] = [
      scene({ id: 's1', background: '교실', backgroundAssetId: 'a1' }),
      scene({ id: 's2', background: '교실', backgroundAssetId: 'a2' }),
      scene({ id: 's3', background: '복도', backgroundAssetId: 'a3' }),
    ];
    const key = backgroundKey(scenes[0]);
    expect(key).toBe('교실');
    const { scenes: next, prevIds, count } = clearAssetFromGroup(
      scenes,
      (sc) => backgroundKey(sc) === key,
      (sc) => (sc.backgroundAssetId ? [sc.backgroundAssetId] : []),
      (sc) => ({ ...sc, backgroundAssetId: undefined }),
    );
    expect(count).toBe(2);
    expect(next.find((sc) => sc.id === 's1')?.backgroundAssetId).toBeUndefined();
    expect(next.find((sc) => sc.id === 's2')?.backgroundAssetId).toBeUndefined();
    expect(next.find((sc) => sc.id === 's3')?.backgroundAssetId).toBe('a3');
    expect(prevIds.sort()).toEqual(['a1', 'a2']);
  });

  it('아직 적용된 assetId 가 없는 장면은 prevIds 에 포함되지 않는다', () => {
    const scenes: Scene[] = [scene({ id: 's1', bgm: '테마' }), scene({ id: 's2', bgm: '테마', bgmAssetId: 'b1' })];
    const key = bgmKey(scenes[0]);
    expect(key).toBe('테마');
    const { prevIds, count } = clearAssetFromGroup(
      scenes,
      (sc) => bgmKey(sc) === key,
      (sc) => (sc.bgmAssetId ? [sc.bgmAssetId] : []),
      (sc) => ({ ...sc, bgmAssetId: undefined }),
    );
    expect(count).toBe(2); // 두 장면 다 매칭(그룹 소속 자체는 assetId 유무와 무관)
    expect(prevIds).toEqual(['b1']);
  });
});
