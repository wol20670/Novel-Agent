// 생성된 이미지를 로컬 폴더에 "자동 보관"한다 (File System Access API).
// 목적: AI 로 생성한 이미지는 비용이 들고, 재생성하면 IndexedDB 의 이전 본이 교체·삭제된다.
//       생성 시점마다 사본을 폴더에 쌓아두면 마음에 안 들어 재생성해도 원본이 남는다.
// Ren'Py 프로젝트 폴더쓰기(folderSync)와 별개의 핸들(키)로, 같은 IndexedDB DB 를 공유한다.

const HANDLE_DB = 'novel-agent-fs';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'image-archive-dir';

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};

let cached: DirHandle | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) req.result.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persist(handle: DirHandle | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = db.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE);
    const r = handle ? store.put(handle, HANDLE_KEY) : store.delete(HANDLE_KEY);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function loadPersisted(): Promise<DirHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY);
    r.onsuccess = () => resolve((r.result as DirHandle) ?? null);
    r.onerror = () => reject(r.error);
  });
}

async function ensurePermission(handle: DirHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

/** 보관 폴더 선택 다이얼로그(사용자 제스처 필요). 폴더 이름 반환. */
export async function connectImageArchive(): Promise<string> {
  const handle = (await (window as unknown as {
    showDirectoryPicker: (o?: { mode?: string }) => Promise<DirHandle>;
  }).showDirectoryPicker({ mode: 'readwrite' })) as DirHandle;
  cached = handle;
  await persist(handle);
  return handle.name;
}

/** 저장된(또는 캐시된) 보관 폴더 이름. 권한 프롬프트는 띄우지 않는다. */
export async function getArchiveFolderName(): Promise<string | null> {
  if (cached) return cached.name;
  const h = await loadPersisted();
  if (h) {
    cached = h;
    return h.name;
  }
  return null;
}

export async function disconnectImageArchive(): Promise<void> {
  cached = null;
  await persist(null);
}

/**
 * 보관 폴더 쓰기 권한 상태(프롬프트 없음). 페이지 리로드 후엔 'prompt' 로 떨어질 수 있어,
 * 이 경우 사용자 제스처로 ensureArchivePermission 을 호출해 다시 허용받아야 저장된다.
 */
export async function getArchivePermission(): Promise<'granted' | 'prompt' | 'denied' | 'none'> {
  const handle = cached ?? (await loadPersisted());
  if (!handle) return 'none';
  cached = handle;
  if (!handle.queryPermission) return 'granted';
  return (await handle.queryPermission({ mode: 'readwrite' })) as 'granted' | 'prompt' | 'denied';
}

/** 사용자 제스처에서 호출: 보관 폴더 쓰기 권한을 (재)요청. granted 여부 반환. */
export async function ensureArchivePermission(): Promise<boolean> {
  const handle = cached ?? (await loadPersisted());
  if (!handle) return false;
  cached = handle;
  return ensurePermission(handle);
}

async function writeFile(root: DirHandle, path: string, data: Blob): Promise<void> {
  const parts = path.split('/');
  let dir: FileSystemDirectoryHandle = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true });
  }
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** 파일/폴더명 안전화(윈도우 금지문자 제거, 한글 유지). */
export function safeFileName(s: string): string {
  return (
    (s || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'image'
  );
}

/** YYYYMMDD-HHmmss 타임스탬프(재생성 시 덮어쓰지 않게 파일명에 포함). */
export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * 보관 폴더가 연결돼 있으면 blob 을 그 경로에 쓴다. best-effort —
 * 미연결/권한거부/오류는 false 를 반환하고 절대 throw 하지 않는다(생성 흐름을 막지 않음).
 */
export async function archiveImage(blob: Blob, relativePath: string): Promise<boolean> {
  try {
    const handle = cached ?? (await loadPersisted());
    if (!handle) return false;
    cached = handle;
    if (!(await ensurePermission(handle))) return false;
    await writeFile(handle, relativePath, blob);
    return true;
  } catch {
    return false;
  }
}
