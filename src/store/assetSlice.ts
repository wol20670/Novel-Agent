import { effectiveExpressions, matchExpressionFile } from '../types';
import type { Expression, OrphanAsset } from '../types';
import { backgroundKey, bgmKey } from '../renpy/generate';
import { applyAssetToGroup, clearAssetFromGroup } from '../project/sceneAssets';
import { deleteAssets, getAllAssetKeys, getAssetInfos } from '../storage/assetStore';
import { collectReferencedAssetIds, diffOrphanIds, diffRemoteOrphans, DEFAULT_REMOTE_GRACE_MS } from '../assetRefs';
import { isCollabReady, listRemoteAssets, collectRemoteReferencedIds, removeRemoteAssets } from '../collab';
import type { State } from './types';
import type { SliceCreator } from './context';
import { describeNames, safeFileName, withSpriteAsset } from './helpers';

export const createAssetSlice: SliceCreator<
  Pick<
    State,
    | 'importBackground'
    | 'importSprite'
    | 'importSpritesBatch'
    | 'uploadItem'
    | 'removeItem'
    | 'importCg'
    | 'clearCg'
    | 'importBgm'
    | 'clearBgm'
    | 'renameBackgroundGroup'
    | 'clearBackgroundGroup'
    | 'renameCgGroup'
    | 'importCgGroup'
    | 'clearCgGroup'
    | 'clearBgmGroup'
    | 'clearGeneratedAssets'
    | 'findOrphanAssets'
    | 'deleteOrphanAssets'
    | 'findRemoteOrphanAssets'
    | 'deleteRemoteOrphanAssets'
  >
> = (set, get, ctx) => {
  const { flash, autoSave, commitAssetSwap, uploadAsset } = ctx;
  return {
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

    // 같은 배경 이름을 쓰는 모든 장면의 배경 이름을 한 번에 변경(라이브러리 편집).
    renameBackgroundGroup: (key, name) => {
      // ⚠️ 에셋 액션처럼 보이지만 바꾸는 건 **scene.background 문자열**이다 — Outfit AI 의 LLM 문맥이자
      // OutfitRule(배경 키워드) baseline 판정의 입력이라 제안이 낡는다. updateScene 을 안 타므로 직접 배선.
      get().invalidateOutfitSuggestions();
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
      if (!oldKey || oldKey === next) return; // 실제 변경 없음 — epoch 을 올리지 않는다
      // ⚠️ **CG cutoff 가 움직인다.** 이 액션은 scene.cg 문자열만 바꾸고 kind:'cg' 라인의 desc 는 그대로 두므로,
      // 매칭되던 마커가 orphan 이 되어(또는 그 반대로) first effective CG 가 이동한다 = writable 경계 변경.
      // importCgGroup(cgAssetIds 만 바꿈)과 달리 여기는 semantic identity 변경이라 무효화 대상이다.
      get().invalidateOutfitSuggestions();
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
  };
};
