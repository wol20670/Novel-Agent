import { useStore, type Tab } from '../store';
import { translateModeOf } from '../types';
import SceneCard from './SceneCard';
import AssetsTab from './AssetsTab';
import RenpyTab from './RenpyTab';
import Spinner from './Spinner';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'scenes', label: '장면', icon: '🎬' },
  { key: 'assets', label: '에셋', icon: '🎨' },
  { key: 'renpy', label: "Ren'Py", icon: '📦' },
];

export default function CenterPanel() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const scenes = useStore((s) => s.project.scenes);
  const approveAll = useStore((s) => s.approveAll);
  const genAllBg = useStore((s) => s.generateAllBackgrounds);
  const genAllBgm = useStore((s) => s.generateAllBgm);
  const batchBusy = useStore((s) => !!(s.busy['batch:bg'] || s.busy['batch:bgm']));
  const translateMode = useStore((s) => translateModeOf(s.project));
  const autoTranslate = useStore((s) => s.autoTranslateAll);
  const translating = useStore((s) => !!s.busy['batch:translate']);

  const approved = scenes.filter((s) => s.status === 'approved').length;
  const allApproved = scenes.length > 0 && approved === scenes.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 h-12 border-b border-edge bg-panel/40 backdrop-blur-sm sticky top-0 z-10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
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
            <button
              className="btn-soft"
              onClick={async () => {
                await genAllBg();
                await genAllBgm();
              }}
              disabled={batchBusy}
              title="장면들의 배경·BGM 을 고유 이름마다 한 번씩 일괄 생성"
            >
              {batchBusy ? <Spinner /> : '🎨 배경·음악 일괄 생성'}
            </button>
            {translateMode !== 'off' && (
              <button
                className="btn-soft"
                onClick={autoTranslate}
                disabled={translating}
                title="번역이 빈 대사·지문을 영어·일본어로 자동 번역(빈 칸만). 이후 미리보기에서 검수/수정하세요."
              >
                {translating ? <Spinner /> : '🌐 전체 자동 번역'}
              </button>
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
                <SceneCard key={s.id} sceneId={s.id} index={i} />
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
