import { useMemo, useState } from 'react';
import { useStore } from '../store';
import {
  effectiveExpressions,
  effectiveTextLocales,
  baseLocaleOf,
  LOCALE_LABEL,
  emojiFor,
  characterOutfits,
  isTypecastVoiceId,
  type Expression,
  type Locale,
  type Scene,
} from '../types';
import { backgroundKey, bgmKey, hasBgm } from '../renpy/generate';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import Spinner from './Spinner';
import VoiceLab from './VoiceLab';
import VoiceReview from './VoiceReview';

// ── 이름(의미) 기준 그룹화 — 같은 이름 = 하나의 에셋(업로드 1회, 모든 장면 공유) ──

interface Group {
  key: string; // 공유 키 (배경/BGM 이름, CG 설명)
  name: string; // 표시 이름(비었으면 이름 없음)
  repTitle: string; // 대표 장면 제목
  sceneIds: string[];
  count: number; // 사용 장면 수
  repAssetId?: string; // 미리보기용 (업로드된 에셋)
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
  const project = useStore((s) => s.project);
  const characters = project.characters;
  const scenes = project.scenes;

  // scenes 전체를 4회 순회하는 그룹핑 — 렌더마다가 아니라 scenes 가 실제로 바뀔 때만 재계산.
  // (early return 보다 먼저 둬야 함: Hook 은 조건부 return 위에서 항상 같은 순서로 호출돼야 한다.)
  const bgs = useMemo(
    () => groupBy(scenes, backgroundKey, (s) => s.background ?? '', (s) => s.backgroundAssetId, () => true),
    [scenes],
  );
  const cgs = useMemo(() => cgGroups(scenes), [scenes]);
  const bgms = useMemo(() => groupBy(scenes, bgmKey, (s) => s.bgm ?? '', (s) => s.bgmAssetId, hasBgm), [scenes]);
  const items = useMemo(() => itemNames(scenes), [scenes]);
  // effectiveTextLocales 는 전체 장면·라인을 훑는다 — 예전엔 캐릭터 카드마다(카드 수만큼) 반복
  // 호출했는데, 여기서 한 번만 계산해 CharacterCard 에 내려준다.
  const nameLocales = useMemo(() => {
    const base = baseLocaleOf(project);
    return effectiveTextLocales(project).filter((l) => l !== base);
  }, [project]);

  if (scenes.length === 0)
    return <p className="text-gray-500 text-sm text-center mt-16">먼저 스토리를 분석하세요.</p>;

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="card border-edge p-3">
        <p className="text-xs text-gray-400">
          🗂 <b className="text-gray-200">에셋 라이브러리</b> — ChatGPT/Suno 등 외부 도구에서 만든 이미지·음악을 여기에{' '}
          <b>업로드</b>합니다. 같은 이름의 배경·BGM·CG는 <b>하나로 묶여 한 번만 업로드</b>하면 해당 이름의 모든
          장면에 동일하게 적용됩니다.
        </p>
      </div>

      <section>
        <h3 className="section-title mb-1">🧑‍🎨 캐릭터 스프라이트</h3>
        <p className="text-xs text-gray-500 mb-3">
          표정별 입화를 업로드합니다(투명 배경 PNG 권장). 대본에서{' '}
          <code className="text-accent">이름(기쁨): 대사</code> 처럼 적으면 그 표정으로 등장하고, 표정을
          안 적어도 대사 문맥으로 자동 선택됩니다. 업로드 전엔 임시 실루엣으로 미리보기가 채워집니다.
        </p>
        <ExpressionEditor />
        {characters.length === 0 && <p className="text-gray-600 text-sm">등장 캐릭터 없음</p>}
        <div className="grid grid-cols-2 gap-3">
          {characters.filter((c) => !c.isProtagonist).map((c) => (
            <CharacterCard key={c.name} name={c.name} nameLocales={nameLocales} />
          ))}
        </div>
        <NarrationOnlyRow />
      </section>

      <VoiceSection />

