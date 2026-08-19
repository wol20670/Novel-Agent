import { useStore, sceneById } from '../store';
import { jumpToScene } from './sceneJump';
import { useAssetUrl } from './useAssetUrl';
import { getAsset } from '../storage/assetStore';
import { downloadBlob } from '../zip/buildZip';
import UploadButton from './UploadButton';
import ScenePlayer from './ScenePlayer';

export default function RightPanel() {
  const sceneId = useStore((s) => s.selectedSceneId);
  const scenes = useStore((s) => s.project.scenes);
  // sceneById: scenes.find() 셀렉터는 zustand의 매 set() 마다(렌더 여부 무관) 재실행돼 O(N) 스캔이
  // 반복된다 — identity 캐싱된 인덱스로 O(1) 조회(src/store.ts, SceneCard.tsx와 동일 이유).
  const scene = useStore((s) => sceneById(s.project.scenes, sceneId) ?? null);
  const importBg = useStore((s) => s.importBackground);
  const importBgm = useStore((s) => s.importBgm);
  const clearBgm = useStore((s) => s.clearBgm);
  const bgUrl = useAssetUrl(scene?.backgroundAssetId);
  const bgmUrl = useAssetUrl(scene?.bgmAssetId);

  // 리모컨 — 장면 목록을 스크롤로 훑는 대신 원하는 장면으로 바로 이동(내 화면에만 적용,
  // 협업자의 스크롤 위치는 건드리지 않는다 — presence(누가 이 장면을 보는지)는 선택 시 기존과
  // 동일하게 반영되지만 스크롤 자체는 로컬 DOM 동작이라 동기화 대상이 아니다).
  // 구현은 ./sceneJump 로 옮겼다(CenterPanel 의 QA 의심 카운트가 같은 이동을 쓴다) — 동작 무변경.
  const curIdx = scenes.findIndex((s) => s.id === sceneId);
  const jumpBy = (delta: number) => {
    if (scenes.length === 0) return;
    const next = curIdx < 0 ? 0 : Math.min(Math.max(curIdx + delta, 0), scenes.length - 1);
    jumpToScene(scenes[next].id);
  };

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

      {scenes.length > 0 && (
        <div className="card border-edge p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">🎮 장면 리모컨</span>
            <span className="text-[10px] text-gray-500">
              {curIdx >= 0 ? `${curIdx + 1} / ${scenes.length}` : `${scenes.length}개`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="btn-ghost shrink-0"
              disabled={curIdx <= 0}
              onClick={() => jumpBy(-1)}
              title="이전 장면으로 이동"
            >
              ◀
            </button>
            <select
              className="field flex-1 text-xs min-w-0"
              value={sceneId ?? ''}
              onChange={(e) => jumpToScene(e.target.value)}
              title="장면을 선택하면 내 화면만 그 장면으로 스크롤됩니다(협업자에겐 영향 없음)"
            >
              <option value="" disabled>
                장면 선택…
              </option>
              {scenes.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.title || '(제목 없음)'}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost shrink-0"
              disabled={curIdx < 0 ? scenes.length <= 1 : curIdx >= scenes.length - 1}
              onClick={() => jumpBy(1)}
              title="다음 장면으로 이동"
            >
              ▶
            </button>
          </div>
        </div>
      )}

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
