import { create } from 'zustand';
import type { Project, Scene, AssetMeta, Character, Expression } from './types';
import { emptyProject, projectExpressions, effectiveExpressions } from './types';
import { parseText, parseWorkbook } from './parser';
import { generateImage, generateSprite, editImage, buildBackgroundPrompt, buildCgPrompt, buildMenuArtPrompt, generateMenuArtImage, generateCgFromReference } from './generators/image';
import { compileSpritePrompt, compileScenePrompt, compileCgPrompt } from './generators/image/promptCompiler';
import { synthBgm, type SynthOptions } from './generators/audio/synthProvider';
import { putAsset, getAsset, deleteAsset, getAssetUrl, clearAssets } from './storage/assetStore';
import { aiConfig, normalizeImageSize, type ImageQuality, type NaiMode } from './config/aiConfig';
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
  analyzeExcel: (data: ArrayBuffer) => void;

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
  generateAiTheme: () => Promise<void>;
  clearAiTheme: () => void;

  // 캐릭터 스프라이트 (표정별 입화) — outfit 미지정 시 '기본' 의상.
  generateCharacterSprites: (name: string, outfit?: string) => Promise<void>;
  /** 기본(메인) 입화만 1장 생성 — 이후 표정은 이 기본을 기준으로 하나씩 생성(토큰 절약). */
  generateCharacterBase: (name: string, outfit?: string) => Promise<void>;
  /** 한 표정 입화 생성. reference(기준 입화)를 주거나, 없으면 저장된 '기본'을 자동 기준으로 일관성 유지. */
  generateCharacterSprite: (name: string, expr: Expression, reference?: Blob, outfit?: string) => Promise<Blob | undefined>;
  /** 이미 생성된 입화를 지시문대로 미세 수정(예: "머리를 더 길게"). 키 필요. */
  refineSprite: (name: string, expr: Expression, instruction: string, outfit?: string) => Promise<void>;

  // 캐릭터 의상(복장) — 의상마다 표정 세트를 따로 가진다. #복장 태그로 장면별 지정.
  addOutfit: (charName: string, name: string, appearance?: string) => void;
  setOutfitAppearance: (charName: string, name: string, appearance: string) => void;
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
   * 타이틀/게임 메뉴 배경을 gpt-image-1 로 생성해 슬롯에 적용(+보관). 키 필요.
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
  /** (OpenAI 경로 전용) 이미지 생성 품질. NovelAI 는 naiMode 를 쓴다. */
  imageQuality: ImageQuality;
  setImageQuality: (q: ImageQuality) => void;
  /** NovelAI 생성 모드 — free=Opus 무료(≤1MP) / high=고품질(큰 해상도, Anlas 소모). */
  naiMode: NaiMode;
  setNaiMode: (m: NaiMode) => void;
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

