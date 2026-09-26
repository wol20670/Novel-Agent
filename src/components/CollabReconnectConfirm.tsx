import { useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../store';
import Spinner from './Spinner';

/**
 * S1-B F1 — local-only 를 거쳐 로그인했고 예전 협업 방 intent 가 남아 있을 때, 자동 재접속 대신
 * 사용자에게 묻는 **차단형** 모달. 재접속은 기존 pull-first 라 방에 저장된 프로젝트가 있으면
 * 지금 화면의 프로젝트를 통째 대체한다(local-only 편집 소실 — hosted 재현).
 *
 * ⚠️ 닫기·취소·ESC·바깥 클릭 escape 를 두지 않는다 — 두 선택 중 하나를 골라야 한다. overlay 가
 *    좌패널(방 만들기/참가)까지 덮어 이 확인을 우회하지 못하게 한다. 선택 없이 새로고침하면
 *    localStorage marker 때문에 다시 뜬다.
 * ⚠️ 포인터만 막으면 부족하다 — Tab 으로 뒤쪽 좌패널 "참가" 버튼에 닿아 확인을 우회할 수 있다.
 *    열리자마자 안전한 쪽("내 로컬 유지")에 포커스를 두고, Tab 을 두 버튼 안에서만 돌린다.
 * ⚠️ 버튼에 "방 버전으로 교체"라고 쓰지 않는다 — 방에 원격 행이 없으면 오히려 내 로컬이 방의
 *    첫 값으로 올라간다(startCollab). 대체 가능성은 본문에서 조건부로 설명한다.
 */
export default function CollabReconnectConfirm() {
  const room = useStore((s) => s.collabRoom);
  const confirmCollabReconnect = useStore((s) => s.confirmCollabReconnect);
  const keepLocalSkipReconnect = useStore((s) => s.keepLocalSkipReconnect);
  const [busy, setBusy] = useState(false);
  const reconnectRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // focus trap — 포커스가 모달 밖(뒤쪽 좌패널)으로 나가지 않게 두 버튼 사이만 순환시킨다.
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const next = document.activeElement === keepRef.current ? reconnectRef.current : keepRef.current;
    next?.focus();
  };

  const reconnect = async () => {
    setBusy(true);
    try {
      await confirmCollabReconnect();
    } finally {
      setBusy(false);
    }
  };

  return (
    // mousedown 기본 동작을 막아 배경·본문 클릭으로 포커스가 body 로 빠지지 않게 한다(그 뒤 Tab 이 좌패널로
    // 새는 것 방지). click 은 그대로 발생하므로 두 버튼은 정상 동작한다.
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onMouseDown={(e) => e.preventDefault()}>
      <div className="card w-full max-w-md p-4 flex flex-col gap-2.5" role="dialog" aria-modal="true" onKeyDown={trapTab}>
        <h3 className="text-sm font-bold text-gray-100">협업 방에 다시 연결할까요?</h3>

        <p className="text-[11px] text-gray-400 leading-snug">
          로컬 전용으로 작업한 뒤 로그인했습니다. 예전 협업 방
          {room ? <b className="font-mono text-gray-300"> {room}</b> : null}에 다시 연결하면,{' '}
          <b className="text-amber-600">
            방에 저장된 프로젝트가 있을 경우 지금 화면의 프로젝트를 대체할 수 있으며 로컬 전용에서 한 편집이
            사라질 수 있습니다.
          </b>
        </p>

        <button
          ref={reconnectRef}
          className="text-left rounded-lg border border-edge hover:border-rose-400/50 hover:bg-rose-500/5 transition-colors p-3 flex flex-col gap-1"
          disabled={busy}
          onClick={() => void reconnect()}
        >
          <span className="text-sm font-semibold text-gray-200">{busy ? <Spinner /> : '🔗 방에 다시 연결'}</span>
          <span className="text-[11px] text-gray-500 leading-snug">
            예전처럼 이 방의 공동 작업을 이어갑니다.
          </span>
        </button>

        <button
          ref={keepRef}
          autoFocus
          className="text-left rounded-lg border border-accent/50 bg-accent2/10 hover:bg-accent2/20 transition-colors p-3 flex flex-col gap-1"
          disabled={busy}
          onClick={keepLocalSkipReconnect}
        >
          <span className="text-sm font-semibold text-accent">💾 내 로컬 유지 (협업 끄기)</span>
          <span className="text-[11px] text-gray-500 leading-snug">
            지금 화면의 프로젝트를 그대로 두고 이 협업 방에는 연결하지 않습니다. 원격 프로젝트는 변경하지
            않습니다.
          </span>
        </button>

        <p className="text-[10px] text-gray-500 leading-snug">
          지금 작업을 친구와 공유하려면 &quot;내 로컬 유지&quot; 후 <b>🆕 새 방 만들기</b>를 쓰세요. 연결 전에
          백업하고 싶다면 &quot;내 로컬 유지&quot;를 고른 뒤 <b>📤 내보내기</b>를 하고, 그다음 이 방 코드로 다시
          참가하면 됩니다.
        </p>
      </div>
    </div>
  );
}
