import { useDeferredValue, useMemo, useState } from 'react';
import { useStore } from '../store';
import { generateRenpyFiles } from '../renpy/generate';
import { buildRenpyZip, downloadBlob } from '../zip/buildZip';
import { isNaverWhale } from '../project/folderSync';
import Spinner from './Spinner';

export default function RenpyTab() {
  const project = useStore((s) => s.project);
  const setToast = useStore((s) => s.setToast);
  const [active, setActive] = useState(0);
  const [building, setBuilding] = useState(false);

  const approvedCount = project.scenes.filter((s) => s.status === 'approved').length;

  // 좌측 패널 타이핑(크레딧 문구 등) 중에도 project 는 계속 바뀌는데, 전체 .rpy 재생성은 무거워
  // 이 탭이 열려 있으면 매 키 입력마다 다시 돌게 된다. useDeferredValue 로 미리보기만 지연시켜
  // 입력 반응성을 지키고, ZIP/폴더쓰기(아래 onZip·syncToFolder)는 항상 최신 project 를 그대로 쓴다.
  const deferredProject = useDeferredValue(project);
  const files = useMemo(() => {
    try {
      return generateRenpyFiles(deferredProject).files;
    } catch (e) {
      return [{ path: 'error', content: String(e) }];
    }
  }, [deferredProject]);

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
        ⚡ <b className="text-gray-400">폴더 직접 쓰기</b>는 Chrome/Edge 데스크톱에서 지원됩니다.
        {isNaverWhale() ? (
          <>
            {' '}
            <b className="text-gray-400">네이버 웨일</b>은 폴더 직접 쓰기 API 자체 버그로 클릭 시 탭이
            꺼질 수 있어 이 앱에서는 미지원 처리했습니다. Chrome/Edge 를 쓰거나 아래 ZIP 다운로드를
            사용하세요.
          </>
        ) : (
          ' 현재 브라우저는 미지원이라 ZIP 다운로드를 사용하세요.'
        )}
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
        <b className="text-gray-400">프로젝트들의 부모 폴더</b>(= Ren'Py 런처의 projects 디렉터리)를 한 번 연결하면, 이후{' '}
        <b className="text-gray-400">"폴더에 쓰기"</b> 시 <b className="text-gray-400">제목별 하위 폴더</b>(예{' '}
        <code className="text-accent">renpy_scenario\나의_비주얼노벨</code>)에 기록됩니다. 매번 그 프로젝트의 옛
        내용을 비우고 새로 써서 <b className="text-gray-400">낡은 스크립트가 남지 않습니다.</b> 런처에서 해당 프로젝트
        실행 → <b className="text-accent">Shift+R</b> 로 즉시 반영(다운로드·압축풀기 불필요).
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