      <section>
        <h3 className="section-title mb-1">🖼 배경 <span className="text-gray-500 font-normal text-xs">· {bgs.length}종 / 장면 {scenes.length}개</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          배경 이름이 같으면 한 번만 업로드해 모든 장면에 적용됩니다. (이름 없는 배경은 장면별로 분리됩니다 — 재사용하려면 이름을 지정하세요.)
        </p>
        <div className="flex flex-col gap-2">
          {bgs.map((g) => (
            <BgGroupRow key={g.key} group={g} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title mb-1">🎬 CG 컷 <span className="text-gray-500 font-normal text-xs">· {cgs.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          대본의 <code className="text-accent">#CG 설명</code> 단위. 같은 설명이면 한 컷으로 공유됩니다. ChatGPT 등에서
          만든 이미지를 업로드하세요(업로드 전엔 임시 자리표시).
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
        <h3 className="section-title mb-1">🎁 아이템(소품) <span className="text-gray-500 font-normal text-xs">· {items.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          대본의 <code className="text-accent">#아이템 이름</code> 단위. 같은 이름이면 한 이미지로 공유됩니다. 배경 없는{' '}
          <b>투명 컷아웃</b>을 업로드하면, 인게임에서 <b>라이트박스 팝업</b> + <b>"발견한 아이템" 보관함</b>에 쓰입니다.
        </p>
        {items.length === 0 ? (
          <p className="text-gray-600 text-sm">아이템 없음 — 대본 B열에 <code className="text-accent">#아이템 편지</code> 처럼 넣어보세요.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((n) => (
              <ItemGroupRow key={n} name={n} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title mb-1">🎵 BGM <span className="text-gray-500 font-normal text-xs">· {bgms.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          BGM 이름이 같으면 한 번만 업로드해 모든 장면에 적용됩니다. Suno 등에서 만든 mp3 를 올리세요.
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

      <CleanupSection />
    </div>
  );
}

/** 어디서도 참조되지 않는 IndexedDB 에셋 blob 을 정리 — 확인·토스트는 액션 안에서 처리. */
function CleanupSection() {
  const cleanupOrphanAssets = useStore((s) => s.cleanupOrphanAssets);
  return (
    <section>
      <h3 className="section-title mb-1">🧹 저장소 정리</h3>
      <p className="text-xs text-gray-500 mb-3">
        옛 업로드를 다른 파일로 교체하거나 캐릭터·장면을 지우면, 더는 어디서도 쓰이지 않는 파일이 브라우저 저장소에
        남을 수 있습니다. 지금은 아무 데도 연결되지 않은 파일만 찾아 지웁니다.
      </p>
      <button className="btn-ghost text-[11px] text-gray-400 hover:text-rose-500" onClick={() => void cleanupOrphanAssets()}>
        참조되지 않는 에셋 정리
      </button>
    </section>
  );
}

/**
 * 🎙 성우(TTS) 비용·검수 — 캐릭터별 카드가 아니라 프로젝트 전체를 다루는 액션 모음.
 *  - 💡 비용 계산: 글자수 기반 즉시 계산(1글자=1크레딧, API 호출 0회) — 키가 없어도 동작한다.
 *  - 전체 캐릭터 일괄 생성: 프리셋이 저장된 모든 캐릭터를 순차 생성(캐릭터마다 확인창이 다시
 *    뜨지 않게 한 번만 확인).
 *  - 🎧 검수 시작: 생성된 음성을 이어 들으며 검수(VoiceReview).
 */
function VoiceSection() {
  const project = useStore((s) => s.project);
  const typecastKey = useStore((s) => s.typecastKey);
  const voiceEstimate = useStore((s) => s.voiceEstimate);
  const batchAllBusy = useStore((s) => !!s.busy['batch:voice:all']);
  const estimateVoiceCost = useStore((s) => s.estimateVoiceCost);
  const batchVoiceAll = useStore((s) => s.batchVoiceAll);
  const base = baseLocaleOf(project);
  const [reviewOpen, setReviewOpen] = useState(false);

  // 캐릭터 수·대사 수에 비례하는 스캔 — VoiceSection 은 busy/voiceEstimate 변화로도 리렌더되므로
  // (배치 생성 중 매우 잦음) project.characters/scenes 가 실제로 안 바뀌면 재계산하지 않는다.
  const hasAnyPreset = useMemo(() => project.characters.some((c) => c.voice), [project.characters]);
  const hasAnyVoiced = useMemo(
    () => project.scenes.some((sc) => sc.lines.some((l) => l.kind === 'dialogue' && l.voiceAssetIds?.[base])),
    [project.scenes, base],
  );

  return (
    <section>
      <h3 className="section-title mb-1">🎙 성우(TTS) 비용·검수</h3>
      <p className="text-xs text-gray-500 mb-3">
        생성 전 글자수 기반 즉시 견적(1자=1크레딧, 키 불필요)으로 정확한 크레딧을 확인하고, 생성 후엔
        이어듣기로 검수하세요.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          className="btn-ghost text-xs"
          disabled={!hasAnyPreset}
          onClick={estimateVoiceCost}
          title="글자수 합계로 예상 크레딧을 즉시 계산합니다(1자=1크레딧, 정확값 — 키가 없어도 동작)"
        >
          💡 비용 계산
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={!typecastKey || !hasAnyPreset || batchAllBusy}
          onClick={() => void batchVoiceAll(base)}
          title="보이스 프리셋이 저장된 모든 캐릭터의 남은 대사를 순차 생성합니다"
        >
          {batchAllBusy ? <Spinner /> : '🎙 전체 캐릭터 일괄 생성'}
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={!hasAnyVoiced}
          onClick={() => setReviewOpen(true)}
          title="생성된 음성을 이어서 들으며 검수합니다"
        >
          🎧 검수 시작
        </button>
      </div>
      {voiceEstimate && (
        <p className="text-[11px] text-gray-400">
          정확히 {voiceEstimate.totalCredits}크레딧 · 약 {Math.round(voiceEstimate.totalSeconds)}초 ·{' '}
          {voiceEstimate.totalLines}줄
          {voiceEstimate.noPreset.length > 0 && ` · 프리셋 없음: ${voiceEstimate.noPreset.join(', ')}`}
          {voiceEstimate.overLimit.length > 0 && (
            <span className="text-amber-600"> · 2000자 초과 {voiceEstimate.overLimit.length}줄(생성 실패 가능)</span>
          )}
        </p>
      )}
      {reviewOpen && <VoiceReview onClose={() => setReviewOpen(false)} />}
    </section>
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
  // 셀렉터는 안정 ref(characters 배열)만 반환하고 filter 는 렌더에서 — 매 스토어 변경 리렌더 방지.
  const narr = useStore((s) => s.project.characters).filter((c) => c.isProtagonist);
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

/** 표정 칩 — 클릭하면 이름 편집(엔터 확정 / Esc 취소). '기본'은 고정. */
function ExpressionChip({
  name,
  onRename,
  onRemove,
}: {
  name: string;
  onRename: (next: string) => void;
  onRemove: () => void;
}) {
  const fixed = name === '기본';
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  if (editing && !fixed) {
    const commit = () => {
      setEditing(false);
      const next = val.trim();
      if (next && next !== name) onRename(next);
      else setVal(name);
    };
    return (
      <input
        autoFocus
        className="field text-xs w-24 py-0.5"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setEditing(false);
            setVal(name);
          }
        }}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-xs ${
        fixed ? 'bg-ink/60 text-gray-400' : 'bg-ink'
      }`}
    >
      <span>{emojiFor(name)}</span>
      <button
        className="hover:text-accent disabled:cursor-default"
        disabled={fixed}
        onClick={() => {
          setVal(name);
          setEditing(true);
        }}
        title={fixed ? '기본 표정은 고정' : '이름 변경'}
      >
        {name}
      </button>
      {!fixed && (
        <button className="text-gray-600 hover:text-rose-500 leading-none" onClick={onRemove} title="이 표정 삭제">
          ×
        </button>
      )}
    </span>
  );
}

/** 표정 세트 편집 — 추가/이름변경/삭제('기본'은 고정). 전 캐릭터 공통. */
function ExpressionEditor() {
  const exprs = effectiveExpressions(useStore((s) => s.project.expressions));
  const addExpression = useStore((s) => s.addExpression);
  const renameExpression = useStore((s) => s.renameExpression);
  const removeExpression = useStore((s) => s.removeExpression);
  const [adding, setAdding] = useState('');
  const submit = () => {
    if (adding.trim()) {
      addExpression(adding.trim());
      setAdding('');
    }
  };
  return (
    <div className="card border-edge p-2.5 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-gray-300 font-semibold">😀 표정 세트 · {exprs.length}종</p>
        <span className="text-[10px] text-gray-500">이름을 바꾸거나 칸을 늘릴 수 있어요 · '기본'은 고정</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {exprs.map((ex) => (
          <ExpressionChip
            key={ex}
            name={ex}
            onRename={(next) => renameExpression(ex, next)}
            onRemove={() => {
              if (
                window.confirm(
                  `'${ex}' 표정을 삭제할까요?\n이 표정으로 업로드한 모든 캐릭터 입화도 함께 삭제됩니다.`,
                )
              )
                removeExpression(ex);
            }}
          />
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        <input
          className="field text-xs flex-1"
          placeholder="새 표정 이름 (예: 당황, 황당, 윙크) — 엔터로 추가"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button className="btn-ghost text-[11px]" disabled={!adding.trim()} onClick={submit}>
          ＋ 추가
        </button>
      </div>
    </div>
  );
}

function CharacterCard({ name, nameLocales }: { name: string; nameLocales: Locale[] }) {
  const c = useStore((s) => s.project.characters.find((x) => x.name === name))!;
  const updateChar = useStore((s) => s.updateCharacter);
  const importSprite = useStore((s) => s.importSprite);
  const clearAll = useStore((s) => s.clearCharacterSprites);
  const addOutfit = useStore((s) => s.addOutfit);
  const removeOutfit = useStore((s) => s.removeOutfit);
  const addOutfitRule = useStore((s) => s.addOutfitRule);
  const removeOutfitRule = useStore((s) => s.removeOutfitRule);
  const setI18nName = useStore((s) => s.setCharacterI18nName);
  const batchVoiceCharacter = useStore((s) => s.batchVoiceCharacter);
  const voiceBatchBusy = useStore((s) => !!s.busy[`batch:voice:${name}`]);
  const exprList = effectiveExpressions(useStore((s) => s.project.expressions));
  // 이름표 번역칸은 자막 언어가(원문 외에) 실제로 켜져 있을 때만 보인다 — 꺼져 있으면 내보내기에
  // 반영될 곳이 없어 입력칸만 있어도 혼란스럽다(자동 번역 켜면 자연히 나타남).
  // nameLocales 는 부모(AssetsTab)가 한 번만 계산해 내려준다(effectiveTextLocales 가 전체 장면을 훑음).
  const project = useStore((s) => s.project);

  // 현재 편집 중인 의상(기본/추가 의상). 업로드·썸네일이 모두 이 의상을 대상으로 한다.
  const [outfit, setOutfit] = useState('기본');
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [ruleKw, setRuleKw] = useState('');
  const outfits = characterOutfits(c);
  const activeOutfit = outfit === '기본' ? undefined : c.outfits?.find((o) => o.name === outfit);
  const exprStore: Partial<Record<string, string>> = outfit === '기본' ? c.expressions : activeOutfit?.expressions ?? {};
  const hasAny = exprList.some((ex) => exprStore[ex]);
  // 이름이 바뀐 뒤 사라진 의상을 가리키면 기본으로 복귀.
  if (outfit !== '기본' && !activeOutfit) setOutfit('기본');

  // 이 (캐릭터, 의상)에 걸린 배경 키워드 규칙 — project.outfitRules 는 프로젝트 전체 배열이라
  // 표시는 필터링하되, 삭제/이동은 항상 그 안의 진짜 index 를 써야 한다(필터링된 위치와 다름).
  const allRules = project.outfitRules ?? [];
  const myRuleIdxs = useMemo(
    () => allRules.reduce<number[]>((acc, r, i) => {
      if (r.charName === name && r.outfit === outfit) acc.push(i);
      return acc;
    }, []),
    [allRules, name, outfit],
  );
  // 키워드별 적용 장면 수(배경 이름에 그 키워드가 포함된 장면) — 반복마다 다시 훑지 않도록 캐싱.
  const ruleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of myRuleIdxs) {
      const kw = allRules[idx].keyword;
      if (!map.has(kw)) map.set(kw, project.scenes.filter((sc) => (sc.background ?? '').includes(kw)).length);
    }
    return map;
  }, [myRuleIdxs, allRules, project.scenes]);

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
        <UploadButton
          onFile={(f) => importSprite(name, '기본' as Expression, f, outfit)}
          label="🖼 기본 입화 업로드"
          className="btn-primary !px-2 !py-1 text-xs shrink-0"
          title={`${outfit === '기본' ? '' : outfit + ' '}기본 입화 이미지 업로드`}
        />
      </div>
      {/* 좌우 고정 위치 — 헤더 줄에 같이 두면 select 폭 때문에 카드 밖으로 버튼이 밀려나가서
          별도 줄로 뺌(다른 설정 줄들과 같은 레이아웃). */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">📍 위치</span>
        <select
          className="field text-xs"
          value={c.side ?? 'auto'}
          onChange={(e) => updateChar(name, { side: e.target.value as 'left' | 'right' | 'auto' })}
          title="장면 내 좌우 고정 위치(등장 순서와 무관, 혼자 등장하면 항상 중앙)"
        >
          <option value="auto">자동(등장순)</option>
          <option value="left">왼쪽 고정</option>
          <option value="right">오른쪽 고정</option>
        </select>
      </div>
      {/* 보이스 설정 — VoiceLab 을 캐릭터 모드로 열어 대사와 무관하게 보이스 프리셋만 고른다.
          미리듣기는 오디션 캐시를 거치므로 같은 설정을 여러 번 눌러 들어봐도 크레딧이 안 든다. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">🎤 보이스</span>
        <button className="btn-ghost text-xs" onClick={() => setVoiceSettingsOpen((v) => !v)}>
          목소리 설정
        </button>
        {c.voice ? (
          isTypecastVoiceId(c.voice.voiceId) ? (
            <span className="chip border-edge text-gray-400" title={`voice_id: ${c.voice.voiceId}`}>
              🎤 {c.voice.voiceName ?? c.voice.voiceId} ·{' '}
              {c.voice.emotion && c.voice.emotion !== 'smart' ? c.voice.emotion : '스마트'}
            </span>
          ) : (
            <span
              className="chip border-amber-500/50 text-amber-600"
              title={`voice_id: ${c.voice.voiceId} — 이전 TTS 서비스 프리셋은 그대로 못 씁니다`}
            >
              ⚠️ 재설정 필요(Typecast)
            </span>
          )
        ) : (
          <span className="chip border-amber-500/50 text-amber-600">미설정</span>
        )}
      </div>
      {/* 예전엔 여기 카드 인라인으로 펼쳐져 필터·추천 UI 가 늘면서 카드가 넘쳤다 — 오버레이 모달로
          전환(LeftPanel 의 AnalyzeMergeModal 관용구 재사용: fixed inset-0 z-[60] + 배경 클릭 닫기). */}
      {voiceSettingsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setVoiceSettingsOpen(false)}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <VoiceLab
              char={c}
              baseLocale={baseLocaleOf(project)}
              mode="character"
              onClose={() => setVoiceSettingsOpen(false)}
            />
          </div>
        </div>
      )}
      {/* 보이스 일괄 생성 — VoiceLab 에서 저장해둔 프리셋(c.voice)으로 이 캐릭터의 모든 대사를
          순차 생성·적용(이미 있는 언어 음성은 건너뜀). 대본이 수백 줄이어도 하나하나 안 해도 됨 —
          마음에 안 드는 특정 줄은 그 대사의 VoiceLab 에서 개별로 다시 만지면 된다. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">🎙 일괄</span>
        <button
          className="btn-ghost text-xs"
          disabled={!c.voice || voiceBatchBusy}
          onClick={() => batchVoiceCharacter(name, baseLocaleOf(project))}
          title={
            c.voice
              ? `${name} 이 말하는 모든 대사 중 아직 음성 없는 줄을 저장된 보이스 프리셋으로 일괄 생성`
              : '먼저 🎤 목소리 설정에서 보이스를 고르고 "💾 저장 후 닫기"를 누르세요'
          }
        >
          {voiceBatchBusy ? <Spinner /> : '전체 대사 일괄 생성'}
        </button>
      </div>
      {/* 이름표 번역 — 자막 언어를 바꿨을 때 보일 이름. 비우면 원문(대본 그대로) 표시. */}
      {nameLocales.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-gray-500 mr-0.5">🌐 이름표</span>
          {nameLocales.map((loc) => (
            <input
              key={loc}
              className="field text-xs flex-1 min-w-[90px]"
              placeholder={`${LOCALE_LABEL[loc]} 이름 (예: Hanjisu)`}
              value={c.i18nName?.[loc] ?? ''}
              onChange={(e) => setI18nName(name, loc, e.target.value)}
              title={`자막을 ${LOCALE_LABEL[loc]}로 바꿨을 때 표시할 이름표. 비우면 원문("${name}") 그대로 표시됩니다.`}
            />
          ))}
        </div>
      )}

      {/* 의상(복장) 탭 — 대본 #복장 캐릭터:의상 으로 장면별 지정. 의상마다 표정 세트가 따로 업로드된다. */}
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">👗 의상</span>
        {outfits.map((o) => (
          <button
            key={o}
            onClick={() => setOutfit(o)}
            className={`text-[10px] rounded px-1.5 py-0.5 border ${
              o === outfit ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400'
            }`}
            title={o === '기본' ? '기본 의상' : `의상: ${o}`}
          >
            {o}
          </button>
        ))}
        <button
          className="text-[10px] rounded px-1.5 py-0.5 border border-edge text-gray-500 hover:text-accent"
          title="새 의상 추가(예: 수영복, 교복, 정장)"
          onClick={() => {
            const n = window.prompt('새 의상 이름은? (예: 수영복, 교복, 정장)');
            if (n && n.trim()) {
              addOutfit(name, n.trim());
              setOutfit(n.trim());
            }
          }}
        >
          ＋ 의상
        </button>
      </div>
      {outfit !== '기본' && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <button
            className="text-[10px] text-gray-500 hover:text-rose-600"
            title="이 의상과 그 입화를 삭제"
            onClick={() => {
              if (window.confirm(`'${name}'의 '${outfit}' 의상을 삭제할까요? 이 의상의 입화도 함께 삭제됩니다.`)) {
                removeOutfit(name, outfit);
                setOutfit('기본');
              }
            }}
          >
            의상 삭제
          </button>
        </div>
      )}

      {/* 배경 키워드 규칙 — 장면마다 #복장을 반복해 적지 않아도, 배경 이름에 키워드가 들어가면
          이 의상이 자동으로 입혀진다(resolveOutfit). 위에 있는 규칙이 먼저 적용된다(첫 일치 승). */}
      {outfit !== '기본' && (
        <div className="rounded-lg border border-edge p-2 mb-2 bg-panel2/40">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] text-gray-500">🏷 이 의상을 입을 배경 키워드</span>
          </div>
          {myRuleIdxs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {myRuleIdxs.map((idx) => {
                const r = allRules[idx];
                const n = ruleCounts.get(r.keyword) ?? 0;
                return (
                  <span
                    key={idx}
                    className={`chip text-[10px] flex items-center gap-1 ${
                      n === 0 ? 'border-amber-500/50 text-amber-600' : 'border-edge text-gray-400'
                    }`}
                    title={n === 0 ? '이 키워드를 배경 이름에 포함한 장면이 없습니다(오타 확인)' : `${n}개 장면에 적용됨`}
                  >
                    {r.keyword} ×{n}
                    <button className="hover:text-rose-600" onClick={() => removeOutfitRule(idx)} title="규칙 삭제">
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex gap-1">
            <input
              className="field text-xs flex-1"
              placeholder="예: 카페, 워터파크"
              value={ruleKw}
              onChange={(e) => setRuleKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ruleKw.trim()) {
                  addOutfitRule(name, outfit, ruleKw);
                  setRuleKw('');
                }
              }}
            />
            <button
              className="btn-ghost text-[11px] shrink-0"
              disabled={!ruleKw.trim()}
              onClick={() => {
                addOutfitRule(name, outfit, ruleKw);
                setRuleKw('');
              }}
            >
              ＋ 추가
            </button>
          </div>
          <p className="text-[10px] text-gray-500 leading-snug mt-1">
            배경 이름에 이 키워드가 들어간 장면에 자동으로 입힙니다. 한 배경이 여러 키워드에 걸리면 더 구체적인(긴)
            키워드가 이기고, 아무 규칙에도 안 걸리면 기본 의상입니다. 특정 장면만 다르게 하려면 장면 카드에서 직접
            고르세요.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-500 leading-snug mb-2">
        표정 썸네일을 눌러 ChatGPT 등에서 만든 이미지를 하나씩 업로드하세요(투명 배경 PNG 권장).
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {exprList.map((ex) => (
          <ExpressionThumb
            key={`${outfit}:${ex}`}
            name={name}
            expr={ex as Expression}
            outfit={outfit}
            onUpload={(f) => importSprite(name, ex as Expression, f, outfit)}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        {hasAny && outfit === '기본' && (
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
  outfit,
  onUpload,
}: {
  name: string;
  expr: Expression;
  outfit: string;
  onUpload: (file: File) => void;
}) {
  const assetId = useStore((s) => {
    const ch = s.project.characters.find((x) => x.name === name);
    if (!ch) return undefined;
    if (outfit === '기본') return ch.expressions[expr];
    return ch.outfits?.find((o) => o.name === outfit)?.expressions[expr];
  });
  const url = useAssetUrl(assetId);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="relative aspect-[3/4] rounded-lg border border-edge bg-ink overflow-hidden group">
      <button
        onClick={() => url && setZoom(true)}
        disabled={!url}
        title={url ? '🔍 크게 보기' : expr}
        className="w-full h-full flex items-center justify-center"
      >
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] text-gray-500">{expr}</span>
        )}
      </button>
      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <UploadButton
          onFile={onUpload}
          label="↥"
          className="bg-black/55 text-white text-[10px] rounded px-1 py-0.5 hover:bg-black/75"
          title={`${expr} 입화 업로드`}
        />
      </div>
      <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9px] py-0.5 text-center pointer-events-none">
        {expr}
      </span>
      {/* 확대 미리보기(라이트박스) — 아무 데나 클릭하면 닫힘. */}
      {zoom && url && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          <img src={url} className="max-w-[90vw] max-h-[90vh] object-contain" />
          <button
            className="absolute top-4 right-5 text-white/80 hover:text-white text-3xl leading-none"
            onClick={() => setZoom(false)}
            title="닫기"
          >
            ×
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/85 text-xs bg-black/55 px-2.5 py-1 rounded-full">
            {name} · {expr}
          </span>
        </div>
      )}
    </div>
  );
}

function BgGroupRow({ group }: { group: Group }) {
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

/** 대본에서 쓰인 고유 아이템 이름(등장 순서, 빈 이름=닫기 마커 제외). */
function itemNames(scenes: Scene[]): string[] {
  const seen = new Set<string>();
  for (const sc of scenes)
    for (const l of sc.lines) if (l.kind === 'item' && l.name.trim()) seen.add(l.name.trim());
  return [...seen];
}

/** 아이템(소품) 한 종 — 투명 컷아웃 업로드. 이름 기준 공유(project.itemAssetIds). */
function ItemGroupRow({ name }: { name: string }) {
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

function CgGroupRow({ group }: { group: CgGroup }) {
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

function BgmGroupRow({ group }: { group: Group }) {
  const importBgm = useStore((s) => s.importBgm);
  const clearBgm = useStore((s) => s.clearBgmGroup);
  const url = useAssetUrl(group.repAssetId);
  const rep = group.sceneIds[0];

  return (
    <div className="card border-edge p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CountBadge n={group.count} />
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
