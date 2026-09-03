// 고아 에셋 정리 두 섹션 — AssetsTab.tsx 에서 떼어냈다.
// 로컬(IndexedDB)과 원격(Supabase Storage)은 지우는 대상이 다르고 서로의 주석이 서로를 참조하는
// 짝이라 한 파일에 둔다(각 함수의 doc 주석이 그 차이의 정본).

import { useState } from 'react';
import { useStore } from '../store';
import Spinner from './Spinner';
import OrphanCleanupModal from './OrphanCleanupModal';
import { isCollabReady } from '../collab';
import { REMOTE_GRACE_OPTIONS } from '../assetRefs';
import type { OrphanAsset } from '../types';

/**
 * 어디서도 참조되지 않는 IndexedDB 에셋 blob 을 찾아 보여주고, 사용자가 고른 것만 지운다.
 * 예전엔 개수만 보여주는 window.confirm 으로 즉시 전체 하드 삭제했는데, 고아 blob 은 에셋 탭
 * 어디에도 안 보여서(이 탭은 프로젝트 구조를 순회해 렌더함) "안 쓰는 이미지가 없는데 고아가 많다고
 * 나온다"는 혼란을 낳았다 — 지금은 OrphanCleanupModal 이 실물(썸네일·파일명·크기)을 보여준다.
 */
