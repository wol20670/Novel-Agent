import { mergeScenes, sameLooseText } from '../project/mergeScenes';
import { SAMPLE_STORY } from '../sample';
import {
  foldSceneSuggestions,
  mergeLineOutfit,
  validateOutfitSuggestion,
  type OutfitSuggestion,
} from '../generators/outfit';
import { analyzeQaWorkbook, QA_COLUMN_LOCALES } from '../generators/translate/qaWorkbook';
import type { Locale, Scene } from '../types';
import type { State } from './types';
import type { SliceCreator } from './context';
import { applyTranslationUpdates, localeMeta, unionChars, mergeChars, sceneById } from './helpers';

/**
 * Outfit AI 입력에 해당하는 Scene 키 — `updateScene` 은 무검증 제네릭 패처(`{...sc, ...patch}`)라
 * 전용 액션(setLineText 등)이 따로 있어도 같은 필드가 이 경로로 들어올 수 있다. 그래서 방어선을
 * 좁히지 않는다: title/background/direction = LLM 문맥, outfits = 장면 baseline, cg = CG cutoff,
 * lines = scan 입력 전체, hideSprites = hide 문맥. (bgm·*AssetId·status 는 입력이 아니라 유지.)
 * ⚠️ 판정은 **키 존재** 기준이다 — 같은 값으로 덮어써도 무효화된다(값 비교까지는 하지 않는다).
 */
const OUTFIT_AI_SCENE_KEYS: readonly (keyof Scene)[] = [
  'title',
  'background',
  'direction',
  'outfits',
  'cg',
  'lines',
  'hideSprites',
];

export const createScriptSlice: SliceCreator<
  Pick<
    State,
    | 'setRawInput'
    | 'loadSample'
    | 'applyAnalysis'
    | 'updateScene'
    | 'setLineEmotion'
    | 'clearEmotionAuto'
    | 'setLineHideSprites'
    | 'setLineText'
    | 'setLineTranslation'
    | 'applyQaWorkbook'
    | 'setLineOutfit'
    | 'invalidateOutfitSuggestions'
    | 'applyOutfitSuggestion'
    | 'ignoreOutfitSuggestion'
    | 'applySceneOutfitSuggestions'
    | 'ignoreSceneOutfitSuggestions'
    | 'setSceneStatus'
    | 'setSceneHideSprites'
    | 'approveAll'
  >
