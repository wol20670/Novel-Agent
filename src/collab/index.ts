// 협업 라이프사이클 오케스트레이션 — store.ts 는 이 파일(과 여기서 재수출하는 것들)만 임포트한다.
// (순환 의존 방지: 다른 collab/* 모듈은 store.ts 를 직접 참조하지 않는다.)

import type { Project } from '../types';
import { isCollabReady, getCollabConfig, getSupabaseClient, resetSupabaseClient } from './supabaseClient';
import {
  pushProject,
  pullProjectOnce,
  subscribeProject,
  markApplied,
  withApplyingRemoteGuard,
  resetSyncState,
} from './sync';
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
}

let unsubscribeProject: (() => void) | null = null;
let unsubscribePresence: (() => void) | null = null;

function teardownChannels(): void {
  unsubscribeProject?.();
  unsubscribeProject = null;
  unsubscribePresence?.();
  unsubscribePresence = null;
}

/** 협업을 (재)시작한다. 설정은 이미 persistCollabConfig 로 저장돼 있어야 한다. */
export async function startCollab(hooks: CollabHooks): Promise<void> {
  teardownChannels();
  resetSyncState();
  resetSupabaseClient();

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
    markApplied(payload.version);
    withApplyingRemoteGuard(() => hooks.applyRemoteProject(payload.data));
  });
  unsubscribePresence = startPresence(hooks.getPresenceSelf(), (peers) => hooks.setPeers(peers));

  hooks.setStatus('online');
}

/** 협업을 끈다 — 채널 해제, 클라이언트 정리. */
export function stopCollab(): void {
  teardownChannels();
  resetSupabaseClient();
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
