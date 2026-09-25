// 협업 라이프사이클 오케스트레이션 — store.ts 는 이 파일(과 여기서 재수출하는 것들)만 임포트한다.
// (순환 의존 방지: 다른 collab/* 모듈은 store.ts 를 직접 참조하지 않는다.)

import type { Project } from '../types';
import {
  activateCollab,
  deactivateCollab,
  getCollabClient,
  isCollabActive,
  isCollabReady,
  resetSupabaseChannels,
} from './supabaseClient';
import { currentAuthUserId, getAuthSession } from './auth';
import {
  pushProject,
  pullProjectOnce,
  subscribeProject,
  markApplied,
  withApplyingRemoteGuard,
  resetSyncState,
  setPushStatusHandler,
} from './sync';
import { setAssetPushStatusHandler } from './assetsSync';
import { startPresence, type PeerPresence } from './presence';

export type CollabStatus = 'off' | 'connecting' | 'online' | 'error';

export interface CollabHooks {
  /** 지금 밀어넣을(초기 업로드용) 로컬 프로젝트. */
  getProject: () => Project;
  /** 원격에서 받은 프로젝트를 로컬 store 에 반영(autoSave 를 다시 트리거하지 않아야 함). */
  applyRemoteProject: (project: Project) => void;
  setStatus: (status: CollabStatus) => void;
  setPeers: (peers: PeerPresence[]) => void;
  /** 프레즌스 최초 방송값(내 이름·현재 탭·선택 장면). */
  getPresenceSelf: () => Omit<PeerPresence, 'clientId'>;
  /** 디바운스 저장(autoSave) 대기 중 여부 — true 면 곧 내 push 가 이길 것이므로 원격 갱신 반영을 유예한다. */
  hasPendingLocalSave(): boolean;
}

let unsubscribeProject: (() => void) | null = null;
let unsubscribePresence: (() => void) | null = null;

// hasPendingLocalSave() 가 true 인 동안 들어온 원격 갱신은 반영하지 않고 그냥 버린다(아래 구독
// 콜백). 주석은 "유예"라고 했지만 실제로 나중에 다시 적용하지 않으므로 — 이 카운터로 최소한
// "몇 건이 버려졌는지"는 알 수 있게 해 store.ts 가 저장 직후 사용자에게 새로고침을 권할 수 있다.
// 진짜 병합은 하지 않는다(범위 밖) — 정직한 임시방편.
let droppedRemoteCount = 0;

/** 직전 debounce 저장 구간 동안 버려진 원격 갱신 수를 가져오고 카운터를 리셋한다. */
export function takeDroppedRemoteCount(): number {
  const n = droppedRemoteCount;
  droppedRemoteCount = 0;
  return n;
}

function teardownChannels(): void {
  unsubscribeProject?.();
  unsubscribeProject = null;
  unsubscribePresence?.();
  unsubscribePresence = null;
  setPushStatusHandler(null);
  setAssetPushStatusHandler(null);
}

/**
 * collab runtime 을 켜는 **유일한 경로**(S1-B). Auth API 로 유효 session 을 확인한 뒤에만
 * activateCollab() 하고 startCollab() 한다. 성공 여부를 돌려준다.
 *
 * ⚠️ store.authPhase 같은 mirror 값으로 이 확인을 대체하지 말 것 — source of truth 는 Auth API 다.
 * ⚠️ idempotent + race-safe: getAuthSession() await 사이에 SIGNED_OUT 이 끼어들거나 다른 호출이
 *    먼저 켰을 수 있으므로 await 뒤 조건을 다시 본다. 그 검사와 activateCollab() 사이에는 await 를
 *    두지 않는다(원자 구간). activationId/generation/queue 같은 시스템은 만들지 않는다.
 */
