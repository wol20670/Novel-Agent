import type { Locale, Expression } from '../types';
import { translateModeOf, translateModelFor, baseLocaleOf } from '../types';
import { collectUntranslated } from '../generators/translate/collect';
import { translateBatch, chunkItems, isFatalTranslateError } from '../generators/translate';
import { sleep } from '../generators/shared/retry';
import { collectEmotionTargets, selectEmotionsBatch } from '../generators/emotion/aiSelect';
import { estimateEmotionCost } from '../generators/emotion/estimate';
import { buildSynopsis } from '../generators/theme';
import type { State } from './types';
import type { SliceCreator } from './context';
import { sceneById, applyEmotionUpdates } from './helpers';

// setTranslateMode/autoTranslateAll/autoAssignEmotionAll — 번역·표정 두 AI 일괄 처리 액션은
// busy 키·진행률·PACE_MS·outer 루프 abort·단일 커밋이라는 같은 구조를 공유해서 한 파일로 묶는다.
export const createAiBatchSlice: SliceCreator<
  Pick<State, 'setTranslateMode' | 'autoTranslateAll' | 'autoAssignEmotionAll'>
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
          const chunks = chunkItems(batch.items, (it) => it.text.length);
          // 청크 경계에서 감정 흐름이 끊기지 않도록 직전 청크의 마지막 몇 줄을 다음 청크 프롬프트에
          // 읽기 전용 문맥으로 넘긴다(AI 응답이 아니라 원본 줄 — 다음 청크 호출 전에 이미 알 수 있다).
          let prevContextLines: { speaker: string; text: string }[] = [];
          for (const chunk of chunks) {
            if (callIndex > 0) await sleep(PACE_MS);
            callIndex++;
            // 후보는 배치 전체 맵을 그대로 넘긴다 — 프롬프트에 실을 그룹은 selectEmotionsBatch 가
            // 청크 items 에서 역산한다(후보를 여기서 한 번 더 추리면 "프롬프트에 실린 후보"와
            // "응답 검증에 쓰는 후보"가 두 곳에서 따로 정해져 어긋날 수 있다).
            try {
              const result = await selectEmotionsBatch(
                chunk,
                {
                  sceneTitle: scene.title,
                  background: scene.background,
                  direction: scene.direction,
                  cg: scene.cg,
                  synopsis,
                  candidatesByKey: batch.candidatesByKey,
                  expressionNotes: project.expressionNotes,
                  prevContextLines,
                },
                key,
              );
              for (const it of chunk) {
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
            prevContextLines = chunk.slice(-3).map((it) => ({ speaker: it.speaker, text: it.text }));
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
  };
};
