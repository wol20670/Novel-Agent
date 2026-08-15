import type { StoreApi } from 'zustand';
import type {
  Project,
  Scene,
  AssetMeta,
  Character,
  Expression,
  Locale,
  TranslateMode,
  MenuButtonSlot,
  MenuButtonState,
  MainMenuLayout,
  MainMenuPresetId,
  OrphanAsset,
  QuickButtonSlot,
  QuickButtonState,
  QuickMenuLayout,
  EscImageId,
  EscColors,
} from '../types';
import type { BuildResult } from '../parser';
import type { OutfitSuggestion } from '../generators/outfit';
import type { AnalyzeMode } from '../project/mergeScenes';
import type { VoiceEstimate } from '../generators/voice/estimate';
import type { CollabStatus, PeerPresence } from '../collab';

export type StoreSet = StoreApi<State>['setState'];
export type StoreGet = () => State;

export type Tab = 'scenes' | 'assets' | 'renpy';

export interface State {
  project: Project;
  assets: Record<string, AssetMeta>;
  activeTab: Tab;
  selectedSceneId: string | null;
  busy: Record<string, boolean>; // `batch:translate` 등 진행 중 표시 키
  toast: string | null;
  toastType: 'info' | 'success' | 'error';
  /**
   * 가장 최근 자동저장 실패 메시지(성공하면 null) — toast 는 3.5초면 사라져 그 뒤엔 저장이 계속
   * 실패해도 화면이 멀쩡해 보인다. 이건 실패가 이어지는 동안 계속 떠 있는 배너용(LeftPanel 상단).
   */
  saveError: string | null;

  // 입력/분석
  setRawInput: (text: string) => void;
  loadSample: () => void;
  /**
   * 파서(parseText/parseWorkbook) 결과를 프로젝트에 적용한다 — 실제 파싱은 LeftPanel 이 먼저
   * 수행해 병합 미리보기(previewMerge)를 계산한 뒤 이 액션을 호출한다. mode 로 기존 장면과의
   * 병합 방식을 고른다(merge=스마트 병합/append=뒤에 추가/replace=전체 교체). rawText 는 텍스트
   * 분석 경로에서만 project.rawInput 갱신용으로 넘긴다(엑셀 경로는 미지정).
   */
  applyAnalysis: (parsed: BuildResult, mode: AnalyzeMode, rawText?: string) => void;

  // 장면 편집
  updateScene: (id: string, patch: Partial<Scene>) => void;
  /** 대사 한 줄의 표정을 수동 지정(undefined = 자동 추론으로 되돌림). */
  setLineEmotion: (sceneId: string, lineIndex: number, emotion: Expression | undefined) => void;
  /**
   * 대사/지문 한 줄부터 스프라이트 숨김을 override(3-state: true=숨김/false=표시/undefined=이전
   * 줄 상태 상속). 판정 단일 소스는 spriteHiddenFlags(types.ts) — 이 액션은 그 입력값만 바꾼다.
   */
  setLineHideSprites: (sceneId: string, lineIndex: number, hide: boolean | undefined) => void;
  /** 대사/지문 한 줄의 원문(base) 텍스트를 실시간 수정한다(대사·지문 공통). */
  setLineText: (sceneId: string, lineIndex: number, text: string) => void;
  /** 대사/지문 한 줄의 로케일 번역(i18n)을 수정한다. 빈 값이면 그 로케일을 제거(원문 폴백). */
  setLineTranslation: (sceneId: string, lineIndex: number, locale: Locale, text: string) => void;
  /** 자동 번역 모드 변경(off/fast/quality). off 면 자동 번역 버튼이 숨겨진다. */
  setTranslateMode: (mode: TranslateMode) => void;
  /** 번역이 빈 대사·지문을 GPT 로 en·ja 채운다(빈 칸만). off/키없음이면 no-op/에러. */
  autoTranslateAll: () => Promise<void>;
  /** 자동 번역 진행 상황(장면 기준) — null = 실행 중 아님. CenterPanel 이 "N/M 장면" 으로 표시. */
  translateProgress: { done: number; total: number } | null;
  /**
   * AI 문맥 표정 배정(GPT) — emotion(작가 수동)·emotionAuto(AI) 가 둘 다 없고 실제 업로드된
   * 스프라이트가 있는 대사만 채운다(증분: 이미 채운 줄은 재실행해도 다시 API 를 안 태움).
   * autoTranslateAll 과 같은 구조(busy 키·진행률·PACE_MS·outer 루프·단일 커밋) — 실행 전 비용
   * 견적(estimateEmotionCost)을 window.confirm 으로 보여준다. off/키없음이면 no-op/에러.
   */
  autoAssignEmotionAll: () => Promise<void>;
  /** AI 표정 배정 진행 상황(장면 기준) — null = 실행 중 아님. translateProgress 와 동일한 표시 계약. */
  emotionProgress: { done: number; total: number } | null;

