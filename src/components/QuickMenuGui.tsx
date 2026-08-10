import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import {
  DEFAULT_QUICK_MENU_LAYOUT,
  QUICK_BUTTON_STATES,
  QUICK_LIST_SLOTS,
  QUICK_MENU_SLOTS,
  type QuickButtonSlot,
  type QuickButtonState,
} from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';

// Ren'Py imagebutton 은 idle/hover/selected_idle/selected_hover/insensitive 5종뿐 — "누르는 중"
// 상태를 세팅하는 코드가 엔진에 없다(MainMenuGui.tsx 와 동일한 이유). press(클릭) 상태는 그리드에서
// 아예 업로드 칸을 만들지 않는다.
const RENPY_STATES = QUICK_BUTTON_STATES.filter((s) => s.renpySupported);

/** 버튼 실측 규격(188×46, 1920 기준) — 미리보기의 목록 세로 간격 계산에 쓴다. */
const BTN_W = 188;
const BTN_H = 46;
/** 보조 패널 기본 원본 크기(업로드 시 실측 안 남아 있을 때의 가정값 — types.ts quickMenuUi JSDoc 참고). */
const DEFAULT_PANEL_W = 232;
const DEFAULT_PANEL_H = 625;

/**
 * 인게임 우측 퀵메뉴(스킵·자동·저장 등 알약 메뉴) 이미지 GUI 업로드 + 배치 조절 섹션.
 * AssetsTab 의 "🖼 메인 메뉴 GUI" 바로 아래에 낀다. quickMenuUi 가 비어 있으면(정확히는 'menu'
 * 슬롯의 idle 이미지가 없으면) 기존 텍스트 알약 메뉴 그대로 나가므로(회귀 0), 이 섹션은 순수 opt-in UI.
 */
export default function QuickMenuGui() {
  return (
    <section>
      <h3 className="section-title mb-1">🎮 인게임 우측 메뉴 GUI</h3>
      <p className="text-xs text-gray-500 mb-3">
        외부에서 만든 우측 퀵메뉴(스킵·자동·저장 등) 버튼 이미지를 올리면 게임 중 우측 알약 메뉴가 그 이미지로
        바뀝니다. <b>메뉴</b> 슬롯의 기본 이미지를 올려야 전체가 이미지 모드로 전환되며, 나머지 버튼만 올려서는
        아무것도 바뀌지 않습니다 — 아무것도 안 올리면 기존 텍스트 알약 메뉴 그대로 나갑니다. (권장 규격: 버튼
        188×46 투명 PNG, 1920×1080 기준)
      </p>
      <BatchUploadRow />
      <ButtonGrid />
      <PanelRow />
      <LayoutControls />
      <LayoutPreview />
    </section>
  );
}

/** 📦 한 번에 업로드 — 파일명 자동 매칭(주 동선) + 폴더 통째 선택. MainMenuGui.tsx 와 동일 패턴. */
function BatchUploadRow() {
  const importQuickButtons = useStore((s) => s.importQuickButtons);
  const dirRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dirRef.current;
    if (!el) return;
    // webkitdirectory/directory 는 JSX 속성 타입이 없어(표준화 안 됨) DOM 에 직접 세팅해야
    // "폴더 선택" 다이얼로그로 뜬다.
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  const handleDirFiles = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList).filter((f) => f.type.startsWith('image/')) : [];
    if (files.length) void importQuickButtons(files);
    if (dirRef.current) dirRef.current.value = '';
  };

  return (
    <div className="card border-edge p-3 mb-3">
      <p className="text-xs text-gray-500 mb-2">
        <code className="text-accent">GUI_기록_마우스오버.png</code> 처럼 파일명에 슬롯·상태 이름이 들어 있으면
        자동으로 인식해 한 번에 적용합니다(인식 못한 파일은 건너뛰고 알려줍니다).
      </p>
      <div className="flex gap-2">
        <UploadButton
          multiple
          onFiles={(files) => void importQuickButtons(files)}
          label="📦 한 번에 업로드"
          className="btn-primary flex-1"
          title="여러 장을 한 번에 선택해 파일명으로 자동 매칭합니다"
        />
        <button className="btn-ghost" onClick={() => dirRef.current?.click()} title="폴더 하나를 통째로 선택합니다">
          📁 폴더 선택
        </button>
        <input
          ref={dirRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleDirFiles(e.target.files)}
        />
      </div>
    </div>
  );
}

