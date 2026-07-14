// 협업 라이프사이클 오케스트레이션 — store.ts 는 이 파일(과 여기서 재수출하는 것들)만 임포트한다.
// (순환 의존 방지: 다른 collab/* 모듈은 store.ts 를 직접 참조하지 않는다.)

import type { Project } from '../types';
import { isCollabReady, getCollabConfig, getSupabaseClient, resetSupabaseChannels } from './supabaseClient';
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

function teardownChannels(): void {
  unsubscribeProject?.();
  unsubscribeProject = null;
  unsubscribePresence?.();
  unsubscribePresence = null;
  setPushStatusHandler(null);
  setAssetPushStatusHandler(null);
}

/** 협업을 (재)시작한다. 설정은 이미 persistCollabConfig 로 저장돼 있어야 한다. */
export async function startCollab(hooks: CollabHooks): Promise<void> {
  teardownChannels();
  resetSyncState();
  resetSupabaseChannels();

  if (!isCollabReady()) {
    // enabled 인데 준비가 안 됐다면(주로 이 빌드에 Supabase 접속 정보가 없는 경우) 명확히 에러로 표시.
    hooks.setStatus(getCollabConfig().enabled ? 'error' : 'off');
    return;
  }

  hooks.setStatus('connecting');
  const supabase = getSupabaseClient();
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
    if (remote) {
      markApplied(remote.version);
      withApplyingRemoteGuard(() => hooks.applyRemoteProject(remote.data));
    } else {
      // 이 방에 아직 아무도 없으면 내 로컬 상태를 초기값으로 올린다.
      await pushProject(hooks.getProject());
    }
  } catch (e) {
    console.warn('[collab] 시작 실패:', e);
    hooks.setStatus('error');
    return;
  }

  unsubscribeProject = subscribeProject((payload) => {
    markApplied(payload.version); // 버전 카운터는 유지 — 내 다음 push가 더 높은 version을 갖게
    if (hooks.hasPendingLocalSave()) return; // 내 편집이 디바운스 대기 중 — 곧 내 push가 이기므로 반영 유예
    withApplyingRemoteGuard(() => hooks.applyRemoteProject(payload.data));
  });
  unsubscribePresence = startPresence(hooks.getPresenceSelf(), (peers) => hooks.setPeers(peers));

  hooks.setStatus('online');
}

/** 협업을 끈다 — 채널만 해제(클라이언트는 재사용을 위해 유지, supabaseClient.ts 참고). */
export function stopCollab(): void {
  teardownChannels();
  resetSupabaseChannels();
}

export {
  loadCollabConfig,
  saveCollabConfig as persistCollabConfig,
  getCollabConfig,
  hasEnvCredentials,
  type CollabConfig,
} from './supabaseClient';
export { pushProject } from './sync';
export { pushAsset, ensureAsset } from './assetsSync';
export { updatePresence } from './presence';
export type { PeerPresence } from './presence';
export { generateRoomCode } from './roomCode';
