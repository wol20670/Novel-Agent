// 장면 카드의 **줄 편집 서브시스템** — SceneCard.tsx 에서 떼어냈다.
//
// SceneCard.tsx 는 장면(Scene) 계층을 소유한다(메타 편집·상태·배경 미리보기·장면 단위 의상·협업
// 프레즌스·AI 제안 일괄 조작 + 줄 N개에 나눠줄 파생값 계산). 이 파일은 그 아래 **줄(Line) 계층**
// 전부다 — 대사/지문 인라인 편집·번역 칸·QA 경고·의상 칩과 패널·숨김 토글·표정 선택·음성 패널·
// 줄 삭제·CG 종료 삽입.
//
// 두 계층이 주고받는 것은 **LineRow 하나뿐**이다(단방향). 줄 단위 store 액션은 예전부터 이 계층이
// **직접 구독**하므로 부모가 콜백을 내려주지 않는다. props 11개 중 파생값(charMap·effHidden·
// outfitChars·outfitFlagsByChar·cgFlags·suggestions·qaIssues)은 부모가 카드당 1회 계산·그룹핑해
// 줄 N개에 배분하고(줄마다 store 구독·resolver 재실행을 없앤 기존 성능 구조), 나머지
// (sceneId·index·line·scene)는 line identity 와 render context 다.
//
// ⚠️ 여기서 새 판정을 만들지 말 것 — 표정은 resolveEmotionDetailed, 숨김은 spriteHiddenFlags,
// 의상은 outfitFlags, CG 는 cgActiveFlags 가 각각 단일 소스이고 그 값은 부모가 계산해 내려준다.

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import {
  effectiveExpressions,
  emojiFor,
  baseLocaleOf,
  LOCALE_LABEL,
  characterOutfits,
  type Expression,
  type Line,
  type Locale,
  type Character,
  type Scene,
} from '../types';
import { resolveEmotionDetailed } from '../generators/emotion/resolve';
import { type OutfitSuggestion } from '../generators/outfit';
import { type QaCategory, type TranslationQaResult } from '../generators/translate/qa';
import VoiceLab from './VoiceLab';

// QA 사유 분류의 한국어 표시. 작은 로컬 매핑일 뿐이고 localization framework 를 새로 만들지 않는다.
// ⚠️ category 는 없을 수 있다(모델이 모르는 값을 보내면 판정만 살리고 분류는 비운다) — 그 땐 '검토 필요'.
const QA_CATEGORY_LABEL: Record<QaCategory, string> = {
  meaning: '의미',
  omission: '누락',
  addition: '추가',
  language: '언어',
};

/**
 * 번역 QA 경고 한 줄 — 규칙(copy-through)과 AI 판정이 **같은 UI** 를 쓴다(origin 은 내부 lifecycle
 * 용이라 사용자에게 노출하지 않는다). category·reason 은 없을 수 있으므로 둘 다 없어도 깨지지 않는다.
 * "문제 없음"은 세션 QA 캐시만 바꾼다 — 대본·번역·장면 상태(needs_fix 등)를 건드리지 않는다.
 * stale 재확인은 store 의 dismissQaIssue 가 하므로 여기서 복제하지 않는다.
 */
function QaWarning({
  issue,
  onDismiss,
  className,
}: {
  issue?: TranslationQaResult;
  onDismiss: (anchor: TranslationQaResult['anchor']) => void;
  className?: string;
}) {
  if (!issue) return null;
  return (
    <p className={`text-[11px] flex flex-wrap items-center gap-1 text-amber-600 ${className ?? ''}`}>
      <span className="shrink-0">⚠ {issue.category ? QA_CATEGORY_LABEL[issue.category] : '검토 필요'}</span>
      {issue.reason && <span className="text-gray-500">{issue.reason}</span>}
      <button
        className="chip border-edge text-gray-500 hover:text-gray-300"
        title="검토했고 정상이라고 표시합니다(이 칸은 다시 검수하지 않습니다 — 번역을 고치면 초기화)."
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(issue.anchor);
        }}
      >
        문제 없음
      </button>
    </p>
  );
}

type DialogueLine = Extract<Line, { kind: 'dialogue' }>;
/** 대사·지문 공통(hideSprites 를 갖는 두 kind) — LineHideToggle 이 받는 타입. */
type HideableLine = Extract<Line, { kind: 'dialogue' }> | Extract<Line, { kind: 'narration' }>;

