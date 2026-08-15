import type { Locale, Expression } from '../types';
import { translateModeOf, translateModelFor, baseLocaleOf } from '../types';
import { collectUntranslated } from '../generators/translate/collect';
import { translateBatch, chunkItems, isFatalTranslateError } from '../generators/translate';
import { sleep } from '../generators/shared/retry';
import { collectEmotionTargets, planEmotionChunks, selectEmotionsBatch } from '../generators/emotion/aiSelect';
import { estimateEmotionCost } from '../generators/emotion/estimate';
import {
  collectOutfitTargets,
  estimateOutfitCost,
  outfitLineKey,
  planOutfitWindows,
  suggestOutfitsBatch,
  type OutfitSuggestion,
} from '../generators/outfit';
import { buildSynopsis } from '../generators/theme';
import type { State } from './types';
import type { SliceCreator } from './context';
import { sceneById, applyEmotionUpdates } from './helpers';

// setTranslateMode/autoTranslateAll/autoAssignEmotionAll/autoSuggestOutfitsAll — 번역·표정·의상 AI
// 일괄 처리 액션은 busy 키·진행률·PACE_MS·outer 루프 abort·단일 커밋이라는 같은 구조를 공유해서
// 한 파일로 묶는다. 의상만 다른 점: 결과를 canonical 이 아니라 **휘발성 제안 목록**에 커밋하고,
// 커밋 직전에 revision guard 로 "실행 중 입력이 바뀌었는지"를 확인한다.
export const createAiBatchSlice: SliceCreator<
  Pick<State, 'setTranslateMode' | 'autoTranslateAll' | 'autoAssignEmotionAll' | 'autoSuggestOutfitsAll'>
