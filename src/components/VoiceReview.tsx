import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { baseLocaleOf } from '../types';
import { getAssetUrl } from '../storage/assetStore';

interface QueueItem {
  sceneId: string;
  sceneTitle: string;
  lineIndex: number;
  speaker: string;
  text: string;
  assetId: string;
}

const RATES = [1, 1.25, 1.5];

/**
 * 생성된 보이스를 처음부터 끝까지 이어 들으며 검수하는 모달. 대본이 길면 대사 하나하나 클릭해
 * 듣는 게 번거로워, 장면 순서대로 큐를 만들어 자동 재생·자동 다음곡 넘김을 지원한다.
 * [🔁 재생성 예약]은 detachLineVoice 로 이 대사·언어의 음성을 해제한다 — 그러면 큐(= 프로젝트
 * 상태에서 매번 다시 계산)에서 그 줄이 자동으로 빠지고, 같은 인덱스에 다음 줄이 채워지므로 별도
 * "다음으로 넘기기" 호출 없이도 자연히 다음 곡으로 넘어간다.
 */
export default function VoiceReview({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const detachLineVoice = useStore((s) => s.detachLineVoice);
  const base = baseLocaleOf(project);

  const characters = useMemo(
    () => project.characters.filter((c) => !c.isProtagonist).map((c) => c.name),
    [project.characters],
  );
  const [filter, setFilter] = useState<string>('all');

  const queue = useMemo<QueueItem[]>(() => {
    const out: QueueItem[] = [];
    for (const sc of project.scenes) {
      sc.lines.forEach((line, lineIndex) => {
        if (line.kind !== 'dialogue') return;
        const assetId = line.voiceAssetIds?.[base];
        if (!assetId) return;
        if (filter !== 'all' && line.speaker !== filter) return;
        out.push({ sceneId: sc.id, sceneTitle: sc.title, lineIndex, speaker: line.speaker, text: line.text, assetId });
      });
    }
    return out;
  }, [project.scenes, base, filter]);

  const [cursor, setCursor] = useState(0);
  const [rate, setRate] = useState(1);
  const [markedCount, setMarkedCount] = useState(0);
  const [src, setSrc] = useState<string>();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 필터 변경·재생성 예약으로 큐가 줄어들면 커서가 범위를 벗어날 수 있어 보정한다.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(queue.length - 1, 0)));
  }, [queue.length]);

  const current = queue[cursor];

  // 현재 줄의 오디오 blob → object URL. 줄이 바뀔 때마다 이전 URL 을 revoke.
  useEffect(() => {
    let revoked = false;
    let url: string | undefined;
    setSrc(undefined);
    if (!current) return;
    getAssetUrl(current.assetId).then((u) => {
      if (revoked) return;
      url = u;
      setSrc(u);
    });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [current?.assetId]);

  useEffect(() => {
    if (!src) return;
    if (audioRef.current) audioRef.current.playbackRate = rate;
    audioRef.current?.play().catch(() => {});
  }, [src, rate]);

  const goNext = () => setCursor((c) => (c + 1 < queue.length ? c + 1 : c));

  const markForRegen = async () => {
    if (!current) return;
    await detachLineVoice(current.sceneId, current.lineIndex, base);
    setMarkedCount((n) => n + 1);
    // detach 로 큐가 재계산되며 같은 인덱스에 다음 줄이 채워지므로 별도 커서 이동은 불필요.
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-4 flex flex-col gap-2.5 max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-100">🎧 보이스 검수</h3>
          <button className="btn-ghost text-xs" onClick={onClose}>
            ✕ 닫기
          </button>
        </div>

        {queue.length === 0 ? (
          <p className="text-xs text-gray-400">검수할 음성이 없습니다(생성된 음성이 없거나 이 필터엔 없음).</p>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500">화자</span>
              <select
                className="field text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">전체</option>
                {characters.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-gray-500 ml-auto">
                {cursor + 1}/{queue.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border border-edge rounded divide-y divide-edge min-h-0">
              {queue.map((q, i) => (
                <div
                  key={`${q.sceneId}:${q.lineIndex}`}
                  className={`px-2 py-1.5 text-xs cursor-pointer ${
                    i === cursor ? 'bg-accent/10 text-accent' : 'text-gray-300 hover:bg-panel2'
                  }`}
                  onClick={() => setCursor(i)}
                >
                  <span className="text-gray-500 mr-1">{q.sceneTitle} ·</span>
                  <b>{q.speaker}</b> {q.text}
                </div>
              ))}
            </div>

            {current && (
              <>
                <p className="text-xs text-gray-300">
                  <span className="text-gray-500">{current.sceneTitle} · </span>
                  <b className="text-accent">{current.speaker}</b> {current.text}
                </p>
                <audio ref={audioRef} src={src} controls autoPlay className="w-full h-8" onEnded={goNext} />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-500">배속</span>
                  {RATES.map((r) => (
                    <button
                      key={r}
                      className={`chip ${rate === r ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400'}`}
                      onClick={() => setRate(r)}
                    >
                      {r}×
                    </button>
                  ))}
                  <button className="btn-ghost text-xs ml-auto" onClick={goNext} disabled={cursor + 1 >= queue.length}>
                    ⏭ 다음
                  </button>
                  <button className="btn-ghost text-xs" onClick={markForRegen}>
                    🔁 재생성 예약
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <p className="text-[10px] text-gray-500">🔁 {markedCount}개 예약됨 — 일괄 생성 재실행 시 자동 재생성</p>
      </div>
    </div>
  );
}