/**
 * 대사/지문 한 줄 — 미리보기 + 인라인 편집.
 * 평소엔 원문(+번역 EN/JA를 회색으로) 표시. ✏️ 를 누르면 원문·번역을 실시간 수정한다.
 * 표정 셀렉트(대사만)는 오른쪽에, ✏️ 는 그 왼쪽에 둔다.
 */
export default function LineRow({
  sceneId,
  index,
  line,
  scene,
  charMap,
  effHidden,
  outfitChars,
  outfitFlagsByChar,
  cgFlags,
  suggestions,
  qaIssues,
}: {
  sceneId: string;
  index: number;
  line: Line;
  scene: Scene;
  charMap: Map<string, Character>;
  /** 이 줄의 유효 숨김 상태(spriteHiddenFlags[index]) — 버튼 표시·title 안내용. */
  effHidden: boolean;
  /** 수동 의상 전환 picker 의 캐릭터 후보 — 장면 시작 의상 selector 와 **같은 목록**(카드가 계산). */
  outfitChars: Character[];
  /** 캐릭터 → outfitFlags 결과. 후보가 없으면 null(카드가 한 번만 계산해 내려준다). */
  outfitFlagsByChar: Map<string, string[]> | null;
  /** 줄마다의 CG 활성 상태(-1 = 일반 장면) — 수동 전환 writable 판정용. */
  cgFlags: number[];
  /** 이 줄에 붙은 AI 의상 제안(휘발성) — 카드가 한 번에 그룹핑해 내려준다. */
  suggestions?: OutfitSuggestion[];
  /** 이 줄의 유효한 번역 QA 의심(휘발성) — 로케일 칸 단위라 한 줄에 EN·JA 둘 다 올 수 있다. */
  qaIssues?: TranslationQaResult[];
}) {
  const [editing, setEditing] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [outfitOpen, setOutfitOpen] = useState(false);
  const setText = useStore((s) => s.setLineText);
  const setTr = useStore((s) => s.setLineTranslation);
  const dismissQa = useStore((s) => s.dismissQaIssue);
  const setLineOutfit = useStore((s) => s.setLineOutfit);
  const deleteLine = useStore((s) => s.deleteLine);
  const insertCgEnd = useStore((s) => s.insertCgEndAfterLine);
  const applySuggestion = useStore((s) => s.applyOutfitSuggestion);
  const ignoreSuggestion = useStore((s) => s.ignoreOutfitSuggestion);
  const base = useStore((s) => baseLocaleOf(s.project));
  // 번역 대상 = base 를 제외한 지원 로케일(en·ja) — 엑셀 C/D열과 동일.
  const targets = (Object.keys(LOCALE_LABEL) as Locale[]).filter((l) => l !== base);
  // 성우 테스트는 단일 화자 대사 + 그 화자가 주인공(내레이션 전용)이 아닐 때만(히로인 등).
  // 로케일 칸 → 그 칸의 의심(같은 줄에서 EN·JA 가 각각 걸릴 수 있다).
  const qaByLocale = new Map((qaIssues ?? []).map((r) => [r.anchor.targetLocale, r]));
  const isSingleSpeaker = line.kind === 'dialogue' && !line.members?.length;
  const speakerChar = isSingleSpeaker ? charMap.get((line as DialogueLine).speaker) : undefined;
  const canVoice = !!speakerChar && !speakerChar.isProtagonist;
  // 수동 의상 전환을 이 줄에 **쓸 수 있는가** — 진입 버튼과 패널 렌더가 **같은 하나의 조건**을 본다.
  // 패널을 열어둔 채 #CG 추가·이름 변경·줄 삽입으로 이 줄이 CG 구간에 들어가면, cgFlags 가 scene
  // 파생값이라 다음 렌더에서 패널이 그대로 사라진다(useEffect·state 동기화 없이 mutation 이 막힌다).
  // ⚠️ 기존 Line.outfits 칩과 ✕(해제)는 이 조건과 무관하게 계속 보이고 동작해야 한다 — CG 구간에
  // 남은 값을 정리할 유일한 경로다(자동 정리는 하지 않는다).
  const manualOutfitWritable = (cgFlags[index] ?? -1) < 0;
  // 이 줄에서 CG 를 끝낼 수 있는가 — 위와 **정반대 조건**(지금 CG 구간)이다.
  // dialogue/narration 은 CG 상태를 바꾸지 않아 cgFlags[index] 가 곧 "이 줄이 CG 구간"이고,
  // 마커는 index + 1 에 들어간다("이 줄까지 CG, 다음 줄부터 일반 장면").
  // ⚠️ 조건 불충족이면 disabled 가 아니라 **아예 렌더하지 않는다** — CG 가 아닌 줄에 "CG 종료"는
  // 의미가 없어서 회색 버튼이 남으면 노이즈만 된다(👗 는 반대로 이유를 알려야 해서 disabled 다).
  // duplicate 는 **바로 다음 줄** 하나만 본다(store guard 와 같은 범위 — UI 만 믿지도 않는다).
  const nextLine = scene.lines[index + 1];
  const canInsertCgEnd =
    (cgFlags[index] ?? -1) >= 0 && !(nextLine?.kind === 'cg' && nextLine.end);

  // CG 배경 전환 라인 — 이 지점부터 배경이 CG 로 바뀌고 등장인물이 사라진다(`#CG끝` 전까지).
  // `end` 는 그 반대 마커(`#CG끝`): 배경을 장면의 일반 배경으로 되돌리고 인물을 그 자리에 복원한다.
  if (line.kind === 'cg') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs">
        {line.end ? (
          <>
            <span className="rounded px-1.5 py-0.5 border border-emerald-500/40 text-emerald-400 bg-emerald-500/5 shrink-0">🖼 CG 종료</span>
            <span className="text-gray-300">일반 배경·인물로 복귀</span>
          </>
        ) : (
          <>
            <span className="rounded px-1.5 py-0.5 border border-violet-500/40 text-violet-400 bg-violet-500/5 shrink-0">🖼 CG 전환</span>
            <span className="text-gray-300">{line.desc || '(설명 없음)'}</span>
          </>
        )}
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
              <div key={loc}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-7 shrink-0 uppercase">{loc}</span>
                  <input
                    className="field flex-1 text-xs"
                    value={line.i18n?.[loc] ?? ''}
                    onChange={(e) => setTr(sceneId, index, loc, e.target.value)}
                    placeholder={`${LOCALE_LABEL[loc]} 번역`}
                  />
                </div>
                {/* 고치는 화면에서도 이유가 보여야 한다. 수정하면 anchor 가 어긋나 저절로 사라진다. */}
                <QaWarning issue={qaByLocale.get(loc)} onDismiss={dismissQa} className="pl-[2.1rem]" />
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
                <div key={loc}>
                  <p className="text-[11px] text-gray-500 pl-1">
                    <span className="uppercase text-gray-600 mr-1">{loc}</span>
                    {line.i18n[loc]}
                  </p>
                  <QaWarning issue={qaByLocale.get(loc)} onDismiss={dismissQa} className="pl-1" />
                </div>
              ) : null,
            )}
            {/* 이 줄부터 갈아입는 의상(장면 도중의 #복장 또는 AI 제안 수락분). ✕ 로 개별 해제할 수
                있다 — 대본 태그가 만든 값도 지워지지만, 원본 태그가 남아 있으면 재분석 때 다시 생긴다. */}
            {line.outfits && Object.keys(line.outfits).length > 0 && (
              <p className="text-[11px] pl-1 flex flex-wrap gap-1">
                {Object.entries(line.outfits).map(([nm, o]) => (
                  <span
                    key={nm}
                    className="rounded px-1.5 py-0.5 border border-teal-500/40 text-teal-500 bg-teal-500/5 inline-flex items-center gap-1"
                  >
                    👗 {nm}→{o}
                    <button
                      className="text-teal-600/70 hover:text-teal-400 leading-none"
                      title="이 줄의 의상 지정을 해제합니다(대본에 #복장 태그가 남아 있으면 재분석 때 다시 생깁니다)."
                      onClick={(e) => {
                        e.stopPropagation();
                        setLineOutfit(sceneId, index, nm, undefined);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </p>
            )}
            {/* AI 제안 — 저장된 값이 아니라 검수 대기 항목이다(적용해야 위 칩이 된다). */}
            {suggestions?.map((s) => {
              const char = charMap.get(s.character);
              // renderability 경고는 **렌더 시점 현재 asset 상태**로 계산한다(제안에 스냅샷하지 않는다).
              // '기본'은 대상이 아니다 — 그 pool 이 곧 정답이라 폴백이 곧 정상 표시다.
              const noSprite =
                s.outfit !== '기본' &&
                !Object.values(char?.outfits?.find((o) => o.name === s.outfit)?.expressions ?? {}).some(
                  (id) => !!id,
                );
              return (
                <p key={s.character} className="text-[11px] pl-1 flex flex-wrap items-center gap-1">
                  <span className="rounded px-1.5 py-0.5 border border-sky-500/40 text-sky-500 bg-sky-500/5">
                    🤖 {s.character} → {s.outfit}
                  </span>
                  {s.reason && <span className="text-gray-500">{s.reason}</span>}
                  <button
                    className="chip border-edge text-gray-400 hover:text-gray-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      applySuggestion(sceneId, index, s.character);
                    }}
                  >
                    적용
                  </button>
                  <button
                    className="chip border-edge text-gray-500 hover:text-gray-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      ignoreSuggestion(sceneId, index, s.character);
                    }}
                  >
                    무시
                  </button>
                  {noSprite && (
                    <span className="text-amber-600 w-full">
                      ⚠ 전용 스프라이트가 없어 화면상 기본 의상으로 보일 수 있습니다.
                    </span>
                  )}
                </p>
              );
            })}
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

        {/* 이 줄부터의 의상 전환 — 의상을 쓰는 장면에서만 보인다(후보 0이면 버튼 자체가 없다).
            ⚠️ disabled 버튼은 브라우저에 따라 hover·title 이 뜨지 않으므로 이유는 **감싼 span** 이 갖는다. */}
        {outfitChars.length > 0 && (
          <span
            className="shrink-0"
            title={
              manualOutfitWritable
                ? '이 줄부터 갈아입을 의상을 지정합니다(AI 의상 제안이 있으면 초기화됩니다).'
                : 'CG 구간이라 새 의상 전환을 추가할 수 없습니다(이미 지정된 전환의 해제는 가능합니다).'
            }
          >
            <button
              className={`text-[11px] rounded px-1 py-0.5 border outline-none ${
                !manualOutfitWritable
                  ? 'border-edge text-gray-600 bg-panel2 opacity-40 cursor-not-allowed'
                  : outfitOpen
                    ? 'border-teal-500 text-teal-500 bg-teal-500/10'
                    : 'border-edge text-gray-400 bg-panel2 hover:text-gray-200'
              }`}
              disabled={!manualOutfitWritable}
              onClick={(e) => {
                e.stopPropagation();
                setOutfitOpen((v) => !v);
              }}
            >
              👗
            </button>
          </span>
        )}

        {/* 이 줄까지만 CG — 기존 canonical 마커(#CG끝)를 바로 다음 위치에 꽂는다. 삭제/undo 는 없다.
            ⚠️ 안내는 "재분석 시 사라질 수 있다"까지다 — 재분석을 복구 수단으로 안내하지 않는다. */}
        {canInsertCgEnd && (
          <button
            className="text-[11px] rounded px-1 py-0.5 shrink-0 border border-edge text-gray-400 bg-panel2 hover:text-emerald-400 hover:border-emerald-500 outline-none"
            onClick={(e) => {
              e.stopPropagation();
              insertCgEnd(sceneId, index);
            }}
            title="이 줄까지 CG로 보여주고 다음 줄부터 일반 배경·인물로 돌아갑니다. 원본 대본에 #CG끝을 추가하지 않으면 재분석 시 이 설정이 사라질 수 있습니다."
          >
            🖼끝
          </button>
        )}

        {isDlg && (
          <LineEmotion sceneId={sceneId} index={index} line={line as DialogueLine} scene={scene} charMap={charMap} />
        )}

        {/* 줄 삭제 — 이 지점에 오면 line 은 dialogue/narration 뿐이다(item·cg·bgm 은 위에서 early
            return). 확인창은 기존 파괴적 UX 관용구(window.confirm)를 그대로 쓴다 — 새 모달을 만들지
            않는다. ⚠️ 문구는 "음성 **연결** 제거"다: 이 액션은 Line 객체를 지울 뿐이고 업로드된
            음성 파일 자체는 기존 고아 에셋 정리가 회수한다(즉시 삭제로 읽히면 안 된다). */}
        <button
          className="text-[11px] rounded px-1 py-0.5 shrink-0 border border-edge text-gray-500 bg-panel2 hover:text-rose-500 hover:border-rose-500 outline-none"
          onClick={(e) => {
            e.stopPropagation();
            const preview = line.text.length > 40 ? `${line.text.slice(0, 40)}…` : line.text;
            const head = isDlg ? `${(line as DialogueLine).speaker}: ${preview}` : preview;
            const ok = window.confirm(
              `이 줄을 삭제할까요?\n\n${head}\n\n` +
                `이 줄에 설정된 번역·표정·의상·숨김·음성 연결도 함께 제거됩니다(되돌릴 수 없음).\n` +
                `원본 대본에 이 줄이 남아 있으면 재분석 때 다시 생깁니다.`,
            );
            if (!ok) return; // 취소 — canonical·저장 모두 무변경
            deleteLine(sceneId, index);
          }}
          title="이 줄을 삭제합니다 — 번역·표정·의상·음성 연결도 함께 제거되고 되돌릴 수 없습니다(원본 대본에 남아 있으면 재분석 때 다시 생깁니다)."
        >
          🗑
        </button>
      </div>

      {voiceOpen && speakerChar && (
        <VoiceLab sceneId={sceneId} lineIndex={index} char={speakerChar} line={line as DialogueLine} baseLocale={base} />
      )}

      {/* ⚠️ manualOutfitWritable 을 버튼과 **똑같이** 여기서도 본다 — 패널이 열린 뒤 CG cutoff 가
          이 줄 앞으로 이동하면 다음 렌더에서 사라져 select 가 setLineOutfit 을 못 부른다. */}
      {outfitOpen && manualOutfitWritable && outfitFlagsByChar && (
        <LineOutfitPanel
          sceneId={sceneId}
          index={index}
          line={line}
          outfitChars={outfitChars}
          outfitFlagsByChar={outfitFlagsByChar}
        />
      )}
    </div>
  );
}

