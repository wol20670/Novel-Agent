import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { effectiveExpressions, emojiFor } from '../types';

/**
 * 😀 표정 세트 편집 — 추가/이름변경/삭제('기본'은 고정) + 표정별 설명(선택, AI 자동 배정 참고용).
 * AssetsTab.tsx 에서 분리(원래 ExpressionChip/ExpressionEditor, ~1204줄까지 커져 QuickMenuGui.tsx
 * 선례를 따라 추출). 전 캐릭터 공통 — 특정 캐릭터가 아니라 프로젝트 전체의 표정 이름 목록을 다룬다.
 *
 * 예전엔 칩을 flex-wrap 으로 촘촘히 배치했는데, 설명 입력란을 넣을 자리가 없었다 — 세로 목록(칩 + 설명
 * 한 줄)으로 바꿔 표정마다 한 줄씩 차지하게 했다.
 */
export default function ExpressionSetEditor() {
  const exprs = effectiveExpressions(useStore((s) => s.project.expressions));
  const notes = useStore((s) => s.project.expressionNotes);
  const addExpression = useStore((s) => s.addExpression);
  const renameExpression = useStore((s) => s.renameExpression);
  const removeExpression = useStore((s) => s.removeExpression);
  const setExpressionNote = useStore((s) => s.setExpressionNote);
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
      <p className="text-[10px] text-gray-500 leading-snug mb-2">
        설명은 선택 사항이고 <b className="text-gray-300">🎭 표정 자동 배정(AI)</b>에서만 참고합니다 — 전부 채울
        필요 없이 이름만으로 헷갈리는 것만 적으세요(미소 계열처럼: "옅은 미소"와 "장난스러운 미소"는 이름만 봐선
        AI 도 사람도 못 가릅니다).
      </p>
      <div className="flex flex-col gap-1.5">
        {exprs.map((ex) => (
          <div key={ex} className="flex items-center gap-2">
            <ExpressionChip
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
            <ExpressionNoteField
              value={notes?.[ex] ?? ''}
              onCommit={(v) => setExpressionNote(ex, v)}
            />
          </div>
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
        className="field text-xs w-24 py-0.5 shrink-0"
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
      // w-24 로는 '장난스러운 미소' 같은 24종 세트의 이름이 잘려 어느 행인지 알 수가 없다(실기 확인).
      // 한글 8자까지 들어가는 폭으로 넓히고, 그래도 넘치면 title 로 전체를 볼 수 있게 한다.
      className={`inline-flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-xs shrink-0 w-40 ${
        fixed ? 'bg-ink/60 text-gray-400' : 'bg-ink'
      }`}
    >
      <span className="shrink-0">{emojiFor(name)}</span>
      <button
        className="flex-1 min-w-0 truncate text-left hover:text-accent disabled:cursor-default"
        disabled={fixed}
        onClick={() => {
          setVal(name);
          setEditing(true);
        }}
        title={fixed ? `${name} — 기본 표정은 고정` : `${name} — 눌러서 이름 변경`}
      >
        {name}
      </button>
      {!fixed && (
        <button
          className="shrink-0 hover:text-rose-500 leading-none text-gray-600"
          onClick={onRemove}
          title="이 표정 삭제"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** 표정 한 종의 설명 입력란 — blur 시에만 커밋(MainMenuGui.tsx 의 TextField 와 같은 패턴). */
function ExpressionNoteField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      type="text"
      className="field text-xs flex-1 !py-1"
      value={text}
      placeholder="눈을 가늘게 뜨고 비웃는 표정"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() !== value.trim()) onCommit(text.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
