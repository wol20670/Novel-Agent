import { useStore } from '../store';

/** 헤더의 협업 상태 배지 — "친구가 지금 뭘 보고 있는지" 한눈에. 협업이 꺼져 있으면 아무것도 표시하지 않는다. */
export default function CollabBadge() {
  const enabled = useStore((s) => s.collabEnabled);
  const status = useStore((s) => s.collabStatus);
  const peers = useStore((s) => s.collabPeers);

  if (!enabled) return null;

  if (status === 'connecting') {
    return <span className="chip border-edge text-gray-400">🔄 협업 연결 중…</span>;
  }
  if (status === 'error') {
    return <span className="chip border-rose-500/40 text-rose-500">⚠️ 협업 연결 실패</span>;
  }
  if (peers.length === 0) {
    return <span className="chip border-edge text-gray-400">👤 협업 켜짐 · 나 혼자</span>;
  }

  const [first, ...rest] = peers;
  return (
    <span
      className="chip border-emerald-500/40 text-emerald-600"
      title={peers.map((p) => p.name).join(', ')}
    >
      🟢 {first.name}
      {rest.length > 0 ? ` 외 ${rest.length}명` : ''} · {first.sceneTitle ?? first.activeTab} 편집 중
    </span>
  );
}
