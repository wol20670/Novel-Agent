import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import {
  DEFAULT_MAIN_MENU_PRESET,
  MAIN_MENU_PRESETS,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  type MainMenuPresetDef,
  type MainMenuPresetId,
  type MenuButtonSlot,
  type MenuButtonState,
} from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import { INHERIT_FONT, useFontCatalog, useFontFamily } from './fontHooks';
import type { FontPreset } from './fontHooks';

// Ren'Py imagebutton 은 idle/hover/selected_idle/selected_hover/insensitive 5종뿐 — "누르는 중"
// 상태를 세팅하는 코드가 엔진에 없다(activate_ 프리픽스는 레거시, 어디서도 세팅 안 됨). 그래서
// press(클릭) 상태는 그리드에서 아예 업로드 칸을 만들지 않는다(어차피 반영 안 될 업로드는 죽은 기능).
const RENPY_STATES = MENU_BUTTON_STATES.filter((s) => s.renpySupported);

/** 버튼 실측 규격(420×78) — 미리보기의 버튼 간 세로 간격 누적 계산에 쓴다. */
const BTN_W = 420;
const BTN_H = 78;
/** 하단 가로 프리셋의 항목 고정폭(screensRpy.ts HORIZONTAL_ITEM_WIDTH 와 단일 소스로 맞춰야 함). */
const HORIZONTAL_ITEM_WIDTH = 270;

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
        아래 프리셋의 글자 버튼으로 나옵니다. (권장 규격: 버튼 420×78 투명 PNG, 1920×1080 기준)
      </p>
      <PresetPicker />
      <BatchUploadRow />
      <ButtonGrid />
      <LogoRow />
      <LabelEditor />
      <MenuFontControls />
      <OutlineToggle />
      <InfoLinksToggle />
      <LayoutControls />
      <LayoutPreview />
    </section>
  );
}

/**
 * 🎨 배치 프리셋 선택 — 최상단 주 동선. 카드 5장 + CSS 도식 썸네일. 사용자가 layout·labels 를
 * 이미 손댄 상태에서 프리셋을 바꾸면 그 오버라이드가 초기화되므로(setMainMenuPreset 계약) 확인창을
 * 띄운다 — 단, 아무것도 안 건드렸으면(오버라이드가 비어있으면) 잃을 게 없으니 바로 적용한다.
 */
