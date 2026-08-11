import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  effectiveExpressions,
  effectiveTextLocales,
  baseLocaleOf,
  LOCALE_LABEL,
  characterOutfits,
  isTypecastVoiceId,
  type Expression,
  type Locale,
  type Scene,
  type OrphanAsset,
} from '../types';
import { backgroundKey, bgmKey, hasBgm } from '../renpy/generate';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import Spinner from './Spinner';
import VoiceLab from './VoiceLab';
import VoiceReview from './VoiceReview';
import MainMenuGui from './MainMenuGui';
import QuickMenuGui from './QuickMenuGui';
import EscMenuGui from './EscMenuGui';
import ExpressionSetEditor from './ExpressionSetEditor';
import OrphanCleanupModal from './OrphanCleanupModal';
import { isCollabReady } from '../collab';
import { REMOTE_GRACE_OPTIONS } from '../assetRefs';

// ── 이름(의미) 기준 그룹화 — 같은 이름 = 하나의 에셋(업로드 1회, 모든 장면 공유) ──

interface Group {
  key: string; // 공유 키 (배경/BGM 이름, CG 설명)
  name: string; // 표시 이름(비었으면 이름 없음)
  repTitle: string; // 대표 장면 제목
  sceneIds: string[];
  count: number; // 사용 장면 수
  repAssetId?: string; // 미리보기용 (업로드된 에셋)
}

function groupBy(scenes: Scene[], keyOf: (s: Scene) => string, nameOf: (s: Scene) => string, assetOf: (s: Scene) => string | undefined, include: (s: Scene) => boolean): Group[] {
  const map = new Map<string, Group>();
  for (const s of scenes) {
    if (!include(s)) continue;
    const key = keyOf(s);
    let g = map.get(key);
    if (!g) {
      g = { key, name: nameOf(s), repTitle: s.title, sceneIds: [], count: 0, repAssetId: undefined };
      map.set(key, g);
    }
    g.sceneIds.push(s.id);
    g.count += 1;
    if (!g.name && nameOf(s)) g.name = nameOf(s);
    if (!g.repAssetId && assetOf(s)) g.repAssetId = assetOf(s);
  }
  return [...map.values()];
}

interface CgGroup {
  desc: string;
  count: number;
  repTitle: string;
  repAssetId?: string;
}

function cgGroups(scenes: Scene[]): CgGroup[] {
  const map = new Map<string, CgGroup>();
  for (const s of scenes) {
    s.cg.forEach((desc, i) => {
      const key = desc.trim();
      let g = map.get(key);
      if (!g) {
        g = { desc, count: 0, repTitle: s.title, repAssetId: undefined };
        map.set(key, g);
      }
      g.count += 1;
      const aid = s.cgAssetIds?.[i] || undefined;
      if (!g.repAssetId && aid) g.repAssetId = aid;
    });
  }
  return [...map.values()];
}

