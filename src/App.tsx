import { useEffect } from 'react';
import { useStore } from './store';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
import RightPanel from './components/RightPanel';
import Stepper from './components/Stepper';

const TOAST_STYLE: Record<string, string> = {
  info: 'bg-accent2 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
};
const TOAST_ICON: Record<string, string> = { info: 'ℹ', success: '✓', error: '⚠' };

export default function App() {
  const hydrate = useStore((s) => s.hydrate);
  const toast = useStore((s) => s.toast);
  const toastType = useStore((s) => s.toastType);
  const project = useStore((s) => s.project);
  const apiKey = useStore((s) => s.apiKey);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const approved = project.scenes.filter((s) => s.status === 'approved').length;

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-edge bg-panel shrink-0">
        <span className="text-xl">🎬</span>
        <span className="text-accent font-bold text-lg tracking-tight">Novel-Agent</span>
        <span className="text-xs text-gray-500 hidden md:inline">Ren'Py 비주얼노벨 제작 보조</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span
            className={`chip ${
              apiKey ? 'border-emerald-500/50 text-emerald-600' : 'border-edge text-gray-400'
            }`}
          >
            {apiKey ? '● OpenAI 모드' : '○ 오프라인 모드'}
          </span>
          <span className="text-gray-400">
            장면 <b className="text-gray-200">{project.scenes.length}</b> · 승인{' '}
            <b className="text-emerald-600">{approved}</b>
          </span>
        </div>
      </header>

      <Stepper />

      <div className="flex flex-1 min-h-0">
        <aside className="w-[340px] shrink-0 border-r border-edge bg-panel/60 overflow-y-auto">
          <LeftPanel />
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <CenterPanel />
        </main>
        <aside className="w-[320px] shrink-0 border-l border-edge bg-panel/60 overflow-y-auto">
          <RightPanel />
        </aside>
      </div>

      {toast && (
        <div
          className={`toast-in fixed bottom-5 left-1/2 -translate-x-1/2 text-sm px-4 py-2.5 rounded-xl shadow-2xl z-50 flex items-center gap-2 max-w-[90vw] ${
            TOAST_STYLE[toastType] ?? TOAST_STYLE.info
          }`}
        >
          <span className="font-bold">{TOAST_ICON[toastType] ?? TOAST_ICON.info}</span>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