/**
 * 대사/지문 한 줄의 의상 전환을 수동으로 추가·변경·해제하는 인라인 패널(👗 로 연다).
 *
 * 저장 대상은 **패널을 연 바로 그 줄의 index** 다 — 패널이 시각적으로 줄 아래 펼쳐진다고 해서 다음
 * 줄에 쓰지 않는다. canonical semantic 은 파서 `#복장`·AI 추천과 동일한 **"이 줄부터 적용"** 이고,
 * 판정은 언제나 outfitFlags 단일 소스다.
 *
 * 캐릭터 후보는 카드가 이미 만든 outfitChars(장면 시작 의상 selector 와 **같은 목록**)를 그대로 쓴다 —
 * 수동 picker 전용 character resolution 을 새로 만들지 않는다. 의상 후보도 기존 characterOutfits 다.
 *
 * select 하나가 추가·변경·해제를 전부 처리하고 **선택 즉시** 기존 canonical 액션 setLineOutfit 을
 * 부른다(드래프트 state·적용/취소 버튼·새 mutation path 없음 — 표정 select·👤 토글과 같은 관용구).
 * 레코드 머지는 setLineOutfit → patchLineOutfit → mergeLineOutfit 이 하므로 **같은 줄의 다른 캐릭터
 * 지정은 보존된다**(여기서 레코드를 직접 조립하지 않는다).
 */
