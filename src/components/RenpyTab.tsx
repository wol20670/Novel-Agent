import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { generateRenpyFiles } from '../renpy/generate';
import { buildRenpyZip, downloadBlob } from '../zip/buildZip';
import { isNaverWhale } from '../project/folderSync';
import Spinner from './Spinner';

// 미리보기 <pre> 에 파일 전체를 그대로 박으면 3000줄 대본에선 script.rpy 가 수백 KB 라 DOM 이
// 무거워진다 — 실제 내보내기(ZIP/폴더쓰기)는 항상 전체 내용을 쓰고, 화면 미리보기만 자른다.
const PREVIEW_LINE_LIMIT = 2000;
function previewContent(content: string | undefined): string {
  if (!content) return '';
  const lines = content.split('\n');
  if (lines.length <= PREVIEW_LINE_LIMIT) return content;
  return (
    lines.slice(0, PREVIEW_LINE_LIMIT).join('\n') +
    `\n\n… ${lines.length - PREVIEW_LINE_LIMIT}줄 더(전체 내용은 ZIP 생성/폴더쓰기로 확인하세요)`
  );
}

export default function RenpyTab() {
  // 이 탭은 결국 generateRenpyFiles(project)/buildRenpyZip(project) 로 프로젝트 전체를 코드젠해야
  // 하므로(개별 필드 몇 개로 좁힐 수 없음 — 전체 스크립트를 만드는 게 이 탭의 본질) project 전체
  // 구독은 여기선 불가피하다. 대신 아래에서 재계산 자체를 디바운스해 비용을 줄인다.
  const project = useStore((s) => s.project);
  const setToast = useStore((s) => s.setToast);
  const [active, setActive] = useState(0);
  const [building, setBuilding] = useState(false);

  const approvedCount = project.scenes.filter((s) => s.status === 'approved').length;

  // 좌측 패널 타이핑(크레딧 문구 등) 중에도 project 는 계속 바뀌는데, 전체 .rpy 재생성은 무거워
  // 이 탭이 열려 있으면 매 키 입력마다 다시 돌 수 있다. useDeferredValue 는 "우선순위"만 낮출 뿐
  // React 가 한가할 때마다 여전히 재계산하므로(실행 횟수를 줄이지 않음), 300ms 동안 새 변경이
  // 없을 때만 실제로 재생성하는 디바운스를 추가한다 — 미리보기일 뿐이라 즉시 반영될 필요가 없다.
  // ZIP/폴더쓰기(onZip·syncToFolder)는 항상 최신 project 를 그대로 쓰므로 내보내기 결과엔 영향 없다.
  const [debouncedProject, setDebouncedProject] = useState(project);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProject(project), 300);
    return () => clearTimeout(t);
  }, [project]);
  const deferredProject = useDeferredValue(debouncedProject);
  const files = useMemo(() => {
    try {
      return generateRenpyFiles(deferredProject).files;
    } catch (e) {
      return [{ path: 'error', content: String(e) }];
    }
  }, [deferredProject]);
  const activeContent = useMemo(() => previewContent(files[active]?.content), [files, active]);

  const onZip = async () => {
    if (approvedCount === 0) {
      setToast('승인된 장면이 없습니다. 장면 탭에서 먼저 승인하세요.');
      return;
    }
    setBuilding(true);
    setToast('ZIP 생성 중… (에셋 폴백 생성 포함, 잠시 걸릴 수 있어요)');
    try {
      const { blob, filename, placeholders, fontFallbackWarning } = await buildRenpyZip(project);
      downloadBlob(blob, filename);
      // fontFallbackWarning: 본문/이름 폰트를 하나도 못 구해 DejaVuSans(엔진 기본)로 대체된 경우 —
      // 한글이 두부(빈 네모)로 보일 수 있는 심각한 문제라 placeholders 안내에 묻히지 않게 이어붙인다.
      setToast(
        `ZIP 생성 완료: ${filename} (임시 에셋 ${placeholders}개 포함)` +
          (fontFallbackWarning ? ` ⚠️ ${fontFallbackWarning}` : ''),
      );
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
        {activeContent}
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
