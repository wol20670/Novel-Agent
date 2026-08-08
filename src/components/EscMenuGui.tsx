import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { ESC_IMAGES, type EscImageId } from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';

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
      </div>
    </section>
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
