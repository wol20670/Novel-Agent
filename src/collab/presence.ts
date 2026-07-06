// "지금 누가 뭘 보고 있는지" — Supabase Realtime Presence. 저장·푸시 대상이 아닌 휘발성 정보라
// sync.ts(프로젝트 JSON)와 완전히 분리된 별도 채널을 쓴다.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, roomKey } from './supabaseClient';

export interface PeerPresence {
  clientId: string;
  name: string;
  activeTab: string;
  selectedSceneId: string | null;
  sceneTitle?: string;
}

let channel: RealtimeChannel | null = null;
let clientId = '';
let trackTimer: ReturnType<typeof setTimeout> | null = null;

function ensureClientId(): string {
  if (!clientId) clientId = `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  return clientId;
}

/** 프레즌스 채널 연결·구독 시작. 반환 함수 호출 시 해제. */
export function startPresence(
  self: Omit<PeerPresence, 'clientId'>,
  onPeers: (peers: PeerPresence[]) => void,
): () => void {
  const supabase = getSupabaseClient();
  const room = roomKey();
  if (!supabase || !room) return () => {};
  const id = ensureClientId();
  const ch = supabase.channel(`presence:${room}`, { config: { presence: { key: id } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState<Omit<PeerPresence, 'clientId'>>();
    const peers: PeerPresence[] = [];
    for (const key of Object.keys(state)) {
      if (key === id) continue; // 자기 자신은 제외 — "친구"만 보여준다.
      const entry = state[key]?.[0];
      if (entry) peers.push({ clientId: key, ...entry });
    }
    onPeers(peers);
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track(self);
  });
  return () => {
    if (trackTimer) clearTimeout(trackTimer);
    supabase.removeChannel(ch);
    if (channel === ch) channel = null;
  };
}

/** activeTab/selectedSceneId 등이 바뀔 때 호출 — 짧게 throttle 해서 재방송. */
export function updatePresence(self: Omit<PeerPresence, 'clientId'>): void {
  if (!channel) return;
  const ch = channel;
  if (trackTimer) clearTimeout(trackTimer);
  trackTimer = setTimeout(() => {
    void ch.track(self);
  }, 1000);
}
