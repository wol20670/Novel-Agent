import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { ESC_IMAGES, DEFAULT_ESC_COLORS, type EscImageId, type EscColors } from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import { useFontCatalog, useFontFamily, INHERIT_FONT } from './fontHooks';

/**
 * ESC_IMAGES 는 이미 group 기준으로 정렬돼 내려온다(공통→버튼→슬라이더→슬롯→스크롤→팝업) —
 * 여기선 그 순서를 그대로 살려 "연속된 같은 group"만 묶는다(별도 정렬·재배치 없음). 그룹 목록은
 * 모듈 로드 시 한 번만 계산하는 정적 값(ESC_IMAGES 자체가 상수)이라 컴포넌트 바깥에 둔다.
 */
const GROUPED: { group: string; items: typeof ESC_IMAGES }[] = ESC_IMAGES.reduce<
  { group: string; items: typeof ESC_IMAGES }[]
>((acc, it) => {
  const last = acc[acc.length - 1];
  if (last && last.group === it.group) last.items.push(it);
  else acc.push({ group: it.group, items: [it] });
  return acc;
}, []);

/**
 * ESC(인게임) 메뉴 이미지 GUI 업로드 섹션. AssetsTab 의 "🎮 인게임 우측 메뉴 GUI"(QuickMenuGui)
 * 바로 아래에 낀다. QuickMenuGui.tsx 와 같은 opt-in 원칙 — escMenuUi 가 비어 있으면 기존 텍스트
 * ESC 메뉴 그대로 나가므로(회귀 0), 여기 업로드는 전부 선택 사항이다. 23개 역할을 전부 채울
 * 필요는 없지만, 일부만 채우면 나머지는 텍스트/placeholder 로 섞여 나갈 수 있어 진행률을 보여준다.
 */
export default function EscMenuGui() {
  return (
    <section>
      <h3 className="section-title mb-1">⎋ ESC 메뉴 GUI</h3>
      <p className="text-xs text-gray-500 mb-2">
        게임 중 <b>ESC</b>로 여는 인게임 메뉴(저장·불러오기·설정·기록·갤러리·종료 확인)를 외부에서 만든 이미지로
        통째로 바꿉니다. 아무것도 안 올리면 기존 텍스트 메뉴 그대로 나갑니다 — 이 섹션은 순수 opt-in입니다.
      </p>
      <TextWarning />
      <BatchUploadRow />
      <ProgressIndicator />
      <div className="flex flex-col gap-3">
        {GROUPED.map(({ group, items }) => (
          <GroupBlock key={group} group={group} items={items} />
        ))}
        <FontBlock />
        <ColorBlock />
        <SidebarLogoToggle />
      </div>
    </section>
  );
}

/**
 * 🔤 ESC 메뉴 글꼴 — MainMenuGui.tsx 의 MenuFontControls(주/부 2개)를 축약(ESC 는 폰트 슬롯이 하나뿐 —
 * types.ts escMenuUi.fontId 주석 참고: 이미지가 하나도 없으면 애초에 적용되지 않는다).
 */
