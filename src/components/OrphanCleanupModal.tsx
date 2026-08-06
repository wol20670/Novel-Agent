import { useMemo, useState } from 'react';
import type { OrphanAsset, AssetMeta } from '../types';
import { useAssetUrl } from './useAssetUrl';

// AssetMeta['kind'] 는 types.ts 안에서 export 되지 않은 로컬 타입(AssetKind)이라 여기서 다시
// 이름 붙이지 않고 AssetMeta['kind'] 로 참조한다. undefined(메타 없음=협업 캐시)는 '알 수 없음' 그룹.
type Kind = AssetMeta['kind'];

// 그룹 표시 순서 + 라벨 — undefined(알 수 없음)는 배열 밖에 별도로 둔다(키가 string 이어야 Map 에 넣기 쉬움).
const KIND_ORDER: { kind: Kind; label: string; icon: string }[] = [
  { kind: 'background', label: '배경', icon: '🖼' },
  { kind: 'cg', label: 'CG', icon: '🎬' },
  { kind: 'sprite', label: '스프라이트', icon: '🧑‍🎨' },
  { kind: 'bgm', label: 'BGM', icon: '🎵' },
  { kind: 'voice', label: '성우 음성', icon: '🎙' },
  { kind: 'item', label: '아이템', icon: '🎁' },
];
const UNKNOWN_LABEL = '알 수 없음';

/** 바이트 → 사람이 읽는 크기(KB/MB, 소수점 1자리). 코드베이스에 기존 헬퍼가 없어 여기서 로컬로 둔다. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

interface Group {
  key: string; // kind 문자열 또는 '__unknown__'
  label: string;
  icon: string;
  note?: string;
  items: OrphanAsset[];
}

function groupOrphans(orphans: OrphanAsset[]): Group[] {
  const byKind = new Map<string, OrphanAsset[]>();
  for (const o of orphans) {
    const key = o.kind ?? '__unknown__';
    let arr = byKind.get(key);
    if (!arr) {
      arr = [];
      byKind.set(key, arr);
    }
    arr.push(o);
  }
  const groups: Group[] = [];
  for (const { kind, label, icon } of KIND_ORDER) {
    const items = byKind.get(kind);
    if (items && items.length > 0) groups.push({ key: kind, label, icon, items });
  }
  const unknown = byKind.get('__unknown__');
  if (unknown && unknown.length > 0) {
    groups.push({
      key: '__unknown__',
      label: UNKNOWN_LABEL,
      icon: '❓',
      note: '협업으로 내려받은 캐시라 메타 정보가 없어 종류를 알 수 없습니다.',
      items: unknown,
    });
  }
  return groups;
}

/** 목록 행 하나의 썸네일 — 훅(useAssetUrl) 호출을 행 단위로 격리해 리스트 전체 리렌더를 줄인다. */
function OrphanThumb({ id, mime, missing }: { id: string; mime: string; missing?: boolean }) {
  const isImage = !missing && mime.startsWith('image/');
  // missing 이면 id 를 넘기지 않는다 — useAssetUrl 은 로컬에 없으면 협업 Storage 다운로드까지
  // 시도하므로(loadAssetBlob), 곧 지울 파일 때문에 헛 네트워크가 나가고 썸네일은 영원히 로딩 중처럼 보인다.
  const url = useAssetUrl(isImage ? id : undefined);
  if (missing) {
    return (
      <div className="w-10 h-10 rounded border border-edge bg-panel2 shrink-0 flex items-center justify-center text-sm text-gray-500">
        ⚠
      </div>
    );
  }
  if (!isImage) {
    return (
      <div className="w-10 h-10 rounded border border-edge bg-ink shrink-0 flex items-center justify-center text-sm">
        {mime.startsWith('audio/') ? '🎵' : '📄'}
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded border border-edge bg-ink shrink-0 overflow-hidden flex items-center justify-center">
      {url ? <img src={url} className="w-full h-full object-contain" /> : <span className="text-[9px] text-gray-600">…</span>}
    </div>
  );
}

function OrphanRow({
  asset,
  checked,
  onToggle,
}: {
  asset: OrphanAsset;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-panel2/60 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="shrink-0" />
      <OrphanThumb id={asset.id} mime={asset.mime} missing={asset.missing} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200 truncate">{asset.filename || '(이름 없음)'}</p>
        <p className="text-[10px] text-gray-500">
          {asset.missing ? '파일 없음 · 기록만 남음' : formatBytes(asset.size)}
          {asset.createdAt && ` · ${formatDate(asset.createdAt)}`}
        </p>
      </div>
    </label>
  );
}

function GroupSection({
  group,
  selected,
  onToggleOne,
  onToggleAll,
}: {
  group: Group;
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
}) {
  const ids = useMemo(() => group.items.map((o) => o.id), [group.items]);
  const selectedCount = ids.filter((id) => selected.has(id)).length;
  const allSelected = selectedCount === ids.length;
  const groupSize = useMemo(() => group.items.reduce((sum, o) => sum + o.size, 0), [group.items]);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 px-2 py-1 sticky top-0 bg-white/95 backdrop-blur-sm">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = selectedCount > 0 && !allSelected;
          }}
          onChange={() => onToggleAll(ids, !allSelected)}
          className="shrink-0"
        />
        <span className="text-xs font-semibold text-gray-200">
          {group.icon} {group.label}
        </span>
        <span className="text-[10px] text-gray-500">
          {group.items.length}개 · {formatBytes(groupSize)}
        </span>
      </div>
      {group.note && <p className="text-[10px] text-gray-500 px-2 pb-1 leading-snug">{group.note}</p>}
      <div className="flex flex-col">
        {group.items.map((asset) => (
          <OrphanRow key={asset.id} asset={asset} checked={selected.has(asset.id)} onToggle={() => onToggleOne(asset.id)} />
        ))}
      </div>
    </div>
  );
}

