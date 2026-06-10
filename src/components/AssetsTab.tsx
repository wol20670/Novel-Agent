import { useState } from 'react';
import { useStore } from '../store';
import { EXPRESSIONS, type Expression } from '../types';
import { ALL_MOODS } from '../generators/audio/moods';
import { useAssetUrl } from './useAssetUrl';
import Spinner from './Spinner';

export default function AssetsTab() {
  const characters = useStore((s) => s.project.characters);
  const scenes = useStore((s) => s.project.scenes);

  if (scenes.length === 0)
    return <p className="text-gray-500 text-sm text-center mt-16">먼저 스토리를 분석하세요.</p>;

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <section>
        <h3 className="section-title mb-1">🧑‍🎨 캐릭터 스프라이트</h3>
        <p className="text-xs text-gray-500 mb-3">
          표정별 입화를 생성합니다. 키 없으면 Canvas 임시 입화(투명 PNG). 대본에서{' '}
          <code className="text-accent">이름(기쁨): 대사</code> 처럼 적으면 그 표정으로 등장합니다.
        </p>
        {characters.length === 0 && <p className="text-gray-600 text-sm">등장 캐릭터 없음</p>}
        <div className="grid grid-cols-2 gap-3">
          {characters.map((c) => (
            <CharacterCard key={c.name} name={c.name} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title mb-3">🖼 배경 / CG</h3>
        <div className="flex flex-col gap-2">
          {scenes.map((s) => (
            <BackgroundRow key={s.id} sceneId={s.id} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title mb-3">🎵 오디오 (BGM)</h3>
        <div className="flex flex-col gap-2">
          {scenes.map((s) => (
            <AudioRow key={s.id} sceneId={s.id} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CharacterCard({ name }: { name: string }) {
  const c = useStore((s) => s.project.characters.find((x) => x.name === name))!;
  const updateChar = useStore((s) => s.updateCharacter);
  const genAll = useStore((s) => s.generateCharacterSprites);
  const genOne = useStore((s) => s.generateCharacterSprite);
  const clearAll = useStore((s) => s.clearCharacterSprites);
  const busy = useStore((s) => s.busy[`sprite:${name}`]);
  const hasAny = EXPRESSIONS.some((ex) => c.expressions[ex as Expression]);

  return (
    <div className="card border-edge p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <input
          type="color"
          value={c.color}
          onChange={(e) => updateChar(name, { color: e.target.value })}
          className="w-6 h-6 rounded border border-edge bg-transparent shrink-0"
        />
        <span className="font-semibold text-sm flex-1 truncate" style={{ color: c.color }}>
          {name}
        </span>
        <button className="btn-primary !px-2 !py-1 text-xs" disabled={busy} onClick={() => genAll(name)}>
          {busy ? <Spinner /> : hasAny ? '전체 재생성' : '스프라이트 생성'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {EXPRESSIONS.map((ex) => (
          <ExpressionThumb key={ex} name={name} expr={ex as Expression} busy={!!busy} onGen={() => genOne(name, ex as Expression)} />
        ))}
      </div>
      {hasAny && (
        <button className="text-[11px] text-gray-500 hover:text-rose-600 mt-2" onClick={() => clearAll(name)}>
          스프라이트 비우기
        </button>
      )}
    </div>
  );
}

function ExpressionThumb({
  name,
  expr,
  busy,
  onGen,
}: {
  name: string;
  expr: Expression;
  busy: boolean;
  onGen: () => void;
}) {
  const assetId = useStore((s) => s.project.characters.find((x) => x.name === name)?.expressions[expr]);
  const url = useAssetUrl(assetId);
  return (
    <button
      onClick={onGen}
      disabled={busy}
      title={`${expr} ${url ? '재생성' : '생성'}`}
      className="relative aspect-[3/4] rounded-lg border border-edge bg-ink overflow-hidden flex items-center justify-center group"
    >
      {url ? (
        <img src={url} className="w-full h-full object-contain" />
      ) : (
        <span className="text-[10px] text-gray-500">{expr}</span>
      )}
      <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9px] py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {expr}
      </span>
    </button>
  );
}

function BackgroundRow({ sceneId }: { sceneId: string }) {
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId))!;
  const update = useStore((s) => s.updateScene);
  const genBg = useStore((s) => s.generateBackground);
  const busy = useStore((s) => s.busy[`${sceneId}:bg`]);
  const url = useAssetUrl(scene.backgroundAssetId);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '미생성'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 truncate mb-1">{scene.title}</p>
        <input
          className="field"
          value={scene.background ?? ''}
          placeholder="배경 프롬프트"
          onChange={(e) => update(sceneId, { background: e.target.value })}
        />
      </div>
      <button className="btn-ghost shrink-0" disabled={busy} onClick={() => genBg(sceneId)}>
        {busy ? <Spinner /> : '재생성'}
      </button>
    </div>
  );
}

function AudioRow({ sceneId }: { sceneId: string }) {
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId))!;
  const genBgm = useStore((s) => s.generateBgm);
  const busy = useStore((s) => s.busy[`${sceneId}:bgm`]);
  const url = useAssetUrl(scene.bgmAssetId);
  const [mood, setMood] = useState('');
  const [volume, setVolume] = useState(0.8);
  const [bpm, setBpm] = useState(0);

  return (
    <div className="card border-edge p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 flex-1 truncate">{scene.title}</span>
        <select className="field w-32" value={mood} onChange={(e) => setMood(e.target.value)}>
          <option value="">자동(프롬프트)</option>
          {ALL_MOODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          className="btn-ghost shrink-0"
          disabled={busy}
          onClick={() => genBgm(sceneId, { moodKey: mood || undefined, volume, bpm: bpm || undefined })}
        >
          {busy ? <Spinner /> : '생성'}
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-gray-400">
        <label className="flex items-center gap-1.5 flex-1">
          볼륨
          <input type="range" min={0.2} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="flex-1" />
        </label>
        <label className="flex items-center gap-1.5 flex-1">
          템포
          <input type="range" min={0} max={140} step={2} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1" />
          <span className="w-10 text-right">{bpm || '자동'}</span>
        </label>
      </div>
      {url && <audio src={url} controls className="w-full h-8" />}
    </div>
  );
}
