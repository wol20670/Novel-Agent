import { useEffect, useState } from 'react';
import { getAsset, subscribeAssetChange } from '../storage/assetStore';
import { isCollabReady } from '../collab/supabaseClient';
import { ensureAsset } from '../collab';

// assetId → object URL 공유 캐시(ref-count). 예전엔 마운트마다 getAsset+createObjectURL 을 새로
// 했는데(SceneCard+RightPanel 처럼 같은 배경을 동시에 두 컴포넌트가 물면 blob 을 두 번 읽고 URL도
// 둘 — 낭비이자 revoke 타이밍 관리가 흩어짐), 자산이 ~100개면 탭 전환마다 그 개수만큼 IndexedDB
// 트랜잭션이 순차로 걸려 눈에 보이는 지연이 생긴다. src/fonts/fontCache.ts 와 같은 모양
// (in-flight dedupe + 캐시)을 따르되, 여기는 여러 마운트가 "같은 URL을 동시에 빌려 쓰는" 것이라
// refCount 를 추가로 둔다: 0이 될 때만 실제로 revoke.
interface CacheEntry {
  url: string | null; // 로딩 완료 전엔 null
  refCount: number;
  promise: Promise<string | undefined> | null; // 로딩 중일 때만
  revokeTimer: ReturnType<typeof setTimeout> | null;
}

const cache = new Map<string, CacheEntry>();

// id별 무효화 리스너(현재 그 id를 표시 중인 useAssetUrl 인스턴스들). 삭제/초기화로 캐시가
// invalidate 되면 이걸 통해 마운트된 훅에게 "다시 불러와라"라고 알린다(단순히 캐시만 지우면
// 이미 렌더된 컴포넌트는 stale/revoke된 URL을 계속 들고 있게 됨).
const changeListeners = new Map<string, Set<() => void>>();

function subscribeChange(id: string, fn: () => void): () => void {
  let set = changeListeners.get(id);
  if (!set) {
    set = new Set();
    changeListeners.set(id, set);
  }
  set.add(fn);
  return () => {
    const s = changeListeners.get(id);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) changeListeners.delete(id);
  };
}

function notifyChange(id: string): void {
  const set = changeListeners.get(id);
  if (!set) return;
  for (const fn of set) fn();
}

function clearEntry(id: string, entry: CacheEntry): void {
  if (cache.get(id) !== entry) return;
  if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
  if (entry.url) URL.revokeObjectURL(entry.url);
  cache.delete(id);
}

// revoke 를 즉시 하지 않고 매크로태스크 한 틱 미룬다 — React 18 StrictMode(dev)는 effect를
// mount→unmount→mount 로 동기 두 번 태워, 마지막 release(refCount 0)가 곧바로 다음 mount의
// acquire로 이어진다. 여기서 바로 revoke하면 그 다음 mount가 "아직 살아있는 URL"을 잃고 처음부터
// 다시 읽어야 한다(틀린 동작은 아니지만 낭비). 지연시켜서 재마운트가 타이머를 취소하고 URL을
// 그대로 재사용할 수 있게 한다.
function scheduleRevoke(id: string, entry: CacheEntry): void {
  entry.revokeTimer = setTimeout(() => {
    entry.revokeTimer = null;
    if (entry.refCount > 0) return; // 그 사이 다시 빌려감(안전망 — clearTimeout 이 보통 먼저 막음)
    clearEntry(id, entry);
  }, 0);
}

/**
 * assetId 의 object URL 을 빌린다(refCount++). loader 는 캐시 미스일 때만 호출된다(동시에 여러
 * 마운트가 같은 id를 요청해도 loader 는 1회만 실행 — in-flight 는 promise 공유로 dedupe).
 * 반환된 URL을 다 쓰면 반드시 releaseAssetUrl(id) 로 반납해야 한다.
 */
