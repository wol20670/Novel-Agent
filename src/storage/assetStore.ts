// 에셋 바이너리(PNG/WAV) 저장소 — IndexedDB.
// localStorage 5MB 한계를 피하기 위해 blob 은 전부 여기에 둔다(수백 MB 가능).

const DB_NAME = 'novel-agent';
const STORE = 'assets';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

// 에셋 삭제/초기화 알림 — useAssetUrl 의 objectURL 캐시(src/components/useAssetUrl.ts)가 여기 구독해
// 캐시된 URL 을 무효화한다. 이 파일은 React 를 몰라도 되게 순수 콜백만 노출한다(의존 방향:
// assetStore → 모름, 구독자가 이 파일을 안다). id 목록이면 해당 id 만, 'all' 이면 전체 초기화.
type AssetChangeListener = (ids: string[] | 'all') => void;
const changeListeners = new Set<AssetChangeListener>();

/** 삭제/초기화 알림 구독. 반환된 함수를 호출하면 구독 해제. */
export function subscribeAssetChange(fn: AssetChangeListener): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function notifyAssetChange(ids: string[] | 'all'): void {
  for (const fn of changeListeners) fn(ids);
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// putAsset 은 일부러 notifyAssetChange 를 호출하지 않는다: id 는 store.ts 의 assetId() 가 업로드마다
// 새로 발급해 "이미 화면에 떠 있는 id의 내용이 바뀌는" 경우가 없고, 그 외 putAsset 호출(협업
// 지연 다운로드 캐싱, 프로젝트 zip 가져오기 복원)도 전부 "그 id가 원래 가리키던 내용"을 로컬에
// 채워 넣을 뿐 내용을 바꾸지 않는다 — 즉 id → 내용 매핑은 항상 불변이라 캐시를 건드릴 이유가 없다.
export async function putAsset(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').put(blob, id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function getAsset(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = tx(db, 'readonly').get(id);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  notifyAssetChange([id]);
}

/**
 * 여러 에셋을 단일 readwrite 트랜잭션으로 삭제한다(건당 트랜잭션이던 순차 deleteAsset 루프 대체).
 * IndexedDB 트랜잭션 오픈/커밋 오버헤드가 건마다 들지 않아, 캐릭터·의상 일괄 삭제·프로젝트
 * 초기화·가져오기 시 삭제할 에셋이 많을 때 유리하다. 빈 배열이면 즉시 반환(불필요한 트랜잭션 방지).
 */
export async function deleteAssets(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = tx(db, 'readwrite');
    let pending = ids.length;
    let settled = false;
    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      reject(e);
    };
    for (const id of ids) {
      const r = store.delete(id);
      r.onsuccess = () => {
        pending--;
        if (pending === 0 && !settled) {
          settled = true;
          resolve();
        }
      };
      r.onerror = () => fail(r.error);
    }
  });
  notifyAssetChange(ids);
}

/** 저장된 모든 에셋 id 목록(고아 에셋 정리용 — 참조 집합과 대조해 차집합을 구한다). */
export async function getAllAssetKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = tx(db, 'readonly').getAllKeys();
    r.onsuccess = () => resolve(r.result as string[]);
    r.onerror = () => reject(r.error);
  });
}

export async function clearAssets(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  notifyAssetChange('all');
}

/** 미리보기용 object URL. 사용 후 revoke 는 호출 측 책임. */
export async function getAssetUrl(id: string): Promise<string | undefined> {
  const blob = await getAsset(id);
  return blob ? URL.createObjectURL(blob) : undefined;
}
