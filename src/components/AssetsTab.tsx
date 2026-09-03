import { useMemo } from 'react';
import { useStore } from '../store';
import {
  effectiveTextLocales,
  baseLocaleOf,
  backgroundKey,
  bgmKey,
  hasBgm,
} from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import Spinner from './Spinner';
import MainMenuGui from './MainMenuGui';
import QuickMenuGui from './QuickMenuGui';
import EscMenuGui from './EscMenuGui';
import ExpressionSetEditor from './ExpressionSetEditor';
// 아래 5개는 예전에 이 파일 안에 있던 조각들이다 — 책임별로 떼어냈고 배치·호출 순서는 그대로다.
import { groupBy, cgGroups, itemNames } from './assetGroups';
import { BgGroupRow, CgGroupRow, ItemGroupRow, BgmGroupRow } from './AssetGroupRows';
import CharacterCard from './CharacterCard';
import VoiceSection from './VoiceSection';
import { CleanupSection, RemoteCleanupSection } from './AssetCleanupSections';

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
        <SuggestOutfitsRow />
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
  const clearEmotionAuto = useStore((s) => s.clearEmotionAuto);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 -mt-1.5">
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
      {/* AI 배정만 되돌리는 유일한 경로 — 표정 AI 는 이미 값이 있는 줄을 재실행해도 스킵하므로,
          의상을 바꾼 뒤 다시 배정하려면 이걸 먼저 눌러야 한다(자동 삭제는 일부러 안 만들었다). */}
      <button
        className="btn-ghost text-xs"
        disabled={busy}
        onClick={() => clearEmotionAuto()}
        title="AI가 자동 배정한 표정만 지웁니다. 직접 고른 표정은 그대로 유지되며, 의상·번역·보이스에는 영향이 없습니다."
      >
        ↺ AI 표정 초기화
      </button>
      <span className="text-[10px] text-gray-500">표정 미지정 대사에만 적용 · 직접 고른 표정은 유지됩니다</span>
      <span className="text-[10px] text-gray-500 w-full">
        의상 전환을 먼저 확정하면 의상별 표정 후보가 정확합니다. 의상 변경 후 표정을 다시 배정하려면 AI
        표정값을 초기화한 뒤 재실행하세요.
      </span>
    </div>
  );
}

/**
 * 🤖 의상 전환 추천(AI) 실행 버튼 — AssignEmotionsRow 와 같은 "버튼이 곧 진행률" 패턴.
 * ⚠️ 아래 CharacterCard 의 👗 탭이 아니라 **여기**에 둔다: 저쪽은 캐릭터 단위 설정이고 이 배치는
 * 프로젝트 전체를 훑는 작업이다. 표정과 달리 결과가 바로 반영되지 않고 **장면 카드의 검수 칩**으로
 * 뜬다(수락해야 Line.outfits 에 들어간다).
 */
function SuggestOutfitsRow() {
  const busy = useStore((s) => !!s.busy['batch:outfit']);
  const progress = useStore((s) => s.outfitProgress);
  const autoSuggestOutfitsAll = useStore((s) => s.autoSuggestOutfitsAll);
  return (
    <div className="flex items-center gap-2 mb-3 -mt-1.5">
      <button
        className="btn-ghost text-xs"
        disabled={busy}
        onClick={() => void autoSuggestOutfitsAll()}
        title="대본이 '갈아입었다'고 말한 자리를 AI가 찾아 제안합니다. 바로 반영되지 않고 장면 카드에서 검수 후 적용합니다."
      >
        {busy ? (
          <span className="flex items-center gap-1.5">
            <Spinner />
            {progress ? `${progress.done}/${progress.total} 분석 중…` : '분석 중…'}
          </span>
        ) : (
          '🤖 의상 전환 추천'
        )}
      </button>
      <span className="text-[10px] text-gray-500">
        대본이 옷 갈아입는 대목을 말한 자리만 제안 · 직접 지정한 의상은 덮어쓰지 않습니다
      </span>
    </div>
  );
}