export function CleanupSection() {
  // 필드 단위 구독 — findOrphanAssets/deleteOrphanAssets 는 store 함수 참조라 마운트 후 안 바뀌지만,
  // 관례상(CLAUDE.md) whole-project 셀렉터를 쓰지 않는다.
  const findOrphanAssets = useStore((s) => s.findOrphanAssets);
  const deleteOrphanAssets = useStore((s) => s.deleteOrphanAssets);
  const setToast = useStore((s) => s.setToast);
  const [orphans, setOrphans] = useState<OrphanAsset[] | null>(null);
  const [loading, setLoading] = useState(false);

  const openModal = async () => {
    setLoading(true);
    try {
      const found = await findOrphanAssets();
      if (found.length === 0) setToast('고아 에셋이 없습니다.');
      else setOrphans(found);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h3 className="section-title mb-1">🧹 저장소 정리</h3>
      <p className="text-xs text-gray-500 mb-3">
        옛 업로드를 다른 파일로 교체하거나 캐릭터·장면을 지우면, 더는 어디서도 쓰이지 않는 파일이 브라우저 저장소에
        남을 수 있습니다. 협업으로 받았지만 이 프로젝트가 참조하지 않는 캐시나, 대본 재분석으로 이름 연결이 끊긴
        옛 파일도 여기 섞여 있을 수 있습니다. 아무 데도 연결되지 않은 파일을 찾아 보여주고, 고른 것만 지웁니다.
      </p>
      <button
        className="btn-ghost text-[11px] text-gray-400 hover:text-rose-500"
        disabled={loading}
        onClick={() => void openModal()}
      >
        {loading ? <Spinner /> : '참조되지 않는 에셋 정리'}
      </button>
      {orphans && (
        <OrphanCleanupModal
          orphans={orphans}
          onClose={() => setOrphans(null)}
          onDelete={(ids) => deleteOrphanAssets(ids)}
        />
      )}
    </section>
  );
}

/**
 * ☁️ 협업 Storage(Supabase) 정리 — 위 CleanupSection 과는 지우는 대상이 다르다. CleanupSection 은
 * 이 브라우저의 IndexedDB(로컬)만 지우지만, 앱은 업로드하는 모든 에셋을 공유 Supabase Storage
 * 버킷에도 올리고 거기선 절대 지우지 않는다 — 그래서 버킷이 계속 자란다. 이 섹션이 그 원격 사본을
 * 쓸어내는 두 번째, 더 위험한 스윕이다: 여기 뜨는 파일은 협업 상대와 "공유"하는 서버 파일이고,
 * 지우면 상대에게도 되돌릴 수 없다. 그래서 로컬 정리와 달리 기본 선택을 비워 두고(defaultSelected
 * false) 사용자가 직접 고르게 한다. 협업이 꺼져 있으면(isCollabReady() false) 버킷 자체가 없는
 * 얘기라 섹션을 아예 렌더하지 않는다.
 */
export function RemoteCleanupSection() {
  const findRemoteOrphanAssets = useStore((s) => s.findRemoteOrphanAssets);
  const deleteRemoteOrphanAssets = useStore((s) => s.deleteRemoteOrphanAssets);
  const setToast = useStore((s) => s.setToast);
  // isCollabReady() 는 모듈 전역 collabConfig 를 읽는 동기 함수라 그것만 보면 협업을 켠 뒤에도
  // 이 컴포넌트가 다시 그려질 이유가 없어 섹션이 안 나타난다(탭을 나갔다 와야 보인다). 스토어의
  // collabEnabled 를 같이 구독해 리렌더 트리거를 만든다 — 판정 자체는 방 코드·환경변수까지 보는
  // isCollabReady() 가 맡는다(collabEnabled 만으론 방 코드가 비어도 true 라 부족).
  const collabEnabled = useStore((s) => s.collabEnabled);
  const [orphans, setOrphans] = useState<OrphanAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  // 유예 기간 선택 — 버튼을 누르기 "전에" 보이는 자리에 둔다. 기본 7일 고정이던 시절엔 방금 교체한
  // 이미지가 전부 유예에 걸려 목록이 빈 채로 떠서, 기능이 고장난 것처럼 보였다(실제 보고).
  const [graceId, setGraceId] = useState<(typeof REMOTE_GRACE_OPTIONS)[number]['id']>('7d');
  const grace = REMOTE_GRACE_OPTIONS.find((o) => o.id === graceId) ?? REMOTE_GRACE_OPTIONS[0];

  if (!collabEnabled || !isCollabReady()) return null;

  const openModal = async () => {
    setLoading(true);
    try {
      const found = await findRemoteOrphanAssets(grace.ms);
      // null = 조회 실패(판정 불가). 액션이 이미 에러 토스트를 띄웠으니 여기서 아무것도 덮어쓰지
      // 않고 조용히 빠진다 — 예전엔 실패도 빈 배열이라 "정리할 파일이 없습니다"가 에러를 가렸다.
      if (found === null) return;
      if (found.length === 0) {
        // 유예가 걸려 있으면 "없음"이 곧 "정말 없음"이 아니다 — 왜 비었는지를 토스트가 직접 알려준다.
        setToast(
          grace.ms > 0
            ? '정리할 서버 파일이 없습니다. 최근에 올린 파일은 유예 기간에 걸려 빠집니다 — 기간을 바꿔 보세요.'
            : '정리할 서버 파일이 없습니다.',
        );
      } else setOrphans(found);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h3 className="section-title mb-1">☁️ 협업 Storage 정리</h3>
      <p className="text-xs text-gray-500 mb-3">
        위 저장소 정리는 이 브라우저 안에서만 지웁니다. 하지만 업로드한 에셋은 전부{' '}
        <b className="text-amber-600">상대방과 공유하는 서버(Supabase Storage)</b>에도 함께 올라가고, 그쪽은
        지금까지 전혀 지워지지 않아 계속 쌓입니다. 여기서 찾는 건 어떤 방의 어떤 프로젝트도 더는 참조하지 않는
        서버 파일입니다 — 지우면 <b className="text-amber-600">상대방 쪽에서도 되돌릴 수 없습니다.</b> 신중하게
        고르세요(기본은 아무것도 선택되지 않은 상태입니다).
      </p>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-gray-400 shrink-0">업로드 후 경과</label>
        <select
          className="field text-xs py-1 w-auto"
          value={graceId}
          onChange={(e) => setGraceId(e.target.value as typeof graceId)}
        >
          {REMOTE_GRACE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {grace.ms === 0 && (
        <p className="text-[11px] text-amber-600 mb-2 leading-snug">
          ⚠️ 유예 없음 — 상대방이 지금 이미지를 올리는 중이라면 아직 저장(동기화)되지 않은 파일까지 후보로
          잡힙니다. 둘 다 작업을 저장한 상태에서 쓰세요.
        </p>
      )}
      <button
        className="btn-ghost text-[11px] text-gray-400 hover:text-rose-500"
        disabled={loading}
        onClick={() => void openModal()}
      >
        {loading ? <Spinner /> : '서버 파일 정리'}
      </button>
      {orphans && (
        <OrphanCleanupModal
          orphans={orphans}
          onClose={() => setOrphans(null)}
          onDelete={(ids) => deleteRemoteOrphanAssets(ids)}
          title="협업 서버의 참조되지 않는 파일"
          description={`어떤 방의 어떤 프로젝트에서도 더는 가리키지 않는 Supabase Storage 파일입니다(기준: ${grace.label}). 협업 상대와 공유하는 서버에 있는 파일이라 지우면 상대방 쪽에서도 사라집니다. 지울 항목을 직접 고르세요 — 기본은 아무것도 선택되지 않은 상태입니다.`}
          unknownLabel="서버 파일"
          unknownNote="이 앱 인스턴스가 아는 어떤 프로젝트도 더는 참조하지 않는, Supabase Storage 버킷 안의 객체입니다(업로더나 어느 방에서 올렸는지는 남아있지 않습니다)."
          defaultSelected={false}
          confirmLabel="영구 삭제"
          danger="상대방과 공유하는 서버 파일입니다 — 삭제하면 상대방 쪽에서도 즉시 사라지며 되돌릴 수 없습니다."
        />
      )}
    </section>
  );
}
