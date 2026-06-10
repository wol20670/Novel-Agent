// Ren'Py 프로젝트 폴더에 파일을 "직접" 쓴다 (File System Access API).
// 다운로드→압축풀기→폴더교체 왕복을 없애고, 버튼 클릭 → Ren'Py 에서 Shift+R 만으로 반복 가능.
// Chromium 계열 데스크톱(Chrome/Edge)에서 지원. 핸들은 IndexedDB 에 저장해 새로고침 후에도 재사용.

import type { Project } from '../types';
import { collectProjectFiles } from '../zip/buildZip';

// 표준 TS lib 에 일부 메서드(showDirectoryPicker, queryPermission)가 없어 최소 타입만 정의.
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};

const HANDLE_DB = 'novel-agent-fs';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'project-dir';

let cached: DirHandle | null = null;

export function isFolderSyncSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

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
  if (!handle.queryPermission) return true; // 권한 API 없으면 그대로 시도
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

/** 폴더 선택 다이얼로그를 띄워 연결한다(사용자 제스처 필요). */
export async function connectProjectFolder(): Promise<string> {
  const handle = (await (window as unknown as {
    showDirectoryPicker: (o?: { mode?: string }) => Promise<DirHandle>;
  }).showDirectoryPicker({ mode: 'readwrite' })) as DirHandle;
  cached = handle;
  await persist(handle);
  return handle.name;
}

/** 저장된(또는 캐시된) 연결 폴더 이름. 권한 프롬프트는 띄우지 않는다. */
export async function getConnectedFolderName(): Promise<string | null> {
  if (cached) return cached.name;
  const h = await loadPersisted();
  if (h) {
    cached = h;
    return h.name;
  }
  return null;
}

export async function disconnectFolder(): Promise<void> {
  cached = null;
  await persist(null);
}

async function writeFile(root: DirHandle, path: string, data: string | Blob): Promise<void> {
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

export interface SyncResult {
  count: number;
  placeholders: number;
  folderName: string;
}

/**
 * 현재 프로젝트의 모든 파일을 연결된 폴더에 쓴다.
 * 미연결이면 폴더 선택 다이얼로그를 먼저 띄운다(사용자 제스처에서 호출할 것).
 */
export async function syncProjectToFolder(project: Project): Promise<SyncResult> {
  let handle = cached ?? (await loadPersisted());
  if (!handle) {
    await connectProjectFolder();
    handle = cached!;
  }
  cached = handle;
  if (!(await ensurePermission(handle))) {
    throw new Error('폴더 쓰기 권한이 거부되었습니다.');
  }
  const { files, placeholders } = await collectProjectFiles(project);
  for (const f of files) await writeFile(handle, f.path, f.data);
  return { count: files.length, placeholders, folderName: handle.name };
}
