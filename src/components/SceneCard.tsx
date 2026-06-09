import { useStore } from '../store';
import { SCENE_STATUS_LABEL, type SceneStatus } from '../types';
import { useAssetUrl } from './useAssetUrl';
import Spinner from './Spinner';

const STATUS_BTN: Record<SceneStatus, { on: string; dot: string }> = {
  review: { on: 'bg-gray-500/20 text-gray-200 border-gray-400', dot: 'bg-gray-400' },
  approved: { on: 'bg-emerald-500/20 text-emerald-300 border-emerald-500', dot: 'bg-emerald-400' },
  needs_fix: { on: 'bg-amber-500/20 text-amber-300 border-amber-500', dot: 'bg-amber-400' },
};
const STATUSES = Object.keys(SCENE_STATUS_LABEL) as SceneStatus[];

export default function SceneCard({ sceneId, index }: { sceneId: string; index: number }) {
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId))!;
  const update = useStore((s) => s.updateScene);
  const setStatus = useStore((s) => s.setSceneStatus);
  const select = useStore((s) => s.selectScene);
  const selected = useStore((s) => s.selectedSceneId === sceneId);
  const genBg = useStore((s) => s.generateBackground);
  const genBgm = useStore((s) => s.generateBgm);
  const busyBg = useStore((s) => s.busy[`${sceneId}:bg`]);
  const busyBgm = useStore((s) => s.busy[`${sceneId}:bgm`]);
  const bgUrl = useAssetUrl(scene.backgroundAssetId);

  return (
    <div
      onClick={() => select(sceneId)}
      className={`card p-4 cursor-default scroll-mt-4 ${
        selected ? 'border-accent shadow-lg shadow-accent2/10' : 'border-edge hover:border-edge/80'
      }`}
    >
      {/* 헤더: 번호 · 제목 · 상태 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-panel2 text-[11px] font-bold text-accent shrink-0">
          {index + 1}
        </span>
        <input
          className="field flex-1 font-semibold"
          value={scene.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => update(sceneId, { title: e.target.value })}
        />
      </div>

      <div className="flex gap-1 mb-3">
        {STATUSES.map((st) => {
          const active = scene.status === st;
          return (
            <button
              key={st}
              onClick={(e) => {
                e.stopPropagation();
                setStatus(sceneId, st);
              }}
              className={`chip flex items-center gap-1.5 ${
                active ? STATUS_BTN[st].on : 'border-edge text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? STATUS_BTN[st].dot : 'bg-gray-600'}`} />
              {SCENE_STATUS_LABEL[st]}
            </button>
          );
        })}
      </div>

      {/* 배경 미리보기 */}
      <div className="relative rounded-lg border border-edge overflow-hidden aspect-video bg-ink mb-3 flex items-center justify-center">
        {bgUrl ? (
          <img src={bgUrl} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-gray-600">배경 미생성 · "배경 생성"을 눌러보세요</span>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {scene.backgroundAssetId && <span className="chip bg-black/50 border-emerald-500/50 text-emerald-300">배경✓</span>}
          {scene.bgmAssetId && <span className="chip bg-black/50 border-emerald-500/50 text-emerald-300">BGM✓</span>}
        </div>
      </div>

      {/* 메타 필드 */}
      <div className="grid grid-cols-2 gap-3 mb-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <span className="label">배경</span>
          <input
            className="field"
            placeholder="배경 이름"
            value={scene.background ?? ''}
            onChange={(e) => update(sceneId, { background: e.target.value })}
          />
        </div>
        <div>
          <span className="label">BGM</span>
          <input
            className="field"
            placeholder="BGM 이름"
            value={scene.bgm ?? ''}
            onChange={(e) => update(sceneId, { bgm: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <span className="label">연출 노트 (AI 프롬프트 반영)</span>
          <input
            className="field"
            placeholder="예: 햇살이 비치는 아침 (쉼표로 구분)"
            value={scene.direction.join(', ')}
            onChange={(e) =>
              update(sceneId, {
                direction: e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </div>

      {/* 대사/지문 미리보기 */}
      <div className="bg-ink/70 rounded-lg border border-edge p-3 max-h-44 overflow-y-auto text-sm mb-3 space-y-0.5">
        {scene.lines.length === 0 && <span className="text-gray-600 text-xs">대사 없음</span>}
        {scene.lines.map((l, i) =>
          l.kind === 'dialogue' ? (
            <p key={i}>
              <b className="text-accent">{l.speaker}</b> <span className="text-gray-200">{l.text}</span>
            </p>
          ) : (
            <p key={i} className="text-gray-400 italic">
              {l.text}
            </p>
          ),
        )}
        {scene.cg.map((c, i) => (
          <p key={`cg${i}`} className="text-pink-300 text-xs">
            🎴 CG: {c}
          </p>
        ))}
        {scene.choices.length > 0 && (
          <div className="mt-2 border-t border-edge pt-2 space-y-0.5">
            {scene.choices.map((c, i) => (
              <p key={i} className="text-amber-300 text-xs">
                ▷ {c.text}
                {c.target && <span className="text-gray-500"> → {c.target}</span>}
              </p>
            ))}
          </div>
        )}
        {scene.jumpTo && <p className="text-cyan-300 text-xs mt-1">⤳ 점프: {scene.jumpTo}</p>}
      </div>

      {/* 액션 */}
      <div className="flex gap-2 flex-wrap items-center" onClick={(e) => e.stopPropagation()}>
        <button className="btn-primary" disabled={busyBg} onClick={() => genBg(sceneId)}>
          {busyBg ? <Spinner label="생성 중" /> : '🖼 배경 생성'}
        </button>
        <button className="btn-ghost" disabled={busyBgm} onClick={() => genBgm(sceneId)}>
          {busyBgm ? <Spinner label="생성 중" /> : '🎵 음악 생성'}
        </button>
        {scene.status !== 'approved' && (
          <button className="btn-soft ml-auto" onClick={() => setStatus(sceneId, 'approved')}>
            ✓ 승인
          </button>
        )}
      </div>
    </div>
  );
}
