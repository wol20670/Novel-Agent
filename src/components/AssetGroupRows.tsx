// 에셋 탭의 그룹 카드 4종(배경 / CG / 아이템 / BGM) — AssetsTab.tsx 에서 떼어냈다.
// 그룹 파생 로직은 assetGroups.ts(leaf), 여기는 그 결과를 그리는 렌더 레이어다.

import { useState } from 'react';
import { useStore } from '../store';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import { jumpToScene } from './sceneJump';
import type { CgGroup, Group } from './assetGroups';

function CountBadge({ n }: { n: number }) {
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-edge/60 text-gray-300" title={`${n}개 장면에서 사용`}>
      ×{n}
    </span>
  );
}

/**
 * 배경·BGM 그룹의 "×N" 배지 — 여기서만 **클릭 가능**하다(CG/아이템은 CountBadge 그대로).
 *
 * 이동은 새 로직을 만들지 않고 기존 jumpToScene(sceneJump.ts) 하나를 그대로 부른다:
 * selectScene(id) → setActiveTab('scenes') → rAF 스크롤. 그 시점 장면 탭이 언마운트돼 있어
 * `scene-<id>` DOM 이 없어도 **앞의 상태 전이는 이미 끝나 있고 스크롤만 생략**된다(그 계약에 의존).
 *
 * ⚠️ 접근성: 이름을 title 에 기대지 않는다 — aria-label 을 명시하고(있으면 accessible name 이
 * 그쪽이다) title 은 마우스 툴팁으로만 남긴다. 키보드 동작은 native button/select 그대로 둔다.
 * ⚠️ 다중 선택지 텍스트는 제목이 아니라 sceneLabels(전역 번호 + 제목)다 — 같은 제목의 장면이
 * 여럿일 수 있어 제목만으로는 고를 수 없다(assetGroups.ts 의 sceneLabels 주석).
 */
function SceneUsageBadge({
  label,
  sceneIds,
  sceneLabels,
}: {
  label: string;
  sceneIds: string[];
  sceneLabels: string[];
}) {
  // 선택 직후 '' 로 되돌려 항상 "×N ▾" 플레이스홀더가 보이게 한다(컴포넌트 로컬 — 스토어 아님).
  const [pick, setPick] = useState('');
  const n = sceneIds.length;

  if (n === 1)
    return (
      <button
        type="button"
        aria-label={`${label} — 이 에셋을 쓰는 장면으로 이동`}
        title="클릭하면 이 장면으로 이동합니다"
        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-edge/60 text-gray-300 hover:text-accent hover:bg-edge"
        onClick={() => jumpToScene(sceneIds[0])}
      >
        ×{n}
      </button>
    );

  return (
    <select
      aria-label={`${label} — 이 에셋을 쓰는 장면 선택(${n}개)`}
      title="장면을 골라 이동합니다"
      className="shrink-0 text-[10px] px-1 py-0.5 rounded-full bg-edge/60 text-gray-300 border-0"
      value={pick}
      onChange={(e) => {
        const id = e.target.value;
        setPick('');
        if (id) jumpToScene(id);
      }}
    >
      <option value="">×{n} ▾</option>
      {sceneIds.map((id, i) => (
        <option key={id} value={id}>
          {sceneLabels[i]}
        </option>
      ))}
    </select>
  );
}

export function BgGroupRow({ group }: { group: Group }) {
  const rename = useStore((s) => s.renameBackgroundGroup);
  const importBg = useStore((s) => s.importBackground);
  const clearBg = useStore((s) => s.clearBackgroundGroup);
  const url = useAssetUrl(group.repAssetId);
  const [draft, setDraft] = useState(group.name);
  const rep = group.sceneIds[0];

  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <SceneUsageBadge label={group.name || group.repTitle} sceneIds={group.sceneIds} sceneLabels={group.sceneLabels} />
          <span className="text-[11px] text-gray-500 truncate">예: {group.repTitle}</span>
        </div>
        <input
          className="field"
          value={draft}
          placeholder="배경 이름(라벨) — 같은 이름끼리 공유 (예: 이른 아침의 카페)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== group.name && rename(group.key, draft)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton
          onFile={(f) => importBg(rep, f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost text-[11px]"
          title={`${group.count}개 장면에 적용`}
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearBg(group.key)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/** 아이템(소품) 한 종 — 투명 컷아웃 업로드. 이름 기준 공유(project.itemAssetIds). */
export function ItemGroupRow({ name }: { name: string }) {
  const upload = useStore((s) => s.uploadItem);
  const remove = useStore((s) => s.removeItem);
  const assetId = useStore((s) => s.project.itemAssetIds?.[name]);
  const url = useAssetUrl(assetId);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-16 h-16 rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-contain" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200">🎁 {name}</span>
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton onFile={(f) => upload(name, f)} label={url ? '↥ 교체' : '↥ 업로드'} className="btn-ghost text-[11px]" />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => remove(name)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

export function CgGroupRow({ group }: { group: CgGroup }) {
  const renameCg = useStore((s) => s.renameCgGroup);
  const importCg = useStore((s) => s.importCgGroup);
  const clearCg = useStore((s) => s.clearCgGroup);
  const url = useAssetUrl(group.repAssetId);
  const [draft, setDraft] = useState(group.desc);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <CountBadge n={group.count} />
          <span className="text-[11px] text-gray-500 truncate">예: {group.repTitle}</span>
        </div>
        <input
          className="field text-xs"
          value={draft}
          placeholder="장면 설명 (예: 노을 아래 마주보며 손잡는 장면) — 라벨 겸 ChatGPT 프롬프트 메모"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== group.desc.trim() && renameCg(group.desc, draft)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          title="대본엔 #CG n1 처럼 짧게 적고, 여기서 그 컷의 자세한 설명을 적어두면 ChatGPT 프롬프트 메모로 씁니다."
        />
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-28">
        <UploadButton
          onFile={(f) => importCg(group.desc, f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost text-[11px]"
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearCg(group.desc)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

export function BgmGroupRow({ group }: { group: Group }) {
  const importBgm = useStore((s) => s.importBgm);
  const clearBgm = useStore((s) => s.clearBgmGroup);
  const url = useAssetUrl(group.repAssetId);
  const rep = group.sceneIds[0];

  return (
    <div className="card border-edge p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SceneUsageBadge label={group.name || group.repTitle} sceneIds={group.sceneIds} sceneLabels={group.sceneLabels} />
        <span className="text-xs text-gray-300 flex-1 truncate" title={group.repTitle}>
          {group.name || `(이름 없음 · ${group.repTitle})`}
        </span>
        <UploadButton
          onFile={(f) => importBgm(rep, f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost shrink-0"
          accept="audio/*"
          title={`${group.count}개 장면에 적용`}
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600 shrink-0" onClick={() => clearBgm(group.key)}>
            해제
          </button>
        )}
      </div>
      {url && <audio src={url} controls className="w-full h-8" />}
    </div>
  );
}