> = (set, get, ctx) => {
  const { flash, autoSave, setScenes } = ctx;

  /**
   * 줄 의상 레코드를 바꾼 scenes 배열을 만든다(슬라이스 내부 전용, 순수).
   * 레코드 머지·빈 레코드 정리 규칙은 `mergeLineOutfit`(generators/outfit) 단일 소스를 쓴다 —
   * 수동 편집(setLineOutfit)과 AI 수락(applyOutfitSuggestion)이 같은 규칙이어야 하기 때문이다.
   * **후처리(제안 목록을 어떻게 할지)만 호출측이 다르게 한다** — 범용 framework 로 만들지 않는다.
   */
  const patchLineOutfit = (
    sceneId: string,
    lineIndex: number,
    character: string,
    outfit: string | undefined,
  ): Scene[] =>
    get().project.scenes.map((sc) =>
      sc.id === sceneId ? mergeLineOutfit(sc, lineIndex, character, outfit) : sc,
    );

  /** 제안 목록에서 항목 하나만 뺀다(그 장면 키가 비면 키째 제거 — 빈 배열을 남기지 않는다). */
  const dropSuggestion = (
    all: Record<string, OutfitSuggestion[]>,
    sceneId: string,
    lineIndex: number,
    character: string,
  ): Record<string, OutfitSuggestion[]> => {
    const list = all[sceneId];
    if (!list) return all;
    const next = list.filter(
      (s) => !(s.lineIndex === lineIndex && s.character === character),
    );
    if (next.length === list.length) return all;
    const copy = { ...all };
    if (next.length) copy[sceneId] = next;
    else delete copy[sceneId];
    return copy;
  };

  return {
    setRawInput: (text) => {
      set((s) => ({ project: { ...s.project, rawInput: text } }));
    },

    loadSample: () => {
      set((s) => ({ project: { ...s.project, rawInput: SAMPLE_STORY } }));
      flash('샘플 스토리를 입력창에 불러왔습니다. "분석"을 눌러주세요.');
    },

    applyAnalysis: (parsed, mode, rawText) => {
      const { scenes: parsedScenes, characters: parsedChars, meta } = parsed;
      if (parsedScenes.length === 0) {
        flash(
          rawText !== undefined
            ? '분석할 장면이 없습니다. 형식을 확인하세요.'
            : '엑셀에서 장면을 찾지 못했습니다. A/B열 형식을 확인하세요.',
        );
        return;
      }
      const s0 = get();
      const scenes = mergeScenes(s0.project.scenes, parsedScenes, mode);
      // append 는 기존 화자가 사라지면 안 되므로 union, merge/replace 는 엑셀/텍스트가 정본(mergeChars).
      const characters =
        mode === 'append' ? unionChars(s0.project.characters, parsedChars) : mergeChars(s0.project.characters, parsedChars);
      const stillSelected = !!s0.selectedSceneId && scenes.some((sc) => sc.id === s0.selectedSceneId);
      set((s) => ({
        project: {
          ...s.project,
          ...localeMeta(meta),
          ...(rawText !== undefined ? { rawInput: rawText } : {}),
          scenes,
          characters,
        },
        selectedSceneId: stillSelected ? s0.selectedSceneId : (scenes[0]?.id ?? null),
        activeTab: 'scenes',
      }));
      // ⚠️ 이 액션은 setScenes 를 안 타므로(위 set + autoSave 직접 호출) 무효화를 여기 직접 건다.
      get().invalidateOutfitSuggestions();
      autoSave();
      const verb = mode === 'merge' ? '병합' : mode === 'append' ? '추가' : '분석';
      flash(`${scenes.length}개 장면으로 ${verb} 완료(캐릭터 ${characters.length}명).`);
    },

    updateScene: (id, patch) => {
      if (OUTFIT_AI_SCENE_KEYS.some((k) => k in patch)) get().invalidateOutfitSuggestions();
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

    // ⚠️ 사용자가 누를 때만 도는 recovery 액션이다(automatic invalidation 아님 — types.ts 계약 참고).
    // 표정은 Outfit AI 의 입력이 아니므로 invalidateOutfitSuggestions 를 **부르지 않는다**
    // (setLineEmotion 과 같은 관용구) — 그래서 검수 중인 의상 제안이 이 액션으로 날아가지 않는다.
    clearEmotionAuto: () => {
      const scenes = get().project.scenes;
      // 먼저 센다 — 0건이면 확인창도, 저장도, 상태 변경도 없다(빈 상태에서 파괴적 confirm 금지).
      let count = 0;
      for (const sc of scenes) {
        for (const l of sc.lines) if (l.kind === 'dialogue' && l.emotionAuto) count += 1;
      }
      if (!count) {
        flash('초기화할 AI 배정 표정이 없습니다.');
        return;
      }
      const ok = window.confirm(
        `AI가 자동 배정한 표정 ${count}건을 초기화합니다.\n` +
          `직접 지정한 표정은 유지됩니다. 계속할까요?`,
      );
      if (!ok) return; // 취소 — canonical·저장 모두 무변경
      setScenes(
        scenes.map((sc) => {
          if (!sc.lines.some((l) => l.kind === 'dialogue' && l.emotionAuto)) return sc; // 참조 유지
          return {
            ...sc,
            lines: sc.lines.map((l) =>
              l.kind === 'dialogue' && l.emotionAuto ? { ...l, emotionAuto: undefined } : l,
            ),
          };
        }),
      );
      flash(`AI 배정 표정 ${count}건을 초기화했습니다(직접 지정한 표정은 유지).`, 'success');
    },

    setLineHideSprites: (sceneId, lineIndex, hide) => {
      get().invalidateOutfitSuggestions(); // hide 문맥은 Outfit AI 입력이다(markers/initialHidden)
      setScenes(
        get().project.scenes.map((sc) => {
          if (sc.id !== sceneId) return sc;
          const lines = sc.lines.map((l, i) =>
            i === lineIndex && (l.kind === 'dialogue' || l.kind === 'narration') ? { ...l, hideSprites: hide } : l,
          );
          return { ...sc, lines };
        }),
      );
    },

    setLineText: (sceneId, lineIndex, text) => {
      get().invalidateOutfitSuggestions(); // 대사 텍스트는 제안의 근거이자 lineKey 지문이다
      // 번역(i18n)은 그 줄의 **현재** 원문에 대한 번역일 때만 유효하다 — 원문이 표기 이상으로 바뀌면
      // **원문을 쓰는 바로 그 state update 안에서** 함께 버린다.
      // ⚠️ 편집 종료(완료 버튼) 같은 나중 시점으로 미루면 안 된다: 이 액션은 키 입력마다 project 를
      // 갱신하고 autoSave(→ localStorage · 협업 push)까지 태워서, 그 사이 "새 원문 + 옛 번역" 상태가
      // 저장·전송·내보내기를 그대로 통과한다(바뀐 KO 원문이 옛 번역과 짝지어져 tl/<lang>/script.rpy 로 나간다).
      // 판정은 재분석 병합과 **같은 동치 관계**(sameLooseText) — 문장부호·공백만 고친 편집은 안 지운다.
      let dropped = false;
      setScenes(
        get().project.scenes.map((sc) => {
          if (sc.id !== sceneId) return sc;
          const lines = sc.lines.map((l, i) => {
            if (i !== lineIndex) return l;
            const hasI18n =
              (l.kind === 'dialogue' || l.kind === 'narration') && !!l.i18n && Object.keys(l.i18n).length > 0;
            if (!hasI18n || sameLooseText(l.text, text)) return { ...l, text };
            dropped = true;
            // 표정(emotionAuto)·보이스(voiceAssetIds)·의상은 별개 축이라 건드리지 않는다.
            return { ...l, text, i18n: undefined };
          });
          return { ...sc, lines };
        }),
      );
      // 실제로 지웠을 때만 알린다 — 지운 뒤엔 i18n 이 없어 이어지는 키 입력에서 재발화하지 않는다.
      if (dropped) {
        flash('원문이 바뀌어 이 줄의 번역을 지웠습니다 — 🌐 누락 번역 채우기로 다시 채울 수 있습니다.');
      }
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
            if (i !== lineIndex || l.kind === 'item' || l.kind === 'cg' || l.kind === 'bgm') return l; // 아이템·CG·BGM 라인은 번역 없음
            const i18n = { ...(l.i18n ?? {}) };
            if (hasContent) i18n[locale] = text;
            else delete i18n[locale];
            return { ...l, i18n: Object.keys(i18n).length ? i18n : undefined };
          });
          return { ...sc, lines };
        }),
      );
    },

    /**
     * QA 검수 Excel(외부에서 고친 번역)을 canonical 에 반영한다 — post-v1 번역 Phase 4-B.
     *
     * ⚠️ **커밋 시점의 현재 project 가 authority 다.** 화면이 confirm 전에 계산한 preview 분석을
     * 넘겨받아 그대로 쓰지 않고 여기서 **다시 분석한다** — 파일을 읽고 사용자가 확인창을 누르는
     * 사이에 대본·번역이 바뀌었을 수 있고, 그러면 그 칸만 stale 로 빠져야 한다(Phase 2·Phase 8 과
     * 같은 규율). analyzeQaWorkbook 은 순수·결정론이라 같은 입력이면 같은 답을 낸다.
     * ⚠️ 분석 ~ setScenes 사이에 **await/Promise/타이머를 넣지 말 것**(검증과 쓰기가 서로 다른
     * 시점의 project 를 보면 방금 통과시킨 판정이 무의미해진다).
     *
     * 쓰기는 **단일 커밋**이다 — 칸마다 setLineTranslation 을 부르면 칸 수에 비례해 리렌더·저장이
     * 반복된다(autoTranslateAll 이 같은 이유로 updates Map → 1회 커밋을 쓴다).
     * ⚠️ translationQa 캐시는 **건드리지 않는다**: 고친 칸은 target 이 바뀌어 anchor 가 어긋나므로
     * activeQaIssues 에서 저절로 빠지고, 안 고친 칸의 경고는 그대로 남아야 한다.
     * ⚠️ 번역은 Outfit AI 의 입력이 아니므로 invalidateOutfitSuggestions 를 부르지 않는다
     * (setLineTranslation 과 같은 관용구).
     */
    applyQaWorkbook: (doc) => {
      const project = get().project;
      const analysis = analyzeQaWorkbook(doc, project);
      const { candidates, counts } = analysis;

      if (candidates.length) {
        // 같은 줄의 EN·JA 는 한 레코드로 합친다(줄 단위로 한 번만 쓰기 위해).
        const updates = new Map<string, Map<number, Partial<Record<Locale, string>>>>();
        for (const c of candidates) {
          let lineMap = updates.get(c.sceneId);
          if (!lineMap) {
            lineMap = new Map();
            updates.set(c.sceneId, lineMap);
          }
          // 값은 analyzer 가 돌려준 **raw 문자열 그대로** — 여기서 trim·정규화하지 않는다.
          lineMap.set(c.lineIndex, { ...lineMap.get(c.lineIndex), [c.locale]: c.text });
        }
        // 유효성(장면·줄·화자·원문·번역 anchor)은 analyzer 가 이미 끝냈다 — 여기서 다시 판정하지
        // 않는다(판정이 두 벌이 되는 순간 resolveEmotion 류의 어긋남이 생긴다).
        setScenes(applyTranslationUpdates(project.scenes, updates));
      }

      // 집계 단위가 섞이지 않게 알린다 — 칸(번역 하나)과 행(엑셀 한 줄)은 다른 단위다.
      const skippedCells = counts.stale + counts.blank + counts.invalidCell;
      const skippedRows = counts.badMeta + counts.duplicate + counts.rowMismatch;
      if (!candidates.length) {
        flash(
          `적용할 수정이 없습니다 — 바뀐 칸이 없거나(${counts.unchanged}칸) 대본이 그 사이 변경됐습니다.`,
        );
      } else {
        const perLocale = QA_COLUMN_LOCALES.filter((l) => analysis.byLocale[l])
          .map((l) => `${l.toUpperCase()} ${analysis.byLocale[l]}칸`)
          .join(' · ');
        flash(
          `QA 수정 반영 완료 — ${perLocale}` +
            (skippedCells ? ` · ${skippedCells}칸 건너뜀(대본 변경·빈칸·형식 오류)` : '') +
            (skippedRows ? ` · ${skippedRows}행 건너뜀(정보 손상·중복·원문 불일치)` : '') +
            (counts.ignoredEdits ? ` · 검수 대상이 아닌 수정 ${counts.ignoredEdits}칸은 무시했습니다` : ''),
          skippedCells || skippedRows ? 'error' : 'success',
        );
      }
      // 확인창을 띄운 화면이 **커밋 시점 실제 결과**를 그대로 쓸 수 있게 돌려준다(새 전역 상태를
      // 만들지 않는다 — findOrphanAssets 가 목록을 돌려주는 것과 같은 등급).
      return analysis;
    },

    // ── Outfit AI: 수동 편집 · 제안 적용/무시 ────────────────────────────────
    // invalidate 와 apply 를 절대 섞지 않는다 — apply 가 전체 clear 를 하면 한 건 수락에 검수 목록이
    // 통째로 날아가 P3(제안→검수→수락) UX 가 무너진다.

    setLineOutfit: (sceneId, lineIndex, character, outfit) => {
      // 수동 편집은 canonical 을 바꾸므로 기존 제안의 전제(그 줄의 현재 의상)가 통째로 흔들린다 → 전체 clear.
      get().invalidateOutfitSuggestions();
      setScenes(patchLineOutfit(sceneId, lineIndex, character, outfit));
    },

    invalidateOutfitSuggestions: () => {
      // 검수 목록이 실제로 있었을 때만 1회 알린다 — 유료로 받은 제안이 조용히 사라지면 사용자는
      // 스크롤하다 뒤늦게 알게 되고 복구 수단이 재실행(재과금)뿐이다. 이미 비어 있으면 완전 침묵
      // (hydrate·원격 반영 등 목록이 없는 경로에서 토스트가 튀지 않는다).
      // ⚠️ best-effort 다: importProject/resetAll 처럼 뒤이어 다른 flash 가 나는 경로에선 덮인다.
      const pending = Object.values(get().outfitSuggestions).reduce((n, list) => n + list.length, 0);
      if (pending) {
        flash(`대본·설정이 바뀌어 의상 제안 ${pending}건을 취소했습니다(다시 실행해야 합니다).`);
      }
      set((s) => ({
        outfitSuggestions: {},
        // epoch↑ — 실행 중인 배치가 이 변경 뒤에 결과를 커밋하지 못하게 한다(provenance 가 아니다).
        outfitSuggestionRevision: s.outfitSuggestionRevision + 1,
      }));
    },

    applyOutfitSuggestion: (sceneId, lineIndex, character) => {
      const s0 = get();
      const target = s0.outfitSuggestions[sceneId]?.find(
        (x) => x.lineIndex === lineIndex && x.character === character,
      );
      if (!target) return;

      const scene = sceneById(s0.project.scenes, sceneId);
      const verdict = validateOutfitSuggestion(s0.project, scene, target);
      if (verdict !== 'ok') {
        // 적용 불가/no-op 이어도 **목록에서는 뺀다** — 안 그러면 영원히 실패하는 칩이 남는다.
        // canonical 을 안 건드렸으므로 revision 도 올리지 않는다.
        set((s) => ({
          outfitSuggestions: dropSuggestion(s.outfitSuggestions, sceneId, lineIndex, character),
        }));
        flash(
          verdict === 'noop'
            ? '이미 그 의상입니다(제안을 목록에서 제거했습니다).'
            : '대본·캐릭터·의상 상태가 바뀌어 적용할 수 없습니다(제안을 목록에서 제거했습니다).',
        );
        return;
      }

      set((s) => ({
        // 그 항목만 제거하고 나머지 제안은 유지한다.
        outfitSuggestions: dropSuggestion(s.outfitSuggestions, sceneId, lineIndex, character),
        // canonical 이 실제로 바뀌었으니 실행 중인 old run 은 폐기돼야 한다.
        outfitSuggestionRevision: s.outfitSuggestionRevision + 1,
      }));
      setScenes(patchLineOutfit(sceneId, lineIndex, character, target.outfit));
      // ⚠️ "유지됩니다"가 아니라 "다시 계산되지 않습니다" — 둘은 다른 뜻이다. 의상이 바뀌면 표정
      // 후보도 바뀌지만 이미 배정된 줄은 재실행해도 스킵되므로, 필요하면 AI 표정 초기화가 필요하다.
      flash(
        `${character} → ${target.outfit} 적용했습니다(이미 배정된 표정은 다시 계산되지 않습니다).`,
        'success',
      );
    },

    ignoreOutfitSuggestion: (sceneId, lineIndex, character) => {
      // 목록에서만 제거 — canonical 무변경이라 revision 도 올리지 않는다(실행 중인 run 을 죽일 이유가 없다).
      set((s) => ({
        outfitSuggestions: dropSuggestion(s.outfitSuggestions, sceneId, lineIndex, character),
      }));
    },

    applySceneOutfitSuggestions: (sceneId) => {
      const s0 = get();
      const list = s0.outfitSuggestions[sceneId];
      if (!list?.length) return;
      const scene = sceneById(s0.project.scenes, sceneId);
      if (!scene) {
        set((s) => {
          const copy = { ...s.outfitSuggestions };
          delete copy[sceneId];
          return { outfitSuggestions: copy };
        });
        return;
      }

      // ⚠️ 각각 독립 적용하면 틀린다 — 의상은 carry 라 앞의 적용이 뒤 제안을 no-op 으로 만든다.
      // foldSceneSuggestions 가 갱신된 working scene 기준으로 순차 재검증한다(순수 함수).
      const { scene: next, applied, skipped } = foldSceneSuggestions(s0.project, scene, list);

      set((s) => {
        const copy = { ...s.outfitSuggestions };
        delete copy[sceneId]; // 처리분(적용+스킵) 전부 목록에서 제거
        return {
          outfitSuggestions: copy,
          // 실제 canonical write 가 있을 때만 epoch↑ — 전부 스킵됐으면 아무것도 안 바뀐 것이다.
          outfitSuggestionRevision: applied
            ? s.outfitSuggestionRevision + 1
            : s.outfitSuggestionRevision,
        };
      });
      // 단일 커밋 — 항목마다 setScenes 를 부르면 장면 수에 비례해 리렌더/저장이 반복된다.
      if (applied) setScenes(s0.project.scenes.map((sc) => (sc.id === sceneId ? next : sc)));

      const suffix = skipped ? ` · ${skipped}건 건너뜀(이미 반영/대본 변경)` : '';
      flash(
        applied
          ? `의상 제안 ${applied}건 적용${suffix}(이미 배정된 표정은 다시 계산되지 않습니다).`
          : `적용할 제안이 없습니다${suffix}.`,
        applied ? 'success' : 'info',
      );
    },

    ignoreSceneOutfitSuggestions: (sceneId) => {
      set((s) => {
        if (!s.outfitSuggestions[sceneId]) return {};
        const copy = { ...s.outfitSuggestions };
        delete copy[sceneId];
        return { outfitSuggestions: copy };
      });
    },

    setSceneStatus: (id, status) => {
      setScenes(get().project.scenes.map((sc) => (sc.id === id ? { ...sc, status } : sc)));
    },

    setSceneHideSprites: (sceneId, hide) => {
      get().invalidateOutfitSuggestions(); // 장면 시작 hide 상태 = initialHidden 의 입력
      setScenes(get().project.scenes.map((sc) => (sc.id === sceneId ? { ...sc, hideSprites: hide } : sc)));
    },

    approveAll: () => {
      setScenes(get().project.scenes.map((sc) => ({ ...sc, status: 'approved' as const })));
      flash('모든 장면을 승인했습니다.');
    },
  };
};
