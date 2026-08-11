import { updatePresence } from '../collab';
import type { State } from './types';
import type { SliceCreator } from './context';

export const createUiSlice: SliceCreator<Pick<State, 'selectScene' | 'setActiveTab' | 'setToast'>> = (set, _get, ctx) => ({
  selectScene: (id) => {
    set({ selectedSceneId: id });
    updatePresence(ctx.presenceSelf()); // collab 꺼져 있으면 내부적으로 no-op
  },
  setActiveTab: (t) => {
    set({ activeTab: t });
    updatePresence(ctx.presenceSelf());
  },
  setToast: (msg) => {
    if (msg === null) return set({ toast: null });
    ctx.flash(msg);
  },
});
