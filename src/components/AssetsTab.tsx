import { useState } from 'react';
import { useStore } from '../store';
import { EXPRESSIONS, type Expression, type Scene } from '../types';
import { backgroundKey, bgmKey, hasBgm } from '../renpy/generate';
import { ALL_MOODS } from '../generators/audio/moods';
import { useAssetUrl } from './useAssetUrl';
import Spinner from './Spinner';
import UploadButton from './UploadButton';

// ── 이름(의미) 기준 그룹화 — 같은 이름 = 하나의 에셋(생성 1회, 모든 장면 공유) ──

interface Group {
  key: string; // 공유 키 (배경/BGM 이름, CG 설명)
  name: string; // 표시 이름(비었으면 이름 없음)
  repTitle: string; // 대표 장면 제목
  sceneIds: string[];
  count: number; // 사용 장면 수
  repAssetId?: string; // 미리보기용 (생성/업로드된 에셋)
}

function groupBy(scenes: Scene[], keyOf: (s: Scene) => string, nameOf: (s: Scene) => string, assetOf: (s: Scene) => string | undefined, include: (s: Scene) => boolean): Group[] {
  const map = new Map<string, Group>();
  for (const s of scenes) {
    if (!include(s)) continue;
    const key = keyOf(s);
    let g = map.get(key);
    if (!g) {
      g = { key, name: nameOf(s), repTitle: s.title, sceneIds: [], count: 0, repAssetId: undefined };
      map.set(key, g);
    }
    g.sceneIds.push(s.id);
    g.count += 1;
    if (!g.name && nameOf(s)) g.name = nameOf(s);
    if (!g.repAssetId && assetOf(s)) g.repAssetId = assetOf(s);
  }
  return [...map.values()];
}

interface CgGroup {
  desc: string;
  count: number;
  repTitle: string;
  repAssetId?: string;
}

function cgGroups(scenes: Scene[]): CgGroup[] {
  const map = new Map<string, CgGroup>();
  for (const s of scenes) {
    s.cg.forEach((desc, i) => {
      const key = desc.trim();
      let g = map.get(key);
      if (!g) {
        g = { desc, count: 0, repTitle: s.title, repAssetId: undefined };
        map.set(key, g);
      }
      g.count += 1;
      const aid = s.cgAssetIds?.[i] || undefined;
      if (!g.repAssetId && aid) g.repAssetId = aid;
    });
  }
  return [...map.values()];
}

