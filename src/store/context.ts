import type { Scene, AssetMeta } from '../types';
import type { PeerPresence, CollabHooks } from '../collab';
import { pushProject as collabPushProject, pushAsset as collabPushAsset, takeDroppedRemoteCount } from '../collab';
import { saveProject } from '../storage/projectStore';
import { putAsset, deleteAssets } from '../storage/assetStore';
import { assetId } from './helpers';
import type { State, StoreSet, StoreGet } from './types';

export interface StoreContext {
  autoSave: () => void;
  presenceSelf: () => Omit<PeerPresence, 'clientId'>;
  collabHooks: () => CollabHooks;
  setScenes: (scenes: Scene[]) => void;
  flash: (msg: string, type?: 'info' | 'success' | 'error') => void;
  commitAssetSwap: (patch: Partial<State> | ((s: State) => Partial<State>), prevIds: string[], keepId?: string) => Promise<void>;
  uploadAsset: (file: File, kind: AssetMeta['kind'], filename: string, opts?: { mime?: string }) => Promise<string>;
}

export type SliceCreator<T> = (set: StoreSet, get: StoreGet, ctx: StoreContext) => T;

export function createStoreContext(set: StoreSet, get: StoreGet): StoreContext {
  // 디바운스 자동저장
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  // applyRemoteProject 전용 디바운스 타이머(아래) — saveTimer 와 절대 공유하면 안 된다. 이유는
  // applyRemoteProject 정의부 주석 참고.
  let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
  // 같은 저장 실패 메시지를 매 디바운스마다 반복해서 띄우지 않도록 1회만 알린다.
  let warnedSaveQuota = false;
  // 저장 용량이 한도에 근접했다는 경고도 세션당 1회만(매 자동저장마다 뜨면 시끄럽다).
  let warnedSize = false;
  const autoSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null; // ⚠️ 먼저 비워야 함 — 안 그러면 "저장 대기 중" 상태(hasPendingLocalSave)가 영원히 true 로 남아 원격 갱신이 계속 막힘.
      const { project, assets } = get();
      try {
        const nearQuota = saveProject(project, assets);
        warnedSaveQuota = false;
        if (get().saveError !== null) set({ saveError: null });
        if (nearQuota && !warnedSize) {
          warnedSize = true;
          flash('저장 용량이 브라우저 한도에 가까워졌습니다 — "📤 내보내기"로 백업해두는 걸 권장합니다.', 'error');
        }
      } catch (e) {
        const message = (e as Error).message;
        set({ saveError: message });
        // 배너(saveError)는 실패가 이어지는 동안 계속 보이지만, 방금 저장을 시도했다는 즉시 신호로
        // 토스트도 1회 함께 띄운다(반복 플래시는 warnedSaveQuota 로 계속 억제).
        if (!warnedSaveQuota) {
          warnedSaveQuota = true;
          flash(message, 'error');
        }
      }
      // 협업이 켜져 있으면 같은 저장 시점에 상대방에게도 반영(가벼운 공유 — 키 입력마다 아님).
      if (get().collabEnabled) {
        void collabPushProject(project);
        // 방금 끝난 디바운스 대기 동안 hasPendingLocalSave() 가드로 버려진 원격 갱신이 있었는지
        // 확인한다 — 진짜 병합은 안 하지만(범위 밖), 최소한 놓쳤을 수 있다고 알려서 새로고침을 권한다.
        if (takeDroppedRemoteCount() > 0) {
          flash('상대의 변경을 받지 못했을 수 있습니다 — 새로고침하면 최신 상태를 받습니다.', 'error');
        }
      }
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
      // 상태 반영(set) 자체는 반드시 동기여야 한다 — withApplyingRemoteGuard(index.ts) 가 이 함수
      // 호출을 감싸는 동안만 applyingRemote 플래그가 true 라, 화면 반영이 비동기로 밀리면 그 사이
      // 다른 코드 경로가 이미 guard 밖으로 나간 상태를 관찰할 수 있다.
      set((s) => {
        const stillExists = project.scenes.some((sc) => sc.id === s.selectedSceneId);
        return { project, selectedSceneId: stillExists ? s.selectedSceneId : (project.scenes[0]?.id ?? null) };
      });
      // 원격 project 로 통째 교체됐으니 내 화면의 Outfit AI 제안은 다른 대본을 가리키는 좌표가 된다.
      // set() **직후** 동기 호출이라 위의 동기 구간 계약을 깨지 않는다(비동기로 밀지 말 것).
      get().invalidateOutfitSuggestions();
      // 로컬 캐시(localStorage) 저장은 autoSave() 를 그대로 재사용하면 안 된다 — 확인해본 두 가지 이유:
      //  ① autoSave() 는 collabEnabled 면 collabPushProject(project) 도 함께 호출한다. 그 실행이
      //     600ms 뒤로 밀리면 withApplyingRemoteGuard 의 동기 구간(applyingRemote=true)은 이미
      //     끝나 있어 pushProject 의 에코 가드(applyingRemote 체크, collab/sync.ts)를 통과 —
      //     방금 "받은" 원격 데이터를 "내 변경"인 양 다시 밀어넣어 참가자끼리 핑퐁이 반복되는
      //     무한 루프가 생긴다.
      //  ② autoSave() 는 saveTimer 를 세우는데, hasPendingLocalSave()(위)가 그 타이머로 "로컬 편집
      //     저장 대기 중"을 판정해 그 사이 들어온 원격 갱신을 버린다. 원격 반영을 같은 타이머로
      //     묶으면 방금 반영한 이 원격 갱신 자체 때문에 그다음 진짜 원격 갱신이 부당하게 버려진다.
      // 그래서 별도의 remoteSaveTimer 로 "로컬 캐시 쓰기"만 디바운스한다(원격 이벤트가 짧은 간격
      //으로 연달아 오면 그때마다 JSON.stringify 두 번(project+assets)을 반복하던 비용을 묶어낸다).
      // 콜백 안에서 항상 get().project 를 다시 읽는 이유: 이 타이머가 아직 대기 중일 때 사용자가
      // 로컬에서 편집하면(그 편집은 자기 autoSave 로 이미 최신 상태가 반영됨) 여기서 클로저의 옛
      // project 를 그대로 저장해 방금 만든 최신 로컬 편집을 도로 덮어쓰는 사고를 막기 위함이다.
      if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
      remoteSaveTimer = setTimeout(() => {
        remoteSaveTimer = null;
        try {
          saveProject(get().project, get().assets);
        } catch {
          /* ignore */
        }
      }, 600);
    },
    setStatus: (status) => set({ collabStatus: status }),
    setPeers: (peers) => set({ collabPeers: peers }),
    getPresenceSelf: presenceSelf,
    // 디바운스 저장(600ms) 대기 중인지 — 대기 중이면 곧 내 push 가 더 높은 version 으로 이길 것이므로
    // 그 사이 들어온 원격 갱신은 반영을 유예한다(수신 즉시 덮으면 방금 한 내 편집이 순간적으로 사라져 보임).
    hasPendingLocalSave: () => saveTimer !== null,
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

  // 업로드→이전 assetId 교체→정리의 공통 골격(에셋 스왑 관용구, import*/clear*/uploadItem/removeItem
  // 등 약 20개 액션이 공유). 순서를 "set → autoSave → delete" 로 통일한다(과거엔 액션마다 순서가
  // 갈렸으나 delete 실패는 전부 .catch 로 삼켜 관측 가능한 차이가 없어 안전하게 통일 가능).
  // keepId 를 주면 prevIds 에서 그 id 는 제외(새로 적용한 id 를 실수로 지우지 않는 방어 — 지금은
  // 항상 새로 생성한 고유 id 라 사실상 no-op 이지만 모든 경로에 가드를 일관 적용한다).
  const commitAssetSwap = async (
    patch: Partial<State> | ((s: State) => Partial<State>),
    prevIds: string[],
    keepId?: string,
  ): Promise<void> => {
    set(patch);
    autoSave();
    await deleteAssets(prevIds.filter((id) => id !== keepId)).catch(() => {});
  };

  // 외부 업로드 파일을 에셋으로 저장하고 id 반환. bgm/voice 는 오디오, 그 외는 이미지만 허용.
  // opts.mime 은 브라우저가 type 을 못 알아본 파일(대표적으로 .ico — OS 에 MIME 이 등록 안 돼 있으면
  // File.type 이 빈 문자열로 온다)을 호출측이 확장자로 판정해 넘겨줄 때 쓴다. 넘어오면 타입 검사를
  // 건너뛰고 이 값을 메타 mime 으로 저장한다(빈 mime 을 그대로 두면 내보내기 확장자·썸네일이 다 깨진다).
  const uploadAsset = async (
    file: File,
    kind: AssetMeta['kind'],
    filename: string,
    opts?: { mime?: string },
  ): Promise<string> => {
    const isAudioKind = kind === 'bgm' || kind === 'voice';
    const okType = opts?.mime
      ? true
      : isAudioKind
        ? file.type.startsWith('audio/')
        : file.type.startsWith('image/');
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
      mime: opts?.mime ?? file.type,
      source: 'upload',
      filename,
      createdAt: Date.now(),
    };
    set((s) => ({ assets: { ...s.assets, [id]: meta } }));
    return id;
  };

  return { autoSave, presenceSelf, collabHooks, setScenes, flash, commitAssetSwap, uploadAsset };
}