export const useStore = create<State>((set, get) => {
  // 디바운스 자동저장
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const autoSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { project, assets } = get();
      saveProject(project, assets);
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
        : /완료|했습니다|생성/.test(msg)
          ? 'success'
          : 'info';
    set({ toast: msg, toastType: inferred });
    setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 3500);
  };

  // NovelAI + OpenAI 키가 있을 때만 프롬프트를 단부루 태그로 컴파일. 실패하면 undefined → 결정적 프롬프트 폴백.
  const naiCompile = async (fn: () => Promise<string>): Promise<string | undefined> => {
    if (aiConfig.provider !== 'novelai' || !get().openaiKey?.trim()) return undefined;
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
    activeTab: 'scenes',
    selectedSceneId: null,
    busy: {},
    toast: null,
    toastType: 'info',
    folderSupported: isFolderSyncSupported(),
    folderName: null,
    archiveFolderName: null,
    archiveReady: false,
    imageQuality: 'medium',
    naiMode: 'free',

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

    analyzeExcel: (data) => {
      const { scenes, characters } = parseWorkbook(data);
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
      const { project, apiKey } = get();
      if (project.scenes.length === 0 && !(project.mood ?? '').trim()) {
        flash('먼저 스토리를 분석하거나 분위기를 입력하세요.');
        return;
      }
      // 테마는 OpenAI Chat(gpt-4o-mini)으로 만든다. 별도 openaiKey 우선, 없으면 provider 가 OpenAI 일 때만 apiKey.
      const chatKey = get().openaiKey?.trim() || (aiConfig.provider === 'openai' ? apiKey || undefined : undefined);
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

    generateCharacterSprite: async (name, expr, reference, outfit = '기본') => {
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
        // 표정(비-기본)을 개별 생성할 때, 명시 reference 가 없으면 같은 의상의 '기본'(없으면 기본 의상의
        // '기본')을 자동 기준으로 삼아 같은 인물로 그린다(일관성 + 기본 1장만 마음에 들면 표정은 그걸 기반).
        let ref = reference;
        if (!ref && expr !== '기본' && aiConfig.image.sprite.consistency === 'reference') {
          const baseId = exprStore['기본'] ?? char.expressions['기본'];
          if (baseId) ref = (await getAsset(baseId)) ?? undefined;
        }
        // 기준 입화가 없을 때(=기본 텍스트 생성)만 그림체 참조를 적용한다(여러 장 vibe).
        let styleRefs: Blob[] | undefined;
        if (!ref) {
          const ids = get().project.styleRefAssetIds ?? [];
          if (ids.length) {
            const blobs = await Promise.all(ids.map((id) => getAsset(id)));
            styleRefs = blobs.filter((b): b is Blob => !!b);
          }
        }
        // 의상이면 기본 외형에 의상 묘사를 덧붙여 생성한다(같은 인물, 다른 옷).
        const appearance = outfitObj?.appearance
          ? [char.appearance, `복장/의상: ${outfitObj.appearance}`].filter(Boolean).join(', ')
          : char.appearance;
        const tag = outfit === '기본' ? '' : `${outfit} `;
        const promptOverride = await naiCompile(() =>
          compileSpritePrompt({ appearance, emotion: expr, apiKey: get().openaiKey.trim() }),
        );
        const { blob, source } = await generateSprite({
          name,
          expression: expr,
          color: char.color,
          apiKey: get().apiKey,
          appearance,
          personality: char.personality,
          quality: get().imageQuality,
          reference: ref,
          styleReference: styleRefs?.[0],
          styleReferences: styleRefs,
          promptOverride,
        });
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
            characters: s.project.characters.map((c) => {
              if (c.name !== name) return c;
              if (outfit === '기본') return { ...c, expressions: { ...c.expressions, [expr]: id } };
              return {
                ...c,
                outfits: (c.outfits ?? []).map((o) =>
                  o.name === outfit ? { ...o, expressions: { ...o.expressions, [expr]: id } } : o,
                ),
              };
            }),
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
      // 일관성(reference) 모드 + 키 있음: '기본'을 먼저 만들고, 그 입화를 기준으로
      // 나머지 표정은 "표정만" 편집해 같은 인물로 유지한다. 그 외엔 각자 생성.
      const useRef = !!get().apiKey && aiConfig.image.sprite.consistency === 'reference';
      const exprs = projectExpressions(get().project);
      const ordered: Expression[] = useRef
        ? ['기본', ...exprs.filter((e) => e !== '기본')]
        : [...exprs];
      let reference: Blob | undefined;
      for (const expr of ordered) {
        const blob = await get().generateCharacterSprite(
          name,
          expr,
          expr === '기본' ? undefined : reference,
          outfit,
        );
        if (useRef && expr === '기본' && blob) reference = blob;
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
      const src = await getAsset(curId);
      if (!src) return flash('원본 입화를 찾지 못했습니다.');
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        const { blob, source } = await editImage({ blob: src, instruction, apiKey, kind: 'sprite', quality: get().imageQuality });
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
            characters: s.project.characters.map((c) => {
              if (c.name !== name) return c;
              if (outfit === '기본') return { ...c, expressions: { ...c.expressions, [expr]: id } };
              return {
                ...c,
                outfits: (c.outfits ?? []).map((o) =>
                  o.name === outfit ? { ...o, expressions: { ...o.expressions, [expr]: id } } : o,
                ),
              };
            }),
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

    refineCharacterDesign: async (name, instruction) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      const apiKey = get().apiKey?.trim();
      if (!apiKey) return flash('이미지 수정은 이미지 API 키가 필요합니다.');
      if (!instruction.trim()) return;
      const baseId = char.expressions['기본'];
      if (!baseId) return flash('먼저 ① 기본 입화를 생성하세요.');
      const src = await getAsset(baseId);
      if (!src) return flash('기본 입화 원본을 찾지 못했습니다.');
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        // 1) 기본 입화를 지시문대로 수정 → 새 디자인의 기준이 된다.
        const { blob, source } = await editImage({ blob: src, instruction, apiKey, kind: 'sprite', quality: get().imageQuality });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'sprite',
          prompt: `${name} 기본 디자인 수정: ${instruction}`,
          mime: 'image/png',
          source,
          filename: `sprite_${name}_기본.png`,
          createdAt: Date.now(),
        };
        void archiveImage(blob, `characters/${safeFileName(name)}/기본_디자인수정_${timestamp()}.png`);
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.name === name ? { ...c, expressions: { ...c.expressions, ['기본']: id } } : c,
            ),
          },
        }));
        await deleteAsset(baseId).catch(() => {});
        autoSave();
        // 2) 이미 만들어둔 다른 표정도 새 기본을 기준으로 다시 그려 디자인을 맞춘다.
        const others = projectExpressions(get().project).filter(
          (e) => e !== '기본' && char.expressions[e as Expression],
        );
        for (const expr of others) {
          await get().generateCharacterSprite(name, expr as Expression, blob);
        }
        flash(
          others.length
            ? `${name} 디자인을 수정하고 표정 ${others.length}종을 새 기준으로 다시 그렸습니다.`
            : `${name} 기본 디자인을 수정했습니다.`,
        );
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
                  outfits: (c.outfits ?? []).map((o) =>
                    o.name === name ? { ...o, appearance: appearance.trim() || undefined } : o,
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
            apiKey: get().openaiKey.trim(),
          }),
        );
        const { blob, source } = await generateImage({
          prompt,
          promptOverride,
          label: scene.background || scene.title,
          width: project.width,
          height: project.height,
          apiKey,
          quality: get().imageQuality,
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
        const key = backgroundKey(scene);
        const targets = get().project.scenes.filter((sc) => backgroundKey(sc) === key);
        const prevs = new Set(
          targets.map((t) => t.backgroundAssetId).filter((x): x is string => !!x && x !== id),
        );
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              backgroundKey(sc) === key ? { ...sc, backgroundAssetId: id } : sc,
            ),
          },
        }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(
          targets.length > 1
            ? `'${key}' 배경을 ${targets.length}개 장면에 적용했습니다.`
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
        const { project } = get();
        const { blob, source } = await editImage({
          blob: src,
          instruction,
          apiKey,
          kind: 'background',
          size: normalizeImageSize(project.width, project.height),
          quality: get().imageQuality,
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
        const targets = get().project.scenes.filter((sc) => backgroundKey(sc) === bkey);
        const prevs = new Set(
          targets.map((t) => t.backgroundAssetId).filter((x): x is string => !!x && x !== id),
        );
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              backgroundKey(sc) === bkey ? { ...sc, backgroundAssetId: id } : sc,
            ),
          },
        }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(targets.length > 1 ? `수정한 배경을 ${targets.length}개 장면에 적용했습니다.` : '배경을 수정했습니다.');
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
        const key = backgroundKey(scene);
        const targets = get().project.scenes.filter((sc) => backgroundKey(sc) === key);
        const prevs = new Set(
          targets.map((t) => t.backgroundAssetId).filter((x): x is string => !!x && x !== id),
        );
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              backgroundKey(sc) === key ? { ...sc, backgroundAssetId: id } : sc,
            ),
          },
        }));
        autoSave();
        for (const p of prevs) await deleteAsset(p).catch(() => {});
        flash(
          targets.length > 1
            ? `업로드한 배경을 ${targets.length}개 장면에 적용했습니다.`
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
            characters: s.project.characters.map((c) => {
              if (c.name !== name) return c;
              if (outfit === '기본') return { ...c, expressions: { ...c.expressions, [expr]: id } };
              return {
                ...c,
                outfits: (c.outfits ?? []).map((o) =>
                  o.name === outfit ? { ...o, expressions: { ...o.expressions, [expr]: id } } : o,
                ),
              };
            }),
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
          compileCgPrompt({ text: [key, ...using[0].direction].filter(Boolean).join(', '), apiKey: get().openaiKey.trim() }),
        );
        const { blob, source } = await generateImage({
          prompt,
          promptOverride,
          label: key,
          width: project.width,
          height: project.height,
          apiKey,
          quality: get().imageQuality,
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
        const prevs = new Set<string>();
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (!sc.cg.some((d) => d.trim() === key)) return sc;
              const arr = [...(sc.cgAssetIds ?? [])];
              sc.cg.forEach((d, i) => {
                if (d.trim() !== key) return;
                while (arr.length <= i) arr.push('');
                if (arr[i] && arr[i] !== id) prevs.add(arr[i]);
                arr[i] = id;
              });
              return { ...sc, cgAssetIds: arr };
            }),
          },
        }));
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
        const { blob, source } = await generateCgFromReference({
          description: key,
          directions: using[0].direction,
          character: charBlob,
          background: bgBlob,
          apiKey,
          size: normalizeImageSize(project.width, project.height),
          quality: get().imageQuality,
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
        const prevs = new Set<string>();
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (!sc.cg.some((d) => d.trim() === key)) return sc;
              const arr = [...(sc.cgAssetIds ?? [])];
              sc.cg.forEach((d, i) => {
                if (d.trim() !== key) return;
                while (arr.length <= i) arr.push('');
                if (arr[i] && arr[i] !== id) prevs.add(arr[i]);
                arr[i] = id;
              });
              return { ...sc, cgAssetIds: arr };
            }),
          },
        }));
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
        const { project } = get();
        const { blob, source } = await editImage({
          blob: src,
          instruction,
          apiKey,
          kind: 'background',
          size: normalizeImageSize(project.width, project.height),
          quality: get().imageQuality,
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
        const prevs = new Set<string>();
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (!sc.cg.some((d) => d.trim() === key)) return sc;
              const arr = [...(sc.cgAssetIds ?? [])];
              sc.cg.forEach((d, i) => {
                if (d.trim() !== key) return;
                while (arr.length <= i) arr.push('');
                if (arr[i] && arr[i] !== id) prevs.add(arr[i]);
                arr[i] = id;
              });
              return { ...sc, cgAssetIds: arr };
            }),
          },
        }));
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
        const instruction = `이 배경과 같은 장소·구도·화풍을 유지하면서 다음으로 바꿔줘: ${want}. ${scene.direction.join(', ')}`;
        const { blob, source } = await editImage({
          blob: refBlob,
          instruction,
          apiKey,
          kind: 'background',
          size: normalizeImageSize(project.width, project.height),
          quality: get().imageQuality,
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
        const targets = get().project.scenes.filter((sc) => backgroundKey(sc) === bkey);
        const prevs = new Set(
          targets.map((t) => t.backgroundAssetId).filter((x): x is string => !!x && x !== id),
        );
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              backgroundKey(sc) === bkey ? { ...sc, backgroundAssetId: id } : sc,
            ),
          },
        }));
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
        const prevs = new Set<string>();
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (!sc.cg.some((d) => d.trim() === key)) return sc;
              const arr = [...(sc.cgAssetIds ?? [])];
              sc.cg.forEach((d, i) => {
                if (d.trim() !== key) return;
                while (arr.length <= i) arr.push('');
                if (arr[i] && arr[i] !== id) prevs.add(arr[i]);
                arr[i] = id;
              });
              return { ...sc, cgAssetIds: arr };
            }),
          },
        }));
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
        const { blob, source } = await generateMenuArtImage({
          which,
          title: project.title,
          genreLabel: theme.label,
          mood: project.mood,
          character: charBlob,
          background: bgBlob,
          apiKey,
          quality: get().imageQuality,
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

    setImageQuality: (q) => {
      set({ imageQuality: q });
      try {
        localStorage.setItem('na_image_quality', q);
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

    save: () => {
      const { project, assets } = get();
      saveProject(project, assets);
      flash('현재 작업을 저장했습니다.');
    },

    hydrate: () => {
      const loaded = loadProject();
      const apiKey = loadApiKey();
      const savedQuality = (() => {
        try {
          return localStorage.getItem('na_image_quality') as ImageQuality | null;
        } catch {
          return null;
        }
      })();
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
      if (loaded) {
        set({ project: loaded.project, assets: loaded.assets, apiKey, selectedSceneId: loaded.project.scenes[0]?.id ?? null });
      } else {
        set({ apiKey });
      }
      if (savedQuality) set({ imageQuality: savedQuality });
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
      set({ project: emptyProject(), assets: {}, selectedSceneId: null, activeTab: 'scenes' });
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
        const { project, assets, assetCount } = await importProjectFile(file);
        set({
          project,
          assets,
          selectedSceneId: project.scenes[0]?.id ?? null,
          activeTab: 'scenes',
        });
        saveProject(project, assets);
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
