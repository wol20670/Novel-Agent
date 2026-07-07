import { useState } from 'react';
import { useStore } from '../store';
import { SCENE_STATUS_LABEL, effectiveExpressions, emojiFor, baseLocaleOf, LOCALE_LABEL, type SceneStatus, type Expression, type Line, type Locale } from '../types';
import { inferEmotion } from '../generators/emotion';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import VoiceLab from './VoiceLab';

const STATUS_BTN: Record<SceneStatus, { on: string; dot: string }> = {
  review: { on: 'bg-gray-500/15 text-gray-300 border-gray-400', dot: 'bg-gray-400' },
  approved: { on: 'bg-emerald-500/15 text-emerald-700 border-emerald-500', dot: 'bg-emerald-500' },
  needs_fix: { on: 'bg-amber-500/15 text-amber-700 border-amber-500', dot: 'bg-amber-500' },
};
const STATUSES = Object.keys(SCENE_STATUS_LABEL) as SceneStatus[];

export default function SceneCard({ sceneId, index }: { sceneId: string; index: number }) {
  const scene = useStore((s) => s.project.scenes.find((x) => x.id === sceneId))!;
  const update = useStore((s) => s.updateScene);
  const setStatus = useStore((s) => s.setSceneStatus);
  const select = useStore((s) => s.selectScene);
  const selected = useStore((s) => s.selectedSceneId === sceneId);
  const importBg = useStore((s) => s.importBackground);
  const importBgm = useStore((s) => s.importBgm);
  const bgUrl = useAssetUrl(scene.backgroundAssetId);
  // 협업 — 지금 이 장면을 보고 있는 상대방(있으면 편집 충돌을 피하라는 신호).
  const peersHere = useStore((s) => s.collabPeers.filter((p) => p.selectedSceneId === sceneId));

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

      {/* 대사/지문 미리보기 */}
      <div className="bg-ink/70 rounded-lg border border-edge p-3 max-h-44 overflow-y-auto text-sm mb-3 space-y-0.5">
        {scene.lines.length === 0 && <span className="text-gray-600 text-xs">대사 없음</span>}
        {scene.lines.map((l, i) => (
          <LineRow
            key={i}
            sceneId={sceneId}
            index={i}
            line={l}
            background={scene.background}
            direction={scene.direction}
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

type DialogueLine = Extract<Line, { kind: 'dialogue' }>;

/**
 * 대사/지문 한 줄 — 미리보기 + 인라인 편집.
 * 평소엔 원문(+번역 EN/JA를 회색으로) 표시. ✏️ 를 누르면 원문·번역을 실시간 수정한다.
 * 표정 셀렉트(대사만)는 오른쪽에, ✏️ 는 그 왼쪽에 둔다.
 */
function LineRow({
  sceneId,
  index,
  line,
  background,
  direction,
}: {
  sceneId: string;
  index: number;
  line: Line;
  background?: string;
  direction: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const setText = useStore((s) => s.setLineText);
  const setTr = useStore((s) => s.setLineTranslation);
  const base = useStore((s) => baseLocaleOf(s.project));
  const characters = useStore((s) => s.project.characters);
  // 번역 대상 = base 를 제외한 지원 로케일(en·ja) — 엑셀 C/D열과 동일.
  const targets = (Object.keys(LOCALE_LABEL) as Locale[]).filter((l) => l !== base);
  // 성우 테스트는 단일 화자 대사 + 그 화자가 주인공(내레이션 전용)이 아닐 때만(히로인 등).
  const isSingleSpeaker = line.kind === 'dialogue' && !line.members?.length;
  const speakerChar = isSingleSpeaker ? characters.find((c) => c.name === (line as DialogueLine).speaker) : undefined;
  const canVoice = !!speakerChar && !speakerChar.isProtagonist;

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
            title="성우 음성 테스트(Supertone)"
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

        {isDlg && (
          <LineEmotion
            sceneId={sceneId}
            index={index}
            line={line as DialogueLine}
            background={background}
            direction={direction}
          />
        )}
      </div>

      {voiceOpen && speakerChar && (
        <VoiceLab sceneId={sceneId} lineIndex={index} char={speakerChar} line={line as DialogueLine} baseLocale={base} />
      )}
    </div>
  );
}

/** 대사 한 줄의 표정 선택 — 기본 "자동"(대사 분석 결과), 직접 6종 중 지정 가능. */
function LineEmotion({
  sceneId,
  index,
  line,
  background,
  direction,
}: {
  sceneId: string;
  index: number;
  line: DialogueLine;
  background?: string;
  direction: string[];
}) {
  const setEmotion = useStore((s) => s.setLineEmotion);
  const exprList = effectiveExpressions(useStore((s) => s.project.expressions));
  // 화면에 안 서는 화자(주인공 등)는 표정 의미가 없으니 선택기를 숨긴다.
  const narrationOnly = useStore(
    (s) => !line.members?.length && !!s.project.characters.find((c) => c.name === line.speaker)?.isProtagonist,
  );
  if (narrationOnly) return null;

  const auto = inferEmotion(line.text, { direction, background });
  const value = (line.emotion as Expression | undefined) ?? '';
  return (
    <select
      className={`text-[11px] rounded px-1 py-0.5 shrink-0 border outline-none ${
        value ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400 bg-panel2'
      }`}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setEmotion(sceneId, index, (e.target.value || undefined) as Expression | undefined)}
      title="이 대사의 표정 — 자동(대사 분석) 또는 직접 선택"
    >
      <option value="">자동 · {emojiFor(auto)}{auto}</option>
      {exprList.map((ex) => (
        <option key={ex} value={ex}>
          {emojiFor(ex)} {ex}
        </option>
      ))}
    </select>
  );
}
