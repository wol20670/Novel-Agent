import { useStore } from '../store';
import { useAssetUrl } from './useAssetUrl';
import { getAsset } from '../storage/assetStore';
import { downloadBlob } from '../zip/buildZip';
import Spinner from './Spinner';

export default function RightPanel() {
  const sceneId = useStore((s) => s.selectedSceneId);
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId) ?? null);
  const genBg = useStore((s) => s.generateBackground);
  const genBgm = useStore((s) => s.generateBgm);
  const busyBg = useStore((s) => (sceneId ? s.busy[`${sceneId}:bg`] : false));
  const busyBgm = useStore((s) => (sceneId ? s.busy[`${sceneId}:bgm`] : false));
  const bgUrl = useAssetUrl(scene?.backgroundAssetId);
  const bgmUrl = useAssetUrl(scene?.bgmAssetId);

  const saveWav = async () => {
    if (!scene?.bgmAssetId) return;
    const blob = await getAsset(scene.bgmAssetId);
    if (blob) downloadBlob(blob, `${scene.title || 'bgm'}.wav`);
  };
  const savePng = async () => {
    if (!scene?.backgroundAssetId) return;
    const blob = await getAsset(scene.backgroundAssetId);
    if (blob) downloadBlob(blob, `${scene.title || 'bg'}.png`);
  };

  return (
    <div className="p-3.5 flex flex-col gap-4 text-sm">
      <h2 className="section-title">👁 미리보기</h2>
      {!scene && (
        <div className="text-center text-gray-600 text-xs mt-10 leading-relaxed">
          <div className="text-4xl mb-3 opacity-50">🖼</div>
          장면 카드를 클릭하면
          <br />
          배경·BGM 미리보기가 표시됩니다.
        </div>
      )}

      {scene && (
        <>
          <div>
            <p className="font-semibold mb-2 truncate text-gray-200">{scene.title}</p>
            <div className="aspect-video rounded-xl border border-edge bg-ink overflow-hidden flex items-center justify-center text-xs text-gray-600">
              {bgUrl ? <img src={bgUrl} className="w-full h-full object-cover" /> : '배경 미생성'}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busyBg} onClick={() => genBg(scene.id)}>
              {busyBg ? <Spinner label="생성 중" /> : '🖼 배경 생성'}
            </button>
            <button className="btn-ghost" disabled={!scene.backgroundAssetId} onClick={savePng}>
              ↓ PNG
            </button>
          </div>

          <div className="card border-edge p-3">
            <span className="label">🎵 BGM</span>
            {bgmUrl ? (
              <audio src={bgmUrl} controls className="w-full h-9 mt-1" />
            ) : (
              <p className="text-gray-600 text-xs py-2">BGM 미생성</p>
            )}
            <div className="flex gap-2 mt-2">
              <button className="btn-primary flex-1" disabled={busyBgm} onClick={() => genBgm(scene.id)}>
                {busyBgm ? <Spinner label="생성 중" /> : '음악 생성'}
              </button>
              <button className="btn-ghost" disabled={!scene.bgmAssetId} onClick={saveWav}>
                ↓ WAV
              </button>
            </div>
          </div>

          <div className="card border-edge p-3 text-xs text-gray-400 space-y-1">
            <InfoRow k="배경" v={scene.background} />
            <InfoRow k="BGM" v={scene.bgm} />
            <InfoRow k="연출" v={scene.direction.join(', ')} />
            <div className="flex gap-3 pt-1 text-gray-500">
              <span>대사 {scene.lines.length}</span>
              <span>선택지 {scene.choices.length}</span>
              {scene.cg.length > 0 && <span>CG {scene.cg.length}</span>}
              {scene.jumpTo && <span className="text-cyan-400">점프</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v?: string }) {
  return (
    <p className="flex gap-2">
      <span className="text-gray-500 w-10 shrink-0">{k}</span>
      <span className="text-gray-300 truncate">{v || '—'}</span>
    </p>
  );
}
