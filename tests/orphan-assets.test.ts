import { describe, it, expect } from 'vitest';
import { diffOrphanIds } from '../src/assetRefs';

describe('diffOrphanIds', () => {
  it('IDB 키 ∪ 메타 키에서 참조 집합을 뺀 나머지가 고아다', () => {
    const referenced = new Set(['bg1', 'bgm1']);
    const idbKeys = ['bg1', 'bgm1', 'orphan1'];
    const metaKeys = ['bg1', 'bgm1', 'orphan2'];
    expect(diffOrphanIds(referenced, idbKeys, metaKeys).sort()).toEqual(['orphan1', 'orphan2']);
  });

  it('IDB 에는 있지만 메타에는 없는 id 도 고아로 잡는다(협업 다운로드 캐시 케이스)', () => {
    // ensureAsset(collab/assetsSync.ts)이 메타 없이 IndexedDB 에만 blob 을 캐싱해두는 경우 —
    // 참조되지 않으면 메타 유무와 무관하게 고아여야 한다.
    const referenced = new Set<string>();
    const idbKeys = ['collab_only'];
    const metaKeys: string[] = [];
    expect(diffOrphanIds(referenced, idbKeys, metaKeys)).toEqual(['collab_only']);
  });

  it('메타에는 있지만 IDB 에는 없는 id(바이너리 유실)도 후보에 오른다', () => {
    const referenced = new Set<string>();
    const idbKeys: string[] = [];
    const metaKeys = ['meta_only'];
    expect(diffOrphanIds(referenced, idbKeys, metaKeys)).toEqual(['meta_only']);
  });

  it('IDB·메타 양쪽에 같은 id 가 있어도 결과는 한 번만 나온다(dedupe)', () => {
    const referenced = new Set<string>();
    const idbKeys = ['dup'];
    const metaKeys = ['dup'];
    expect(diffOrphanIds(referenced, idbKeys, metaKeys)).toEqual(['dup']);
  });

  it('참조 집합에 있으면 IDB·메타 양쪽에 있어도 고아가 아니다', () => {
    const referenced = new Set(['used']);
    const idbKeys = ['used', 'orphan'];
    const metaKeys = ['used'];
    expect(diffOrphanIds(referenced, idbKeys, metaKeys)).toEqual(['orphan']);
  });

  it('빈 입력이면 빈 배열', () => {
    expect(diffOrphanIds(new Set(), [], [])).toEqual([]);
  });

  it('IDB·메타가 전부 비어 있으면 참조 집합과 무관하게 빈 배열', () => {
    expect(diffOrphanIds(new Set(['x']), [], [])).toEqual([]);
  });
});
