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
