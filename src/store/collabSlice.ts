import {
  deactivateCollab,
  enableCollabIfAuthenticated,
  getCollabConfig,
  persistCollabConfig,
  stopCollab,
} from '../collab';
import type { State } from './types';
import type { SliceCreator } from './context';

export const createCollabSlice: SliceCreator<Pick<State, 'setCollabConfig' | 'setOpenaiKey' | 'setTypecastKey'>> = (
  set,
  _get,
  ctx,
) => {
  const { collabHooks, flash } = ctx;
  return {
    /**
     * 협업 설정 변경 + 켜기/끄기. **public store action 이라 여기가 auth gate 다** —
     * UI 의 disabled 는 게이트가 아니므로, signed-out 상태에서 이 액션을 직접 호출해도
     * runtime 이 켜지거나 remote 요청이 나가지 않아야 한다(S1-B).
     *
     * 세 값의 역할을 섞지 않는다:
     *  · persisted na_collab_enabled = **user intent**(여기서 그대로 기록한다)
     *  · collab module 의 active     = **runtime truth**(enableCollabIfAuthenticated 만 켤 수 있다)
     *  · store.collabEnabled         = **UI mirror**(runtime 결과를 따라간다 — intent 복사가 아니다)
     */
    setCollabConfig: async (patch) => {
      // ⚠️ 빠진 필드는 **persisted config** 로 채운다 — store.collabEnabled(UI mirror) 로 채우면 안 된다.
      //    signed-out 에서는 정상적으로 intent=true · mirror=false 인데, 이름·방만 바꾸는 부분 갱신이
      //    mirror 의 false 를 intent 로 덮어써 다음 로그인의 자동 재접속을 조용히 잃게 된다.
      const persisted = getCollabConfig();
      const merged = persistCollabConfig({
        room: patch.room ?? persisted.room,
        displayName: patch.displayName ?? persisted.displayName,
        enabled: patch.enabled ?? persisted.enabled,
      });
      set({ collabRoom: merged.room, collabName: merged.displayName });

      if (merged.enabled) {
        // Auth API 로 유효 session 을 확인한 뒤에만 activate + startCollab 한다.
        const ok = await enableCollabIfAuthenticated(collabHooks());
        if (!ok) {
          // mirror 는 runtime 결과를 따른다 — intent 가 true 여도 켜지지 않았으면 false 다.
          set({ collabEnabled: false, collabStatus: 'off', collabPeers: [] });
          flash('협업을 사용하려면 먼저 로그인하세요.', 'error');
          return;
        }
        set({ collabEnabled: true });
      } else {
        deactivateCollab();
        stopCollab();
        set({ collabEnabled: false, collabStatus: 'off', collabPeers: [] });
      }
    },

    setOpenaiKey: (key) => {
      set({ openaiKey: key });
      try {
        localStorage.setItem('na_openai_key', key);
      } catch {
        /* ignore */
      }
    },

    setTypecastKey: (key) => {
      set({ typecastKey: key });
      try {
        localStorage.setItem('na_typecast_key', key);
      } catch {
        /* ignore */
      }
    },
  };
};
