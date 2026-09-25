// 협업(가벼운 실시간 공유) 연결 설정 — Supabase 클라이언트 싱글턴 + collab runtime 게이트.
//
// URL·publishable key는 사용자가 입력하지 않는다 — 빌드 시 환경변수(VITE_SUPABASE_URL/
// VITE_SUPABASE_PUBLISHABLE_KEY)로 앱에 내장된다. publishable key는 원래 클라이언트에 공개돼도 되는
// 값이라(진짜 보안 경계는 RLS) 이렇게 하는 게 Supabase 의 정상적인 사용 방식이다.
// 사용자는 "방 코드"(6자리)와 "내 이름"만 다룬다 — 방을 새로 만들면 코드가 자동 생성되고,
// 참가할 땐 그 코드를 그대로 입력한다.
//
// ⚠️ 보안 경계 아님: 방 코드를 아는 사람은 누구나 읽고 쓸 수 있다(2인 신뢰 전제).
//
// ── S1-B(Auth) 이후의 두 accessor ──
// getSupabaseClient() = env 만 있으면 만들어지는 **base/Auth client**. Auth bootstrap·session 확인에 쓴다.
// getCollabClient()   = isCollabActive() 를 통과한 **remote collaboration 전용 accessor**.
// ⚠️ collab remote path(sync/presence/assetsSync/assetsGc/startCollab)에서 getSupabaseClient() 를
//    직접 부르지 말 것 — auth 게이트를 우회하게 된다.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CollabConfig {
  room: string;
  displayName: string;
  enabled: boolean;
}

const LS = {
  room: 'na_collab_room',
  name: 'na_collab_name',
  enabled: 'na_collab_enabled',
} as const;

let config: CollabConfig = { room: '', displayName: '', enabled: false };
let client: SupabaseClient | null = null;
// 클라이언트 생성 중(동적 import + createClient) 을 가리키는 in-flight promise — 동시에 여러
// 호출자(pushProject/pullProjectOnce/subscribeProject/startPresence 등)가 거의 같은 타이밍에
// getSupabaseClient() 를 부르면 이 promise 를 공유해 createClient 가 두 번 실행되는 걸 막는다
// (두 번 실행되면 "Multiple GoTrueClient instances" 경고가 다시 생김 — 아래 싱글턴 설명 참고).
let clientPromise: Promise<SupabaseClient> | null = null;

// collab runtime 의 **유일한 truth**(S1-B). persisted na_collab_enabled 는 user intent 일 뿐이고
// store.collabEnabled 는 UI mirror 다 — 둘 중 어느 것도 이 값을 대신하지 못한다.
// ⚠️ 이 값을 true 로 만드는 경로는 collab/index.ts 의 enableCollabIfAuthenticated() 하나뿐이다
//    (Auth API 로 유효 session 을 확인한 뒤에만 켠다). startCollab() 은 스스로 켜지 않는다.
let active = false;

/** Auth 확인을 통과한 호출자만 부른다(enableCollabIfAuthenticated). */
export function activateCollab(): void {
  active = true;
}

/**
 * collab runtime 을 닫는다. idempotent — 반복 호출해도 안전하다.
 * 호출 지점은 정확히 넷: SIGNED_OUT · 명시적 협업 끄기 · local-only 전환 · session 부재 확정.
 * ⚠️ 일반적인 network/pull/Realtime 실패로는 부르지 않는다 — active 의 뜻은 "지금 연결 성공"이
 *    아니라 "authenticated 상태에서 collab runtime 이 허용됨"이고, 기존 재시도 성질을 보존해야 한다.
 */
export function deactivateCollab(): void {
  active = false;
}

/** 지금 collab remote 경로가 열려 있는지 — runtime active AND 설정 완결성. */
export function isCollabActive(): boolean {
  return active && isCollabReady();
}

/** localStorage 에서 협업 설정을 읽어온다(앱 시작 시 hydrate 에서 호출). */
export function loadCollabConfig(): CollabConfig {
  try {
    config = {
      room: localStorage.getItem(LS.room) ?? '',
      displayName: localStorage.getItem(LS.name) ?? '',
      enabled: localStorage.getItem(LS.enabled) === '1',
    };
  } catch {
    /* ignore */
  }
  return { ...config };
}

