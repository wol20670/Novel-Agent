// "지금 누가 뭘 보고 있는지" — Supabase Realtime Presence. 저장·푸시 대상이 아닌 휘발성 정보라
// sync.ts(프로젝트 JSON)와 완전히 분리된 별도 채널을 쓴다.
//
// ── S1-B(Auth) continuation barrier ──
// 로그아웃은 runtime active 를 동기적으로 닫지만 delayed teardown(stopCollab) 전 한 tick 동안
// 이미 붙어 있는 채널의 콜백과 throttle 타이머가 살아 있다. 그래서 세 지점에서 active 를 다시 본다:
// ① presence 'sync' 콜백 진입 ② subscribe status 콜백의 track ③ updatePresence 타이머의 track.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getCollabClient, isCollabActive, roomKey } from './supabaseClient';

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

const CLIENT_ID_LS = 'na_collab_client_id';

// 새로고침마다 새 id를 뽑으면 이전 세션이 "나"로 제외되지 못해 유령 접속자로 남는다.
// 같은 브라우저는 localStorage 에 저장된 id 를 재사용해 이 문제를 막는다.
function ensureClientId(): string {
  if (clientId) return clientId;
  try {
    const saved = localStorage.getItem(CLIENT_ID_LS);
    if (saved) return (clientId = saved);
  } catch {
    /* ignore */
  }
  clientId = `c_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  try {
    localStorage.setItem(CLIENT_ID_LS, clientId);
  } catch {
    /* ignore */
  }
  return clientId;
}

/** 프레즌스 채널 연결·구독 시작. 반환 함수 호출 시 해제. */
export async function startPresence(
  self: Omit<PeerPresence, 'clientId'>,
  onPeers: (peers: PeerPresence[]) => void,
): Promise<() => void> {
  const supabase = await getCollabClient();
  const room = roomKey();
  if (!supabase || !room) return () => {};
  const id = ensureClientId();
  const ch = supabase.channel(`presence:${room}`, { config: { presence: { key: id } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, () => {
    // 로그아웃 직후 큐에 남아 있던 sync 이벤트가 store 의 collabPeers 를 다시 채우지 못하게 한다.
    if (!isCollabActive()) return;
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
    // SUBSCRIBED 라도 이미 로그아웃됐으면 내 존재를 방송하지 않는다(signed-out 상태의 유령 접속자 방지).
    if (status === 'SUBSCRIBED' && isCollabActive()) void ch.track(self);
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
    // 1초 뒤에 실행되므로 그 사이 로그아웃됐을 수 있다 — 발화 시점에 다시 확인한다.
    if (!isCollabActive()) return;
    void ch.track(self);
  }, 1000);
}