  // ── AI 의상 전환 추천(Outfit AI) ─────────────────────────────────────────────
  // ⚠️ 제안은 **project 밖 런타임 state** 다 — 그래서 localStorage 저장·.npproj.zip·협업 push 어디에도
  // 자동으로 안 실린다(그게 이 설계의 핵심이다: 표정의 emotionAuto 처럼 AI 값을 저장하지 않는다).
  // 사용자가 수락한 값만 기존 Line.outfits 에 manual 값으로 들어간다.
  /** sceneId → 검수 대기 중인 제안들. 항목 identity 는 (sceneId, lineIndex, character). */
  outfitSuggestions: Record<string, OutfitSuggestion[]>;
  /**
   * ⚠️ **suggestion provenance 가 아니라 in-flight run 의 stale-commit 방지 epoch** 이다.
   * 배치는 시작 시 이 값을 스냅샷하고 최종 commit 직전에 비교해, 다르면 그 run 결과를 통째로 버린다.
   * 그래서 canonical 이 바뀌는 모든 경로가 **canonical 변경보다 먼저**(async 면 첫 await 이전에) 올려야 한다.
   */
  outfitSuggestionRevision: number;
  /** AI 의상 추천 진행 상황(장면 기준) — null = 실행 중 아님. */
  outfitProgress: { done: number; total: number } | null;
  /**
   * 대사/지문 한 줄의 의상 전환을 수동 지정/해제(undefined = 그 캐릭터 지정 제거).
   * 판정 단일 소스는 outfitFlags(types/project.ts) — 이 액션은 그 입력값만 바꾼다.
   * ⚠️ AI 전용이 아니다: 파서 `#복장` 이 만든 값도 이걸로 지운다(원본 대본 태그가 남아 있으면 재분석 때 다시 생긴다).
   */
  setLineOutfit: (
    sceneId: string,
    lineIndex: number,
    character: string,
    outfit: string | undefined,
  ) => void;
  /** 제안 전체를 버리고 epoch 을 올린다(입력이 바뀌어 기존 제안이 더는 유효하지 않을 때의 단일 진입점). */
  invalidateOutfitSuggestions: () => void;
  /**
   * 대본이 의상 변화를 말한 자리를 GPT 로 찾아 **제안만** 만든다(canonical 은 안 건드린다).
   * autoAssignEmotionAll 과 같은 골격(busy 키·진행률·PACE_MS·outer abort·단일 커밋) + revision guard.
   */
  autoSuggestOutfitsAll: () => Promise<void>;
  /** 제안 하나를 적용 — 현재 state 로 재검증 후 **그 항목만** 목록에서 빼고 나머지는 유지한다. */
  applyOutfitSuggestion: (sceneId: string, lineIndex: number, character: string) => void;
  /** 제안 하나를 목록에서만 제거(canonical 무변경·revision 무변경). */
  ignoreOutfitSuggestion: (sceneId: string, lineIndex: number, character: string) => void;
  /** 한 장면의 제안을 lineIndex 순서로 순차 재검증하며 일괄 적용 — canonical 변경이 있을 때만 1회 커밋. */
  applySceneOutfitSuggestions: (sceneId: string) => void;
  /** 한 장면의 제안을 전부 목록에서만 제거(canonical 무변경·revision 무변경). */
  ignoreSceneOutfitSuggestions: (sceneId: string) => void;