/** 설정 일부를 병합·저장한다. 병합된 전체 설정을 돌려준다. */
export function saveCollabConfig(next: Partial<CollabConfig>): CollabConfig {
  config = { ...config, ...next };
  try {
    localStorage.setItem(LS.room, config.room);
    localStorage.setItem(LS.name, config.displayName);
    localStorage.setItem(LS.enabled, config.enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  return { ...config };
}

export function getCollabConfig(): CollabConfig {
  return { ...config };
}

/** 빌드에 내장된 Supabase 접속 정보. */
function getEnvCredentials(): { url: string; publishableKey: string } {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
    publishableKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
  };
}

/** 이 빌드에 Supabase 접속 정보가 내장돼 있는지(배포 시 환경변수 설정 여부). */
export function hasEnvCredentials(): boolean {
  const { url, publishableKey } = getEnvCredentials();
  return !!(url && publishableKey);
}

/**
 * 협업 설정이 완결됐는지(intent + env + 방 코드). ⚠️ 이건 **runtime truth 가 아니다** —
 * config.enabled 는 localStorage 에서 복원되는 user intent 라, signed-out 상태에서도 true 일 수 있다.
 * remote 경로 판정에는 반드시 isCollabActive() 를 쓴다.
 */
export function isCollabReady(): boolean {
  return !!(config.enabled && hasEnvCredentials() && config.room.trim());
}

/** 방 코드(공백 정리·대소문자 통일) — projects 테이블 PK 이자 Realtime 채널 접미사로 그대로 쓴다. */
export function roomKey(): string {
  return config.room.trim().toLowerCase();
}

/**
 * Supabase **base/Auth 클라이언트** 싱글턴 — 페이지 생애주기 동안 단 한 번만 만들고 재연결 시에도
 * 재사용한다. URL·publishable key 는 빌드에 고정돼 다시 만들 이유가 없고, supabase-js 는 같은
 * storageKey 로 createClient 를 반복 호출할 때마다 이전 GoTrueClient 인스턴스를 명시적으로 해제하지
 * 않은 채 새로 등록해 "Multiple GoTrueClient instances" 경고가 재연결할수록 계속 쌓인다(예전엔
 * 재연결마다 클라이언트를 null 로 지우고 다시 만들어서 이 문제가 있었음 — 이제 resetSupabaseChannels
 * 는 채널만 정리, 클라이언트는 그대로 둠). 이제 auth 세션까지 물고 있으므로 파괴는 더더욱 금지다.
 * env 가 없으면 null.
 *
 * ⚠️ 게이트는 **env 유무 하나뿐**이다(방 코드·협업 활성 여부와 무관) — Auth 는 방이 없어도 필요하다.
 *    remote collaboration 경로는 이 함수가 아니라 getCollabClient() 를 쓴다.
 *
 * `@supabase/supabase-js`(GoTrueClient+realtime-js 포함 ~130KB)는 여기서 동적 import 해 별도 청크로
 * 분리한다 — initial bundle 과의 분리는 S1-B 이후에도 그대로 유지된다.
 *  · local-only fast-path(na_local_only='1')는 이 함수를 아예 부르지 않아 supabase-js
 *    import/download 가 발생하지 않는다.
 *  · 반면 일반 StartGate/Auth bootstrap 경로에서는 방·협업 활성 여부와 무관하게 Auth 때문에 이
 *    청크가 로드된다(예전 "협업을 켠 사용자만 받는다"는 설명은 S1-B 이후 더 이상 사실이 아니다).
 * hasEnvCredentials()/isCollabReady()/isCollabActive() 는 동기 유지 — 순수 설정값 체크라
 * supabase-js 를 끌고 올 필요가 없다.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!hasEnvCredentials()) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const { url, publishableKey } = getEnvCredentials();
      // S1-B: email/password 로그인 세션을 유지한다(여러 PC 동시 사용 · 새로고침 후 복원).
      // detectSessionInUrl 은 SDK 기본값(true)에 의존한다 — invite/복구 링크의 세션 수립을 전부
      // SDK 에 맡기고 앱은 토큰을 직접 파싱하지 않는다. flowType 은 의도적으로 지정하지 않는다.
      const created = createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'na-auth' },
      });
      client = created;
      return created;
    })();
  }
  return clientPromise;
}

/**
 * remote collaboration 전용 accessor — collab runtime 이 열려 있을 때만 클라이언트를 준다.
 * base client 생성(await) 중에 SIGNED_OUT/local-only 로 닫힐 수 있으므로 **await 전·후 둘 다** 검사한다
 * (activationId 가 아니라 이 게이트 자체의 최소 race closure다).
 */
export async function getCollabClient(): Promise<SupabaseClient | null> {
  if (!isCollabActive()) return null;
  const c = await getSupabaseClient();
  if (!isCollabActive()) return null;
  return c;
}

/** 방/설정을 바꿔 재연결할 때 기존 Realtime 채널만 정리한다(클라이언트 자체는 재사용 — 위 참고). */
export function resetSupabaseChannels(): void {
  if (client) {
    try {
      client.removeAllChannels();
    } catch {
      /* ignore */
    }
  }
}
