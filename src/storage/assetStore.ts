// 에셋 바이너리(PNG/WAV) 저장소 — IndexedDB.
// localStorage 5MB 한계를 피하기 위해 blob 은 전부 여기에 둔다(수백 MB 가능).

const DB_NAME = 'novel-agent';
const STORE = 'assets';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

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
}

export async function clearAssets(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/** 미리보기용 object URL. 사용 후 revoke 는 호출 측 책임. */
export async function getAssetUrl(id: string): Promise<string | undefined> {
  const blob = await getAsset(id);
  return blob ? URL.createObjectURL(blob) : undefined;
}
