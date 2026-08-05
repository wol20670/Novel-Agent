// 협업(가벼운 실시간 공유) 연결 설정 — Supabase 클라이언트 싱글턴.
//
// URL·anon key는 사용자가 입력하지 않는다 — 빌드 시 환경변수(VITE_SUPABASE_URL/
// VITE_SUPABASE_ANON_KEY)로 앱에 내장된다. anon key는 원래 클라이언트에 공개돼도 되는
// 값이라(진짜 보안 경계는 RLS) 이렇게 하는 게 Supabase 의 정상적인 사용 방식이다.
// 사용자는 "방 코드"(6자리)와 "내 이름"만 다룬다 — 방을 새로 만들면 코드가 자동 생성되고,
// 참가할 땐 그 코드를 그대로 입력한다.
//
// ⚠️ 보안 경계 아님: 방 코드를 아는 사람은 누구나 읽고 쓸 수 있다(2인 신뢰 전제).

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
function getEnvCredentials(): { url: string; anonKey: string } {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
    anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  };
}

/** 이 빌드에 협업용 Supabase 접속 정보가 내장돼 있는지(배포 시 환경변수 설정 여부). */
export function hasEnvCredentials(): boolean {
  const { url, anonKey } = getEnvCredentials();
  return !!(url && anonKey);
}

/** 협업이 켜져 있고 접속에 필요한 값이 모두 채워졌는지. */
export function isCollabReady(): boolean {
  return !!(config.enabled && hasEnvCredentials() && config.room.trim());
}

/** 방 코드(공백 정리·대소문자 통일) — projects 테이블 PK 이자 Realtime 채널 접미사로 그대로 쓴다. */
export function roomKey(): string {
  return config.room.trim().toLowerCase();
}

/**
 * Supabase 클라이언트 싱글턴 — 페이지 생애주기 동안 단 한 번만 만들고 재연결 시에도 재사용한다.
 * URL·anon key 는 빌드에 고정돼 다시 만들 이유가 없고, supabase-js 는 같은 storageKey 로
 * createClient 를 반복 호출할 때마다 이전 GoTrueClient 인스턴스를 명시적으로 해제하지 않은 채
 * 새로 등록해 "Multiple GoTrueClient instances" 경고가 재연결할수록 계속 쌓인다(예전엔 재연결마다
 * 클라이언트를 null 로 지우고 다시 만들어서 이 문제가 있었음 — 이제 resetSupabaseChannels 는
 * 채널만 정리, 클라이언트는 그대로 둠). 준비 안 됐으면 null.
 *
 * `@supabase/supabase-js`(GoTrueClient+realtime-js 포함 ~130KB)는 협업을 켠 사용자만 필요하고
 * 기본값은 꺼짐이라, 여기서 동적 import 해 별도 청크로 분리한다(이 함수를 부르지 않으면 그 청크는
 * 아예 안 받아짐). isCollabReady()/hasEnvCredentials() 는 동기 유지 — 그건 순수 설정값 체크라
 * supabase-js 를 끌고 올 필요가 없다.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!isCollabReady()) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const { url, anonKey } = getEnvCredentials();
      // 협업은 로그인을 안 하는 anon 전용 사용이라 세션 저장이 불필요.
      const created = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: 'na-collab-noauth' },
      });
      client = created;
      return created;
    })();
  }
  return clientPromise;
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