> = (set, get, ctx) => {
  const { flash, autoSave, setScenes } = ctx;
  return {
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
      set((s) => ({
        busy: { ...s.busy, 'batch:translate': true },
        translateProgress: { done: 0, total: batches.length },
      }));
      let done = 0;
      let failScenes = 0;
      let doneScenes = 0;
      let aborted = false; // 키/쿼터 오류처럼 재시도해도 의미 없는 치명적 오류 — 배치 전체 중단
      // 채워진 칸을 sceneId → lineIndex → locale → text 로 모아뒀다가 루프가 끝난 뒤 scenes 를
      // 딱 1회만 재구축한다 — 예전엔 채워진 칸마다 setLineTranslation(=set 전체 재맵핑+autoSave
      // 디바운스 리셋)을 호출해 장면·로케일 수에 비례해 최대 수백 번 리렌더/저장이 발생했다.
      const updates = new Map<string, Map<number, Partial<Record<Locale, string>>>>();
      // 연속 호출을 곧바로 이어 붙이면 레이트리밋에 걸리기 쉬워(보이스 일괄생성에서 확인된 패턴)
      // 청크 호출 사이에 일정 간격을 둔다. callIndex 는 장면 경계를 넘어 전체 호출 기준으로 센다.
      const PACE_MS = 1200;
      let callIndex = 0;
      try {
        outer: for (const { sceneId, items } of batches) {
          let sceneFailed = false;
          // "이 줄에 없는 언어" 조합이 같은 줄끼리 묶어 그 언어만 요청한다 — 예전엔 항상 en·ja 를
          // 통째로 요청해서, 한쪽만 비어 있던 줄은 멀쩡한 기존 번역(엑셀 C/D열·손본 검수본)까지
          // 새 번역으로 덮어썼고 토큰도 두 배로 썼다.
          const groups = new Map<string, { targets: Locale[]; items: typeof items }>();
          for (const it of items) {
            const need = it.missing?.length ? it.missing : targets;
            const sig = need.join(',');
            const g = groups.get(sig);
            if (g) g.items.push(it);
            else groups.set(sig, { targets: need, items: [it] });
          }
          for (const { targets: groupTargets, items: groupItems } of groups.values()) {
            for (const chunk of chunkItems(groupItems, (it) => it.ko.length)) {
              if (callIndex > 0) await sleep(PACE_MS);
              callIndex++;
              try {
                const result = await translateBatch(chunk, groupTargets, model, key);
                for (const it of chunk) {
                  const tr = result[it.i];
                  if (!tr) continue;
                  for (const loc of groupTargets) {
                    const v = tr[loc];
                    if (v && v.trim()) {
                      let sceneUpdates = updates.get(sceneId);
                      if (!sceneUpdates) {
                        sceneUpdates = new Map();
                        updates.set(sceneId, sceneUpdates);
                      }
                      sceneUpdates.set(it.i, { ...sceneUpdates.get(it.i), [loc]: v });
                      done++;
                    }
                  }
                }
              } catch (e) {
                sceneFailed = true;
                console.warn('[자동번역] 청크 실패:', sceneId, e);
                if (isFatalTranslateError(e)) {
                  aborted = true;
                  break outer;
                }
              }
            }
          }
          if (sceneFailed) failScenes++;
          doneScenes++;
          set(() => ({ translateProgress: { done: doneScenes, total: batches.length } }));
        }
      } finally {
        set((s) => ({ busy: { ...s.busy, 'batch:translate': false }, translateProgress: null }));
      }
      if (updates.size) {
        const scenes = get().project.scenes.map((sc) => {
          const sceneUpdates = updates.get(sc.id);
          if (!sceneUpdates) return sc;
          const lines = sc.lines.map((l, i) => {
            const lineUpdate = sceneUpdates.get(i);
            if (!lineUpdate || l.kind === 'item' || l.kind === 'cg' || l.kind === 'bgm') return l; // 아이템·CG·BGM 라인은 번역 없음
            return { ...l, i18n: { ...(l.i18n ?? {}), ...lineUpdate } };
          });
          return { ...sc, lines };
        });
        setScenes(scenes); // 단일 set + 단일 autoSave
      }
      if (aborted) {
        flash(
          `자동 번역 중단 — ${done}건 채움 · API 키/쿼터 오류로 중단됨(키·잔액을 확인하세요).`,
          'error',
        );
      } else {
        const msg =
          `자동 번역 완료 — ${done}건 채움` + (failScenes ? ` · ${failScenes}개 장면 실패(재시도 가능)` : '');
        flash(msg, failScenes ? 'error' : 'success');
      }
    },

    // autoTranslateAll 과 완전히 같은 골격(busy 키·진행률·PACE_MS·outer 루프 abort·finally 정리·
    // 단일 커밋·완료 토스트)이다 — 다른 건 대상 수집(collectEmotionTargets)·청크당 호출
    // (selectEmotionsBatch)·커밋 함수(applyEmotionUpdates)뿐.
    autoAssignEmotionAll: async () => {
      const project = get().project;
      const key = get().openaiKey.trim();
      if (!key) {
        flash('OpenAI 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const batches = collectEmotionTargets(project);
      if (!batches.length) {
        flash('AI 로 배정할 표정이 없습니다(이미 모두 채워짐 또는 업로드된 스프라이트 없음).');
        return;
      }
      const estimate = estimateEmotionCost(project);
      const ok = window.confirm(
        `AI 표정 배정을 실행합니다.\n` +
          `대상 대사: ${estimate.targetLines}줄 · 예상 요청 ${estimate.requests}회\n` +
          `예상 비용: 약 $${estimate.usd.toFixed(4)}(gpt-4o-mini 기준, 실제 과금은 OpenAI 대시보드가 정본)\n` +
          `계속할까요?`,
      );
      if (!ok) return;

      set((s) => ({
        busy: { ...s.busy, 'batch:emotion': true },
        emotionProgress: { done: 0, total: batches.length },
      }));
      const synopsis = buildSynopsis(project);
      let done = 0;
      let failScenes = 0;
      let doneScenes = 0;
      let aborted = false; // 키/쿼터 오류처럼 재시도해도 의미 없는 치명적 오류 — 배치 전체 중단
      // sceneId → lineIndex → 배정된 표정. 루프가 끝난 뒤 applyEmotionUpdates 로 딱 1번만 커밋한다
      // (autoTranslateAll 의 updates Map 누적 → 단일 커밋과 동일한 이유 — 채워질 때마다 scenes 를
      // 재빌드하면 장면·줄 수에 비례해 리렌더/저장이 반복된다).
      const updates = new Map<string, Map<number, Expression>>();
      const PACE_MS = 1200; // 연속 호출 레이트리밋 회피(자동 번역과 동일 기준)
      let callIndex = 0;
      try {
        outer: for (const batch of batches) {
          const scene = sceneById(project.scenes, batch.sceneId);
          if (!scene) {
            doneScenes++;
            continue;
          }
          let sceneFailed = false;
          // target 청크 경계(40줄/4000자)는 그대로 두고, 각 요청에 실제 대본 기반의 읽기 전용 문맥을
          // 얹은 계획을 받는다 — 견적(estimate.ts)이 세는 문맥과 같은 함수에서 나온다.
          const plans = planEmotionChunks(batch);
          for (const plan of plans) {
            if (callIndex > 0) await sleep(PACE_MS);
            callIndex++;
            // 후보는 배치 전체 맵을 그대로 넘긴다 — 프롬프트에 실을 그룹은 selectEmotionsBatch 가
            // 청크 items 에서 역산한다(후보를 여기서 한 번 더 추리면 "프롬프트에 실린 후보"와
            // "응답 검증에 쓰는 후보"가 두 곳에서 따로 정해져 어긋날 수 있다).
            try {
              const result = await selectEmotionsBatch(
                plan.items,
                {
                  sceneTitle: scene.title,
                  background: scene.background,
                  direction: scene.direction,
                  cg: scene.cg,
                  synopsis,
                  candidatesByKey: batch.candidatesByKey,
                  expressionNotes: project.expressionNotes,
                  contextLines: plan.context,
                },
                key,
              );
              for (const it of plan.items) {
                const expr = result[it.i];
                if (!expr) continue; // 파싱 실패/후보 밖 — resolve.ts 의 휴리스틱 폴백에 맡긴다
                let sceneUpdates = updates.get(batch.sceneId);
                if (!sceneUpdates) {
                  sceneUpdates = new Map();
                  updates.set(batch.sceneId, sceneUpdates);
                }
                sceneUpdates.set(it.i, expr);
                done++;
              }
            } catch (e) {
              sceneFailed = true;
              console.warn('[AI 표정 배정] 청크 실패:', batch.sceneId, e);
              if (isFatalTranslateError(e)) {
                aborted = true;
                break outer;
              }
            }
          }
          if (sceneFailed) failScenes++;
          doneScenes++;
          set(() => ({ emotionProgress: { done: doneScenes, total: batches.length } }));
        }
      } finally {
        set((s) => ({ busy: { ...s.busy, 'batch:emotion': false }, emotionProgress: null }));
      }
      if (updates.size) {
        setScenes(applyEmotionUpdates(get().project.scenes, updates)); // 단일 set + 단일 autoSave
      }
      if (aborted) {
        flash(
          `AI 표정 배정 중단 — ${done}건 채움 · API 키/쿼터 오류로 중단됨(키·잔액을 확인하세요).`,
          'error',
        );
      } else {
        const msg =
          `AI 표정 배정 완료 — ${done}건 채움` + (failScenes ? ` · ${failScenes}개 장면 실패(재시도 가능)` : '');
        flash(msg, failScenes ? 'error' : 'success');
      }
    },

    // 위 두 배치와 같은 골격이되 **canonical 을 건드리지 않는다** — 결과는 검수 대기 제안 목록으로만
    // 들어가고, 사용자가 수락한 것만 Line.outfits 로 넘어간다(scriptSlice 의 apply 액션들).
    autoSuggestOutfitsAll: async () => {
      const project = get().project;
      const key = get().openaiKey.trim();
      if (!key) {
        flash('OpenAI 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
        return;
      }
      const batches = collectOutfitTargets(project);
      if (!batches.length) {
        flash('의상 전환을 찾을 대상이 없습니다(추가 의상을 가진 등장인물이 필요합니다).');
        return;
      }
      const estimate = estimateOutfitCost(project);
      if (!estimate.requests) {
        flash('의상 전환을 찾을 대상이 없습니다(스캔할 대사가 없습니다).');
        return;
      }
      const ok = window.confirm(
        `AI 의상 전환 추천을 실행합니다.\n` +
          `스캔 대상: ${estimate.scanLines}줄 · 예상 요청 ${estimate.requests}회\n` +
          `예상 비용: 약 $${estimate.usd.toFixed(4)}(gpt-4o-mini 기준, 실제 과금은 OpenAI 대시보드가 정본)\n` +
          `대본이 옷을 갈아입는다고 말한 자리만 제안합니다(바로 반영되지 않고 검수 후 적용).\n` +
          `계속할까요?`,
      );
      if (!ok) return;

      // ⚠️ stale-run guard 의 기준점. 실행 중 입력이 바뀌면(편집·의상 삭제·원격 반영 등 §invalidation)
      // 이 값이 올라가고, 최종 커밋 직전 비교에서 걸려 이번 run 의 결과를 통째로 버린다.
      const startRev = get().outfitSuggestionRevision;

      set((s) => ({
        busy: { ...s.busy, 'batch:outfit': true },
        outfitProgress: { done: 0, total: batches.length },
      }));
      const synopsis = buildSynopsis(project);
      const collected: Record<string, OutfitSuggestion[]> = {};
      let found = 0;
      let failScenes = 0;
      let doneScenes = 0;
      let aborted = false;
      const PACE_MS = 1200;
      let callIndex = 0;
      try {
        outer: for (const batch of batches) {
          const scene = sceneById(project.scenes, batch.sceneId);
          if (!scene) {
            doneScenes++;
            continue;
          }
          let sceneFailed = false;
          // 실행과 견적이 같은 planner 를 쓴다 — 요청 수가 어긋날 수 없다.
          const plans = planOutfitWindows(batch, scene, project.outfitRules);
          for (const plan of plans) {
            if (callIndex > 0) await sleep(PACE_MS);
            callIndex++;
            try {
              const changes = await suggestOutfitsBatch(plan, batch, {
                sceneTitle: scene.title,
                background: scene.background,
                direction: scene.direction,
                synopsis,
              }, key);
              for (const c of changes) {
                const line = scene.lines[c.i];
                if (!line) continue;
                const list = collected[batch.sceneId] ?? [];
                list.push({
                  sceneId: batch.sceneId,
                  lineIndex: c.i,
                  character: c.character,
                  outfit: c.outfit,
                  reason: c.reason,
                  // 제안 생성 시점의 줄 지문 — 적용 시점에 대본이 바뀌었으면 여기서 걸린다.
                  lineKey: outfitLineKey(line),
                });
                collected[batch.sceneId] = list;
                found++;
              }
            } catch (e) {
              sceneFailed = true;
              console.warn('[AI 의상 추천] 요청 실패:', batch.sceneId, e);
              if (isFatalTranslateError(e)) {
                aborted = true;
                break outer;
              }
            }
          }
          if (sceneFailed) failScenes++;
          doneScenes++;
          set(() => ({ outfitProgress: { done: doneScenes, total: batches.length } }));
        }
      } finally {
        set((s) => ({ busy: { ...s.busy, 'batch:outfit': false }, outfitProgress: null }));
      }

      // ⚠️ 커밋 직전 단 한 번의 비교. 다르면 **부분 채택도 하지 않는다** — 낡은 입력으로 만든 제안은
      // 인덱스·현재 의상 전제가 전부 흔들렸을 수 있어서 골라낼 방법이 없다.
      if (get().outfitSuggestionRevision !== startRev) {
        flash(
          '프로젝트가 의상 AI 분석 중 변경되었습니다. 이번 제안은 적용하지 않았습니다 — 다시 실행해주세요.',
          'error',
        );
        return;
      }
      // 단일 커밋. run 결과로 목록을 **통째로 교체**한다(부분 merge 아님 — 이번 실행이 본 대본 전체가 근거).
      set({ outfitSuggestions: collected });

      if (aborted) {
        flash(
          `AI 의상 추천 중단 — ${found}건 제안 · API 키/쿼터 오류로 중단됨(키·잔액을 확인하세요).`,
          'error',
        );
      } else if (!found) {
        flash('의상 전환으로 볼 만한 대목을 찾지 못했습니다.');
      } else {
        const msg =
          `AI 의상 추천 완료 — ${found}건 제안(장면 카드에서 검수 후 적용)` +
          (failScenes ? ` · ${failScenes}개 장면 실패(재시도 가능)` : '');
        flash(msg, failScenes ? 'error' : 'success');
      }
    },
  };
};
