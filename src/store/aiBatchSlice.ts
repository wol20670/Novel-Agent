import type { Locale, Expression, Project } from '../types';
import { translateModeOf, translateModelFor, translateTargetsOf } from '../types';
import { collectUntranslated } from '../generators/translate/collect';
import { translateBatch, chunkItems, isFatalTranslateError } from '../generators/translate';
import { sleep } from '../generators/shared/retry';
import {
  buildEmotionRequest,
  candidateKey,
  collectEmotionTargets,
  planEmotionChunks,
  selectEmotionsBatch,
  type EmotionItem,
} from '../generators/emotion/aiSelect';
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

/**
 * 표정 배치가 실행 중에만 들고 다니는 결과 하나 — **저장되지 않는다.**
 * Project/Scene/Line 어디에도 새 필드가 생기지 않는다(persistent schema 증가 0).
 *
 * `requestKey` 는 provenance 가 아니라 **stale 판정용 ephemeral 값**이다: 이 결과를 만든 요청의
 * (system, user) 원문이라, 커밋 직전에 현재 project 로 같은 요청을 다시 만들어 비교하면
 * "그때 모델이 본 근거가 지금도 같은가"를 추측 없이 판정할 수 있다.
 */
interface PendingEmotionUpdate {
  expr: Expression;
  /** 그 요청의 EmotionItem 값 그대로(새로 계산하지 않는다) — target anchor·(화자,의상) identity. */
  speaker: string;
  text: string;
  outfit: string;
  requestKey: string;
}

/**
 * 요청 원문 → stale 판정 키. 해시 라이브러리를 쓰지 않는다(문자열 비교로 충분하고, 어긋났을 때
 * 원인이 그대로 보인다). 직렬화가 `candidateKey`(emotion/aiSelect.ts)와 같은 JSON 배열 관용구인
 * 이유도 같다 — 구분자 문자를 박으면 그 문자가 프롬프트에 등장하는 순간 서로 다른 (system, user)
 * 조합이 같은 키가 되고, 결국 별도 escaping 규칙을 만들게 된다.
 */
function emotionRequestKey(system: string, user: string): string {
  return JSON.stringify([system, user]);
}

/**
 * 커밋 직전 재검증 — **의상 AI 의 global revision epoch 를 복사하지 않는다.**
 * 의상은 sparse(제안 몇 건)라 run 전체 폐기가 싸지만, 표정은 dense·유료(수백 줄)라 무관한 편집 하나에
 * run 전체를 버리면 비용이 사용자에게 전가된다. 그래서 **어긋난 update 만** 버리고 나머지는 살린다.
 *
 * 판정은 두 축이다(중복이 아니라 역할 분리):
 *  · target validation  = "이 결과를 지금 이 줄에 써도 되는가"(1~8)
 *  · request validation = "이 결과를 만든 LLM 판단 근거가 아직 같은가"(9)
 *
 * 1·2·3·5·6 은 **기존 collectEmotionTargets 의 gate 가 그대로 제공한다** — 아직 emotionAuto 를 쓰기
 * 전이라, 그 사이 사람이 표정을 직접 고른 줄(또는 사라진 줄)은 fresh 목록에서 자연히 빠진다.
 * 새 fingerprint/dependency framework 를 만들지 않고 기존 planner·builder 를 그대로 다시 태운다.
 */