export async function enableCollabIfAuthenticated(hooks: CollabHooks): Promise<boolean> {
  // ① 설정 전제(intent + env + 방 코드). 없으면 활성화 자체를 하지 않는다.
  if (!isCollabReady()) return false;
  // ② 이미 켜져 있으면 no-op — 동시/연속 호출에서 startCollab 이 겹치지 않는다.
  if (isCollabActive()) return true;

  // ③ source of truth
  const session = await getAuthSession();

  // ④ await 뒤 재확인
  if (!session) return false;
  // ⚠️ currentAuthUserId() 는 Auth API 대신 믿는 값이 아니다 — 위 getAuthSession() 이 source of
  //    truth 이고, 이건 그 await 사이에 SIGNED_OUT/계정 전환이 끼어들었는지 보는 동기 guard 다.
  if (currentAuthUserId() !== session.userId) return false;
  if (!isCollabReady()) return false; // 그 사이 방/intent 가 사라졌다
  if (isCollabActive()) return true; // 다른 호출이 먼저 켰다

  // ⑤ 여기서부터 activateCollab() 까지 await 없음
  activateCollab();
  await startCollab(hooks);
  // ⚠️ 무조건 true 를 돌려주면 안 된다 — startCollab 의 subscribe/presence await 중에 SIGNED_OUT 이
  //    끼어들면 startCollab 은 continuation barrier 로 정상 중단하지만, 그 사실이 호출부에 전달되지
  //    않아 collabSlice/authSlice 가 store.collabEnabled 를 도로 true 로 되살린다(logout resurrection).
  //    함수가 끝나는 시점의 runtime truth 를 그대로 돌려준다:
  //     · 일반 network/pull 실패 → active 유지 → true (기존 재시도 semantics 보존)
  //     · SIGNED_OUT / 명시적 끄기 / local-only 전환 → active false → false
  return isCollabActive();
}

/**
 * 협업을 (재)시작한다. 설정은 이미 persistCollabConfig 로 저장돼 있어야 한다.
 *
 * ⚠️ 이 함수는 **스스로 runtime 을 켜지 않는다**(activateCollab 호출 없음) — 켜는 것은
 *    enableCollabIfAuthenticated() 하나뿐이다. 직접 호출되면 아래 가드에서 조용히 끝난다.
 * ⚠️ continuation barrier: 모든 await 뒤에 isCollabActive() 를 다시 본다. 로그아웃은 runtime 을
 *    동기적으로 닫지만 여기 있는 async continuation 은 그 뒤에도 돌아오기 때문이다. 특히
 *    subscribeProject/startPresence 가 돌려준 unsubscribe handle 은 **버리지 않고 즉시 호출**한다
 *    (버리면 채널이 열린 채 남는다).
 * ⚠️ 반대로 일반적인 network/pull/Realtime **실패**로는 deactivate 하지 않는다 — 기존처럼
 *    'error' 만 표시하고 runtime 은 열어 둬서 다음 autosave/push 가 재시도할 수 있게 한다.
 */
