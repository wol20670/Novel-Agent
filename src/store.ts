import { create } from 'zustand';
import type { Project, Scene, AssetMeta, Character, Expression } from './types';
import { emptyProject } from './types';
import { parseText, parseWorkbook } from './parser';
import { generateImage, buildBackgroundPrompt } from './generators/image';
import { synthBgm, type SynthOptions } from './generators/audio/synthProvider';
import { putAsset, deleteAsset, getAssetUrl, clearAssets } from './storage/assetStore';
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
  setSceneStatus: (id: string, status: Scene['status']) => void;
  approveAll: () => void;
  selectScene: (id: string | null) => void;
  setActiveTab: (t: Tab) => void;

  // 프로젝트 메타
  updateProjectMeta: (patch: Partial<Project>) => void;
  setCharacterExpression: (name: string, expr: Expression) => void;
  updateCharacter: (name: string, patch: Partial<Character>) => void;

  // 에셋 생성
  generateBackground: (sceneId: string) => Promise<void>;
  generateBgm: (sceneId: string, opts?: SynthOptions) => Promise<void>;
  assetUrl: (id: string | undefined) => Promise<string | undefined>;

  // 설정/저장
  setApiKey: (key: string) => void;
  save: () => void;
  hydrate: () => void;
  resetAll: () => void;
  setToast: (msg: string | null) => void;

  // 프로젝트 파일 (기기 간 이동)
  exportProject: () => Promise<void>;
  importProject: (file: File) => Promise<void>;
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

  return {
    project: emptyProject(),
    assets: {},
    apiKey: '',
    activeTab: 'scenes',
    selectedSceneId: null,
    busy: {},
    toast: null,
    toastType: 'info',

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

    setCharacterExpression: (name, expr) => {
      set((s) => ({
        project: {
          ...s.project,
          characters: s.project.characters.map((c) =>
            c.name === name ? { ...c, expressions: { ...c.expressions, [expr]: expr } } : c,
          ),
        },
      }));
      autoSave();
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
        const prev = scene.backgroundAssetId;
        set((s) => ({ assets: { ...s.assets, [id]: meta } }));
        get().updateScene(sceneId, { backgroundAssetId: id });
        if (prev) await deleteAsset(prev).catch(() => {});
        flash(source === 'openai' ? 'OpenAI 배경을 생성했습니다.' : '임시 배경(Canvas)을 생성했습니다.');
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
        const prev = scene.bgmAssetId;
        set((s) => ({ assets: { ...s.assets, [id]: meta } }));
        get().updateScene(sceneId, { bgmAssetId: id, bgm: scene.bgm || scene.title });
        if (prev) await deleteAsset(prev).catch(() => {});
        flash(`BGM 생성 완료 (${moodName}).`);
      } catch (e) {
        flash(`BGM 생성 실패: ${(e as Error).message}`);
      } finally {
        set((s) => ({ busy: { ...s.busy, [key]: false } }));
      }
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
