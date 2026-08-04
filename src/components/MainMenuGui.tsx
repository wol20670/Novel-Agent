import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  DEFAULT_MAIN_MENU_LAYOUT,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  type MenuButtonSlot,
  type MenuButtonState,
} from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';

// Ren'Py imagebutton 은 idle/hover/selected_idle/selected_hover/insensitive 5종뿐 — "누르는 중"
// 상태를 세팅하는 코드가 엔진에 없다(activate_ 프리픽스는 레거시, 어디서도 세팅 안 됨). 그래서
// press(클릭) 상태는 그리드에서 아예 업로드 칸을 만들지 않는다(어차피 반영 안 될 업로드는 죽은 기능).
const RENPY_STATES = MENU_BUTTON_STATES.filter((s) => s.renpySupported);

/** 버튼 실측 규격(420×78) — 미리보기의 버튼 간 세로 간격 누적 계산에 쓴다. */
const BTN_W = 420;
const BTN_H = 78;

/**
 * 메인 메뉴 GUI(로고·버튼) 업로드 + 배치 조절 섹션. AssetsTab 의 "🎬 타이틀·메뉴 배경" 바로 아래에 낀다.
 * mainMenuUi 가 비어 있으면 기존 텍스트 메뉴 그대로 나가므로(회귀 0), 이 섹션은 순수 opt-in UI.
 */
export default function MainMenuGui() {
  return (
    <section>
      <h3 className="section-title mb-1">🖼 메인 메뉴 GUI (로고 · 버튼)</h3>
      <p className="text-xs text-gray-500 mb-3">
        외부에서 만든 타이틀 로고와 메뉴 버튼 이미지를 올리면 게임 메인 메뉴가 그 이미지로 바뀝니다. 안 올린 메뉴는
        지금처럼 글자 버튼으로 나옵니다. (권장 규격: 버튼 420×78 투명 PNG, 1920×1080 기준)
      </p>
      <BatchUploadRow />
      <ButtonGrid />
      <LogoRow />
      <LayoutControls />
      <LayoutPreview />
    </section>
  );
}