export default function AssetsTab() {
  // project 전체가 아니라 실제로 쓰는 필드만 구독 — whole-project 셀렉터는 무관한 필드(대사
  // 텍스트 등)가 바뀔 때마다 이 탭 전체를 리렌더시킨다(project 는 매 mutate 마다 새 객체).
  const characters = useStore((s) => s.project.characters);
  const scenes = useStore((s) => s.project.scenes);
  const baseLocale = useStore((s) => s.project.baseLocale);
  const textLocales = useStore((s) => s.project.textLocales);

  // scenes 전체를 4회 순회하는 그룹핑 — 렌더마다가 아니라 scenes 가 실제로 바뀔 때만 재계산.
  // (early return 보다 먼저 둬야 함: Hook 은 조건부 return 위에서 항상 같은 순서로 호출돼야 한다.)
  const bgs = useMemo(
    () => groupBy(scenes, backgroundKey, (s) => s.background ?? '', (s) => s.backgroundAssetId, () => true),
    [scenes],
  );
  const cgs = useMemo(() => cgGroups(scenes), [scenes]);
  const bgms = useMemo(() => groupBy(scenes, bgmKey, (s) => s.bgm ?? '', (s) => s.bgmAssetId, hasBgm), [scenes]);
  const items = useMemo(() => itemNames(scenes), [scenes]);
  // effectiveTextLocales 는 전체 장면·라인을 훑는다 — 예전엔 캐릭터 카드마다(카드 수만큼) 반복
  // 호출했는데, 여기서 한 번만 계산해 CharacterCard 에 내려준다. deps 를 [project] 로 두면
  // project 가 매 mutate 마다 새 객체라 이 useMemo 는 사실상 매번 다시 도는 것과 같았다 —
  // 실제로 이 계산에 쓰는 3개 필드로 좁혀야 baseLocale/textLocales/scenes 가 그대로인 한(예:
  // 배경 업로드) 재계산을 건너뛴다.
  const nameLocales = useMemo(() => {
    const base = baseLocaleOf({ baseLocale });
    return effectiveTextLocales({ baseLocale, textLocales, scenes }).filter((l) => l !== base);
  }, [baseLocale, textLocales, scenes]);

  if (scenes.length === 0)
    return <p className="text-gray-500 text-sm text-center mt-16">먼저 스토리를 분석하세요.</p>;

  return (
    <div className="flex flex-col gap-7 max-w-3xl mx-auto">
      <div className="card border-edge p-3">
        <p className="text-xs text-gray-400">
          🗂 <b className="text-gray-200">에셋 라이브러리</b> — ChatGPT/Suno 등 외부 도구에서 만든 이미지·음악을 여기에{' '}
          <b>업로드</b>합니다. 같은 이름의 배경·BGM·CG는 <b>하나로 묶여 한 번만 업로드</b>하면 해당 이름의 모든
          장면에 동일하게 적용됩니다.
        </p>
      </div>

      <section>
        <h3 className="section-title mb-1">🧑‍🎨 캐릭터 스프라이트</h3>
        <p className="text-xs text-gray-500 mb-3">
          표정별 입화를 업로드합니다(투명 배경 PNG 권장). 대본에서{' '}
          <code className="text-accent">이름(기쁨): 대사</code> 처럼 적으면 그 표정으로 등장하고, 표정을
          안 적어도 AI가 대사 문맥을 보고 자동으로 배정합니다. 업로드 전엔 임시 실루엣으로 미리보기가 채워집니다.
        </p>
        <ExpressionSetEditor />
        <AssignEmotionsRow />
        {characters.length === 0 && <p className="text-gray-600 text-sm">등장 캐릭터 없음</p>}
        <div className="grid grid-cols-2 gap-3">
          {characters.filter((c) => !c.isProtagonist).map((c) => (
            <CharacterCard key={c.name} name={c.name} nameLocales={nameLocales} />
          ))}
        </div>
        <NarrationOnlyRow />
        <PlayerNameRow />
      </section>

      <VoiceSection />

      <section>
        <h3 className="section-title mb-1">🖼 배경 <span className="text-gray-500 font-normal text-xs">· {bgs.length}종 / 장면 {scenes.length}개</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          배경 이름이 같으면 한 번만 업로드해 모든 장면에 적용됩니다. (이름 없는 배경은 장면별로 분리됩니다 — 재사용하려면 이름을 지정하세요.)
        </p>
        <div className="flex flex-col gap-2">
          {bgs.map((g) => (
            <BgGroupRow key={g.key} group={g} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title mb-1">🎬 타이틀 배경</h3>
        <p className="text-xs text-gray-500 mb-3">
          게임 시작 시 타이틀(메인 메뉴) 화면의 배경입니다. 어떤 크기로 올려도 화면에 꽉 차도록(비율 유지, 넘치는
          부분은 크롭) 맞춰집니다. 업로드하지 않으면 테마색 그라데이션으로 대체됩니다. 게임 중 ESC로 여는 메뉴의
          배경은 별도입니다 — 아래 "⎋ ESC 메뉴 GUI" 섹션의 "공통 배경"에서 올리세요.
        </p>
        <div className="flex flex-col gap-2">
          <MenuArtRow />
        </div>
      </section>

      <section>
        <h3 className="section-title mb-1">🪟 게임 아이콘</h3>
        <p className="text-xs text-gray-500 mb-3">
          배포용 실행 파일과 게임 창에 쓰일 아이콘입니다. 두 개는 <b>쓰이는 자리가 다릅니다</b> —{' '}
          <b className="text-gray-300">.ico</b>는 배포 빌드가 <b>exe에 박아 넣는</b> 아이콘이라 폴더에서 바로
          실행할 땐 보이지 않고, <b className="text-gray-300">창 아이콘</b>은 게임 실행 중 창 제목표시줄과
          작업표시줄에 보입니다. 안 올리면 Ren'Py 기본 아이콘이 쓰입니다.
        </p>
        <div className="flex flex-col gap-2">
          <GameIconRow which="ico" label="Windows 실행 파일 아이콘 (.ico)" hint="다중 크기 .ico 권장" />
          <GameIconRow which="window" label="게임 창 아이콘 (PNG)" hint="256×256 이상 정사각 PNG 권장" />
        </div>
      </section>

      <MainMenuGui />

      <QuickMenuGui />

      <EscMenuGui />

      <section>
        <h3 className="section-title mb-1">🎬 CG 컷 <span className="text-gray-500 font-normal text-xs">· {cgs.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          대본의 <code className="text-accent">#CG 설명</code> 단위. 같은 설명이면 한 컷으로 공유됩니다. ChatGPT 등에서
          만든 이미지를 업로드하세요(업로드 전엔 임시 자리표시).
        </p>
        {cgs.length === 0 ? (
          <p className="text-gray-600 text-sm">CG 컷 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cgs.map((g) => (
              <CgGroupRow key={g.desc} group={g} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title mb-1">🎁 아이템(소품) <span className="text-gray-500 font-normal text-xs">· {items.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          대본의 <code className="text-accent">#아이템 이름</code> 단위. 같은 이름이면 한 이미지로 공유됩니다. 배경 없는{' '}
          <b>투명 컷아웃</b>을 업로드하면, 인게임에서 <b>라이트박스 팝업</b> + <b>"발견한 아이템" 보관함</b>에 쓰입니다.
        </p>
        {items.length === 0 ? (
          <p className="text-gray-600 text-sm">아이템 없음 — 대본 B열에 <code className="text-accent">#아이템 편지</code> 처럼 넣어보세요.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((n) => (
              <ItemGroupRow key={n} name={n} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title mb-1">🎵 BGM <span className="text-gray-500 font-normal text-xs">· {bgms.length}종</span></h3>
        <p className="text-xs text-gray-500 mb-3">
          BGM 이름이 같으면 한 번만 업로드해 모든 장면에 적용됩니다. Suno 등에서 만든 mp3 를 올리세요.
        </p>
        <TitleBgmRow />
        <BgmPlaybackToggles />
        {bgms.length === 0 ? (
          <p className="text-gray-600 text-sm">BGM 지정 장면 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {bgms.map((g) => (
              <BgmGroupRow key={g.key} group={g} />
            ))}
          </div>
        )}
      </section>

      <CleanupSection />
      <RemoteCleanupSection />
    </div>
  );
}

/**
 * 타이틀(메인 메뉴) 화면 BGM 한 줄 — BgmGroupRow(장면 BGM)와 MenuArtRow(메뉴 아트 슬롯 하나짜리
 * 카드)를 섞은 모양. 엔진 공식 변수 config.main_menu_music 으로 나간다(types.ts Project.titleBgm,
 * generate.ts optionsRpy 참고) — screens.rpy 는 건드리지 않는다.
 */
function TitleBgmRow() {
  const importTitleBgm = useStore((s) => s.importTitleBgm);
  const clearTitleBgm = useStore((s) => s.clearTitleBgm);
  const assetId = useStore((s) => s.project.titleBgm?.assetId);
  const stopWhenUnset = useStore((s) => s.project.bgmPlayback?.stopWhenUnset ?? false);
  const url = useAssetUrl(assetId);
  return (
    <div className="card border-edge p-3 flex flex-col gap-2 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-300 flex-1">
          타이틀 화면 BGM
          <span className="block text-[10px] text-gray-500 mt-0.5">
            게임을 켰을 때 타이틀 화면에서 흐르는 곡입니다.
          </span>
        </span>
        <UploadButton
          onFile={(f) => importTitleBgm(f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost shrink-0"
          accept="audio/*"
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600 shrink-0" onClick={() => clearTitleBgm()}>
            해제
          </button>
        )}
      </div>
      {url && <audio src={url} controls className="w-full h-8" />}
      {url && !stopWhenUnset && (
        <p className="text-[10px] text-amber-500">
          첫 장면에 #BGM 이 없으면 타이틀 곡이 게임으로 이어집니다 — 아래 "지정하지 않은 장면에서는 음악 정지"를 켜세요.
        </p>
      )}
    </div>
  );
}

/**
 * BGM 재생 방식 토글 두 개(project.bgmPlayback, 생성기 쪽은 generate.ts scriptBody 의
 * bgmRestart/bgmStopWhenUnset 참고). EscMenuGui.tsx 의 SidebarLogoToggle 과 같은 패턴 —
 * 새 store 액션을 만들지 않고 이미 검증된 updateProjectMeta(저장·협업 push 경로)를 그대로 쓰고,
 * onChange 안에서는 getState() 로 비반응 읽기(구독하면 bgmPlayback 이 바뀔 때마다 이 토글도
 * 매번 리렌더된다).
 */
function BgmPlaybackToggles() {
  const restartSameBgm = useStore((s) => s.project.bgmPlayback?.restartSameBgm ?? false);
  const stopWhenUnset = useStore((s) => s.project.bgmPlayback?.stopWhenUnset ?? false);
  const updateProjectMeta = useStore((s) => s.updateProjectMeta);
  return (
    <div className="card border-edge p-3 flex flex-col gap-2 mb-3">
      <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={restartSameBgm}
          onChange={(e) => {
            const prev = useStore.getState().project.bgmPlayback;
            updateProjectMeta({ bgmPlayback: { ...prev, restartSameBgm: e.target.checked } });
          }}
        />
        <span>
          같은 BGM이어도 장면이 바뀌면 처음부터 다시 재생
          <span className="block text-[10px] text-gray-500 mt-0.5">
            기본은 같은 곡이면 안 끊고 이어갑니다. 다른 곡으로 바뀔 때는 어느 쪽이든 새로 재생됩니다.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={stopWhenUnset}
          onChange={(e) => {
            const prev = useStore.getState().project.bgmPlayback;
            updateProjectMeta({ bgmPlayback: { ...prev, stopWhenUnset: e.target.checked } });
          }}
        />
        <span>
          BGM을 지정하지 않은 장면에서는 음악 정지
          <span className="block text-[10px] text-gray-500 mt-0.5">
            기본은 앞 장면의 곡이 그대로 이어집니다. #BGM 을 적었지만 아직 업로드하지 않은 장면은 멈추지 않습니다.
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * 게임 아이콘 한 줄(exe .ico / 창 PNG). MenuArtRow 와 같은 모양이되 썸네일이 정사각이고,
 * .ico 는 파일 대화상자에서 image/* 필터에 안 걸리는 경우가 있어 accept 를 명시한다.
 */
function GameIconRow({ which, label, hint }: { which: 'ico' | 'window'; label: string; hint: string }) {
  const importGameIcon = useStore((s) => s.importGameIcon);
  const clearGameIcon = useStore((s) => s.clearGameIcon);
  const assetId = useStore((s) => s.project.gameIcon?.[which]);
  const url = useAssetUrl(assetId);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-16 h-16 rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-contain" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        <p className="text-[11px] text-gray-500">{hint}</p>
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton
          onFile={(f) => importGameIcon(which, f)}
          label={url ? '✓ 교체' : '↥ 업로드'}
          accept={which === 'ico' ? '.ico,image/x-icon,image/vnd.microsoft.icon' : 'image/*'}
          className="btn-ghost text-[11px]"
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearGameIcon(which)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/** 타이틀 배경(main) 한 줄 — 업로드 없으면 미업로드 표시(빌드 시 테마 그라데이션 폴백). 슬롯이 하나뿐이라 prop 없이 라벨을 하드코딩한다. */
function MenuArtRow() {
  const importMenuArt = useStore((s) => s.importMenuArt);
  const clearMenuArt = useStore((s) => s.clearMenuArt);
  const assetId = useStore((s) => s.project.menuArt?.main);
  const url = useAssetUrl(assetId);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200">메인 메뉴(타이틀 화면)</span>
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton
          onFile={(f) => importMenuArt(f)}
          label={url ? '✓ 교체' : '↥ 업로드'}
          className="btn-ghost text-[11px]"
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearMenuArt()}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 어디서도 참조되지 않는 IndexedDB 에셋 blob 을 찾아 보여주고, 사용자가 고른 것만 지운다.
 * 예전엔 개수만 보여주는 window.confirm 으로 즉시 전체 하드 삭제했는데, 고아 blob 은 에셋 탭
 * 어디에도 안 보여서(이 탭은 프로젝트 구조를 순회해 렌더함) "안 쓰는 이미지가 없는데 고아가 많다고
 * 나온다"는 혼란을 낳았다 — 지금은 OrphanCleanupModal 이 실물(썸네일·파일명·크기)을 보여준다.
 */
function CleanupSection() {
  // 필드 단위 구독 — findOrphanAssets/deleteOrphanAssets 는 store 함수 참조라 마운트 후 안 바뀌지만,
  // 관례상(CLAUDE.md) whole-project 셀렉터를 쓰지 않는다.
  const findOrphanAssets = useStore((s) => s.findOrphanAssets);
  const deleteOrphanAssets = useStore((s) => s.deleteOrphanAssets);
  const setToast = useStore((s) => s.setToast);
  const [orphans, setOrphans] = useState<OrphanAsset[] | null>(null);
  const [loading, setLoading] = useState(false);

  const openModal = async () => {
    setLoading(true);
    try {
      const found = await findOrphanAssets();
      if (found.length === 0) setToast('고아 에셋이 없습니다.');
      else setOrphans(found);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h3 className="section-title mb-1">🧹 저장소 정리</h3>
      <p className="text-xs text-gray-500 mb-3">
        옛 업로드를 다른 파일로 교체하거나 캐릭터·장면을 지우면, 더는 어디서도 쓰이지 않는 파일이 브라우저 저장소에
        남을 수 있습니다. 협업으로 받았지만 이 프로젝트가 참조하지 않는 캐시나, 대본 재분석으로 이름 연결이 끊긴
        옛 파일도 여기 섞여 있을 수 있습니다. 아무 데도 연결되지 않은 파일을 찾아 보여주고, 고른 것만 지웁니다.
      </p>
      <button
        className="btn-ghost text-[11px] text-gray-400 hover:text-rose-500"
        disabled={loading}
        onClick={() => void openModal()}
      >
        {loading ? <Spinner /> : '참조되지 않는 에셋 정리'}
      </button>
      {orphans && (
        <OrphanCleanupModal
          orphans={orphans}
          onClose={() => setOrphans(null)}
          onDelete={(ids) => deleteOrphanAssets(ids)}
        />
      )}
    </section>
  );
}

/**
 * ☁️ 협업 Storage(Supabase) 정리 — 위 CleanupSection 과는 지우는 대상이 다르다. CleanupSection 은
 * 이 브라우저의 IndexedDB(로컬)만 지우지만, 앱은 업로드하는 모든 에셋을 공유 Supabase Storage
 * 버킷에도 올리고 거기선 절대 지우지 않는다 — 그래서 버킷이 계속 자란다. 이 섹션이 그 원격 사본을
 * 쓸어내는 두 번째, 더 위험한 스윕이다: 여기 뜨는 파일은 협업 상대와 "공유"하는 서버 파일이고,
 * 지우면 상대에게도 되돌릴 수 없다. 그래서 로컬 정리와 달리 기본 선택을 비워 두고(defaultSelected
 * false) 사용자가 직접 고르게 한다. 협업이 꺼져 있으면(isCollabReady() false) 버킷 자체가 없는
 * 얘기라 섹션을 아예 렌더하지 않는다.
 */
function RemoteCleanupSection() {
  const findRemoteOrphanAssets = useStore((s) => s.findRemoteOrphanAssets);
  const deleteRemoteOrphanAssets = useStore((s) => s.deleteRemoteOrphanAssets);
  const setToast = useStore((s) => s.setToast);
  // isCollabReady() 는 모듈 전역 collabConfig 를 읽는 동기 함수라 그것만 보면 협업을 켠 뒤에도
  // 이 컴포넌트가 다시 그려질 이유가 없어 섹션이 안 나타난다(탭을 나갔다 와야 보인다). 스토어의
  // collabEnabled 를 같이 구독해 리렌더 트리거를 만든다 — 판정 자체는 방 코드·환경변수까지 보는
  // isCollabReady() 가 맡는다(collabEnabled 만으론 방 코드가 비어도 true 라 부족).
  const collabEnabled = useStore((s) => s.collabEnabled);
  const [orphans, setOrphans] = useState<OrphanAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  // 유예 기간 선택 — 버튼을 누르기 "전에" 보이는 자리에 둔다. 기본 7일 고정이던 시절엔 방금 교체한
  // 이미지가 전부 유예에 걸려 목록이 빈 채로 떠서, 기능이 고장난 것처럼 보였다(실제 보고).
  const [graceId, setGraceId] = useState<(typeof REMOTE_GRACE_OPTIONS)[number]['id']>('7d');
  const grace = REMOTE_GRACE_OPTIONS.find((o) => o.id === graceId) ?? REMOTE_GRACE_OPTIONS[0];

  if (!collabEnabled || !isCollabReady()) return null;

  const openModal = async () => {
    setLoading(true);
    try {
      const found = await findRemoteOrphanAssets(grace.ms);
      // null = 조회 실패(판정 불가). 액션이 이미 에러 토스트를 띄웠으니 여기서 아무것도 덮어쓰지
      // 않고 조용히 빠진다 — 예전엔 실패도 빈 배열이라 "정리할 파일이 없습니다"가 에러를 가렸다.
      if (found === null) return;
      if (found.length === 0) {
        // 유예가 걸려 있으면 "없음"이 곧 "정말 없음"이 아니다 — 왜 비었는지를 토스트가 직접 알려준다.
        setToast(
          grace.ms > 0
            ? '정리할 서버 파일이 없습니다. 최근에 올린 파일은 유예 기간에 걸려 빠집니다 — 기간을 바꿔 보세요.'
            : '정리할 서버 파일이 없습니다.',
        );
      } else setOrphans(found);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h3 className="section-title mb-1">☁️ 협업 Storage 정리</h3>
      <p className="text-xs text-gray-500 mb-3">
        위 저장소 정리는 이 브라우저 안에서만 지웁니다. 하지만 업로드한 에셋은 전부{' '}
        <b className="text-amber-600">상대방과 공유하는 서버(Supabase Storage)</b>에도 함께 올라가고, 그쪽은
        지금까지 전혀 지워지지 않아 계속 쌓입니다. 여기서 찾는 건 어떤 방의 어떤 프로젝트도 더는 참조하지 않는
        서버 파일입니다 — 지우면 <b className="text-amber-600">상대방 쪽에서도 되돌릴 수 없습니다.</b> 신중하게
        고르세요(기본은 아무것도 선택되지 않은 상태입니다).
      </p>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-[11px] text-gray-400 shrink-0">업로드 후 경과</label>
        <select
          className="field text-xs py-1 w-auto"
          value={graceId}
          onChange={(e) => setGraceId(e.target.value as typeof graceId)}
        >
          {REMOTE_GRACE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {grace.ms === 0 && (
        <p className="text-[11px] text-amber-600 mb-2 leading-snug">
          ⚠️ 유예 없음 — 상대방이 지금 이미지를 올리는 중이라면 아직 저장(동기화)되지 않은 파일까지 후보로
          잡힙니다. 둘 다 작업을 저장한 상태에서 쓰세요.
        </p>
      )}
      <button
        className="btn-ghost text-[11px] text-gray-400 hover:text-rose-500"
        disabled={loading}
        onClick={() => void openModal()}
      >
        {loading ? <Spinner /> : '서버 파일 정리'}
      </button>
      {orphans && (
        <OrphanCleanupModal
          orphans={orphans}
          onClose={() => setOrphans(null)}
          onDelete={(ids) => deleteRemoteOrphanAssets(ids)}
          title="협업 서버의 참조되지 않는 파일"
          description={`어떤 방의 어떤 프로젝트에서도 더는 가리키지 않는 Supabase Storage 파일입니다(기준: ${grace.label}). 협업 상대와 공유하는 서버에 있는 파일이라 지우면 상대방 쪽에서도 사라집니다. 지울 항목을 직접 고르세요 — 기본은 아무것도 선택되지 않은 상태입니다.`}
          unknownLabel="서버 파일"
          unknownNote="이 앱 인스턴스가 아는 어떤 프로젝트도 더는 참조하지 않는, Supabase Storage 버킷 안의 객체입니다(업로더나 어느 방에서 올렸는지는 남아있지 않습니다)."
          defaultSelected={false}
          confirmLabel="영구 삭제"
          danger="상대방과 공유하는 서버 파일입니다 — 삭제하면 상대방 쪽에서도 즉시 사라지며 되돌릴 수 없습니다."
        />
      )}
    </section>
  );
}

/**
 * 🎙 성우(TTS) 비용·검수 — 캐릭터별 카드가 아니라 프로젝트 전체를 다루는 액션 모음.
 *  - 💡 비용 계산: 글자수 기반 즉시 계산(1글자=1크레딧, API 호출 0회) — 키가 없어도 동작한다.
 *  - 전체 캐릭터 일괄 생성: 프리셋이 저장된 모든 캐릭터를 순차 생성(캐릭터마다 확인창이 다시
 *    뜨지 않게 한 번만 확인).
 *  - 🎧 검수 시작: 생성된 음성을 이어 들으며 검수(VoiceReview).
 */
function VoiceSection() {
  // project 전체 대신 실제로 쓰는 두 필드만 — VoiceSection 은 busy/voiceEstimate 변화로도 자주
  // 리렌더되는데(배치 생성 중), whole-project 셀렉터였다면 그 위에 대사 편집 등 무관한 변경까지 더해졌다.
  const characters = useStore((s) => s.project.characters);
  const scenes = useStore((s) => s.project.scenes);
  const baseLocale = useStore((s) => s.project.baseLocale);
  const typecastKey = useStore((s) => s.typecastKey);
  const voiceEstimate = useStore((s) => s.voiceEstimate);
  const batchAllBusy = useStore((s) => !!s.busy['batch:voice:all']);
  const estimateVoiceCost = useStore((s) => s.estimateVoiceCost);
  const batchVoiceAll = useStore((s) => s.batchVoiceAll);
  const base = baseLocaleOf({ baseLocale });
  const [reviewOpen, setReviewOpen] = useState(false);

  // 캐릭터 수·대사 수에 비례하는 스캔 — characters/scenes 가 실제로 안 바뀌면 재계산하지 않는다.
  const hasAnyPreset = useMemo(() => characters.some((c) => c.voice), [characters]);
  const hasAnyVoiced = useMemo(
    () => scenes.some((sc) => sc.lines.some((l) => l.kind === 'dialogue' && l.voiceAssetIds?.[base])),
    [scenes, base],
  );

  return (
    <section>
      <h3 className="section-title mb-1">🎙 성우(TTS) 비용·검수</h3>
      <p className="text-xs text-gray-500 mb-3">
        생성 전 글자수 기반 즉시 견적(1자=1크레딧, 키 불필요)으로 정확한 크레딧을 확인하고, 생성 후엔
        이어듣기로 검수하세요.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          className="btn-ghost text-xs"
          disabled={!hasAnyPreset}
          onClick={estimateVoiceCost}
          title="글자수 합계로 예상 크레딧을 즉시 계산합니다(1자=1크레딧, 정확값 — 키가 없어도 동작)"
        >
          💡 비용 계산
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={!typecastKey || !hasAnyPreset || batchAllBusy}
          onClick={() => void batchVoiceAll(base)}
          title="보이스 프리셋이 저장된 모든 캐릭터의 남은 대사를 순차 생성합니다"
        >
          {batchAllBusy ? <Spinner /> : '🎙 전체 캐릭터 일괄 생성'}
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={!hasAnyVoiced}
          onClick={() => setReviewOpen(true)}
          title="생성된 음성을 이어서 들으며 검수합니다"
        >
          🎧 검수 시작
        </button>
      </div>
      {voiceEstimate && (
        <p className="text-[11px] text-gray-400">
          정확히 {voiceEstimate.totalCredits}크레딧 · 약 {Math.round(voiceEstimate.totalSeconds)}초 ·{' '}
          {voiceEstimate.totalLines}줄
          {voiceEstimate.noPreset.length > 0 && ` · 프리셋 없음: ${voiceEstimate.noPreset.join(', ')}`}
          {voiceEstimate.overLimit.length > 0 && (
            <span className="text-amber-600"> · 2000자 초과 {voiceEstimate.overLimit.length}줄(생성 실패 가능)</span>
          )}
        </p>
      )}
      {reviewOpen && <VoiceReview onClose={() => setReviewOpen(false)} />}
    </section>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-edge/60 text-gray-300" title={`${n}개 장면에서 사용`}>
      ×{n}
    </span>
  );
}

/** 내레이션·대사 전용(주인공 등) 화자 목록 — 스프라이트를 만들지 않는다. 칩 클릭 시 스프라이트 캐릭터로 전환. */
function NarrationOnlyRow() {
  // 셀렉터는 안정 ref(characters 배열)만 반환하고 filter 는 렌더에서 — 매 스토어 변경 리렌더 방지.
  const narr = useStore((s) => s.project.characters).filter((c) => c.isProtagonist);
  const updateChar = useStore((s) => s.updateCharacter);
  if (narr.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
      <span title="주인공처럼 화면에 안 나오고 대사·내레이션만 하는 화자입니다.">
        🗣 내레이션·대사 전용 (스프라이트 없음):
      </span>
      {narr.map((c) => (
        <button
          key={c.name}
          className="chip border-edge hover:text-accent hover:border-accent"
          onClick={() => updateChar(c.name, { isProtagonist: false })}
          title="클릭하면 스프라이트를 쓰는 캐릭터로 전환합니다."
        >
          {c.name} <span className="text-gray-600">↩ 스프라이트 사용</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 플레이어가 직접 정하는 주인공 이름(project.playerName, opt-in) 토글 + 대상 화자 선택.
 * NarrationOnlyRow 바로 아래 — 이 기능의 실제 대상은 대개 스프라이트 없는(내레이션 전용) 화자라
 * 같은 자리에 둔다. BgmPlaybackToggles 와 같은 패턴 — 새 store 액션을 만들지 않고 이미 검증된
 * updateProjectMeta 를 그대로 쓰고, onChange 안에서는 getState() 로 비반응 읽기.
 */
function PlayerNameRow() {
  const characters = useStore((s) => s.project.characters);
  const playerName = useStore((s) => s.project.playerName);
  const updateProjectMeta = useStore((s) => s.updateProjectMeta);

  if (characters.length === 0) {
    return (
      <label className="mt-3 flex items-start gap-2 text-xs text-gray-600 cursor-not-allowed">
        <input type="checkbox" className="mt-0.5" disabled />
        <span>
          플레이어가 주인공 이름을 직접 정하게 하기
          <span className="block text-[10px] text-gray-600 mt-0.5">등장 캐릭터가 없어 대상을 고를 수 없습니다.</span>
        </span>
      </label>
    );
  }

  const enabled = !!playerName;
  // 기본값 = 첫 isProtagonist 캐릭터, 없으면 첫 캐릭터(types.ts Character.isProtagonist 참고).
  const defaultTarget = characters.find((c) => c.isProtagonist)?.name ?? characters[0].name;

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          onChange={(e) => {
            updateProjectMeta({ playerName: e.target.checked ? { character: defaultTarget } : undefined });
          }}
        />
        <span>
          플레이어가 주인공 이름을 직접 정하게 하기
          <span className="block text-[10px] text-gray-500 mt-0.5">
            게임을 처음 시작할 때 한 번 묻고, 그 뒤에는 설정 화면에서 언제든 바꿀 수 있습니다. 비워두면 대본에 적힌 이름을 씁니다.
          </span>
        </span>
      </label>
      {enabled && (
        <select
          className="field text-xs ml-6 w-auto"
          value={playerName?.character ?? defaultTarget}
          onChange={(e) => {
            const prev = useStore.getState().project.playerName;
            updateProjectMeta({ playerName: { ...prev, character: e.target.value } });
          }}
        >
          {characters.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * 🎭 표정 자동 배정(AI) 실행 버튼 — CenterPanel 의 🌐 전체 자동 번역과 같은
 * "버튼이 곧 진행률"(disabled + Spinner + done/total) 패턴. VoiceSection 의 배치 버튼들과 같은 이유로
 * CenterPanel 을 건드리지 않고(다른 에이전트 담당) 여기(표정 세트 바로 아래)에 둔다.
 */
function AssignEmotionsRow() {
  const busy = useStore((s) => !!s.busy['batch:emotion']);
  const progress = useStore((s) => s.emotionProgress);
  // 계약 초안은 assignEmotionsAll 이었지만 실제 착지한 store 액션명은 autoAssignEmotionAll —
  // 실제 이름을 따른다(스토어는 다른 에이전트 소유).
  const autoAssignEmotionAll = useStore((s) => s.autoAssignEmotionAll);
  return (
    <div className="flex items-center gap-2 mb-3 -mt-1.5">
      <button
        className="btn-ghost text-xs"
        disabled={busy}
        onClick={() => void autoAssignEmotionAll()}
        title="표정이 지정되지 않은 대사에만 AI가 문맥을 보고 표정을 배정합니다. 직접 고른 표정은 절대 덮어쓰지 않습니다."
      >
        {busy ? (
          <span className="flex items-center gap-1.5">
            <Spinner />
            {progress ? `${progress.done}/${progress.total} 배정 중…` : '배정 중…'}
          </span>
        ) : (
          '🎭 표정 자동 배정'
        )}
      </button>
      <span className="text-[10px] text-gray-500">표정 미지정 대사에만 적용 · 직접 고른 표정은 유지됩니다</span>
    </div>
  );
}

function CharacterCard({ name, nameLocales }: { name: string; nameLocales: Locale[] }) {
  const c = useStore((s) => s.project.characters.find((x) => x.name === name))!;
  const updateChar = useStore((s) => s.updateCharacter);
  const importSprite = useStore((s) => s.importSprite);
  const clearAll = useStore((s) => s.clearCharacterSprites);
  const addOutfit = useStore((s) => s.addOutfit);
  const removeOutfit = useStore((s) => s.removeOutfit);
  const addOutfitRule = useStore((s) => s.addOutfitRule);
  const removeOutfitRule = useStore((s) => s.removeOutfitRule);
  const setI18nName = useStore((s) => s.setCharacterI18nName);
  const batchVoiceCharacter = useStore((s) => s.batchVoiceCharacter);
  const voiceBatchBusy = useStore((s) => !!s.busy[`batch:voice:${name}`]);
  const exprList = effectiveExpressions(useStore((s) => s.project.expressions));
  // 이름표 번역칸은 자막 언어가(원문 외에) 실제로 켜져 있을 때만 보인다 — 꺼져 있으면 내보내기에
  // 반영될 곳이 없어 입력칸만 있어도 혼란스럽다(자동 번역 켜면 자연히 나타남).
  // nameLocales 는 부모(AssetsTab)가 한 번만 계산해 내려준다(effectiveTextLocales 가 전체 장면을 훑음).
  // project 전체 대신 실제로 쓰는 3개 필드만 — 캐릭터 카드가 많으면(수십 개) whole-project
  // 셀렉터는 무관한 편집(대사 텍스트 등)에도 모든 카드를 리렌더시킨다.
  const outfitRules = useStore((s) => s.project.outfitRules);
  const scenes = useStore((s) => s.project.scenes);
  const baseLocale = useStore((s) => s.project.baseLocale);

  // 현재 편집 중인 의상(기본/추가 의상). 업로드·썸네일이 모두 이 의상을 대상으로 한다.
  const [outfit, setOutfit] = useState('기본');
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [ruleKw, setRuleKw] = useState('');
  const outfits = characterOutfits(c);
  const activeOutfit = outfit === '기본' ? undefined : c.outfits?.find((o) => o.name === outfit);
  const exprStore: Partial<Record<string, string>> = outfit === '기본' ? c.expressions : activeOutfit?.expressions ?? {};
  const hasAny = exprList.some((ex) => exprStore[ex]);
  // 이름이 바뀐 뒤 사라진 의상을 가리키면 기본으로 복귀.
  if (outfit !== '기본' && !activeOutfit) setOutfit('기본');

  // 이 (캐릭터, 의상)에 걸린 배경 키워드 규칙 — outfitRules 는 프로젝트 전체 배열이라
  // 표시는 필터링하되, 삭제/이동은 항상 그 안의 진짜 index 를 써야 한다(필터링된 위치와 다름).
  const allRules = outfitRules ?? [];
  const myRuleIdxs = useMemo(
    () => allRules.reduce<number[]>((acc, r, i) => {
      if (r.charName === name && r.outfit === outfit) acc.push(i);
      return acc;
    }, []),
    [allRules, name, outfit],
  );
  // 키워드별 적용 장면 수(배경 이름에 그 키워드가 포함된 장면) — 반복마다 다시 훑지 않도록 캐싱.
  const ruleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of myRuleIdxs) {
      const kw = allRules[idx].keyword;
      if (!map.has(kw)) map.set(kw, scenes.filter((sc) => (sc.background ?? '').includes(kw)).length);
    }
    return map;
  }, [myRuleIdxs, allRules, scenes]);

  return (
    <div className="card border-edge p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <input
          type="color"
          value={c.color}
          onChange={(e) => updateChar(name, { color: e.target.value })}
          className="w-6 h-6 rounded border border-edge bg-transparent shrink-0"
        />
        <span className="font-semibold text-sm flex-1 truncate" style={{ color: c.color }}>
          {name}
        </span>
        <UploadButton
          onFile={(f) => importSprite(name, '기본' as Expression, f, outfit)}
          label="🖼 기본 입화 업로드"
          className="btn-primary !px-2 !py-1 text-xs shrink-0"
          title={`${outfit === '기본' ? '' : outfit + ' '}기본 입화 이미지 업로드`}
        />
      </div>
      {/* 좌우 고정 위치 — 헤더 줄에 같이 두면 select 폭 때문에 카드 밖으로 버튼이 밀려나가서
          별도 줄로 뺌(다른 설정 줄들과 같은 레이아웃). */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">📍 위치</span>
        <select
          className="field text-xs"
          value={c.side ?? 'auto'}
          onChange={(e) => updateChar(name, { side: e.target.value as 'left' | 'right' | 'auto' })}
          title="장면 내 좌우 고정 위치(등장 순서와 무관, 혼자 등장하면 항상 중앙)"
        >
          <option value="auto">자동(등장순)</option>
          <option value="left">왼쪽 고정</option>
          <option value="right">오른쪽 고정</option>
        </select>
      </div>
      {/* 보이스 설정 — VoiceLab 을 캐릭터 모드로 열어 대사와 무관하게 보이스 프리셋만 고른다.
          미리듣기는 오디션 캐시를 거치므로 같은 설정을 여러 번 눌러 들어봐도 크레딧이 안 든다. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">🎤 보이스</span>
        <button className="btn-ghost text-xs" onClick={() => setVoiceSettingsOpen((v) => !v)}>
          목소리 설정
        </button>
        {c.voice ? (
          isTypecastVoiceId(c.voice.voiceId) ? (
            <span className="chip border-edge text-gray-400" title={`voice_id: ${c.voice.voiceId}`}>
              🎤 {c.voice.voiceName ?? c.voice.voiceId} ·{' '}
              {c.voice.emotion && c.voice.emotion !== 'smart' ? c.voice.emotion : '스마트'}
            </span>
          ) : (
            <span
              className="chip border-amber-500/50 text-amber-600"
              title={`voice_id: ${c.voice.voiceId} — 이전 TTS 서비스 프리셋은 그대로 못 씁니다`}
            >
              ⚠️ 재설정 필요(Typecast)
            </span>
          )
        ) : (
          <span className="chip border-amber-500/50 text-amber-600">미설정</span>
        )}
      </div>
      {/* 예전엔 여기 카드 인라인으로 펼쳐져 필터·추천 UI 가 늘면서 카드가 넘쳤다 — 오버레이 모달로
          전환(LeftPanel 의 AnalyzeMergeModal 관용구 재사용: fixed inset-0 z-[60] + 배경 클릭 닫기). */}
      {voiceSettingsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setVoiceSettingsOpen(false)}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <VoiceLab
              char={c}
              baseLocale={baseLocaleOf({ baseLocale })}
              mode="character"
              onClose={() => setVoiceSettingsOpen(false)}
            />
          </div>
        </div>
      )}
      {/* 보이스 일괄 생성 — VoiceLab 에서 저장해둔 프리셋(c.voice)으로 이 캐릭터의 모든 대사를
          순차 생성·적용(이미 있는 언어 음성은 건너뜀). 대본이 수백 줄이어도 하나하나 안 해도 됨 —
          마음에 안 드는 특정 줄은 그 대사의 VoiceLab 에서 개별로 다시 만지면 된다. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">🎙 일괄</span>
        <button
          className="btn-ghost text-xs"
          disabled={!c.voice || voiceBatchBusy}
          onClick={() => batchVoiceCharacter(name, baseLocaleOf({ baseLocale }))}
          title={
            c.voice
              ? `${name} 이 말하는 모든 대사 중 아직 음성 없는 줄을 저장된 보이스 프리셋으로 일괄 생성`
              : '먼저 🎤 목소리 설정에서 보이스를 고르고 "💾 저장 후 닫기"를 누르세요'
          }
        >
          {voiceBatchBusy ? <Spinner /> : '전체 대사 일괄 생성'}
        </button>
      </div>
      {/* 이름표 번역 — 자막 언어를 바꿨을 때 보일 이름. 비우면 원문(대본 그대로) 표시. */}
      {nameLocales.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-gray-500 mr-0.5">🌐 이름표</span>
          {nameLocales.map((loc) => (
            <input
              key={loc}
              className="field text-xs flex-1 min-w-[90px]"
              placeholder={`${LOCALE_LABEL[loc]} 이름 (예: Hanjisu)`}
              value={c.i18nName?.[loc] ?? ''}
              onChange={(e) => setI18nName(name, loc, e.target.value)}
              title={`자막을 ${LOCALE_LABEL[loc]}로 바꿨을 때 표시할 이름표. 비우면 원문("${name}") 그대로 표시됩니다.`}
            />
          ))}
        </div>
      )}

      {/* 의상(복장) 탭 — 대본 #복장 캐릭터:의상 으로 장면별 지정. 의상마다 표정 세트가 따로 업로드된다. */}
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">👗 의상</span>
        {outfits.map((o) => (
          <button
            key={o}
            onClick={() => setOutfit(o)}
            className={`text-[10px] rounded px-1.5 py-0.5 border ${
              o === outfit ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400'
            }`}
            title={o === '기본' ? '기본 의상' : `의상: ${o}`}
          >
            {o}
          </button>
        ))}
        <button
          className="text-[10px] rounded px-1.5 py-0.5 border border-edge text-gray-500 hover:text-accent"
          title="새 의상 추가(예: 수영복, 교복, 정장)"
          onClick={() => {
            const n = window.prompt('새 의상 이름은? (예: 수영복, 교복, 정장)');
            if (n && n.trim()) {
              addOutfit(name, n.trim());
              setOutfit(n.trim());
            }
          }}
        >
          ＋ 의상
        </button>
      </div>
      {outfit !== '기본' && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <button
            className="text-[10px] text-gray-500 hover:text-rose-600"
            title="이 의상과 그 입화를 삭제"
            onClick={() => {
              if (window.confirm(`'${name}'의 '${outfit}' 의상을 삭제할까요? 이 의상의 입화도 함께 삭제됩니다.`)) {
                removeOutfit(name, outfit);
                setOutfit('기본');
              }
            }}
          >
            의상 삭제
          </button>
        </div>
      )}

      {/* 배경 키워드 규칙 — 장면마다 #복장을 반복해 적지 않아도, 배경 이름에 키워드가 들어가면
          이 의상이 자동으로 입혀진다(resolveOutfit). 위에 있는 규칙이 먼저 적용된다(첫 일치 승). */}
      {outfit !== '기본' && (
        <div className="rounded-lg border border-edge p-2 mb-2 bg-panel2/40">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] text-gray-500">🏷 이 의상을 입을 배경 키워드</span>
          </div>
          {myRuleIdxs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {myRuleIdxs.map((idx) => {
                const r = allRules[idx];
                const n = ruleCounts.get(r.keyword) ?? 0;
                return (
                  <span
                    key={idx}
                    className={`chip text-[10px] flex items-center gap-1 ${
                      n === 0 ? 'border-amber-500/50 text-amber-600' : 'border-edge text-gray-400'
                    }`}
                    title={n === 0 ? '이 키워드를 배경 이름에 포함한 장면이 없습니다(오타 확인)' : `${n}개 장면에 적용됨`}
                  >
                    {r.keyword} ×{n}
                    <button className="hover:text-rose-600" onClick={() => removeOutfitRule(idx)} title="규칙 삭제">
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex gap-1">
            <input
              className="field text-xs flex-1"
              placeholder="예: 카페, 워터파크"
              value={ruleKw}
              onChange={(e) => setRuleKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ruleKw.trim()) {
                  addOutfitRule(name, outfit, ruleKw);
                  setRuleKw('');
                }
              }}
            />
            <button
              className="btn-ghost text-[11px] shrink-0"
              disabled={!ruleKw.trim()}
              onClick={() => {
                addOutfitRule(name, outfit, ruleKw);
                setRuleKw('');
              }}
            >
              ＋ 추가
            </button>
          </div>
          <p className="text-[10px] text-gray-500 leading-snug mt-1">
            배경 이름에 이 키워드가 들어간 장면에 자동으로 입힙니다. 한 배경이 여러 키워드에 걸리면 더 구체적인(긴)
            키워드가 이기고, 아무 규칙에도 안 걸리면 기본 의상입니다. 특정 장면만 다르게 하려면 장면 카드에서 직접
            고르세요.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-500 leading-snug mb-2">
        표정 썸네일을 눌러 ChatGPT 등에서 만든 이미지를 하나씩 업로드하세요(투명 배경 PNG 권장).
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {exprList.map((ex) => (
          <ExpressionThumb
            key={`${outfit}:${ex}`}
            name={name}
            expr={ex as Expression}
            outfit={outfit}
            onUpload={(f) => importSprite(name, ex as Expression, f, outfit)}
          />
        ))}
      </div>
      <SpriteBatchUploadRow charName={name} outfit={outfit} />
      <div className="flex items-center gap-3 mt-2">
        {hasAny && outfit === '기본' && (
          <button className="text-[11px] text-gray-500 hover:text-rose-600" onClick={() => clearAll(name)}>
            스프라이트 비우기
          </button>
        )}
        <button
          className="text-[11px] text-gray-500 hover:text-amber-600 ml-auto"
          onClick={() => updateChar(name, { isProtagonist: true })}
          title="주인공처럼 화면에 세우지 않고 대사·내레이션만 하게 합니다."
        >
          내레이션 전용으로
        </button>
      </div>
    </div>
  );
}

/**
 * 📦 한 번에 업로드 — 파일명 자동 매칭(주 동선) + 폴더 통째 선택. QuickMenuGui.tsx 의 BatchUploadRow 와
 * 같은 패턴(multi-file UploadButton + webkitdirectory 숨김 input)이되, 대상이 고정 슬롯이 아니라
 * (캐릭터, 의상) 이라 그 둘을 props 로 받는다. **지금 선택된 의상**(outfit)에만 적용된다 — 의상 탭을
 * 바꾸면 같은 버튼이 다른 의상을 대상으로 한다.
 */
function SpriteBatchUploadRow({ charName, outfit }: { charName: string; outfit: string }) {
  const importSpritesBatch = useStore((s) => s.importSpritesBatch);
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
    if (files.length) void importSpritesBatch(charName, outfit, files);
    if (dirRef.current) dirRef.current.value = '';
  };

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1.5">
        <UploadButton
          multiple
          onFiles={(files) => void importSpritesBatch(charName, outfit, files)}
          label="📦 한 번에 업로드"
          className="btn-ghost text-[11px]"
          title={`파일명으로 표정을 자동 매칭해 '${outfit}' 의상에 한 번에 업로드`}
        />
        <button
          className="btn-ghost text-[11px]"
          onClick={() => dirRef.current?.click()}
          title="폴더 하나를 통째로 선택합니다"
        >
          📁 폴더 선택
        </button>
        <input ref={dirRef} type="file" multiple className="hidden" onChange={(e) => handleDirFiles(e.target.files)} />
      </div>
      <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
        파일명에 표정 이름이 들어 있으면 자동 매칭됩니다(예: <code className="text-accent">옅은미소.png</code>,{' '}
        <code className="text-accent">한지수_옅은 미소.png</code>) — 인식 못한 파일은 건너뛰고 알려드립니다. 지금
        선택된 의상(<b className="text-gray-300">{outfit}</b>)에만 적용됩니다.
      </p>
    </div>
  );
}

function ExpressionThumb({
  name,
  expr,
  outfit,
  onUpload,
}: {
  name: string;
  expr: Expression;
  outfit: string;
  onUpload: (file: File) => void;
}) {
  const assetId = useStore((s) => {
    const ch = s.project.characters.find((x) => x.name === name);
    if (!ch) return undefined;
    if (outfit === '기본') return ch.expressions[expr];
    return ch.outfits?.find((o) => o.name === outfit)?.expressions[expr];
  });
  const url = useAssetUrl(assetId);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="relative aspect-[3/4] rounded-lg border border-edge bg-ink overflow-hidden group">
      <button
        onClick={() => url && setZoom(true)}
        disabled={!url}
        title={url ? '🔍 크게 보기' : expr}
        className="w-full h-full flex items-center justify-center"
      >
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] text-gray-500">{expr}</span>
        )}
      </button>
      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <UploadButton
          onFile={onUpload}
          label="↥"
          className="bg-black/55 text-white text-[10px] rounded px-1 py-0.5 hover:bg-black/75"
          title={`${expr} 입화 업로드`}
        />
      </div>
      <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9px] py-0.5 text-center pointer-events-none">
        {expr}
      </span>
      {/* 확대 미리보기(라이트박스) — 아무 데나 클릭하면 닫힘. */}
      {zoom && url && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          <img src={url} className="max-w-[90vw] max-h-[90vh] object-contain" />
          <button
            className="absolute top-4 right-5 text-white/80 hover:text-white text-3xl leading-none"
            onClick={() => setZoom(false)}
            title="닫기"
          >
            ×
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/85 text-xs bg-black/55 px-2.5 py-1 rounded-full">
            {name} · {expr}
          </span>
        </div>
      )}
    </div>
  );
}

function BgGroupRow({ group }: { group: Group }) {
  const rename = useStore((s) => s.renameBackgroundGroup);
  const importBg = useStore((s) => s.importBackground);
  const clearBg = useStore((s) => s.clearBackgroundGroup);
  const url = useAssetUrl(group.repAssetId);
  const [draft, setDraft] = useState(group.name);
  const rep = group.sceneIds[0];

  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <CountBadge n={group.count} />
          <span className="text-[11px] text-gray-500 truncate">예: {group.repTitle}</span>
        </div>
        <input
          className="field"
          value={draft}
          placeholder="배경 이름(라벨) — 같은 이름끼리 공유 (예: 이른 아침의 카페)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== group.name && rename(group.key, draft)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton
          onFile={(f) => importBg(rep, f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost text-[11px]"
          title={`${group.count}개 장면에 적용`}
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearBg(group.key)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/** 대본에서 쓰인 고유 아이템 이름(등장 순서, 빈 이름=닫기 마커 제외). */
function itemNames(scenes: Scene[]): string[] {
  const seen = new Set<string>();
  for (const sc of scenes)
    for (const l of sc.lines) if (l.kind === 'item' && l.name.trim()) seen.add(l.name.trim());
  return [...seen];
}

/** 아이템(소품) 한 종 — 투명 컷아웃 업로드. 이름 기준 공유(project.itemAssetIds). */
function ItemGroupRow({ name }: { name: string }) {
  const upload = useStore((s) => s.uploadItem);
  const remove = useStore((s) => s.removeItem);
  const assetId = useStore((s) => s.project.itemAssetIds?.[name]);
  const url = useAssetUrl(assetId);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-16 h-16 rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-contain" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200">🎁 {name}</span>
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-24">
        <UploadButton onFile={(f) => upload(name, f)} label={url ? '↥ 교체' : '↥ 업로드'} className="btn-ghost text-[11px]" />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => remove(name)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

function CgGroupRow({ group }: { group: CgGroup }) {
  const renameCg = useStore((s) => s.renameCgGroup);
  const importCg = useStore((s) => s.importCgGroup);
  const clearCg = useStore((s) => s.clearCgGroup);
  const url = useAssetUrl(group.repAssetId);
  const [draft, setDraft] = useState(group.desc);
  return (
    <div className="card border-edge p-3 flex gap-3 items-center">
      <div className="w-24 aspect-video rounded-lg border border-edge overflow-hidden bg-ink shrink-0 flex items-center justify-center text-[10px] text-gray-600">
        {url ? <img src={url} className="w-full h-full object-cover" /> : '미업로드'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <CountBadge n={group.count} />
          <span className="text-[11px] text-gray-500 truncate">예: {group.repTitle}</span>
        </div>
        <input
          className="field text-xs"
          value={draft}
          placeholder="장면 설명 (예: 노을 아래 마주보며 손잡는 장면) — 라벨 겸 ChatGPT 프롬프트 메모"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== group.desc.trim() && renameCg(group.desc, draft)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          title="대본엔 #CG n1 처럼 짧게 적고, 여기서 그 컷의 자세한 설명을 적어두면 ChatGPT 프롬프트 메모로 씁니다."
        />
      </div>
      <div className="flex flex-col gap-1 shrink-0 w-28">
        <UploadButton
          onFile={(f) => importCg(group.desc, f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost text-[11px]"
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600" onClick={() => clearCg(group.desc)}>
            해제
          </button>
        )}
      </div>
    </div>
  );
}

function BgmGroupRow({ group }: { group: Group }) {
  const importBgm = useStore((s) => s.importBgm);
  const clearBgm = useStore((s) => s.clearBgmGroup);
  const url = useAssetUrl(group.repAssetId);
  const rep = group.sceneIds[0];

  return (
    <div className="card border-edge p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CountBadge n={group.count} />
        <span className="text-xs text-gray-300 flex-1 truncate" title={group.repTitle}>
          {group.name || `(이름 없음 · ${group.repTitle})`}
        </span>
        <UploadButton
          onFile={(f) => importBgm(rep, f)}
          label={url ? '↥ 교체' : '↥ 업로드'}
          className="btn-ghost shrink-0"
          accept="audio/*"
          title={`${group.count}개 장면에 적용`}
        />
        {url && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600 shrink-0" onClick={() => clearBgm(group.key)}>
            해제
          </button>
        )}
      </div>
      {url && <audio src={url} controls className="w-full h-8" />}
    </div>
  );
}