  setSceneStatus: (id: string, status: Scene['status']) => void;
  /**
   * 이 장면을 스프라이트 숨김 상태로 시작할지(장면 카드 헤더 토글). 차량 내부처럼 인물이 서 있는
   * 구도가 어색한 장면 전체에 쓴다 — 줄 단위로만 숨기려면 setLineHideSprites 를 쓸 것.
   */
  setSceneHideSprites: (sceneId: string, hide: boolean) => void;
  approveAll: () => void;
  selectScene: (id: string | null) => void;
  setActiveTab: (t: Tab) => void;

  // 프로젝트 메타
  updateProjectMeta: (patch: Partial<Project>) => void;
  updateCharacter: (name: string, patch: Partial<Character>) => void;

  // GUI 테마 (AI/오프라인 생성)
  aiThemeBusy: boolean;
  generateAiTheme: () => Promise<void>;
  clearAiTheme: () => void;

  // 캐릭터 의상(복장) — 의상마다 표정 세트를 따로 가진다. #복장 태그로 장면별 지정.
  addOutfit: (charName: string, name: string) => void;
  removeOutfit: (charName: string, name: string) => Promise<void>;
  /**
   * 배경 이름 키워드 → 캐릭터 의상 자동 지정 규칙(프로젝트 단위). 53개 장면에 일일이 #복장을
   * 안 적어도 배경 이름으로 의상이 자동 결정되게 — resolveOutfit(types.ts)이 우선순위를 정한다.
   */
  addOutfitRule: (charName: string, outfit: string, keyword: string) => void;
  removeOutfitRule: (index: number) => void;
  /** 이 캐릭터의 모든 업로드 입화를 비운다(표정 세트는 유지, 다시 업로드 가능). */
  clearCharacterSprites: (name: string) => Promise<void>;
  /** 캐릭터 이름표의 언어별 번역 설정(에셋 탭 캐릭터 카드). 비우면(value='') 그 언어 번역을 지운다. */
  setCharacterI18nName: (charName: string, locale: Locale, value: string) => void;

  // 표정 세트 편집 (추가 / 이름변경 / 삭제). '기본'은 고정(이름변경·삭제 불가).
  addExpression: (name: string) => void;
  renameExpression: (oldName: string, newName: string) => void;
  removeExpression: (name: string) => Promise<void>;
  /** 표정 이름 → 한 줄 설명(project.expressionNotes, AI 표정 배정 프롬프트 전용) 편집. 빈 값이면 그 표정의 설명을 지운다. */
  setExpressionNote: (name: string, value: string) => void;

  /** 아이템(소품) 팝업 이미지 업로드 — 이름 기준 공유(project.itemAssetIds). */
  uploadItem: (name: string, file: File) => Promise<void>;

  // 외부 제작 에셋 업로드 (ChatGPT/Suno 등에서 만든 파일을 그대로 적용)
  importBackground: (sceneId: string, file: File) => Promise<void>;
  importSprite: (name: string, expr: Expression, file: File, outfit?: string) => Promise<void>;
  /**
   * 스프라이트 일괄 업로드 — 파일명에 든 표정 이름으로 자동 매칭해 선택된 의상 세트에 넣는다.
   * 표정 24종 × 캐릭터를 한 칸씩 올리는 걸 대체한다(메뉴 버튼 일괄 업로드와 같은 관용구).
   */
  importSpritesBatch: (name: string, outfit: string, files: File[]) => Promise<void>;
  importCg: (sceneId: string, index: number, file: File) => Promise<void>;
  clearCg: (sceneId: string, index: number) => Promise<void>;
  /** BGM 오디오 업로드 — 같은 BGM 이름(#BGM)을 쓰는 모든 장면에 함께 적용. */
  importBgm: (sceneId: string, file: File) => Promise<void>;
  /** 이 장면(그룹)의 BGM 업로드 해제. */
  clearBgm: (sceneId: string) => Promise<void>;