/** 슬롯(10) × 지원 상태(4: 기본/마우스오버/비활성화/활성화) 그리드. */
function ButtonGrid() {
  return (
    <div className="card border-edge p-3 mb-3">
      <p className="text-xs text-gray-500 mb-2">
        클릭(눌림) 상태는 Ren&apos;Py 엔진이 "누르는 중" 이미지를 지원하지 않아 사용되지 않습니다 — 마우스오버
        이미지가 대신 표시됩니다.
      </p>
      <div className="grid grid-cols-[88px_repeat(4,1fr)] gap-x-2 gap-y-3 items-start">
        <div />
        {RENPY_STATES.map((st) => (
          <div key={st.id} className="text-[11px] text-gray-500 font-medium text-center">
            {st.label}
          </div>
        ))}
        {QUICK_MENU_SLOTS.map((slot) => (
          <SlotRow key={slot.id} slot={slot.id} label={slot.label} selectable={!!slot.selectable} />
        ))}
      </div>
    </div>
  );
}

/**
 * 한 슬롯의 라벨 칸 + 상태별 업로드 칸(4개) — CSS grid 안에 바로 배치되는 형제 셀들이라 shorthand
 * fragment 로 반환. 활성화(selected) 칸은 selectable 슬롯(스킵·자동)에서만 실제 업로드 칸이고,
 * 나머지 8개 슬롯은 Ren'Py 가 그 상태로 갈 일이 없어(토글 버튼이 아님) 업로드 자체를 막는다
 * (업로드해도 어차피 안 쓰일 죽은 기능이라 InertCell 로 눈에 띄게 비활성 표시).
 */
function SlotRow({ slot, label, selectable }: { slot: QuickButtonSlot; label: string; selectable: boolean }) {
  const hasIdle = useStore((s) => !!s.project.quickMenuUi?.buttons?.[slot]?.idle);
  return (
    <>
      <div className="flex flex-col justify-center gap-0.5 pt-1">
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
        {!hasIdle && (
          <span
            className={`chip w-fit text-[9px] px-1.5 py-0 ${
              slot === 'menu' ? 'border-accent/40 text-accent' : 'border-amber-500/40 text-amber-600'
            }`}
          >
            {slot === 'menu' ? '업로드 시 전체 이미지 모드 전환' : '텍스트 버튼으로 출력'}
          </span>
        )}
      </div>
      {RENPY_STATES.map((st) => (
        <div key={st.id} className="flex flex-col items-center gap-1">
          {st.id === 'selected' && !selectable ? <InertCell /> : <ButtonCell slot={slot} state={st.id} />}
        </div>
      ))}
    </>
  );
}

/** 활성화(selected) 상태가 의미 없는 슬롯의 자리 — 업로드 불가를 눈에 띄게 표시(대시). */
function InertCell() {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-24 h-6 rounded border border-dashed border-edge/50 flex items-center justify-center text-gray-600 text-xs select-none"
        title="스킵·자동 버튼만 활성화(selected) 이미지를 씁니다"
      >
        —
      </div>
      <span className="text-[9px] text-gray-700">스킵·자동 전용</span>
    </div>
  );
}