/**
 * 어디서도 참조되지 않는 IndexedDB 에셋(고아)을 보여주고 사용자가 골라 지우게 하는 모달.
 * 예전엔 개수만 보여주는 window.confirm 하나로 즉시 하드 삭제했다 — "안 쓰는 이미지가 없는데 고아가
 * 많다고 나온다"는 신고를 받았는데, 실제론 맞는 개수였고 고아 blob 이 앱 어디에도 안 보이는 게
 * 문제였다(에셋 탭은 프로젝트 구조를 순회해 렌더하므로 참조 안 되는 blob 은 애초에 표시 대상이 아님).
 * 그래서 이 모달이 유일하게 그 blob 들을 보여주는 자리다.
 */
export default function OrphanCleanupModal({
  orphans,
  onClose,
  onDelete,
}: {
  orphans: OrphanAsset[];
  onClose: () => void;
  onDelete: (ids: string[]) => void | Promise<void>;
}) {
  // 기본 선택 = 전체 선택(삭제 자체가 목적인 화면이라 대부분 그대로 진행할 것이므로).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(orphans.map((o) => o.id)));
  const [deleting, setDeleting] = useState(false);

  const groups = useMemo(() => groupOrphans(orphans), [orphans]);
  const totalSize = useMemo(() => orphans.reduce((sum, o) => sum + o.size, 0), [orphans]);
  const selectedList = useMemo(() => orphans.filter((o) => selected.has(o.id)), [orphans, selected]);
  const selectedSize = useMemo(() => selectedList.reduce((sum, o) => sum + o.size, 0), [selectedList]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    try {
      await onDelete([...selected]);
      onClose();
    } finally {
      // finally 로 되돌리지 않으면 IndexedDB 삭제가 거부됐을 때 deleting 이 true 로 굳어
      // 삭제·취소 버튼이 둘 다 비활성인 채로 모달이 잠긴다(닫을 방법은 배경 클릭뿐).
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-4 flex flex-col gap-2.5 max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-100">
          참조되지 않는 에셋 · 총 {orphans.length}개 · 합계 {formatBytes(totalSize)}
        </h3>
        <p className="text-[11px] text-gray-500 leading-snug">
          어떤 장면·캐릭터·메뉴에서도 더는 가리키지 않는 파일입니다. 이미지를 다른 파일로 교체했거나, 대본 재분석으로
          이름 연결이 끊겼거나, 협업으로 내려받은 캐시일 때 남습니다. 지울 항목을 고르세요 — 기본은 전체 선택입니다.
        </p>

        <div className="overflow-y-auto flex-1 min-h-0 border border-edge rounded-lg p-1.5">
          {groups.map((g) => (
            <GroupSection key={g.key} group={g} selected={selected} onToggleOne={toggleOne} onToggleAll={toggleAll} />
          ))}
        </div>

        <p className="text-[10px] text-amber-600">되돌릴 수 없습니다.</p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button className="btn-ghost text-xs" onClick={onClose} disabled={deleting}>
            취소
          </button>
          <button className="btn-primary text-xs" onClick={handleDelete} disabled={selected.size === 0 || deleting}>
            {deleting ? '삭제 중…' : `선택한 ${selected.size}개 삭제 (${formatBytes(selectedSize)})`}
          </button>
        </div>
      </div>
    </div>
  );
}