export async function startCollab(hooks: CollabHooks): Promise<void> {
  // ⚠️ gate 가 **맨 앞**이다. 아래 teardown 의 resetSupabaseChannels() 는 공유 client 의
  //    removeAllChannels() 를 부르는 Supabase Realtime 호출이라, 인증 게이트를 통과하지 않은 직접
  //    호출(signed-out 등)에서는 그것조차 내보내지 않는다.
  if (!isCollabActive()) {
    hooks.setStatus('off');
    return;
  }

  teardownChannels();
  resetSyncState();
  resetSupabaseChannels();

  hooks.setStatus('connecting');
  const supabase = await getCollabClient();
  // ⚠️ active 재확인이 null 검사보다 **먼저**다 — await 중 SIGNED_OUT 이면 getCollabClient 가 null 을
  //    돌려주는데, 그걸 'error' 로 표시하면 authSlice 가 이미 만든 'off' 를 되살리게 된다.
  if (!isCollabActive()) return;
  if (!supabase) {
    hooks.setStatus('error');
    return;
  }

  // push(프로젝트·에셋) 성공/실패를 뱃지에 그대로 반영 — 실패해도 계속 'online'으로 보이던 문제 수정.
  // 'connecting' 단계는 최종 hooks.setStatus('online') 이 뒤에서 덮으므로 순서 문제 없음.
  setPushStatusHandler(hooks.setStatus);
  setAssetPushStatusHandler(hooks.setStatus);

  try {
    const remote = await pullProjectOnce();
    // 원격 결과를 **소비하기 전에** 확인한다 — 로그아웃 뒤 원격 프로젝트를 로컬에 덮어쓰거나
    // 반대로 내 로컬을 원격에 올리는 일이 없어야 한다.
    if (!isCollabActive()) return;
    if (remote) {
      markApplied(remote.version);
      withApplyingRemoteGuard(() => hooks.applyRemoteProject(remote.data));
    } else {
      // 이 방에 아직 아무도 없으면 내 로컬 상태를 초기값으로 올린다.
      await pushProject(hooks.getProject());
    }
  } catch (e) {
    console.warn('[collab] 시작 실패:', e);
    if (!isCollabActive()) return;
    hooks.setStatus('error');
    return;
  }

  if (!isCollabActive()) return;
  const projectUnsub = await subscribeProject((payload) => {
    markApplied(payload.version); // 버전 카운터는 유지 — 내 다음 push가 더 높은 version을 갖게
    if (hooks.hasPendingLocalSave()) {
      // 내 편집이 디바운스 대기 중이라 이번 원격 갱신은 반영하지 않고 버린다(재적용하지 않음).
      droppedRemoteCount += 1;
      return;
    }
    withApplyingRemoteGuard(() => hooks.applyRemoteProject(payload.data));
  });
  if (!isCollabActive()) {
    projectUnsub(); // handle 을 버리면 채널이 열린 채 남는다
    return;
  }
  unsubscribeProject = projectUnsub;

  const presenceUnsub = await startPresence(hooks.getPresenceSelf(), (peers) => hooks.setPeers(peers));
  if (!isCollabActive()) {
    presenceUnsub();
    return;
  }
  unsubscribePresence = presenceUnsub;

  if (!isCollabActive()) return; // 마지막 관문 — 로그아웃 뒤 뱃지가 'online' 으로 되살아나지 않게
  hooks.setStatus('online');
}

/**
 * 협업을 끈다 — runtime 게이트를 닫고 채널을 해제한다(클라이언트는 재사용을 위해 유지,
 * supabaseClient.ts 참고).
 *
 * ⚠️ removeAllChannels() 를 타는 **Supabase Realtime API 호출**이 들어 있으므로
 *    onAuthStateChange 콜백 스택 안에서 직접 부르면 안 된다 — SIGNED_OUT 경로는
 *    store/authSlice.ts 가 next-task boundary(setTimeout 0)로 미뤄서 부른다.
 */
export function stopCollab(): void {
  deactivateCollab();
  teardownChannels();
  resetSupabaseChannels();
}

export {
  loadCollabConfig,
  saveCollabConfig as persistCollabConfig,
  hasEnvCredentials,
  isCollabReady,
  isCollabActive,
  activateCollab,
  deactivateCollab,
  getCollabClient,
  getCollabConfig,
  type CollabConfig,
} from './supabaseClient';
export {
  authCallbackError,
  authCallbackType,
  bootstrapAuth,
  currentAuthUserId,
  getAuthSession,
  isAuthCallbackUrl,
  sanitizeAuthCallbackUrl,
  signInWithPassword,
  signOutLocal,
  updatePassword,
  type AuthEvent,
} from './auth';
export { pushProject } from './sync';
export { pushAsset, ensureAsset } from './assetsSync';
export { updatePresence } from './presence';
export type { PeerPresence } from './presence';
export { generateRoomCode } from './roomCode';
export { listRemoteAssets, collectRemoteReferencedIds, removeRemoteAssets, type RemoteAsset } from './assetsGc';
