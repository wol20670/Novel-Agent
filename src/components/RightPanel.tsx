import { useStore } from '../store';
import { useAssetUrl } from './useAssetUrl';
import { getAsset } from '../storage/assetStore';
import { downloadBlob } from '../zip/buildZip';
import UploadButton from './UploadButton';
import ScenePlayer from './ScenePlayer';

export default function RightPanel() {
  const sceneId = useStore((s) => s.selectedSceneId);
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId) ?? null);
  const importBg = useStore((s) => s.importBackground);
  const importBgm = useStore((s) => s.importBgm);
  const clearBgm = useStore((s) => s.clearBgm);
  const bgUrl = useAssetUrl(scene?.backgroundAssetId);
  const bgmUrl = useAssetUrl(scene?.bgmAssetId);

  const saveBgm = async () => {
    if (!scene?.bgmAssetId) return;
    const blob = await getAsset(scene.bgmAssetId);
    if (!blob) return;
    const ext = blob.type.split('/')[1]?.split(';')[0] || 'mp3';
    downloadBlob(blob, `${scene.title || 'bgm'}.${ext}`);
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
            <ScenePlayer scene={scene} bgUrl={bgUrl} />
          </div>

          <div className="flex gap-2">
            <UploadButton
              onFile={(f) => importBg(scene.id, f)}
              label="🖼 배경 업로드"
              className="btn-primary flex-1"
              title="ChatGPT 등에서 만든 배경 이미지를 업로드"
            />
            <button className="btn-ghost" disabled={!scene.backgroundAssetId} onClick={savePng}>
              ↓ PNG
            </button>
          </div>

          <div className="card border-edge p-3">
            <span className="label">🎵 BGM</span>
            {bgmUrl ? (
              <audio src={bgmUrl} controls className="w-full h-9 mt-1" />
            ) : (
              <p className="text-gray-600 text-xs py-2">BGM 미업로드</p>
            )}
            <div className="flex gap-2 mt-2">
              <UploadButton
                onFile={(f) => importBgm(scene.id, f)}
                label="🎵 BGM 업로드"
                className="btn-primary flex-1"
                accept="audio/*"
                title="Suno 등에서 만든 BGM(mp3 권장)을 업로드"
              />
              <button className="btn-ghost" disabled={!scene.bgmAssetId} onClick={saveBgm}>
                ↓ 저장
              </button>
              <button className="btn-ghost" disabled={!scene.bgmAssetId} onClick={() => clearBgm(scene.id)}>
                해제
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
              {scene.jumpTo && <span className="text-cyan-600">점프</span>}
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
