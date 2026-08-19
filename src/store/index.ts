import { create } from 'zustand';
import { emptyProject } from '../types';
import { isFolderSyncSupported } from '../project/folderSync';
import type { State } from './types';
import { createStoreContext } from './context';
import { createUiSlice } from './uiSlice';
import { createScriptSlice } from './scriptSlice';
import { createAiBatchSlice } from './aiBatchSlice';
import { createProjectSlice } from './projectSlice';
import { createCharacterSlice } from './characterSlice';
import { createAssetSlice } from './assetSlice';
import { createMenuGuiSlice } from './menuGuiSlice';
import { createVoiceSlice } from './voiceSlice';
import { createCollabSlice } from './collabSlice';
import { createPersistenceSlice } from './persistenceSlice';

export const useStore = create<State>((set, get) => {
  const ctx = createStoreContext(set, get);

  return {
    project: emptyProject(),
    assets: {},
    openaiKey: '',
    typecastKey: '',
    collabEnabled: false,
    collabRoom: '',
    collabName: '',
    collabStatus: 'off',
    collabPeers: [],
    activeTab: 'scenes',
    selectedSceneId: null,
    busy: {},
    translateProgress: null,
    // 번역 QA 결과도 project 밖 런타임 state — Outfit 제안과 같은 등급이다(새로고침하면 사라진다).
    translationQa: {},
    translationQaProgress: null,
    emotionProgress: null,
    // Outfit AI 제안은 project 밖 런타임 state — 새로고침하면 사라진다(저장·zip·협업 미포함이 설계).
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    outfitProgress: null,
    voiceEstimate: null,
    toast: null,
    toastType: 'info',
    saveError: null,
    folderSupported: isFolderSyncSupported(),
    folderName: null,
    aiThemeBusy: false,

    ...createUiSlice(set, get, ctx),
    ...createScriptSlice(set, get, ctx),
    ...createAiBatchSlice(set, get, ctx),
    ...createProjectSlice(set, get, ctx),
    ...createCharacterSlice(set, get, ctx),
    ...createAssetSlice(set, get, ctx),
    ...createMenuGuiSlice(set, get, ctx),
    ...createVoiceSlice(set, get, ctx),
    ...createCollabSlice(set, get, ctx),
    ...createPersistenceSlice(set, get, ctx),
  };
});

export { sceneById } from './helpers';
export type { Tab } from './types';
