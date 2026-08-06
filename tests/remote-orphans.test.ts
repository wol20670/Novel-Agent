import { describe, it, expect } from 'vitest';
import {
  diffRemoteOrphans,
  DEFAULT_REMOTE_GRACE_MS,
  REMOTE_GRACE_OPTIONS,
  type RemoteAsset,
} from '../src/assetRefs';

describe('diffRemoteOrphans', () => {
  const now = 1_700_000_000_000;
  const graceMs = DEFAULT_REMOTE_GRACE_MS;

  it('참조 집합에 있는 id는 제외한다', () => {
    const remote: RemoteAsset[] = [{ id: 'used', size: 10, createdAt: now - graceMs * 2 }];
    const referenced = new Set(['used']);
    expect(diffRemoteOrphans(remote, referenced, { now, graceMs })).toEqual([]);
  });

  it('createdAt 이 유예 기간보다 짧으면(방금 올라온 것) 제외한다', () => {
    const remote: RemoteAsset[] = [{ id: 'fresh', size: 10, createdAt: now - graceMs / 2 }];
    expect(diffRemoteOrphans(remote, new Set(), { now, graceMs })).toEqual([]);
  });

  it('createdAt 이 없어도 id(a_<base36ms>_<n>)에서 나이를 복원해 유예 기간 내면 제외한다', () => {
    const recentMs = now - graceMs / 2;
    const id = `a_${recentMs.toString(36)}_0`;
    const remote: RemoteAsset[] = [{ id, size: 10 }];
    expect(diffRemoteOrphans(remote, new Set(), { now, graceMs })).toEqual([]);
  });

  it('오래되고 참조되지 않은 항목은 고아로 포함한다(createdAt 필드)', () => {
    const remote: RemoteAsset[] = [{ id: 'old', size: 123, createdAt: now - graceMs * 2 }];
    expect(diffRemoteOrphans(remote, new Set(), { now, graceMs })).toEqual(remote);
  });

  it('오래되고 참조되지 않은 항목은 고아로 포함한다(id 에서 복원한 나이)', () => {
    const oldMs = now - graceMs * 2;
    const id = `a_${oldMs.toString(36)}_3`;
    const remote: RemoteAsset[] = [{ id, size: 456 }];
    expect(diffRemoteOrphans(remote, new Set(), { now, graceMs })).toEqual(remote);
  });

  it('나이를 전혀 알 수 없는 항목(createdAt 없음 + id 형식도 아님)은 보존한다(fail safe)', () => {
    const remote: RemoteAsset[] = [{ id: 'not-a-standard-id', size: 10 }];
    expect(diffRemoteOrphans(remote, new Set(), { now, graceMs })).toEqual([]);
  });

  it('빈 입력이면 빈 배열', () => {
    expect(diffRemoteOrphans([], new Set(), { now, graceMs })).toEqual([]);
  });

  it('여러 항목 중 조건을 만족하는 것만 골라낸다', () => {
    const old = { id: 'old', size: 1, createdAt: now - graceMs * 3 };
    const fresh = { id: 'fresh', size: 2, createdAt: now - 1000 };
    const used = { id: 'used', size: 3, createdAt: now - graceMs * 3 };
    const unknown = { id: 'weird-id', size: 4 };
    const remote: RemoteAsset[] = [old, fresh, used, unknown];
    const referenced = new Set(['used']);
    expect(diffRemoteOrphans(remote, referenced, { now, graceMs })).toEqual([old]);
  });

  // ── 유예 기간 선택(REMOTE_GRACE_OPTIONS) ──
  // 기본 7일이 고정이던 시절엔 방금 교체한 이미지가 전부 유예에 걸려 목록이 비어 나왔다.
  // 'all'(0)로 그 필터를 끌 수 있어야 하되, 나이를 모르는 항목 보호는 그대로 남아야 한다.

  it('graceMs 0 이면 방금 올라온 항목도 고아 후보에 포함한다', () => {
    const fresh = { id: 'fresh', size: 2, createdAt: now - 1000 };
    expect(diffRemoteOrphans([fresh], new Set(), { now, graceMs: 0 })).toEqual([fresh]);
  });

  it('graceMs 0 이어도 참조 중인 항목은 여전히 제외한다', () => {
    const used = { id: 'used', size: 3, createdAt: now - 1000 };
    expect(diffRemoteOrphans([used], new Set(['used']), { now, graceMs: 0 })).toEqual([]);
  });

  it('graceMs 0 이어도 나이를 알 수 없는 항목은 여전히 보존한다(fail safe 는 유예와 무관)', () => {
    const unknown = { id: 'weird-id', size: 4 };
    expect(diffRemoteOrphans([unknown], new Set(), { now, graceMs: 0 })).toEqual([]);
  });

  it('REMOTE_GRACE_OPTIONS 의 기간 값이 의도한 밀리초와 일치한다', () => {
    const byId = Object.fromEntries(REMOTE_GRACE_OPTIONS.map((o) => [o.id, o.ms]));
    expect(byId['7d']).toBe(DEFAULT_REMOTE_GRACE_MS);
    expect(byId['7d']).toBe(7 * 24 * 60 * 60 * 1000);
    expect(byId['1d']).toBe(24 * 60 * 60 * 1000);
    expect(byId['all']).toBe(0);
  });
});
