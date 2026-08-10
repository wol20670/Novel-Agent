import { memo, useMemo, useState } from 'react';
import { useStore, sceneById } from '../store';
import {
  SCENE_STATUS_LABEL,
  effectiveExpressions,
  emojiFor,
  baseLocaleOf,
  LOCALE_LABEL,
  characterOutfits,
  resolveOutfit,
  spriteHiddenFlags,
  type SceneStatus,
  type Expression,
  type Line,
  type Locale,
  type Character,
  type Scene,
} from '../types';
import { resolveEmotionDetailed } from '../generators/emotion/resolve';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import VoiceLab from './VoiceLab';
import type { PeerPresence } from '../collab';

const STATUS_BTN: Record<SceneStatus, { on: string; dot: string }> = {
  review: { on: 'bg-gray-500/15 text-gray-300 border-gray-400', dot: 'bg-gray-400' },
  approved: { on: 'bg-emerald-500/15 text-emerald-700 border-emerald-500', dot: 'bg-emerald-500' },
  needs_fix: { on: 'bg-amber-500/15 text-amber-700 border-amber-500', dot: 'bg-amber-500' },
};
const STATUSES = Object.keys(SCENE_STATUS_LABEL) as SceneStatus[];

// collabPeers 배열 identity 별로 sceneId → PeerPresence[] 인덱스를 캐싱(sceneById 와 같은 이유).
// 예전엔 카드마다 .filter() 로 새 배열을 만들고 useShallow 로 얕은 비교했는데, 그 filter 자체가
// 카드 수(N)만큼 매 store 알림마다 반복 실행됐다(협업 인원은 적어도 장면 카드가 많으면 낭비).
// collabPeers 가 바뀔 때만 한 번 그룹핑해두면 이후엔 카드마다 Map 조회 O(1)이고, 참조가 그대로면
// zustand 기본 Object.is 비교로 재렌더도 스킵된다(useShallow 불필요).
const EMPTY_PEERS: PeerPresence[] = [];
const peersBySceneCache = new WeakMap<PeerPresence[], Map<string, PeerPresence[]>>();
function peersForScene(peers: PeerPresence[], sceneId: string): PeerPresence[] {
  let idx = peersBySceneCache.get(peers);
  if (!idx) {
    idx = new Map();
    for (const p of peers) {
      if (!p.selectedSceneId) continue;
      const arr = idx.get(p.selectedSceneId);
      if (arr) arr.push(p);
      else idx.set(p.selectedSceneId, [p]);
    }
    peersBySceneCache.set(peers, idx);
  }
  return idx.get(sceneId) ?? EMPTY_PEERS;
}

