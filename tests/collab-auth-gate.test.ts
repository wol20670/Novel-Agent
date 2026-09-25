// S1-B — Auth gate / collab runtime 경계 테스트.
//
// 설계 원칙(범위 밖으로 새지 않기 위한 것):
//  · **DOM test stack 을 새로 넣지 않는다** — jsdom/@testing-library 없이 module·store 레벨에서만 본다.
//    localStorage 는 기존 테스트들과 같은 MemoryStorage 폴리필을 쓴다(tests/project-store.test.ts).
//  · Supabase SDK 를 통째로 mock 해서 "remote 요청이 실제로 나갔는가"를 **호출 카운터**로 센다.
//    fetch spy 만으로 WebSocket 0 을 주장하지 않는다 — 채널 생성 경로 도달 자체를 구조적으로 검증한다.
//  · activationId/generation/queue 같은 후속 Phase 시스템을 여기서 만들지 않는다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── localStorage 폴리필(기존 테스트 관용구 재사용) ──
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/**
 * 블록·라인 주석 제거. 정적 불변식 검사에서 쓴다 —
 * ⚠️ 이게 없으면 "이런 패턴은 금지"라고 적어둔 안내 **주석 자체**가 위반으로 잡힌다(자기모순).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// ── 최소 in-memory IndexedDB (assetStore·folderSync 가 부팅 경로에서 건드린다) ──
// ⚠️ DOM test stack 이 아니다 — open/transaction/objectStore/get/put/delete 만 흉내내는 페이크다.
function fakeIndexedDB() {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();
  const req = <T,>(value: T) => {
    const r: Record<string, unknown> = { result: value, error: null };
    setTimeout(() => (r.onsuccess as (() => void) | undefined)?.(), 0);
    return r;
  };
  const makeStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      get: (k: IDBValidKey) => req(m.get(k)),
      put: (v: unknown, k: IDBValidKey) => { m.set(k, v); return req(undefined); },
      delete: (k: IDBValidKey) => { m.delete(k); return req(undefined); },
    };
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: (n: string) => makeStore(n),
    transaction: (n: string) => ({ objectStore: () => makeStore(n) }),
  };
  return { open: () => req(db) };
}

// ── Supabase SDK mock ──────────────────────────────────────────────────────
type AuthCb = (event: string, session: unknown) => void;

interface Harness {
  authCbs: AuthCb[];
  subscribeCount: number;
  unsubscribeCount: number;
  session: { user: { id: string; email: string | null } } | null;
  signInError: { message: string } | null;
  signOutError: { message: string } | null;
  updateUserError: { message: string } | null;
  signOutOpts: unknown;
  /** 원격 요청 카운터 — 하나라도 0이 아니면 "네트워크가 나갔다"는 뜻이다. */
  calls: Record<string, number>;
  /** storage.list 가 돌려줄 페이지들(pagination 테스트용). */
  listPages: Array<{ name: string; metadata: { size: number }; created_at: string }[]>;
  listHook: ((page: number) => void) | null;
  removeHook: ((chunk: string[]) => void) | null;
  uploadHook: (() => void) | null;
  downloadHook: (() => void) | null;
  pullResult: { data: unknown; error: { message: string } | null };
  pullHook: (() => void) | null;
  projectsSelectResult: { data: unknown; error: { message: string } | null };
  projectsSelectHook: (() => void) | null;
  /** 마지막으로 만든 채널의 콜백들 — gap 테스트에서 강제로 발화시킨다. */
  channelHandlers: { presenceSync: (() => void) | null; postgres: ((p: unknown) => void) | null; status: ((s: string) => void) | null };
  trackCount: number;
  /** 채널 .subscribe() 가 호출되는 순간 실행 — await 경계를 결정적으로 재현한다. */
  channelSubscribeHook: ((nth: number) => void) | null;
  /** signInWithPassword 가 성공하기 직전 실행 — SDK 가 그 사이 SIGNED_IN 을 쏘는 상황을 재현한다. */
  signInHook: (() => void) | null;
}

const h: Harness = {} as Harness;

function resetHarness(): void {
  h.authCbs = [];
  h.subscribeCount = 0;
  h.unsubscribeCount = 0;
  h.session = null;
  h.signInError = null;
  h.signOutError = null;
  h.updateUserError = null;
  h.signOutOpts = undefined;
  h.calls = {
    createClient: 0,
    from: 0,
    upsert: 0,
    pull: 0,
    projectsSelect: 0,
    list: 0,
    remove: 0,
    upload: 0,
    download: 0,
    channel: 0,
    removeAllChannels: 0,
    removeChannel: 0,
  };
  h.listPages = [];
  h.listHook = null;
  h.removeHook = null;
  h.uploadHook = null;
  h.downloadHook = null;
  h.pullResult = { data: null, error: null };
  h.pullHook = null;
  h.projectsSelectResult = { data: [], error: null };
  h.projectsSelectHook = null;
  h.channelHandlers = { presenceSync: null, postgres: null, status: null };
  h.trackCount = 0;
  h.channelSubscribeHook = null;
  h.signInHook = null;
}

/** 원격 요청 카운터 합계 — "network 0" 단언에 쓴다. */
function remoteCallTotal(): number {
  const { createClient: _c, ...rest } = h.calls;
  return Object.values(rest).reduce((a, b) => a + b, 0);
}