function FontBlock() {
  const fontId = useStore((s) => s.project.escMenuUi?.fontId);
  const setEscFont = useStore((s) => s.setEscFont);
  const { grouped, customAvailable } = useFontCatalog();
  const family = useFontFamily(fontId);

  return (
    <div className="card border-edge p-3">
      <p className="text-xs text-gray-400 font-medium mb-2">🔤 글꼴</p>
      <select
        className="field text-xs w-full"
        value={fontId ?? INHERIT_FONT}
        onChange={(e) => setEscFont(e.target.value === INHERIT_FONT ? undefined : e.target.value)}
      >
        <option value={INHERIT_FONT}>인터페이스 폰트 따라감</option>
        {grouped.map(([cat, list]) => (
          <optgroup key={cat} label={cat}>
            {list.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
                {!f.fullHangul ? ' (이름·제목 권장)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div
        className="rounded border border-edge/60 px-2 py-1.5 text-sm truncate bg-black/10 mt-1.5"
        style={{ fontFamily: family }}
      >
        저장 · 불러오기 · 설정
      </div>
      <p className="text-[10px] text-gray-500 mt-1">
        미지정 = 인터페이스(본문) 폰트를 그대로 따라갑니다. <b>ESC 메뉴 이미지를 하나라도 올려야 적용됩니다.</b>
      </p>
      {!customAvailable && (
        <p className="text-[10px] text-gray-500 mt-1">
          커스텀 폰트 목록을 못 불러왔습니다(오프라인이거나 미설정) — 기본 폰트만 사용됩니다.
        </p>
      )}
    </div>
  );
}

/**
 * 🖼 좌측 사이드바 타이틀 로고 — mainMenuUi.logo 재사용(사용자 결정, 작업 3). 로고 자체가 없으면
 * 표시할 게 없으니 체크박스를 비활성화하고 업로드 안내만 보여준다(showSidebarLogo 값과 무관하게
 * generate.ts 의 buildEscMenuPlan 도 mainMenuUi.logo 가 없으면 항상 무시한다 — 같은 게이트).
 */
function SidebarLogoToggle() {
  const hasLogo = useStore((s) => !!s.project.mainMenuUi?.logo);
  const show = useStore((s) => s.project.escMenuUi?.showSidebarLogo ?? true);
  const updateProjectMeta = useStore((s) => s.updateProjectMeta);
  return (
    <div className="card border-edge p-3">
      <label
        className={`flex items-start gap-2 text-xs text-gray-300 ${hasLogo ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={show}
          disabled={!hasLogo}
          onChange={(e) => {
            // OutlineToggle(MainMenuGui.tsx)과 같은 이유로 getState() 비반응 읽기 — 구독하면
            // escMenuUi 가 바뀔 때마다(이미지 업로드 등) 이 토글도 매번 리렌더된다.
            const prev = useStore.getState().project.escMenuUi;
            updateProjectMeta({ escMenuUi: { ...prev, showSidebarLogo: e.target.checked } });
          }}
        />
        <span>
          🖼 사이드바에 타이틀 로고 표시
          <span className="block text-[10px] text-gray-500 mt-0.5">
            {hasLogo
              ? '메인 메뉴 타이틀 로고를 좌측 내비게이션 위에 작게 함께 보여줍니다.'
              : '먼저 메인 메뉴 GUI 에서 타이틀 로고를 업로드해야 표시할 수 있습니다.'}
          </span>
        </span>
      </label>
    </div>
  );
}

/** 팔레트 롤 5종의 UI 정의(순서 = 화면에 보이는 순서). types.ts 의 EscColors 와 1:1. */
const COLOR_ROLES: { key: keyof EscColors; label: string; hint: string }[] = [
  { key: 'body', label: '본문', hint: '대사 기록·설명·슬롯 날짜' },
  { key: 'title', label: '제목', hint: '저장/설정/기록 같은 화면 이름' },
  { key: 'accent', label: '강조', hint: '그룹 라벨·도움말 키 이름' },
  { key: 'muted', label: '보조', hint: '페이지 번호·잠긴 항목' },
  { key: 'selectedBg', label: '선택 배경', hint: '현재 선택된 항목 바탕' },
];

/**
 * ESC 메뉴 글자색. 이미지가 아니라 Ren'Py 가 그리는 텍스트라(세이브 날짜·대사 기록·페이지 번호 등
 * 동적 텍스트가 대부분) 이미지 버튼으로는 못 바꾸고 색으로만 맞춘다. 기본값은 **밝은 아이보리 카드
 * 아트 기준** — 어두운 아트를 쓰면 여기서 뒤집어야 한다.
 */
function ColorBlock() {
  const colors = useStore((s) => s.project.escMenuUi?.colors);
  const setEscColors = useStore((s) => s.setEscColors);
  const custom = COLOR_ROLES.some((r) => colors?.[r.key]);
  return (
    <div className="card border-edge p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400 font-medium">글자색</p>
        {custom && (
          <button
            className="text-[10px] text-gray-500 hover:text-accent"
            onClick={() => setEscColors(Object.fromEntries(COLOR_ROLES.map((r) => [r.key, ''])))}
          >
            기본값으로 되돌리기
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        기본값은 <b>밝은 아이보리 카드 아트</b> 기준입니다. 배경·카드가 <b>어두운 계열</b>이면 본문·제목·강조를 밝은
        색으로 바꾸세요 — 안 그러면 글자가 배경에 묻혀 안 보입니다.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {COLOR_ROLES.map((role) => (
          <ColorCell key={role.key} role={role} value={colors?.[role.key]} onChange={setEscColors} />
        ))}
      </div>
    </div>
  );
}

function ColorCell({
  role,
  value,
  onChange,
}: {
  role: { key: keyof EscColors; label: string; hint: string };
  value?: string;
  onChange: (patch: Partial<EscColors>) => void;
}) {
  const effective = value || DEFAULT_ESC_COLORS[role.key];
  return (
    <label className="flex items-center gap-2 rounded-lg border border-edge p-2 bg-panel2/30 cursor-pointer">
      <input
        type="color"
        value={effective}
        onChange={(e) => onChange({ [role.key]: e.target.value })}
        className="w-8 h-8 rounded border border-edge bg-transparent shrink-0 cursor-pointer"
      />
      <div className="min-w-0">
        <p className="text-[11px] text-gray-300 truncate">
          {role.label}
          {!value && <span className="text-gray-600"> · 기본</span>}
        </p>
        <p className="text-[9px] text-gray-500 truncate" title={role.hint}>
          {role.hint}
        </p>
      </div>
    </label>
  );
}

/** 이미지에 글자를 굽지 말라는 경고 — 라벨은 Ren'Py 가 자막 언어에 맞춰 직접 그린다. */
function TextWarning() {
  return (
    <p className="text-[11px] text-amber-600 leading-snug mb-3">
      ⚠️ <b>이미지에 "저장", "설정" 같은 글자를 넣지 마세요.</b> 버튼 라벨은 Ren&apos;Py가 자막 언어(한/영/일)에
      맞춰 그 위에 직접 그립니다. 글자를 이미지에 구워 넣으면 언어를 바꿔도 그대로 남아 다국어가 깨집니다 — ESC
      메뉴 아트는 프레임·배경·버튼 모양만 준비하세요.
    </p>
  );
}

/** 📦 한 번에 업로드 — 파일명 자동 매칭(주 동선) + 폴더 통째 선택. QuickMenuGui.tsx 와 동일 패턴. */
function BatchUploadRow() {
  const importEscImages = useStore((s) => s.importEscImages);
  const dirRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dirRef.current;
    if (!el) return;
    // webkitdirectory/directory 는 JSX 속성 타입이 없어(표준화 안 됨) DOM 에 직접 세팅해야
    // "폴더 선택" 다이얼로그로 뜬다. 폴더 안의 하위 폴더(버튼/슬라이더/슬롯 등으로 나뉜 경우)까지
    // 브라우저가 재귀적으로 다 담아 오므로 이 컴포넌트에서 따로 하위 폴더를 훑을 필요가 없다.
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  const handleDirFiles = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList).filter((f) => f.type.startsWith('image/')) : [];
    if (files.length) void importEscImages(files);
    if (dirRef.current) dirRef.current.value = '';
  };

  return (
    <div className="card border-edge p-3 mb-3">
      <p className="text-xs text-gray-500 mb-2">
        <code className="text-accent">GUI_좌측메뉴_마우스오버.png</code> 처럼 파일명에 역할·상태 이름이 들어 있으면
        자동으로 인식해 한 번에 적용합니다(인식 못한 파일은 건너뛰고 알려줍니다). 에셋 폴더가 버튼/슬라이더/슬롯
        등 하위 폴더로 나뉘어 있어도 <b>📁 폴더 선택</b>이 전부 한 번에 훑어옵니다.
      </p>
      <div className="flex gap-2">
        <UploadButton
          multiple
          onFiles={(files) => void importEscImages(files)}
          label="📦 한 번에 업로드"
          className="btn-primary flex-1"
          title="여러 장을 한 번에 선택해 파일명으로 자동 매칭합니다"
        />
        <button className="btn-ghost" onClick={() => dirRef.current?.click()} title="폴더 하나를 통째로(하위 폴더 포함) 선택합니다">
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

/** "23개 중 N개 업로드됨" — 채운 정도를 한눈에 보여준다. */
function ProgressIndicator() {
  const images = useStore((s) => s.project.escMenuUi?.images);
  const total = ESC_IMAGES.length;
  const done = images ? Object.values(images).filter(Boolean).length : 0;
  return (
    <p className="text-[11px] text-gray-500 mb-3">
      {total}개 중 <b className={done > 0 ? 'text-accent' : 'text-gray-500'}>{done}개</b> 업로드됨
    </p>
  );
}

/** 그룹(공통/버튼/슬라이더/슬롯/스크롤/팝업) 하나 — 라벨 + 그 그룹 역할들의 카드 그리드. */
function GroupBlock({ group, items }: { group: string; items: typeof ESC_IMAGES }) {
  return (
    <div className="card border-edge p-3">
      <p className="text-xs text-gray-400 font-medium mb-2">{group}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((it) => (
          <ImageCell key={it.id} id={it.id} label={it.label} hint={it.hint} />
        ))}
      </div>
    </div>
  );
}

/** 역할 하나의 업로드 칸 — 썸네일 + 라벨 + 권장 규격(hint) + 업로드/해제. QuickMenuGui.tsx 의 ButtonCell 과 동일 패턴. */
function ImageCell({ id, label, hint }: { id: EscImageId; label: string; hint: string }) {
  const importEscImage = useStore((s) => s.importEscImage);
  const clearEscImage = useStore((s) => s.clearEscImage);
  const assetId = useStore((s) => s.project.escMenuUi?.images?.[id]);
  const url = useAssetUrl(assetId);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-edge p-2 bg-panel2/30">
      <div className="w-full h-16 rounded border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center">
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[9px] text-gray-600">없음</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-300 truncate" title={label}>
          {label}
        </p>
        <p className="text-[9px] text-gray-500 truncate" title={hint}>
          {hint}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <UploadButton
          onFile={(f) => importEscImage(id, f)}
          label={url ? '✓ 교체' : '↥ 업로드'}
          className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex-1"
        />
        {url && (
          <button
            className="text-[9px] text-gray-500 hover:text-rose-600 shrink-0"
            onClick={() => clearEscImage(id)}
          >
            해제
          </button>
        )}
      </div>
    </div>
  );
}
