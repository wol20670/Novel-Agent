import { create } from 'zustand';
import type { Project, Scene, AssetMeta, Character, Expression, Locale, TranslateMode } from './types';
import { emptyProject, effectiveExpressions, baseLocaleOf, translateModeOf, translateModelFor } from './types';
import { collectUntranslated } from './generators/translate/collect';
import { translateBatch } from './generators/translate';
import { parseText, parseWorkbook } from './parser';
import type { ScriptMeta } from './parser';
import { putAsset, deleteAsset, clearAssets } from './storage/assetStore';
import { saveProject, loadProject, clearProject } from './storage/projectStore';
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
  startCollab,
  stopCollab,
  loadCollabConfig,
  persistCollabConfig,
  pushProject as collabPushProject,
  pushAsset as collabPushAsset,
  ensureAsset as collabEnsureAsset,
  updatePresence,
  type CollabStatus,
  type PeerPresence,
  type CollabHooks,
} from './collab';

export type Tab = 'scenes' | 'assets' | 'renpy';

let assetCounter = 0;
function assetId(): string {
  assetCounter += 1;
  return `a_${Date.now().toString(36)}_${assetCounter}`;
}

/** 업로드 파일명에 쓸 안전한 파일명(특수문자 제거·공백을 밑줄로, 최대 50자). */
function safeFileName(s: string): string {
  return (
    (s || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'asset'
  );
}

interface State {
  project: Project;
  assets: Record<string, AssetMeta>;
  activeTab: Tab;
  selectedSceneId: string | null;
  busy: Record<string, boolean>; // `batch:translate` 등 진행 중 표시 키
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
  /** 대사/지문 한 줄의 원문(base) 텍스트를 실시간 수정한다(대사·지문 공통). */
  setLineText: (sceneId: string, lineIndex: number, text: string) => void;
  /** 대사/지문 한 줄의 로케일 번역(i18n)을 수정한다. 빈 값이면 그 로케일을 제거(원문 폴백). */
  setLineTranslation: (sceneId: string, lineIndex: number, locale: Locale, text: string) => void;
  /** 자동 번역 모드 변경(off/fast/quality). off 면 자동 번역 버튼이 숨겨진다. */
  setTranslateMode: (mode: TranslateMode) => void;
  /** 번역이 빈 대사·지문을 GPT 로 en·ja 채운다(빈 칸만). off/키없음이면 no-op/에러. */
  autoTranslateAll: () => Promise<void>;
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

  // 캐릭터 의상(복장) — 의상마다 표정 세트를 따로 가진다. #복장 태그로 장면별 지정.
  addOutfit: (charName: string, name: string, appearance?: string) => void;
  setOutfitAppearance: (charName: string, name: string, appearance: string) => void;
  /** 이 의상에서 빠져야 할 것(예: '재킷, 가방') — 기본 외형의 옷 누수 차단용(참고 메모, 생성 없이도 기록용). */
  setOutfitExclude: (charName: string, name: string, exclude: string) => void;
  removeOutfit: (charName: string, name: string) => Promise<void>;
  /** 이 캐릭터의 모든 업로드 입화를 비운다(표정 세트는 유지, 다시 업로드 가능). */
  clearCharacterSprites: (name: string) => Promise<void>;

  // 표정 세트 편집 (추가 / 이름변경 / 삭제). '기본'은 고정(이름변경·삭제 불가).
  addExpression: (name: string) => void;
  renameExpression: (oldName: string, newName: string) => void;
  removeExpression: (name: string) => Promise<void>;

  assetUrl: (id: string | undefined) => Promise<string | undefined>;

  /** 아이템(소품) 팝업 이미지 업로드 — 이름 기준 공유(project.itemAssetIds). */
  uploadItem: (name: string, file: File) => Promise<void>;

  // 외부 제작 에셋 업로드 (ChatGPT/Suno 등에서 만든 파일을 그대로 적용)
  importBackground: (sceneId: string, file: File) => Promise<void>;
  importSprite: (name: string, expr: Expression, file: File, outfit?: string) => Promise<void>;
  importCg: (sceneId: string, index: number, file: File) => Promise<void>;
  clearCg: (sceneId: string, index: number) => Promise<void>;
  /** BGM 오디오 업로드 — 같은 BGM 이름(#BGM)을 쓰는 모든 장면에 함께 적용. */
  importBgm: (sceneId: string, file: File) => Promise<void>;
  /** 이 장면(그룹)의 BGM 업로드 해제. */
  clearBgm: (sceneId: string) => Promise<void>;

  // 에셋 라이브러리 (이름 그룹 단위 — 같은 이름 장면 전체에 한 번에 적용)
  renameBackgroundGroup: (key: string, name: string) => void;
  /** CG 컷 설명(라벨) 편집. */
  renameCgGroup: (oldDesc: string, newDesc: string) => void;
  importCgGroup: (desc: string, file: File) => Promise<void>;
  clearCgGroup: (desc: string) => Promise<void>;
  importMenuArt: (which: 'main' | 'game', file: File) => Promise<void>;
  clearMenuArt: (which: 'main' | 'game') => Promise<void>;

  // 설정/저장
  /**
   * OpenAI 키(선택) — 텍스트 작업용(gpt-4o-mini): 대본 자동번역 + AI 테마 생성.
   * 이미지·오디오는 이제 앱이 생성하지 않는다(외부 도구→업로드).
   */
  openaiKey: string;
  setOpenaiKey: (key: string) => void;

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
      // 협업이 켜져 있으면 같은 저장 시점에 상대방에게도 반영(가벼운 공유 — 키 입력마다 아님).
      if (get().collabEnabled) void collabPushProject(project);
    }, 600);
  };

  // 협업 프레즌스로 방송할 "나 지금 여기 봄" 스냅샷.
  const presenceSelf = (): Omit<PeerPresence, 'clientId'> => {
    const s = get();
    const scene = s.project.scenes.find((sc) => sc.id === s.selectedSceneId);
    return {
      name: s.collabName.trim() || '익명',
      activeTab: s.activeTab,
      selectedSceneId: s.selectedSceneId,
      sceneTitle: scene?.title,
    };
  };

  // 협업 라이프사이클(startCollab/stopCollab)이 store 를 건드릴 때 쓰는 훅 묶음.
  const collabHooks = (): CollabHooks => ({
    getProject: () => get().project,
    applyRemoteProject: (project) => {
      set((s) => {
        const stillExists = project.scenes.some((sc) => sc.id === s.selectedSceneId);
        return { project, selectedSceneId: stillExists ? s.selectedSceneId : (project.scenes[0]?.id ?? null) };
      });
      // autoSave()/pushProject 를 다시 타지 않는 별도 경로 — 로컬 캐시만 직접 갱신(에코 방지).
      try {
        saveProject(project, get().assets);
      } catch {
        /* ignore */
      }
    },
    setStatus: (status) => set({ collabStatus: status }),
    setPeers: (peers) => set({ collabPeers: peers }),
    getPresenceSelf: presenceSelf,
  });

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

  // 외부 업로드 파일을 에셋으로 저장하고 id 반환. bgm/voice 는 오디오, 그 외는 이미지만 허용.
  const uploadAsset = async (file: File, kind: AssetMeta['kind'], filename: string): Promise<string> => {
    const isAudioKind = kind === 'bgm' || kind === 'voice';
    const okType = isAudioKind ? file.type.startsWith('audio/') : file.type.startsWith('image/');
    if (!okType) {
      throw new Error(
        isAudioKind ? '오디오 파일(MP3/WAV 등)만 업로드할 수 있습니다.' : '이미지 파일(PNG/JPG 등)만 업로드할 수 있습니다.',
      );
    }
    const id = assetId();
    await putAsset(id, file);
    if (get().collabEnabled) void collabPushAsset(id, file); // 상대방이 필요할 때 받아가도록 Storage 에도 올림
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
    openaiKey: '',
    collabEnabled: false,
    collabRoom: '',
    collabName: '',
    collabStatus: 'off',
    collabPeers: [],
    activeTab: 'scenes',
    selectedSceneId: null,
    busy: {},
    toast: null,
    toastType: 'info',
    folderSupported: isFolderSyncSupported(),
    folderName: null,

    setRawInput: (text) => {
      set((s) => ({ project: { ...s.project, rawInput: text } }));
    },

    loadSample: () => {
      set((s) => ({ project: { ...s.project, rawInput: SAMPLE_STORY } }));
      flash('샘플 스토리를 입력창에 불러왔습니다. "분석"을 눌러주세요.');
    },

    analyzeText: (text) => {
      const { scenes, characters, meta } = parseText(text);
      if (scenes.length === 0) {
        flash('분석할 장면이 없습니다. 형식을 확인하세요.');
        return;
      }
      set((s) => ({
        project: {
          ...s.project,
          ...localeMeta(meta),
          rawInput: text,
          scenes,
          characters: mergeChars(s.project.characters, characters),
        },
        selectedSceneId: scenes[0].id,
        activeTab: 'scenes',
      }));
      autoSave();
      flash(`${scenes.length}개 장면, ${characters.length}명 캐릭터를 분석했습니다.`);
    },

    analyzeExcel: async (data) => {
      const { scenes, characters, meta } = await parseWorkbook(data);
      if (scenes.length === 0) {
        flash('엑셀에서 장면을 찾지 못했습니다. A/B열 형식을 확인하세요.');
        return;
      }
      set((s) => ({
        project: {
          ...s.project,
          ...localeMeta(meta),
          scenes,
          characters: mergeChars(s.project.characters, characters),
        },
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

    setLineText: (sceneId, lineIndex, text) => {
      setScenes(
        get().project.scenes.map((sc) => {
          if (sc.id !== sceneId) return sc;
          const lines = sc.lines.map((l, i) => (i === lineIndex ? { ...l, text } : l));
          return { ...sc, lines };
        }),
      );
    },

    setLineTranslation: (sceneId, lineIndex, locale, text) => {
      // 원문(공백 포함) 그대로 저장한다 — 매 키 입력마다 trim 하면 단어 사이 공백을 칠 수 없다
      // (컨트롤드 인풋: 스페이스가 저장 전에 잘려 다음 글자가 붙음). 내용 유무만 trim 으로 판정.
      // 출력(tl script.rpy)은 generate 의 esc() 가 양끝 공백을 정리하므로 저장은 원문이 안전하다.
      const hasContent = text.trim().length > 0;
      setScenes(
        get().project.scenes.map((sc) => {
          if (sc.id !== sceneId) return sc;
          const lines = sc.lines.map((l, i) => {
            if (i !== lineIndex || l.kind === 'item') return l; // 아이템 라인은 번역 없음
            const i18n = { ...(l.i18n ?? {}) };
            if (hasContent) i18n[locale] = text;
            else delete i18n[locale];
            return { ...l, i18n: Object.keys(i18n).length ? i18n : undefined };
          });
          return { ...sc, lines };
        }),
      );
    },

    setTranslateMode: (mode) => {
      set((s) => ({ project: { ...s.project, translateMode: mode } }));
      autoSave();
    },

    autoTranslateAll: async () => {
      const project = get().project;
      const mode = translateModeOf(project);
      const model = translateModelFor(mode);
      if (!model) return; // off — 버튼이 숨겨져 있어 도달 불가(방어)
      const key = get().openaiKey.trim();
      if (!key) {
        flash('OpenAI 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const base = baseLocaleOf(project);
      const targets = (['en', 'ja'] as Locale[]).filter((l) => l !== base);
      const batches = collectUntranslated(project, targets);
      if (!batches.length) {
        flash('번역할 빈 칸이 없습니다(이미 모두 채워짐).');
        return;
      }
      set((s) => ({ busy: { ...s.busy, 'batch:translate': true } }));
      let done = 0;
      let failScenes = 0;
      try {
        for (const { sceneId, items } of batches) {
          try {
            const result = await translateBatch(items, targets, model, key);
            for (const it of items) {
              const tr = result[it.i];
              if (!tr) continue;
              for (const loc of targets) {
                const v = tr[loc];
                if (v && v.trim()) {
                  get().setLineTranslation(sceneId, it.i, loc, v);
                  done++;
                }
              }
            }
          } catch (e) {
            failScenes++;
            console.warn('[자동번역] 장면 실패:', sceneId, e);
          }
        }
      } finally {
        set((s) => ({ busy: { ...s.busy, 'batch:translate': false } }));
      }
      const msg =
        `자동 번역 완료 — ${done}건 채움` + (failScenes ? ` · ${failScenes}개 장면 실패(재시도 가능)` : '');
      flash(msg, failScenes ? 'error' : 'success');
    },

    setSceneStatus: (id, status) => {
      setScenes(get().project.scenes.map((sc) => (sc.id === id ? { ...sc, status } : sc)));
    },

    approveAll: () => {
      setScenes(get().project.scenes.map((sc) => ({ ...sc, status: 'approved' as const })));
      flash('모든 장면을 승인했습니다.');
    },

    selectScene: (id) => {
      set({ selectedSceneId: id });
      updatePresence(presenceSelf()); // collab 꺼져 있으면 내부적으로 no-op
    },
    setActiveTab: (t) => {
      set({ activeTab: t });
      updatePresence(presenceSelf());
    },

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
      flash(`'${charName}'에 '${n}' 의상을 추가했습니다. 표정별 입화를 업로드하세요.`);
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

    uploadItem: async (name, file) => {
      const key = name.trim();
      if (!key) return;
      try {
        const id = await uploadAsset(file, 'item', `item_${Date.now().toString(36)}.png`);
        const prev = get().project.itemAssetIds?.[key];
        set((s) => ({
          project: { ...s.project, itemAssetIds: { ...(s.project.itemAssetIds ?? {}), [key]: id } },
        }));
        autoSave();
        if (prev) await deleteAsset(prev).catch(() => {});
        flash('아이템 이미지를 업로드했습니다.');
      } catch (e) {
        flash(`업로드 실패: ${(e as Error).message}`);
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

    importBgm: async (sceneId, file) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      try {
        const ext = file.name.split('.').pop() || 'mp3';
        const id = await uploadAsset(file, 'bgm', `bgm_${sceneId}.${ext}`);
        // 같은 BGM 이름을 쓰는 모든 장면에 함께 적용(업로드 1회 = 일관성).
        const key = bgmKey(scene);
        const targets = get().project.scenes.filter((sc) => bgmKey(sc) === key);
        const prevs = new Set(targets.map((t) => t.bgmAssetId).filter((x): x is string => !!x && x !== id));
        set((s) => ({
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
            ? `업로드한 BGM을 ${targets.length}개 장면에 적용했습니다.`
            : '업로드한 BGM을 적용했습니다.',
        );
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearBgm: async (sceneId) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene?.bgmAssetId) return;
      const prev = scene.bgmAssetId;
      get().updateScene(sceneId, { bgmAssetId: undefined });
      await deleteAsset(prev).catch(() => {});
      flash('BGM 업로드를 해제했습니다.');
    },

    // 같은 배경 이름을 쓰는 모든 장면의 배경 이름을 한 번에 변경(라이브러리 편집).
    renameBackgroundGroup: (key, name) => {
      set((s) => ({
        project: {
          ...s.project,
          scenes: s.project.scenes.map((sc) => (backgroundKey(sc) === key ? { ...sc, background: name } : sc)),
        },
      }));
      autoSave();
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

    assetUrl: async (id) => {
      if (!id) return undefined;
      // 로컬(IndexedDB)에 있으면 바로, 없고 협업이 켜져 있으면 Storage 에서 받아와 캐싱 후 반환.
      const blob = await collabEnsureAsset(id);
      return blob ? URL.createObjectURL(blob) : undefined;
    },

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
      const openaiKey = (() => {
        try {
          return localStorage.getItem('na_openai_key') ?? '';
        } catch {
          return '';
        }
      })();
      set({ openaiKey });
      if (loaded) {
        set({ project: loaded.project, assets: loaded.assets, selectedSceneId: loaded.project.scenes[0]?.id ?? null });
      }
      // 이전에 연결한 Ren'Py 폴더 이름 복원(권한 프롬프트 없이 표시만).
      getConnectedFolderName().then((name) => {
        if (name) set({ folderName: name });
      });
      // 협업 설정 복원 — 켜져 있었다면 자동으로 재접속.
      const collab = loadCollabConfig();
      set({
        collabEnabled: collab.enabled,
        collabRoom: collab.room,
        collabName: collab.displayName,
      });
      if (collab.enabled) void startCollab(collabHooks());
    },

    resetAll: () => {
      clearProject();
      clearAssets().catch(() => {});
      set({
        project: emptyProject(),
        assets: {},
        selectedSceneId: null,
        activeTab: 'scenes',
      });
      flash('초기화했습니다.');
    },

    clearGeneratedAssets: async () => {
      const { project } = get();
      const ids = new Set<string>();
      const add = (id?: string) => {
        if (id) ids.add(id);
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
      Object.values(project.itemAssetIds ?? {}).forEach(add);
      add(project.menuArt?.main);
      add(project.menuArt?.game);
      if (ids.size === 0) return flash('비울 에셋이 없습니다.');
      // 참조만 비우고 대본·캐릭터 설정(외형·성격·의상 정의·표정 목록)·GUI 는 유지.
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
          itemAssetIds: undefined,
        },
      }));
      for (const id of ids) await deleteAsset(id).catch(() => {});
      autoSave();
      flash(`업로드한 에셋 ${ids.size}개를 비웠습니다. 대본·캐릭터 설정은 유지됩니다.`);
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
  };
});

/**
 * 대본 메타(#설정_글언어/#설정_목소리언어)로 지정된 다국어 설정을 프로젝트에 병합할 부분 패치.
 * 지정된 값만 덮어쓴다(대본에 없으면 기존 프로젝트 설정 유지).
 */
function localeMeta(meta?: ScriptMeta): Partial<Pick<Project, 'baseLocale' | 'textLocales' | 'voiceLocales'>> {
  if (!meta) return {};
  const patch: Partial<Pick<Project, 'baseLocale' | 'textLocales' | 'voiceLocales'>> = {};
  if (meta.baseLocale) patch.baseLocale = meta.baseLocale;
  if (meta.textLocales) patch.textLocales = meta.textLocales;
  if (meta.voiceLocales) patch.voiceLocales = meta.voiceLocales;
  return patch;
}

/**
 * 캐릭터의 (의상, 표정) 슬롯에 스프라이트 assetId 를 박은 새 characters 배열을 돌려준다.
 * '기본' 의상은 Character.expressions, 그 외는 해당 Outfit.expressions 에 기록한다.
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
 * (업로드 1회 = 같은 이름 전 장면 일관 적용.)
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
