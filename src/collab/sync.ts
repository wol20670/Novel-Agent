// 프로젝트 JSON 전체를 저장 시점(store.ts 의 autoSave 600ms 디바운스)마다 Supabase 에 밀어넣고,
// 상대방의 변경을 구독해 받아온다. 충돌 처리는 last-write-wins(합의된 "가벼운 공유" 범위).
//
// 에코 방지가 핵심: 예전엔 모듈 스코프 localVersion 을 두고 "들어온 이벤트의 version 이 내
// localVersion 이하면 무시"했지만, A·B 가 같은 버전에서 동시에 편집하면 둘 다 "다음 버전"을
// 발행해 서로의 진짜 변경을 자기 에코로 오판 → 조용히 유실·영구 분기하는 버그가 있었다.
// 지금은 세션마다 고유한 clientId 로 에코를 판정한다: 들어온 행의 client_id 가 내 clientId 와
// 같으면 방금 내가 보낸 것(에코) → 무시, 다르면 항상 적용한다. version 은 순서 참고용으로만 남김.
// 원격을 반영할 때는 withApplyingRemoteGuard 로 감싸 store 의 반영 경로가 다시
// autoSave→pushProject 를 트리거하지 않도록 한다(무한 루프 방지, 실제 가드는 store.ts/index.ts
// 쪽에서 이 플래그를 확인해서 건다).

import type { Project } from '../types';
import { getSupabaseClient, getCollabConfig, roomKey } from './supabaseClient';

export interface RemoteProjectPayload {
  data: Project;
  version: number;
  updatedBy: string | null;
}

/** push 성공/실패를 store 의 collabStatus 뱃지에 반영하기 위한 콜백(순환 import 방지, index.ts 가 연결). */
export type PushStatusHandler = (status: 'online' | 'error') => void;

// 세션(탭)마다 고유 — 이 값을 실은 채로 보낸 변경은 구독 쪽에서 "내가 방금 보낸 것"으로 판정한다.
const clientId = crypto.randomUUID();

let localVersion = 0;
let applyingRemote = false;
let pushStatusHandler: PushStatusHandler | null = null;

export function withApplyingRemoteGuard<T>(fn: () => T): T {
  applyingRemote = true;
  try {
    return fn();
  } finally {
    applyingRemote = false;
  }
}

/** startCollab/stopCollab 이 push 성공·실패를 collabStatus 에 반영할 콜백을 등록/해제한다. */
export function setPushStatusHandler(handler: PushStatusHandler | null): void {
  pushStatusHandler = handler;
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
    client_id: clientId,
  });
  if (error) {
    console.warn('[collab] 프로젝트 동기화 실패(다음 저장 때 재시도됨):', error.message);
    pushStatusHandler?.('error');
    return;
  }
  localVersion = nextVersion;
  pushStatusHandler?.('online');
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
          | { data: Project; version: number; updated_by: string | null; client_id: string | null }
          | undefined;
        // Supabase Realtime 은 행이 크기 상한을 넘으면 컬럼을 잘라내고 payload.errors 를 채운다 —
        // 예전엔 row 가 비정상이면 그냥 조용히 무시해, 대본이 커지면 상대 변경을 계속 놓치면서도
        // 화면(collabStatus)은 "정상 연결"로 보이는 문제가 있었다. 이젠 badge 를 error 로 반영한다.
        if (payload.errors && payload.errors.length > 0) {
          console.warn('[협업] 원격 갱신 수신 실패(대본이 커서 페이로드 상한 초과 의심):', payload.errors);
          pushStatusHandler?.('error');
          return;
        }
        // DELETE 는 old 에 키만 실려 오는 게 정상이라 오류가 아니다(방 데이터가 지워진 경우).
        if (payload.eventType === 'DELETE') return;
        if (!row || typeof row.version !== 'number') {
          console.warn('[협업] 원격 갱신 형식이 예상과 다릅니다(무시):', payload);
          return;
        }
        if (row.client_id === clientId) return; // 방금 내가 보낸 것(에코) — version 동률과 무관하게 판정
        localVersion = Math.max(localVersion, row.version); // 순서 참고용 카운터만 갱신
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
