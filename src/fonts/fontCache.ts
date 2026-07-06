// 폰트 바이너리 fetch + 캐싱. 기본 폰트(번들)는 public/fonts 에서 바로 읽고, 커스텀 폰트(GCS)는
// 최초 1회만 받아 자체 IndexedDB 에 캐싱한다(이후 오프라인에서도 사용 가능). 프로젝트 에셋
// 저장소(src/storage/assetStore.ts)와는 완전히 별도 DB — "에셋 모두 비우기" 등에 폰트가 딸려
// 지워지지 않게 격리한다.

import { fontById, fontsBaseUrl } from './fontCatalog';

const DB_NAME = 'novel-agent-fonts';
const STORE = 'fonts';
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

async function getCached(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function putCached(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// 동시에 같은 폰트를 여러 번(미리보기+내보내기 등) 요청해도 다운로드는 1회만 나가도록 dedupe.
const inFlight = new Map<string, Promise<Blob | undefined>>();

// 번들(로컬) 폰트는 세션 내내 안 바뀌므로 세션 동안 1회만 fetch 하고 재사용(같은 화면에서
// 미리보기+내보내기가 반복 호출해도 매번 네트워크를 안 타게).
const bundledCache = new Map<string, Promise<Blob | undefined>>();

/**
 * 폰트 id → 실제 폰트 바이너리. 기본(번들) 폰트는 public/fonts 에서, 그 외(GCS 커스텀)는
 * IndexedDB 캐시 → 없으면 GCS 다운로드 후 캐싱. 실패 시 undefined(호출 측이 기본 폰트로 폴백).
 */
export async function ensureFontBlob(id: string | undefined): Promise<Blob | undefined> {
  const preset = fontById(id);

  if (preset.bundled) {
    const cached = bundledCache.get(preset.id);
    if (cached) return cached;
    const p = (async () => {
      try {
        const base = import.meta.env.BASE_URL || '/';
        const res = await fetch(`${base}fonts/${preset.file}`);
        return res.ok ? await res.blob() : undefined;
      } catch {
        return undefined;
      }
    })();
    bundledCache.set(preset.id, p);
    return p;
  }

  const cached = await getCached(preset.id).catch(() => undefined);
  if (cached) return cached;

  const existing = inFlight.get(preset.id);
  if (existing) return existing;

  const base = fontsBaseUrl();
  const p = (async () => {
    if (!base) return undefined; // 커스텀 폰트 기능 비활성(base URL 미설정)
    try {
      const res = await fetch(`${base}/${preset.file}`);
      if (!res.ok) return undefined;
      const blob = await res.blob();
      await putCached(preset.id, blob).catch(() => {
        /* 캐싱 실패해도 이번 요청은 정상 반환 */
      });
      return blob;
    } catch {
      return undefined;
    } finally {
      inFlight.delete(preset.id);
    }
  })();
  inFlight.set(preset.id, p);
  return p;
}

/**
 * 커스텀(GCS) 폰트의 OFL 라이선스 텍스트(<id>.OFL.txt, upload-fonts.mjs 가 폰트와 함께 올림).
 * 기본(번들) 폰트는 public/fonts/OFL.txt 로 이미 커버되므로 호출할 필요 없음(항상 undefined).
 */
export async function ensureFontLicense(id: string): Promise<string | undefined> {
  const preset = fontById(id);
  if (preset.bundled) return undefined;
  const base = fontsBaseUrl();
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}/${preset.id}.OFL.txt`);
    return res.ok ? await res.text() : undefined;
  } catch {
    return undefined;
  }
}

// 이미 document.fonts 에 등록한 id(중복 로드 방지). 값은 loadFontFace 가 반환하는 family 이름.
const registered = new Map<string, string>();

/**
 * 폰트를 FontFace API로 등록하고 CSS font-family 값을 반환한다(미리보기 렌더용).
 * 실패(다운로드 실패 등) 시 undefined — 호출 측은 기본 시스템 폰트로 표시하면 된다.
 */
export async function loadFontFace(id: string | undefined): Promise<string | undefined> {
  const preset = fontById(id);
  const already = registered.get(preset.id);
  if (already) return already;

  const blob = await ensureFontBlob(preset.id);
  if (!blob) return undefined; // 호출 측(미리보기)은 브라우저 기본 폰트로 표시

  try {
    const family = `na-font-${preset.id}`;
    const face = new FontFace(family, await blob.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    registered.set(preset.id, family);
    return family;
  } catch (e) {
    console.warn('[fonts] FontFace 등록 실패:', (e as Error).message);
    return undefined;
  }
}