export default function AssetsTab() {
  const characters = useStore((s) => s.project.characters);
  const scenes = useStore((s) => s.project.scenes);
  const genAllBg = useStore((s) => s.generateAllBackgrounds);
  const genAllBgm = useStore((s) => s.generateAllBgm);
  const bgBusy = useStore((s) => s.busy['batch:bg']);
  const bgmBusy = useStore((s) => s.busy['batch:bgm']);

  if (scenes.length === 0)
    return <p className="text-gray-500 text-sm text-center mt-16">먼저 스토리를 분석하세요.</p>;

  const bgs = groupBy(scenes, backgroundKey, (s) => s.background ?? '', (s) => s.backgroundAssetId, () => true);
  const cgs = cgGroups(scenes);
  const bgms = groupBy(scenes, bgmKey, (s) => s.bgm ?? '', (s) => s.bgmAssetId, hasBgm);
  const batchBusy = !!(bgBusy || bgmBusy);

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="card border-edge p-3">
        <p className="text-xs text-gray-400 mb-2">
          🗂 <b className="text-gray-200">에셋 라이브러리</b> — 같은 이름의 배경·BGM·CG는 <b>하나로 묶여 한 번만 생성</b>되고
          해당 이름의 모든 장면에 동일하게 적용됩니다(일관성 + 비용 절감). 장면이 많아도 <b>고유 이름 수만큼만</b> 생성됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary text-xs"
            disabled={batchBusy}
            onClick={async () => {
              await genAllBg();
              await genAllBgm();
            }}
            title="아직 안 만든 배경·BGM 을 고유 이름마다 한 번씩 생성"
          >
            {batchBusy ? <Spinner /> : `🚀 미생성 배경·BGM 전부 생성 (배경 ${bgs.length} · BGM ${bgms.length}종)`}
          </button>
        </div>
      </div>

      <section>
        <h3 className="section-title mb-1">🧑‍🎨 캐릭터 스프라이트</h3>
        <p className="text-xs text-gray-500 mb-3">
          표정별 입화를 생성합니다. 키 없으면 Canvas 임시 입화(투명 PNG). 대본에서{' '}
          <code className="text-accent">이름(기쁨): 대사</code> 처럼 적으면 그 표정으로 등장하고, 표정을
          안 적어도 대사 문맥으로 자동 선택됩니다.
        </p>
        <StyleRefRow />
        {characters.length === 0 && <p className="text-gray-600 text-sm">등장 캐릭터 없음</p>}
        <div className="grid grid-cols-2 gap-3">
          {characters.filter((c) => !c.isProtagonist).map((c) => (
            <CharacterCard key={c.name} name={c.name} />
          ))}
        </div>
        <NarrationOnlyRow />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="section-title flex-1">🖼 배경 <span className="text-gray-500 font-normal text-xs">· {bgs.length}종 / 장면 {scenes.length}개</span></h3>
          <button className="btn-ghost text-[11px]" disabled={bgBusy} onClick={() => genAllBg()}>
            {bgBusy ? <Spinner /> : '전체 생성'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          배경 이름이 같으면 한 번만 생성해 모든 장면에 적용됩니다. (이름 없는 배경은 장면별로 분리됩니다 — 재사용하려면 이름을 지정하세요.)
        </p>
        <div className="flex flex-col gap-2">
          {bgs.map((g) => (
            <BgGroupRow key={g.key} group={g} siblings={bgs} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title mb-1">🎬 CG 컷 <span className="text-gray-500 font-normal text-xs">· {cgs.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          대본의 <code className="text-accent">#CG 설명</code> 단위. 같은 설명이면 한 컷으로 공유됩니다. <b>생성</b>(AI, 키 있으면 NovelAI)하거나 외부 제작 이미지를 업로드해 사용합니다(둘 다 없으면 Canvas 임시). 생성한 CG 도 보관 폴더에 자동 저장됩니다.
        </p>
        {cgs.length === 0 ? (
          <p className="text-gray-600 text-sm">CG 컷 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cgs.map((g) => (
              <CgGroupRow key={g.desc} group={g} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="section-title flex-1">🎵 BGM <span className="text-gray-500 font-normal text-xs">· {bgms.length}종</span></h3>
          {bgms.length > 0 && (
            <button className="btn-ghost text-[11px]" disabled={bgmBusy} onClick={() => genAllBgm()}>
              {bgmBusy ? <Spinner /> : '전체 생성'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          BGM 이름이 같으면 한 번만 생성해 모든 장면에 적용됩니다.
        </p>
        {bgms.length === 0 ? (
          <p className="text-gray-600 text-sm">BGM 지정 장면 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {bgms.map((g) => (
              <BgmGroupRow key={g.key} group={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-edge/60 text-gray-300" title={`${n}개 장면에서 사용`}>
      ×{n}
    </span>
  );
}

/** 내레이션·대사 전용(주인공 등) 화자 목록 — 스프라이트를 만들지 않는다. 칩 클릭 시 스프라이트 캐릭터로 전환. */
function NarrationOnlyRow() {
  const narr = useStore((s) => s.project.characters.filter((c) => c.isProtagonist));
  const updateChar = useStore((s) => s.updateCharacter);
  if (narr.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
      <span title="주인공처럼 화면에 안 나오고 대사·내레이션만 하는 화자입니다.">
        🗣 내레이션·대사 전용 (스프라이트 없음):
      </span>
      {narr.map((c) => (
        <button
          key={c.name}
          className="chip border-edge hover:text-accent hover:border-accent"
          onClick={() => updateChar(c.name, { isProtagonist: false })}
          title="클릭하면 스프라이트를 쓰는 캐릭터로 전환합니다."
        >
          {c.name} <span className="text-gray-600">↩ 스프라이트 사용</span>
        </button>
      ))}
    </div>
  );
}

/** 그림체 참조 썸네일 1장(제거 버튼 포함). */
function StyleRefThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useAssetUrl(id);
  return (
    <div className="relative w-12 h-16 rounded border border-edge bg-ink overflow-hidden shrink-0">
      {url ? (
        <img src={url} className="w-full h-full object-cover" />
      ) : (
        <span className="flex items-center justify-center h-full text-[9px] text-gray-600">…</span>
      )}
      <button
        className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-black/60 text-rose-300 text-[11px] leading-none hover:text-rose-500"
        onClick={onRemove}
        title="이 참조 제거"
      >
        ×
      </button>
    </div>
  );
}

/** 전 캐릭터 공통 "그림체 참조" 이미지 업로드(여러 장) — 기본 입화 생성 시 화풍만 참고(vibe transfer). */
function StyleRefRow() {
  const ids = useStore((s) => s.project.styleRefAssetIds) ?? [];
  const addStyleRef = useStore((s) => s.addStyleRef);
  const removeStyleRef = useStore((s) => s.removeStyleRef);
  const clearStyleRefs = useStore((s) => s.clearStyleRefs);
  return (
    <div className="card border-edge p-2.5 mb-3 flex items-start gap-3">
      <div className="flex gap-1 flex-wrap shrink-0 max-w-[38%]">
        {ids.length ? (
          ids.map((id) => <StyleRefThumb key={id} id={id} onRemove={() => removeStyleRef(id)} />)
        ) : (
          <div className="w-12 h-16 rounded border border-edge bg-ink flex items-center justify-center text-[9px] text-gray-600">
            없음
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-300 font-semibold">🎨 그림체 참조 (선택 · 여러 장 · 전 캐릭터 공통)</p>
        <p className="text-[10px] text-gray-500 leading-snug">
          마음에 드는 캐릭터 그림을 <b className="text-gray-400">여러 장</b> 올리면 <b className="text-gray-400">기본 입화</b> 생성 시 그{' '}
          <b className="text-gray-400">화풍·채색만</b> 참고합니다(NovelAI vibe transfer · 인물은 외형 설명대로 새로). 장수가 많을수록
          화풍 반영이 정확해집니다. 링크 불가 — 이미지 파일을 올리세요.
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <UploadButton
          onFile={(f) => addStyleRef(f)}
          label="↥ 추가"
          className="btn-ghost text-[11px]"
          title="그림체 참조 이미지 추가"
        />
        {ids.length > 0 && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearStyleRefs()}>
            모두 해제
          </button>
        )}
      </div>
    </div>
  );
}

function CharacterCard({ name }: { name: string }) {
  const c = useStore((s) => s.project.characters.find((x) => x.name === name))!;
  const updateChar = useStore((s) => s.updateCharacter);
  const genAll = useStore((s) => s.generateCharacterSprites);
  const genBase = useStore((s) => s.generateCharacterBase);
  const genOne = useStore((s) => s.generateCharacterSprite);
  const refineSprite = useStore((s) => s.refineSprite);
  const refineDesign = useStore((s) => s.refineCharacterDesign);
  const importSprite = useStore((s) => s.importSprite);
  const clearAll = useStore((s) => s.clearCharacterSprites);
  const busy = useStore((s) => s.busy[`sprite:${name}`]);
  const hasAny = EXPRESSIONS.some((ex) => c.expressions[ex as Expression]);
  const hasBase = !!c.expressions['기본'];

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
        {busy ? (
          <span className="!px-2 !py-1"><Spinner /></span>
        ) : hasBase ? (
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => genAll(name)} title="6종 표정을 한 번에(기본 기준)">
            전체 생성
          </button>
        ) : (
          <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => genBase(name)} title="기본(메인) 입화 1장만 먼저 생성">
            ① 기본 입화 생성
          </button>
        )}
      </div>
      <input
        className="field text-xs mb-1.5"
        placeholder="외형 (예: 갈색 단발, 교복, 푸른 눈) — 같은 인물 유지용"
        value={c.appearance ?? ''}
        onChange={(e) => updateChar(name, { appearance: e.target.value })}
        title="GPT 이미지 생성 시 표정에 공통 적용해 같은 인물로 보이게 합니다."
      />
      <input
        className="field text-xs mb-1.5"
        placeholder="성격·역할 (예: 밝고 장난기 많은 카페 알바, 17세) — 분위기 참고"
        value={c.personality ?? ''}
        onChange={(e) => updateChar(name, { personality: e.target.value })}
        title="그림의 분위기·표정·포즈에 참고로 반영합니다. (생성 전에 적으면 더 디테일해집니다.)"
      />
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] text-gray-500 leading-snug flex-1">
          {hasBase
            ? '표정 썸네일 = 기본 기준으로 그 표정만 생성(토큰 절약). 썸네일 ✏️ = 그 표정만 수정.'
            : '① 기본 입화를 먼저 만들고 → 표정 썸네일을 하나씩 눌러 생성하세요(기본 기준 + 토큰 절약).'}
        </p>
        {hasBase && (
          <button
            className="btn-ghost !px-2 !py-1 text-[10px] shrink-0"
            disabled={!!busy}
            title="기본 입화의 디자인(머리·의상 등)을 수정하고, 이미 만든 표정도 새 기준으로 다시 그려 맞춥니다."
            onClick={() => {
              const ins = window.prompt(
                `${name}의 디자인을 어떻게 바꿀까요? (예: 머리를 단발로, 안경을 씌워, 의상을 후드티로)\n※ 기본 입화를 수정하고 이미 만든 표정도 새 디자인으로 다시 그립니다.`,
              );
              if (ins && ins.trim()) refineDesign(name, ins.trim());
            }}
          >
            🎨 디자인 수정
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {EXPRESSIONS.map((ex) => (
          <ExpressionThumb
            key={ex}
            name={name}
            expr={ex as Expression}
            busy={!!busy}
            onGen={() => genOne(name, ex as Expression)}
            onUpload={(f) => importSprite(name, ex as Expression, f)}
            onRefine={() => {
              const ins = window.prompt(`이 '${ex}' 입화를 어떻게 수정할까요? (예: 머리를 더 짧게, 표정을 더 환하게)`);
              if (ins && ins.trim()) refineSprite(name, ex as Expression, ins.trim());
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        {hasAny && (
          <button className="text-[11px] text-gray-500 hover:text-rose-600" onClick={() => clearAll(name)}>
            스프라이트 비우기
          </button>
        )}
        <button
          className="text-[11px] text-gray-500 hover:text-amber-600 ml-auto"
          onClick={() => updateChar(name, { isProtagonist: true })}
          title="주인공처럼 화면에 세우지 않고 대사·내레이션만 하게 합니다."
        >
          내레이션 전용으로
        </button>
      </div>
    </div>
  );
}

function ExpressionThumb({
  name,
  expr,
  busy,
  onGen,
  onUpload,
  onRefine,
}: {
  name: string;
  expr: Expression;
  busy: boolean;
  onGen: () => void;
  onUpload: (file: File) => void;
  onRefine: () => void;
}) {
  const assetId = useStore((s) => s.project.characters.find((x) => x.name === name)?.expressions[expr]);
  const url = useAssetUrl(assetId);
  return (
    <div className="relative aspect-[3/4] rounded-lg border border-edge bg-ink overflow-hidden group">
      <button
        onClick={onGen}
        disabled={busy}
        title={`${expr} ${url ? '재생성' : '생성'}`}
        className="w-full h-full flex items-center justify-center"
      >
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] text-gray-500">{expr}</span>
        )}
      </button>
      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {url && (
          <button
            onClick={onRefine}
            disabled={busy}
            className="bg-black/55 text-white text-[10px] rounded px-1 py-0.5 hover:bg-black/75"
            title={`${expr} 입화를 지시문대로 미세 수정`}
          >
            ✏️
          </button>
        )}
        <UploadButton
          onFile={onUpload}
          label="↥"
          className="bg-black/55 text-white text-[10px] rounded px-1 py-0.5 hover:bg-black/75"
          title={`${expr} 입화 직접 업로드`}
        />
      </div>
      <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9px] py-0.5 text-center pointer-events-none">
        {expr}
      </span>
    </div>
  );
}

function BgGroupRow({ group, siblings }: { group: Group; siblings: Group[] }) {
  const rename = useStore((s) => s.renameBackgroundGroup);
  const genBg = useStore((s) => s.generateBackground);
  const genFromRef = useStore((s) => s.generateBackgroundFromRef);
  const setBgPrompt = useStore((s) => s.setBackgroundPrompt);
  const importBg = useStore((s) => s.importBackground);
  const busy = useStore((s) => group.sceneIds.some((id) => s.busy[`${id}:bg`]));
  const savedPrompt = useStore((s) => s.project.backgroundPrompts?.[group.key] ?? '');
  const url = useAssetUrl(group.repAssetId);
  const [draft, setDraft] = useState(group.name);
  const [promptDraft, setPromptDraft] = useState(savedPrompt);
  const [refKey, setRefKey] = useState('');
  const rep = group.sceneIds[0];
  // 이미 생성된 다른 배경만 기준(참조)으로 쓸 수 있다.
  const refOptions = siblings.filter((s) => s.key !== group.key && s.repAssetId);

  return (
    <div className="card border-edge p-3 flex flex-col gap-2">
      <div className="flex gap-3 items-center">
        <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
          {url ? <img src={url} className="w-full h-full object-cover" /> : '미생성'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <CountBadge n={group.count} />
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
        <div className="flex flex-col gap-1 shrink-0">
          <button className="btn-ghost" disabled={busy} onClick={() => genBg(rep)} title={`상세 프롬프트(없으면 이름)로 생성 — ${group.count}개 장면에 적용`}>
            {busy ? <Spinner /> : url ? '재생성' : '생성'}
          </button>
          <UploadButton onFile={(f) => importBg(rep, f)} label="↥ 업로드" className="btn-ghost text-[11px]" />
        </div>
      </div>
      <textarea
        className="field text-xs h-12 resize-y"
        value={promptDraft}
        placeholder="상세 프롬프트 (예: 통유리로 아침 햇살이 드는 아늑한 카페 내부, 원목 가구, 식물, 김 나는 커피) — 적으면 이름 대신 이걸로 생성"
        onChange={(e) => setPromptDraft(e.target.value)}
        onBlur={() => promptDraft !== savedPrompt && setBgPrompt(group.key, promptDraft)}
        title="배경 이름은 라벨로 두고, 여기에 자세히 적으면 그 텍스트로 생성됩니다."
      />
      {refOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 shrink-0">기준 배경:</span>
          <select
            className="field text-[11px] !py-1 flex-1 min-w-0"
            value={refKey}
            onChange={(e) => setRefKey(e.target.value)}
            title="이미 만든 다른 배경을 소스로, 같은 장소·화풍을 유지하며 이 배경을 생성(시간대·조명만 변경)"
          >
            <option value="">참조 안 함 (새로 생성)</option>
            {refOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name || o.repTitle}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost text-[11px] shrink-0"
            disabled={busy || !refKey}
            onClick={() => refKey && genFromRef(rep, refKey)}
            title="선택한 기준 배경을 소스로 일관된 배경 생성"
          >
            🪄 기준으로 생성
          </button>
        </div>
      )}
    </div>
  );
}

function CgGroupRow({ group }: { group: CgGroup }) {
  const genCg = useStore((s) => s.generateCg);
  const genCgWithChar = useStore((s) => s.generateCgWithCharacter);
  const refineCg = useStore((s) => s.refineCg);
  const renameCg = useStore((s) => s.renameCgGroup);
  const importCg = useStore((s) => s.importCgGroup);
  const clearCg = useStore((s) => s.clearCgGroup);
  const busy = useStore((s) => s.busy[`cg:${group.desc.trim()}`]);
  const url = useAssetUrl(group.repAssetId);
  // 기본 입화가 있는 캐릭터만 참조 소스로 쓸 수 있다.
  const refChars = useStore((s) => s.project.characters.filter((c) => c.expressions['기본']));
  const [refChar, setRefChar] = useState('');
  const [draft, setDraft] = useState(group.desc);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '임시'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <CountBadge n={group.count} />
          <span className="text-[11px] text-gray-500 truncate">예: {group.repTitle}</span>
        </div>
        <input
          className="field text-xs"
          value={draft}
          placeholder="장면 설명/프롬프트 (예: 노을 아래 마주보며 손잡는 장면) — 생성에 그대로 쓰임"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== group.desc.trim() && renameCg(group.desc, draft)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          title="대본엔 #CG n1 처럼 짧게 적고, 여기서 그 컷의 자세한 장면을 적으면 생성 프롬프트로 쓰입니다."
        />
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-32">
        <button
          className="btn-ghost text-[11px]"
          disabled={busy}
          onClick={() => genCg(group.desc)}
          title={`텍스트만으로 생성 — ${group.count}개 장면에 적용`}
        >
          {busy ? <Spinner /> : url ? '재생성' : '생성'}
        </button>
        {refChars.length > 0 && (
          <div className="flex gap-1">
            <select
              className="field text-[10px] !py-0.5 flex-1 min-w-0"
              value={refChar}
              onChange={(e) => setRefChar(e.target.value)}
              title="이 캐릭터의 기본 입화(+장면 배경)를 소스로 닮은 CG 생성"
            >
              <option value="">참조 인물…</option>
              {refChars.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost text-[11px] shrink-0"
              disabled={busy || !refChar}
              onClick={() => refChar && genCgWithChar(group.desc, refChar)}
              title="선택한 캐릭터의 기본 입화 + 장면 배경을 소스로 CG 생성(가장 닮게)"
            >
              🎭
            </button>
          </div>
        )}
        {url && (
          <button
            className="btn-ghost text-[11px]"
            disabled={busy}
            title="이 CG 를 지시문대로 미세 수정"
            onClick={() => {
              const ins = window.prompt('이 CG 를 어떻게 수정할까요? (예: 두 사람을 더 가깝게, 노을 분위기로)');
              if (ins && ins.trim()) refineCg(group.desc, ins.trim());
            }}
          >
            ✏️ 수정
          </button>
        )}
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

function BgmGroupRow({ group }: { group: Group }) {
  const genBgm = useStore((s) => s.generateBgm);
  const busy = useStore((s) => group.sceneIds.some((id) => s.busy[`${id}:bgm`]));
  const url = useAssetUrl(group.repAssetId);
  const [mood, setMood] = useState('');
  const [volume, setVolume] = useState(0.8);
  const [bpm, setBpm] = useState(0);
  const rep = group.sceneIds[0];

  return (
    <div className="card border-edge p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CountBadge n={group.count} />
        <span className="text-xs text-gray-300 flex-1 truncate" title={group.repTitle}>
          {group.name || `(이름 없음 · ${group.repTitle})`}
        </span>
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
          onClick={() => genBgm(rep, { moodKey: mood || undefined, volume, bpm: bpm || undefined })}
          title={`${group.count}개 장면에 적용`}
        >
          {busy ? <Spinner /> : url ? '재생성' : '생성'}
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