  /**
   * VoiceLab(🎙)에서 생성한 음성을 이 대사·언어에 매단다(voices.rpy 의 vo() 가 내보내기 때
   * game/voices/{lang}/*.mp3 로 실제 반영). project.voiceLocales 에 해당 언어가 없으면 자동 추가.
   */
  attachLineVoice: (sceneId: string, lineIndex: number, locale: Locale, blob: Blob, charName: string) => Promise<void>;
  /** 이 대사·언어의 매단 음성을 해제. */
  detachLineVoice: (sceneId: string, lineIndex: number, locale: Locale) => Promise<void>;
  /**
   * 캐릭터의 저장된 보이스 프리셋(char.voice)으로, 이 캐릭터가 말하는(합동 제외) 이 언어 음성이
   * 아직 없는 대사를 전부 순차 생성·적용한다(이미 있는 줄은 건너뜀 — 개별 미세조정 보존). 대본이
   * 수백 줄이어도 하나하나 손으로 안 해도 되게 하는 일괄 기능. 진행 중엔 busy['batch:voice:'+charName].
   */
  batchVoiceCharacter: (charName: string, locale: Locale) => Promise<void>;
  /** 보이스 프리셋이 저장된 모든 캐릭터에 대해 batchVoiceCharacter 를 순차 실행(확인창은 총합으로 한 번만). */
  batchVoiceAll: (locale: Locale) => Promise<void>;

  /**
   * 글자수 기반 즉시 계산(1글자=1크레딧, API 호출 0회)한 프로젝트 전체 보이스 예상 비용.
   * estimateVoiceCost() 로 채워지고, batchVoiceCharacter/batchVoiceAll 의 진행 전 확인창에 표시된다.
   * null = 아직 계산 안 함.
   */
  voiceEstimate: VoiceEstimate | null;
  /** 저장된 보이스 프리셋 기준으로 프로젝트 전체 예상 크레딧을 계산(base 로케일 고정, 키 불필요·즉시). */
  estimateVoiceCost: () => void;

  // 에셋 라이브러리 (이름 그룹 단위 — 같은 이름 장면 전체에 한 번에 적용)
  renameBackgroundGroup: (key: string, name: string) => void;
  /** 이 배경 그룹(같은 이름 쓰는 모든 장면)의 업로드 해제 — Canvas 임시로 복귀. */
  clearBackgroundGroup: (key: string) => Promise<void>;
  /** CG 컷 설명(라벨) 편집. */
  renameCgGroup: (oldDesc: string, newDesc: string) => void;
  importCgGroup: (desc: string, file: File) => Promise<void>;
  clearCgGroup: (desc: string) => Promise<void>;
  /** 이 이름의 아이템 이미지 업로드 해제 — Canvas 임시로 복귀. */
  removeItem: (name: string) => Promise<void>;
  /** 이 BGM 그룹(같은 이름 쓰는 모든 장면)의 업로드 해제. */
  clearBgmGroup: (key: string) => Promise<void>;
  importMenuArt: (file: File) => Promise<void>;
  clearMenuArt: () => Promise<void>;
  /** 타이틀(메인 메뉴) 화면 BGM 업로드 — config.main_menu_music. Project.titleBgm JSDoc 참고. */
  importTitleBgm: (file: File) => Promise<void>;
  clearTitleBgm: () => Promise<void>;
  /**
   * 게임 아이콘 업로드. which='ico' 는 Windows exe 아이콘(.ico, 프로젝트 루트로 나감),
   * which='window' 는 실행 중 창 아이콘(PNG). 자세한 차이는 Project.gameIcon JSDoc 참고.
   */
  importGameIcon: (which: 'ico' | 'window', file: File) => Promise<void>;
  clearGameIcon: (which: 'ico' | 'window') => Promise<void>;

