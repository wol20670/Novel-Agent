import { create } from 'zustand';
import type { Project, Scene, AssetMeta, Character, Expression } from './types';
import { emptyProject, projectExpressions, effectiveExpressions } from './types';
import { parseText, parseWorkbook } from './parser';
import { generateImage, generateSprite, generateExpression, editImage, buildBackgroundPrompt, buildCgPrompt, buildMenuArtPrompt, generateMenuArtImage, generateCgFromReference, upscaleImage, type BgRemoval } from './generators/image';
import { compileSpritePrompt, compileScenePrompt, compileCgPrompt, compileTags } from './generators/image/promptCompiler';
import { ALL_TAGS } from './generators/image/tagDictionary';
import { seedFromString } from './generators/image/novelaiProvider';
import { synthBgm, type SynthOptions } from './generators/audio/synthProvider';
import { putAsset, getAsset, deleteAsset, getAssetUrl, clearAssets } from './storage/assetStore';
import { aiConfig, type NaiMode } from './config/aiConfig';
import {
  saveProject,
  loadProject,
  saveApiKey,
  loadApiKey,
  clearProject,
} from './storage/projectStore';
import { SAMPLE_STORY } from './sample';
import { exportProjectFile, importProjectFile } from './project/transfer';
import { downloadBlob } from './zip/buildZip';
import { generateTheme } from './generators/theme';
import { backgroundKey, bgmKey } from './renpy/generate';
import { resolveTheme } from './renpy/gui';
import {
  isFolderSyncSupported,
  connectProjectFolder,
  getConnectedFolderName,
  disconnectFolder as fsDisconnectFolder,
  syncProjectToFolder,
} from './project/folderSync';
import {
  connectImageArchive,
  getArchiveFolderName,
  disconnectImageArchive,
  archiveImage,
  getArchivePermission,
  ensureArchivePermission,
  safeFileName,
  timestamp,
} from './project/imageArchive';

export type Tab = 'scenes' | 'assets' | 'renpy';

/**
 * 랜덤 배치 생성 결과 1건. 썸네일 URL 과 함께 그 이미지를 만든 프롬프트·시드를 보존해,
 * 마음에 든 디자인을 (같은 해상도) 재현하거나 /ai/upscale 로 고해상도화할 수 있게 한다.
 * (NovelAI 기술 명세 §7.3: 같은 시드라도 해상도를 바꾸면 결과가 달라지므로, 고해상도 최종본은
 *  재생성이 아니라 이 원본 이미지를 업스케일하는 것이 정석이다.)
 */
export interface BatchResult {
  url: string;
  prompt: string;
  seed: number;
}

let assetCounter = 0;
function assetId(): string {
  assetCounter += 1;
  return `a_${Date.now().toString(36)}_${assetCounter}`;
}

interface State {
  project: Project;
  assets: Record<string, AssetMeta>;
  apiKey: string;
  activeTab: Tab;
  selectedSceneId: string | null;
  busy: Record<string, boolean>; // `${sceneId}:bg` | `${sceneId}:bgm`
  toast: string | null;
  toastType: 'info' | 'success' | 'error';

  // 입력/분석
  setRawInput: (text: string) => void;
  loadSample: () => void;
  analyzeText: (text: string) => void;
  analyzeExcel: (data: ArrayBuffer) => Promise<void>;

  // 장면 편집
  updateScene: (id: string, patch: Partial<Scene>) => void;
  /** 대사 한 줄의 표정을 수동 지정(undefined = 자동 추론으로 되돌림). */
  setLineEmotion: (sceneId: string, lineIndex: number, emotion: Expression | undefined) => void;
  setSceneStatus: (id: string, status: Scene['status']) => void;
  approveAll: () => void;
  selectScene: (id: string | null) => void;
  setActiveTab: (t: Tab) => void;

  // 프로젝트 메타
  updateProjectMeta: (patch: Partial<Project>) => void;
  updateCharacter: (name: string, patch: Partial<Character>) => void;

  // GUI 테마 (AI/오프라인 생성)
  aiThemeBusy: boolean;
  /** 랜덤 배치 생성 진행 중 여부. */
  batchRunning: boolean;
  /** 배치로 만든 결과(썸네일 URL + 프롬프트 + 시드, 최신순, 세션 메모리). */
  batchResults: BatchResult[];
  /** DB 태그 랜덤 조합으로 미소녀 입화를 멈출 때까지 1장씩(무료) 계속 생성. */
  startBatchGen: () => Promise<void>;
  stopBatchGen: () => void;
  /** 랜덤 배경 배치 생성 진행 중 여부(미소녀 배치와 독립). */
  bgBatchRunning: boolean;
  /** 랜덤 배경 배치 결과(가로 썸네일 URL + 프롬프트 + 시드, 최신순, 세션 메모리). */
  bgBatchResults: BatchResult[];
  /** DB Scene 태그 랜덤 조합으로 "인물 없는" 배경을 멈출 때까지 1장씩(무료) 계속 생성. */
  startBgBatchGen: () => Promise<void>;
  stopBgBatchGen: () => void;
  /**
   * 무료 farming 당첨 배치 결과를 scale 배로 업스케일해 다운로드 + 보관(Anlas 소모).
   * 같은 그림을 그대로 키워 디자인을 보존한다(재생성 아님). 키 필요.
   * kind 는 파일명·보관 경로 분류용(미소녀 / 배경).
   */
  upscaleResult: (result: BatchResult, scale: number, kind?: 'bishoujo' | 'background') => Promise<void>;
  generateAiTheme: () => Promise<void>;
  clearAiTheme: () => void;

  // 캐릭터 스프라이트 (표정별 입화) — outfit 미지정 시 '기본' 의상.
  generateCharacterSprites: (name: string, outfit?: string) => Promise<void>;
  /** 기본(메인) 입화만 1장 생성 — 이후 표정은 이 기본을 기준으로 하나씩 생성(토큰 절약). */
  generateCharacterBase: (name: string, outfit?: string) => Promise<void>;
  /** 한 표정 입화 생성. reference(기준 입화)를 주거나, 없으면 저장된 '기본'을 자동 기준으로 일관성 유지. */
  generateCharacterSprite: (name: string, expr: Expression, reference?: Blob, outfit?: string, seed?: number) => Promise<Blob | undefined>;
  /** 이미 생성된 입화를 지시문대로 미세 수정(예: "머리를 더 길게"). 키 필요. */
  refineSprite: (name: string, expr: Expression, instruction: string, outfit?: string) => Promise<void>;
  /** 정밀 수정 — 원본 이미지를 보존(img2img)하며 지시만 반영. 포즈·구도 유지, Anlas 소모. */
  refineSpritePrecise: (name: string, expr: Expression, instruction: string, outfit?: string) => Promise<void>;

  // 캐릭터 의상(복장) — 의상마다 표정 세트를 따로 가진다. #복장 태그로 장면별 지정.
  addOutfit: (charName: string, name: string, appearance?: string) => void;
  setOutfitAppearance: (charName: string, name: string, appearance: string) => void;
  /** 이 의상에서 빠져야 할 것(예: '재킷, 가방') — 기본 외형의 옷 누수 차단용. */
  setOutfitExclude: (charName: string, name: string, exclude: string) => void;
  removeOutfit: (charName: string, name: string) => Promise<void>;
  /**
   * 캐릭터 디자인(기본 입화)을 지시문대로 수정하고, 이미 만들어둔 다른 표정도
   * 새 기본을 기준으로 다시 그려 디자인을 일관되게 맞춘다(예: "머리를 단발로"). 키 필요.
   */
  refineCharacterDesign: (name: string, instruction: string) => Promise<void>;
  clearCharacterSprites: (name: string) => Promise<void>;
  /** 그림체 참조 이미지 추가(여러 장 가능; NovelAI vibe transfer 로 화풍만 참고). */
  addStyleRef: (file: File) => Promise<void>;
  /** 특정 그림체 참조 1장 제거. */
  removeStyleRef: (id: string) => Promise<void>;
  /** 그림체 참조 전체 해제. */
  clearStyleRefs: () => Promise<void>;

  // 표정 세트 편집 (추가 / 이름변경 / 삭제). '기본'은 고정(이름변경·삭제 불가).
  addExpression: (name: string) => void;
  renameExpression: (oldName: string, newName: string) => void;
  removeExpression: (name: string) => Promise<void>;

  // 에셋 생성
  generateBackground: (sceneId: string) => Promise<void>;
  /** 이미 생성된 배경을 지시문대로 미세 수정(예: "노을을 더 붉게"). 키 필요. */
  refineBackground: (sceneId: string, instruction: string) => Promise<void>;
  generateBgm: (sceneId: string, opts?: SynthOptions) => Promise<void>;
  assetUrl: (id: string | undefined) => Promise<string | undefined>;

  // 일괄 생성 (고유 이름 단위 — 미생성분만, force 면 전체 재생성)
  generateAllBackgrounds: (force?: boolean) => Promise<void>;
  generateAllBgm: (force?: boolean) => Promise<void>;

  // CG 컷 AI 생성 (같은 설명을 쓰는 모든 장면에 적용 + 보관)
  generateCg: (desc: string) => Promise<void>;
  /**
   * 캐릭터의 기본 입화(+해당 컷 장면의 배경)를 소스로 CG 를 생성한다.
   * 캐릭터·배경과 가장 닮은 CG 가 나오게 한다. 키 필요.
   */
  generateCgWithCharacter: (desc: string, characterName: string) => Promise<void>;
  /** 이미 생성된 CG 컷을 지시문대로 미세 수정. 키 필요. */
  refineCg: (desc: string, instruction: string) => Promise<void>;

  // 외부 제작 이미지 업로드 (직접 적용)
  importBackground: (sceneId: string, file: File) => Promise<void>;
  importSprite: (name: string, expr: Expression, file: File, outfit?: string) => Promise<void>;
  importCg: (sceneId: string, index: number, file: File) => Promise<void>;
  clearCg: (sceneId: string, index: number) => Promise<void>;

  // 에셋 라이브러리 (이름 그룹 단위 — 같은 이름 장면 전체에 한 번에 적용)
  renameBackgroundGroup: (key: string, name: string) => void;
  /** 배경의 상세 생성 프롬프트 설정(이름은 라벨로 유지, 이 텍스트로 생성). */
  setBackgroundPrompt: (key: string, prompt: string) => void;
  /**
   * 다른 배경(refKey)을 소스로 이 배경을 생성한다 — 같은 장소·화풍을 유지하며
   * 시간대/조명만 바꿔 일관성을 확보(예: '이른 아침 카페' → '밤 카페'). 키 필요.
   */
  generateBackgroundFromRef: (sceneId: string, refKey: string) => Promise<void>;
  /** CG 컷 설명(=생성 프롬프트) 편집. 대본엔 짧은 라벨(#CG n1)만 두고 여기서 디테일하게 적을 때. */
  renameCgGroup: (oldDesc: string, newDesc: string) => void;
  importCgGroup: (desc: string, file: File) => Promise<void>;
  clearCgGroup: (desc: string) => Promise<void>;
  importMenuArt: (which: 'main' | 'game', file: File) => Promise<void>;
  /**
   * 타이틀/게임 메뉴 배경을 NovelAI 로 생성해 슬롯에 적용(+보관). 키 필요.
   * opts 로 메인 캐릭터·배경을 참조하면 게임과 어울리게 합성한다.
   */
  generateMenuArt: (which: 'main' | 'game', opts?: { charName?: string; bgKey?: string }) => Promise<void>;
  clearMenuArt: (which: 'main' | 'game') => Promise<void>;

