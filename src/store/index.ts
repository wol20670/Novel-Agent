import { create } from 'zustand';
import type {
  Locale,
  Expression,
  Character,
  MenuButtonSlot,
  MenuButtonState,
  QuickButtonSlot,
  QuickButtonState,
  EscImageId,
  OrphanAsset,
} from '../types';
import {
  emptyProject,
  effectiveExpressions,
  matchExpressionFile,
  baseLocaleOf,
  menuButtonFile,
  TITLE_LOGO_FILE,
  GAME_ICON_FILE,
  WINDOW_ICON_FILE,
  matchMenuButtonFile,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  quickButtonFile,
  QUICK_PANEL_FILE,
  matchQuickButtonFile,
  QUICK_MENU_SLOTS,
  QUICK_BUTTON_STATES,
  matchEscImageFile,
  ESC_IMAGES,
} from '../types';
import { sleep } from '../generators/shared/retry';
import { collectVoiceTargets, type VoiceBatchItem } from '../generators/voice/collectByCharacter';
import { typecastTTS, getSubscription } from '../generators/voice/typecastProvider';
import { estimateVoiceCostForProject } from '../generators/voice/estimate';
import { aiConfig } from '../config/aiConfig';
import { applyAssetToGroup, clearAssetFromGroup } from '../project/sceneAssets';
import { getAsset, deleteAsset, deleteAssets, clearAssets, getAllAssetKeys, getAssetInfos } from '../storage/assetStore';
import { collectReferencedAssetIds, diffOrphanIds, diffRemoteOrphans, DEFAULT_REMOTE_GRACE_MS } from '../assetRefs';
import { saveProject, loadProject, clearProject } from '../storage/projectStore';
import { exportProjectFile, importProjectFile } from '../project/transfer';
import { downloadBlob } from '../zip/buildZip';
import { backgroundKey, bgmKey, extFromMime } from '../renpy/generate';
import {
  isFolderSyncSupported,
  connectProjectFolder,
  getConnectedFolderName,
  disconnectFolder as fsDisconnectFolder,
  syncProjectToFolder,
} from '../project/folderSync';
import {
  startCollab,
  stopCollab,
  loadCollabConfig,
  persistCollabConfig,
  pushProject as collabPushProject,
  pushAsset as collabPushAsset,
  isCollabReady,
  listRemoteAssets,
  collectRemoteReferencedIds,
  removeRemoteAssets,
} from '../collab';
import type { State } from './types';
import {
  describeNames,
  safeFileName,
  applyVoiceUpdates,
  withSpriteAsset,
  type VoiceAttachUpdate,
} from './helpers';
import { createStoreContext } from './context';
import { createUiSlice } from './uiSlice';
import { createScriptSlice } from './scriptSlice';
import { createAiBatchSlice } from './aiBatchSlice';
import { createProjectSlice } from './projectSlice';
import { createCharacterSlice } from './characterSlice';

