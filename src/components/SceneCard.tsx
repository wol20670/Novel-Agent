import { memo, useMemo } from 'react';
import { useStore, sceneById } from '../store';
import {
  SCENE_STATUS_LABEL,
  baseLocaleOf,
  cgActiveFlags,
  characterOutfits,
  outfitFlags,
  resolveOutfit,
  spriteHiddenFlags,
  type SceneStatus,
  type Character,
} from '../types';
import { type OutfitSuggestion } from '../generators/outfit';
import { activeQaIssues, type TranslationQaResult } from '../generators/translate/qa';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import LineRow from './SceneLineRow';
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
  // 줄마다의 유효 의상 — outfitFlags 단일 소스(generate.ts·ScenePlayer 와 동일 판정).
  // hiddenFlags 와 같은 관용구로 **(장면,캐릭터)당 한 번만** 계산해 LineRow 에 나눠준다
  // (줄마다 resolver 를 다시 돌리면 장면당 줄 수 × 캐릭터 수 만큼 반복된다).
  const outfitFlagsByChar = useMemo(() => {
    if (!outfitChars.length) return null;
    const m = new Map<string, string[]>();
    for (const c of outfitChars) m.set(c.name, outfitFlags(scene, outfitRules, c.name));
    return m;
  }, [scene, outfitRules, outfitChars]);
  // 줄마다의 CG 활성 상태 — CG 구간에선 생성기가 복원·동기화를 통째로 막아 의상 전환이 dead write 다.
  // ⚠️ **`getFirstEffectiveCgIndex`(AI cutoff)가 아니라 `cgActiveFlags`(구간)를 쓴다** — `#CG끝` 이후는
  // 생성기가 그 줄의 fold 의상으로 다시 세우므로 dead write 가 아니고, 수동 지정을 막을 이유가 없다.
  // Outfit **AI** 는 Phase 14 동결 계약대로 계속 first-CG cutoff 를 쓴다(의도된 divergence).
  const cgFlags = useMemo(() => cgActiveFlags(scene), [scene]);
  // AI 의상 전환 제안(휘발성 — project 밖 런타임 state). 줄마다 store 를 구독하지 않도록 카드에서
  // 한 번 받아 lineIndex → 제안들 맵으로 만들고 hiddenFlags 처럼 props 로 내려준다.
  const outfitSuggestions = useStore((s) => s.outfitSuggestions[sceneId]);
  const suggestionsByLine = useMemo(() => {
    if (!outfitSuggestions?.length) return null;
    const m = new Map<number, OutfitSuggestion[]>();
    for (const s of outfitSuggestions) {
      const arr = m.get(s.lineIndex);
      if (arr) arr.push(s);
      else m.set(s.lineIndex, [s]);
    }
    return m;
  }, [outfitSuggestions]);
  const applySceneSuggestions = useStore((s) => s.applySceneOutfitSuggestions);
  const ignoreSceneSuggestions = useStore((s) => s.ignoreSceneOutfitSuggestions);
  // 번역 QA 의심 — 이 장면 몫만 구독한다(전체 캐시를 구독하면 무관한 장면 결과에도 재렌더된다).
  // 유효성은 activeQaIssues 가 현재 scene 기준으로 판정하므로, 번역을 고치면 별도 무효화 호출 없이
  // 경고가 사라진다(⚠️ setLineTranslation 뒤에 clearTranslationQa 같은 걸 부르면 안 된다).
  const sceneQa = useStore((s) => s.translationQa[sceneId]);
  const baseLocale = useStore((s) => baseLocaleOf(s.project));
  const qaIssues = useMemo(() => activeQaIssues(sceneQa, scene, baseLocale), [sceneQa, scene, baseLocale]);
  const qaByLine = useMemo(() => {
    if (!qaIssues.length) return null;
    const m = new Map<number, TranslationQaResult[]>();
    for (const r of qaIssues) {
      const arr = m.get(r.anchor.lineIndex);
      if (arr) arr.push(r);
      else m.set(r.anchor.lineIndex, [r]);
    }
    return m;
  }, [qaIssues]);
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
        {/* 이 장면의 유효한 의심 번역 수 — 3000줄 대본에서 "어느 장면을 봐야 하는지"의 최소 단서다. */}
        {qaIssues.length > 0 && (
          <span
            className="chip border-amber-500/40 text-amber-600 bg-amber-500/5 text-[10px] shrink-0"
            title="이 장면에 다시 볼 만한 번역이 있습니다 — 아래 줄의 EN·JA 칸을 확인하세요."
          >
            ⚠ {qaIssues.length}
          </span>
        )}
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

      {/* AI 의상 전환 제안 — 수락해야 Line.outfits 에 들어간다(제안 자체는 저장되지 않는다). */}
      {outfitSuggestions && outfitSuggestions.length > 0 && (
        <div
          className="flex items-center gap-2 mb-3 text-[11px]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="rounded px-1.5 py-0.5 border border-sky-500/40 text-sky-500 bg-sky-500/5">
            🤖 의상 제안 {outfitSuggestions.length}건
          </span>
          <button className="chip border-edge text-gray-400 hover:text-gray-200" onClick={() => applySceneSuggestions(sceneId)}>
            모두 적용
          </button>
          <button className="chip border-edge text-gray-500 hover:text-gray-300" onClick={() => ignoreSceneSuggestions(sceneId)}>
            모두 무시
          </button>
        </div>
      )}

      {/* 대사/지문 미리보기 */}
      <div className="bg-ink/70 rounded-lg border border-edge p-3 max-h-44 overflow-y-auto text-sm mb-3 space-y-0.5">
        {scene.lines.length === 0 && <span className="text-gray-600 text-xs">대사 없음</span>}
        {/* key 에 줄 수를 섞는 이유: 삭제·재분석으로 줄 배열 **구조**가 바뀌면 LineRow 의 positional
            로컬 state(✏️ 편집·🎙 VoiceLab·👗 패널)를 버려야 한다. index 만 key 로 쓰면 앞줄 삭제 후
            React 가 같은 key 의 컴포넌트를 재사용해 그 state 가 **한 칸 밀린 다른 줄에 붙는다**.
            ⚠️ 내용(text) 을 key 에 넣지 말 것 — 타이핑마다 remount 돼 textarea 포커스가 날아간다.
            줄 수가 그대로인 편집(텍스트·표정·의상·숨김)에서는 remount 되지 않는다. */}
        {scene.lines.map((l, i) => (
          <LineRow
            key={`${scene.lines.length}:${i}`}
            sceneId={sceneId}
            index={i}
            line={l}
            scene={scene}
            charMap={charMap}
            effHidden={hiddenFlags[i]}
            outfitChars={outfitChars}
            outfitFlagsByChar={outfitFlagsByChar}
            cgFlags={cgFlags}
            suggestions={suggestionsByLine?.get(i)}
            qaIssues={qaByLine?.get(i)}
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