/** 📦 한 번에 업로드 — 파일명 자동 매칭(주 동선) + 폴더 통째 선택. */
function BatchUploadRow() {
  const importMenuButtons = useStore((s) => s.importMenuButtons);
  const dirRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dirRef.current;
    if (!el) return;
    // webkitdirectory/directory 는 JSX 속성 타입이 없어(표준화 안 됨) DOM 에 직접 세팅해야
    // "폴더 선택" 다이얼로그로 뜬다 — 파일 여러 장 고르는 것과 UX 가 달라 버튼을 분리했다.
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  const handleDirFiles = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList).filter((f) => f.type.startsWith('image/')) : [];
    if (files.length) void importMenuButtons(files);
    if (dirRef.current) dirRef.current.value = '';
  };

  return (
    <div className="card border-edge p-3 mb-3">
      <p className="text-xs text-gray-500 mb-2">
        <code className="text-accent">GUI_처음부터_기본.png</code> 처럼 파일명에 슬롯·상태 이름이 들어 있으면 자동으로
        인식해 한 번에 적용합니다(인식 못한 파일은 건너뛰고 알려줍니다).
      </p>
      <div className="flex gap-2">
        <UploadButton
          multiple
          onFiles={(files) => void importMenuButtons(files)}
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

/** 슬롯(6) × 지원 상태(3: 기본/마우스오버/비활성화) 그리드. */
function ButtonGrid() {
  return (
    <div className="card border-edge p-3 mb-3">
      <p className="text-xs text-gray-500 mb-2">
        클릭(눌림) 상태는 Ren&apos;Py 엔진이 "누르는 중" 이미지를 지원하지 않아 사용되지 않습니다 — 마우스오버
        이미지가 대신 표시됩니다.
      </p>
      <div className="grid grid-cols-[88px_repeat(3,1fr)] gap-x-2 gap-y-3 items-start">
        <div />
        {RENPY_STATES.map((st) => (
          <div key={st.id} className="text-[11px] text-gray-500 font-medium text-center">
            {st.label}
          </div>
        ))}
        {MAIN_MENU_SLOTS.map((slot) => (
          <SlotRow key={slot.id} slot={slot.id} label={slot.label} />
        ))}
      </div>
    </div>
  );
}

/** 한 슬롯의 라벨 칸 + 상태별 업로드 칸(3개) — CSS grid 안에 바로 배치되는 형제 셀들이라 Fragment 로 반환. */
function SlotRow({ slot, label }: { slot: MenuButtonSlot; label: string }) {
  const hasIdle = useStore((s) => !!s.project.mainMenuUi?.buttons?.[slot]?.idle);
  return (
    <>
      <div className="flex flex-col justify-center gap-0.5 pt-1">
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
        {!hasIdle && (
          <span className="chip border-amber-500/40 text-amber-600 w-fit text-[9px] px-1.5 py-0">
            텍스트 버튼으로 출력
          </span>
        )}
      </div>
      {RENPY_STATES.map((st) => (
        <div key={st.id} className="flex flex-col items-center gap-1">
          <ButtonCell slot={slot} state={st.id} />
          {slot === 'continue' && st.id === 'disabled' && (
            <span className="text-[9px] text-gray-600 text-center leading-tight">저장 데이터 없을 때</span>
          )}
        </div>
      ))}
    </>
  );
}

/** 슬롯 × 상태 하나의 업로드 칸 — 썸네일(420:78 비율) + 업로드/해제. */
function ButtonCell({ slot, state }: { slot: MenuButtonSlot; state: MenuButtonState }) {
  const importMenuButton = useStore((s) => s.importMenuButton);
  const clearMenuButton = useStore((s) => s.clearMenuButton);
  const assetId = useStore((s) => s.project.mainMenuUi?.buttons?.[slot]?.[state]);
  const url = useAssetUrl(assetId);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-28 h-[26px] rounded border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center">
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[9px] text-gray-600">없음</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <UploadButton
          onFile={(f) => importMenuButton(slot, state, f)}
          label={url ? '✓ 교체' : '↥'}
          className="btn-ghost !px-1.5 !py-0.5 text-[10px]"
        />
        {url && (
          <button className="text-[9px] text-gray-500 hover:text-rose-600" onClick={() => clearMenuButton(slot, state)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/** 🎬 타이틀 로고 — AssetsTab 의 MenuArtRow 와 같은 모양(썸네일+업로드/해제) + 좌표 3개. */
function LogoRow() {
  const importTitleLogo = useStore((s) => s.importTitleLogo);
  const clearTitleLogo = useStore((s) => s.clearTitleLogo);
  const setMainMenuLayout = useStore((s) => s.setMainMenuLayout);
  const logoId = useStore((s) => s.project.mainMenuUi?.logo);
  const rawLayout = useStore((s) => s.project.mainMenuUi?.layout);
  const layout = { ...DEFAULT_MAIN_MENU_LAYOUT, ...rawLayout };
  const url = useAssetUrl(logoId);

  return (
    <div className="card border-edge p-3 mb-3 flex flex-col gap-3">
      <div className="flex gap-3 items-center">
        <div className="w-32 aspect-[3/1] rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
          {url ? <img src={url} className="w-full h-full object-contain" /> : '미업로드'}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-200">🎬 타이틀 로고</span>
        </div>
        <div className="flex flex-col gap-1 shrink-0 w-24">
          <UploadButton
            onFile={(f) => importTitleLogo(f)}
            label={url ? '✓ 교체' : '↥ 업로드'}
            className="btn-ghost text-[11px]"
          />
          {url && (
            <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearTitleLogo()}>
              해제
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumField label="가로 위치(X)" value={layout.logoX} onCommit={(n) => setMainMenuLayout({ logoX: n })} />
        <NumField label="세로 위치(Y)" value={layout.logoY} onCommit={(n) => setMainMenuLayout({ logoY: n })} />
        <NumField label="너비" value={layout.logoWidth} onCommit={(n) => setMainMenuLayout({ logoWidth: n })} />
      </div>
    </div>
  );
}

/** 📐 배치 조절 — 버튼 x/y/gap/hoverShiftX. */
function LayoutControls() {
  const setMainMenuLayout = useStore((s) => s.setMainMenuLayout);
  const rawLayout = useStore((s) => s.project.mainMenuUi?.layout);
  const layout = { ...DEFAULT_MAIN_MENU_LAYOUT, ...rawLayout };

  return (
    <div className="card border-edge p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-200">📐 배치 조절</span>
        <button className="btn-ghost text-[11px]" onClick={() => setMainMenuLayout(DEFAULT_MAIN_MENU_LAYOUT)}>
          기본값으로
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumField label="가로 위치" value={layout.x} onCommit={(n) => setMainMenuLayout({ x: n })} />
        <NumField label="세로 시작" value={layout.y} onCommit={(n) => setMainMenuLayout({ y: n })} />
        <NumField label="버튼 간격" value={layout.gap} onCommit={(n) => setMainMenuLayout({ gap: n })} />
        <NumField label="마우스오버 이동" value={layout.hoverShiftX} onCommit={(n) => setMainMenuLayout({ hoverShiftX: n })} />
      </div>
    </div>
  );
}

/**
 * 숫자 입력 공용 필드 — 로컬 텍스트 상태로 타이핑 중간(빈 문자열 등)은 그대로 두고, blur 시에만
 * 유효한 값이면 커밋한다. 빈 값/NaN 이면 커밋하지 않고 마지막 유효 값으로 되돌려(입력 중 실수로
 * 레이아웃이 깨지는 걸 막는다).
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

/**
 * 🔍 배치 미리보기 — Ren'Py 를 켜지 않고도 1920×1080 절대좌표를 그대로 축소해 보여준다.
 * 레이어 하나만 scale(컨테이너 실측 폭/1920)해서 통째로 줄이는 방식이라, 요소마다 좌표를 따로
 * 계산할 필요가 없고 실제 출력과 어긋날 여지도 없다.
 */
function LayoutPreview() {
  const bgId = useStore((s) => s.project.menuArt?.main);
  const logoId = useStore((s) => s.project.mainMenuUi?.logo);
  const buttons = useStore((s) => s.project.mainMenuUi?.buttons);
  const rawLayout = useStore((s) => s.project.mainMenuUi?.layout);
  const layout = { ...DEFAULT_MAIN_MENU_LAYOUT, ...rawLayout };
  const bgUrl = useAssetUrl(bgId);
  const logoUrl = useAssetUrl(logoId);

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
            타이틀 배경 미업로드
          </div>
        )}
        {scale > 0 && (
          <div
            style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                style={{ position: 'absolute', left: layout.logoX, top: layout.logoY, width: layout.logoWidth, height: 'auto' }}
              />
            )}
            {MAIN_MENU_SLOTS.map((slot, i) => (
              <PreviewButton
                key={slot.id}
                label={slot.label}
                idleId={buttons?.[slot.id]?.idle}
                left={layout.x}
                top={layout.y + i * (BTN_H + layout.gap)}
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500 mt-1 text-center">
        1920×1080 기준 배치 — 실제 게임 화면과 같은 비율입니다.
      </p>
    </div>
  );
}

/** 미리보기의 버튼 하나 — 업로드된 idle 이미지가 있으면 그림, 없으면 자리 그대로 라벨 텍스트(글자 버튼 시각화). */
function PreviewButton({ label, idleId, left, top }: { label: string; idleId: string | undefined; left: number; top: number }) {
  const url = useAssetUrl(idleId);
  return (
    <div style={{ position: 'absolute', left, top, width: BTN_W, height: BTN_H }} className="flex items-center">
      {url ? (
        <img src={url} style={{ width: BTN_W, height: BTN_H }} className="object-contain" />
      ) : (
        <span className="text-white font-bold" style={{ fontSize: 30, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {label}
        </span>
      )}
    </div>
  );
}
