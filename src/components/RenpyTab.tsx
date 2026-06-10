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
      <FolderSync approvedCount={approvedCount} />

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

function FolderSync({ approvedCount }: { approvedCount: number }) {
  const supported = useStore((s) => s.folderSupported);
  const folderName = useStore((s) => s.folderName);
  const syncToFolder = useStore((s) => s.syncToFolder);
  const changeFolder = useStore((s) => s.changeFolder);
  const disconnectFolder = useStore((s) => s.disconnectFolder);
  const [busy, setBusy] = useState(false);

  const doSync = async () => {
    setBusy(true);
    try {
      await syncToFolder();
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div className="card border-edge p-3 mb-4 text-xs text-gray-500">
        ⚡ <b className="text-gray-400">폴더 직접 쓰기</b>는 Chrome/Edge 데스크톱에서 지원됩니다. 현재 브라우저는
        미지원이라 ZIP 다운로드를 사용하세요.
      </div>
    );
  }

  return (
    <div className="card border-accent/40 bg-accent2/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-accent">⚡ Ren'Py 폴더에 직접 쓰기 (반복 테스트)</span>
        {folderName && (
          <span className="chip border-emerald-500/50 text-emerald-700">📁 {folderName}</span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-snug">
        Ren'Py 프로젝트 폴더를 한 번 연결하면, 이후 <b className="text-gray-400">"폴더에 쓰기"</b> 버튼 → Ren'Py
        게임 창에서 <b className="text-accent">Shift+R</b>(리로드) 만으로 즉시 반영됩니다. 다운로드·압축풀기 불필요.
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        <button className="btn-primary" disabled={busy || approvedCount === 0} onClick={doSync}>
          {busy ? <Spinner label="기록 중" /> : folderName ? '⚡ 폴더에 쓰기' : '📁 폴더 연결 후 쓰기'}
        </button>
        {folderName && (
          <>
            <button className="btn-ghost" disabled={busy} onClick={changeFolder}>
              폴더 변경
            </button>
            <button className="btn-ghost text-gray-500" disabled={busy} onClick={disconnectFolder}>
              연결 해제
            </button>
          </>
        )}
      </div>
    </div>
  );
}