  // 설정/저장
  setApiKey: (key: string) => void;
  /**
   * OpenAI 키(선택) — 텍스트 작업용(gpt-4o-mini): NovelAI 프롬프트 단부루 태그 변환 + AI 테마.
   * 이미지 생성 키(apiKey)와 별개. 없으면 변환 없이 결정적 프롬프트로 폴백.
   */
  openaiKey: string;
  setOpenaiKey: (key: string) => void;
  /** 프롬프트 입력 언어 — 'ko'(GPT 로 영문 태그 변환) / 'en'(영어 태그 그대로, 변환 스킵). */
  promptLang: 'ko' | 'en';
  setPromptLang: (lang: 'ko' | 'en') => void;
  /** NovelAI 생성 모드 — free=Opus 무료(≤1MP) / high=고품질(큰 해상도, Anlas 소모). */
  naiMode: NaiMode;
  setNaiMode: (m: NaiMode) => void;
  /** 스프라이트 누끼 방식 — browser(무료·브라우저) / novelai(Director·Anlas) / none(흰 배경). 기본 browser. */
  bgRemovalMethod: BgRemoval;
  setBgRemovalMethod: (m: BgRemoval) => void;
  /** 표정(Emotion Director) 적용 강도 = defry(0~5). 0=강하게(눈색 등 드리프트↑)·클수록 약하게(원본 보존↑). */
  emotionDefry: number;
  setEmotionDefry: (n: number) => void;
  save: () => void;
  hydrate: () => void;
  resetAll: () => void;
  /** 생성된 이미지·BGM(배경·입화·CG·메뉴·음악)만 삭제. 대본·캐릭터 설정·그림체 참조는 유지. */
  clearGeneratedAssets: () => Promise<void>;
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

  // 생성 이미지 자동 보관 폴더 (재생성해도 원본 보존)
  archiveFolderName: string | null;
  /** 보관 폴더에 실제로 쓸 수 있는 권한이 있는지(리로드 후엔 재허용 필요할 수 있음). */
  archiveReady: boolean;
  connectArchive: () => Promise<void>;
  /** 사용자 제스처에서 보관 폴더 쓰기 권한을 재요청(리로드 후 저장 활성화). */
  verifyArchive: () => Promise<void>;
  disconnectArchive: () => Promise<void>;
}

// 랜덤 배치 생성용 — DB 태그를 카테고리별로 골라 미소녀 프롬프트를 무작위 조합.
const ensByCat = (cat: string): string[] => ALL_TAGS.filter((t) => t.cat === cat).map((t) => t.en);
const pickOne = <T,>(a: T[]): T | undefined => (a.length ? a[Math.floor(Math.random() * a.length)] : undefined);
const pickN = <T,>(a: T[], n: number): T[] => {
  const copy = [...a];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
};
// 다양한 머리색·눈색 팔레트 — 매 생성마다 무작위로 1개씩 명시해 노랑/핑크 쏠림을 깬다.
const HAIR_COLORS = [
  'black hair', 'dark brown hair', 'brown hair', 'blonde hair', 'platinum blonde hair',
  'white hair', 'silver hair', 'grey hair', 'blue hair', 'light blue hair', 'navy hair',
  'pink hair', 'red hair', 'green hair', 'dark green hair', 'purple hair', 'orange hair', 'aqua hair',
];
const EYE_COLORS = [
  'blue eyes', 'green eyes', 'red eyes', 'brown eyes', 'purple eyes',
  'yellow eyes', 'golden eyes', 'aqua eyes', 'grey eyes', 'pink eyes',
];

// 톤(전체 색감 분위기) — 매번 무작위로 하나 골라 비슷한 느낌 방지(파스텔·비비드·차분·웜·쿨).
const PALETTE_TONES = ['pastel colors', 'vivid colors', 'muted colors', 'warm color palette', 'cool color palette'];
// 의상 색 — 단순 의상 태그 앞에 붙여 옷 색을 다양화.
const OUTFIT_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'black', 'white', 'orange', 'teal', 'brown', 'navy'];
const HAS_COLOR = /\b(red|blue|green|yellow|purple|pink|black|white|orange|brown|grey|gray|silver|gold|golden|navy|teal|aqua)\b/i;

const maybe = (p: number): boolean => Math.random() < p;

/** 머리색 — 30% 확률로 그라데이션/투톤(서로 다른 두 색). */
function randomHair(): string {
  const c1 = pickOne(HAIR_COLORS)!;
  if (maybe(0.3)) {
    let c2 = pickOne(HAIR_COLORS)!;
    for (let i = 0; i < 5 && c2 === c1; i++) c2 = pickOne(HAIR_COLORS)!;
    // 두 색 + gradient 만(과거 multicolored·streaked 까지 붙여 헤어 태그가 과다 → 제거).
    return `${c1}, ${c2}, gradient hair`;
  }
  return c1;
}

/** 단순 의상 태그(쉼표·기존 색 없음)에 55% 확률로 색을 붙인다. */
function colorizeClothes(c: string): string {
  if (c.includes(',') || HAS_COLOR.test(c)) return c;
  return maybe(0.55) ? `${pickOne(OUTFIT_COLORS)} ${c}` : c;
}

// 미소녀(1girl·solo)와 충돌하는 역할/성별 태그 — 어느 풀에서 뽑히든 제외(예: groom=신랑, 의상으로 오분류).
const BISHOUJO_BLOCK = /\b(groom|husband|father|old man|1boy|2boys|multiple boys|male focus|multiple girls)\b/i;
// 표정/감정 단어 — 표정은 Expression 에서 "딱 1개"만 쓰도록, 그 외 풀(Body·Pose·의상 등)에선 제외한다
// (DB 에 boring face·crying 등이 Body 로 섞여 표정이 2~3개 겹치던 문제 차단).
const EMOTION_WORD =
  /\b(smil(e|ing)|smirk|grin(ning)?|laugh(ing)?|cry(ing)?|tears?|teardrop|angry|anger|sad|happy|blush(ing)?|pout(ing)?|frown(ing)?|surprised|scared|afraid|embarrassed|serious|expressionless|bored|boring|wink(ing)?|nervous|worried|annoyed|sleepy|ahegao|yandere|disgust(ed)?)\b/i;
/** 미소녀 풀 정제: 역할/성별 충돌 태그 제외. keepEmotions=false 면 표정 단어도 제외. */
const bishoujoPool = (cat: string, keepEmotions = false): string[] =>
  ensByCat(cat).filter((e) => e && !BISHOUJO_BLOCK.test(e) && (keepEmotions || !EMOTION_WORD.test(e)));

function randomBishoujoPrompt(): string {
  const acc = bishoujoPool('Accessory');
  const pose = bishoujoPool('Pose');
  const clothes = pickN(bishoujoPool('Clothing'), maybe(0.5) ? 2 : 1).map(colorizeClothes);
  return [
    // 구도 태그는 "앞쪽 + 가중치"로 둬야 강하게 먹는다(끝에 두면 무릎 위로 잘림).
    '1girl, solo, bishoujo, 1.4::full body::, full body shot, standing, head to toe, anime coloring',
    randomHair(),
    pickOne(EYE_COLORS),
    maybe(0.7) ? pickOne(PALETTE_TONES) : undefined,
    ...pickN(bishoujoPool('Body'), 2), // 색 외 신체 특징(표정 단어는 제외)
    ...clothes,
    maybe(0.5) ? pickOne(acc) : undefined,
    pickOne(bishoujoPool('Expression', true)), // 표정은 여기서 딱 1개만
    maybe(0.4) ? pickOne(pose) : undefined,
    // 작아지는 얼굴 보강(구도는 앞쪽 full body 가 담당).
    'looking at viewer, detailed face, beautiful detailed eyes',
    'white background, simple background',
  ]
    .filter(Boolean)
    .join(', ');
}

// ── 랜덤 배경 생성용 ─────────────────────────────────────────────────────
// 시간대·날씨는 DB 가 아니라 여기서 큐레이션해, 장소(Scene) 하나에 무작위로 입혀 분위기를 다양화한다.
const TIME_OF_DAY = [
  'daytime', 'morning', 'early morning', 'midday', 'golden hour',
  'sunset', 'dusk', 'twilight', 'blue hour', 'night', 'late night',
];
const WEATHER = [
  'clear sky', 'cloudy', 'overcast', 'light rain', 'after the rain',
  'snow', 'snowy', 'foggy', 'misty', 'sunny', 'storm clouds', 'starry sky',
];
// LightFX 사전엔 조합에 부적합한 템플릿/플레이스홀더 토큰(`[word]`, `BREAK`, `*_effect`,
// `*_swirling_around_the_character` 등)이 섞여 있어 배경 조합에서 제외한다.
const JUNK_TAG = /^[[{*]|^BREAK$|word/i;
const cleanLightFx = (): string[] => ensByCat('LightFX').filter((e) => e && !JUNK_TAG.test(e));

/**
 * DB 의 Scene(장소) 태그 1개를 핵심으로, 시간대·날씨·조명·톤을 무작위로 입혀 "인물 없는"
 * 비주얼노벨 배경 프롬프트를 만든다. 가로(landscape) 구도 + 하단을 단순하게(대사 UI 공간).
 * (미소녀 배치와 동일하게 영문 단부루 태그로 만들어 번역 단계를 건너뛴다.)
 */
function randomBackgroundPrompt(): string {
  const scene = pickOne(ensByCat('Scene')) ?? 'fantasy landscape';
  const light = cleanLightFx();
  return [
    // 핵심 장소는 앞쪽 + 약한 가중치로 확실히 먹게(끝에 두면 다른 태그에 묻힌다).
    `1.2::${scene}::`,
    'scenery, landscape, no humans, wide shot, establishing shot, eye-level view',
    pickOne(TIME_OF_DAY),
    maybe(0.6) ? pickOne(WEATHER) : undefined,
    maybe(0.85) ? pickOne(light) : undefined,
    maybe(0.35) ? pickOne(light) : undefined,
    maybe(0.7) ? pickOne(PALETTE_TONES) : undefined,
    'detailed background, intricate details, depth of field, atmospheric',
  ]
    .filter(Boolean)
    .join(', ');
}

// 한국어 표정명 → NovelAI Emotion 프리셋(24종). 매핑되면 Emotion 툴로 "표정만" 변경 가능.
const KO_EMOTION_MOOD: Record<string, string> = {
  기본: 'neutral', 무표정: 'neutral',
  기쁨: 'happy', 행복: 'happy', 즐거움: 'happy', 미소: 'happy',
  슬픔: 'sad', 우울: 'sad',
  화남: 'angry', 분노: 'angry',
  짜증: 'irritated',
  놀람: 'surprised',
  수줍음: 'shy', 부끄러움: 'shy',
  공포: 'scared', 무서움: 'scared',
  피곤: 'tired', 졸림: 'tired',
  신남: 'excited', 흥분: 'excited',
  긴장: 'nervous',
  생각: 'thinking', 고민: 'thinking',
  혼란: 'confused', 당황: 'confused',
  역겨움: 'disgusted',
  의기양양: 'smug', 거만: 'smug',
  지루함: 'bored',
  박장대소: 'laughing', 웃음: 'laughing',
  당혹: 'embarrassed',
  걱정: 'worried',
  사랑: 'love',
  결연: 'determined',
  아픔: 'hurt',
  장난: 'playful',
};
const moodFor = (expr: string): string | undefined => KO_EMOTION_MOOD[expr.trim()];

// ── 스프라이트 일관성 헬퍼 ───────────────────────────────────────────────
/** 컴파일된 태그 CSV 에서 "1girl/solo" 등 주체(피사체) 태그를 제거 — 의상 '제외'를 네거티브로 쓸 때 인물을 지우지 않게. */
function stripSubjectTags(tags: string): string {
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !/^(1girl|1boy|solo|\d+girls?|\d+boys?|multiple girls|multiple boys)$/i.test(t))
    .join(', ');
}

/** 긍정 프롬프트(CSV)에서 제외 태그를 포함하는 토큰을 빼낸다(부분일치 — 'track jacket' 도 'jacket' 으로 제거). */
function removeMatchingTags(positive: string, excludeCsv: string): string {
  const ex = excludeCsv.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!ex.length) return positive;
  return positive
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !ex.some((e) => t.toLowerCase().includes(e)))
    .join(', ');
}