function validateEmotionUpdates(
  currentProject: Project,
  pending: Map<string, Map<number, PendingEmotionUpdate>>,
): { valid: Map<string, Map<number, Expression>>; skipped: number } {
  const synopsis = buildSynopsis(currentProject);
  const lineKey = (sceneId: string, i: number) => JSON.stringify([sceneId, i]);
  const fresh = new Map<string, { item: EmotionItem; requestKey: string; candidates: Expression[] }>();

  // 현재 project 로 대상·청크·요청을 **실행 때와 같은 경로**로 다시 만든다.
  for (const batch of collectEmotionTargets(currentProject)) {
    const scene = sceneById(currentProject.scenes, batch.sceneId);
    if (!scene) continue;
    for (const plan of planEmotionChunks(batch)) {
      const { system, user } = buildEmotionRequest(plan.items, {
        sceneTitle: scene.title,
        background: scene.background,
        direction: scene.direction,
        cg: scene.cg,
        synopsis,
        candidatesByKey: batch.candidatesByKey,
        expressionNotes: currentProject.expressionNotes,
        contextLines: plan.context,
      });
      const requestKey = emotionRequestKey(system, user);
      for (const it of plan.items) {
        fresh.set(lineKey(batch.sceneId, it.i), {
          item: it,
          requestKey,
          candidates: batch.candidatesByKey.get(candidateKey(it.speaker, it.outfit)) ?? [],
        });
      }
    }
  }

  const valid = new Map<string, Map<number, Expression>>();
  let skipped = 0;
  for (const [sceneId, lineMap] of pending) {
    for (const [i, u] of lineMap) {
      const f = fresh.get(lineKey(sceneId, i));
      // 1·2·3·5·6 — 장면·줄이 사라졌거나, 더 이상 배정 대상이 아니거나(사람이 표정을 직접 지정 등)
      if (!f) {
        skipped += 1;
        continue;
      }
      // 4 줄 anchor · 7 (화자, 의상) candidate identity — 의상만 바뀌어도 후보 공간이 달라진다
      if (f.item.speaker !== u.speaker || f.item.text !== u.text || f.item.outfit !== u.outfit) {
        skipped += 1;
        continue;
      }
      // 8 고른 표정이 지금도 그 줄의 유효 후보인가(스프라이트·표정 목록이 바뀌었을 수 있다)
      if (!f.candidates.includes(u.expr)) {
        skipped += 1;
        continue;
      }
      // 9 그 결과를 만든 요청이 지금도 같은가(문맥 줄·장면 메타·시놉시스·후보까지 전부 포함된 원문 비교)
      if (f.requestKey !== u.requestKey) {
        skipped += 1;
        continue;
      }
      let m = valid.get(sceneId);
      if (!m) {
        m = new Map();
        valid.set(sceneId, m);
      }
      m.set(i, u.expr);
    }
  }
  return { valid, skipped };
}
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
      const targets = translateTargetsOf(project);
      const batches = collectUntranslated(project, targets);
      if (!batches.length) {
        flash('번역할 빈 칸이 없습니다(이미 모두 채워짐).');
        return;
      }
      // ⚠️ 키 검사는 "채울 게 있다"가 확정된 **뒤**에 한다 — 앞에 두면 번역이 이미 다 찬 프로젝트에서
      // 키만 없는 사용자에게 "OpenAI 키가 필요합니다"가 뜬다(실제로는 할 일이 없는 상태라 키도 필요 없다).
      const key = get().openaiKey.trim();
      if (!key) {
        flash('OpenAI 키가 필요합니다(왼쪽 패널에서 입력).', 'error');
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
            // collectUntranslated 를 거친 항목이라 missing 은 항상 채워져 있다(UntranslatedItem) —
            // targets 로 폴백하면 대상 판정이 두 벌이 된다.
            const need = it.missing;
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
      let failScenes = 0;
      let doneScenes = 0;
      let aborted = false; // 키/쿼터 오류처럼 재시도해도 의미 없는 치명적 오류 — 배치 전체 중단
      // sceneId → lineIndex → 배정 결과(+ stale 판정용 anchor·requestKey). 루프가 끝난 뒤
      // 재검증을 거쳐 applyEmotionUpdates 로 딱 1번만 커밋한다(autoTranslateAll 의 updates Map 누적
      // → 단일 커밋과 동일한 이유 — 채워질 때마다 scenes 를 재빌드하면 리렌더/저장이 반복된다).
      const updates = new Map<string, Map<number, PendingEmotionUpdate>>();
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
            const promptCtx = {
              sceneTitle: scene.title,
              background: scene.background,
              direction: scene.direction,
              cg: scene.cg,
              synopsis,
              candidatesByKey: batch.candidatesByKey,
              expressionNotes: project.expressionNotes,
              contextLines: plan.context,
            };
            // ⚠️ 이 요청이 **실제로 무엇을 보고 답했는지**를 그대로 기억해 둔다(커밋 직전 재검증의 축 9).
            // selectEmotionsBatch 가 내부에서 부르는 것과 **같은 함수·같은 입력**이어야 의미가 있다 —
            // 비슷한 페이로드를 여기서 따로 조립하면 두 곳이 조용히 갈라진다.
            const { system, user } = buildEmotionRequest(plan.items, promptCtx);
            const requestKey = emotionRequestKey(system, user);
            try {
              const result = await selectEmotionsBatch(plan.items, promptCtx, key);
              for (const it of plan.items) {
                const expr = result[it.i];
                if (!expr) continue; // 파싱 실패/후보 밖 — resolve.ts 의 휴리스틱 폴백에 맡긴다
                let sceneUpdates = updates.get(batch.sceneId);
                if (!sceneUpdates) {
                  sceneUpdates = new Map();
                  updates.set(batch.sceneId, sceneUpdates);
                }
                sceneUpdates.set(it.i, {
                  expr,
                  speaker: it.speaker,
                  text: it.text,
                  outfit: it.outfit,
                  requestKey,
                });
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
      // ⚠️ 여기부터 setScenes 까지는 **동기 구간**이다 — await/sleep/네트워크를 넣지 말 것.
      // 검증과 쓰기가 서로 다른 시점의 project 를 보면(= 중간에 사용자 편집이 끼면) 방금 통과시킨
      // 판정이 무의미해진다. 그래서 스냅샷을 **한 번만** 잡고 그 아래에서 get() 을 다시 읽지 않는다.
      let committed = 0;
      let staleSkipped = 0;
      if (updates.size) {
        const currentProject = get().project;
        const { valid, skipped } = validateEmotionUpdates(currentProject, updates);
        staleSkipped = skipped;
        for (const m of valid.values()) committed += m.size;
        // 쓰기 base 는 **반드시 현재 scenes** 다. 실행 시작 시점 스냅샷(project.scenes)에 쓰면
        // 실행 중 사용자가 한 다른 편집(번역·보이스·상태 등)을 통째로 되감는다.
        if (valid.size) setScenes(applyEmotionUpdates(currentProject.scenes, valid)); // 단일 set + 단일 autoSave
      }
      const staleSuffix = staleSkipped
        ? ` · ${staleSkipped}건 건너뜀(분석 중 프로젝트가 변경됨)`
        : '';
      if (aborted) {
        flash(
          `AI 표정 배정 중단 — ${committed}건 채움${staleSuffix} · API 키/쿼터 오류로 중단됨(키·잔액을 확인하세요).`,
          'error',
        );
      } else {
        const msg =
          `AI 표정 배정 완료 — ${committed}건 채움${staleSuffix}` +
          (failScenes ? ` · ${failScenes}개 장면 실패(재시도 가능)` : '');
        flash(msg, failScenes || staleSkipped ? 'error' : 'success');
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