vi.mock('@supabase/supabase-js', () => {
  const makeChannel = () => {
    const ch = {
      on(kind: string, _arg2: unknown, arg3?: unknown) {
        if (kind === 'presence') h.channelHandlers.presenceSync = arg3 as () => void;
        else h.channelHandlers.postgres = arg3 as (p: unknown) => void;
        return ch;
      },
      subscribe(cb?: (s: string) => void) {
        if (cb) h.channelHandlers.status = cb;
        h.channelSubscribeHook?.(h.calls.channel);
        return ch;
      },
      presenceState: () => ({}),
      track: async () => {
        h.trackCount += 1;
      },
    };
    return ch;
  };

  const client = {
    auth: {
      onAuthStateChange(cb: AuthCb) {
        h.authCbs.push(cb);
        h.subscribeCount += 1;
        return {
          data: {
            subscription: {
              unsubscribe() {
                h.unsubscribeCount += 1;
              },
            },
          },
        };
      },
      async getSession() {
        return { data: { session: h.session }, error: null };
      },
      async signInWithPassword() {
        if (!h.signInError) h.signInHook?.();
        return { error: h.signInError };
      },
      async signOut(opts: unknown) {
        h.signOutOpts = opts;
        return { error: h.signOutError };
      },
      async updateUser() {
        return { error: h.updateUserError };
      },
    },
    from(_table: string) {
      h.calls.from += 1;
      const selectResult = {
        eq: () => ({
          async maybeSingle() {
            h.calls.pull += 1;
            h.pullHook?.();
            return h.pullResult;
          },
        }),
        then(res: (v: unknown) => unknown) {
          h.calls.projectsSelect += 1;
          h.projectsSelectHook?.();
          return Promise.resolve(h.projectsSelectResult).then(res);
        },
      };
      return {
        async upsert() {
          h.calls.upsert += 1;
          return { error: null };
        },
        select: () => selectResult,
      };
    },
    storage: {
      from() {
        return {
          async list() {
            const page = h.calls.list;
            h.calls.list += 1;
            h.listHook?.(page);
            return { data: h.listPages[page] ?? [], error: null };
          },
          async remove(chunk: string[]) {
            h.calls.remove += 1;
            h.removeHook?.(chunk);
            return { data: chunk.map((name) => ({ name })), error: null };
          },
          async upload() {
            h.calls.upload += 1;
            h.uploadHook?.();
            return { error: null };
          },
          async download() {
            h.calls.download += 1;
            h.downloadHook?.();
            return { data: new Blob(['x']), error: null };
          },
        };
      },
    },
    channel() {
      h.calls.channel += 1;
      return makeChannel();
    },
    removeAllChannels() {
      h.calls.removeAllChannels += 1;
    },
    removeChannel() {
      h.calls.removeChannel += 1;
    },
  };

  return {
    createClient: () => {
      h.calls.createClient += 1;
      return client;
    },
  };
});

// ── window 스텁(callback URL 판정·sanitize 전용 — DOM stack 이 아니다) ──
function stubWindow(url: { pathname?: string; search?: string; hash?: string }): { replaced: string[] } {
  const replaced: string[] = [];
  const loc = { pathname: url.pathname ?? '/', search: url.search ?? '', hash: url.hash ?? '' };
  vi.stubGlobal('window', {
    location: loc,
    history: {
      replaceState(_s: unknown, _t: unknown, next: string) {
        replaced.push(next);
        const [p, rest = ''] = next.split('#');
        const [path, qs = ''] = p.split('?');
        loc.pathname = path;
        loc.search = qs ? `?${qs}` : '';
        loc.hash = rest ? `#${rest}` : '';
      },
    },
  });
  return { replaced };
}

const ENV = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
function stubEnv(present = true): void {
  vi.stubEnv('VITE_SUPABASE_URL', present ? ENV.url : '');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', present ? ENV.key : '');
}

/** setTimeout(…, 0) 로 미룬 후속 작업(Realtime teardown·재접속)을 흘려보낸다. */
const flushTimers = async (): Promise<void> => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

// 모듈 상태(collab config·auth singleton)를 매 테스트마다 새로 만든다.
async function freshModules() {
  vi.resetModules();
  const supa = await import('../src/collab/supabaseClient');
  const collab = await import('../src/collab');
  const auth = await import('../src/collab/auth');
  const sync = await import('../src/collab/sync');
  const presence = await import('../src/collab/presence');
  const assetsSync = await import('../src/collab/assetsSync');
  const assetsGc = await import('../src/collab/assetsGc');
  return { supa, collab, auth, sync, presence, assetsSync, assetsGc };
}

/** collab 설정을 "완결된" 상태로 만든다(intent + 방 코드). */
function seedCollabIntent(room = 'abc123'): void {
  localStorage.setItem('na_collab_room', room);
  localStorage.setItem('na_collab_name', '나');
  localStorage.setItem('na_collab_enabled', '1');
}

const noopHooks = () => ({
  getProject: () => ({ scenes: [] }) as never,
  applyRemoteProject: () => {},
  setStatus: () => {},
  setPeers: () => {},
  getPresenceSelf: () => ({ name: '나', activeTab: 'scenes', selectedSceneId: null }),
  hasPendingLocalSave: () => false,
});

