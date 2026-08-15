// AI 의상 전환 추천 — 공개 표면. 외부(store·UI·테스트)는 이 배럴만 import 한다.
export {
  getFirstEffectiveCgIndex,
  sceneSpeakerNames,
  collectOutfitTargets,
  planOutfitWindows,
  buildOutfitRequest,
  parseOutfitResponse,
  suggestOutfitsBatch,
  normalizeOutfitLabel,
  type OutfitBatch,
  type OutfitWindowPlan,
  type OutfitScriptLine,
  type OutfitFixedEntry,
  type OutfitMarker,
  type OutfitCharState,
  type OutfitSource,
  type OutfitChange,
  type OutfitPromptCtx,
} from './aiSelect';

export {
  outfitLineKey,
  validateOutfitSuggestion,
  mergeLineOutfit,
  foldSceneSuggestions,
  type OutfitSuggestion,
  type OutfitValidation,
  type OutfitFoldResult,
} from './apply';

export { estimateOutfitCost, type OutfitCostEstimate } from './estimate';
