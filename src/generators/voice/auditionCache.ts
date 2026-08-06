// 보이스 오디션(캐릭터 프리셋 미리듣기) 오디오 캐시 — 별도 IndexedDB DB. 프로젝트 에셋 저장소
// (src/storage/assetStore.ts, DB 'novel-agent')와 완전히 분리한다: 고아 에셋 정리
// (store.ts findOrphanAssets/deleteOrphanAssets)가 프로젝트에서 참조 안 되는 IDB 키를 전부 지우는데, 오디션
// 클립은 프로젝트에 저장되지 않는 "미리듣기 전용" 캐시라 그 정리 대상에 걸리면 크레딧 써서
// 만든 미리듣기가 조용히 사라진다(src/fonts/fontCache.ts 와 같은 격리 이유).

const DB_NAME = 'novel-agent-audition';
const STORE = 'clips';
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

/**
 * 같은 설정 조합(보이스·모델·감정·강도 + 텍스트)이면 재생성 없이 캐시를 재생한다(크레딧 0).
 * ⚠️ tempo/pitch/volume 은 캐시 키에 포함하지 않는다(마이그레이션 플랜 명시 — 감정 프리셋 위주
 * 오디션이 목적). 슬라이더만 바꿔서 다시 들으면 캐시가 이전 설정 그대로 재생될 수 있음에 유의.
 */
export function clipKey(params: { voiceId: string; model: string; emotion: string; intensity: number; text: string }): string {
  const { voiceId, model, emotion, intensity, text } = params;
  return [voiceId, model, emotion, intensity, text].join('|');
}

export async function getClip(key: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function putClip(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
