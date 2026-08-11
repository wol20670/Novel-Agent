import { emptyProject } from '../types';
import { saveProject, loadProject, clearProject } from '../storage/projectStore';
import { clearAssets, deleteAssets, getAsset } from '../storage/assetStore';
import { exportProjectFile, importProjectFile } from '../project/transfer';
import { downloadBlob } from '../zip/buildZip';
import {
  isFolderSyncSupported,
  connectProjectFolder,
  getConnectedFolderName,
  disconnectFolder as fsDisconnectFolder,
  syncProjectToFolder,
} from '../project/folderSync';
import {
  startCollab,
  loadCollabConfig,
  pushProject as collabPushProject,
  pushAsset as collabPushAsset,
} from '../collab';
import type { State } from './types';
import type { SliceCreator } from './context';

export const createPersistenceSlice: SliceCreator<
  Pick<
    State,
    | 'save'
    | 'hydrate'
    | 'resetAll'
    | 'exportProject'
    | 'importProject'
    | 'syncToFolder'
    | 'changeFolder'
    | 'disconnectFolder'
  >
> = (set, get, ctx) => {
  const { flash, collabHooks } = ctx;
  return {
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
      const typecastKey = (() => {
        try {
          return localStorage.getItem('na_typecast_key') ?? '';
        } catch {
          return '';
        }
      })();
      set({ openaiKey, typecastKey });
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
      const empty = emptyProject();
      set({
        project: empty,
        assets: {},
        selectedSceneId: null,
        activeTab: 'scenes',
      });
      // 협업 중이면 초기화도 밀어줘야 상대방도 같이 비워지고, 내가 새로고침해도 원격의 옛
      // 데이터를 다시 받아와 초기화가 무효화되지 않는다(로컬만 지우면 remote 는 그대로라
      // 재접속 pull 때 덮어써짐).
      if (get().collabEnabled) void collabPushProject(empty);
      flash('초기화했습니다.');
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
        // 단일 트랜잭션(건당 트랜잭션 순차 호출 대체) — 고아 에셋이 많은 대형 프로젝트 교체에서 유리.
        await deleteAssets(oldIds.filter((id) => !newIds.has(id))).catch(() => {});
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
        // 가져오기는 IndexedDB 로컬 복원만 하고 uploadAsset 경로를 안 타므로, 협업 중이면 여기서
        // 직접 Storage 에도 올려야 상대방이 이 배경·CG·스프라이트를 받아갈 수 있다(안 하면 로컬에는
        // 있는데 서버엔 없어서 상대방 화면에 영영 안 뜨는 문제).
        if (get().collabEnabled) {
          void (async () => {
            for (const id of newIds) {
              const blob = await getAsset(id);
              if (blob) void collabPushAsset(id, blob);
            }
          })();
          void collabPushProject(project);
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
        const { count, parentName, projectFolder, fontFallbackWarning } = await syncProjectToFolder(project);
        set({ folderName: parentName });
        // ZIP 경로(onZip, RenpyTab.tsx)와 동일하게 폰트 폴백 경고를 노출 — 폴더 직접쓰기도
        // collectProjectFiles 를 공유해 똑같이 DejaVuSans 대체(한글 두부) 가능성이 있다.
        flash(
          `"${parentName}\\${projectFolder}" 에 ${count}개 파일 기록 완료. ` +
            `런처에서 "${projectFolder}" 프로젝트 실행 → Shift+R 새로고침!` +
            (fontFallbackWarning ? ` ⚠️ ${fontFallbackWarning}` : ''),
          fontFallbackWarning ? 'error' : undefined,
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
};
