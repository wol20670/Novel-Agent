import { useMemo } from 'react';
import { useStore, type Tab } from '../store';
import { baseLocaleOf, translateModeOf, translateModelFor, translateTargetsOf } from '../types';
import { summarizeUntranslated } from '../generators/translate/collect';
import { activeQaIssues } from '../generators/translate/qa';
import { estimateQaCost } from '../generators/translate/qaEstimate';
import { jumpToScene, nextFlaggedSceneId } from './sceneJump';
import SceneCard from './SceneCard';
import AssetsTab from './AssetsTab';
import RenpyTab from './RenpyTab';
import Spinner from './Spinner';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'scenes', label: '장면', icon: '🎬' },
  { key: 'assets', label: '에셋', icon: '🎨' },
  { key: 'renpy', label: "Ren'Py", icon: '📦' },
];

/**
 * 번역 버튼·카운트 공용 설명. 예전 이름("전체 자동 번역")이 "수천 개 기존 번역까지 다시 API 로 보낸다"는
 * 오해를 만들어 실행 자체를 못 하게 했다 — 실제 동작(빈 칸만)과 숫자의 의미를 여기서 못박는다.
 * ⚠️ "미리보기에서 검수" 같은 문장을 되살리지 말 것 — 장면 미리보기(ScenePlayer)는 번역을 표시조차
 * 하지 않는다(번역 수정은 장면 카드의 줄 편집 모드).
 */
const TRANSLATE_HINT =
  '기존 번역은 그대로 두고 빈 번역만 채웁니다.\n' +
  'EN·JA = 각 언어의 누락 번역 수 · 대상 = 하나 이상의 번역이 비어 있는 대사·지문 수.';

/**
 * QA 는 "빈 칸 채우기"(🌐)와 반대로 **이미 채워진 번역**을 본다. 두 버튼의 차이를 여기서 못박는다 —
 * 이름만 보면 둘 다 "번역 뭔가 하는 버튼"이라 헷갈린다.
 * ⚠️ "틀린 번역"이 아니라 "의심 번역"이다(자동 수정은 하지 않는다).
 */
const QA_HINT =
  '이미 채워진 번역 중 다시 볼 만한 칸을 찾습니다(자동으로 고치지 않습니다).\n' +
  '이미 검수한 칸은 건너뜁니다 — 번역이나 원문이 바뀐 칸만 다시 봅니다.';
const QA_RECHECK_HINT =
  '검수 기록("문제 없음" 포함)을 모두 지우고 처음부터 다시 검수합니다.\n' +
  '텍스트가 그대로인 칸도 전부 다시 보므로 비용이 더 듭니다.';