  // 메인 메뉴 이미지 GUI(업로드 전용) — 버튼 슬롯×상태별 이미지 + 로고 + 좌표 오버라이드.
  /** 버튼 한 장(슬롯·상태) 업로드. */
  importMenuButton: (slot: MenuButtonSlot, state: MenuButtonState, file: File) => Promise<void>;
  /** 버튼 한 장(슬롯·상태) 업로드 해제. */
  clearMenuButton: (slot: MenuButtonSlot, state: MenuButtonState) => Promise<void>;
  /** 파일명 자동 매칭 일괄 업로드(예: GUI_처음부터_기본.png). 매칭 실패 파일은 토스트로 안내. */
  importMenuButtons: (files: File[]) => Promise<void>;
  /** 타이틀 로고 업로드. */
  importTitleLogo: (file: File) => Promise<void>;
  /** 타이틀 로고 업로드 해제. */
  clearTitleLogo: () => Promise<void>;
  /** 메인 메뉴 좌표 오버라이드(x/y/gap/hoverShiftX/... 부분 갱신). */
  setMainMenuLayout: (patch: Partial<MainMenuLayout>) => void;
  /**
   * 메인 메뉴 배치 프리셋 변경 — layout·labels 오버라이드를 함께 비운다(새 프리셋 기본값이 그대로
   * 보이게 하기 위함). 이전 값이 사라지는 것에 대한 확인창은 UI 담당이 처리(스토어는 무조건 비움).
   */
  setMainMenuPreset: (preset: MainMenuPresetId) => void;
  /** 메인 메뉴 버튼 라벨 편집(주/부). 빈 문자열이면 그 슬롯의 오버라이드를 지워 프리셋 기본값으로 되돌린다. */
  setMenuLabel: (slot: MenuButtonSlot, part: 'main' | 'sub', value: string) => void;
  /** 메인 메뉴 버튼 텍스트 폰트(주/부) 지정. undefined 면 폴백 규칙(주=본문 폰트, 부=주 폰트)으로 복귀. */
  setMenuFont: (which: 'main' | 'sub', fontId: string | undefined) => void;

  // 인게임 우측 퀵메뉴 이미지 GUI(업로드 전용) — mainMenuUi 와 동일 계약(버튼 슬롯×상태 + 보조 패널).
  /** 버튼 한 장(슬롯·상태) 업로드. */
  importQuickButton: (slot: QuickButtonSlot, state: QuickButtonState, file: File) => Promise<void>;
  /** 버튼 한 장(슬롯·상태) 업로드 해제. */
  clearQuickButton: (slot: QuickButtonSlot, state: QuickButtonState) => Promise<void>;
  /** 파일명 자동 매칭 일괄 업로드(예: GUI_기록_기본.png). 매칭 실패 파일은 토스트로 안내. */
  importQuickButtons: (files: File[]) => Promise<void>;
  /** 퀵메뉴 보조 패널(버튼 뒤 판) 업로드. */
  importQuickPanel: (file: File) => Promise<void>;
  /** 퀵메뉴 보조 패널 업로드 해제. */
  clearQuickPanel: () => Promise<void>;
  /** 퀵메뉴 좌표 오버라이드(panelX/panelY/btnX/menuY/listY/listStep 부분 갱신). */
  setQuickMenuLayout: (patch: Partial<QuickMenuLayout>) => void;

  // ESC(게임 중) 메뉴 이미지 GUI(업로드 전용) — mainMenuUi/quickMenuUi 와 달리 슬롯×상태 격자가
  // 아니라 역할(EscImageId)마다 파일 1장인 평평한 맵이라 액션도 그만큼 단순하다.
  /** 이미지 한 장(역할) 업로드. */
  importEscImage: (id: EscImageId, file: File) => Promise<void>;
  /** 이미지 한 장(역할) 업로드 해제. */
  clearEscImage: (id: EscImageId) => Promise<void>;
  /** 파일명 자동 매칭 일괄 업로드(예: GUI_좌측메뉴_기본.png). 매칭 실패 파일은 토스트로 안내. */
  importEscImages: (files: File[]) => Promise<void>;
  /** ESC 메뉴 글자색(본문/제목/강조/보조/선택배경). 빈 값을 주면 그 롤은 기본값(밝은 아트 기준)으로. */
  setEscColors: (patch: Partial<EscColors>) => void;
  /** ESC 메뉴 글꼴 지정. undefined/빈 값이면 필드를 지워 인터페이스 폰트로 복귀. */
  setEscFont: (fontId: string | undefined) => void;

  // 설정/저장
  /**
   * OpenAI 키(선택) — 텍스트 작업용(gpt-4o-mini): 대본 자동번역 + AI 테마 생성.
   * 이미지·오디오는 이제 앱이 생성하지 않는다(외부 도구→업로드).
   */
  openaiKey: string;
  setOpenaiKey: (key: string) => void;