export function acquireAssetUrl(
  id: string,
  loader: (id: string) => Promise<Blob | undefined>,
): Promise<string | undefined> {
  let entry = cache.get(id);
  if (!entry) {
    entry = { url: null, refCount: 0, promise: null, revokeTimer: null };
    cache.set(id, entry);
  }
  entry.refCount++;
  if (entry.revokeTimer) {
    clearTimeout(entry.revokeTimer);
    entry.revokeTimer = null;
  }
  if (entry.url) return Promise.resolve(entry.url);
  if (entry.promise) return entry.promise;

  const pending = entry; // 클로저 고정(entry 변수 재대입과 무관하게)
  entry.promise = (async () => {
    const blob = await loader(id);
    pending.promise = null;
    if (!blob) {
      // 실패(에셋 없음/네트워크 등) — 이 id로 재시도할 수 있게 캐시 엔트리 자체를 정리.
      clearEntry(id, pending);
      return undefined;
    }
    const url = URL.createObjectURL(blob);
    pending.url = url;
    if (pending.refCount <= 0) {
      // loader 완료 전에 이미 아무도 안 쓰게 됨(빠른 마운트→언마운트) — 바로 정리 예약.
      scheduleRevoke(id, pending);
    }
    return url;
  })();
  return entry.promise;
}

/** acquireAssetUrl 로 빌린 URL을 반납(refCount--). 0이 되면 잠시 후 revoke. */
export function releaseAssetUrl(id: string): void {
  const entry = cache.get(id);
  if (!entry) return; // 이미 무효화/정리된 뒤(예: 로딩 실패) — no-op
  entry.refCount--;
  if (entry.refCount > 0) return;
  if (entry.promise) return; // 아직 로딩 중 — 완료 콜백이 refCount 를 다시 확인해 처리
  scheduleRevoke(id, entry);
}

/** 특정 id의 캐시를 무효화(삭제됨). 마운트된 훅이 있으면 재조회하도록 알린다. */
export function invalidateAssetUrl(id: string): void {
  const entry = cache.get(id);
  if (entry) clearEntry(id, entry);
  notifyChange(id);
}

/** 전체 무효화(clearAssets). 캐시된 URL을 모두 revoke하고, 현재 표시 중인 모든 id에 알린다. */
export function invalidateAllAssetUrls(): void {
  for (const [id, entry] of cache) clearEntry(id, entry);
  for (const id of Array.from(changeListeners.keys())) notifyChange(id);
}

// assetStore 의 삭제/초기화를 캐시 무효화로 연결(모듈 로드 시 1회 구독 — assetStore.ts 는 React를
// 몰라도 되도록 콜백만 노출하고, 여기서 그걸 이 캐시에 연결한다).
subscribeAssetChange((ids) => {
  if (ids === 'all') invalidateAllAssetUrls();
  else for (const id of ids) invalidateAssetUrl(id);
});

/**
 * 로컬(IndexedDB)을 먼저 본다 — 협업이 꺼져 있으면(기본값) 여기서 끝나고 네트워크 경로를 아예
 * 타지 않는다. isCollabReady()는 순수 동기 설정값 체크라 supabase-js 를 끌고 오지 않는다.
 * 무거운 supabase-js 는 getSupabaseClient() 안의 동적 import 한 곳에서만 로드된다(별도 청크) —
 * ensureAsset 자체는 여기서 정적 import 해도 초기 번들에 supabase-js 가 딸려오지 않는다.
 * (여길 동적 import 로 두면 vite 가 "collab/index.ts 는 store.ts·LeftPanel.tsx 가 이미 정적으로
 *  물고 있어 별도 청크로 못 뺀다"는 경고만 내고 실제 분리 효과는 0이다 — 그래서 정적으로 둔다.)
 */
async function loadAssetBlob(id: string): Promise<Blob | undefined> {
  const local = await getAsset(id);
  if (local) return local;
  if (!isCollabReady()) return undefined;
  return ensureAsset(id);
}

/**
 * assetId → object URL. 여러 컴포넌트가 같은 id를 동시에 표시해도 URL은 하나만 만들고
 * refCount로 공유한다(모두 언마운트돼야 revoke). id 변경/언마운트 시 자동 반납.
 * 로컬(IndexedDB)에 없으면 협업이 켜져 있을 때만 Storage 에서 지연 다운로드+캐싱한다(loadAssetBlob).
 */
export function useAssetUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  // 삭제/교체로 캐시가 무효화되면 이 값을 올려 아래 effect를 다시 태운다(재조회 트리거).
  const [gen, setGen] = useState(0);

  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    acquireAssetUrl(id, loadAssetBlob).then((u) => {
      if (!cancelled) setUrl(u);
    });
    const unsubscribe = subscribeChange(id, () => setGen((g) => g + 1));
    return () => {
      cancelled = true;
      releaseAssetUrl(id);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gen은 재조회 트리거 용도일 뿐 값 자체는 안 씀
  }, [id, gen]);

  return url;
}
