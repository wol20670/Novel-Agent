import { useEffect } from 'react';
import { useStore } from './store';
import LeftPanel from './components/LeftPanel';
import CenterPanel from './components/CenterPanel';
import RightPanel from './components/RightPanel';
import Stepper from './components/Stepper';
import CollabBadge from './components/CollabBadge';
import StartGate from './components/StartGate';
import PasswordSetup from './components/PasswordSetup';

const TOAST_STYLE: Record<string, string> = {
  info: 'bg-accent2 text-white',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
};
const TOAST_ICON: Record<string, string> = { info: 'ℹ', success: '✓', error: '⚠' };

export default function App() {
  const hydrate = useStore((s) => s.hydrate);
  const bootAuth = useStore((s) => s.bootAuth);
  const authPhase = useStore((s) => s.authPhase);
  const toast = useStore((s) => s.toast);
  const toastType = useStore((s) => s.toastType);
  // 전체 project 객체 대신 실제로 쓰는 파생값(개수)만 구독 — project 안의 무관한 필드(제목·장면
  // 본문 등)가 바뀔 때마다 헤더가 통째로 리렌더되는 것을 막는다. 둘 다 원시값(number)이라
  // useShallow 없이도 참조가 아닌 값 비교로 안전.
  const scenesCount = useStore((s) => s.project.scenes.length);
  const approved = useStore((s) => s.project.scenes.filter((sc) => sc.status === 'approved').length);
  const openaiKey = useStore((s) => s.openaiKey);

  // ⚠️ 로컬 프로젝트 hydrate 는 **인증 상태와 무관하게 항상** 수행한다 — 오프라인 제작 툴이므로
  //    로그인 확인 때문에 내 대본 복원이 막히면 안 된다. bootAuth 는 그와 독립적으로 부팅 라우팅만
  //    결정하고(동시 호출은 in-flight dedupe 로 1회), StrictMode 의 이중 실행에도 안전하다.
  useEffect(() => {
    hydrate();
    void bootAuth();
  }, [hydrate, bootAuth]);

  if (authPhase === 'booting') {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500">불러오는 중…</div>
    );
  }
  // auth-unavailable(콜백을 처리할 수 없음)도 StartGate 가 사유를 표시하고 로컬 전용 선택지를 준다.
  if (authPhase === 'login' || authPhase === 'auth-unavailable') return <StartGate />;
  if (authPhase === 'password-setup') return <PasswordSetup />;

  // 'local-only' | 'authed' — 에디터는 두 경우 모두 동일하다(협업 UI 만 좌패널에서 갈린다).
  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-edge bg-panel shrink-0">
        <span className="text-xl">🎬</span>
        <span className="text-accent font-bold text-lg tracking-tight">Novel-Agent</span>
        <span className="text-xs text-gray-500 hidden md:inline">Ren'Py 비주얼노벨 제작 보조</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span
            className={`chip ${
              openaiKey ? 'border-emerald-500/50 text-emerald-600' : 'border-edge text-gray-400'
            }`}
          >
            {openaiKey ? '● AI 텍스트 기능 켜짐' : '○ OpenAI 키 없음'}
          </span>
          <CollabBadge />
          <span className="text-gray-400">
            장면 <b className="text-gray-200">{scenesCount}</b> · 승인{' '}
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
