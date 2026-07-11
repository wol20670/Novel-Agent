// 프로젝트 JSON 전체를 저장 시점(store.ts 의 autoSave 600ms 디바운스)마다 Supabase 에 밀어넣고,
// 상대방의 변경을 구독해 받아온다. 충돌 처리는 last-write-wins(합의된 "가벼운 공유" 범위).
//
// 에코 방지가 핵심: 모듈 스코프 localVersion 을 두고, 들어온 이벤트의 version 이 내 localVersion
// 이하면 무시한다(자기 자신이 방금 보낸 것이거나 이미 반영한 오래된 이벤트). 원격을 반영할 때는
// withApplyingRemoteGuard 로 감싸 store 의 반영 경로가 다시 autoSave→pushProject 를 트리거하지
// 않도록 한다(무한 루프 방지, 실제 가드는 store.ts/index.ts 쪽에서 이 플래그를 확인해서 건다).

import type { Project } from '../types';
import { getSupabaseClient, getCollabConfig, roomKey } from './supabaseClient';

export interface RemoteProjectPayload {
  data: Project;
  version: number;
  updatedBy: string | null;
}

let localVersion = 0;
let applyingRemote = false;

export function withApplyingRemoteGuard<T>(fn: () => T): T {
  applyingRemote = true;
  try {
    return fn();
  } finally {
    applyingRemote = false;
  }
}

/** 로컬 프로젝트를 원격에 반영(upsert). collab 미준비/원격 적용 중이면 조용히 아무 것도 안 한다. */
export async function pushProject(project: Project): Promise<void> {
  if (applyingRemote) return;
  const supabase = getSupabaseClient();
  const room = roomKey();
  if (!supabase || !room) return;
  const nextVersion = localVersion + 1;
  const { displayName } = getCollabConfig();
  const { error } = await supabase.from('projects').upsert({
    room,
    data: project,
    version: nextVersion,
    updated_by: displayName || null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('[collab] 프로젝트 동기화 실패(다음 저장 때 재시도됨):', error.message);
    return;
  }
  localVersion = nextVersion;
}

/**
 * 최초 접속 시 1회 원격 상태를 가져온다. 행이 없으면(아무도 이 방을 시작 안 했으면) null을
 * 정상 반환하지만, 네트워크·인증 등 진짜 오류는 throw 한다 — 여기서 조용히 삼키면(구 버전 버그)
 * "연결 실패"인데도 상태가 "연결됨"으로 잘못 표시된다(startCollab 의 try/catch 가 이 throw 를
 * 잡아 collabStatus 를 'error' 로 세팅한다).
 */
export async function pullProjectOnce(): Promise<RemoteProjectPayload | null> {
  const supabase = getSupabaseClient();
  const room = roomKey();
  if (!supabase || !room) return null;
  const { data, error } = await supabase
    .from('projects')
    .select('data, version, updated_by')
    .eq('room', room)
    .maybeSingle();
  if (error) throw new Error(error.message); // 진짜 오류(네트워크·URL·인증 등)
  if (!data) return null; // 정상 — 아직 아무도 이 방을 시작 안 함
  return { data: data.data as Project, version: data.version as number, updatedBy: (data.updated_by as string | null) ?? null };
}

/** 원격 변경 구독. 자기 에코·오래된 이벤트는 걸러내고, 진짜 새 변경만 onRemote 로 넘긴다. */
export function subscribeProject(onRemote: (payload: RemoteProjectPayload) => void): () => void {
  const supabase = getSupabaseClient();
  const room = roomKey();
  if (!supabase || !room) return () => {};
  const channel = supabase
    .channel(`projects:${room}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'projects', filter: `room=eq.${room}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | { data: Project; version: number; updated_by: string | null }
          | undefined;
        if (!row || typeof row.version !== 'number') return;
        if (row.version <= localVersion) return; // 자기 에코이거나 이미 반영한 버전
        onRemote({ data: row.data, version: row.version, updatedBy: row.updated_by ?? null });
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** 원격 데이터를 실제로 로컬에 반영했을 때, 그 버전으로 localVersion 을 맞춰 에코를 막는다. */
export function markApplied(version: number): void {
  localVersion = Math.max(localVersion, version);
}

/** 방을 새로 연결할 때 상태 초기화(버전 카운터 리셋). */
export function resetSyncState(): void {
  localVersion = 0;
  applyingRemote = false;
}