function SceneCard({ sceneId, index }: { sceneId: string; index: number }) {
  // scenes.find() 를 셀렉터 안에 직접 두면 zustand가 set() 마다(렌더 여부 무관) 모든 구독 셀렉터를
  // 다시 돌려 카드 N개 × 장면 N개 선형 탐색이 반복된다 — sceneById 는 scenes 배열 identity 기준
  // 캐싱된 Map 조회로 이를 O(1) 로 줄인다(src/store.ts).
  const scene = useStore((s) => sceneById(s.project.scenes, sceneId))!;
  const update = useStore((s) => s.updateScene);
  const setStatus = useStore((s) => s.setSceneStatus);
  const setSceneHide = useStore((s) => s.setSceneHideSprites);
  const select = useStore((s) => s.selectScene);
  const selected = useStore((s) => s.selectedSceneId === sceneId);
  const importBg = useStore((s) => s.importBackground);
  const importBgm = useStore((s) => s.importBgm);
  const bgUrl = useAssetUrl(scene.backgroundAssetId);
  // 이름→캐릭터 맵을 카드당 한 번만 만들어(useMemo) 라인마다 반복되는 characters.find() O(n) 탐색을
  // LineRow/LineEmotion 에서 O(1) 조회로 바꾼다(장면당 대사 수십 줄 × 캐릭터 목록 스캔 방지).
  const characters = useStore((s) => s.project.characters);
  const charMap = useMemo(() => new Map(characters.map((c) => [c.name, c])), [characters]);
  // 배경 키워드 의상 규칙 — project 전체가 아니라 이 배열만 좁게 구독(SceneCard 는 memo 라 불필요한
  // 전체 리렌더를 피해야 한다).
  const outfitRules = useStore((s) => s.project.outfitRules);
  // 줄마다 "유효 숨김 상태" — spriteHiddenFlags 단일 소스(generate.ts·ScenePlayer 와 동일 판정).
  // 카드 렌더 한 번에 한 번만 계산해 LineRow(장면당 최대 수십 개)에 나눠준다.
  const hiddenFlags = useMemo(() => spriteHiddenFlags(scene), [scene]);
  // 이 장면에 등장하는(대사 화자) 캐릭터 중 추가 의상을 가진 캐릭터만 — 의상 지정 UI 대상.
  const outfitChars = useMemo(() => {
    const names = new Set<string>();
    for (const l of scene.lines) {
      if (l.kind !== 'dialogue') continue;
      if (l.members?.length) l.members.forEach((m) => names.add(m));
      else names.add(l.speaker);
    }
    return [...names]
      .map((nm) => charMap.get(nm))
      .filter((c): c is Character => !!c && (c.outfits?.length ?? 0) > 0);
  }, [scene.lines, charMap]);
  // 협업 — 지금 이 장면을 보고 있는 상대방(있으면 편집 충돌을 피하라는 신호). peersForScene 은
  // collabPeers identity 기준 캐싱된 조회라 카드마다 .filter() 를 새로 돌리지 않는다(위 설명).
  const peersHere = useStore((s) => peersForScene(s.collabPeers, sceneId));

  return (
    <div
      id={`scene-${sceneId}`}
      onClick={() => select(sceneId)}
      className={`card p-4 cursor-default scroll-mt-4 ${
        selected ? 'border-accent shadow-lg shadow-accent2/10' : 'border-edge hover:border-edge/80'
      }`}
    >
      {/* 헤더: 번호 · 제목 · 상태 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-panel2 text-[11px] font-bold text-accent shrink-0">
          {index + 1}
        </span>
        <input
          className="field flex-1 font-semibold"
          value={scene.title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => update(sceneId, { title: e.target.value })}
        />
        {peersHere.length > 0 && (
          <span
            className="chip border-emerald-500/40 text-emerald-600 text-[10px] shrink-0"
            title={`${peersHere.map((p) => p.name).join(', ')}님이 지금 이 장면을 보고 있어요 — 동시 수정을 피하세요`}
          >
            🟢 {peersHere.map((p) => p.name).join(', ')} 편집 중
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-3">
        {STATUSES.map((st) => {
          const active = scene.status === st;
          return (
            <button
              key={st}
              onClick={(e) => {
                e.stopPropagation();
                setStatus(sceneId, st);
              }}
              className={`chip flex items-center gap-1.5 ${
                active ? STATUS_BTN[st].on : 'border-edge text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? STATUS_BTN[st].dot : 'bg-gray-600'}`} />
              {SCENE_STATUS_LABEL[st]}
            </button>
          );
        })}
        {/* 차량 내부처럼 인물이 서 있는 구도가 어색한 장면 전체를 인물 없이(주인공처럼 대사만)
            내보낸다 — #CG 와 달리 배경은 그대로 두고, 줄 버튼으로 도중에 다시 표시할 수 있다. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSceneHide(sceneId, !scene.hideSprites);
          }}
          className={`chip flex items-center gap-1.5 ${
            scene.hideSprites
              ? 'bg-rose-500/15 text-rose-600 border-rose-500'
              : 'border-edge text-gray-500 hover:text-gray-300'
          }`}
          title="이 장면을 인물 숨김 상태로 시작합니다(장면 끝까지가 아니라, 줄 단위로 다시 표시 가능)."
        >
          🚫 인물 숨김
        </button>
      </div>

      {/* 배경 미리보기 */}
      <div className="relative rounded-lg border border-edge overflow-hidden aspect-video bg-ink mb-3 flex items-center justify-center">
        {bgUrl ? (
          <img src={bgUrl} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-gray-600">배경 미업로드 · 아래 "배경 업로드"로 추가하세요</span>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {scene.backgroundAssetId && <span className="chip bg-black/50 border-emerald-500/50 text-emerald-300">배경✓</span>}
          {scene.bgmAssetId && <span className="chip bg-black/50 border-emerald-500/50 text-emerald-300">BGM✓</span>}
        </div>
      </div>

      {/* 메타 필드 */}
      <div className="grid grid-cols-2 gap-3 mb-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <span className="label">배경</span>
          <input
            className="field"
            placeholder="배경 이름"
            value={scene.background ?? ''}
            onChange={(e) => update(sceneId, { background: e.target.value })}
          />
        </div>
        <div>
          <span className="label">BGM</span>
          <input
            className="field"
            placeholder="BGM 이름"
            value={scene.bgm ?? ''}
            onChange={(e) => update(sceneId, { bgm: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <span className="label">연출 노트 (AI 프롬프트 반영)</span>
          <input
            className="field"
            placeholder="예: 햇살이 비치는 아침 (쉼표로 구분)"
            value={scene.direction.join(', ')}
            onChange={(e) =>
              update(sceneId, {
                direction: e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </div>

      {/* 의상 지정 — 배경 키워드 규칙(에셋 탭)에 맡기거나, 이 장면만 직접 지정(#복장과 동일 효과). */}
      {outfitChars.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3" onClick={(e) => e.stopPropagation()}>
          <span className="label w-full mb-0">👗 의상</span>
          {outfitChars.map((c) => {
            const current = scene.outfits?.[c.name] ?? '';
            return (
              <div key={c.name} className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">{c.name}</span>
                <select
                  className="field text-xs"
                  value={current}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...(scene.outfits ?? {}) };
                    if (v) next[c.name] = v;
                    else delete next[c.name];
                    update(sceneId, { outfits: Object.keys(next).length ? next : undefined });
                  }}
                >
                  <option value="">자동(규칙)</option>
                  {characterOutfits(c).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                {!current && (
                  <span className="text-[10px] text-gray-500">→ {resolveOutfit(outfitRules, scene, c.name)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 대사/지문 미리보기 */}
      <div className="bg-ink/70 rounded-lg border border-edge p-3 max-h-44 overflow-y-auto text-sm mb-3 space-y-0.5">
        {scene.lines.length === 0 && <span className="text-gray-600 text-xs">대사 없음</span>}
        {scene.lines.map((l, i) => (
          <LineRow
            key={i}
            sceneId={sceneId}
            index={i}
            line={l}
            scene={scene}
            charMap={charMap}
            effHidden={hiddenFlags[i]}
          />
        ))}
        {scene.cg.map((c, i) => (
          <p key={`cg${i}`} className="text-pink-600 text-xs">
            🎴 CG: {c}
          </p>
        ))}
        {scene.choices.length > 0 && (
          <div className="mt-2 border-t border-edge pt-2 space-y-0.5">
            {scene.choices.map((c, i) => (
              <p key={i} className="text-amber-700 text-xs">
                ▷ {c.text}
                {c.target && <span className="text-gray-500"> → {c.target}</span>}
              </p>
            ))}
          </div>
        )}
        {scene.jumpTo && <p className="text-cyan-600 text-xs mt-1">⤳ 점프: {scene.jumpTo}</p>}
      </div>

      {/* 액션 */}
      <div className="flex gap-2 flex-wrap items-center" onClick={(e) => e.stopPropagation()}>
        <UploadButton label="🖼 배경 업로드" className="btn-primary" onFile={(f) => importBg(sceneId, f)} />
        <UploadButton
          label="🎵 BGM 업로드"
          className="btn-ghost"
          accept="audio/*"
          onFile={(f) => importBgm(sceneId, f)}
        />
        {scene.status !== 'approved' && (
          <button className="btn-soft ml-auto" onClick={() => setStatus(sceneId, 'approved')}>
            ✓ 승인
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(SceneCard);

type DialogueLine = Extract<Line, { kind: 'dialogue' }>;
/** 대사·지문 공통(hideSprites 를 갖는 두 kind) — LineHideToggle 이 받는 타입. */
type HideableLine = Extract<Line, { kind: 'dialogue' }> | Extract<Line, { kind: 'narration' }>;

/**
 * 대사/지문 한 줄 — 미리보기 + 인라인 편집.
 * 평소엔 원문(+번역 EN/JA를 회색으로) 표시. ✏️ 를 누르면 원문·번역을 실시간 수정한다.
 * 표정 셀렉트(대사만)는 오른쪽에, ✏️ 는 그 왼쪽에 둔다.
 */
function LineRow({
  sceneId,
  index,
  line,
  scene,
  charMap,
  effHidden,
}: {
  sceneId: string;
  index: number;
  line: Line;
  scene: Scene;
  charMap: Map<string, Character>;
  /** 이 줄의 유효 숨김 상태(spriteHiddenFlags[index]) — 버튼 표시·title 안내용. */
  effHidden: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const setText = useStore((s) => s.setLineText);
  const setTr = useStore((s) => s.setLineTranslation);
  const base = useStore((s) => baseLocaleOf(s.project));
  // 번역 대상 = base 를 제외한 지원 로케일(en·ja) — 엑셀 C/D열과 동일.
  const targets = (Object.keys(LOCALE_LABEL) as Locale[]).filter((l) => l !== base);
  // 성우 테스트는 단일 화자 대사 + 그 화자가 주인공(내레이션 전용)이 아닐 때만(히로인 등).
  const isSingleSpeaker = line.kind === 'dialogue' && !line.members?.length;
  const speakerChar = isSingleSpeaker ? charMap.get((line as DialogueLine).speaker) : undefined;
  const canVoice = !!speakerChar && !speakerChar.isProtagonist;

  // CG 배경 전환 라인 — 이 지점부터 배경이 CG 로 바뀌고 등장인물이 사라진다(장면 끝까지).
  if (line.kind === 'cg') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs">
        <span className="rounded px-1.5 py-0.5 border border-violet-500/40 text-violet-400 bg-violet-500/5 shrink-0">🖼 CG 전환</span>
        <span className="text-gray-300">{line.desc || '(설명 없음)'}</span>
      </div>
    );
  }
  // 아이템(소품) 팝업 라인 — 편집/번역/표정 없이 칩으로만 표시.
  if (line.kind === 'item') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs">
        <span className="rounded px-1.5 py-0.5 border border-pink-500/40 text-pink-500 bg-pink-500/5 shrink-0">🎁 아이템</span>
        {line.name ? (
          <span className="text-gray-300">{line.name}</span>
        ) : (
          <span className="text-gray-500 italic">팝업 닫기</span>
        )}
      </div>
    );
  }
  // BGM 시작 위치 마커 — 이 지점부터 곡이 재생된다(편집/번역/표정 없이 칩으로만 표시).
  if (line.kind === 'bgm') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs">
        <span className="rounded px-1.5 py-0.5 border border-amber-500/40 text-amber-500 bg-amber-500/5 shrink-0">🎵 BGM 시작</span>
        <span className="text-gray-300">{line.name}</span>
      </div>
    );
  }
  const isDlg = line.kind === 'dialogue';

  return (
    <div>
      <div className="flex items-start gap-1.5">
        {editing ? (
          <div className="flex-1 min-w-0 space-y-1 py-0.5" onClick={(e) => e.stopPropagation()}>
            {isDlg && <b className="text-accent text-xs">{(line as DialogueLine).speaker}</b>}
            <textarea
              className="field w-full text-sm resize-y min-h-[2.2rem] leading-snug"
              value={line.text}
              onChange={(e) => setText(sceneId, index, e.target.value)}
              placeholder="멘트(원문)"
              autoFocus
            />
            {targets.map((loc) => (
              <div key={loc} className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 w-7 shrink-0 uppercase">{loc}</span>
                <input
                  className="field flex-1 text-xs"
                  value={line.i18n?.[loc] ?? ''}
                  onChange={(e) => setTr(sceneId, index, loc, e.target.value)}
                  placeholder={`${LOCALE_LABEL[loc]} 번역`}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            {isDlg ? (
              <p>
                <b className="text-accent">{(line as DialogueLine).speaker}</b>{' '}
                <span className="text-gray-200">{line.text}</span>
              </p>
            ) : (
              <p className="text-gray-400 italic">{line.text}</p>
            )}
            {targets.map((loc) =>
              line.i18n?.[loc] ? (
                <p key={loc} className="text-[11px] text-gray-500 pl-1">
                  <span className="uppercase text-gray-600 mr-1">{loc}</span>
                  {line.i18n[loc]}
                </p>
              ) : null,
            )}
          </div>
        )}

        {canVoice && (
          <button
            className={`text-[11px] rounded px-1 py-0.5 shrink-0 border outline-none ${
              voiceOpen ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400 bg-panel2 hover:text-gray-200'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setVoiceOpen((v) => !v);
            }}
            title="성우 음성 테스트(Typecast)"
          >
            🎙
          </button>
        )}

        <button
          className={`text-[11px] rounded px-1 py-0.5 shrink-0 border outline-none ${
            editing ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400 bg-panel2 hover:text-gray-200'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setEditing((v) => !v);
          }}
          title="멘트·번역 편집"
        >
          {editing ? '완료' : '✏️'}
        </button>

        <LineHideToggle sceneId={sceneId} index={index} line={line} effHidden={effHidden} />

        {isDlg && (
          <LineEmotion sceneId={sceneId} index={index} line={line as DialogueLine} scene={scene} charMap={charMap} />
        )}
      </div>

      {voiceOpen && speakerChar && (
        <VoiceLab sceneId={sceneId} lineIndex={index} char={speakerChar} line={line as DialogueLine} baseLocale={base} />
      )}
    </div>
  );
}

/** 상속(undefined) → 숨김(true) → 표시(false) → 상속 순으로 순환. */
function nextHideState(v: boolean | undefined): boolean | undefined {
  if (v === undefined) return true;
  if (v === true) return false;
  return undefined;
}

/**
 * 대사/지문 한 줄부터 스프라이트 숨김을 3단계로 지정 — 상속(앞 줄 상태 유지)/숨김/표시.
 * `#인물숨김`/`#인물표시` 태그와 완전히 같은 값(setLineHideSprites)이라 대본에서 지정한 값은
 * 여기서도 그대로 보이고, 여기서 바꾼 값도 재분석 전까지는 그대로 유지된다(mergeScenes 참고).
 */
function LineHideToggle({
  sceneId,
  index,
  line,
  effHidden,
}: {
  sceneId: string;
  index: number;
  line: HideableLine;
  effHidden: boolean;
}) {
  const setHide = useStore((s) => s.setLineHideSprites);
  const raw = line.hideSprites;
  const rawLabel = raw === undefined ? '상속' : raw ? '숨김' : '표시';
  const icon = raw === undefined ? '👤' : raw ? '🚫' : '👤';
  return (
    <button
      className={`text-[11px] rounded px-1 py-0.5 shrink-0 border outline-none ${
        raw === true
          ? 'border-rose-500 text-rose-500 bg-rose-500/10'
          : raw === false
            ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10'
            : 'border-edge text-gray-500 bg-panel2 opacity-60'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        setHide(sceneId, index, nextHideState(raw));
      }}
      title={`이 줄부터 스프라이트: ${rawLabel} — 현재: ${effHidden ? '숨김' : '표시'}${raw === undefined ? '(상속)' : ''}. 클릭해서 순환(상속→숨김→표시)`}
    >
      {icon}
    </button>
  );
}

/**
 * 대사 한 줄의 표정 선택 — 기본 "자동"(작가 태그 > AI 배정 > 문맥 휴리스틱 > '기본' 순, 판정은
 * resolveEmotionDetailed 단일 소스), 프로젝트 표정 목록 중 직접 지정도 가능.
 */
function LineEmotion({
  sceneId,
  index,
  line,
  scene,
  charMap,
}: {
  sceneId: string;
  index: number;
  line: DialogueLine;
  scene: Scene;
  charMap: Map<string, Character>;
}) {
  const setEmotion = useStore((s) => s.setLineEmotion);
  // project 전체가 아니라 expressions 필드만 — resolveEmotionDetailed 호출에 필요한 값도 이거 하나뿐이다.
  const expressions = useStore((s) => s.project.expressions);
  const exprList = effectiveExpressions(expressions);
  // 화면에 안 서는 화자(주인공 등)는 표정 의미가 없으니 선택기를 숨긴다.
  const narrationOnly = !line.members?.length && !!charMap.get(line.speaker)?.isProtagonist;
  // resolveEmotionDetailed 는 내부적으로 inferEmotion(휴리스틱)을 부를 수 있어 가볍지 않다 —
  // 판정에 실제 영향을 주는 필드(대사문·수동 지정·AI 배정·연출·배경·표정 목록)가 그대로면 재계산하지 않는다.
  // scene 객체 자체는 카드의 다른 필드(제목 등)가 바뀔 때마다 새로 만들어지므로 deps 에 넣지 않는다.
  const directionKey = scene.direction.join('|');
  // resolveEmotionDetailed 는 Pick<Project,'expressions'> 만 받으므로 캐스팅 없이 그대로 넘긴다.
  const resolved = useMemo(
    () => resolveEmotionDetailed(line, scene, { expressions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [line.text, line.emotion, line.emotionAuto, directionKey, scene.background, expressions],
  );
  if (narrationOnly) return null;

  const value = (line.emotion as Expression | undefined) ?? '';
  // AI 가 배정한 값이 지금 실제로 쓰이는 중(사람이 아직 손대지 않음) — 검토를 유도하려면 눈에 띄어야 한다.
  const aiActive = !value && resolved.source === 'ai';
  return (
    <select
      className={`text-[11px] rounded px-1 py-0.5 shrink-0 border outline-none ${
        value
          ? 'border-accent text-accent bg-accent/10'
          : aiActive
            ? 'border-violet-500/60 text-violet-400 bg-violet-500/10'
            : 'border-edge text-gray-400 bg-panel2'
      }`}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setEmotion(sceneId, index, (e.target.value || undefined) as Expression | undefined)}
      title={
        aiActive
          ? 'AI가 대사 문맥으로 배정한 표정입니다 — 직접 고르면 이 배정을 덮어씁니다.'
          : '이 대사의 표정 — 자동(문맥 분석) 또는 직접 선택. 직접 고르면 AI 배정을 덮어씁니다.'
      }
    >
      <option value="">
        {resolved.source === 'ai' ? `자동 · 🤖 ${resolved.expr}` : `자동 · ${emojiFor(resolved.expr)}${resolved.expr}`}
      </option>
      {exprList.map((ex) => (
        <option key={ex} value={ex}>
          {emojiFor(ex)} {ex}
        </option>
      ))}
    </select>
  );
}