export const useStore = create<State>((set, get) => {
  const ctx = createStoreContext(set, get);
  const { autoSave, collabHooks, flash, commitAssetSwap, uploadAsset } = ctx;

  // attachLineVoice 의 핵심 로직만 분리(autoSave/flash 없음) — 일괄 생성(batchVoiceCharacter)이
  // 수백 줄을 반복 호출할 때 매번 저장·토스트가 튀지 않도록, 루프 안에선 이걸로 조용히 누적하고
  // autoSave()/flash() 는 호출측이 끝나고 한 번만 부른다. 단일 적용(attachLineVoice)도 이걸 재사용.
  // collector 를 주면(배치 경로) scenes 전체 재빌드 set() 을 즉시 하지 않고 목록에만 쌓아둔다 —
  // 호출측이 배치 끝에 applyVoiceUpdates 로 딱 1번만 커밋한다(autoTranslateAll 과 동일한 절충).
  // 업로드(uploadAsset)·이전 에셋 삭제는 배치 여부와 무관하게 항상 즉시 수행(에셋 자체는 배치가
  // 중단돼도 남아 있어야 함 — commitAssetSwap 의 "set→autoSave→delete" 관례와 같은 이유).
  const attachVoiceQuiet = async (
    sceneId: string,
    lineIndex: number,
    locale: Locale,
    blob: Blob,
    charName: string,
    collector?: VoiceAttachUpdate[],
  ): Promise<void> => {
    const scene = get().project.scenes.find((s) => s.id === sceneId);
    const line = scene?.lines[lineIndex];
    if (!scene || !line || line.kind !== 'dialogue') return;
    const mime = blob.type || 'audio/mpeg';
    const ext = extFromMime(blob.type);
    const file = new File([blob], `voice_${safeFileName(charName)}_${lineIndex}_${locale}.${ext}`, {
      type: mime,
    });
    const id = await uploadAsset(file, 'voice', file.name);
    const prev = line.voiceAssetIds?.[locale];
    if (collector) {
      collector.push({ sceneId, lineIndex, locale, assetId: id });
    } else {
      set((s) => ({
        project: {
          ...s.project,
          voiceLocales: s.project.voiceLocales?.includes(locale)
            ? s.project.voiceLocales
            : [...(s.project.voiceLocales ?? []), locale],
          scenes: s.project.scenes.map((sc) =>
            sc.id === sceneId
              ? {
                  ...sc,
                  lines: sc.lines.map((l, i) =>
                    i === lineIndex && l.kind === 'dialogue'
                      ? { ...l, voiced: true, voiceAssetIds: { ...l.voiceAssetIds, [locale]: id } }
                      : l,
                  ),
                }
              : sc,
          ),
        },
      }));
    }
    if (prev) await deleteAsset(prev).catch(() => {});
  };

  // 배치 확인창·완료 메시지에 쓸 잔여 크레딧(plan_credits - used_credits) — 조회 실패해도(키
  // 오류·네트워크 등) 배치 자체엔 영향 없게 베스트에포트로 undefined 폴백.
  const subscriptionRemaining = async (key: string): Promise<number | undefined> => {
    try {
      const sub = await getSubscription(key);
      return sub.planCredits - sub.usedCredits;
    } catch {
      return undefined;
    }
  };

  // batchVoiceCharacter/batchVoiceAll 공유 — 확인창·크레딧 전후 조회는 호출측이 하고, 이 함수는
  // "이 캐릭터의 미생성 대사를 순차 생성·적용"만 담당한다(batchVoiceAll 이 여러 캐릭터를 돌 때
  // 캐릭터마다 확인창이 다시 뜨지 않게 분리).
  const runCharacterVoiceBatch = async (
    charName: string,
    locale: Locale,
    voicePreset: NonNullable<Character['voice']>,
    items: VoiceBatchItem[],
    key: string,
    collector: VoiceAttachUpdate[],
  ): Promise<{ done: number; failed: number; totalSeconds: number; creditsExhausted: boolean }> => {
    // 연속 호출을 곧바로 이어 붙이면 매 줄이 레이트리밋(429)에 걸림(실사용에서 확인) — 요청 사이에
    // 일정 간격을 두고, 그래도 429 나면 지수 백오프(2s→4s→8s)로 최대 3회 재시도한다.
    const PACE_MS = 900;
    let done = 0;
    let failed = 0;
    let totalSeconds = 0;
    let creditsExhausted = false;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (idx > 0) await sleep(PACE_MS);
      const params = {
        voiceId: voicePreset.voiceId,
        text: item.text,
        language: locale,
        model: voicePreset.model || aiConfig.voice.defaultModel,
        emotion: voicePreset.emotion,
        intensity: voicePreset.intensity,
        settings: voicePreset.settings,
      };
      let result;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= 3; attempt++) {
        try {
          result = await typecastTTS(params, key);
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          const isRateLimit = /레이트 리밋/.test((e as Error).message);
          if (!isRateLimit || attempt === 3) break; // 레이트리밋 아니면 즉시 포기, 마지막 시도면 종료
          await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s
        }
      }
      if (!result) {
        failed++;
        console.warn('[보이스 일괄생성] 실패:', item.sceneId, item.lineIndex, lastErr);
        // 크레딧 소진(402)이면 나머지 줄도 전부 실패할 게 뻔하니 재시도 없이 배치 전체를 중단한다.
        if (lastErr instanceof Error && /크레딧이 부족/.test(lastErr.message)) {
          creditsExhausted = true;
          break;
        }
        continue;
      }
      totalSeconds += result.seconds;
      try {
        await attachVoiceQuiet(item.sceneId, item.lineIndex, locale, result.blob, charName, collector);
        done++;
      } catch (e) {
        failed++;
        console.warn('[보이스 일괄생성] 적용 실패:', item.sceneId, item.lineIndex, e);
      }
    }
    return { done, failed, totalSeconds, creditsExhausted };
  };

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
    emotionProgress: null,
    voiceEstimate: null,
    toast: null,
    toastType: 'info',
    saveError: null,
    folderSupported: isFolderSyncSupported(),
    folderName: null,

    ...createUiSlice(set, get, ctx),
    ...createScriptSlice(set, get, ctx),
    ...createAiBatchSlice(set, get, ctx),
    ...createProjectSlice(set, get, ctx),
    ...createCharacterSlice(set, get, ctx),

    aiThemeBusy: false,

    importBackground: async (sceneId, file) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      try {
        const id = await uploadAsset(file, 'background', `bg_${sceneId}.png`);
        const bkey = backgroundKey(scene);
        const { scenes, prevIds, count } = applyAssetToGroup(
          get().project.scenes,
          (sc) => backgroundKey(sc) === bkey,
          id,
          (sc) => (sc.backgroundAssetId ? [sc.backgroundAssetId] : []),
          (sc, id) => ({ ...sc, backgroundAssetId: id }),
        );
        await commitAssetSwap((s) => ({ project: { ...s.project, scenes } }), prevIds);
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
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              characters: withSpriteAsset(s.project.characters, name, outfit, expr, id),
            },
          }),
          prev ? [prev] : [],
          id,
        );
        flash(`${name} · ${outfit === '기본' ? '' : outfit + ' '}${expr} 입화를 업로드했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    /**
     * 스프라이트 일괄 업로드 — 파일명에서 표정 이름을 찾아 해당 칸에 넣는다.
     * 표정 24종 × 히로인을 한 칸씩 클릭해 올리는 건 비현실적이라 메뉴 버튼의 importMenuButtons
     * 관용구를 그대로 가져왔다: 매칭/미매칭 분류 → 전부 업로드 → **commitAssetSwap 을 한 번만**
     * (20장을 올려도 리렌더·autoSave 는 1회). 못 맞춘 파일은 조용히 버리지 않고 목록으로 알린다.
     */
    importSpritesBatch: async (name, outfit, files) => {
      const char = get().project.characters.find((c) => c.name === name);
      if (!char) return;
      if (outfit !== '기본' && !char.outfits?.some((o) => o.name === outfit)) {
        return flash(`'${outfit}' 의상을 찾지 못했습니다.`);
      }
      const exprList = effectiveExpressions(get().project.expressions);
      const matched: { expr: Expression; file: File }[] = [];
      const unmatched: string[] = [];
      const seen = new Set<string>();
      const duplicated: string[] = [];
      for (const file of files) {
        const expr = matchExpressionFile(file.name, exprList);
        if (!expr) {
          unmatched.push(file.name);
          continue;
        }
        // 같은 표정에 여러 파일이 걸리면 앞의 것만 쓰고 나머지는 알린다 — 조용히 덮어쓰면
        // 어느 파일이 적용됐는지 알 수 없다.
        if (seen.has(expr)) {
          duplicated.push(file.name);
          continue;
        }
        seen.add(expr);
        matched.push({ expr, file });
      }
      if (matched.length === 0) {
        const parts: string[] = [];
        if (unmatched.length) parts.push(`인식 실패: ${describeNames(unmatched)}`);
        if (duplicated.length) parts.push(`중복: ${describeNames(duplicated)}`);
        return flash(parts.length ? parts.join(' / ') : '적용할 파일이 없습니다.', 'error');
      }
      try {
        const sub = outfit === '기본' ? '' : safeFileName(outfit) + '_';
        const prevIds: string[] = [];
        const updates: { expr: Expression; id: string }[] = [];
        for (const { expr, file } of matched) {
          const id = await uploadAsset(file, 'sprite', `sprite_${name}_${sub}${expr}.png`);
          const cur = get().project.characters.find((c) => c.name === name);
          const store =
            outfit === '기본' ? cur?.expressions : cur?.outfits?.find((o) => o.name === outfit)?.expressions;
          const prev = store?.[expr];
          if (prev) prevIds.push(prev);
          updates.push({ expr, id });
        }
        await commitAssetSwap((s) => {
          let characters = s.project.characters;
          for (const u of updates) characters = withSpriteAsset(characters, name, outfit, u.expr, u.id);
          return { project: { ...s.project, characters } };
        }, prevIds);
        let msg = `${name} · ${outfit === '기본' ? '' : outfit + ' '}입화 ${updates.length}종을 적용했습니다.`;
        if (unmatched.length) msg += ` (인식 실패 ${unmatched.length}개: ${describeNames(unmatched)})`;
        if (duplicated.length) msg += ` (중복 ${duplicated.length}개 건너뜀)`;
        flash(msg, 'success');
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    },

    uploadItem: async (name, file) => {
      const key = name.trim();
      if (!key) return;
      try {
        const id = await uploadAsset(file, 'item', `item_${Date.now().toString(36)}.png`);
        const prev = get().project.itemAssetIds?.[key];
        await commitAssetSwap(
          (s) => ({
            project: { ...s.project, itemAssetIds: { ...(s.project.itemAssetIds ?? {}), [key]: id } },
          }),
          prev ? [prev] : [],
          id,
        );
        flash('아이템 이미지를 업로드했습니다.');
      } catch (e) {
        flash(`업로드 실패: ${(e as Error).message}`);
      }
    },

    removeItem: async (name) => {
      const key = name.trim();
      const prev = get().project.itemAssetIds?.[key];
      if (!prev) return;
      await commitAssetSwap((s) => {
        const itemAssetIds = { ...(s.project.itemAssetIds ?? {}) };
        delete itemAssetIds[key];
        return { project: { ...s.project, itemAssetIds } };
      }, [prev]);
      flash(`'${key}' 아이템 이미지를 해제했습니다(Canvas 임시로 복귀).`);
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
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              scenes: s.project.scenes.map((sc) => (sc.id === sceneId ? { ...sc, cgAssetIds: arr } : sc)),
            },
          }),
          prev ? [prev] : [],
          id,
        );
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
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => (sc.id === sceneId ? { ...sc, cgAssetIds: arr } : sc)),
          },
        }),
        prev ? [prev] : [],
      );
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
        const { scenes, prevIds, count } = applyAssetToGroup(
          get().project.scenes,
          (sc) => bgmKey(sc) === key,
          id,
          (sc) => (sc.bgmAssetId ? [sc.bgmAssetId] : []),
          // 업로드를 시작한 소스 장면에만 부가로 bgm 이름을 세팅(기존 값 우선, 없으면 장면 제목).
          (sc, id) => ({ ...sc, bgmAssetId: id, ...(sc.id === sceneId ? { bgm: scene.bgm || scene.title } : {}) }),
        );
        await commitAssetSwap((s) => ({ project: { ...s.project, scenes } }), prevIds);
        flash(
          count > 1 ? `업로드한 BGM을 ${count}개 장면에 적용했습니다.` : '업로드한 BGM을 적용했습니다.',
        );
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearBgm: async (sceneId) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      if (!scene?.bgmAssetId) return;
      const prev = scene.bgmAssetId;
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => (sc.id === sceneId ? { ...sc, bgmAssetId: undefined } : sc)),
          },
        }),
        [prev],
      );
      flash('BGM 업로드를 해제했습니다.');
    },

    attachLineVoice: async (sceneId, lineIndex, locale, blob, charName) => {
      try {
        await attachVoiceQuiet(sceneId, lineIndex, locale, blob, charName);
        autoSave();
        flash(`이 대사에 ${locale.toUpperCase()} 음성을 적용했습니다 — Ren'Py 내보내기에 반영됩니다.`);
      } catch (e) {
        flash((e as Error).message, 'error');
      }
    },

    detachLineVoice: async (sceneId, lineIndex, locale) => {
      const scene = get().project.scenes.find((s) => s.id === sceneId);
      const line = scene?.lines[lineIndex];
      if (!scene || !line || line.kind !== 'dialogue') return;
      const prev = line.voiceAssetIds?.[locale];
      if (!prev) return;
      await commitAssetSwap(
        (s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === sceneId
                ? {
                    ...sc,
                    lines: sc.lines.map((l, i) => {
                      if (i !== lineIndex || l.kind !== 'dialogue') return l;
                      const next = { ...l.voiceAssetIds };
                      delete next[locale];
                      const stillVoiced = Object.keys(next).length > 0;
                      return { ...l, voiceAssetIds: next, voiced: stillVoiced };
                    }),
                  }
                : sc,
            ),
          },
        }),
        [prev],
      );
      flash(`${locale.toUpperCase()} 음성을 해제했습니다.`);
    },

    batchVoiceCharacter: async (charName, locale) => {
      const project = get().project;
      const char = project.characters.find((c) => c.name === charName);
      const voicePreset = char?.voice;
      if (!voicePreset) {
        flash('먼저 이 캐릭터의 보이스를 골라 "💾 캐릭터에 저장"하세요.', 'error');
        return;
      }
      const key = get().typecastKey.trim();
      if (!key) {
        flash('Typecast 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const base = baseLocaleOf(project);
      const items = collectVoiceTargets(project, charName, locale, base);
      if (!items.length) {
        flash('일괄 생성할 빈 대사가 없습니다(이미 모두 채워짐).');
        return;
      }

      // 대사 하나당 크레딧이 얼마나 드는지 감을 잡을 수 있게, 배치 전후로 잔량을 재서 확인창·완료
      // 메시지에 같이 보여준다(베스트에포트 — 조회 실패해도 배치 자체엔 영향 없음, 조용히 생략).
      const creditsBefore = await subscriptionRemaining(key);
      const estimate = get().voiceEstimate?.perChar.find((c) => c.name === charName);
      const remainNote = creditsBefore !== undefined ? `잔여 ${creditsBefore}` : '잔여 크레딧 확인 실패';
      const confirmMsg = estimate
        ? `예상 정확히 ${estimate.estCredits}크레딧 소모(${remainNote}). 진행할까요?`
        : `${remainNote}. 진행할까요? (예상 비용은 "💡 비용 계산"으로 먼저 확인할 수 있습니다)`;
      if (!window.confirm(confirmMsg)) return;

      const busyKey = `batch:voice:${charName}`;
      set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
      let outcome: { done: number; failed: number; totalSeconds: number; creditsExhausted: boolean };
      const collector: VoiceAttachUpdate[] = [];
      try {
        outcome = await runCharacterVoiceBatch(charName, locale, voicePreset, items, key, collector);
      } finally {
        // 배치 동안 모아둔 음성 적용분을 여기서 딱 1번만 커밋 — 중간에 크레딧 소진으로 중단돼도
        // 그때까지 생성된 음성은 반드시 반영/저장된다(autoTranslateAll 과 동일한 절충).
        if (collector.length) {
          const { scenes, locales } = applyVoiceUpdates(get().project.scenes, collector);
          set((s) => ({
            project: {
              ...s.project,
              scenes,
              voiceLocales: Array.from(new Set([...(s.project.voiceLocales ?? []), ...locales])),
            },
          }));
        }
        set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
      }
      autoSave();
      const creditsAfter = await subscriptionRemaining(key);
      const creditsNote =
        creditsBefore !== undefined && creditsAfter !== undefined
          ? ` · 크레딧 ${creditsBefore - creditsAfter} 소진(잔여 ${creditsAfter})`
          : '';
      if (outcome.creditsExhausted) {
        flash(
          `${charName} 보이스 일괄 생성 중단 — ${outcome.done}건 적용 후 크레딧 소진. 충전/다음 달 후 재실행하면 이어서 생성됩니다.` +
            creditsNote,
          'error',
        );
        return;
      }
      const msg =
        `${charName} 보이스 일괄 생성 완료 — ${outcome.done}건 적용` +
        (outcome.failed ? ` · ${outcome.failed}건 실패(재시도 가능)` : '') +
        creditsNote;
      flash(msg, outcome.failed ? 'error' : 'success');
    },

    batchVoiceAll: async (locale) => {
      const project = get().project;
      const key = get().typecastKey.trim();
      if (!key) {
        flash('Typecast 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const base = baseLocaleOf(project);
      const targets = project.characters
        .filter((c): c is Character & { voice: NonNullable<Character['voice']> } => !!c.voice)
        .map((c) => ({ char: c, items: collectVoiceTargets(project, c.name, locale, base) }))
        .filter((t) => t.items.length > 0);
      if (!targets.length) {
        flash('일괄 생성할 빈 대사가 없습니다(프리셋이 저장된 캐릭터가 없거나 이미 모두 채워짐).', 'error');
        return;
      }

      const creditsBefore = await subscriptionRemaining(key);
      const estimateTotal = get().voiceEstimate?.totalCredits;
      const remainNote = creditsBefore !== undefined ? `잔여 ${creditsBefore}` : '잔여 크레딧 확인 실패';
      const confirmMsg = estimateTotal
        ? `전체 캐릭터 예상 정확히 ${estimateTotal}크레딧 소모(${remainNote}). 진행할까요?`
        : `${remainNote}. 프리셋이 저장된 모든 캐릭터를 순차 생성할까요? (예상 비용은 "💡 비용 계산"으로 먼저 확인할 수 있습니다)`;
      if (!window.confirm(confirmMsg)) return;

      set((s) => ({ busy: { ...s.busy, 'batch:voice:all': true } }));
      let totalDone = 0;
      let totalFailed = 0;
      let totalSeconds = 0;
      let creditsExhausted = false;
      // 여러 캐릭터를 순차 처리하는 배치 전체가 collector 하나를 공유 — 캐릭터마다 커밋하면
      // 여전히 캐릭터 수만큼 리렌더/자동저장이 튀므로, 전체를 한 번에 묶어야 실질 효과가 있다.
      const collector: VoiceAttachUpdate[] = [];
      try {
        for (const { char, items } of targets) {
          const busyKey = `batch:voice:${char.name}`;
          set((s) => ({ busy: { ...s.busy, [busyKey]: true } }));
          let outcome;
          try {
            outcome = await runCharacterVoiceBatch(char.name, locale, char.voice, items, key, collector);
          } finally {
            set((s) => ({ busy: { ...s.busy, [busyKey]: false } }));
          }
          totalDone += outcome.done;
          totalFailed += outcome.failed;
          totalSeconds += outcome.totalSeconds;
          if (outcome.creditsExhausted) {
            creditsExhausted = true;
            break;
          }
        }
      } finally {
        if (collector.length) {
          const { scenes, locales } = applyVoiceUpdates(get().project.scenes, collector);
          set((s) => ({
            project: {
              ...s.project,
              scenes,
              voiceLocales: Array.from(new Set([...(s.project.voiceLocales ?? []), ...locales])),
            },
          }));
        }
        set((s) => ({ busy: { ...s.busy, 'batch:voice:all': false } }));
      }
      autoSave();
      const creditsAfter = await subscriptionRemaining(key);
      const creditsNote =
        creditsBefore !== undefined && creditsAfter !== undefined
          ? ` · 크레딧 ${creditsBefore - creditsAfter} 소진(잔여 ${creditsAfter})`
          : '';
      if (creditsExhausted) {
        flash(
          `전체 보이스 일괄 생성 중단 — ${totalDone}건 적용 후 크레딧 소진. 충전/다음 달 후 재실행하면 이어서 생성됩니다.` +
            creditsNote,
          'error',
        );
        return;
      }
      flash(
        `전체 보이스 일괄 생성 완료 — ${totalDone}건 적용` +
          (totalFailed ? ` · ${totalFailed}건 실패(재시도 가능)` : '') +
          creditsNote,
        totalFailed ? 'error' : 'success',
      );
    },

    // 글자수 합=크레딧이라 API 호출이 필요 없다(키 없이도 즉시 계산 — Typecast 이관 전 Predict
    // Duration 샘플링 방식과 달리 동기 함수, 스피너·busy 상태도 필요 없어졌다).
    estimateVoiceCost: () => {
      const project = get().project;
      const base = baseLocaleOf(project);
      const result = estimateVoiceCostForProject(project, base);
      set({ voiceEstimate: result });
      if (!result.perChar.length) {
        flash('예상 비용을 계산할 대사가 없습니다(프리셋이 저장된 캐릭터가 없거나 남은 대사가 없음).', 'error');
        return;
      }
      const msg =
        `예상 비용 계산 완료 — 정확히 ${result.totalCredits}크레딧(약 ${Math.round(result.totalSeconds)}초, ${result.totalLines}줄)` +
        (result.noPreset.length ? ` · 프리셋 없음 ${result.noPreset.length}명` : '') +
        (result.overLimit.length ? ` · 2000자 초과 ${result.overLimit.length}줄(생성 실패 가능)` : '');
      flash(msg, 'success');
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

    clearBackgroundGroup: async (key) => {
      const { scenes, prevIds } = clearAssetFromGroup(
        get().project.scenes,
        (sc) => backgroundKey(sc) === key,
        (sc) => (sc.backgroundAssetId ? [sc.backgroundAssetId] : []),
        (sc) => ({ ...sc, backgroundAssetId: undefined }),
      );
      await commitAssetSwap((s) => ({ project: { ...s.project, scenes } }), prevIds);
      flash('배경 업로드를 해제했습니다(Canvas 임시로 복귀).');
    },

    clearBgmGroup: async (key) => {
      const { scenes, prevIds } = clearAssetFromGroup(
        get().project.scenes,
        (sc) => bgmKey(sc) === key,
        (sc) => (sc.bgmAssetId ? [sc.bgmAssetId] : []),
        (sc) => ({ ...sc, bgmAssetId: undefined }),
      );
      await commitAssetSwap((s) => ({ project: { ...s.project, scenes } }), prevIds);
      flash('BGM 업로드를 해제했습니다.');
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
        const { scenes, prevIds } = applyAssetToGroup(
          get().project.scenes,
          (sc) => sc.cg.some((d) => d.trim() === key),
          id,
          (sc) =>
            sc.cg.reduce<string[]>((acc, d, i) => {
              const v = sc.cgAssetIds?.[i];
              if (d.trim() === key && v) acc.push(v);
              return acc;
            }, []),
          (sc, id) => {
            // 한 장면에 같은 설명(컷)이 여러 인덱스에 있을 수 있어(cg 배열), 매칭되는 슬롯 전부를 채운다.
            const arr = [...(sc.cgAssetIds ?? [])];
            sc.cg.forEach((d, i) => {
              if (d.trim() !== key) return;
              while (arr.length <= i) arr.push('');
              arr[i] = id;
            });
            return { ...sc, cgAssetIds: arr };
          },
        );
        await commitAssetSwap((s) => ({ project: { ...s.project, scenes } }), prevIds);
        flash('업로드한 CG를 같은 컷의 모든 장면에 적용했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearCgGroup: async (desc) => {
      const key = desc.trim();
      const { scenes, prevIds } = clearAssetFromGroup(
        get().project.scenes,
        (sc) => !!sc.cgAssetIds && sc.cg.some((d) => d.trim() === key),
        (sc) =>
          sc.cg.reduce<string[]>((acc, d, i) => {
            const v = sc.cgAssetIds?.[i];
            if (d.trim() === key && v) acc.push(v);
            return acc;
          }, []),
        (sc) => {
          const arr = [...(sc.cgAssetIds ?? [])];
          sc.cg.forEach((d, i) => {
            if (d.trim() === key) arr[i] = '';
          });
          return { ...sc, cgAssetIds: arr };
        },
      );
      await commitAssetSwap((s) => ({ project: { ...s.project, scenes } }), prevIds);
      flash('CG 업로드를 해제했습니다(Canvas 임시로 복귀).');
    },

    importMenuArt: async (file) => {
      try {
        const id = await uploadAsset(file, 'background', 'main_menu.png');
        const prev = get().project.menuArt?.main;
        await commitAssetSwap(
          (s) => ({ project: { ...s.project, menuArt: { ...s.project.menuArt, main: id } } }),
          prev ? [prev] : [],
          id,
        );
        flash('타이틀 배경을 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearMenuArt: async () => {
      const prev = get().project.menuArt?.main;
      await commitAssetSwap((s) => {
        const menuArt = { ...s.project.menuArt };
        delete menuArt.main;
        return { project: { ...s.project, menuArt } };
      }, prev ? [prev] : []);
      flash('타이틀 배경 업로드를 해제했습니다(테마 그라데이션으로 복귀).');
    },

    importTitleBgm: async (file) => {
      try {
        // ext 는 실제 MIME 기준(extFromMime) — 장면 BGM 처럼 파일명 확장자를 그대로 믿지 않는다
        // (types.ts Project.titleBgm JSDoc 의 wav→mp3 오라벨링 전례 참고).
        const ext = extFromMime(file.type);
        const id = await uploadAsset(file, 'bgm', `title_bgm.${ext}`);
        const prev = get().project.titleBgm?.assetId;
        await commitAssetSwap(
          (s) => ({ project: { ...s.project, titleBgm: { assetId: id, ext } } }),
          prev ? [prev] : [],
          id,
        );
        flash('타이틀 BGM을 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearTitleBgm: async () => {
      const prev = get().project.titleBgm?.assetId;
      await commitAssetSwap(
        (s) => ({ project: { ...s.project, titleBgm: undefined } }),
        prev ? [prev] : [],
      );
      flash('타이틀 BGM 업로드를 해제했습니다.');
    },

    importGameIcon: async (which, file) => {
      const isIco = which === 'ico';
      // .ico 는 OS 에 MIME 이 등록 안 돼 있으면 File.type 이 빈 문자열로 온다(Windows 에서 흔함).
      // 그때만 확장자로 판정해 mime 을 직접 넘긴다 — uploadAsset 의 image/* 검사에 막히지 않도록.
      const icoByExt = isIco && !file.type && /\.ico$/i.test(file.name);
      if (isIco && !icoByExt && !/^image\/(x-icon|vnd\.microsoft\.icon)$/.test(file.type)) {
        // png 를 .ico 슬롯에 올리면 Ren'Py 빌드가 조용히 아이콘을 안 바꾼다(파서가 ICO 헤더를 기대).
        // 여기서 막지 않으면 "배포했는데 아이콘이 기본값"이라는 나중에 알아채기 어려운 실패가 된다.
        flash('exe 아이콘은 .ico 파일이어야 합니다(PNG 는 아래 창 아이콘 칸에 올리세요).', 'error');
        return;
      }
      try {
        const id = await uploadAsset(
          file,
          'background',
          isIco ? GAME_ICON_FILE : (WINDOW_ICON_FILE.split('/').pop() as string),
          icoByExt ? { mime: 'image/x-icon' } : undefined,
        );
        const prev = get().project.gameIcon?.[which];
        await commitAssetSwap(
          (s) => ({ project: { ...s.project, gameIcon: { ...s.project.gameIcon, [which]: id } } }),
          prev ? [prev] : [],
          id,
        );
        flash(isIco ? 'exe 아이콘(.ico)을 적용했습니다.' : '게임 창 아이콘을 적용했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearGameIcon: async (which) => {
      const prev = get().project.gameIcon?.[which];
      await commitAssetSwap((s) => {
        const gameIcon = { ...s.project.gameIcon };
        delete gameIcon[which];
        return { project: { ...s.project, gameIcon } };
      }, prev ? [prev] : []);
      flash(which === 'ico' ? 'exe 아이콘을 해제했습니다.' : '게임 창 아이콘을 해제했습니다.');
    },

    importMenuButton: async (slot, state, file) => {
      // press(클릭 중) 상태는 Ren'Py imagebutton 이 지원하지 않는다(activate_ 프리픽스를 실제로
      // 세팅하는 코드가 엔진에 없는 죽은 슬롯) — 업로드 자체를 받지 않고 안내만 한다.
      if (!MENU_BUTTON_STATES.find((x) => x.id === state)?.renpySupported) {
        flash("클릭(눌림) 이미지는 Ren'Py 가 지원하지 않아 적용할 수 없습니다.");
        return;
      }
      try {
        // menuButtonFile 은 game/ 안 경로(gui/menu/<slot>_<state>.png) — uploadAsset 의 filename 인자는
        // 저장소 파일명일 뿐이라 그 basename 만 쓰되, 폴더 없는 flat 이름이라 눈에 띄게 menu_ 를 덧붙인다.
        const id = await uploadAsset(file, 'background', `menu_${menuButtonFile(slot, state).split('/').pop()}`);
        const prev = get().project.mainMenuUi?.buttons?.[slot]?.[state];
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              mainMenuUi: {
                ...s.project.mainMenuUi,
                buttons: {
                  ...s.project.mainMenuUi?.buttons,
                  [slot]: { ...s.project.mainMenuUi?.buttons?.[slot], [state]: id },
                },
              },
            },
          }),
          prev ? [prev] : [],
          id,
        );
        const slotLabel = MAIN_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
        const stateLabel = MENU_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
        flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 적용했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearMenuButton: async (slot, state) => {
      const prev = get().project.mainMenuUi?.buttons?.[slot]?.[state];
      await commitAssetSwap((s) => {
        const slotStates = { ...s.project.mainMenuUi?.buttons?.[slot] };
        delete slotStates[state];
        return {
          project: {
            ...s.project,
            mainMenuUi: {
              ...s.project.mainMenuUi,
              buttons: { ...s.project.mainMenuUi?.buttons, [slot]: slotStates },
            },
          },
        };
      }, prev ? [prev] : []);
      const slotLabel = MAIN_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
      const stateLabel = MENU_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
      flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 해제했습니다.`);
    },

    // 파일명 자동 매칭 일괄 업로드(matchMenuButtonFile) — 매칭된 것만 업로드하고 한 번의
    // commitAssetSwap 으로 반영한다(20장을 올려도 리렌더·autoSave 는 한 번). 매칭 실패 파일은
    // 조용히 버리지 않고 파일명을 토스트에 함께 보여준다(사용자가 파일명을 고쳐 다시 시도하도록).
    // press(클릭) 로 매칭된 파일은 "인식 실패"가 아니라 "건너뜀"으로 따로 안내한다 — 파일명은
    // 제대로 인식했지만 Ren'Py 가 그 상태를 지원하지 않아 저장하지 않는 것이라 원인이 다르다.
    importMenuButtons: async (files) => {
      const matched: { slot: MenuButtonSlot; state: MenuButtonState; file: File }[] = [];
      const unmatched: string[] = [];
      const skippedPress: string[] = [];
      for (const file of files) {
        const m = matchMenuButtonFile(file.name);
        if (!m) {
          unmatched.push(file.name);
          continue;
        }
        if (MENU_BUTTON_STATES.find((x) => x.id === m.state)?.renpySupported === false) {
          skippedPress.push(file.name);
          continue;
        }
        matched.push({ slot: m.slot, state: m.state, file });
      }
      if (matched.length === 0) {
        const parts: string[] = [];
        if (skippedPress.length) parts.push(`클릭 이미지는 지원하지 않아 제외: ${describeNames(skippedPress)}`);
        if (unmatched.length) parts.push(`인식 실패: ${describeNames(unmatched)}`);
        flash(parts.length ? parts.join(' / ') : '적용할 파일이 없습니다.');
        return;
      }
      try {
        const prevIds: string[] = [];
        const updates: { slot: MenuButtonSlot; state: MenuButtonState; id: string }[] = [];
        for (const { slot, state, file } of matched) {
          const id = await uploadAsset(file, 'background', `menu_${menuButtonFile(slot, state).split('/').pop()}`);
          const prev = get().project.mainMenuUi?.buttons?.[slot]?.[state];
          if (prev) prevIds.push(prev);
          updates.push({ slot, state, id });
        }
        await commitAssetSwap((s) => {
          const buttons = { ...s.project.mainMenuUi?.buttons };
          for (const u of updates) buttons[u.slot] = { ...buttons[u.slot], [u.state]: u.id };
          return { project: { ...s.project, mainMenuUi: { ...s.project.mainMenuUi, buttons } } };
        }, prevIds);
        let msg = `메뉴 버튼 ${updates.length}개를 적용했습니다.`;
        if (skippedPress.length) {
          msg += ` (클릭 이미지 ${skippedPress.length}개는 Ren'Py가 '누르는 중' 상태를 지원하지 않아 제외)`;
        }
        if (unmatched.length) msg += ` (인식 실패: ${describeNames(unmatched)})`;
        flash(msg);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    importTitleLogo: async (file) => {
      try {
        const id = await uploadAsset(file, 'background', TITLE_LOGO_FILE.split('/').pop()!);
        // 원본 가로/세로 비율을 재서 저장 — screensRpy 가 로고 박스를 정사각(xysize=(w,w))으로 굽으면
        // fit="contain" 이 3:1 가로형 로고를 세로 중앙정렬해 logoY 가 왼쪽 위 기준에서 어긋난다
        // (buildZip.ts 의 trimSpriteMargins 와 같은 createImageBitmap 패턴). 실패해도 업로드
        // 자체는 성공시키고(폴백 비율은 screensRpy 가 처리) 조용히 aspect 만 비운다.
        let logoAspect: number | undefined;
        try {
          const bitmap = await createImageBitmap(file);
          if (bitmap.width > 0 && bitmap.height > 0) logoAspect = bitmap.width / bitmap.height;
          bitmap.close?.();
        } catch {
          // 비율 측정 실패 — logoAspect 미지정(screensRpy 폴백 사용).
        }
        const prev = get().project.mainMenuUi?.logo;
        await commitAssetSwap(
          (s) => ({
            project: { ...s.project, mainMenuUi: { ...s.project.mainMenuUi, logo: id, logoAspect } },
          }),
          prev ? [prev] : [],
          id,
        );
        flash('타이틀 로고를 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearTitleLogo: async () => {
      const prev = get().project.mainMenuUi?.logo;
      await commitAssetSwap((s) => {
        const mainMenuUi = { ...s.project.mainMenuUi };
        delete mainMenuUi.logo;
        delete mainMenuUi.logoAspect; // 로고가 없는데 이전 비율만 남으면 다음 업로드 전까지 의미 없는 값.
        return { project: { ...s.project, mainMenuUi } };
      }, prev ? [prev] : []);
      flash('타이틀 로고 업로드를 해제했습니다(기존 제목 텍스트로 복귀).');
    },

    setMainMenuLayout: (patch) => {
      const { project } = get();
      get().updateProjectMeta({
        mainMenuUi: { ...project.mainMenuUi, layout: { ...project.mainMenuUi?.layout, ...patch } },
      });
    },

    setMainMenuPreset: (preset) => {
      const { project } = get();
      // layout·labels 오버라이드를 비운다 — 안 비우면 예전 프리셋에서 손댄 좌표/라벨이 새 프리셋
      // 위에도 그대로 남아 "프리셋을 골랐는데 기본값이 아니다"가 된다. 유실 경고는 UI 담당(확인창) 몫.
      get().updateProjectMeta({
        mainMenuUi: { ...project.mainMenuUi, preset, layout: undefined, labels: undefined },
      });
    },

    setMenuLabel: (slot, part, value) => {
      const { project } = get();
      const cur = { ...(project.mainMenuUi?.labels ?? {}) };
      const entry = { ...(cur[slot] ?? {}) };
      if (value) entry[part] = value;
      else delete entry[part]; // 빈 문자열 = 오버라이드 해제(프리셋 기본값으로 복귀)
      if (entry.main || entry.sub) cur[slot] = entry;
      else delete cur[slot]; // 주·부 둘 다 비었으면 슬롯 자체를 지운다(빈 객체 잔존 방지)
      get().updateProjectMeta({ mainMenuUi: { ...project.mainMenuUi, labels: cur } });
    },

    setMenuFont: (which, fontId) => {
      const { project } = get();
      const key = which === 'main' ? 'menuFontId' : 'menuSubFontId';
      const mainMenuUi = { ...project.mainMenuUi };
      if (fontId) mainMenuUi[key] = fontId;
      else delete mainMenuUi[key];
      get().updateProjectMeta({ mainMenuUi });
    },

    importQuickButton: async (slot, state, file) => {
      // press(클릭 중) 상태는 Ren'Py imagebutton 이 지원하지 않는다 — importMenuButton 과 같은 이유
      // (activate_ 프리픽스를 실제로 세팅하는 코드가 엔진에 없는 죽은 슬롯).
      if (!QUICK_BUTTON_STATES.find((x) => x.id === state)?.renpySupported) {
        flash("클릭(눌림) 이미지는 Ren'Py 가 지원하지 않아 적용할 수 없습니다.");
        return;
      }
      try {
        const id = await uploadAsset(file, 'background', `quick_${quickButtonFile(slot, state).split('/').pop()}`);
        const prev = get().project.quickMenuUi?.buttons?.[slot]?.[state];
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              quickMenuUi: {
                ...s.project.quickMenuUi,
                buttons: {
                  ...s.project.quickMenuUi?.buttons,
                  [slot]: { ...s.project.quickMenuUi?.buttons?.[slot], [state]: id },
                },
              },
            },
          }),
          prev ? [prev] : [],
          id,
        );
        const slotLabel = QUICK_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
        const stateLabel = QUICK_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
        flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 적용했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearQuickButton: async (slot, state) => {
      const prev = get().project.quickMenuUi?.buttons?.[slot]?.[state];
      await commitAssetSwap((s) => {
        const slotStates = { ...s.project.quickMenuUi?.buttons?.[slot] };
        delete slotStates[state];
        return {
          project: {
            ...s.project,
            quickMenuUi: {
              ...s.project.quickMenuUi,
              buttons: { ...s.project.quickMenuUi?.buttons, [slot]: slotStates },
            },
          },
        };
      }, prev ? [prev] : []);
      const slotLabel = QUICK_MENU_SLOTS.find((x) => x.id === slot)?.label ?? slot;
      const stateLabel = QUICK_BUTTON_STATES.find((x) => x.id === state)?.label ?? state;
      flash(`${slotLabel} 버튼(${stateLabel}) 이미지를 해제했습니다.`);
    },

    // 파일명 자동 매칭 일괄 업로드(matchQuickButtonFile) — importMenuButtons 와 동일 패턴: 매칭된
    // 것만 업로드하고 한 번의 commitAssetSwap 으로 반영. 매칭 실패 파일은 조용히 버리지 않고
    // 파일명을 토스트에 함께 보여준다. press(클릭) 매칭분은 "인식 실패"와 원인이 다르므로
    // "건너뜀"으로 따로 안내한다.
    importQuickButtons: async (files) => {
      const matched: { slot: QuickButtonSlot; state: QuickButtonState; file: File }[] = [];
      const unmatched: string[] = [];
      const skippedPress: string[] = [];
      for (const file of files) {
        const m = matchQuickButtonFile(file.name);
        if (!m) {
          unmatched.push(file.name);
          continue;
        }
        if (QUICK_BUTTON_STATES.find((x) => x.id === m.state)?.renpySupported === false) {
          skippedPress.push(file.name);
          continue;
        }
        matched.push({ slot: m.slot, state: m.state, file });
      }
      if (matched.length === 0) {
        const parts: string[] = [];
        if (skippedPress.length) parts.push(`클릭 이미지는 지원하지 않아 제외: ${describeNames(skippedPress)}`);
        if (unmatched.length) parts.push(`인식 실패: ${describeNames(unmatched)}`);
        flash(parts.length ? parts.join(' / ') : '적용할 파일이 없습니다.');
        return;
      }
      try {
        const prevIds: string[] = [];
        const updates: { slot: QuickButtonSlot; state: QuickButtonState; id: string }[] = [];
        for (const { slot, state, file } of matched) {
          const id = await uploadAsset(file, 'background', `quick_${quickButtonFile(slot, state).split('/').pop()}`);
          const prev = get().project.quickMenuUi?.buttons?.[slot]?.[state];
          if (prev) prevIds.push(prev);
          updates.push({ slot, state, id });
        }
        await commitAssetSwap((s) => {
          const buttons = { ...s.project.quickMenuUi?.buttons };
          for (const u of updates) buttons[u.slot] = { ...buttons[u.slot], [u.state]: u.id };
          return { project: { ...s.project, quickMenuUi: { ...s.project.quickMenuUi, buttons } } };
        }, prevIds);
        let msg = `퀵메뉴 버튼 ${updates.length}개를 적용했습니다.`;
        if (skippedPress.length) {
          msg += ` (클릭 이미지 ${skippedPress.length}개는 Ren'Py가 '누르는 중' 상태를 지원하지 않아 제외)`;
        }
        if (unmatched.length) msg += ` (인식 실패: ${describeNames(unmatched)})`;
        flash(msg);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    importQuickPanel: async (file) => {
      try {
        const id = await uploadAsset(file, 'background', `quick_${QUICK_PANEL_FILE.split('/').pop()}`);
        // 패널 원본 가로/세로(px) — importTitleLogo 의 logoAspect 측정과 같은 이유(screensRpy 가
        // 실제 비율로 배치). 실패해도 업로드는 성공시키고 조용히 치수만 비운다(screensRpy 폴백 232×625).
        let panelWidth: number | undefined;
        let panelHeight: number | undefined;
        try {
          const bitmap = await createImageBitmap(file);
          if (bitmap.width > 0 && bitmap.height > 0) {
            panelWidth = bitmap.width;
            panelHeight = bitmap.height;
          }
          bitmap.close?.();
        } catch {
          // 치수 측정 실패 — panelWidth/panelHeight 미지정(screensRpy 폴백 사용).
        }
        const prev = get().project.quickMenuUi?.panel;
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              quickMenuUi: { ...s.project.quickMenuUi, panel: id, panelWidth, panelHeight },
            },
          }),
          prev ? [prev] : [],
          id,
        );
        flash('퀵메뉴 패널 이미지를 업로드했습니다.');
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearQuickPanel: async () => {
      const prev = get().project.quickMenuUi?.panel;
      await commitAssetSwap((s) => {
        const quickMenuUi = { ...s.project.quickMenuUi };
        delete quickMenuUi.panel;
        delete quickMenuUi.panelWidth; // 패널이 없는데 이전 치수만 남으면 다음 업로드 전까지 의미 없는 값.
        delete quickMenuUi.panelHeight;
        return { project: { ...s.project, quickMenuUi } };
      }, prev ? [prev] : []);
      flash('퀵메뉴 패널 업로드를 해제했습니다(패널 없이 버튼만 표시).');
    },

    setQuickMenuLayout: (patch) => {
      const { project } = get();
      get().updateProjectMeta({
        quickMenuUi: { ...project.quickMenuUi, layout: { ...project.quickMenuUi?.layout, ...patch } },
      });
    },

    importEscImage: async (id, file) => {
      try {
        const assetId = await uploadAsset(file, 'background', `esc_${id}.png`);
        const prev = get().project.escMenuUi?.images?.[id];
        await commitAssetSwap(
          (s) => ({
            project: {
              ...s.project,
              escMenuUi: {
                ...s.project.escMenuUi,
                images: { ...s.project.escMenuUi?.images, [id]: assetId },
              },
            },
          }),
          prev ? [prev] : [],
          assetId,
        );
        const label = ESC_IMAGES.find((x) => x.id === id)?.label ?? id;
        flash(`${label} 이미지를 적용했습니다.`);
      } catch (e) {
        flash((e as Error).message);
      }
    },

    clearEscImage: async (id) => {
      const prev = get().project.escMenuUi?.images?.[id];
      await commitAssetSwap((s) => {
        const images = { ...s.project.escMenuUi?.images };
        delete images[id];
        return { project: { ...s.project, escMenuUi: { ...s.project.escMenuUi, images } } };
      }, prev ? [prev] : []);
      const label = ESC_IMAGES.find((x) => x.id === id)?.label ?? id;
      flash(`${label} 이미지를 해제했습니다.`);
    },

    // ESC 메뉴 글자색. 이미지가 아니라 Ren'Py 가 그리는 텍스트라 팔레트로만 맞출 수 있다(세이브
    // 날짜·대사 기록·페이지 번호처럼 동적인 글자가 대부분). 빈 문자열을 주면 그 롤은 기본값으로.
    setEscColors: (patch) => {
      const { project } = get();
      const colors = { ...project.escMenuUi?.colors, ...patch };
      for (const k of Object.keys(colors) as (keyof typeof colors)[]) {
        if (!colors[k]) delete colors[k];
      }
      get().updateProjectMeta({ escMenuUi: { ...project.escMenuUi, colors } });
    },

    // ESC 메뉴 글꼴 — setMenuFont(mainMenuUi) 와 같은 패턴. 빈 값이면 필드 자체를 지운다(인터페이스
    // 폰트로 복귀 — types.ts escMenuUi.fontId 주석 참고: 이미지가 하나도 없으면 애초에 무시된다).
    setEscFont: (fontId) => {
      const { project } = get();
      const escMenuUi = { ...project.escMenuUi };
      if (fontId) escMenuUi.fontId = fontId;
      else delete escMenuUi.fontId;
      get().updateProjectMeta({ escMenuUi });
    },

    // 파일명 자동 매칭 일괄 업로드(matchEscImageFile) — importQuickButtons 와 동일 패턴이지만
    // 슬롯×상태 격자가 아니라 역할 하나뿐이라 "press 건너뜀" 같은 세 번째 분류가 없다(매칭/불일치 둘뿐).
    // 23장을 업로드해도 commitAssetSwap 은 배치 전체에 한 번만 호출한다(재렌더·autoSave 1회).
    importEscImages: async (files) => {
      const matched: { id: EscImageId; file: File }[] = [];
      const unmatched: string[] = [];
      for (const file of files) {
        const id = matchEscImageFile(file.name);
        if (!id) {
          unmatched.push(file.name);
          continue;
        }
        matched.push({ id, file });
      }
      if (matched.length === 0) {
        flash(unmatched.length ? `인식 실패: ${describeNames(unmatched)}` : '적용할 파일이 없습니다.');
        return;
      }
      try {
        const prevIds: string[] = [];
        const updates: { id: EscImageId; assetId: string }[] = [];
        for (const { id, file } of matched) {
          const assetId = await uploadAsset(file, 'background', `esc_${id}.png`);
          const prev = get().project.escMenuUi?.images?.[id];
          if (prev) prevIds.push(prev);
          updates.push({ id, assetId });
        }
        await commitAssetSwap((s) => {
          const images = { ...s.project.escMenuUi?.images };
          for (const u of updates) images[u.id] = u.assetId;
          return { project: { ...s.project, escMenuUi: { ...s.project.escMenuUi, images } } };
        }, prevIds);
        let msg = `ESC 메뉴 이미지 ${updates.length}개를 적용했습니다.`;
        if (unmatched.length) msg += ` (인식 실패: ${describeNames(unmatched)})`;
        flash(msg);
      } catch (e) {
        flash((e as Error).message);
      }
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

    setTypecastKey: (key) => {
      set({ typecastKey: key });
      try {
        localStorage.setItem('na_typecast_key', key);
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

    clearGeneratedAssets: async () => {
      const { project } = get();
      const ids = collectReferencedAssetIds(project, { includeVoice: false });
      if (ids.size === 0) return flash('비울 에셋이 없습니다.');
      // 참조만 비우고 대본·캐릭터 설정(외형·성격·의상 정의·표정 목록)·GUI 는 유지.
      await commitAssetSwap(
        (s) => ({
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
            titleBgm: undefined,
            itemAssetIds: undefined,
            // mainMenuUi.logo/buttons 의 blob 도 위 ids 에 포함돼 아래에서 IndexedDB 에서 실제로
            // 지워진다 — 여기서 같이 비우지 않으면 프로젝트가 방금 삭제한 파일을 계속 참조해
            // (buildZip 이 없는 파일을 배치하거나 screensRpy 가 없는 파일을 참조) 런타임에 깨진다.
            // preset/layout/labels/menuFontId/menuSubFontId/textOutline/showInfoLinks 는 "배치 설정"
            // 이라 이미지가 아니므로 보존 — 이 액션의 안내 문구("대본·캐릭터 설정은 유지됩니다")와
            // 일치시킨다.
            mainMenuUi: s.project.mainMenuUi
              ? {
                  preset: s.project.mainMenuUi.preset,
                  layout: s.project.mainMenuUi.layout,
                  labels: s.project.mainMenuUi.labels,
                  menuFontId: s.project.mainMenuUi.menuFontId,
                  menuSubFontId: s.project.mainMenuUi.menuSubFontId,
                  textOutline: s.project.mainMenuUi.textOutline,
                  showInfoLinks: s.project.mainMenuUi.showInfoLinks,
                }
              : undefined,
          },
        }),
        [...ids],
      );
      flash(`업로드한 에셋 ${ids.size}개를 비웠습니다. 대본·캐릭터 설정은 유지됩니다.`);
    },

    findOrphanAssets: async () => {
      // ⚠️ 성우 음성도 반드시 포함해야 한다 — 빠뜨리면 실제로 재생 중인 TTS 오디오까지 고아로 오판됨.
      const referenced = collectReferencedAssetIds(get().project, { includeVoice: true });
      const idbKeys = await getAllAssetKeys();
      const metaMap = get().assets;
      const orphanIds = diffOrphanIds(referenced, idbKeys, Object.keys(metaMap));
      if (orphanIds.length === 0) return [];
      const infos = await getAssetInfos(orphanIds);
      const items: OrphanAsset[] = orphanIds.map((id) => {
        const meta = metaMap[id];
        const info = infos.get(id);
        return {
          id,
          kind: meta?.kind,
          filename: meta?.filename,
          createdAt: meta?.createdAt,
          size: info?.size ?? 0,
          mime: meta?.mime ?? info?.mime ?? '',
          // getAssetInfos 는 IDB 에 blob 이 없는 id 를 결과에서 빼므로, 미스 = 메타만 남은 항목.
          missing: !info,
        };
      });
      // 최신순(생성일 없는 항목 — 메타 없는 협업 캐시 — 은 맨 뒤로).
      items.sort((a, b) => (b.createdAt ?? -Infinity) - (a.createdAt ?? -Infinity));
      return items;
    },

    deleteOrphanAssets: async (ids) => {
      if (ids.length === 0) return;
      await deleteAssets(ids);
      // orphans 가 커질 수 있어 Object.entries().filter(id => orphans.includes(id)) 같은 O(n²) 대신
      // Set 조회로 가지친다(옛 cleanupOrphanAssets 는 .includes 를 썼다).
      const idSet = new Set(ids);
      set((s) => ({
        assets: Object.fromEntries(Object.entries(s.assets).filter(([id]) => !idSet.has(id))),
      }));
      autoSave();
      flash(`고아 에셋 ${ids.length}개를 삭제했습니다.`, 'success');
    },

    findRemoteOrphanAssets: async (graceMs) => {
      if (!isCollabReady()) return [];
      const [remote, remoteReferenced] = await Promise.all([listRemoteAssets(), collectRemoteReferencedIds()]);
      // fail-closed — 목록이든 참조든 조회가 하나라도 실패하면 스윕을 아예 접는다. 특히 참조 조회가
      // 실패했는데 그냥 진행하면 참조 집합이 비어 **원격 파일 전부가 고아로 보이고**, 사용자가 상대방
      // 에셋까지 한 번에 지우게 된다. 목록 조회 실패를 빈 결과로 넘기면 정책 미적용(403)이 "정리할
      // 게 없습니다"라는 거짓 성공으로 보이는 문제도 있다.
      if (remote.failed || remoteReferenced.failed) {
        flash('서버 조회에 실패해 정리를 중단했습니다. 네트워크·Supabase 정책(setup.sql)을 확인하세요.', 'error');
        return null; // [] 로 돌려주면 호출부가 "지울 게 없음"으로 오해해 이 에러 토스트를 덮어쓴다.
      }
      if (remote.assets.length === 0) return [];
      // 원격 스캔은 "지금까지 push 된 프로젝트 JSON"만 보는데, 로컬 편집은 autoSave 디바운스(600ms)를
      // 타고 나가고 아예 한 번도 push 안 된 방(막 시작한 세션 등)은 원격 스캔에 안 잡힌다. 그래서
      // 로컬 프로젝트의 참조 집합과 로컬 AssetMeta 맵 키까지 합쳐야 지금 쓰고 있는 걸 고아로
      // 오판하지 않는다(원격 findOrphanAssets 판정 로직과 동일한 이유로 로컬 쪽도 방어).
      const localReferenced = collectReferencedAssetIds(get().project, { includeVoice: true });
      const referenced = new Set<string>([...remoteReferenced.ids, ...localReferenced, ...Object.keys(get().assets)]);
      const orphans = diffRemoteOrphans(remote.assets, referenced, {
        now: Date.now(),
        graceMs: graceMs ?? DEFAULT_REMOTE_GRACE_MS,
      });
      const items: OrphanAsset[] = orphans.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        size: a.size,
        mime: '',
      }));
      items.sort((a, b) => (b.createdAt ?? -Infinity) - (a.createdAt ?? -Infinity));
      return items;
    },

    deleteRemoteOrphanAssets: async (ids) => {
      if (ids.length === 0) return;
      const { removed, failed } = await removeRemoteAssets(ids);
      if (failed.length > 0) {
        flash(`원격 고아 에셋 ${removed}개 삭제, ${failed.length}개 실패했습니다.`, 'error');
        return;
      }
      flash(`원격 고아 에셋 ${removed}개를 삭제했습니다.`, 'success');
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
});

export { sceneById } from './helpers';
export type { Tab } from './types';