  /** Typecast 키(선택) — 성우 TTS 테스트용. 브라우저에만 저장, /api/typecast 프록시로만 통과. */
  typecastKey: string;
  setTypecastKey: (key: string) => void;

  /**
   * 협업(실시간 공유, 가벼운 버전) — 2인 전제. Supabase 접속 정보(URL·anon key)는 빌드에
   * 내장되어 있어 사용자는 "방 코드"(6자리)와 이름만 다룬다. ⚠️ 보안 경계 아님: 방 코드를 아는
   * 사람은 누구나 읽고 쓸 수 있다. 저장 시점(자동저장)마다 전체 프로젝트가 동기화되고, 같은
   * 순간 서로 다른 값을 저장하면 나중 저장이 이긴다(last-write-wins) — 프레즌스로 충돌을 피한다.
   */
  collabEnabled: boolean;
  collabRoom: string;
  collabName: string;
  collabStatus: CollabStatus;
  /** 지금 같은 방에 있는 상대방들(나 자신 제외, 저장 대상 아님). */
  collabPeers: PeerPresence[];
  setCollabConfig: (patch: Partial<{ room: string; displayName: string; enabled: boolean }>) => Promise<void>;

  save: () => void;
  hydrate: () => void;
  resetAll: () => void;
  /** 업로드한 에셋(배경·입화·CG·메뉴·BGM·아이템)을 모두 비운다. 대본·캐릭터 설정은 유지. */
  clearGeneratedAssets: () => Promise<void>;
  /**
   * 어디서도 참조되지 않는 IndexedDB 에셋 blob 목록을 조회한다(옛 업로드 교체·삭제된 캐릭터/장면
   * 등으로 남은 고아 데이터). 성우 음성도 참조 집합에 포함해 실수로 고아 판정하지 않는다. 삭제는
   * 하지 않는다 — 무엇이 지워질지 사용자가 미리 보고 골라야 해서 목록 조회와 삭제를 분리했다.
   */
  findOrphanAssets: () => Promise<OrphanAsset[]>;
  /** findOrphanAssets 가 돌려준 항목 중 사용자가 고른 id 만 되돌릴 수 없이 삭제한다. */
  deleteOrphanAssets: (ids: string[]) => Promise<void>;
  /**
   * Supabase Storage `assets` 버킷 전체에서, 어느 방의 프로젝트 JSON 도 참조하지 않고 유예 기간도
   * 지난 오브젝트만 골라 돌려준다(조회만, 삭제는 별도). collab 미준비면 빈 배열.
   * 로컬 findOrphanAssets 와는 대상이 다르다 — 이쪽은 "다른 방을 포함한 원격 전체"가 기준.
   * graceMs 미지정 = DEFAULT_REMOTE_GRACE_MS(7일). UI 가 REMOTE_GRACE_OPTIONS 로 골라 넘긴다.
   *
   * 반환값 구분에 주의: `[]` 는 "정말 지울 게 없음", **`null` 은 "조회 실패라 판정 불가"**(에러
   * 토스트는 이 액션이 이미 띄운다). 둘 다 `[]` 로 뭉갰더니 호출부가 빈 배열을 보고 "정리할 서버
   * 파일이 없습니다"를 덮어씌워, 네트워크·정책 실패가 성공처럼 보이는 버그가 있었다(실브라우저 확인).
   */
  findRemoteOrphanAssets: (graceMs?: number) => Promise<OrphanAsset[] | null>;
  /** findRemoteOrphanAssets 가 돌려준 항목 중 사용자가 고른 id 만 원격에서 되돌릴 수 없이 삭제한다. */
  deleteRemoteOrphanAssets: (ids: string[]) => Promise<void>;
  setToast: (msg: string | null) => void;

  // 프로젝트 파일 (기기 간 이동)
  exportProject: () => Promise<void>;
  importProject: (file: File) => Promise<void>;

  // Ren'Py 폴더 직접 쓰기 (반복 테스트용)
  folderSupported: boolean;
  folderName: string | null;
  syncToFolder: () => Promise<void>;
  changeFolder: () => Promise<void>;
  disconnectFolder: () => Promise<void>;
}
