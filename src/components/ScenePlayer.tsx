// 브라우저 안에서 한 장면을 재생하는 미니 플레이어.
// 배경 + 캐릭터(위치·표정) + 대사창을 그려, Ren'Py 로 내보내기 전에 표정·배치를 확인한다.
// 스프라이트 에셋이 없으면 canvasSprite 임시 이미지로 그려 표정 변화를 즉시 보여준다.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { inferEmotion } from '../generators/emotion';
import { canvasSprite } from '../generators/image/canvasSprite';
import { getAsset } from '../storage/assetStore';
import { spreadPositions } from '../renpy/generate';
import type { Scene, Character, Expression, Line } from '../types';

const EXPR_EMOJI: Record<Expression, string> = {
  기본: '😐', 기쁨: '😊', 슬픔: '😢', 화남: '😠', 놀람: '😲', 수줍음: '😳',
};

const speakersOf = (l: Line): string[] =>
  l.kind === 'dialogue' ? (l.members?.length ? l.members : [l.speaker]) : [];

/** 한 캐릭터의 (표정) 스프라이트 — 에셋이 있으면 그것, 없으면 Canvas 임시 이미지. */
function PreviewSprite({ char, expr, xpct }: { char: Character; expr: Expression; xpct: number }) {
  const assetId = char.expressions[expr];
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    let obj: string | undefined;
    (async () => {
      let blob: Blob | undefined;
      if (assetId) blob = await getAsset(assetId);
      if (!blob) blob = await canvasSprite(char.name, expr, char.color);
      if (!alive) return;
      obj = URL.createObjectURL(blob);
      setUrl(obj);
    })();
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [char.name, char.color, expr, assetId]);
  if (!url) return null;
  return (
    <img
      src={url}
      className="absolute bottom-0 h-[92%] max-w-[48%] object-contain pointer-events-none"
      style={{ left: `${xpct}%`, transform: 'translateX(-50%)' }}
    />
  );
}

export default function ScenePlayer({ scene, bgUrl }: { scene: Scene; bgUrl?: string }) {
  const characters = useStore((s) => s.project.characters);
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [scene.id]);

  const charByName = useMemo(() => new Map(characters.map((c) => [c.name, c])), [characters]);
  const isNarrOnly = (name: string) => !!charByName.get(name)?.isProtagonist;
  const emoOf = (l: Line): Expression =>
    l.kind === 'dialogue'
      ? ((l.emotion as Expression | undefined) ??
        inferEmotion(l.text, { direction: scene.direction, background: scene.background }))
      : '기본';

  // 무대에 설 캐릭터(주인공 제외) 첫 등장 순서 → 가로 위치(생성기와 동일 규칙).
  const xpos = useMemo(() => {
    const order: string[] = [];
    for (const l of scene.lines)
      for (const sp of speakersOf(l)) if (!isNarrOnly(sp) && !order.includes(sp)) order.push(sp);
    const xs = spreadPositions(order.length);
    return new Map(order.map((n, idx) => [n, xs[idx]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, characters]);

  const total = scene.lines.length;
  const i = Math.min(step, Math.max(0, total - 1));
  const cur = scene.lines[i] as Line | undefined;

  // 현재 줄까지 각 캐릭터의 "최신 표정"(Ren'Py 처럼 마지막 표정 유지).
  const visible = new Map<string, Expression>();
  for (let k = 0; k <= i && k < total; k++) {
    const l = scene.lines[k];
    if (l.kind !== 'dialogue') continue;
    const emo = emoOf(l);
    for (const sp of speakersOf(l)) if (!isNarrOnly(sp)) visible.set(sp, emo);
  }

  const isJoint = cur?.kind === 'dialogue' && !!cur.members?.length;
  const name =
    cur?.kind === 'dialogue' ? (isJoint ? cur.members!.join(' & ') : cur.speaker) : null;
  const nameColor = name && !isJoint ? charByName.get(name)?.color : undefined;
  const curEmo = cur ? emoOf(cur) : '기본';

  return (
    <div>
      <div className="relative aspect-video rounded-xl border border-edge bg-ink overflow-hidden">
        {bgUrl ? (
          <img src={bgUrl} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">
            배경 미생성
          </div>
        )}
        {[...visible].map(([nm, ex]) => {
          const c = charByName.get(nm);
          return c ? <PreviewSprite key={nm} char={c} expr={ex} xpct={xpos.get(nm) ?? 50} /> : null;
        })}
        {cur && (
          <div className="absolute inset-x-0 bottom-0 bg-black/55 backdrop-blur-[1px] px-3 py-2 min-h-[26%]">
            {name && (
              <div className="font-bold text-sm mb-0.5" style={{ color: nameColor ?? '#ffffff' }}>
                {name}
                {curEmo !== '기본' && (
                  <span className="ml-1.5 text-[11px] font-normal opacity-90">
                    {EXPR_EMOJI[curEmo]} {curEmo}
                  </span>
                )}
              </div>
            )}
            <div className="text-gray-100 text-sm leading-snug">{cur.text}</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button className="btn-ghost" disabled={i <= 0} onClick={() => setStep(i - 1)} title="이전 대사">
          ◀
        </button>
        <span className="text-xs text-gray-500 flex-1 text-center">
          {total ? i + 1 : 0} / {total}
        </span>
        <button className="btn-ghost" disabled={i >= total - 1} onClick={() => setStep(i + 1)} title="다음 대사">
          ▶
        </button>
        <button className="btn-ghost text-[11px]" onClick={() => setStep(0)} title="처음부터">
          ↺
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
        ▶ 로 대사를 넘기며 캐릭터·표정·위치를 미리 확인하세요. 스프라이트가 없으면 임시 이미지로
        표정을 표시합니다.
      </p>
    </div>
  );
}
