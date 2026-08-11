import { startCollab, stopCollab, persistCollabConfig } from '../collab';
import type { State } from './types';
import type { SliceCreator } from './context';

export const createCollabSlice: SliceCreator<Pick<State, 'setCollabConfig' | 'setOpenaiKey' | 'setTypecastKey'>> = (
  set,
  get,
  ctx,
) => {
  const { collabHooks } = ctx;
  return {
    setCollabConfig: async (patch) => {
      const cur = get();
      const merged = persistCollabConfig({
        room: patch.room ?? cur.collabRoom,
        displayName: patch.displayName ?? cur.collabName,
        enabled: patch.enabled ?? cur.collabEnabled,
      });
      set({
        collabRoom: merged.room,
        collabName: merged.displayName,
        collabEnabled: merged.enabled,
      });
      if (merged.enabled) {
        await startCollab(collabHooks());
      } else {
        stopCollab();
        set({ collabStatus: 'off', collabPeers: [] });
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
