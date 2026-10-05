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
//
// ── S1-B(Auth) continuation barrier ──
// 클라이언트는 getCollabClient() 로만 얻는다(auth 게이트). 그리고 로그아웃은 runtime active 를
// **동기적으로** 닫지만 이미 열린 Realtime 채널과 이미 시작된 await 는 한 tick 더 살아 있으므로,
// ① 구독 콜백 진입 시 ② 요청 await 완료 후 부수효과 직전에 isCollabActive() 를 다시 확인한다.
// (이미 서버로 나간 요청을 취소하는 시스템은 만들지 않는다 — 취소 대신 "후속 상태 변경을 안 한다".)

import type { Project } from '../types';
import { getCollabClient, getCollabConfig, isCollabActive, roomKey } from './supabaseClient';

interface RemoteProjectPayload {
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

// ── S1-D1 F-8: initial-sync write latch + sync lifecycle 번호표 ──
// D1 이후 세션 토큰이 잠깐 비면(만료 + retryable refresh 실패) supabase-js 는 publishable key 로 요청을 보내고,
// RLS 가 행을 **에러 없이** 숨겨 pullProjectOnce() 가 "빈 방(null)"으로 보일 수 있다.
//
// initFailed = "이 module lifecycle 에서 빈 방 초기화(INSERT)가 실패한 뒤, 신뢰할 수 있는 initial sync 가
//              아직 다시 성공하지 않았다". true 인 동안 local state 로 원격 project row / asset object 를
//              덮는 write(pushProject upsert · pushAsset upsert)를 내지 않는다.
//   · set   : 현재 lifecycle 의 initial INSERT 가 실제로 실패했을 때만(insertInitialProject).
//   · clear : 현재 lifecycle 이 원격 행을 읽어 반영했을 때(markInitialSyncReady) 또는 빈 방 INSERT 가 성공했을 때.
//   · ⚠️ resetSyncState()(새 startCollab)는 지우지 않는다 — start 는 안전성 증명이 아니다(pull 전 창에 옛 producer 가 쓸 수 있다).
//   · ⚠️ pull 의 일반 network throw 는 이 값을 만들지도 풀지도 않는다(그 경로는 별도 follow-up F-9).
//   · ⚠️ reads·Realtime·Presence·teardown 을 막는 전역 barrier 가 아니다. 영속하지 않는다(page refresh = fresh false).
// syncLifecycle = 현재 startCollab lifecycle 번호(resetSyncState 마다 +1). boolean active 는 OFF→ON 뒤 돌아온
//   **옛 continuation** 을 구분하지 못한다 — 이 번호로 그것만 가린다. 읽는 곳은 insertInitialProject ·
//   markInitialSyncReady · pushAsset(expectedLifecycle) · importProject 업로드 루프 시작부뿐이다.
//   ⚠️ runtime/auth generation · request registry · cancellation 으로 넓히지 말 것.
let initFailed = false;
let syncLifecycle = 0;

/** B′-3/B′-4 latch 읽기 전용 — pushProject·pushAsset 이 원격 overwrite 직전에 본다. */
export function isInitialSyncBlocked(): boolean {
  return initFailed;
}

/** 현재 sync lifecycle 번호(읽기 전용). 증가는 resetSyncState() 한 곳뿐이다. auth/runtime truth 를 대신하지 않는다. */
export function currentSyncLifecycle(): number {
  return syncLifecycle;
}

/**
 * 현재 lifecycle 이 원격 행을 읽어 로컬에 반영했다 → latch 해제. 옛 lifecycle 이면 아무것도 안 한다.
 * ⚠️ latch owner(sync.ts) 안에서 unblock 소유권을 지키기 위한 helper 다 — state machine 으로 넓히지 말 것.
 */
export function markInitialSyncReady(lifecycle: number): boolean {
  if (lifecycle !== syncLifecycle) return false;
  initFailed = false;
  return true;
}

/** pushProject 와 insertInitialProject 가 같은 row shape 을 만들게 하는 내부 helper(에코 판정용 client_id 포함). */
function projectRow(project: Project, version: number) {
  const { displayName } = getCollabConfig();
  return {
    room: roomKey(),
    data: project,
    version,
    updated_by: displayName || null,
    updated_at: new Date().toISOString(),
    client_id: clientId,
  };
}

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

/** 로컬 프로젝트를 원격에 반영(upsert). collab 미활성/원격 적용 중이면 조용히 아무 것도 안 한다. */
export async function pushProject(project: Project): Promise<void> {
  if (applyingRemote) return;
  // initial sync 를 신뢰할 수 없는 동안엔 원격 방을 로컬로 덮지 않는다(S1-D1 B′-3). 로컬 저장은 호출부가 이미 끝냈다.
  if (initFailed) {
    // 로그아웃 직후(handler 해제 전 한 tick)엔 'off' 를 'error' 로 되살리지 않는다(S1-B continuation barrier).
    if (isCollabActive()) pushStatusHandler?.('error');
    return;
  }
  const supabase = await getCollabClient();
  const room = roomKey();
  if (!supabase || !room) return;
  const nextVersion = localVersion + 1;
  const { error } = await supabase.from('projects').upsert(projectRow(project, nextVersion));
  // 요청이 나간 뒤 로그아웃됐다면 후속 상태 변경을 만들지 않는다 — 안 그러면 뱃지가 'off' 에서
  // 다시 'online'/'error' 로 살아나고 localVersion 도 조용히 전진한다.
  if (!isCollabActive()) return;
  if (error) {
    console.warn('[collab] 프로젝트 동기화 실패(다음 저장 때 재시도됨):', error.message);
    pushStatusHandler?.('error');
    return;
  }
  localVersion = nextVersion;
  pushStatusHandler?.('online');
}

/** insertInitialProject 결과 — stale(옛 lifecycle)과 failed(현재 lifecycle 실패)를 섞지 않는다. */
type InitialInsertResult = 'created' | 'failed' | 'stale';

/**
 * pull 이 "행 없음"일 때만 startCollab 이 부르는 **빈 방 초기화 — INSERT only**(S1-D1 F-8 B′-1).
 * ⚠️ upsert 로 바꾸지 말 것: pull 은 무인증 fallback 때문에 기존 행을 못 봤을 수 있다. INSERT 는 그 숨은 행과
 *    PK 충돌로 실패해 원격을 덮지 않는다. 실패면 latch(initFailed)를 세운다 — 재시도·upsert fallback·local-wins 금지.
 * ⚠️ lifecycle 은 호출한 startCollab 의 번호표다. 다르면 'stale' — 옛 continuation 은 initFailed·localVersion·status 를
 *    건드리지 않는다(B′-5). isCollabActive() 와 번호표 검사는 서로 대체하지 않는다(둘 다 본다).
 * status 는 호출부(startCollab)가 소유한다 — 여기선 pushStatusHandler 를 부르지 않는다.
 */
export async function insertInitialProject(project: Project, lifecycle: number): Promise<InitialInsertResult> {
  if (lifecycle !== syncLifecycle) return 'stale'; // 옛 lifecycle 이면 INSERT 요청 자체를 보내지 않는다
  const supabase = await getCollabClient();
  if (!isCollabActive() || lifecycle !== syncLifecycle) return 'stale';
  if (!supabase || !roomKey()) {
    // active·ready 가 보장된 뒤라 실제로는 도달하지 않는 방어 분기 — 빈 방 판정 뒤 초기화를 못 했으니 fail-closed.
    initFailed = true;
    return 'failed';
  }
  const nextVersion = localVersion + 1;
  const { error } = await supabase.from('projects').insert(projectRow(project, nextVersion));
  if (!isCollabActive() || lifecycle !== syncLifecycle) return 'stale';
  if (error) {
    console.warn('[collab] 방 초기화 실패 — 기존 방을 덮지 않도록 중단:', error.message);
    initFailed = true;
    return 'failed';
  }
  localVersion = nextVersion;
  initFailed = false; // "원격 행 없음" + INSERT 성공 = 신뢰할 수 있는 initial sync
  return 'created';
}

/**
 * 최초 접속 시 1회 원격 상태를 가져온다. 행이 없으면(아무도 이 방을 시작 안 했으면) null을
 * 정상 반환하지만, 네트워크·인증 등 진짜 오류는 throw 한다 — 여기서 조용히 삼키면(구 버전 버그)
 * "연결 실패"인데도 상태가 "연결됨"으로 잘못 표시된다(startCollab 의 try/catch 가 이 throw 를
 * 잡아 collabStatus 를 'error' 로 세팅한다).
 *
 * ⚠️ 여기엔 post-await active 가드를 두지 않는다 — 결과를 소비하기 **전에** startCollab 이 이미
 *    isCollabActive() 를 재확인하므로(collab/index.ts) 같은 검사를 두 벌로 만들지 않는다.
 */
export async function pullProjectOnce(): Promise<RemoteProjectPayload | null> {
  const supabase = await getCollabClient();
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
export async function subscribeProject(onRemote: (payload: RemoteProjectPayload) => void): Promise<() => void> {
  const supabase = await getCollabClient();
  const room = roomKey();
  if (!supabase || !room) return () => {};
  const channel = supabase
    .channel(`projects:${room}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'projects', filter: `room=eq.${room}` },
      (payload) => {
        // 로그아웃 직후 delayed removeChannel(collab/index.ts stopCollab) 이 실행되기 전 한 tick 동안
        // 이미 큐에 있던 이벤트가 도착할 수 있다. 그걸 반영하면 signed-out 상태에서 store 의 project
        // 가 원격 값으로 덮이므로, 여기서 **가장 먼저** 끊는다(markApplied·뱃지·적용 전부 생략).
        if (!isCollabActive()) return;
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

/**
 * 새 startCollab lifecycle 의 시작점 — 번호표를 올리고 lifecycle 로컬 상태(버전 카운터)를 초기화한 뒤 그 번호를 돌려준다.
 * ⚠️ initFailed 는 건드리지 않는다(S1-D1 B′-6) — 해제는 markInitialSyncReady / initial INSERT 성공뿐이다.
 */
export function resetSyncState(): number {
  syncLifecycle += 1;
  localVersion = 0;
  applyingRemote = false;
  return syncLifecycle;
}
