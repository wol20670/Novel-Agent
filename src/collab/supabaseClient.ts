// 협업(가벼운 실시간 공유) 연결 설정 — Supabase 클라이언트 싱글턴.
//
// URL·anon key는 사용자가 입력하지 않는다 — 빌드 시 환경변수(VITE_SUPABASE_URL/
// VITE_SUPABASE_ANON_KEY)로 앱에 내장된다. anon key는 원래 클라이언트에 공개돼도 되는
// 값이라(진짜 보안 경계는 RLS) 이렇게 하는 게 Supabase 의 정상적인 사용 방식이다.
// 사용자는 "방 코드"(6자리)와 "내 이름"만 다룬다 — 방을 새로 만들면 코드가 자동 생성되고,
// 참가할 땐 그 코드를 그대로 입력한다.
//
// ⚠️ 보안 경계 아님: 방 코드를 아는 사람은 누구나 읽고 쓸 수 있다(2인 신뢰 전제).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
export function getEnvCredentials(): { url: string; anonKey: string } {
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

/** Supabase 클라이언트 싱글턴. 준비 안 됐으면 null. */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isCollabReady()) return null;
  if (!client) {
    const { url, anonKey } = getEnvCredentials();
    client = createClient(url, anonKey);
  }
  return client;
}

/** 설정 변경(재연결) 시 기존 채널을 정리하고 클라이언트를 다시 만들 수 있게 한다. */
export function resetSupabaseClient(): void {
  if (client) {
    try {
      client.removeAllChannels();
    } catch {
      /* ignore */
    }
  }
  client = null;
}
