import { create } from 'zustand';
import type { Project, Scene, AssetMeta, Character, Expression } from './types';
import { emptyProject, EXPRESSIONS } from './types';
import { parseText, parseWorkbook } from './parser';
import { generateImage, generateSprite, buildBackgroundPrompt } from './generators/image';
import { synthBgm, type SynthOptions } from './generators/audio/synthProvider';
import { putAsset, deleteAsset, getAssetUrl, clearAssets } from './storage/assetStore';
import { aiConfig } from './config/aiConfig';
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

  // 캐릭터 스프라이트 (표정별 입화)
  generateCharacterSprites: (name: string) => Promise<void>;
  /** 한 표정 입화 생성. reference(기준 입화)를 주면 그 인물의 표정만 바꿔 일관성을 유지. 생성 blob 반환. */
  generateCharacterSprite: (name: string, expr: Expression, reference?: Blob) => Promise<Blob | undefined>;
  clearCharacterSprites: (name: string) => Promise<void>;

  // 에셋 생성
  generateBackground: (sceneId: string) => Promise<void>;
  generateBgm: (sceneId: string, opts?: SynthOptions) => Promise<void>;
  assetUrl: (id: string | undefined) => Promise<string | undefined>;

  // 일괄 생성 (고유 이름 단위 — 미생성분만, force 면 전체 재생성)
  generateAllBackgrounds: (force?: boolean) => Promise<void>;
  generateAllBgm: (force?: boolean) => Promise<void>;

  // 외부 제작 이미지 업로드 (직접 적용)
  importBackground: (sceneId: string, file: File) => Promise<void>;
  importSprite: (name: string, expr: Expression, file: File) => Promise<void>;
  importCg: (sceneId: string, index: number, file: File) => Promise<void>;
  clearCg: (sceneId: string, index: number) => Promise<void>;

  // 에셋 라이브러리 (이름 그룹 단위 — 같은 이름 장면 전체에 한 번에 적용)
  renameBackgroundGroup: (key: string, name: string) => void;
  importCgGroup: (desc: string, file: File) => Promise<void>;
  clearCgGroup: (desc: string) => Promise<void>;
  importMenuArt: (which: 'main' | 'game', file: File) => Promise<void>;
  clearMenuArt: (which: 'main' | 'game') => Promise<void>;

  // 설정/저장
  setApiKey: (key: string) => void;
  save: () => void;
  hydrate: () => void;
  resetAll: () => void;
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
  connectArchive: () => Promise<void>;
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
    activeTab: 'scenes',
    selectedSceneId: null,
    busy: {},
    toast: null,
    toastType: 'info',
    folderSupported: isFolderSyncSupported(),
    folderName: null,
    archiveFolderName: null,

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
      set({ aiThemeBusy: true });
      flash(apiKey ? 'AI 테마 생성 중…' : '오프라인 테마 변형 생성 중…');
      try {
        const { theme, source, note } = await generateTheme({
          project,
          mood: project.mood,
          apiKey: apiKey || undefined,
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

    generateCharacterSprite: async (name, expr, reference) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return undefined;
      const key = `sprite:${name}`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        const { blob, source } = await generateSprite({
          name,
          expression: expr,
          color: char.color,
          apiKey: get().apiKey,
          appearance: char.appearance,
          reference,
        });
        const id = assetId();
        await putAsset(id, blob);
        const meta: AssetMeta = {
          id,
          kind: 'sprite',
          prompt: `${name} ${expr}`,
          mime: 'image/png',
          source,
          filename: `sprite_${name}_${expr}.png`,
          createdAt: Date.now(),
        };
        // 비용 들인 AI 입화는 보관 폴더에 사본을 쌓아둔다(재생성해도 원본 보존).
        if (source === 'openai') {
          void archiveImage(blob, `characters/${safeFileName(name)}/${safeFileName(expr)}_${timestamp()}.png`);
        }
        const prev = char.expressions[expr];
        set((s) => ({
          assets: { ...s.assets, [id]: meta },
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.name === name ? { ...c, expressions: { ...c.expressions, [expr]: id } } : c,
            ),
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

    generateCharacterSprites: async (name) => {
      // 일관성(reference) 모드 + 키 있음: '기본'을 먼저 만들고, 그 입화를 기준으로
      // 나머지 표정은 "표정만" 편집해 같은 인물로 유지한다. 그 외엔 각자 생성.
      const useRef = !!get().apiKey && aiConfig.image.sprite.consistency === 'reference';
      const ordered: Expression[] = useRef
        ? ['기본', ...EXPRESSIONS.filter((e) => e !== '기본')]
        : [...EXPRESSIONS];
      let reference: Blob | undefined;
      for (const expr of ordered) {
        const blob = await get().generateCharacterSprite(
          name,
          expr,
          expr === '기본' ? undefined : reference,
        );
        if (useRef && expr === '기본' && blob) reference = blob;
      }
      flash(`${name} 스프라이트 ${EXPRESSIONS.length}종 생성 완료.`);
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

    updateCharacter: (name, patch) => {
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) => (c.name === name ? { ...c, ...patch } : c)),
        },
      }));
      autoSave();
    },

    generateBackground: async (sceneId) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const key = `${sceneId}:bg`;
      set((s) => ({ busy: { ...s.busy, [key]: true } }));
      try {
        const prompt = buildBackgroundPrompt(scene.background, scene.title, scene.direction);
        const { project, apiKey } = get();
        const { blob, source } = await generateImage({
          prompt,
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
        if (source === 'openai') {
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
            : source === 'openai'
              ? 'OpenAI 배경을 생성했습니다.'
              : '임시 배경(Canvas)을 생성했습니다.',
        );
      } catch (e) {
        flash(`배경 생성 실패: ${(e as Error).message}`);
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

    importSprite: async (name, expr, file) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      try {
        const id = await uploadAsset(file, 'sprite', `sprite_${name}_${expr}.png`);
        const prev = char.expressions[expr];
        set((s) => ({
          project: {
            ...s.project,
            characters: s.project.characters.map((c) =>
              c.name === name ? { ...c, expressions: { ...c.expressions, [expr]: id } } : c,
            ),
          },
        }));
        if (prev) await deleteAsset(prev).catch(() => {});
        autoSave();
        flash(`${name} · ${expr} 입화를 업로드했습니다.`);
      } catch (e) {
        flash((e as Error).message);
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
      set((s) => ({
        project: {
          ...s.project,
          scenes: s.project.scenes.map((sc) =>
            backgroundKey(sc) === key ? { ...sc, background: name } : sc,
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

    save: () => {
      const { project, assets } = get();
      saveProject(project, assets);
      flash('현재 작업을 저장했습니다.');
    },

    hydrate: () => {
      const loaded = loadProject();
      const apiKey = loadApiKey();
      if (loaded) {
        set({ project: loaded.project, assets: loaded.assets, apiKey, selectedSceneId: loaded.project.scenes[0]?.id ?? null });
      } else {
        set({ apiKey });
      }
      // 이전에 연결한 Ren'Py 폴더 / 이미지 보관 폴더 이름 복원(권한 프롬프트 없이 표시만).
      getConnectedFolderName().then((name) => {
        if (name) set({ folderName: name });
      });
      getArchiveFolderName().then((name) => {
        if (name) set({ archiveFolderName: name });
      });
    },

    resetAll: () => {
      clearProject();
      clearAssets().catch(() => {});
      set({ project: emptyProject(), assets: {}, selectedSceneId: null, activeTab: 'scenes' });
      flash('초기화했습니다.');
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
        set({ archiveFolderName: name });
        flash(`이미지 보관 폴더 연결: "${name}". 이제 생성하는 AI 이미지가 이 폴더에 자동 저장됩니다.`);
      } catch (e) {
        const msg = (e as Error).message;
        if (/abort/i.test(msg)) return; // 선택 취소
        flash(`보관 폴더 연결 실패: ${msg}`);
      }
    },

    disconnectArchive: async () => {
      await disconnectImageArchive();
      set({ archiveFolderName: null });
      flash('이미지 보관 폴더 연결을 해제했습니다.');
    },
  };
});

/** 기존 캐릭터의 표정/색 설정을 유지하면서 새 분석 결과와 병합. */
function mergeChars(prev: Character[], next: Character[]): Character[] {
  const byName = new Map(prev.map((c) => [c.name, c]));
  return next.map((c) => {
    const old = byName.get(c.name);
    return old ? { ...c, color: old.color, expressions: old.expressions } : c;
  });
}
