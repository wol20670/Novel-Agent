import { useMemo } from 'react';
import { useStore, type Tab } from '../store';
import { translateModeOf, translateTargetsOf } from '../types';
import { summarizeUntranslated } from '../generators/translate/collect';
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

  const approved = scenes.filter((s) => s.status === 'approved').length;
  const allApproved = scenes.length > 0 && approved === scenes.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 h-12 border-b border-edge bg-panel/40 backdrop-blur-sm sticky top-0 z-10">
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
          <div className="ml-auto flex items-center gap-2">
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
                <button className="btn-soft" onClick={autoTranslate} disabled={translating} title={TRANSLATE_HINT}>
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
              </>
            )}
            <button
              className={allApproved ? 'btn-ghost' : 'btn-soft'}
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