function LineOutfitPanel({
  sceneId,
  index,
  line,
  outfitChars,
  outfitFlagsByChar,
}: {
  sceneId: string;
  index: number;
  line: HideableLine;
  outfitChars: Character[];
  outfitFlagsByChar: Map<string, string[]>;
}) {
  const setLineOutfit = useStore((s) => s.setLineOutfit);
  return (
    <div
      className="mt-1 ml-1 rounded border border-teal-500/30 bg-teal-500/5 px-2 py-1.5 space-y-1"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] text-teal-600">👗 이 줄부터 갈아입기</p>
      {outfitChars.map((c) => {
        const current = line.outfits?.[c.name] ?? '';
        // 표시 전용 힌트 — outfitFlags 는 **그 줄의 override 를 이미 적용한 뒤** 값이라 "전환 직전
        // 의상"이 아니다. 그래서 문구도 "이 줄 적용 후"다(어떤 판정에도 쓰지 않는다).
        const applied = outfitFlagsByChar.get(c.name)?.[index];
        return (
          <div key={c.name} className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 shrink-0">{c.name}</span>
            <select
              className="field text-xs"
              value={current}
              onChange={(e) => setLineOutfit(sceneId, index, c.name, e.target.value || undefined)}
            >
              <option value="">(전환 없음)</option>
              {characterOutfits(c).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {applied && <span className="text-[10px] text-gray-500">이 줄 적용 후: {applied}</span>}
          </div>
        );
      })}
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
