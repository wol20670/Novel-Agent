import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { hasEnvCredentials, generateRoomCode } from '../../collab';
import Spinner from '../Spinner';

/**
 * 협업(실시간 공유) 설정 — Supabase 접속 정보는 빌드에 내장돼 있어(anon key는 공개돼도 되는 값),
 * 사용자는 "방 코드"(6자리)와 이름만 다룬다. 새 방을 만들면 코드가 자동 생성되고, 친구는 그
 * 코드를 그대로 입력해 참가한다.
 */
export default function CollabSettings() {
  const enabled = useStore((s) => s.collabEnabled);
  const room = useStore((s) => s.collabRoom);
  const storedName = useStore((s) => s.collabName);
  const status = useStore((s) => s.collabStatus);
  const peers = useStore((s) => s.collabPeers);
  const setCollabConfig = useStore((s) => s.setCollabConfig);

  const [name, setName] = useState(storedName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const envReady = hasEnvCredentials();

  // hydrate() 가 앱 시작 시 비동기로 저장된 설정을 불러오므로, 그 값이 들어오면 이름칸도 맞춘다.
  useEffect(() => {
    setName(storedName);
  }, [storedName]);

  const STATUS: Record<string, { text: string; dot: string; color: string }> = {
    off: { text: '꺼짐', dot: 'bg-gray-600', color: 'text-gray-500' },
    connecting: { text: '연결 중…', dot: 'bg-amber-400', color: 'text-amber-500' },
    online: {
      text: peers.length > 0 ? `연결됨 · ${peers.length}명 접속 중` : '연결됨 · 나 혼자',
      dot: 'bg-emerald-400',
      color: 'text-emerald-600',
    },
    error: { text: '연결 실패 — 코드를 확인하고 다시 시도하세요', dot: 'bg-rose-400', color: 'text-rose-500' },
  };
  const st = STATUS[status] ?? STATUS.off;

  const createRoom = async () => {
    setBusy(true);
    try {
      await setCollabConfig({ room: generateRoomCode(), displayName: name.trim() || '익명', enabled: true });
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      await setCollabConfig({ room: code, displayName: name.trim() || '익명', enabled: true });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await setCollabConfig({ enabled: false });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(room).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-title">🤝 협업(실시간 공유) · 선택</h2>
      <p className="text-[11px] text-gray-500 leading-snug">
        저장할 때마다 서로에게 반영되고 지금 누가 어떤 장면을 보는지 표시됩니다(구글시트 같은 실시간
        동시편집은 아니고, 저장 시점마다 합쳐지는 가벼운 공유). <b className="text-amber-600">⚠️ 방 코드를
        아는 사람은 누구나 읽고 쓸 수 있으니</b> 신뢰하는 사람과만 공유하세요.
      </p>

      {!enabled ? (
        <>
          <input
            className="field text-xs"
            placeholder="내 이름 (상대에게 보임)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary" disabled={busy || !envReady} onClick={createRoom}>
            {busy ? <Spinner /> : '🆕 새 방 만들기'}
          </button>
          <div className="relative flex items-center gap-2 text-[10px] text-gray-600 my-0.5">
            <span className="flex-1 h-px bg-edge" />
            또는 코드로 참가
            <span className="flex-1 h-px bg-edge" />
          </div>
          <div className="flex gap-2">
            <input
              className="field flex-1 text-xs"
              placeholder="친구가 알려준 6자리 코드"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            />
            <button className="btn-ghost" disabled={busy || !envReady || !joinCode.trim()} onClick={joinRoom}>
              참가
            </button>
          </div>
          {!envReady && (
            <p className="text-[11px] text-amber-600">
              ⚠️ 이 빌드엔 협업용 Supabase 접속 정보가 설정돼 있지 않습니다(배포 시 환경변수 필요).
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="field flex-1 text-center font-mono text-lg tracking-widest select-all">{room}</span>
            <button className="btn-ghost text-xs shrink-0" onClick={copyCode}>
              {copied ? '✓ 복사됨' : '📋 복사'}
            </button>
          </div>
          <p className="text-[10px] text-gray-500">이 코드를 친구에게 알려주세요.</p>
          <button className="btn-ghost" disabled={busy} onClick={turnOff}>
            협업 끄기
          </button>
        </>
      )}

      <div className={`text-[11px] flex items-center gap-1.5 ${st.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
        {st.text}
      </div>
      {enabled && peers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {peers.map((p) => (
            <span key={p.clientId} className="chip border-emerald-500/40 text-emerald-600">
              🟢 {p.name} · {p.sceneTitle ?? p.activeTab}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