/** 슬롯 × 상태 하나의 업로드 칸 — 썸네일(188:46 비율) + 업로드/해제. MainMenuGui.tsx 와 동일 패턴. */
function ButtonCell({ slot, state }: { slot: QuickButtonSlot; state: QuickButtonState }) {
  const importQuickButton = useStore((s) => s.importQuickButton);
  const clearQuickButton = useStore((s) => s.clearQuickButton);
  const assetId = useStore((s) => s.project.quickMenuUi?.buttons?.[slot]?.[state]);
  const url = useAssetUrl(assetId);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-24 h-6 rounded border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center">
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[9px] text-gray-600">없음</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <UploadButton
          onFile={(f) => importQuickButton(slot, state, f)}
          label={url ? '✓ 교체' : '↥'}
          className="btn-ghost !px-1.5 !py-0.5 text-[10px]"
        />
        {url && (
          <button className="text-[9px] text-gray-500 hover:text-rose-600" onClick={() => clearQuickButton(slot, state)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/** 🪧 보조 패널 — 버튼 뒤에 깔리는 선택적 배경판. 없어도 버튼만으로 정상 동작한다. */
function PanelRow() {
  const importQuickPanel = useStore((s) => s.importQuickPanel);
  const clearQuickPanel = useStore((s) => s.clearQuickPanel);
  const panelId = useStore((s) => s.project.quickMenuUi?.panel);
  const url = useAssetUrl(panelId);

  return (
    <div className="card border-edge p-3 mb-3 flex gap-3 items-center">
      <div className="w-16 aspect-[232/625] rounded border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[9px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-contain" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200">🪧 보조 패널</span>
        <p className="text-[10px] text-gray-500 mt-0.5">
          버튼 뒤에 깔리는 보조 패널입니다. 선택 사항 — 안 올리면 패널 없이 버튼만 표시됩니다.
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton
          onFile={(f) => importQuickPanel(f)}
          label={url ? '✓ 교체' : '↥ 업로드'}
          className="btn-ghost text-[11px]"
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearQuickPanel()}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 숫자 입력 공용 필드 — MainMenuGui.tsx 의 NumField 와 동일(로컬 텍스트 상태, blur 시에만 커밋,
 * 빈 값/NaN 이면 마지막 유효 값으로 되돌린다). 공용 export 가 없는 파일 로컬 컴포넌트라 그대로 복제.
 */
function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <input
        type="number"
        className="field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (text.trim() === '' || !Number.isFinite(n)) {
            setText(String(value));
            return;
          }
          onCommit(n);
        }}
      />
    </label>
  );
}

/** 📐 배치 조절 — 패널 X/Y, 버튼 X, 메뉴 Y, 목록 시작 Y, 목록 간격. */
function LayoutControls() {
  const setQuickMenuLayout = useStore((s) => s.setQuickMenuLayout);
  const rawLayout = useStore((s) => s.project.quickMenuUi?.layout);
  const layout = { ...DEFAULT_QUICK_MENU_LAYOUT, ...rawLayout };

  return (
    <div className="card border-edge p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-200">📐 배치 조절</span>
        <button className="btn-ghost text-[11px]" onClick={() => setQuickMenuLayout(DEFAULT_QUICK_MENU_LAYOUT)}>
          기본값으로
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumField label="패널 가로(X)" value={layout.panelX} onCommit={(n) => setQuickMenuLayout({ panelX: n })} />
        <NumField label="패널 세로(Y)" value={layout.panelY} onCommit={(n) => setQuickMenuLayout({ panelY: n })} />
        <NumField label="버튼 가로(X)" value={layout.btnX} onCommit={(n) => setQuickMenuLayout({ btnX: n })} />
        <NumField label="메뉴 세로(Y)" value={layout.menuY} onCommit={(n) => setQuickMenuLayout({ menuY: n })} />
        <NumField label="목록 시작 Y" value={layout.listY} onCommit={(n) => setQuickMenuLayout({ listY: n })} />
        <NumField label="목록 간격" value={layout.listStep} onCommit={(n) => setQuickMenuLayout({ listStep: n })} />
      </div>
    </div>
  );
}