export default function CenterPanel() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const scenes = useStore((s) => s.project.scenes);
  const approveAll = useStore((s) => s.approveAll);
  const translateMode = useStore((s) => translateModeOf(s.project));
  const baseLocale = useStore((s) => s.project.baseLocale);
  const autoTranslate = useStore((s) => s.autoTranslateAll);
  const translating = useStore((s) => !!s.busy['batch:translate']);
  const translateProgress = useStore((s) => s.translateProgress);

  // 번역 누락 요약 — 3000줄 대본에서 "어디가 비었는지" 직접 훑지 않아도 총량을 알 수 있게.
  // ⚠️ 셀렉터 안에서 계산하면 안 된다: zustand 셀렉터는 렌더 여부와 무관하게 **모든 set() 마다**
  // 재실행돼 키 입력마다 전 대본을 훑는다. useMemo 로만 돌리고, 번역 모드가 꺼져 있으면 아예 계산하지 않는다.
  const translateTargets = useMemo(() => translateTargetsOf({ baseLocale }), [baseLocale]);
  const missing = useMemo(
    () => (translateMode === 'off' ? null : summarizeUntranslated({ scenes }, translateTargets)),
    [translateMode, scenes, translateTargets],
  );

  // ── 번역 QA ────────────────────────────────────────────────────────────────
  const translationQa = useStore((s) => s.translationQa);
  const reviewQa = useStore((s) => s.reviewTranslationsAll);
  const clearQa = useStore((s) => s.clearTranslationQa);
  const qaBusy = useStore((s) => !!s.busy['batch:translate-qa']);
  const qaProgress = useStore((s) => s.translationQaProgress);
  // 이동 기준점 — 기존 selection state 를 그대로 쓴다(새 QA cursor state 를 만들지 않는다).
  const selectedSceneId = useStore((s) => s.selectedSceneId);

  // 유효한 의심 건수 + 그 의심이 있는 장면 — 저장하지 않고 매번 현재 project 기준으로 파생한다
  // (번역을 고치면 자동으로 빠진다). 판정은 activeQaIssues 하나만 쓴다(필터를 복제하지 않는다).
  // ⚠️ 셀렉터 안에서 계산하면 안 된다: zustand 셀렉터는 렌더 여부와 무관하게 **모든 set() 마다**
  // 재실행돼 키 입력마다 전 대본을 훑는다(missing 카운트와 같은 이유).
  const qa = useMemo(() => {
    const flagged = new Set<string>();
    if (translateMode === 'off') return { count: 0, flagged };
    const base = baseLocaleOf({ baseLocale });
    const byId = new Map(scenes.map((s) => [s.id, s]));
    let count = 0;
    for (const [sceneId, results] of Object.entries(translationQa)) {
      const n = activeQaIssues(results, byId.get(sceneId), base).length;
      if (!n) continue;
      count += n;
      flagged.add(sceneId);
    }
    return { count, flagged };
  }, [translateMode, translationQa, scenes, baseLocale]);
  // 지울 기록이 있을 때만 "전체 재검수"를 보여준다 — 캐시가 비어 있으면 일반 QA 가 곧 전체 검수다.
  const hasQaCache = useMemo(() => Object.values(translationQa).some((l) => l.length > 0), [translationQa]);

  /**
   * full=false 는 증분(캐시 재사용), full=true 는 전체 재검수다.
   * ⚠️ **파괴적인 clear 는 confirm 이후에만** 한다 — 먼저 지우면 사용자가 취소했는데도 기존 검수
   * 기록("문제 없음" 포함)이 사라진다. 전체 재검수의 견적도 **빈 캐시를 가정**해야 실제 실행과 맞는다.
   * ⚠️ 여기서 대상 수집·규칙 판정·요청 grouping 을 다시 계산하지 않는다(estimateQaCost 가 실행과
   * 같은 collectQaTargets/planQaRequests 를 쓴다 — planner parity).
   * ⚠️ OpenAI 키 유무로 실행을 막지 않는다 — 규칙 검사는 키 없이도 결과를 내고, AI 만 생략하는
   * 판단은 store 가 소유한다.
   */
  const runQa = (full: boolean) => {
    const model = translateModelFor(translateMode);
    if (!model) return;
    const est = estimateQaCost({ scenes, baseLocale }, translateTargets, full ? {} : translationQa, model);
    // 검수할 칸이 없으면 확인창도 clear 도 하지 않는다 — 안내는 store 의 기존 flash 가 담당한다.
    if (!est.cells) {
      void reviewQa();
      return;
    }
    const cost =
      est.usd !== undefined
        ? `예상 비용: 약 $${est.usd.toFixed(4)}`
        : `예상 토큰: 입력 약 ${est.inputTokens} · 출력 약 ${est.outputTokens}\n` +
          `(이 모델의 단가가 앱에 없어 비용 표시는 생략합니다)`;
    const ok = window.confirm(
      (full ? '기존 검수 기록("문제 없음" 포함)을 모두 지우고 처음부터 다시 검수합니다.\n\n' : '') +
        `번역 QA를 실행합니다.\n` +
        `검수 대상: ${est.cells}칸\n` +
        `로컬 규칙 검사: ${est.ruleFlagged}칸(API 호출 없음)\n` +
        `AI 의미 검수: ${est.aiCells}칸 · 예상 요청 ${est.requests}회\n` +
        `모델: ${est.model}\n` +
        `${cost}(실제 과금은 OpenAI 대시보드가 정본)\n` +
        `번역을 자동으로 고치지 않고, 다시 볼 만한 칸만 표시합니다.\n` +
        `계속할까요?`,
    );
    if (!ok) return;
    if (full) clearQa();
    void reviewQa();
  };

  const approved = scenes.filter((s) => s.status === 'approved').length;
  const allApproved = scenes.length > 0 && approved === scenes.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 min-h-12 border-b border-edge bg-panel/40 backdrop-blur-sm sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            // shrink-0: 오른쪽 그룹(누락 카운트까지 들어와 넓어졌다)이 좁은 창에서 탭을 밀어 라벨이
            // "장 면"처럼 두 줄로 접히던 걸 막는다(1280px 실측).
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === t.key
                ? 'bg-accent2 text-white shadow-sm'
                : 'text-gray-400 hover:bg-panel2 hover:text-gray-200'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
        {activeTab === 'scenes' && scenes.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {translateMode !== 'off' && (
              <>
                {/* 실행 중에는 숨긴다 — 커밋이 배치 끝 1회라 이 숫자는 시작 시점 값에서 멈춰 있고,
                    진행 상황은 버튼이 done/total 로 이미 보여준다(새 진행률 표시를 만들지 않는다). */}
                {!translating && missing && (
                  <span className="text-[10px] text-gray-500 whitespace-nowrap" title={TRANSLATE_HINT}>
                    {missing.lines
                      ? `${translateTargets
                          .map((l) => `${l.toUpperCase()} ${missing.byLocale[l] ?? 0}`)
                          .join(' · ')} · 대상 ${missing.lines}줄`
                      : '번역 빈 칸 없음'}
                  </span>
                )}
                <button
                  className="btn-soft shrink-0 whitespace-nowrap"
                  onClick={autoTranslate}
                  disabled={translating}
                  title={TRANSLATE_HINT}
                >
                  {translating ? (
                    translateProgress ? (
                      <span className="flex items-center gap-1.5">
                        <Spinner />
                        {`${translateProgress.done}/${translateProgress.total} 장면 번역 중…`}
                      </span>
                    ) : (
                      <Spinner />
                    )
                  ) : (
                    '🌐 누락 번역 채우기'
                  )}
                </button>
                {/* 유효한 의심만 센다 — 실행 중에는 커밋이 배치 끝 1회라 숫자가 멈춰 있어 숨긴다.
                    카드가 content-visibility 로 화면 밖에서는 렌더조차 안 되므로(실측), 숫자만으로는
                    "어느 장면인지"를 못 찾는다 — 눌러서 다음 대상 장면으로 이동한다. */}
                {!qaBusy && qa.count > 0 && (
                  <button
                    className="text-[10px] whitespace-nowrap shrink-0 rounded px-1.5 py-0.5 border border-amber-500/40 text-amber-600 bg-amber-500/5 hover:bg-amber-500/15"
                    onClick={() =>
                      jumpToScene(
                        nextFlaggedSceneId(scenes.map((s) => s.id), qa.flagged, selectedSceneId) ?? '',
                      )
                    }
                    title="누를 때마다 의심 번역이 있는 다음 장면으로 이동합니다(해당 EN·JA 칸에 이유가 표시됩니다)."
                  >
                    ⚠ 의심 {qa.count}건
                  </button>
                )}
                {/* ⚠️ disabled 는 단순 UX 가 아니라 store concurrency 경계다 — 스토어엔 동시 실행·
                    실행 중 clear 를 막는 revision/run-token 방어가 없다(의도적). */}
                <button
                  className="btn-soft shrink-0 whitespace-nowrap"
                  onClick={() => runQa(false)}
                  disabled={qaBusy}
                  title={QA_HINT}
                >
                  {qaBusy ? (
                    qaProgress ? (
                      <span className="flex items-center gap-1.5">
                        <Spinner />
                        {/* 단위는 장면이 아니라 **AI 요청**이다(요청 = 장면 × 대상 로케일). */}
                        {`번역 QA ${qaProgress.done}/${qaProgress.total} 진행 중…`}
                      </span>
                    ) : (
                      <Spinner />
                    )
                  ) : (
                    '🔍 번역 QA'
                  )}
                </button>
                {hasQaCache && (
                  <button
                    className="btn-ghost shrink-0 whitespace-nowrap"
                    onClick={() => runQa(true)}
                    disabled={qaBusy}
                    title={QA_RECHECK_HINT}
                  >
                    ↺ 전체 재검수
                  </button>
                )}
              </>
            )}
            <button
              className={`shrink-0 whitespace-nowrap ${allApproved ? 'btn-ghost' : 'btn-soft'}`}
              onClick={approveAll}
              disabled={allApproved}
            >
              {allApproved ? '✓ 전체 승인됨' : '전체 승인'}
            </button>
          </div>
        )}
      </div>

      <div className="p-5">
        {activeTab === 'scenes' &&
          (scenes.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-col gap-4 max-w-3xl mx-auto">
              {scenes.map((s, i) => (
                // scene-card-slot(content-visibility: auto) 로 화면 밖 카드는 렌더를 건너뛴다(index.css).
                // id·scroll-mt-4 앵커는 이 래퍼가 아니라 SceneCard 내부 카드 자체에 있어 그대로 동작.
                <div key={s.id} className="scene-card-slot">
                  <SceneCard sceneId={s.id} index={i} />
                </div>
              ))}
            </div>
          ))}
        {activeTab === 'assets' && <AssetsTab />}
        {activeTab === 'renpy' && <RenpyTab />}
      </div>
    </div>
  );
}

function Empty() {
  const loadSample = useStore((s) => s.loadSample);
  return (
    <div className="text-center text-gray-500 mt-24 max-w-md mx-auto">
      <div className="text-6xl mb-4 opacity-60">🎬</div>
      <p className="text-lg mb-2 text-gray-300">아직 분석된 장면이 없습니다</p>
      <p className="text-sm mb-6 leading-relaxed">
        왼쪽 패널에서 스토리를 입력하고 <b className="text-accent">분석</b>을 누르거나,
        <br />
        아래 버튼으로 예제를 먼저 둘러보세요.
      </p>
      <button className="btn-primary" onClick={loadSample}>
        ✨ 샘플 스토리 불러오기
      </button>
    </div>
  );
}
