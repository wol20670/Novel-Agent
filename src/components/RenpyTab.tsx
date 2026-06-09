import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { generateRenpyFiles } from '../renpy/generate';
import { buildRenpyZip, downloadBlob } from '../zip/buildZip';
import Spinner from './Spinner';

export default function RenpyTab() {
  const project = useStore((s) => s.project);
  const setToast = useStore((s) => s.setToast);
  const [active, setActive] = useState(0);
  const [building, setBuilding] = useState(false);

  const approvedCount = project.scenes.filter((s) => s.status === 'approved').length;

  const files = useMemo(() => {
    try {
      return generateRenpyFiles(project).files;
    } catch (e) {
      return [{ path: 'error', content: String(e) }];
    }
  }, [project]);

  const onZip = async () => {
    if (approvedCount === 0) {
      setToast('승인된 장면이 없습니다. 장면 탭에서 먼저 승인하세요.');
      return;
    }
    setBuilding(true);
    setToast('ZIP 생성 중… (에셋 폴백 생성 포함, 잠시 걸릴 수 있어요)');
    try {
      const { blob, filename, placeholders } = await buildRenpyZip(project);
      downloadBlob(blob, filename);
      setToast(`ZIP 생성 완료: ${filename} (임시 에셋 ${placeholders}개 포함)`);
    } catch (e) {
      setToast(`ZIP 생성 실패: ${(e as Error).message}`);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card border-edge p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-gray-300">
            승인 장면 <b className="text-emerald-600">{approvedCount}</b> / 전체 {project.scenes.length}개가 ZIP에 포함됩니다.
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            생성되지 않은 배경·BGM은 임시 에셋으로 자동 채워져 바로 실행 가능한 프로젝트가 됩니다.
          </p>
        </div>
        <button className="btn-primary" disabled={building || approvedCount === 0} onClick={onZip}>
          {building ? <Spinner label="ZIP 생성 중" /> : '📦 ZIP 생성 · 다운로드'}
        </button>
      </div>

      <div className="flex gap-1 flex-wrap mb-2">
        {files.map((f, i) => (
          <button
            key={f.path}
            onClick={() => setActive(i)}
            className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
              active === i ? 'bg-accent2 text-white' : 'bg-panel2 text-gray-400 hover:bg-edge hover:text-gray-200'
            }`}
          >
            {f.path.replace('game/', '')}
          </button>
        ))}
      </div>

      <pre className="bg-ink border border-edge rounded-xl p-4 text-xs font-mono text-gray-200 overflow-x-auto max-h-[58vh] whitespace-pre leading-relaxed">
        {files[active]?.content}
      </pre>
    </div>
  );
}