beforeEach(() => {
  resetHarness();
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('indexedDB', fakeIndexedDB());
  stubWindow({});
  stubEnv(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ① client 분리 / runtime gate', () => {
  it('#1 base client 는 방 코드가 없어도 만들어진다(Auth 는 방과 무관)', async () => {
    const { supa } = await freshModules();
    supa.loadCollabConfig(); // room '' · intent false
    expect(supa.isCollabReady()).toBe(false);
    await expect(supa.getSupabaseClient()).resolves.not.toBeNull();
  });

  it('#1b env 가 없으면 base client 도 만들지 않는다(동적 import 자체가 없다)', async () => {
    stubEnv(false);
    const { supa } = await freshModules();
    await expect(supa.getSupabaseClient()).resolves.toBeNull();
    expect(h.calls.createClient).toBe(0);
  });

  it('#2 inactive 면 getCollabClient() 는 null 이다', async () => {
    const { supa } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    expect(supa.isCollabReady()).toBe(true); // 설정은 완결 — 그래도
    expect(supa.isCollabActive()).toBe(false); // runtime 은 닫혀 있다
    await expect(supa.getCollabClient()).resolves.toBeNull();
  });

  it('#26 authenticated 여도 방 코드가 없으면 활성화되지 않는다', async () => {
    const { supa, collab } = await freshModules();
    localStorage.setItem('na_collab_enabled', '1'); // intent 만 있고 room 없음
    supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    const ok = await collab.enableCollabIfAuthenticated(noopHooks());
    expect(ok).toBe(false);
    expect(supa.isCollabActive()).toBe(false);
    expect(remoteCallTotal()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ② local-only / signed-out 에서 remote 호출 0', () => {
  // ⚠️ env PRESENT + persisted intent '1' + valid room 인 조건에서 본다.
  //    env 없는 상태의 0 은 env gate 만 검증한 것이라 불충분하다.
  it('#3 remote 함수 전수(Presence 포함)를 불러도 네트워크가 나가지 않는다', async () => {
    const { supa, sync, presence, assetsSync, assetsGc } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    localStorage.setItem('na_local_only', '1');
    expect(supa.isCollabReady()).toBe(true);
    expect(supa.isCollabActive()).toBe(false);

    await sync.pushProject({ scenes: [] } as never);
    await expect(sync.pullProjectOnce()).resolves.toBeNull();
    const unsubP = await sync.subscribeProject(() => {});
    const unsubPr = await presence.startPresence({ name: 'n', activeTab: 't', selectedSceneId: null }, () => {});
    await assetsSync.pushAsset('a_1', new Blob(['x']));
    await expect(assetsSync.ensureAsset('a_1')).resolves.toBeUndefined();
    const scan = await assetsGc.listRemoteAssets();
    const refs = await assetsGc.collectRemoteReferencedIds();
    const rm = await assetsGc.removeRemoteAssets(['a_1']);

    // ① 구조적: 채널 생성 경로에 도달하지 않았고 no-op unsubscribe 를 받았다.
    expect(h.calls.channel).toBe(0);
    expect(typeof unsubP).toBe('function');
    expect(typeof unsubPr).toBe('function');
    // ② 어떤 원격 요청도 나가지 않았다.
    expect(remoteCallTotal()).toBe(0);
    // ③ inactive 로 **시작**한 GC 는 실패가 아니라 빈 결과다(fail-closed 계약 유지).
    expect(scan).toEqual({ assets: [], failed: false });
    expect(refs.failed).toBe(false);
    expect(rm).toEqual({ removed: 0, failed: ['a_1'] });
  });

  it('#4 persisted intent + 방 코드가 있어도 hydrate 는 자동 접속하지 않는다', async () => {
    seedCollabIntent();
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const { isCollabActive } = await import('../src/collab/supabaseClient');
    useStore.getState().hydrate();
    await flushTimers();
    expect(isCollabActive()).toBe(false);
    expect(useStore.getState().collabEnabled).toBe(false); // mirror 는 intent 복사가 아니다
    expect(remoteCallTotal()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ③ auth bypass 회귀', () => {
  it('#11 signed-out 에서 setCollabConfig({enabled:true}) 를 직접 불러도 켜지지 않는다', async () => {
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const { isCollabActive, getCollabClient } = await import('../src/collab/supabaseClient');
    h.session = null; // 로그인 안 됨

    await useStore.getState().setCollabConfig({ room: 'abc123', displayName: '나', enabled: true });

    expect(isCollabActive()).toBe(false);
    expect(useStore.getState().collabEnabled).toBe(false);
    await expect(getCollabClient()).resolves.toBeNull();
    expect(remoteCallTotal()).toBe(0);
    // persisted intent 는 기록돼도 무방하다(runtime truth 가 아니다).
    expect(localStorage.getItem('na_collab_enabled')).toBe('1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ④ enable 게이트 idempotency / race', () => {
  it('#25 동일 세션에서 동시·연속 호출해도 startCollab 은 한 번만 돈다', async () => {
    const { supa, collab } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await collab.bootstrapAuth(() => {}); // lastUserId 를 심는다

    const [a, b] = await Promise.all([
      collab.enableCollabIfAuthenticated(noopHooks()),
      collab.enableCollabIfAuthenticated(noopHooks()),
    ]);
    const c = await collab.enableCollabIfAuthenticated(noopHooks());

    expect([a, b, c]).toEqual([true, true, true]);
    expect(supa.isCollabActive()).toBe(true);
    // 채널은 project·presence 각 1개씩만 — 두 번 돌았다면 4개가 된다.
    expect(h.calls.channel).toBe(2);
  });

  it('#24 getAuthSession await 중 로그아웃되면 다시 활성화되지 않는다', async () => {
    const { supa, collab } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await collab.bootstrapAuth(() => {});

    // getSession 이 resolve 되기 직전에 SIGNED_OUT 이 끼어든 상황을 재현한다.
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null)); // lastUserId → null
    const ok = await collab.enableCollabIfAuthenticated(noopHooks());

    expect(ok).toBe(false);
    expect(supa.isCollabActive()).toBe(false);
    expect(h.calls.channel).toBe(0); // startCollab 미진입
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑤ auth wrapper 실패 semantics', () => {
  it('#7 로그아웃은 scope:local 로만 한다(다른 기기 세션 유지)', async () => {
    const { auth } = await freshModules();
    await auth.signOutLocal();
    expect(h.signOutOpts).toEqual({ scope: 'local' });
  });

  it('#27 signOut 이 error 를 돌려주면 wrapper 가 reject 한다', async () => {
    const { auth } = await freshModules();
    h.signOutError = { message: '로그아웃 실패' };
    await expect(auth.signOutLocal()).rejects.toThrow('로그아웃 실패');
  });

  it('#28 updateUser 가 error 면 wrapper 가 reject 한다', async () => {
    const { auth } = await freshModules();
    h.updateUserError = { message: '비밀번호 실패' };
    await expect(auth.updatePassword('secret123')).rejects.toThrow('비밀번호 실패');
  });

  it('signIn 실패도 throw 한다', async () => {
    const { auth } = await freshModules();
    h.signInError = { message: '자격 증명 오류' };
    await expect(auth.signInWithPassword('a@b.c', 'x')).rejects.toThrow('자격 증명 오류');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑥ auth bootstrap idempotency', () => {
  it('#14 bootstrapAuth 를 두 번 불러도 listener 는 하나다', async () => {
    const { auth } = await freshModules();
    const seen: string[] = [];
    await Promise.all([
      auth.bootstrapAuth((e) => seen.push(e.kind)),
      auth.bootstrapAuth((e) => seen.push(e.kind)),
    ]);
    await auth.bootstrapAuth((e) => seen.push(e.kind));
    expect(h.subscribeCount).toBe(1);
  });

  it('#15 같은 세션의 TOKEN_REFRESHED / USER_UPDATED 는 event 를 재발행하지 않는다', async () => {
    const { auth } = await freshModules();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    const kinds: string[] = [];
    await auth.bootstrapAuth((e) => kinds.push(e.kind));
    const before = kinds.length;
    const sess = { user: { id: 'u1', email: 'a@b.c' } };
    h.authCbs.forEach((cb) => cb('TOKEN_REFRESHED', sess));
    h.authCbs.forEach((cb) => cb('USER_UPDATED', sess));
    expect(kinds.length).toBe(before); // 추가 발행 0
  });

  it('실제 SIGNED_OUT 은 lastUserId 가 이미 null 이어도 매번 발행한다(cleanup 생략 금지)', async () => {
    const { auth } = await freshModules();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    const kinds: string[] = [];
    await auth.bootstrapAuth((e) => kinds.push(e.kind));
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    expect(kinds.filter((k) => k === 'signed-out').length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑦ transient failure 에서 runtime 유지', () => {
  it('#13 초기 pull 실패는 error 표시만 하고 active 를 닫지 않는다(재시도 성질 보존)', async () => {
    const { supa, collab } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await collab.bootstrapAuth(() => {});
    h.pullResult = { data: null, error: { message: '네트워크 오류' } };

    const statuses: string[] = [];
    const ok = await collab.enableCollabIfAuthenticated({ ...noopHooks(), setStatus: (s) => statuses.push(s) });

    expect(ok).toBe(true);
    expect(statuses).toContain('error');
    expect(supa.isCollabActive()).toBe(true); // ⚠️ 닫지 않는다
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑧ SIGNED_OUT 경계 (store lifecycle owner)', () => {
  async function activeStore() {
    seedCollabIntent();
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const supa = await import('../src/collab/supabaseClient');
    const { saveProject } = await import('../src/storage/projectStore');
    const { emptyProject } = await import('../src/types');
    saveProject({ ...emptyProject(), title: '보존될 프로젝트' }, {});
    useStore.getState().hydrate();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await useStore.getState().bootAuth();
    await flushTimers();
    return { useStore, supa };
  }

  it('#12 · #23 콜백 반환 직후 gate 는 이미 닫히고, teardown 만 다음 tick 으로 미뤄진다', async () => {
    const { useStore, supa } = await activeStore();
    expect(supa.isCollabActive()).toBe(true);
    const removeBefore = h.calls.removeAllChannels;

    // SIGNED_OUT 을 콜백 스택에서 동기 발화 — 반환 직후 상태를 본다.
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));

    expect(supa.isCollabActive()).toBe(false); // 동기적으로 닫혔다
    const s = useStore.getState();
    expect(s.collabEnabled).toBe(false);
    expect(s.collabStatus).toBe('off');
    expect(s.collabPeers).toEqual([]);
    expect(s.authPhase).toBe('login');
    expect(s.authEmail).toBeNull();
    // Realtime teardown 은 아직 실행되지 않았다(콜백 스택 안에서 Supabase API 를 부르지 않는다).
    expect(h.calls.removeAllChannels).toBe(removeBefore);

    await flushTimers();
    expect(h.calls.removeAllChannels).toBeGreaterThan(removeBefore); // 다음 tick 에 정리됐다

    // 보존 계약
    expect(localStorage.getItem('na_collab_enabled')).toBe('1'); // intent 보존(D2)
    const { loadProject } = await import('../src/storage/projectStore');
    expect(loadProject()?.project.title).toBe('보존될 프로젝트'); // local project 보존
  });

  it('#22 SIGNED_OUT 콜백이 반환하기 전에는 Supabase API 를 하나도 부르지 않는다', async () => {
    const { supa } = await activeStore();
    const snapshot = { ...h.calls };
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    // 콜백 스택 안에서는 removeAllChannels/removeChannel/from/getSession 등이 전혀 늘지 않는다.
    for (const k of Object.keys(snapshot)) {
      expect(h.calls[k], `콜백 반환 전 ${k} 호출`).toBe(snapshot[k]);
    }
    expect(supa.isCollabActive()).toBe(false);
    await flushTimers();
  });

  it('#37 재활성화된 뒤 도착한 stale stop timer 는 새 협업을 끊지 않는다', async () => {
    const { supa } = await activeStore();
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    expect(supa.isCollabActive()).toBe(false);
    // timer 가 아직 대기 중인 사이 정상 auth transition 이 runtime 을 다시 켰다고 가정한다.
    supa.activateCollab();
    const before = h.calls.removeAllChannels;
    await flushTimers();
    expect(h.calls.removeAllChannels).toBe(before); // skip 됐다
    expect(supa.isCollabActive()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑨ continuation barrier (deactivate 이후 살아 있는 경로)', () => {
  async function activeCollab() {
    const m = await freshModules();
    seedCollabIntent();
    m.supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await m.collab.bootstrapAuth(() => {});
    return m;
  }

  it('#30 gap 중 project 구독 콜백은 원격 갱신을 반영하지 않는다', async () => {
    const { supa, sync } = await activeCollab();
    supa.activateCollab();
    const applied: unknown[] = [];
    await sync.subscribeProject((p) => applied.push(p));
    expect(h.channelHandlers.postgres).toBeTruthy();

    supa.deactivateCollab(); // 로그아웃 — teardown 전
    h.channelHandlers.postgres!({ eventType: 'UPDATE', new: { data: {}, version: 9, client_id: 'other' } });
    expect(applied).toEqual([]);
  });

  it('#31 · #32 gap 중 Presence sync/SUBSCRIBED 는 peers 갱신도 track 도 하지 않는다', async () => {
    const { supa, presence } = await activeCollab();
    supa.activateCollab();
    const peers: unknown[] = [];
    await presence.startPresence({ name: 'n', activeTab: 't', selectedSceneId: null }, (p) => peers.push(p));

    supa.deactivateCollab();
    h.channelHandlers.presenceSync?.();
    h.channelHandlers.status?.('SUBSCRIBED');
    expect(peers).toEqual([]);
    expect(h.trackCount).toBe(0);

    // updatePresence 의 throttle timer 도 발화 시점에 다시 확인한다.
    presence.updatePresence({ name: 'n', activeTab: 't2', selectedSceneId: null });
    await new Promise((r) => setTimeout(r, 1100));
    expect(h.trackCount).toBe(0);
  });

  it('#33 in-flight push 가 로그아웃 뒤 resolve 해도 뱃지를 되살리지 않는다', async () => {
    const { supa, sync, assetsSync } = await activeCollab();
    supa.activateCollab();
    const statuses: string[] = [];
    sync.setPushStatusHandler((s) => statuses.push(s));
    assetsSync.setAssetPushStatusHandler((s) => statuses.push(s));

    h.uploadHook = () => supa.deactivateCollab(); // 업로드가 끝나는 순간 로그아웃
    await assetsSync.pushAsset('a_1', new Blob(['x']));
    expect(statuses).toEqual([]);

    supa.activateCollab();
    const p = sync.pushProject({ scenes: [] } as never);
    supa.deactivateCollab();
    await p;
    expect(statuses).toEqual([]);
  });

  it('#34 로그아웃 뒤 도착한 원격 blob 은 IndexedDB 에 캐시하지 않는다', async () => {
    const { supa, assetsSync } = await activeCollab();
    supa.activateCollab();
    h.downloadHook = () => supa.deactivateCollab();
    await expect(assetsSync.ensureAsset('a_missing')).resolves.toBeUndefined();
    expect(h.calls.download).toBe(1); // 요청 자체는 이미 나갔다(취소 시스템은 만들지 않는다)
  });

  it('#35 pagination 도중 닫히면 partial 결과를 성공으로 돌려주지 않는다(failed:true)', async () => {
    const { supa, assetsGc } = await activeCollab();
    supa.activateCollab();
    const page = (n: number) =>
      Array.from({ length: 1000 }, (_, i) => ({
        name: `a_${n}_${i}`,
        metadata: { size: 1 },
        created_at: new Date(0).toISOString(),
      }));
    h.listPages = [page(0), page(1)];
    h.listHook = (p) => {
      if (p === 0) supa.deactivateCollab(); // 첫 페이지 await 도중 로그아웃
    };
    const scan = await assetsGc.listRemoteAssets();
    expect(scan.failed).toBe(true);
    expect(h.calls.list).toBe(1); // 다음 페이지를 새로 요청하지 않았다
  });

  it('#35b 참조 조회가 끝난 뒤 닫히면 불완전한 집합을 성공으로 넘기지 않는다', async () => {
    const { supa, assetsGc } = await activeCollab();
    supa.activateCollab();
    h.projectsSelectResult = { data: [], error: null };
    h.projectsSelectHook = () => supa.deactivateCollab();
    const refs = await assetsGc.collectRemoteReferencedIds();
    expect(refs.failed).toBe(true);
  });

  it('#36 첫 chunk 뒤 닫히면 다음 삭제 요청을 내지 않고 미처리 id 를 failed 로 보고한다', async () => {
    const { supa, assetsGc } = await activeCollab();
    supa.activateCollab();
    const ids = Array.from({ length: 250 }, (_, i) => `a_${i}`);
    h.removeHook = () => supa.deactivateCollab(); // 첫 chunk 직후 로그아웃
    const res = await assetsGc.removeRemoteAssets(ids);
    expect(h.calls.remove).toBe(1); // 100개 chunk 하나만 나갔다
    expect(res.removed).toBe(100);
    expect(res.failed).toHaveLength(150); // 나머지는 전부 failed
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑩ startCollab 후반 await race', () => {
  it('#40 subscribeProject await 중 로그아웃되면 handle 을 즉시 해제하고 presence 로 넘어가지 않는다', async () => {
    const { supa, collab } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await collab.bootstrapAuth(() => {});
    supa.activateCollab();

    // ⚠️ 원격 행이 이미 있는 상태로 둔다 — 빈 방이면 startCollab 이 초기 pushProject 를 하고,
    //    그 push 의 성공 핸들러가 (아직 active 인 동안) 정당하게 online 을 쏘아 단언이 흐려진다.
    h.pullResult = { data: { data: { scenes: [] }, version: 1, updated_by: null }, error: null };

    // project 채널이 .subscribe() 되는 **그 순간** 로그아웃시킨다 — subscribeProject 의 await 가
    // resolve 된 직후 startCollab 이 post-await 가드에 걸리는 상황을 결정적으로 재현한다.
    h.channelSubscribeHook = () => {
      h.channelSubscribeHook = null; // 첫(=project) 채널에서만
      supa.deactivateCollab();
    };
    const statuses: string[] = [];
    await collab.startCollab({ ...noopHooks(), setStatus: (s) => statuses.push(s) });

    expect(h.calls.channel).toBe(1); // project 채널만 만들어졌다(presence 미진입)
    expect(h.calls.removeChannel).toBe(1); // handle 을 버리지 않고 즉시 해제했다
    expect(statuses).not.toContain('online'); // 뱃지가 되살아나지 않았다
  });

  it('#41 startPresence await 중 로그아웃되면 presence handle 을 해제하고 online 으로 가지 않는다', async () => {
    const { supa, collab } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    await collab.bootstrapAuth(() => {});
    supa.activateCollab();

    // ⚠️ 원격 행이 이미 있는 상태로 둔다 — 빈 방이면 startCollab 이 초기 pushProject 를 하고,
    //    그 push 의 성공 핸들러가 (아직 active 인 동안) 정당하게 online 을 쏘아 단언이 흐려진다.
    h.pullResult = { data: { data: { scenes: [] }, version: 1, updated_by: null }, error: null };

    // 두 번째 채널(presence) 의 subscribe 시점에 로그아웃시킨다.
    h.channelSubscribeHook = (nth) => {
      if (nth === 2) supa.deactivateCollab();
    };
    const statuses: string[] = [];
    await collab.startCollab({ ...noopHooks(), setStatus: (s) => statuses.push(s) });

    expect(h.calls.channel).toBe(2); // project + presence 둘 다 만들어졌다
    expect(h.calls.removeChannel).toBe(1); // presence handle 을 즉시 해제했다
    expect(statuses).not.toContain('online'); // 최종 setStatus('online') 0회
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑪ callback URL vs na_local_only', () => {
  it('#16 callback 은 na_local_only 보다 우선한다', async () => {
    stubWindow({ hash: '#access_token=REDACTED&type=invite' });
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    h.session = { user: { id: 'u1', email: 'inv@b.c' } };
    await useStore.getState().bootAuth();
    await flushTimers();
    // local-only fast-path 로 가지 않았다.
    expect(useStore.getState().authPhase).not.toBe('local-only');
  });

  it('#17 성공한 callback completion 은 na_local_only 를 지우고 비밀번호 설정으로 보낸다', async () => {
    stubWindow({ hash: '#access_token=REDACTED&type=invite' });
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    h.session = { user: { id: 'u1', email: 'inv@b.c' } };
    await useStore.getState().bootAuth();
    await flushTimers();
    expect(localStorage.getItem('na_local_only')).toBeNull();
    expect(useStore.getState().authPhase).toBe('password-setup');
    expect(localStorage.getItem('na_pending_password_setup')).toBe('1');
  });

  it('#18 만료된 callback 은 local-only 로 조용히 떨어지지도, preference 를 지우지도 않는다', async () => {
    // hosted probe A 실측 모양 그대로(2026-09-25): 사이트 루트 + fragment, query 없음, 끝에 sb marker.
    const w = stubWindow({ pathname: '/', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb' });
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    h.session = null; // 세션 수립 실패
    await useStore.getState().bootAuth();
    await flushTimers();
    const s = useStore.getState();
    expect(s.authPhase).toBe('login'); // silent local-only fallback 아님
    expect(s.authError).toBeTruthy(); // visible error
    expect(localStorage.getItem('na_local_only')).toBe('1'); // 성공한 것처럼 지우지 않는다
    expect(localStorage.getItem('na_pending_password_setup')).toBeNull();
    // §6-2 2-B: SDK completion 뒤 app 이 URL 을 추가로 sanitize 하지 않는다(probe B 전까지).
    expect(w.replaced).toEqual([]);

    // 사용자가 이 화면에서 "로컬 전용으로 계속"을 고르면 = callback 포기(terminal action).
    // 실측된 sb 까지 지워져야 새로고침 때 callback 이 다시 우선하지 않는다.
    useStore.getState().enterLocalOnly();
    expect(window.location.hash).toBe('');
    await useStore.getState().bootAuth();
    expect(useStore.getState().authPhase).toBe('local-only');
  });

  it('#19 valid session + pending marker 면 에디터보다 비밀번호 설정이 우선한다', async () => {
    localStorage.setItem('na_pending_password_setup', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    h.session = { user: { id: 'u1', email: 'inv@b.c' } };
    await useStore.getState().bootAuth();
    await flushTimers();
    expect(useStore.getState().authPhase).toBe('password-setup');
  });

  it('#21 local-only 로 끝난 bootAuth 는 leaveLocalOnly 후 다시 평가된다', async () => {
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    await useStore.getState().bootAuth();
    expect(useStore.getState().authPhase).toBe('local-only');

    h.session = null; // 로그인 안 된 상태 → login 으로 가야 한다
    await useStore.getState().leaveLocalOnly();
    await flushTimers();
    expect(localStorage.getItem('na_local_only')).toBeNull();
    expect(useStore.getState().authPhase).toBe('login'); // 옛 resolved promise 재사용이 아니다
  });

  it('#38 실패 callback 화면에서 로그인에 성공하면 na_local_only 가 사라진다', async () => {
    stubWindow({ pathname: '/', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb' });
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    h.session = null;
    await useStore.getState().bootAuth();
    expect(localStorage.getItem('na_local_only')).toBe('1');

    // 로그인 실패에서는 preference 를 건드리지 않는다.
    h.signInError = { message: '자격 증명 오류' };
    await useStore.getState().signIn('a@b.c', 'wrong');
    expect(localStorage.getItem('na_local_only')).toBe('1');
    expect(useStore.getState().authError).toBe('자격 증명 오류');
    expect(window.location.hash).not.toBe(''); // 실패한 로그인은 callback 을 넘어서지 않았다

    // 성공하면 명시적으로 인증 경로를 고른 것이므로 소멸시킨다.
    h.signInError = null;
    await useStore.getState().signIn('a@b.c', 'right');
    expect(localStorage.getItem('na_local_only')).toBeNull();
    // 실패 callback 을 명시적으로 넘어선 terminal action — 남은 marker 도 정리된다.
    expect(window.location.hash).toBe('');
  });

  it('#39 auth-unavailable 에서 local-only 를 고르면 callback marker 를 지우고 다음 부팅은 fast-path', async () => {
    stubEnv(false); // env 없음 — SDK 가 callback 을 처리할 수 없다
    const w = stubWindow({ pathname: '/', hash: '#access_token=REDACTED&type=invite' });
    vi.resetModules();
    const { useStore } = await import('../src/store');
    await useStore.getState().bootAuth();
    expect(useStore.getState().authPhase).toBe('auth-unavailable');
    expect(useStore.getState().authError).toBeTruthy();

    // 사용자가 명시적으로 "로컬 전용으로 계속"을 골랐다 = 이번 callback 포기(terminal action).
    useStore.getState().enterLocalOnly();
    expect(w.replaced.length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem('na_local_only')).toBe('1');
    expect(useStore.getState().authPhase).toBe('local-only');

    // 다음 부팅: stale callback 이 다시 우선하지 않는다.
    const { isAuthCallbackUrl } = await import('../src/collab/auth');
    expect(isAuthCallbackUrl()).toBe(false);
    await useStore.getState().bootAuth();
    expect(useStore.getState().authPhase).toBe('local-only');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑬ logout resurrection race (enableCollabIfAuthenticated 반환값)', () => {
  // enableCollabIfAuthenticated 가 무조건 true 를 돌려주면, startCollab 이 continuation barrier 로
  // 정상 중단했는데도 호출부(collabSlice/authSlice)가 store.collabEnabled 를 도로 true 로 되살린다.
  // 반환값은 **함수 종료 시점의 runtime truth** 여야 한다.
  async function bootedStore() {
    // 방·이름은 두되 intent 는 꺼둔다 — bootAuth 의 자동 재접속이 아니라 **manual enable** 을 본다.
    localStorage.setItem('na_collab_room', 'abc123');
    localStorage.setItem('na_collab_name', '나');
    localStorage.setItem('na_collab_enabled', '0');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const supa = await import('../src/collab/supabaseClient');
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    useStore.getState().hydrate();
    await useStore.getState().bootAuth();
    await flushTimers();
    // 원격 행이 이미 있는 상태로 둔다(초기 pushProject 의 online 신호를 섞지 않기 위해).
    h.pullResult = { data: { data: { scenes: [] }, version: 1, updated_by: null }, error: null };
    return { useStore, supa };
  }

  it('A. manual enable 의 subscribeProject await 중 SIGNED_OUT → mirror 가 되살아나지 않는다', async () => {
    const { useStore, supa } = await bootedStore();
    // project 채널이 subscribe 되는 순간(=await 진행 중) 실제 SIGNED_OUT 을 발화시킨다.
    h.channelSubscribeHook = (nth) => {
      if (nth !== 1) return;
      h.channelSubscribeHook = null;
      h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    };

    await useStore.getState().setCollabConfig({ room: 'abc123', displayName: '나', enabled: true });

    const s = useStore.getState();
    expect(supa.isCollabActive()).toBe(false);
    expect(s.collabEnabled).toBe(false); // ⚠️ 여기가 true 면 logout resurrection
    expect(s.collabStatus).toBe('off');
    expect(h.calls.channel).toBe(1); // startPresence 미진입
    expect(h.calls.removeChannel).toBe(1); // project unsubscribe 정확히 1회
    await flushTimers();
  });

  it('B. manual enable 의 startPresence await 중 SIGNED_OUT → collabEnabled/status 가 유지되지 않는다', async () => {
    const { useStore, supa } = await bootedStore();
    h.channelSubscribeHook = (nth) => {
      if (nth !== 2) return; // presence 채널
      h.channelSubscribeHook = null;
      h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    };

    await useStore.getState().setCollabConfig({ room: 'abc123', displayName: '나', enabled: true });

    const s = useStore.getState();
    expect(supa.isCollabActive()).toBe(false);
    expect(s.collabEnabled).toBe(false);
    expect(s.collabStatus).toBe('off');
    expect(h.calls.channel).toBe(2); // project + presence 둘 다 만들어졌다
    expect(h.calls.removeChannel).toBeGreaterThanOrEqual(1); // presence handle 즉시 해제
    await flushTimers();
  });

  it('C. 일반 network 실패는 여전히 true 를 돌려준다(재시도 semantics 보존)', async () => {
    const { useStore, supa } = await bootedStore();
    h.pullResult = { data: null, error: { message: '네트워크 오류' } };

    await useStore.getState().setCollabConfig({ room: 'abc123', displayName: '나', enabled: true });

    expect(supa.isCollabActive()).toBe(true); // transient 실패로는 닫지 않는다
    expect(useStore.getState().collabEnabled).toBe(true); // mirror 도 켜진 채 유지
    expect(useStore.getState().collabStatus).toBe('error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑭ 로그인 실패의 로컬 데이터 보존', () => {
  it('#8 signIn 실패는 project·에셋·preference·collab runtime 을 모두 그대로 둔다', async () => {
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const { saveProject, loadProject } = await import('../src/storage/projectStore');
    const { putAsset, getAsset } = await import('../src/storage/assetStore');
    const { emptyProject } = await import('../src/types');
    const supa = await import('../src/collab/supabaseClient');

    saveProject({ ...emptyProject(), title: '유지될 프로젝트' }, {});
    await putAsset('a_keep', new Blob(['keep']));
    useStore.getState().hydrate();
    localStorage.setItem('na_local_only', '1'); // 사용자가 이미 고른 preference

    h.signInError = { message: '자격 증명 오류' };
    await useStore.getState().signIn('a@b.c', 'wrong');

    // visible error 가 store 에 남는다
    expect(useStore.getState().authError).toBe('자격 증명 오류');
    expect(useStore.getState().authBusy).toBe(false);
    // 로컬 프로젝트 보존
    expect(loadProject()?.project.title).toBe('유지될 프로젝트');
    expect(useStore.getState().project.title).toBe('유지될 프로젝트');
    // IndexedDB 에셋 보존(clear/delete 가 일어났다면 여기서 undefined 가 된다)
    expect(await getAsset('a_keep')).toBeTruthy();
    // 실패에서는 preference 를 성공처럼 지우지 않는다
    expect(localStorage.getItem('na_local_only')).toBe('1');
    // collab runtime 도 새로 켜지지 않는다
    expect(supa.isCollabActive()).toBe(false);
    expect(useStore.getState().collabEnabled).toBe(false);
    expect(remoteCallTotal()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑮ pre-commit 리뷰 2차 회귀', () => {
  it('R1. session event timer 가 돌기 전에 SIGNED_OUT → 옛 session 이 authed·재접속을 되살리지 않는다', async () => {
    seedCollabIntent(); // intent+방이 있으니, timer 가 옛 session 으로 올라가면 재접속이 시작된다
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const supa = await import('../src/collab/supabaseClient');
    h.session = null;
    useStore.getState().hydrate();
    await useStore.getState().bootAuth();
    await flushTimers();
    expect(useStore.getState().authPhase).toBe('login');

    // session event → (timer pending) → SIGNED_OUT → timer flush
    h.authCbs.forEach((cb) => cb('SIGNED_IN', { user: { id: 'u2', email: 'x@y.z' } }));
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    await flushTimers();

    const s = useStore.getState();
    expect(s.authPhase).toBe('login');
    expect(s.authEmail).toBeNull();
    expect(s.collabEnabled).toBe(false);
    expect(s.collabStatus).toBe('off');
    expect(supa.isCollabActive()).toBe(false);
    expect(h.calls.channel).toBe(0); // startCollab 미진입
    expect(h.calls.pull).toBe(0); // 재접속 0
  });

  it('R2. signed-out + base client 가 이미 있을 때 startCollab 직접 호출 → removeAllChannels 0', async () => {
    const { supa, collab } = await freshModules();
    seedCollabIntent();
    supa.loadCollabConfig();
    await supa.getSupabaseClient(); // Auth 부팅으로 base client 가 이미 만들어진 상태
    expect(supa.isCollabActive()).toBe(false);

    const statuses: string[] = [];
    await collab.startCollab({ ...noopHooks(), setStatus: (s) => statuses.push(s) });

    expect(h.calls.removeAllChannels).toBe(0); // gate 전에 Realtime teardown 을 부르지 않는다
    expect(remoteCallTotal()).toBe(0);
    expect(statuses).toEqual(['off']);
  });

  it('R3. getCollabClient await 중 SIGNED_OUT → status 가 error 로 되살아나지 않고 off 유지', async () => {
    seedCollabIntent();
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const collab = await import('../src/collab');
    const supa = await import('../src/collab/supabaseClient');
    h.session = { user: { id: 'u1', email: 'a@b.c' } };
    h.pullResult = { data: { data: { scenes: [] }, version: 1, updated_by: null }, error: null };
    useStore.getState().hydrate();
    await useStore.getState().bootAuth(); // 자동 재접속으로 active 가 된다
    await flushTimers();
    expect(supa.isCollabActive()).toBe(true);

    const statuses: string[] = [];
    const p = collab.startCollab({
      ...noopHooks(),
      setStatus: (st) => {
        statuses.push(st);
        useStore.setState({ collabStatus: st });
      },
    });
    // startCollab 은 지금 getCollabClient() 의 await 에 멈춰 있다 — 그 사이 로그아웃.
    h.authCbs.forEach((cb) => cb('SIGNED_OUT', null));
    await p;

    expect(statuses).not.toContain('error');
    expect(useStore.getState().collabStatus).toBe('off');
    expect(supa.isCollabActive()).toBe(false);
    await flushTimers();
  });

  it('R4. 명시적 실패 callback + 기존 유효 세션 + na_local_only → 실패 상태 유지(성공 처리 금지)', async () => {
    stubWindow({ pathname: '/', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb' });
    seedCollabIntent(); // 성공으로 오인되면 자동 재접속이 시작될 조건
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const supa = await import('../src/collab/supabaseClient');
    h.session = { user: { id: 'u1', email: 'a@b.c' } }; // 무관한 기존 세션이 살아 있다
    useStore.getState().hydrate(); // persisted intent 로드 — 없으면 '재접속 0' 이 공짜로 통과한다
    expect(supa.isCollabReady()).toBe(true); // 성공으로 오인되면 실제로 재접속할 수 있는 조건이다

    await useStore.getState().bootAuth();
    await flushTimers(); // session event 의 후속 timer 도 흘려보낸다

    const s = useStore.getState();
    expect(s.authPhase).toBe('login');
    expect(s.authError).toBeTruthy();
    expect(localStorage.getItem('na_local_only')).toBe('1');
    expect(localStorage.getItem('na_pending_password_setup')).toBeNull();
    expect(supa.isCollabActive()).toBe(false);
    expect(h.calls.channel).toBe(0);
    expect(h.calls.pull).toBe(0); // 재접속 0
  });

  it('R5. signed-out 에서 이름만 바꿔도 persisted intent 는 보존된다', async () => {
    seedCollabIntent(); // na_collab_enabled='1'
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const supa = await import('../src/collab/supabaseClient');
    h.session = null;
    useStore.getState().hydrate();
    expect(useStore.getState().collabEnabled).toBe(false); // mirror 는 false

    await useStore.getState().setCollabConfig({ displayName: '변경' });

    expect(localStorage.getItem('na_collab_enabled')).toBe('1'); // intent 가 mirror 로 덮이지 않았다
    expect(localStorage.getItem('na_collab_name')).toBe('변경');
    expect(useStore.getState().collabEnabled).toBe(false);
    expect(supa.isCollabActive()).toBe(false);
    expect(remoteCallTotal()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑯ promoteSession fallback 의 실제 필요 경로', () => {
  it('R6. 실패 callback + 같은 계정의 기존 세션 → 같은 계정 재로그인 시 SIGNED_IN 이 걸러져도 authed 로 올라간다', async () => {
    stubWindow({ pathname: '/', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb' });
    seedCollabIntent(); // intent+방 — 중복 재접속이 있으면 채널/pull 카운트로 드러난다
    localStorage.setItem('na_local_only', '1');
    vi.resetModules();
    const { useStore } = await import('../src/store');
    const supa = await import('../src/collab/supabaseClient');
    const { currentAuthUserId } = await import('../src/collab/auth');
    h.session = { user: { id: 'u1', email: 'a@b.c' } }; // 기존 유효 세션
    h.pullResult = { data: { data: { scenes: [] }, version: 1, updated_by: null }, error: null };
    useStore.getState().hydrate();
    expect(supa.isCollabReady()).toBe(true);

    await useStore.getState().bootAuth();
    await flushTimers();
    // callbackErrorHold 때문에 login 에 머문다(기존 세션으로 성공 처리하지 않는다).
    expect(useStore.getState().authPhase).toBe('login');
    expect(currentAuthUserId()).toBe('u1'); // listener 는 이미 u1 을 알고 있다
    expect(h.calls.pull).toBe(0);

    // 같은 u1 로 interactive 로그인 — SDK 가 도중에 SIGNED_IN(u1)을 쏘지만, 같은 userId 라
    // normalized session event 가 **새로 나오지 않는다**(auth.ts 의 lastUserId dedupe).
    h.signInHook = () => h.authCbs.forEach((cb) => cb('SIGNED_IN', { user: { id: 'u1', email: 'a@b.c' } }));
    await useStore.getState().signIn('a@b.c', 'right');
    await flushTimers();
    await flushTimers();

    const s = useStore.getState();
    expect(s.authPhase).toBe('authed'); // login 에 고정되지 않았다
    expect(s.authEmail).toBe('a@b.c');
    expect(window.location.hash).toBe(''); // 실패 callback marker(sb 포함) 정리
    expect(localStorage.getItem('na_local_only')).toBeNull();
    expect(localStorage.getItem('na_pending_password_setup')).toBeNull(); // → password-setup 아님
    // 재접속은 정확히 한 번 — project·presence 채널 2개, 초기 pull 1회.
    expect(supa.isCollabActive()).toBe(true);
    expect(h.calls.pull).toBe(1);
    expect(h.calls.channel).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('S1-B ⑫ 정적 불변식', () => {
  // 원본 텍스트는 Vite 의 `?raw` glob 으로 읽는다 — node:fs 를 쓰면 tests tsconfig 에 @types/node 가
  // 없어 typecheck:tests 가 깨지고, 이 Phase 에서 의존성을 추가하지 않기로 했다.
  const RAW = import.meta.glob('../src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  /**
   * 파일 본문에서 **주석을 제거하고** 돌려준다.
   * ⚠️ 이게 없으면 "이런 패턴은 금지"라고 적어둔 안내 주석 자체가 위반으로 잡힌다(자기모순).
   */
  const read = (p: string): string => {
    const key = Object.keys(RAW).find((k) => k.endsWith(p.replace(/^src\//, '/')));
    if (!key) throw new Error(`원본을 찾지 못했다: ${p}`);
    return stripComments(RAW[key]);
  };
  const SRC = [
    'src/collab/auth.ts',
    'src/collab/supabaseClient.ts',
    'src/collab/index.ts',
    'src/collab/sync.ts',
    'src/collab/presence.ts',
    'src/collab/assetsSync.ts',
    'src/collab/assetsGc.ts',
    'src/store/authSlice.ts',
    'src/store/collabSlice.ts',
    'src/components/StartGate.tsx',
    'src/components/PasswordSetup.tsx',
  ];

  it('#5 토큰 **값**을 읽거나 복제하거나 내부 storage 를 들여다보지 않는다', () => {
    // ⚠️ key 존재 확인(`.has('access_token')`)은 허용이다 — 금지 대상은 값 읽기·복제·sniff 다.
    const forbidden = [
      /\.get\(\s*['"](?:access_token|refresh_token)['"]\s*\)/,
      /session\s*\.\s*(?:access_token|refresh_token)/,
      /(?:getItem|setItem)\(\s*['"]na-auth/,
      /service_role/,
      /VITE_[A-Z_]*SECRET/,
      /\bsignUp\b/,
    ];
    for (const f of SRC) {
      const body = read(f);
      for (const re of forbidden) {
        // vite-env.d.ts 의 금지 안내 주석은 이 목록에 없다(문서 문장이라 의도적 제외).
        expect(re.test(body), `${f} 에 금지 패턴 ${re}`).toBe(false);
      }
    }
  });

  it('#20 collab remote path 는 getSupabaseClient 를 직접 부르지 않는다', () => {
    for (const f of ['src/collab/sync.ts', 'src/collab/presence.ts', 'src/collab/assetsSync.ts', 'src/collab/assetsGc.ts', 'src/collab/index.ts']) {
      expect(/getSupabaseClient\s*\(/.test(read(f)), `${f} 가 base client 를 직접 쓴다`).toBe(false);
    }
    // base/Auth path 에서만 쓰인다.
    expect(/getSupabaseClient\s*\(/.test(read('src/collab/auth.ts'))).toBe(true);
  });

  it('activateCollab() 실호출은 enableCollabIfAuthenticated 한 곳뿐이다', () => {
    let sites = 0;
    for (const f of SRC) {
      const body = read(f);
      sites += (body.match(/(?<!de)activateCollab\s*\(\s*\)/g) ?? []).length;
    }
    // supabaseClient.ts 의 정의부(export function activateCollab())와 index.ts 의 호출 1건.
    expect(sites).toBe(2);
  });

  it('onAuthStateChange 콜백 안에서 stopCollab 을 직접 부르지 않는다', () => {
    const slice = read('src/store/authSlice.ts');
    // signed-out 처리에서 stopCollab 은 반드시 setTimeout 안에 있어야 한다.
    expect(/setTimeout\(\s*\(\)\s*=>\s*\{[^}]*stopCollab\(\)/.test(slice)).toBe(true);
    expect(/queueMicrotask/.test(slice)).toBe(false);
  });
});