export const useStore = create<State>((set, get) => {
  // 디바운스 자동저장
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  // 같은 저장 실패 메시지를 매 디바운스마다 반복해서 띄우지 않도록 1회만 알린다.
  let warnedSaveQuota = false;
  const autoSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { project, assets } = get();
      try {
        saveProject(project, assets);
        warnedSaveQuota = false;
      } catch (e) {
        if (!warnedSaveQuota) {
          warnedSaveQuota = true;
          flash((e as Error).message, 'error');
        }
      }
    }, 600);
  };

  const setScenes = (scenes: Scene[]) => {
    set((s) => ({ project: { ...s.project, scenes } }));
    autoSave();
  };

  const flash = (msg: string, type?: 'info' | 'success' | 'error') => {
    // 타입 미지정 시 메시지 키워드로 추론.
    const inferred: 'info' | 'success' | 'error' = type
      ? type
      : /실패|없습니다|확인하세요|찾지 못/.test(msg)
        ? 'error'
        : /완료|했습니다|생성했|적용했/.test(msg)
          ? 'success'
          : 'info';
    set({ toast: msg, toastType: inferred });
    setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 3500);
  };

  // 번역에 쓸 키 — 입력 언어가 'en'(영어 태그 그대로)면 키를 비워 GPT 변환을 건너뛴다.
  const translateKey = (): string => (get().promptLang === 'en' ? '' : get().openaiKey.trim());

  // NovelAI 경로면 프롬프트를 단부루 태그 구조로 조립한다(품질 프리픽스·감정·구조 태그).
  // translateKey 가 있을 때만(=한국어 모드 + OpenAI 키) 내부에서 GPT 번역이 일어난다.
  // 실패하면 undefined → 생성기의 결정적 프롬프트로 폴백.
  const naiCompile = async (fn: () => Promise<string>): Promise<string | undefined> => {
    try {
      const out = await fn();
      return out.trim() || undefined;
    } catch {
      return undefined;
    }
  };

  // 외부 업로드 이미지를 에셋으로 저장하고 id 반환.
  const uploadAsset = async (file: File, kind: AssetMeta['kind'], filename: string): Promise<string> => {
    if (!file.type.startsWith('image/')) throw new Error('이미지 파일(PNG/JPG 등)만 업로드할 수 있습니다.');
    const id = assetId();
    await putAsset(id, file);
    const meta: AssetMeta = {
      id,
      kind,
      prompt: '(직접 업로드)',
      mime: file.type,
      source: 'upload',
      filename,
      createdAt: Date.now(),
    };
    set((s) => ({ assets: { ...s.assets, [id]: meta } }));
    return id;
  };

  return {
    project: emptyProject(),
    assets: {},
    apiKey: '',
    openaiKey: '',
    promptLang: 'ko',
    activeTab: 'scenes',
    selectedSceneId: null,
    busy: {},
    toast: null,
    toastType: 'info',
    folderSupported: isFolderSyncSupported(),
    folderName: null,
    archiveFolderName: null,
    archiveReady: false,
    naiMode: 'free',
    bgRemovalMethod: 'browser',
    emotionDefry: aiConfig.image.novelai.emotionDefry,

    setRawInput: (text) => {
      set((s) => ({ project: { ...s.project, rawInput: text } }));
    },

    loadSample: () => {
      set((s) => ({ project: { ...s.project, rawInput: SAMPLE_STORY } }));
      flash('샘플 스토리를 입력창에 불러왔습니다. "분석"을 눌러주세요.');
    },

    analyzeText: (text) => {
      const { scenes, characters } = parseText(text);
      if (scenes.length === 0) {
        flash('분석할 장면이 없습니다. 형식을 확인하세요.');
        return;
      }
      set((s) => ({
        project: { ...s.project, rawInput: text, scenes, characters: mergeChars(s.project.characters, characters) },
        selectedSceneId: scenes[0].id,
        activeTab: 'scenes',
      }));
      autoSave();
      flash(`${scenes.length}개 장면, ${characters.length}명 캐릭터를 분석했습니다.`);
    },

    analyzeExcel: async (data) => {
      const { scenes, characters } = await parseWorkbook(data);
      if (scenes.length === 0) {
        flash('엑셀에서 장면을 찾지 못했습니다. A/B열 형식을 확인하세요.');
        return;
      }
      set((s) => ({
        project: { ...s.project, scenes, characters: mergeChars(s.project.characters, characters) },
        selectedSceneId: scenes[0].id,
        activeTab: 'scenes',
      }));
      autoSave();
      flash(`엑셀에서 ${scenes.length}개 장면을 분석했습니다.`);
    },

    updateScene: (id, patch) => {
      setScenes(get().project.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)));
    },

    setLineEmotion: (sceneId, lineIndex, emotion) => {
      setScenes(
        get().project.scenes.map((sc) => {
          if (sc.id !== sceneId) return sc;
          const lines = sc.lines.map((l, i) =>
            i === lineIndex && l.kind === 'dialogue' ? { ...l, emotion } : l,
          );
          return { ...sc, lines };
        }),
      );
    },

    setSceneStatus: (id, status) => {
      setScenes(get().project.scenes.map((sc) => (sc.id === id ? { ...sc, status } : sc)));
    },

    approveAll: () => {
      setScenes(get().project.scenes.map((sc) => ({ ...sc, status: 'approved' as const })));
      flash('모든 장면을 승인했습니다.');
    },

    selectScene: (id) => set({ selectedSceneId: id }),
    setActiveTab: (t) => set({ activeTab: t }),

    updateProjectMeta: (patch) => {
      set((s) => ({ project: { ...s.project, ...patch } }));
      autoSave();
    },

    aiThemeBusy: false,
    generateAiTheme: async () => {
      const { project } = get();
      if (project.scenes.length === 0 && !(project.mood ?? '').trim()) {
        flash('먼저 스토리를 분석하거나 분위기를 입력하세요.');
        return;
      }
      // 테마는 OpenAI Chat(gpt-4o-mini)으로 만든다. 텍스트용 openaiKey 사용(없으면 오프라인 변형).
      const chatKey = get().openaiKey?.trim() || undefined;
      set({ aiThemeBusy: true });
      flash(chatKey ? 'AI 테마 생성 중…' : '오프라인 테마 변형 생성 중…');
      try {
        const { theme, source, note } = await generateTheme({
          project,
          mood: project.mood,
          apiKey: chatKey,
        });
        set((s) => ({ project: { ...s.project, guiTheme: theme } }));
        autoSave();
        const tag = source === 'ai' ? '🤖 AI' : '🎨 오프라인';
        flash(`${tag} 테마 적용: ${theme.label}${note ? ` — ${note}` : ''}`);
      } catch (e) {
        flash(`테마 생성 실패: ${(e as Error).message}`);
      } finally {
        set({ aiThemeBusy: false });
      }
    },
    clearAiTheme: () => {
      set((s) => ({ project: { ...s.project, guiTheme: undefined } }));
      autoSave();
      flash('프리셋 테마로 복귀했습니다.');
    },

    batchRunning: false,
    batchResults: [],
    stopBatchGen: () => set({ batchRunning: false }),
    startBatchGen: async () => {
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('먼저 NovelAI 토큰을 입력하세요.');
      if (get().batchRunning) return;
      set({ batchRunning: true });
      flash('랜덤 미소녀 생성 시작 — 멈출 때까지 1장씩 무료로 생성합니다.');
      let n = 0;
      let warnedArchive = false;
      while (get().batchRunning) {
        try {
          // 프롬프트·시드를 명시적으로 만들어 결과와 함께 보존(나중에 재현/업스케일 추적용).
          const prompt = randomBishoujoPrompt();
          const seed = Math.floor(Math.random() * 4_294_967_295);
          const { blob } = await generateSprite({
            name: `rand-${Date.now()}`,
            expression: '기본',
            color: '#88aaff',
            apiKey,
            promptOverride: prompt,
            seed,
            // 흑백·만화풍 + 상반신 컷(전신 강제) 차단(배치 한정).
            negative: `${aiConfig.image.novelai.negativePrompt}, monochrome, greyscale, sketch, lineart, manga, cowboy shot, upper body, portrait, close-up, cropped`,
            bgRemoval: get().bgRemovalMethod, // 좌측에서 고른 누끼 방식(AI/브라우저/…)을 그대로 사용
          });
          if (!get().batchRunning) break; // 생성 도중 멈춤 반영
          const url = URL.createObjectURL(blob);
          set((s) => {
            const next: BatchResult[] = [{ url, prompt, seed }, ...s.batchResults];
            next.slice(60).forEach((r) => URL.revokeObjectURL(r.url)); // 60장 초과분 URL 정리
            return { batchResults: next.slice(0, 60) };
          });
          const ok = await archiveImage(blob, `random/미소녀_${timestamp()}.png`);
          if (!ok && !warnedArchive) {
            warnedArchive = true;
            flash('팁: 소스 보관 폴더를 연결하면 PNG 파일로도 저장됩니다.');
          }
          n++;
        } catch (e) {
          flash(`배치 중단: ${(e as Error).message}`);
          set({ batchRunning: false });
          break;
        }
        await new Promise((r) => setTimeout(r, 1200)); // 무료 "한 번에 하나" + 레이트리밋 배려
      }
      flash(`랜덤 생성 종료 (총 ${n}장).`);
    },

    bgBatchRunning: false,
    bgBatchResults: [],
    stopBgBatchGen: () => set({ bgBatchRunning: false }),
    startBgBatchGen: async () => {
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('먼저 NovelAI 토큰을 입력하세요.');
      if (get().bgBatchRunning) return;
      set({ bgBatchRunning: true });
      flash('랜덤 배경 생성 시작 — 멈출 때까지 1장씩 무료로 생성합니다.');
      // 인물/글자/UI 가 끼어들지 않게 강하게 억제(배경 한정).
      const bgNegative =
        `${aiConfig.image.novelai.negativePrompt}, ` +
        '1girl, 1boy, multiple girls, multiple boys, person, people, human, character, ' +
        'portrait, close-up, upper body, watermark, signature, ui, hud';
      let n = 0;
      let warnedArchive = false;
      while (get().bgBatchRunning) {
        try {
          const prompt = randomBackgroundPrompt();
          const seed = Math.floor(Math.random() * 4_294_967_295);
          const { blob } = await generateImage({
            prompt,
            label: '배경',
            width: 1216, // 가로 비율 → naiSize 가 공식 landscape(무료 1216×832) 선택
            height: 832,
            apiKey,
            seed,
            negative: bgNegative,
          });
          if (!get().bgBatchRunning) break; // 생성 도중 멈춤 반영
          const url = URL.createObjectURL(blob);
          set((s) => {
            const next: BatchResult[] = [{ url, prompt, seed }, ...s.bgBatchResults];
            next.slice(60).forEach((r) => URL.revokeObjectURL(r.url)); // 60장 초과분 URL 정리
            return { bgBatchResults: next.slice(0, 60) };
          });
          const ok = await archiveImage(blob, `random-bg/배경_${timestamp()}.png`);
          if (!ok && !warnedArchive) {
            warnedArchive = true;
            flash('팁: 소스 보관 폴더를 연결하면 PNG 파일로도 저장됩니다.');
          }
          n++;
        } catch (e) {
          flash(`배경 배치 중단: ${(e as Error).message}`);
          set({ bgBatchRunning: false });
          break;
        }
        await new Promise((r) => setTimeout(r, 1200)); // 무료 "한 번에 하나" + 레이트리밋 배려
      }
      flash(`랜덤 배경 생성 종료 (총 ${n}장).`);
    },

    upscaleResult: async (result, scale, kind = 'bishoujo') => {
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('업스케일은 NovelAI 토큰이 필요합니다.');
      const busyKey = `upscale:${result.seed}`;
      if (get().busy[busyKey]) return;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      const tag = kind === 'background' ? '배경' : '미소녀';
      const dir = kind === 'background' ? 'random-bg' : 'random';
      try {
        // 썸네일 object URL 에서 원본 blob 복구(같은 그림을 그대로 업스케일).
        const src = await (await fetch(result.url)).blob();
        flash(`${scale}배 업스케일 중… (Anlas 소모)`, 'info');
        const { blob } = await upscaleImage({ blob: src, scale, apiKey });
        const fname = `${tag}_업스케일_x${scale}_${timestamp()}.png`;
        downloadBlob(blob, fname);
        void archiveImage(blob, `${dir}/upscaled/${fname}`);
        flash(
          kind === 'background'
            ? `업스케일 완료(${scale}배) — ${fname} 저장. 배경 칸 '↥ 업로드'로 장면에 적용할 수 있어요.`
            : `업스케일 완료(${scale}배) — ${fname} 저장. 캐릭터 표정칸 '↥ 업로드'로 입화에 적용할 수 있어요.`,
          'success',
        );
      } catch (e) {
        flash(`업스케일 실패: ${(e as Error).message}`, 'error');
      } finally {
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
    },

    generateCharacterSprite: async (name, expr, _reference, outfit = '기본', seed) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return undefined;
      const outfitObj = outfit !== '기본' ? char.outfits?.find((o) => o.name === outfit) : undefined;
      if (outfit !== '기본' && !outfitObj) {
        flash(`'${outfit}' 의상을 찾지 못했습니다.`);
        return undefined;
      }
      const exprStore = outfit === '기본' ? char.expressions : outfitObj!.expressions;
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // NovelAI 는 이름 기반 고정 시드로 "같은 인물, 다른 표정"을 유지하므로 기준 입화(reference)가
        // 필요 없다. 그림체 참조(여러 장 vibe)만 로드해 화풍을 반영한다.
        let styleRefs: Blob[] | undefined;
        const ids = get().project.styleRefAssetIds ?? [];
        if (ids.length) {
          const blobs = await Promise.all(ids.map((id) => getAsset(id)));
          styleRefs = blobs.filter((b): b is Blob => !!b);
        }
        // 의상이면 기본 외형에 의상 묘사를 덧붙여 생성(같은 인물, 다른 옷).
        // 묘사칸이 비어있으면 의상 "이름"이라도 옷으로 써서 최소한 그 복장이 나오게 한다.
        const outfitDesc = outfitObj ? outfitObj.appearance?.trim() || outfit : undefined;
        const appearance = outfitDesc
          ? [char.appearance, `복장/의상: ${outfitDesc}`].filter(Boolean).join(', ')
          : char.appearance;
        const tag = outfit === '기본' ? '' : `${outfit} `;
        let promptOverride = await naiCompile(() =>
          compileSpritePrompt({ appearance, emotion: expr, apiKey: translateKey() }),
        );
        // ① 의상 '제외' — 기본 외형에 박힌 옷·소품(예: 재킷, 가방)이 이 의상까지 따라붙는 누수 차단.
        //    제외 태그를 긍정에서 빼고(요청 안 함) + 네거티브로도 억제(positive↔negative 충돌 방지).
        let excludeTags = '';
        if (outfitObj?.exclude?.trim()) {
          excludeTags = stripSubjectTags(
            (await naiCompile(() => compileTags(outfitObj.exclude!.trim(), 'character', translateKey()))) ?? '',
          );
          if (excludeTags && promptOverride) promptOverride = removeMatchingTags(promptOverride, excludeTags);
        }
        // 표정(비-기본)이고 기본 입화가 있으며 mood 가 매핑되면 → Emotion Director 툴로 "표정만" 변경
        // (구도·복장·인물 완벽 보존, 웹 Director 툴과 동일·무료 조건). 실패 시 일반 생성으로 폴백.
        let result: { blob: Blob; source: 'novelai' | 'canvas' } | undefined;
        const mood = expr !== '기본' ? moodFor(expr) : undefined;
        const baseId = exprStore['기본'] ?? char.expressions['기본'];
        if (get().apiKey?.trim() && mood && baseId) {
          const baseBlob = await getAsset(baseId);
          if (baseBlob) {
            try {
              // 표정만 변경 — Director 에 추가 프롬프트(앵커)를 주면 오히려 머리 등을 재해석해 바꿔버려,
              //    앵커 없이 base 이미지 + mood 만으로 호출한다(웹 Director 와 동일·표정만 변경).
              result = await generateExpression(baseBlob, mood, {
                apiKey: get().apiKey,
                bgRemoval: get().bgRemovalMethod,
                defry: get().emotionDefry,
              });
            } catch {
              /* Emotion 툴 실패 → 아래 일반 생성으로 폴백 */
            }
          }
        }
        if (!result) {
          // ② 일관성 — 의상이 달라도 캐릭터 공통 시드로 고정 → 얼굴·포즈 유지, 옷만 변경.
          //    (옷 누수는 ① 의상 '제외'로 차단하므로 의상별 시드 분리가 더는 필요 없다.)
          const effSeed = seed ?? seedFromString(name);
          result = await generateSprite({
            name,
            expression: expr,
            color: char.color,
            apiKey: get().apiKey,
            appearance,
            personality: char.personality,
            styleReferences: styleRefs,
            promptOverride,
            seed: effSeed,
            bgRemoval: get().bgRemovalMethod,
            extraNegative: excludeTags || undefined,
          });
        }
        const { blob, source } = result;
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'sprite',
          prompt: `${name} ${tag}${expr}`,
          mime: 'image/png',
          source,
          filename: `sprite_${name}_${outfit === '기본' ? '' : safeFileName(outfit) + '_'}${expr}.png`,
          createdAt: Date.now(),
        };
        // 비용 들인 AI 입화는 보관 폴더에 사본을 쌓아둔다(재생성해도 원본 보존).
        if (source !== 'canvas') {
          const sub = outfit === '기본' ? '' : `${safeFileName(outfit)}/`;
          void archiveImage(blob, `characters/${safeFileName(name)}/${sub}${safeFileName(expr)}_${timestamp()}.png`);
        }
        const prev = exprStore[expr];
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            characters: withSpriteAsset(s.project.characters, name, outfit, expr, id),
          },
        }));
        if (prev) await deleteAsset(prev).catch(() => {});
        autoSave();
        return blob;
      } catch (e) {
        flash(`스프라이트 생성 실패: ${(e as Error).message}`);
        return undefined;
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    generateCharacterSprites: async (name, outfit = '기본') => {
      // NovelAI 는 이름 기반 고정 시드로 표정별 인물 일관성을 유지하므로 각 표정을 독립 생성한다.
      const exprs = projectExpressions(get().project);
      for (const expr of exprs) {
        await get().generateCharacterSprite(name, expr, undefined, outfit);
      }
      flash(`${name}${outfit === '기본' ? '' : ` · ${outfit}`} 스프라이트 ${exprs.length}종 생성 완료.`);
    },

    generateCharacterBase: async (name, outfit = '기본') => {
      const blob = await get().generateCharacterSprite(name, '기본', undefined, outfit);
      if (blob) {
        flash(
          `${name}${outfit === '기본' ? '' : ` · ${outfit}`} 기본 입화를 만들었어요. 표정 썸네일을 눌러 하나씩 생성하면 이 기본을 기준으로 그려집니다(토큰 절약).`,
        );
      }
    },

    refineSprite: async (name, expr, instruction, outfit = '기본') => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('이미지 수정은 이미지 API 키가 필요합니다.');
      if (!instruction.trim()) return;
      const outfitObj = outfit !== '기본' ? char.outfits?.find((o) => o.name === outfit) : undefined;
      if (outfit !== '기본' && !outfitObj) return flash(`'${outfit}' 의상을 찾지 못했습니다.`);
      const exprStore = outfit === '기본' ? char.expressions : outfitObj!.expressions;
      const curId = exprStore[expr];
      if (!curId) return flash('먼저 이 표정 입화를 생성하세요.');
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // 무료(text2img) 재생성: 외형 설명에 수정 지시를 더해 같은 시드로 다시 그린다(Anlas 0, 실제 반영).
        const outfitDesc = outfitObj ? outfitObj.appearance?.trim() || outfit : undefined;
        const baseApp = outfitDesc
          ? [char.appearance, `복장/의상: ${outfitDesc}`].filter(Boolean).join(', ')
          : char.appearance;
        const appearance = [baseApp, instruction].filter(Boolean).join(', ');
        const promptOverride = await naiCompile(() =>
          compileSpritePrompt({ appearance, emotion: expr, apiKey: translateKey() }),
        );
        const { blob, source } = await generateSprite({
          name,
          expression: expr,
          color: char.color,
          apiKey,
          appearance,
          personality: char.personality,
          promptOverride,
          bgRemoval: get().bgRemovalMethod,
        });
        const id = assetId();
        await putAsset(id, blob);
        const tag = outfit === '기본' ? '' : `${outfit} `;
        const meta: AssetMeta = {
          id,
          kind: 'sprite',
          prompt: `${name} ${tag}${expr} 수정: ${instruction}`,
          mime: 'image/png',
          source,
          filename: `sprite_${name}_${outfit === '기본' ? '' : safeFileName(outfit) + '_'}${expr}.png`,
          createdAt: Date.now(),
        };
        const sub = outfit === '기본' ? '' : `${safeFileName(outfit)}/`;
        void archiveImage(blob, `characters/${safeFileName(name)}/${sub}${safeFileName(expr)}_수정_${timestamp()}.png`);
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            characters: withSpriteAsset(s.project.characters, name, outfit, expr, id),
          },
        }));
        await deleteAsset(curId).catch(() => {});
        autoSave();
        flash(`${name} · ${tag}${expr} 입화를 수정했습니다.`);
      } catch (e) {
        flash(`수정 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    refineSpritePrecise: async (name, expr, instruction, outfit = '기본') => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('정밀 수정은 이미지 API 키가 필요합니다.');
      if (!instruction.trim()) return;
      const outfitObj = outfit !== '기본' ? char.outfits?.find((o) => o.name === outfit) : undefined;
      if (outfit !== '기본' && !outfitObj) return flash(`'${outfit}' 의상을 찾지 못했습니다.`);
      const exprStore = outfit === '기본' ? char.expressions : outfitObj!.expressions;
      const curId = exprStore[expr];
      if (!curId) return flash('먼저 이 표정 입화를 생성하세요.');
      const src = await getAsset(curId);
      if (!src) return flash('원본 입화를 찾지 못했습니다.');
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // 원본 이미지 보존(img2img) + 외형·지시 컴파일 프롬프트로 정밀 변형. 포즈·구도 유지, Anlas 소모.
        const outfitDesc = outfitObj ? outfitObj.appearance?.trim() || outfit : undefined;
        const baseApp = outfitDesc
          ? [char.appearance, `복장/의상: ${outfitDesc}`].filter(Boolean).join(', ')
          : char.appearance;
        const appearance = [baseApp, instruction].filter(Boolean).join(', ');
        const promptOverride = await naiCompile(() =>
          compileSpritePrompt({ appearance, emotion: expr, apiKey: translateKey() }),
        );
        const { blob, source } = await editImage({
          blob: src,
          instruction: promptOverride || appearance,
          apiKey,
          kind: 'sprite',
          strength: 0.55,
          bgRemoval: get().bgRemovalMethod,
        });
        const id = assetId();
        await putAsset(id, blob);
        const tag = outfit === '기본' ? '' : `${outfit} `;
        const meta: AssetMeta = {
          id,
          kind: 'sprite',
          prompt: `${name} ${tag}${expr} 정밀수정: ${instruction}`,
          mime: 'image/png',
          source,
          filename: `sprite_${name}_${outfit === '기본' ? '' : safeFileName(outfit) + '_'}${expr}.png`,
          createdAt: Date.now(),
        };
        const sub = outfit === '기본' ? '' : `${safeFileName(outfit)}/`;
        void archiveImage(blob, `characters/${safeFileName(name)}/${sub}${safeFileName(expr)}_정밀수정_${timestamp()}.png`);
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            characters: withSpriteAsset(s.project.characters, name, outfit, expr, id),
          },
        }));
        await deleteAsset(curId).catch(() => {});
        autoSave();
        flash(`${name} · ${tag}${expr} 정밀 수정 완료(원본 유지·Anlas 소모).`);
      } catch (e) {
        flash(`정밀 수정 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    refineCharacterDesign: async (name, instruction) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('이미지 수정은 이미지 API 키가 필요합니다.');
      if (!instruction.trim()) return;
      const baseId = char.expressions['기본'];
      if (!baseId) return flash('먼저 ① 기본 입화를 생성하세요.');
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // 디자인 수정 = 외형 설명에 지시를 영구 반영 → 모든 표정을 무료(text2img)로 다시 그린다(Anlas 0).
        const newAppearance = [char.appearance, instruction].filter(Boolean).join(', ');
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.name === name ? { ...c, appearance: newAppearance } : c,
            ),
          },
        }));
        autoSave();
        // 구조 변경(머리 길이 등)이 실제 반영되도록 새 시드로 리롤. 모든 표정은 이 시드를 공유해 일관성 유지.
        const designSeed = Math.floor(Math.random() * 4_294_967_295);
        const have = projectExpressions(get().project).filter((e) => char.expressions[e as Expression]);
        const ordered = have.includes('기본') ? have : ['기본', ...have];
        for (const expr of ordered) {
          await get().generateCharacterSprite(name, expr as Expression, undefined, '기본', designSeed);
        }
        flash(`${name} 디자인을 수정하고 표정 ${ordered.length}종을 다시 그렸습니다(무료·구조 변경 반영).`);
      } catch (e) {
        flash(`디자인 수정 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    clearCharacterSprites: async (name) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      for (const id of Object.values(char.expressions)) {
        if (id) await deleteAsset(id).catch(() => {});
      }
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === name ? { ...c, expressions: {} } : c,
          ),
        },
      }));
      autoSave();
      flash(`${name} 스프라이트를 비웠습니다.`);
    },

    addStyleRef: async (file) => {
      try {
        const id = await uploadAsset(file, 'sprite', `style_ref_${Date.now().toString(36)}.png`);
        set((s) => ({
          project: { ...s.project, styleRefAssetIds: [...(s.project.styleRefAssetIds ?? []), id] },
        }));
        autoSave();
        const n = get().project.styleRefAssetIds?.length ?? 1;
        flash(`그림체 참조를 추가했습니다(${n}장). 기본 입화 생성 시 이 화풍들을 참고합니다(인물은 외형 설명대로).`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    removeStyleRef: async (id) => {
      await deleteAsset(id).catch(() => {});
      set((s) => ({
        project: { ...s.project, styleRefAssetIds: (s.project.styleRefAssetIds ?? []).filter((x) => x !== id) },
      }));
      autoSave();
      flash('그림체 참조 1장을 제거했습니다.');
    },

    clearStyleRefs: async () => {
      const ids = get().project.styleRefAssetIds ?? [];
      for (const id of ids) await deleteAsset(id).catch(() => {});
      set((s) => {
        const project = { ...s.project };
        delete project.styleRefAssetIds;
        return { project };
      });
      autoSave();
      flash('그림체 참조를 모두 해제했습니다.');
    },

    updateCharacter: (name, patch) => {
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) => (c.name === name ? { ...c, ...patch } : c)),
        },
      }));
      autoSave();
    },

    addExpression: (name) => {
      const n = name.trim();
      if (!n) return;
      const cur = effectiveExpressions(get().project.expressions);
      if (cur.includes(n)) return flash('이미 있는 표정입니다.');
      set((s) => ({ project: { ...s.project, expressions: [...cur, n] } }));
      autoSave();
      flash(`'${n}' 표정을 추가했습니다.`);
    },

    renameExpression: (oldName, newName) => {
      const next = newName.trim();
      if (oldName === '기본') return flash('기본 표정은 이름을 바꿀 수 없습니다.');
      if (!next || next === oldName) return;
      const cur = effectiveExpressions(get().project.expressions);
      if (!cur.includes(oldName)) return;
      if (cur.includes(next)) return flash('이미 있는 표정 이름입니다.');
      set((s) => ({
        project: {
          ...s.project,
          expressions: cur.map((e) => (e === oldName ? next : e)),
          // 각 캐릭터의 표정→에셋 키 이전(이미 만든 입화 유지).
          characters: s.project.characters.map((c) => {
            if (!(oldName in c.expressions)) return c;
            const ex = { ...c.expressions };
            ex[next] = ex[oldName];
            delete ex[oldName];
            return { ...c, expressions: ex };
          }),
          // 대사에 지정된 표정 이름도 함께 이전.
          scenes: s.project.scenes.map((sc) => ({
            ...sc,
            lines: sc.lines.map((l) =>
              l.kind === 'dialogue' && l.emotion === oldName ? { ...l, emotion: next } : l,
            ),
          })),
        },
      }));
      autoSave();
      flash(`표정 이름을 '${oldName}' → '${next}' 로 바꿨습니다.`);
    },

    removeExpression: async (name) => {
      if (name === '기본') return flash('기본 표정은 삭제할 수 없습니다.');
      const cur = effectiveExpressions(get().project.expressions);
      if (!cur.includes(name)) return;
      // 해당 표정으로 만든 입화 에셋 수집(삭제용).
      const toDelete: string[] = [];
      for (const c of get().project.characters) {
        const id = c.expressions[name];
        if (id) toDelete.push(id);
      }
      set((s) => ({
        project: {
          ...s.project,
          expressions: cur.filter((e) => e !== name),
          characters: s.project.characters.map((c) => {
            if (!(name in c.expressions)) return c;
            const ex = { ...c.expressions };
            delete ex[name];
            return { ...c, expressions: ex };
          }),
        },
      }));
      for (const id of toDelete) await deleteAsset(id).catch(() => {});
      autoSave();
      flash(`'${name}' 표정을 삭제했습니다.`);
    },

    addOutfit: (charName, name, appearance) => {
      const n = name.trim();
      if (!n) return;
      if (n === '기본') return flash("'기본'은 예약된 의상 이름입니다.");
      const char = get().project.characters.find((c) => c.name === charName);
      if (!char) return;
      if (char.outfits?.some((o) => o.name === n)) return flash('이미 있는 의상입니다.');
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === charName
              ? {
                  ...c,
                  outfits: [
                    ...(c.outfits ?? []),
                    { name: n, appearance: appearance?.trim() || undefined, expressions: {} },
                  ],
                }
              : c,
          ),
        },
      }));
      autoSave();
      flash(`'${charName}'에 '${n}' 의상을 추가했습니다. 복장 묘사를 적고 입화를 생성하세요.`);
    },

    setOutfitAppearance: (charName, name, appearance) => {
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === charName
              ? {
                  ...c,
                  // 입력 중에는 원본 그대로 저장(여기서 trim 하면 단어 사이 띄어쓰기를 못 침). trim 은 생성 시.
                  outfits: (c.outfits ?? []).map((o) =>
                    o.name === name ? { ...o, appearance } : o,
                  ),
                }
              : c,
          ),
        },
      }));
      autoSave();
    },

    setOutfitExclude: (charName, name, exclude) => {
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === charName
              ? {
                  ...c,
                  // 입력 중에는 원본 그대로 저장(trim 은 생성 시).
                  outfits: (c.outfits ?? []).map((o) =>
                    o.name === name ? { ...o, exclude } : o,
                  ),
                }
              : c,
          ),
        },
      }));
      autoSave();
    },

    removeOutfit: async (charName, name) => {
      const char = get().project.characters.find((c) => c.name === charName);
      const o = char?.outfits?.find((x) => x.name === name);
      if (!o) return;
      const toDelete = Object.values(o.expressions).filter((x): x is string => !!x);
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === charName ? { ...c, outfits: (c.outfits ?? []).filter((x) => x.name !== name) } : c,
          ),
          // 이 의상을 가리키던 장면 #복장 참조도 제거(기본 의상으로 복귀).
          scenes: s.project.scenes.map((sc) => {
            if (!sc.outfits || sc.outfits[charName] !== name) return sc;
            const m = { ...sc.outfits };
            delete m[charName];
            return { ...sc, outfits: m };
          }),
        },
      }));
      for (const id of toDelete) await deleteAsset(id).catch(() => {});
      autoSave();
      flash(`'${charName}'의 '${name}' 의상을 삭제했습니다.`);
    },

    generateBackground: async (sceneId) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const key = `${sceneId}:bg`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // 상세 프롬프트가 있으면 그것으로, 없으면 배경 이름으로 생성(이름은 항상 라벨로 유지).
        const detail = get().project.backgroundPrompts?.[backgroundKey(scene)]?.trim();
        const prompt = buildBackgroundPrompt(detail || scene.background, scene.title, scene.direction);
        const { project, apiKey } = get();
        const promptOverride = await naiCompile(() =>
          compileScenePrompt({
            text: [detail || scene.background || scene.title, ...scene.direction].filter(Boolean).join(', '),
            apiKey: translateKey(),
          }),
        );
        const { blob, source } = await generateImage({
          prompt,
          promptOverride,
          label: scene.background || scene.title,
          width: project.width,
          height: project.height,
          apiKey,
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'background',
          prompt,
          mime: 'image/png',
          source,
          filename: `bg_${sceneId}.png`,
          createdAt: Date.now(),
        };
        // 비용 들인 AI 배경은 보관 폴더에 사본을 쌓아둔다(재생성해도 원본 보존).
        if (source !== 'canvas') {
          void archiveImage(blob, `backgrounds/${safeFileName(scene.background || scene.title)}_${timestamp()}.png`);
        }
        // 같은 배경 이름을 쓰는 모든 장면에 함께 적용(생성 1회 = 일관성 + 비용 절감).
        const bkey = backgroundKey(scene);
        const { scenes, prevs, count } = applyBackgroundToGroup(get().project.scenes, bkey, id);
        set((s) => ({ assets: { ...s.assets, [id]: meta }, project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(
          count > 1
            ? `'${bkey}' 배경을 ${count}개 장면에 적용했습니다.`
            : source !== 'canvas'
              ? 'AI 배경을 생성했습니다.'
              : '임시 배경(Canvas)을 생성했습니다.',
        );
      } catch (e) {
        flash(`배경 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    refineBackground: async (sceneId, instruction) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('이미지 수정은 이미지 API 키가 필요합니다.');
      if (!instruction.trim()) return;
      if (!scene.backgroundAssetId) return flash('먼저 배경을 생성하세요.');
      const src = await getAsset(scene.backgroundAssetId);
      if (!src) return flash('원본 배경을 찾지 못했습니다.');
      const key = `${sceneId}:bg`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // 지시문을 영문 단부루 태그로 변환(NovelAI 는 한글을 못 알아듣는다 — 좌측 '한국어→영문' 설정).
        const instrEn =
          (await naiCompile(() => compileTags(instruction, 'scene', translateKey()))) ?? instruction;
        const { blob, source } = await editImage({
          blob: src,
          instruction: instrEn,
          apiKey,
          kind: 'background',
          // 화풍 드리프트 최소화: 기본 0.5 → 0.4(원본 더 보존, 미세 수정 위주).
          // 소형 img2img(≤1MP·≤28스텝·1장)는 Opus 무료라 Anlas 0(실측 확인).
          strength: 0.4,
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'background',
          prompt: `${scene.background || scene.title} 수정: ${instruction}`,
          mime: 'image/png',
          source,
          filename: `bg_${sceneId}.png`,
          createdAt: Date.now(),
        };
        void archiveImage(blob, `backgrounds/${safeFileName(scene.background || scene.title)}_수정_${timestamp()}.png`);
        const bkey = backgroundKey(scene);
        const { scenes, prevs, count } = applyBackgroundToGroup(get().project.scenes, bkey, id);
        set((s) => ({ assets: { ...s.assets, [id]: meta }, project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(count > 1 ? `수정한 배경을 ${count}개 장면에 적용했습니다.` : '배경을 수정했습니다.');
      } catch (e) {
        flash(`배경 수정 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    generateBgm: async (sceneId, opts) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const key = `${sceneId}:bgm`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        const prompt = [scene.bgm, scene.title, ...scene.direction].filter(Boolean).join(' ');
        const { blob, moodName } = await synthBgm(prompt, opts);
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'bgm',
          prompt,
          mime: 'audio/wav',
          source: 'synth',
          filename: `bgm_${sceneId}.wav`,
          createdAt: Date.now(),
        };
        // 만든 BGM 도 보관 폴더에 사본 저장(재생성해도 원본 보존).
        void archiveImage(blob, `music/${safeFileName(scene.bgm || scene.title)}_${timestamp()}.wav`);
        // 같은 BGM 이름을 쓰는 모든 장면에 함께 적용.
        const key = bgmKey(scene);
        const targets = get().project.scenes.filter((sc) => bgmKey(sc) === key);
        const prevs = new Set(
          targets.map((t) => t.bgmAssetId).filter((x): x is string => !!x && x !== id),
        );
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              bgmKey(sc) === key
                ? { ...sc, bgmAssetId: id, ...(sc.id === sceneId ? { bgm: scene.bgm || scene.title } : {}) }
                : sc,
            ),
          },
        }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(
          targets.length > 1
            ? `'${key}' BGM을 ${targets.length}개 장면에 적용했습니다.`
            : `BGM 생성 완료 (${moodName}).`,
        );
      } catch (e) {
        flash(`BGM 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    // 고유 배경 이름마다 1회 생성(이미 있으면 건너뜀; force=true 면 전체 재생성).
    // generateBackground 가 같은 이름 모든 장면에 전파하므로 그룹당 1회면 충분.
    generateAllBackgrounds: async (force = false) => {
      const seen = new Map<string, { repId: string; hasAsset: boolean }>();
      for (const s of get().project.scenes) {
        const k = backgroundKey(s);
        const e = seen.get(k);
        if (!e) seen.set(k, { repId: s.id, hasAsset: !!s.backgroundAssetId });
        else if (s.backgroundAssetId) e.hasAsset = true;
      }
      const todo = [...seen.values()].filter((e) => force || !e.hasAsset);
      if (todo.length === 0) {
        flash('이미 모든 배경이 생성되어 있습니다.');
        return;
      }
      set((s) => ({ busy: { ...s.busy, 'batch:bg': true } }));
      let done = 0;
      for (const e of todo) {
        flash(`배경 생성 중… (${++done}/${todo.length})`, 'info');
        await get().generateBackground(e.repId);
      }
      set((s) => ({ busy: { ...s.busy, 'batch:bg': false } }));
      flash(`배경 ${todo.length}종을 생성했습니다.`, 'success');
    },

    generateAllBgm: async (force = false) => {
      const seen = new Map<string, { repId: string; hasAsset: boolean }>();
      for (const s of get().project.scenes) {
        if (!(s.bgm || s.bgmAssetId)) continue; // BGM 지정 장면만
        const k = bgmKey(s);
        const e = seen.get(k);
        if (!e) seen.set(k, { repId: s.id, hasAsset: !!s.bgmAssetId });
        else if (s.bgmAssetId) e.hasAsset = true;
      }
      const todo = [...seen.values()].filter((e) => force || !e.hasAsset);
      if (todo.length === 0) {
        flash('이미 모든 BGM이 생성되어 있습니다.');
        return;
      }
      set((s) => ({ busy: { ...s.busy, 'batch:bgm': true } }));
      let done = 0;
      for (const e of todo) {
        flash(`BGM 생성 중… (${++done}/${todo.length})`, 'info');
        await get().generateBgm(e.repId);
      }
      set((s) => ({ busy: { ...s.busy, 'batch:bgm': false } }));
      flash(`BGM ${todo.length}종을 생성했습니다.`, 'success');
    },

    importBackground: async (sceneId, file) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      try {
        const id = await uploadAsset(file, 'background', `bg_${sceneId}.png`);
        const bkey = backgroundKey(scene);
        const { scenes, prevs, count } = applyBackgroundToGroup(get().project.scenes, bkey, id);
        set((s) => ({ project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(
          count > 1
            ? `업로드한 배경을 ${count}개 장면에 적용했습니다.`
            : '업로드한 배경을 적용했습니다.',
        );
      } catch (e) {
        flash((e as Error).message);
      }
    },

    importSprite: async (name, expr, file, outfit = '기본') => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      const outfitObj = outfit !== '기본' ? char.outfits?.find((o) => o.name === outfit) : undefined;
      if (outfit !== '기본' && !outfitObj) return flash(`'${outfit}' 의상을 찾지 못했습니다.`);
      const exprStore = outfit === '기본' ? char.expressions : outfitObj!.expressions;
      try {
        const sub = outfit === '기본' ? '' : safeFileName(outfit) + '_';
        const id = await uploadAsset(file, 'sprite', `sprite_${name}_${sub}${expr}.png`);
        const prev = exprStore[expr];
        set((s) => ({
          project: {
            ...s.project,
            characters: withSpriteAsset(s.project.characters, name, outfit, expr, id),
          },
        }));
        if (prev) await deleteAsset(prev).catch(() => {});
        autoSave();
        flash(`${name} · ${outfit === '기본' ? '' : outfit + ' '}${expr} 입화를 업로드했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    generateCg: async (desc) => {
      const key = desc.trim();
      if (!key) return flash('CG 설명이 비어 있습니다.');
      const { apiKey, project } = get();
      const using = project.scenes.filter((s) => s.cg.some((d) => d.trim() === key));
      if (using.length === 0) return;
      const busyKey = `cg:${key}`;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      try {
        const prompt = buildCgPrompt(key, using[0].direction);
        const promptOverride = await naiCompile(() =>
          compileCgPrompt({ text: [key, ...using[0].direction].filter(Boolean).join(', '), apiKey: translateKey() }),
        );
        const { blob, source } = await generateImage({
          prompt,
          promptOverride,
          label: key,
          width: project.width,
          height: project.height,
          apiKey,
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'cg',
          prompt,
          mime: 'image/png',
          source,
          filename: `cg_${Date.now().toString(36)}.png`,
          createdAt: Date.now(),
        };
        // 비용 들인 AI CG 도 보관 폴더에 사본 저장(재생성해도 원본 보존).
        if (source !== 'canvas') void archiveImage(blob, `cg/${safeFileName(key)}_${timestamp()}.png`);
        // 같은 설명(컷)을 쓰는 모든 장면의 해당 인덱스에 적용.
        const { scenes, prevs } = applyCgToGroup(get().project.scenes, key, id);
        set((s) => ({ assets: { ...s.assets, [id]: meta }, project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(source !== 'canvas' ? 'CG 컷을 생성했습니다.' : '임시 CG(Canvas)를 생성했습니다.');
      } catch (e) {
        flash(`CG 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
    },

    generateCgWithCharacter: async (desc, characterName) => {
      const key = desc.trim();
      if (!key) return flash('CG 설명이 비어 있습니다.');
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('캐릭터 참조 CG 는 이미지 API 키가 필요합니다.');
      const { project } = get();
      const using = project.scenes.filter((s) => s.cg.some((d) => d.trim() === key));
      if (using.length === 0) return;
      const char = project.characters.find((c) => c.name === characterName);
      const baseId = char?.expressions['기본'];
      if (!baseId) return flash(`${characterName}의 ① 기본 입화를 먼저 생성하세요.`);
      const charBlob = await getAsset(baseId);
      if (!charBlob) return flash('캐릭터 기본 입화 원본을 찾지 못했습니다.');
      // 같은 컷을 쓰는 장면 중 배경이 있으면 그 배경도 소스로 함께 준다.
      const bgId = using.find((s) => s.backgroundAssetId)?.backgroundAssetId;
      const bgBlob = bgId ? (await getAsset(bgId)) ?? undefined : undefined;
      const busyKey = `cg:${key}`;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      try {
        // 장면 설명·연출을 영문 태그로 변환(NovelAI 는 한글을 못 읽는다 — 좌측 '한국어→영문' 설정).
        const promptOverride = await naiCompile(() =>
          compileCgPrompt({ text: [key, ...using[0].direction].filter(Boolean).join(', '), apiKey: translateKey() }),
        );
        const { blob, source } = await generateCgFromReference({
          description: key,
          directions: using[0].direction,
          character: charBlob,
          background: bgBlob,
          apiKey,
          promptOverride,
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'cg',
          prompt: `${key} (참조: ${characterName}${bgBlob ? '+배경' : ''})`,
          mime: 'image/png',
          source,
          filename: `cg_${Date.now().toString(36)}.png`,
          createdAt: Date.now(),
        };
        if (source !== 'canvas')
          void archiveImage(blob, `cg/${safeFileName(key)}_${safeFileName(characterName)}_${timestamp()}.png`);
        const { scenes, prevs } = applyCgToGroup(get().project.scenes, key, id);
        set((s) => ({ assets: { ...s.assets, [id]: meta }, project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(`${characterName}${bgBlob ? '·배경' : ''} 참조 CG 를 생성했습니다.`);
      } catch (e) {
        flash(`참조 CG 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
    },

    refineCg: async (desc, instruction) => {
      const key = desc.trim();
      if (!key) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('이미지 수정은 이미지 API 키가 필요합니다.');
      if (!instruction.trim()) return;
      // 이 컷의 현재 대표 에셋 찾기.
      let curId: string | undefined;
      outer: for (const sc of get().project.scenes) {
        for (let i = 0; i < sc.cg.length; i++) {
          if (sc.cg[i].trim() === key && sc.cgAssetIds?.[i]) {
            curId = sc.cgAssetIds[i];
            break outer;
          }
        }
      }
      if (!curId) return flash('먼저 이 CG 컷을 생성하세요.');
      const src = await getAsset(curId);
      if (!src) return flash('원본 CG 를 찾지 못했습니다.');
      const busyKey = `cg:${key}`;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      try {
        // 지시문을 영문 단부루 태그로 변환(NovelAI 는 한글을 못 알아듣는다 — 좌측 '한국어→영문' 설정).
        const instrEn =
          (await naiCompile(() => compileTags(instruction, 'cg', translateKey()))) ?? instruction;
        const { blob, source } = await editImage({
          blob: src,
          instruction: instrEn,
          apiKey,
          kind: 'background',
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'cg',
          prompt: `${key} 수정: ${instruction}`,
          mime: 'image/png',
          source,
          filename: `cg_${Date.now().toString(36)}.png`,
          createdAt: Date.now(),
        };
        void archiveImage(blob, `cg/${safeFileName(key)}_수정_${timestamp()}.png`);
        const { scenes, prevs } = applyCgToGroup(get().project.scenes, key, id);
        set((s) => ({ assets: { ...s.assets, [id]: meta }, project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash('CG 를 수정했습니다.');
      } catch (e) {
        flash(`CG 수정 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
    },

    importCg: async (sceneId, index, file) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      try {
        const id = await uploadAsset(file, 'cg', `cg_${sceneId}_${index + 1}.png`);
        const arr = [...(scene.cgAssetIds ?? [])];
        while (arr.length <= index) arr.push('');
        const prev = arr[index];
        arr[index] = id;
        get().updateScene(sceneId, { cgAssetIds: arr });
        if (prev) await deleteAsset(prev).catch(() => {});
        flash('업로드한 CG를 적용했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearCg: async (sceneId, index) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene?.cgAssetIds) return;
      const arr = [...scene.cgAssetIds];
      const prev = arr[index];
      arr[index] = '';
      if (prev) await deleteAsset(prev).catch(() => {});
      get().updateScene(sceneId, { cgAssetIds: arr });
      flash('CG 업로드를 해제했습니다(Canvas 임시로 복귀).');
    },

    // 같은 배경 이름을 쓰는 모든 장면의 배경 이름을 한 번에 변경(라이브러리 편집).
    renameBackgroundGroup: (key, name) => {
      const next = name.trim();
      set((s) => {
        // 상세 프롬프트는 이름(키)에 묶여 있으므로 새 이름으로 이전한다(유실 방지).
        const bp = { ...(s.project.backgroundPrompts ?? {}) };
        if (key in bp && next && next !== key) {
          bp[next] = bp[key];
          delete bp[key];
        }
        return {
          project: {
            ...s.project,
            backgroundPrompts: bp,
            scenes: s.project.scenes.map((sc) =>
              backgroundKey(sc) === key ? { ...sc, background: name } : sc,
            ),
          },
        };
      });
      autoSave();
    },

    setBackgroundPrompt: (key, prompt) => {
      set((s) => {
        const bp = { ...(s.project.backgroundPrompts ?? {}) };
        if (prompt.trim()) bp[key] = prompt;
        else delete bp[key];
        return { project: { ...s.project, backgroundPrompts: bp } };
      });
      autoSave();
    },

    generateBackgroundFromRef: async (sceneId, refKey) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('기준 배경 참조 생성은 이미지 API 키가 필요합니다.');
      // 참조 배경의 현재 에셋을 찾는다.
      const refScene = get().project.scenes.find((s) => backgroundKey(s) === refKey && s.backgroundAssetId);
      if (!refScene?.backgroundAssetId) return flash('참조할 배경을 먼저 생성하세요.');
      const refBlob = await getAsset(refScene.backgroundAssetId);
      if (!refBlob) return flash('참조 배경 원본을 찾지 못했습니다.');
      const key = `${sceneId}:bg`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        const { project } = get();
        const detail = project.backgroundPrompts?.[backgroundKey(scene)]?.trim();
        const want = detail || scene.background || scene.title;
        // 바꿀 장면을 영문 태그로 변환(NovelAI 는 한글 문장을 못 알아듣는다). 장소·구도·화풍 유지는
        // base 이미지가 담당하므로, 지시문엔 "목표 장면"만 영문 태그로 준다.
        const wantText = [want, ...scene.direction].filter(Boolean).join(', ');
        const promptEn =
          (await naiCompile(() => compileScenePrompt({ text: wantText, apiKey: translateKey() }))) ??
          buildBackgroundPrompt(want, scene.title, scene.direction);
        const { blob, source } = await editImage({
          blob: refBlob,
          instruction: promptEn,
          apiKey,
          kind: 'background',
          strength: 0.6, // 참조(장소·화풍)는 유지하되 시간대·조명 변경이 실제로 걸리게(0.5→0.6)
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'background',
          prompt: `${want} (참조: ${refKey})`,
          mime: 'image/png',
          source,
          filename: `bg_${sceneId}.png`,
          createdAt: Date.now(),
        };
        if (source !== 'canvas')
          void archiveImage(blob, `backgrounds/${safeFileName(scene.background || scene.title)}_참조_${timestamp()}.png`);
        const bkey = backgroundKey(scene);
        const { scenes, prevs } = applyBackgroundToGroup(get().project.scenes, bkey, id);
        set((s) => ({ assets: { ...s.assets, [id]: meta }, project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(`'${refKey}' 기준으로 일관된 배경을 생성했습니다.`);
      } catch (e) {
        flash(`참조 배경 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
    },

    renameCgGroup: (oldDesc, newDesc) => {
      const oldKey = oldDesc.trim();
      const next = newDesc.trim();
      if (!oldKey || oldKey === next) return;
      // 설명만 바꾸고 cgAssetIds(인덱스 기준)는 그대로 두어 이미 만든 이미지를 유지한다.
      set((s) => ({
        project: {
          ...s.project,
          scenes: s.project.scenes.map((sc) =>
            sc.cg.some((d) => d.trim() === oldKey)
              ? { ...sc, cg: sc.cg.map((d) => (d.trim() === oldKey ? next : d)) }
              : sc,
          ),
        },
      }));
      autoSave();
    },

    // CG: 같은 설명(컷)을 쓰는 모든 장면에 업로드본을 한 번에 적용.
    importCgGroup: async (desc, file) => {
      const key = desc.trim();
      try {
        const id = await uploadAsset(file, 'cg', `cg_${Date.now().toString(36)}.png`);
        const { scenes, prevs } = applyCgToGroup(get().project.scenes, key, id);
        set((s) => ({ project: { ...s.project, scenes } }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash('업로드한 CG를 같은 컷의 모든 장면에 적용했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearCgGroup: async (desc) => {
      const key = desc.trim();
      const prevs = new Set<string>();
      set((s) => ({
        project: {
          ...s.project,
          scenes: s.project.scenes.map((sc) => {
            if (!sc.cgAssetIds || !sc.cg.some((d) => d.trim() === key)) return sc;
            const arr = [...sc.cgAssetIds];
            sc.cg.forEach((d, i) => {
              if (d.trim() === key && arr[i]) {
                prevs.add(arr[i]);
                arr[i] = '';
              }
            });
            return { ...sc, cgAssetIds: arr };
          }),
        },
      }));
      autoSave();
      for (const p of prevs) await deleteAsset(p).catch(() => {});
      flash('CG 업로드를 해제했습니다(Canvas 임시로 복귀).');
    },

    importMenuArt: async (which, file) => {
      try {
        const id = await uploadAsset(file, 'background', `${which === 'main' ? 'main_menu' : 'game_menu'}.png`);
        const prev = get().project.menuArt?.[which];
        set((s) => ({ project: { ...s.project, menuArt: { ...s.project.menuArt, [which]: id } } }));
        if (prev) await deleteAsset(prev).catch(() => {});
        autoSave();
        flash(`${which === 'main' ? '메인' : '게임'} 메뉴 배경을 업로드했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    generateMenuArt: async (which, opts) => {
      const { apiKey, project } = get();
      if (!apiKey?.trim()) return flash('타이틀 AI 생성은 이미지 API 키가 필요합니다.');
      const busyKey = `menu:${which}`;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      try {
        const theme = resolveTheme(project.genre, project.guiTheme);
        // 참조: 메인 캐릭터의 기본 입화 + 선택한 배경(있으면)을 소스로 어울리게 합성.
        let charBlob: Blob | undefined;
        if (opts?.charName) {
          const c = project.characters.find((x) => x.name === opts.charName);
          const baseId = c?.expressions['기본'];
          if (baseId) charBlob = (await getAsset(baseId)) ?? undefined;
        }
        let bgBlob: Blob | undefined;
        if (opts?.bgKey) {
          const sc = project.scenes.find((s) => backgroundKey(s) === opts.bgKey && s.backgroundAssetId);
          if (sc?.backgroundAssetId) bgBlob = (await getAsset(sc.backgroundAssetId)) ?? undefined;
        }
        const prompt = buildMenuArtPrompt(project.title, theme.label, project.mood, which);
        // 장르·무드를 영문 태그로 변환(NovelAI 는 한글을 못 읽는다 — 좌측 '한국어→영문' 설정).
        const promptOverride = await naiCompile(() =>
          compileTags([theme.label, project.mood].filter(Boolean).join(', '), 'scene', translateKey()),
        );
        const { blob, source } = await generateMenuArtImage({
          which,
          title: project.title,
          genreLabel: theme.label,
          mood: project.mood,
          character: charBlob,
          background: bgBlob,
          apiKey,
          promptOverride,
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'background',
          prompt,
          mime: 'image/png',
          source,
          filename: `${which === 'main' ? 'main_menu' : 'game_menu'}.png`,
          createdAt: Date.now(),
        };
        if (source !== 'canvas') void archiveImage(blob, `menu/${which}_${timestamp()}.png`);
        const prev = project.menuArt?.[which];
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: { ...s.project, menuArt: { ...s.project.menuArt, [which]: id } },
        }));
        if (prev) await deleteAsset(prev).catch(() => {});
        autoSave();
        flash(
          source !== 'canvas'
            ? `${which === 'main' ? '타이틀' : '게임 메뉴'} 배경을 AI 로 생성했습니다.`
            : '임시(Canvas) 배경을 생성했습니다.',
        );
      } catch (e) {
        flash(`타이틀 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
    },

    clearMenuArt: async (which) => {
      const prev = get().project.menuArt?.[which];
      if (prev) await deleteAsset(prev).catch(() => {});
      set((s) => {
        const menuArt = { ...s.project.menuArt };
        delete menuArt[which];
        return { project: { ...s.project, menuArt } };
      });
      autoSave();
      flash(`${which === 'main' ? '메인' : '게임'} 메뉴 배경 업로드를 해제했습니다(Canvas 생성으로 복귀).`);
    },

    assetUrl: (id) => getAssetUrl(id ?? ''),

    setApiKey: (key) => {
      set({ apiKey: key });
      saveApiKey(key);
    },

    setOpenaiKey: (key) => {
      set({ openaiKey: key });
      try {
        localStorage.setItem('na_openai_key', key);
      } catch {
        /* ignore */
      }
    },

    setPromptLang: (lang) => {
      set({ promptLang: lang });
      try {
        localStorage.setItem('na_prompt_lang', lang);
      } catch {
        /* ignore */
      }
    },

    setNaiMode: (m) => {
      // 생성기(naiActiveSizes/Steps)가 읽는 단일 소스 = aiConfig 모드. 함께 갱신.
      aiConfig.image.novelai.mode = m;
      set({ naiMode: m });
      try {
        localStorage.setItem('na_nai_mode', m);
      } catch {
        /* ignore */
      }
    },

    setBgRemovalMethod: (m) => {
      set({ bgRemovalMethod: m });
      try {
        localStorage.setItem('na_bg_method', m);
      } catch {
        /* ignore */
      }
    },

    setEmotionDefry: (n) => {
      const v = Math.max(0, Math.min(5, Math.round(n)));
      set({ emotionDefry: v });
      try {
        localStorage.setItem('na_emotion_defry', String(v));
      } catch {
        /* ignore */
      }
    },

    save: () => {
      const { project, assets } = get();
      try {
        saveProject(project, assets);
        flash('현재 작업을 저장했습니다.');
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    },

    hydrate: () => {
      const loaded = loadProject();
      const apiKey = loadApiKey();
      const savedMode = (() => {
        try {
          return localStorage.getItem('na_nai_mode') as NaiMode | null;
        } catch {
          return null;
        }
      })();
      const openaiKey = (() => {
        try {
          return localStorage.getItem('na_openai_key') ?? '';
        } catch {
          return '';
        }
      })();
      set({ openaiKey });
      const savedLang = (() => {
        try {
          return localStorage.getItem('na_prompt_lang');
        } catch {
          return null;
        }
      })();
      if (savedLang === 'ko' || savedLang === 'en') set({ promptLang: savedLang });
      try {
        const m = localStorage.getItem('na_bg_method');
        if (m === 'browser' || m === 'ai' || m === 'novelai' || m === 'none') set({ bgRemovalMethod: m });
      } catch {
        /* ignore */
      }
      try {
        const d = localStorage.getItem('na_emotion_defry');
        if (d !== null && /^[0-5]$/.test(d)) set({ emotionDefry: Number(d) });
      } catch {
        /* ignore */
      }
      if (loaded) {
        set({ project: loaded.project, assets: loaded.assets, apiKey, selectedSceneId: loaded.project.scenes[0]?.id ?? null });
      } else {
        set({ apiKey });
      }
      if (savedMode === 'free' || savedMode === 'high') {
        aiConfig.image.novelai.mode = savedMode;
        set({ naiMode: savedMode });
      }
      // 이전에 연결한 Ren'Py 폴더 / 이미지 보관 폴더 이름 복원(권한 프롬프트 없이 표시만).
      getConnectedFolderName().then((name) => {
        if (name) set({ folderName: name });
      });
      getArchiveFolderName().then((name) => {
        if (name) {
          set({ archiveFolderName: name });
          // 리로드 후 권한이 'prompt' 로 떨어졌으면 저장이 조용히 실패한다 → 상태 표시.
          getArchivePermission().then((p) => set({ archiveReady: p === 'granted' }));
        }
      });
    },

    resetAll: () => {
      clearProject();
      clearAssets().catch(() => {});
      // 배치 썸네일 object URL 정리(세션 메모리 누수 방지).
      get().batchResults.forEach((r) => URL.revokeObjectURL(r.url));
      get().bgBatchResults.forEach((r) => URL.revokeObjectURL(r.url));
      set({
        project: emptyProject(),
        assets: {},
        selectedSceneId: null,
        activeTab: 'scenes',
        batchResults: [],
        bgBatchResults: [],
      });
      flash('초기화했습니다.');
    },

    clearGeneratedAssets: async () => {
      const { project } = get();
      // 그림체 참조는 유지(사용자가 올린 NovelAI 화풍 참조).
      const keep = new Set(project.styleRefAssetIds ?? []);
      const ids = new Set<string>();
      const add = (id?: string) => {
        if (id && !keep.has(id)) ids.add(id);
      };
      for (const sc of project.scenes) {
        add(sc.backgroundAssetId);
        add(sc.bgmAssetId);
        sc.cgAssetIds?.forEach(add);
      }
      for (const c of project.characters) {
        Object.values(c.expressions).forEach(add);
        c.outfits?.forEach((o) => Object.values(o.expressions).forEach(add));
      }
      add(project.menuArt?.main);
      add(project.menuArt?.game);
      if (ids.size === 0) return flash('비울 생성 이미지가 없습니다.');
      // 참조만 비우고 대본·캐릭터 설정(외형·성격·의상 정의·표정 목록)·그림체 참조·GUI 는 유지.
      set((s) => ({
        assets: Object.fromEntries(Object.entries(s.assets).filter(([id]) => !ids.has(id))),
        project: {
          ...s.project,
          scenes: s.project.scenes.map((sc) => {
            const n = { ...sc };
            delete n.backgroundAssetId;
            delete n.bgmAssetId;
            delete n.cgAssetIds;
            return n;
          }),
          characters: s.project.characters.map((c) => ({
            ...c,
            expressions: {},
            outfits: c.outfits?.map((o) => ({ ...o, expressions: {} })),
          })),
          menuArt: undefined,
        },
      }));
      for (const id of ids) await deleteAsset(id).catch(() => {});
      autoSave();
      flash(`생성 이미지·BGM ${ids.size}개를 비웠습니다. 대본·캐릭터 설정·그림체 참조는 유지됩니다.`);
    },

    setToast: (msg) => {
      if (msg === null) return set({ toast: null });
      flash(msg);
    },

    exportProject: async () => {
      const { project, assets } = get();
      if (project.scenes.length === 0) {
        flash('내보낼 장면이 없습니다. 먼저 분석하세요.');
        return;
      }
      try {
        flash('프로젝트 파일을 만드는 중…');
        const { blob, filename, assetCount } = await exportProjectFile(project, assets);
        downloadBlob(blob, filename);
        flash(`프로젝트를 내보냈습니다: ${filename} (에셋 ${assetCount}개 포함)`);
      } catch (e) {
        flash(`내보내기 실패: ${(e as Error).message}`);
      }
    },

    importProject: async (file) => {
      try {
        flash('프로젝트 파일을 불러오는 중…');
        const oldIds = Object.keys(get().assets);
        const { project, assets, assetCount } = await importProjectFile(file);
        // 새로 복원된 에셋과 겹치지 않는 이전 프로젝트 에셋은 고아가 되므로 IndexedDB 에서 제거.
        const newIds = new Set(Object.keys(assets));
        for (const id of oldIds) if (!newIds.has(id)) await deleteAsset(id).catch(() => {});
        set({
          project,
          assets,
          selectedSceneId: project.scenes[0]?.id ?? null,
          activeTab: 'scenes',
        });
        try {
          saveProject(project, assets);
        } catch (e) {
          flash((e as Error).message, 'error');
        }
        flash(`프로젝트를 불러왔습니다: 장면 ${project.scenes.length}개 · 에셋 ${assetCount}개 복원.`);
      } catch (e) {
        flash(`가져오기 실패: ${(e as Error).message}`);
      }
    },

    syncToFolder: async () => {
      if (!isFolderSyncSupported()) {
        flash('이 브라우저는 폴더 직접 쓰기를 지원하지 않습니다. Chrome/Edge 를 쓰거나 ZIP 으로 받으세요.');
        return;
      }
      const { project } = get();
      if (project.scenes.length === 0) {
        flash('내보낼 장면이 없습니다. 먼저 분석하세요.');
        return;
      }
      try {
        flash("Ren'Py 폴더에 기록 중…");
        const { count, parentName, projectFolder } = await syncProjectToFolder(project);
        set({ folderName: parentName });
        flash(
          `"${parentName}\\${projectFolder}" 에 ${count}개 파일 기록 완료. ` +
            `런처에서 "${projectFolder}" 프로젝트 실행 → Shift+R 새로고침!`,
        );
      } catch (e) {
        const msg = (e as Error).message;
        if (/abort/i.test(msg)) return; // 폴더 선택 취소
        flash(`폴더 쓰기 실패: ${msg}`);
      }
    },

    changeFolder: async () => {
      try {
        const name = await connectProjectFolder();
        set({ folderName: name });
        flash(`폴더 연결: ${name}. 이제 "폴더에 쓰기" 로 바로 반영됩니다.`);
      } catch (e) {
        const msg = (e as Error).message;
        if (/abort/i.test(msg)) return;
        flash(`폴더 연결 실패: ${msg}`);
      }
    },

    disconnectFolder: async () => {
      await fsDisconnectFolder();
      set({ folderName: null });
      flash('폴더 연결을 해제했습니다.');
    },

    connectArchive: async () => {
      if (!isFolderSyncSupported()) {
        flash('이 브라우저는 폴더 접근을 지원하지 않습니다. Chrome/Edge 를 사용하세요.');
        return;
      }
      try {
        const name = await connectImageArchive();
        set({ archiveFolderName: name, archiveReady: true });
        flash(`이미지 보관 폴더 연결: "${name}". 이제 생성하는 AI 이미지가 이 폴더에 자동 저장됩니다.`);
      } catch (e) {
        const msg = (e as Error).message;
        if (/abort/i.test(msg)) return; // 선택 취소
        flash(`보관 폴더 연결 실패: ${msg}`);
      }
    },

    verifyArchive: async () => {
      const ok = await ensureArchivePermission();
      set({ archiveReady: ok });
      flash(
        ok
          ? '보관 폴더 쓰기 권한을 허용했습니다. 이제 생성 이미지가 저장됩니다.'
          : '권한이 허용되지 않았습니다. 폴더를 다시 연결해 보세요.',
      );
    },

    disconnectArchive: async () => {
      await disconnectImageArchive();
      set({ archiveFolderName: null, archiveReady: false });
      flash('이미지 보관 폴더 연결을 해제했습니다.');
    },
  };
});

/**
 * 캐릭터의 (의상, 표정) 슬롯에 스프라이트 assetId 를 박은 새 characters 배열을 돌려준다.
 * '기본' 의상은 Character.expressions, 그 외는 해당 Outfit.expressions 에 기록한다.
 * (generate/refine/import 스프라이트 경로가 공유.)
 */
function withSpriteAsset(
  characters: Character[],
  name: string,
  outfit: string,
  expr: Expression,
  id: string,
): Character[] {
  return characters.map((c) => {
    if (c.name !== name) return c;
    if (outfit === '기본') return { ...c, expressions: { ...c.expressions, [expr]: id } };
    return {
      ...c,
      outfits: (c.outfits ?? []).map((o) =>
        o.name === outfit ? { ...o, expressions: { ...o.expressions, [expr]: id } } : o,
      ),
    };
  });
}

/**
 * 같은 배경 키(backgroundKey)를 쓰는 모든 장면에 배경 assetId 를 적용한 새 scenes 와,
 * 그 과정에서 교체된 이전 assetId 집합(삭제 대상)을 함께 돌려준다.
 * (generate/refine/import/참조 배경 경로가 공유 — 생성 1회 = 같은 이름 전 장면 일관 적용.)
 */
function applyBackgroundToGroup(
  scenes: Scene[],
  bkey: string,
  id: string,
): { scenes: Scene[]; prevs: Set<string>; count: number } {
  const prevs = new Set<string>();
  let count = 0;
  const next = scenes.map((sc) => {
    if (backgroundKey(sc) !== bkey) return sc;
    count++;
    if (sc.backgroundAssetId && sc.backgroundAssetId !== id) prevs.add(sc.backgroundAssetId);
    return { ...sc, backgroundAssetId: id };
  });
  return { scenes: next, prevs, count };
}

/**
 * 같은 CG 설명(key)을 쓰는 모든 장면의 해당 인덱스에 CG assetId 를 적용한 새 scenes 와,
 * 교체된 이전 assetId 집합(삭제 대상)을 함께 돌려준다.
 * (generate/참조/refine/import CG 경로가 공유.)
 */
function applyCgToGroup(
  scenes: Scene[],
  key: string,
  id: string,
): { scenes: Scene[]; prevs: Set<string> } {
  const prevs = new Set<string>();
  const next = scenes.map((sc) => {
    if (!sc.cg.some((d) => d.trim() === key)) return sc;
    const arr = [...(sc.cgAssetIds ?? [])];
    sc.cg.forEach((d, i) => {
      if (d.trim() !== key) return;
      while (arr.length <= i) arr.push('');
      if (arr[i] && arr[i] !== id) prevs.add(arr[i]);
      arr[i] = id;
    });
    return { ...sc, cgAssetIds: arr };
  });
  return { scenes: next, prevs };
}

/** 기존 캐릭터의 표정/색 설정을 유지하면서 새 분석 결과와 병합. */
function mergeChars(prev: Character[], next: Character[]): Character[] {
  const byName = new Map(prev.map((c) => [c.name, c]));
  return next.map((c) => {
    const old = byName.get(c.name);
    // 색·스프라이트뿐 아니라 사용자가 입력한 외형·성격·내레이션 설정도 보존
    // (재분석/대본 수정 시 캐릭터 설정이 날아가지 않도록).
    return old
      ? {
          ...c,
          color: old.color,
          expressions: old.expressions,
          outfits: old.outfits ?? c.outfits,
          appearance: old.appearance ?? c.appearance,
          personality: old.personality ?? c.personality,
          isProtagonist: old.isProtagonist ?? c.isProtagonist,
        }
      : c;
  });
}
