import { useStore } from '../store';

const STEPS = ['스토리 입력', '장면 분석', '에셋 생성', '검토·승인', 'ZIP 출력'];

export default function Stepper() {
  // 전체 project/assets 객체 대신 실제로 쓰는 파생 boolean 만 구독 — 둘 다 원시값(boolean)이라
  // 값 비교로 안전하고, project/assets 안의 무관한 변경(대사 편집 등)마다 리렌더되지 않는다.
  const hasInput = useStore((s) => s.project.rawInput.trim().length > 0 || s.project.scenes.length > 0);
  const analyzed = useStore((s) => s.project.scenes.length > 0);
  const hasAsset = useStore((s) => Object.keys(s.assets).length > 0);
  const approved = useStore(
    (s) => s.project.scenes.length > 0 && s.project.scenes.every((sc) => sc.status === 'approved'),
  );

  const done = [hasInput, analyzed, hasAsset, approved, false];
  // 현재 활성 = 완료되지 않은 첫 단계
  const current = done.findIndex((d) => !d);

  return (
    <div className="flex items-center gap-1 px-4 h-12 border-b border-edge bg-panel/60 backdrop-blur-sm overflow-x-auto">
      {STEPS.map((label, i) => {
        const isDone = done[i];
        const isActive = i === current;
        return (
          <div key={label} className="flex items-center gap-1 shrink-0">
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors ${
                isActive ? 'bg-accent2/20' : ''
              }`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold transition-colors ${
                  isDone
                    ? 'bg-accent text-ink'
                    : isActive
                      ? 'bg-accent2 text-white ring-2 ring-accent/40'
                      : 'bg-panel2 text-gray-500 border border-edge'
                }`}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isDone ? 'text-gray-300' : isActive ? 'text-accent' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`w-5 h-px ${done[i] ? 'bg-accent/50' : 'bg-edge'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