function PresetPicker() {
  const currentPreset = useStore((s) => s.project.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET);
  const setMainMenuPreset = useStore((s) => s.setMainMenuPreset);

  const choose = (id: MainMenuPresetId) => {
    if (id === currentPreset) return;
    // 클릭 시점의 최신 오버라이드 여부만 확인하면 되는 값이라(렌더에 영향 없음) 구독 대신
    // getState() 로 비반응 읽기 — 리렌더 폭탄을 만들지 않는다.
    const mainMenuUi = useStore.getState().project.mainMenuUi;
    const hasOverride = !!(mainMenuUi?.layout || mainMenuUi?.labels);
    if (hasOverride && !confirm('조절한 배치·문구가 프리셋 기본값으로 초기화됩니다. 계속할까요?')) return;
    setMainMenuPreset(id);
  };

  return (
    <div className="mb-3">
      <p className="label mb-1.5">🎨 배치 프리셋</p>
      <div className="grid grid-cols-5 gap-2">
        {Object.values(MAIN_MENU_PRESETS).map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => choose(preset.id)}
            title={preset.hint}
            className={`card p-2 text-left flex flex-col gap-1.5 ${
              preset.id === currentPreset ? 'border-accent shadow-lg shadow-accent2/10' : 'border-edge hover:border-accent/40'
            }`}
          >
            <PresetThumb preset={preset} />
            <span className="text-[10px] font-medium text-gray-200 leading-tight">{preset.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mt-1">{MAIN_MENU_PRESETS[currentPreset].hint}</p>
    </div>
  );
}

/**
 * 프리셋 배치를 한눈에 구분시키는 CSS 도식(실제 아트 아님) — 16:9 박스 안에 회색 막대 6개를
 * align/direction 에 맞춰 좌측·우측 세로 또는 하단 가로로 배치. dualLabel 이면 막대 아래 얇은 선,
 * marker 면 막대 왼쪽에 작은 ▶.
 */
function PresetThumb({ preset }: { preset: MainMenuPresetDef }) {
  const vertical = preset.direction === 'vertical';
  const items = Array.from({ length: 6 }, (_, i) => (
    <div
      key={i}
      className="flex items-center gap-[2px]"
      style={{ flexDirection: vertical && preset.align === 'right' ? 'row-reverse' : 'row' }}
    >
      {preset.marker === 'triangle' && <span className="text-[5px] leading-none text-accent/80 shrink-0">▶</span>}
      <div className="flex flex-col gap-[1px]" style={{ alignItems: vertical ? undefined : 'center' }}>
        <div className="bg-gray-400/70 rounded-[1px]" style={{ width: vertical ? 20 : 7, height: vertical ? 3 : 12 }} />
        {preset.dualLabel && (
          <div className="bg-gray-400/40 rounded-[1px]" style={{ width: vertical ? 13 : 7, height: 2 }} />
        )}
      </div>
    </div>
  ));

  const wrapStyle: CSSProperties = vertical
    ? {
        position: 'absolute',
        top: 4,
        bottom: 4,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: preset.align === 'right' ? 'flex-end' : 'flex-start',
        ...(preset.align === 'right' ? { right: 4 } : { left: 4 }),
      }
    : {
        position: 'absolute',
        left: 4,
        right: 4,
        bottom: 4,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: 3,
      };

  return (
    <div className="relative w-full aspect-video rounded bg-ink border border-edge/60 overflow-hidden">
      <div style={wrapStyle}>{items}</div>
    </div>
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
  const presetId = useStore((s) => s.project.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET);
  const rawLayout = useStore((s) => s.project.mainMenuUi?.layout);
  // 기본값은 이제 고정된 DEFAULT_MAIN_MENU_LAYOUT 이 아니라 "선택된 프리셋의 layout"(types.ts
  // mainMenuLayout() 과 같은 규칙) — 안 맞추면 프리셋을 우측/하단으로 바꿔도 숫자칸엔 옛 좌측 세로
  // 기본값이 표시돼(예: right-dual 인데 x=96) 실제 렌더와 어긋나 보인다.
  const layout = { ...MAIN_MENU_PRESETS[presetId].layout, ...rawLayout };
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
  const presetId = useStore((s) => s.project.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET);
  const rawLayout = useStore((s) => s.project.mainMenuUi?.layout);
  const presetLayout = MAIN_MENU_PRESETS[presetId].layout;
  const layout = { ...presetLayout, ...rawLayout };

  return (
    <div className="card border-edge p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-200">📐 배치 조절</span>
        {/* "기본값" = 지금 고른 프리셋의 기본 좌표(항상 DEFAULT_MAIN_MENU_LAYOUT 이 아님). */}
        <button className="btn-ghost text-[11px]" onClick={() => setMainMenuLayout(presetLayout)}>
          프리셋 기본값으로
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
 * 텍스트 입력 공용 필드(NumField 와 같은 blur 커밋 결) — 단, 빈 문자열도 유효한 커밋이다
 * (오버라이드 삭제 = 프리셋 기본값 복귀, setMenuLabel 계약).
 */
function TextField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      type="text"
      className="field text-xs !py-1"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
    />
  );
}

/**
 * ✏️ 메뉴 문구 편집 — 슬롯 6행 × 주/부 라벨. placeholder 로 프리셋 기본값을 보여줘 "비워두면 이
 * 값이 쓰인다"는 게 눈에 보이게 한다. 부 라벨 칸은 1줄 프리셋(dualLabel=false)에선 안 쓰이니
 * 아예 숨겨 혼란을 없앤다.
 */
function LabelEditor() {
  const presetId = useStore((s) => s.project.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET);
  const overrides = useStore((s) => s.project.mainMenuUi?.labels);
  const setMenuLabel = useStore((s) => s.setMenuLabel);
  const preset = MAIN_MENU_PRESETS[presetId];

  return (
    <div className="card border-edge p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-200">✏️ 메뉴 문구 편집</span>
      </div>
      {!preset.dualLabel && (
        <p className="text-[10px] text-gray-500 mb-2">
          이 프리셋은 버튼이 1줄이라 부 라벨(설명문)은 쓰이지 않습니다.
        </p>
      )}
      <div
        className={`grid gap-x-2 gap-y-1.5 items-center ${
          preset.dualLabel ? 'grid-cols-[64px_1fr_1fr]' : 'grid-cols-[64px_1fr]'
        }`}
      >
        <div />
        <span className="text-[10px] text-gray-500">주 라벨</span>
        {preset.dualLabel && <span className="text-[10px] text-gray-500">부 라벨</span>}
        {MAIN_MENU_SLOTS.map((slot) => {
          const presetLabel = preset.labels[slot.id];
          const override = overrides?.[slot.id];
          return (
            <Fragment key={slot.id}>
              <span className="text-[11px] text-gray-300">{slot.label}</span>
              <TextField
                value={override?.main ?? ''}
                placeholder={presetLabel?.main ?? slot.label}
                onCommit={(v) => setMenuLabel(slot.id, 'main', v)}
              />
              {preset.dualLabel && (
                <TextField
                  value={override?.sub ?? ''}
                  placeholder={presetLabel?.sub ?? ''}
                  onCommit={(v) => setMenuLabel(slot.id, 'sub', v)}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 🔤 메뉴 글꼴(주/부) — LeftPanel 의 FontControls 와 같은 카탈로그(GCS 매니페스트)를 쓰지만
 * 대상 필드가 mainMenuUi.menuFontId/menuSubFontId 로 다르다(guiOverrides 가 아님) — 로딩·그룹핑
 * 로직만 fontHooks 로 공용화하고 select 두 개는 여기서 직접 그린다(generate.ts 의 실제 폴백:
 * 주 미지정→theme.textFont(=본문 폰트), 부 미지정→주 폰트).
 */
function MenuFontControls() {
  const presetId = useStore((s) => s.project.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET);
  const dualLabel = MAIN_MENU_PRESETS[presetId].dualLabel;
  const mainFontId = useStore((s) => s.project.mainMenuUi?.menuFontId);
  const subFontId = useStore((s) => s.project.mainMenuUi?.menuSubFontId);
  const bodyFontId = useStore((s) => s.project.guiOverrides?.bodyFontId);
  const setMenuFont = useStore((s) => s.setMenuFont);
  const { grouped, customAvailable } = useFontCatalog();

  const mainFamily = useFontFamily(mainFontId ?? bodyFontId);
  const subFamily = useFontFamily(subFontId ?? mainFontId ?? bodyFontId);

  const optionsFor = (f: FontPreset) => (
    <option key={f.id} value={f.id}>
      {f.label}
      {!f.fullHangul ? ' (이름·제목 권장)' : ''}
    </option>
  );

  return (
    <div className="card border-edge p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-200">🔤 메뉴 글꼴</span>
      </div>
      <p className="text-[10px] text-gray-500 mb-2">
        미지정 = 본문(대사창) 폰트를 따라갑니다. 부 폰트를 미지정하면 주 폰트를 따라갑니다.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-gray-400">
          주 라벨 폰트
          <select
            className="field text-xs"
            value={mainFontId ?? INHERIT_FONT}
            onChange={(e) => setMenuFont('main', e.target.value === INHERIT_FONT ? undefined : e.target.value)}
          >
            <option value={INHERIT_FONT}>본문 폰트 따라감</option>
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map(optionsFor)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={`flex flex-col gap-1 text-[11px] text-gray-400 ${!dualLabel ? 'opacity-40' : ''}`}>
          부 라벨 폰트
          <select
            className="field text-xs"
            disabled={!dualLabel}
            value={subFontId ?? INHERIT_FONT}
            onChange={(e) => setMenuFont('sub', e.target.value === INHERIT_FONT ? undefined : e.target.value)}
          >
            <option value={INHERIT_FONT}>주 라벨 폰트 따라감</option>
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map(optionsFor)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1.5">
        <div
          className="rounded border border-edge/60 px-2 py-1.5 text-sm truncate bg-black/10"
          style={{ fontFamily: mainFamily }}
        >
          처음부터 · 이어하기
        </div>
        <div
          className={`rounded border border-edge/60 px-2 py-1.5 text-sm truncate bg-black/10 ${!dualLabel ? 'opacity-40' : ''}`}
          style={{ fontFamily: subFamily }}
        >
          새로운 이야기 시작
        </div>
      </div>
      {!customAvailable && (
        <p className="text-[10px] text-gray-500 mt-1">
          커스텀 폰트 목록을 못 불러왔습니다(오프라인이거나 미설정) — 기본 폰트만 사용됩니다.
        </p>
      )}
    </div>
  );
}

/** 🖍 글자 외곽선 토글 — 이미지 없는(텍스트) 프리셋 전용, 기본 켜짐. */
function OutlineToggle() {
  const outline = useStore((s) => s.project.mainMenuUi?.textOutline ?? true);
  const updateProjectMeta = useStore((s) => s.updateProjectMeta);
  return (
    <div className="card border-edge p-3 mb-3">
      <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={outline}
          onChange={(e) => {
            // 렌더에 쓰지 않는 "지금 이 순간의" 나머지 필드를 보존하려는 목적뿐이라 getState() 비반응
            // 읽기로 충분하다 — 구독하면 mainMenuUi 가 바뀔 때마다(버튼 업로드 등) 이 토글도 리렌더된다.
            const prev = useStore.getState().project.mainMenuUi;
            updateProjectMeta({ mainMenuUi: { ...prev, textOutline: e.target.checked } });
          }}
        />
        <span>
          🖍 글자 외곽선
          <span className="block text-[10px] text-gray-500 mt-0.5">
            배경 그림이 밝아도 메뉴 글자가 읽히게 검은 외곽선을 넣습니다. 어두운 아트라 거슬리면 끄세요.
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * ℹ️ 정보·크레딧·도움말 링크 토글 — 기본 켜짐. 이 셋은 MAIN_MENU_SLOTS 에 없어 이미지 버튼 슬롯이
 * 아예 없다(이미지 메뉴를 쓰면 혼자 맨 텍스트로 남아 겉돈다 — 실기 확인). 게임 중 ESC 메뉴 좌측
 * 내비(screen navigation)에는 그대로 있으므로 타이틀에서만 꺼도 접근성 손실이 없다.
 */
function InfoLinksToggle() {
  const showInfoLinks = useStore((s) => s.project.mainMenuUi?.showInfoLinks ?? true);
  const updateProjectMeta = useStore((s) => s.updateProjectMeta);
  return (
    <div className="card border-edge p-3 mb-3">
      <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={showInfoLinks}
          onChange={(e) => {
            // OutlineToggle 과 같은 이유로 getState() 비반응 읽기 — 구독하면 mainMenuUi 가 바뀔
            // 때마다(버튼 업로드 등) 이 토글도 매번 리렌더된다.
            const prev = useStore.getState().project.mainMenuUi;
            updateProjectMeta({ mainMenuUi: { ...prev, showInfoLinks: e.target.checked } });
          }}
        />
        <span>
          ℹ️ 정보·크레딧·도움말 링크
          <span className="block text-[10px] text-gray-500 mt-0.5">
            타이틀 화면에만 적용됩니다. 끄면 게임 중 ESC 메뉴에서만 볼 수 있어요.
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * 🔍 배치 미리보기 — Ren'Py 를 켜지 않고도 1920×1080 절대좌표를 그대로 축소해 보여준다.
 * 레이어 하나만 scale(컨테이너 실측 폭/1920)해서 통째로 줄이는 방식이라, 요소마다 좌표를 따로
 * 계산할 필요가 없고 실제 출력과 어긋날 여지도 없다.
 *
 * 프리셋별 축(align/direction) · 2줄 라벨 · 마커 · 글자 크기·폰트·외곽선까지 반영한다. 세로 배치의
 * 행 간격은 screensRpy.ts 와 마찬가지로 "버튼 높이(78) + gap" 고정 스텝을 쓴다(실제 vbox 는 항목마다
 * 자연 높이가 다르지만, 텍스트 2줄도 78px 안에 대체로 들어가는 크기라 이 근사로 충분하고 기존 코드의
 * 검증된 스텝 계산과 동일하게 유지하는 편이 더 안전하다).
 */
function LayoutPreview() {
  const bgId = useStore((s) => s.project.menuArt?.main);
  const logoId = useStore((s) => s.project.mainMenuUi?.logo);
  const buttons = useStore((s) => s.project.mainMenuUi?.buttons);
  const presetId = useStore((s) => s.project.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET);
  const rawLayout = useStore((s) => s.project.mainMenuUi?.layout);
  const labelOverrides = useStore((s) => s.project.mainMenuUi?.labels);
  const textOutline = useStore((s) => s.project.mainMenuUi?.textOutline ?? true);
  const menuFontId = useStore((s) => s.project.mainMenuUi?.menuFontId);
  const menuSubFontId = useStore((s) => s.project.mainMenuUi?.menuSubFontId);
  const bodyFontId = useStore((s) => s.project.guiOverrides?.bodyFontId);

  const preset = MAIN_MENU_PRESETS[presetId];
  const layout = { ...preset.layout, ...rawLayout };
  const bgUrl = useAssetUrl(bgId);
  const logoUrl = useAssetUrl(logoId);
  const mainFamily = useFontFamily(menuFontId ?? bodyFontId);
  const subFamily = useFontFamily(menuSubFontId ?? menuFontId ?? bodyFontId);

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

  const vertical = preset.direction === 'vertical';
  const isRight = preset.align === 'right';
  const totalRowWidth = MAIN_MENU_SLOTS.length * HORIZONTAL_ITEM_WIDTH + (MAIN_MENU_SLOTS.length - 1) * layout.gap;
  const rowStartX = (1920 - totalRowWidth) / 2;

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
            {MAIN_MENU_SLOTS.map((slot, i) => {
              const label = {
                main: labelOverrides?.[slot.id]?.main ?? preset.labels[slot.id]?.main ?? slot.label,
                sub: labelOverrides?.[slot.id]?.sub ?? preset.labels[slot.id]?.sub ?? '',
              };
              const boxStyle: CSSProperties = vertical
                ? {
                    position: 'absolute',
                    top: layout.y + i * (BTN_H + layout.gap),
                    width: BTN_W,
                    height: BTN_H,
                    ...(isRight ? { right: layout.x } : { left: layout.x }),
                  }
                : {
                    position: 'absolute',
                    top: layout.y,
                    left: rowStartX + i * (HORIZONTAL_ITEM_WIDTH + layout.gap),
                    width: HORIZONTAL_ITEM_WIDTH,
                  };
              return (
                <PreviewButton
                  key={slot.id}
                  label={label}
                  idleId={buttons?.[slot.id]?.idle}
                  boxStyle={boxStyle}
                  align={vertical ? (isRight ? 'right' : 'left') : 'center'}
                  dual={preset.dualLabel}
                  marker={preset.marker === 'triangle'}
                  mainSize={preset.mainSize}
                  subSize={preset.subSize}
                  outline={textOutline}
                  mainFamily={mainFamily}
                  subFamily={subFamily}
                />
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500 mt-1 text-center">
        1920×1080 기준 배치 — 실제 게임 화면과 같은 비율입니다.
      </p>
      {preset.marker === 'triangle' && (
        <p className="text-[10px] text-gray-500 text-center">
          ▶ 마커는 미리보기에선 항상 보이지만, 실제 게임에서는 마우스오버 시에만 나타납니다.
        </p>
      )}
    </div>
  );
}

/**
 * 미리보기의 버튼 하나. 업로드된 idle 이미지가 있으면(이미지 우선 규칙) 그림, 없으면 프리셋에 맞춘
 * 글자 버튼(정렬·1줄/2줄·마커·폰트·외곽선)을 그린다.
 */
function PreviewButton({
  label,
  idleId,
  boxStyle,
  align,
  dual,
  marker,
  mainSize,
  subSize,
  outline,
  mainFamily,
  subFamily,
}: {
  label: { main: string; sub: string };
  idleId: string | undefined;
  boxStyle: CSSProperties;
  align: 'left' | 'right' | 'center';
  dual: boolean;
  marker: boolean;
  mainSize: number;
  subSize: number;
  outline: boolean;
  mainFamily: string | undefined;
  subFamily: string | undefined;
}) {
  const url = useAssetUrl(idleId);
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  const textShadow = outline ? '0 0 3px #000, 0 0 3px #000, 1px 1px 2px #000' : undefined;

  if (url) {
    return (
      <div style={{ ...boxStyle, display: 'flex', alignItems: 'center', justifyContent: justify }}>
        <img src={url} style={{ width: BTN_W, height: BTN_H }} className="object-contain" />
      </div>
    );
  }

  return (
    <div
      style={{ ...boxStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: justify }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{ flexDirection: align === 'right' ? 'row-reverse' : 'row' }}
      >
        {marker && (
          <span style={{ color: '#facc15', opacity: 0.35, fontSize: Math.round(mainSize * 0.5) }}>▶</span>
        )}
        <span
          className="text-white font-bold"
          style={{ fontSize: mainSize, textShadow, fontFamily: mainFamily, textAlign: align }}
        >
          {label.main}
        </span>
      </div>
      {dual && label.sub && (
        <span
          className="text-white/85"
          style={{ fontSize: subSize, textShadow, fontFamily: subFamily, textAlign: align }}
        >
          {label.sub}
        </span>
      )}
    </div>
  );
}