/**
 * 🔍 배치 미리보기 — Ren'Py 를 켜지 않고도 1920×1080 절대좌표를 그대로 축소해 보여준다.
 * MainMenuGui.tsx 의 LayoutPreview 와 같은 방식(레이어 하나만 scale(컨테이너 실측 폭/1920)해서
 * 통째로 줄인다). 스펙 좌표가 "펼친 상태"(메뉴 버튼을 눌러 나머지 9개가 나온 상태) 기준이라
 * 이 미리보기는 접힘 애니메이션 없이 항상 패널 + 10개 버튼을 전부 보여준다.
 */
function LayoutPreview() {
  // 퀵메뉴는 ESC 메뉴와 달리 실제로는 장면(배경) 위에 얹혀서 뜬다 — menuArt.game 이 없어진 지금은
  // 미리보기 배경으로 첫 장면의 배경을 재사용한다(없으면 어두운 판 위에 버튼만 보인다).
  const bgId = useStore((s) => s.project.scenes[0]?.backgroundAssetId);
  const panelId = useStore((s) => s.project.quickMenuUi?.panel);
  const panelWidth = useStore((s) => s.project.quickMenuUi?.panelWidth);
  const panelHeight = useStore((s) => s.project.quickMenuUi?.panelHeight);
  const buttons = useStore((s) => s.project.quickMenuUi?.buttons);
  const rawLayout = useStore((s) => s.project.quickMenuUi?.layout);

  const layout = { ...DEFAULT_QUICK_MENU_LAYOUT, ...rawLayout };
  const panelW = panelWidth ?? DEFAULT_PANEL_W;
  const panelH = panelHeight ?? DEFAULT_PANEL_H;
  const bgUrl = useAssetUrl(bgId);
  const panelUrl = useAssetUrl(panelId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setScale(w / 1920);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <p className="label mb-1">🔍 배치 미리보기</p>
      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-lg border border-edge overflow-hidden bg-ink"
      >
        {bgUrl ? (
          <img src={bgUrl} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-600">
            게임 메뉴 배경 미업로드
          </div>
        )}
        {scale > 0 && (
          <div
            style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {panelUrl && (
              <img
                src={panelUrl}
                className="object-contain"
                style={{ position: 'absolute', left: layout.panelX, top: layout.panelY, width: panelW, height: panelH }}
              />
            )}
            <PreviewButton
              label="메뉴"
              idleId={buttons?.menu?.idle}
              boxStyle={{ position: 'absolute', left: layout.btnX, top: layout.menuY, width: BTN_W, height: BTN_H }}
            />
            {QUICK_LIST_SLOTS.map((slot, i) => (
              <PreviewButton
                key={slot.id}
                label={slot.label}
                idleId={buttons?.[slot.id]?.idle}
                boxStyle={{
                  position: 'absolute',
                  left: layout.btnX,
                  top: layout.listY + i * layout.listStep,
                  width: BTN_W,
                  height: BTN_H,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500 mt-1 text-center">
        1920×1080 기준 배치 — 실제 게임 화면과 같은 비율입니다. 패널·10개 버튼을 모두 펼친 상태로 표시합니다.
      </p>
    </div>
  );
}

/**
 * 미리보기의 버튼 하나. 업로드된 idle 이미지가 있으면(이미지 우선 규칙) 그림, 없으면 알약 모양
 * placeholder 에 슬롯 이름을 적어 자리를 보여준다.
 */
function PreviewButton({
  label,
  idleId,
  boxStyle,
}: {
  label: string;
  idleId: string | undefined;
  boxStyle: CSSProperties;
}) {
  const url = useAssetUrl(idleId);
  if (url) {
    return <img src={url} style={boxStyle} className="object-contain" />;
  }
  return (
    <div
      style={{ ...boxStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-medium truncate px-2"
    >
      {label}
    </div>
  );
}
