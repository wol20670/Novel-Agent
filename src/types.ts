// 도메인 데이터 모델 — 파서 출력, UI 상태, Ren'Py 생성이 모두 공유한다.

import type { GenreId, GuiTheme, GuiOverrides } from './renpy/gui/theme';

/**
 * 글로벌 다국어 로케일. 자막(글언어)과 음성(목소리언어)이 각각 독립적으로 이 집합에서 고른다
 * (예: 자막 한국어 / 음성 일본어 교차 선택). base = 대본 원문(A/B열) 언어.
 */
export type Locale = 'ko' | 'en' | 'ja';

/** 로케일 표시 이름(UI·Ren'Py 언어 선택 버튼 공통). */
export const LOCALE_LABEL: Record<Locale, string> = { ko: '한국어', en: 'English', ja: '日本語' };

/**
 * 로케일 → Ren'Py config.language 이름. 기본 언어(대본 원문)는 번역 블록이 없어 None 이다.
 * (Ren'Py 공식 번역 시스템: game/tl/<name>/ 폴더 + Language(name) 액션.)
 */
export const RENPY_LANG: Record<Locale, string | null> = { ko: null, en: 'english', ja: 'japanese' };

/** 자동 번역 모드 — off(사용 안 함·기본) / fast(gpt-4o-mini) / quality(gpt-4o). */
export type TranslateMode = 'off' | 'fast' | 'quality';

export type SceneStatus = 'review' | 'approved' | 'needs_fix';

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  review: '검토중',
  approved: '승인',
  needs_fix: '수정필요',
};

/** 기본 표정 세트. 프로젝트가 커스텀 목록(project.expressions)을 두지 않으면 이게 쓰인다. */
const DEFAULT_EXPRESSIONS = ['기본', '기쁨', '슬픔', '화남', '놀람', '수줍음'] as const;
/** 표정 이름. 사용자가 추가/이름변경할 수 있어 자유 문자열이다('기본'은 항상 존재·고정). */
export type Expression = string;

/** 알려진 표정의 표시 이모지(UI 공통). 커스텀 표정은 emojiFor 로 기본 이모지를 준다. */
const EXPR_EMOJI: Record<string, string> = {
  기본: '😐', 기쁨: '😊', 슬픔: '😢', 화남: '😠', 놀람: '😲', 수줍음: '😳',
  // 자주 쓰는 추가 표정 후보(목록에 없어도 무방, 있으면 이모지가 붙는다).
  당황: '😨', 황당: '😑', 무표정: '😶', 미소: '🙂', 울음: '😭', 분노: '😡', 윙크: '😉',
};

/** 표정 이름 → 이모지(목록에 없으면 기본 🎭). */
export function emojiFor(name: string): string {
  return EXPR_EMOJI[name] ?? '🎭';
}

/**
 * 대사·지문의 번역 검수본(로케일 → 텍스트). base(원문) 언어는 담지 않는다(text 가 원문).
 * 비어 있는 로케일은 자막에서 원문으로 폴백하고, 음성은 생성하지 않는다.
 */
export type I18nText = Partial<Record<Locale, string>>;

export type Line =
  | {
      kind: 'dialogue';
      speaker: string; // 표시 이름표 (합동 대사면 "한지수 & 강민주")
      text: string; // base(원문) 언어. 자막 번역은 i18n, Ren'Py 출력은 tl 블록으로 분리된다.
      /**
       * 작가가 정한 표정 — 대본의 `이름(표정):` 태그이거나 장면 카드 드롭다운에서 직접 고른 값.
       * "사람이 명시한 의도"만 담는다(아래 emotionAuto 와 반드시 구분).
       */
      emotion?: string;
      /**
       * AI 가 문맥으로 배정한 표정. emotion 과 같은 필드에 쓰면 안 되는 이유가 둘 있다 —
       * ① mergeScenes 의 `emotion: next.emotion ?? prev.emotion` 규칙 때문에 재분석 후에도 AI 값이
       *    "작가 태그"인 척 살아남는다 ② UI 가 사람이 정한 값과 구분할 수 없어 되돌릴 수가 없다.
       * 우선순위는 emotion > emotionAuto > 휴리스틱 > '기본' (resolveEmotion 단일 판정).
       */
      emotionAuto?: string;
      /** 합동 대사(둘 이상이 동시에) — 등록 캐릭터 이름 배열. 있으면 speaker 는 묶음 라벨이다. */
      members?: string[];
      /** 로케일별 번역 검수본(엑셀 C/D열 등). 없으면 자막은 원문 폴백. */
      i18n?: I18nText;
      /** 이 라인에 성우 음성을 생성할지(opt-in). 크레딧 폭탄 방지로 기본은 미생성. */
      voiced?: boolean;
      /**
       * 로케일별 성우 음성 에셋(선택) — VoiceLab(🎙)의 "이 언어로 적용"으로 설정된다. 자막 언어와
       * 완전 독립인 voices.rpy 의 vo() 런타임 분기(persistent.voice_language)가 그대로 이 값을
       * 쓴다 — 언어마다 다른 배우를 붙여도 자막 언어와 상관없이 플레이어가 음성 언어만 따로 고를 수 있다.
       */
      voiceAssetIds?: Partial<Record<Locale, string>>;
      /**
       * 이 줄부터 스프라이트 숨김(true)/다시 표시(false) — `#인물숨김`/`#인물표시` 태그나 장면 카드
       * 줄 버튼으로 지정. 미지정(undefined)이면 앞 줄의 상태를 그대로 유지(3-state, spriteHiddenFlags
       * 참고). 차량 내부처럼 인물이 서 있는 구도가 어색한 장면에서, 배경을 CG로 바꾸지 않고도
       * 주인공처럼 얼굴 없이 대사만 내보내고 싶을 때 쓴다.
       */
      hideSprites?: boolean;
    }
  | {
      kind: 'narration';
      text: string;
      i18n?: I18nText;
      voiced?: boolean;
      /** dialogue 쪽과 완전히 같은 의미(3-state) — spriteHiddenFlags 참고. */
      hideSprites?: boolean;
    }
  /**
   * 아이템(소품) 팝업 인라인 이벤트. 태그 위치(그 순간)에 사물을 라이트박스로 잠깐 띄운다.
   * name === '' 이면 hide 마커(#아이템끝). 이미지는 프로젝트 공유(Project.itemAssetIds[name]).
   */
  | { kind: 'item'; name: string }
  /**
   * CG 배경 전환 인라인 이벤트. 이 지점부터 장면 배경을 CG로 바꾸고 스프라이트를 모두 숨긴다
   * (장면 끝까지 유지, 대사창·TTS 는 계속). desc 는 Scene.cg 항목과 트림 기준으로 매칭된다.
   */
  | { kind: 'cg'; desc: string }
  /**
   * BGM 시작 위치 마커. 곡 자체는 Scene.bgm/bgmAssetId(장면당 1곡)에 있고 이 라인은
   * 대본에서 `#BGM` 태그가 나온 "그 자리"만 담는다 — 장면 맨 앞에서 지정되면(대사 이전) 굳이
   * 마커를 남기지 않고 장면 시작 시 play music 으로 폴백한다(기존 동작·회귀 0).
   */
  | { kind: 'bgm'; name: string };

export interface Choice {
  text: string;
  /** `> 텍스트 -> 대상장면` 의 대상 장면 제목. 없으면 다음 줄로 진행. */
  target?: string;
}

export interface Scene {
  id: string;
  /** #S — Ren'Py label 의 표시 제목이자 분기/점프 매칭 키. */
  title: string;
  background?: string; // #배경
  bgm?: string; // #BGM
  direction: string[]; // #연출 (AI 프롬프트에 반영)
  cg: string[]; // #CG (설명/프롬프트)
  /** cg[i] 에 대응하는 업로드 이미지 assetId(선택). 없으면 Canvas 임시 생성. */
  cgAssetIds?: string[];
  lines: Line[];
  choices: Choice[];
  jumpTo?: string; // #점프 대상 장면 제목
  status: SceneStatus;
  backgroundAssetId?: string;
  bgmAssetId?: string;
  /** #복장 — 이 장면에서 캐릭터별로 입을 의상(캐릭터명 → 의상명). 없으면 '기본'. */
  outfits?: Record<string, string>;
  /**
   * 이 장면을 스프라이트 숨김 상태로 시작할지(기본 false) — `#인물숨김`/`#인물표시` 태그나 장면 카드
   * 토글로 지정. 장면이 바뀌면 항상 이 값으로 리셋된다(배경 변경으로 파서가 장면을 쪼개는 것과 같은
   * 단위). 줄 단위 override 는 Line.hideSprites, 최종 판정은 spriteHiddenFlags 단일 소스.
   */
  hideSprites?: boolean;
}

/**
 * 배경 이름에 keyword 가 포함되면 그 캐릭터에게 outfit 을 입힌다(부분 일치).
 * 한 배경이 여러 키워드에 걸리면 **더 구체적인(긴) 키워드**가 이긴다 — 예: '밤 카페 안'은
 * '카페'(2자)와 '밤 카페'(4자) 규칙에 모두 걸리지만 '밤 카페' 쪽이 적용된다. 길이가 같으면 먼저 추가한 순.
 * (순서를 사용자가 직접 조정하게 두면, 정작 우선순위가 걸리는 건 "같은 캐릭터의 다른 의상 규칙 사이"인데
 *  UI 는 의상별로 나뉘어 있어 조정 자체가 불가능했다 — 길이 기준이 조정 없이도 의도대로 동작한다.)
 */
export interface OutfitRule {
  keyword: string;
  charName: string;
  outfit: string;
}

/** 캐릭터 의상(복장) — 의상마다 표정 세트를 따로 가진다. '기본' 의상은 Character.expressions 자체. */
interface Outfit {
  /** 의상 이름(예: '수영복', '교복'). '기본'은 예약어. */
  name: string;
  /** 표정 → assetId (이 의상의 스프라이트 세트). */
  expressions: Partial<Record<Expression, string>>;
}

export interface Character {
  name: string;
  color: string;
  /** 표정 → assetId (기본 의상 스프라이트). */
  expressions: Partial<Record<Expression, string>>;
  /** 추가 의상(선택). #복장 태그로 장면별 의상을 지정할 수 있다. */
  outfits?: Outfit[];
  /**
   * 내레이션·대사 전용 화자(주인공 등). true 면 화면에 스프라이트를 세우지 않고
   * 에셋 창의 스프라이트 관리에서도 제외한다. 대사 이름표·분기에는 정상 참여.
   */
  isProtagonist?: boolean;
  /**
   * 언어별 캐릭터 이름표(선택) — 자막 언어를 바꿨을 때 표시할 이름. base(원문) 언어는
   * name 자체가 담당하므로 여기엔 담지 않는다. 없으면 그 언어에서도 원문 이름 그대로(폴백).
   * 에셋 탭의 캐릭터 카드에서 편집(다른 자막 언어가 켜져 있을 때만 입력칸이 보인다).
   */
  i18nName?: I18nText;
  /**
   * Typecast 성우 설정(선택) — 멘트별 보이스 테스트에서 마음에 든 값을 저장해두는 참고용
   * 프리필(주인공·나레이션은 성우가 필요 없어 보통 비워둔다). 오디오 자체는 저장하지 않는다.
   * ⚠️ voiceId 가 tc_/uc_ 접두사가 아니면 지원하지 않는 형식이라 UI 에서 "재설정 필요"로 표시한다
   * (스키마가 달라 자동 변환하지 않는다 — 거짓 호환만 만든다).
   */
  voice?: {
    /** Typecast voice_id. 정식 보이스는 tc_, 클론한 커스텀 보이스는 uc_ 접두사. */
    voiceId: string;
    /**
     * 보이스 표시 이름(선택, 표시 전용). VoiceLab 에서 저장할 때 목록 조회 결과와 함께 기록한다.
     * 옛 프로젝트나 직접 입력 저장분엔 없을 수 있어 optional — 없으면 카드 요약 칩에서 voiceId 로 대체.
     */
    voiceName?: string;
    model?: string;
    /** 'smart'(문맥 자동) 또는 감정 프리셋 이름(normal/happy/sad/angry/whisper/toneup/tonedown 등). */
    emotion?: string;
    /** emotion 이 프리셋일 때만 의미 있음. 0~2. */
    intensity?: number;
    settings?: {
      tempo?: number;
      pitch?: number;
      volume?: number;
    };
  };
  /**
   * 장면 내 좌우 고정 위치(선택, 기본 'auto'). 등장 순서와 무관하게 항상 왼쪽/오른쪽에 세우고
   * 싶을 때 지정 — 미지정(undefined)은 'auto'와 동일(기존 등장 순서 기반 배치, 하위호환).
   * 혼자 등장하면 side 와 무관하게 항상 중앙(arrangePositions 참고).
   */
  side?: 'left' | 'right' | 'auto';
}

/** Typecast voice_id 형식(tc_/uc_ 접두사)인지 — 아니면 지원하지 않는 형식이라 "재설정 필요". */
export function isTypecastVoiceId(voiceId: string | undefined): boolean {
  return !!voiceId && (voiceId.startsWith('tc_') || voiceId.startsWith('uc_'));
}

type AssetKind = 'background' | 'cg' | 'sprite' | 'bgm' | 'voice' | 'item';

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  prompt: string;
  mime: string; // image/png | image/jpeg | audio/mpeg | audio/wav 등(업로드 파일 그대로)
  /** 에셋 출처 (canvas=오프라인 플레이스홀더, upload=사용자 업로드). */
  source: string;
  /** Ren'Py 에셋 파일명 (예: bg_school.png). */
  filename: string;
  createdAt: number;
}

/**
 * 고아 에셋 정리 UI(findOrphanAssets 반환)에 보여줄 항목 하나. kind/filename/createdAt 이 optional
 * 인 이유: ensureAsset(src/collab/assetsSync.ts)이 협업으로 받은 blob 을 AssetMeta 없이 IndexedDB
 * 에만 캐싱해두는 정상 케이스가 있어, 그런 id 는 메타 자체가 없다(고아이긴 해도 "무슨 종류인지"를
 * 알 길이 없다) — AssetKind 는 export 되어 있지 않으므로 AssetMeta['kind'] 로 참조한다.
 */
export interface OrphanAsset {
  id: string;
  kind?: AssetMeta['kind'];
  filename?: string;
  createdAt?: number;
  /** bytes. */
  size: number;
  /** 메타의 mime 우선, 없으면 blob.type(그것도 없으면 ''). */
  mime: string;
  /**
   * IndexedDB 에 바이너리가 없고 메타만 남은 항목(transfer.ts 도 같은 케이스를 건너뛴다).
   * size 를 알 수 없어 0 이 들어오므로, UI 가 "0 B + 영원히 로딩 중인 썸네일"이라는 고장난
   * 모습으로 보여주지 않도록 구분해 표시하라는 표시. 지울 게 메타뿐이라 삭제 자체는 유효하다.
   */
  missing?: boolean;
}

export interface Project {
  title: string;
  author: string;
  width: number;
  height: number;
  scenes: Scene[];
  characters: Character[];
  rawInput: string;
  /**
   * 대본 원문(A/B열)의 언어. 자막·음성의 base 이자 Ren'Py 기본 언어(config.language=None). 기본 'ko'.
   */
  baseLocale?: Locale;
  /**
   * 출력할 자막 언어 목록(base 포함). 2개 이상이면 game/tl 번역 파일 + 설정 화면 "자막 언어" 선택이 생긴다.
   * 비어 있으면 단일 언어(base)로 취급한다(하위호환).
   */
  textLocales?: Locale[];
  /**
   * 출력할 음성 언어 목록. textLocales 와 완전 독립(교차 선택). 2개 이상이면 설정 화면 "음성 언어" 선택이 생긴다.
   * 비어 있으면 음성 미사용.
   */
  voiceLocales?: Locale[];
  /** GUI 테마(장르 프리셋). 미지정이면 기본 프리셋이 적용된다. */
  genre?: GenreId;
  /** AI/오프라인으로 생성한 커스텀 테마. 있으면 genre 프리셋보다 우선한다. */
  guiTheme?: GuiTheme;
  /** AI 테마 생성에 쓰는 분위기/요청 텍스트(선택). */
  mood?: string;
  /**
   * 캐릭터 표정 세트(선택). 사용자가 추가/이름변경할 수 있다. 비어 있으면 DEFAULT_EXPRESSIONS.
   * '기본'은 항상 포함되며(스프라이트 기준 입화) 이름변경·삭제 불가.
   */
  expressions?: string[];
  /**
   * 표정 이름 → 한 줄 설명(선택). AI 표정 배정 프롬프트에 그대로 실린다 — 표정이 20종을 넘어가면
   * 이름만으로는 사람도 AI 도 못 가른다("옅은 미소" vs "어색한 미소" vs "장난스러운 미소").
   * 전부 채울 필요는 없고 헷갈리는 계열만 적으면 된다. expressions 배열의 타입을 바꾸지 않고
   * 병렬 맵으로 두는 건 기존 저장 프로젝트(문자열 배열)와의 호환 때문.
   */
  expressionNotes?: Record<string, string>;
  /**
   * 게임 내 "크레딧/라이선스 고지" 화면에 표시할 자유 텍스트(선택).
   * 사용한 일러스트·BGM·효과음·성우 등의 출처/라이선스를 적는다(상업 배포 전 필수 정리).
   */
  credits?: string;
  /** 외부에서 업로드한 타이틀 배경(자체 GUI 위에 덮어씀). 없으면 Canvas 생성.
   * 게임 중 ESC 메뉴 배경은 여기 없다 — `escMenuUi.images.bg` 가 그 자리다(아래 `escMenuUi` 참고). */
  menuArt?: { main?: string };
  /**
   * 타이틀(메인 메뉴) 화면 BGM(선택). 비어 있으면 options.rpy 가 `config.main_menu_music`
   * 자체를 안 낸다(회귀 0) — 엔진 기본값이 None 이라 타이틀은 무음으로 남는다.
   * `ext` 는 업로드 시점 실제 MIME 기준(`extFromMime`). 장면 BGM 은 파일 확장자를 `.mp3` 로
   * 고정하지만(generate.ts), 성우 파일에서 wav 를 .mp3 로 라벨링해 무음이 됐던 전례
   * (buildZip.ts 주석 참고) 때문에 이 경로는 실제 MIME 을 따라간다. 미지정(옛 데이터)은
   * 'mp3' 로 폴백.
   */
  titleBgm?: { assetId: string; ext?: 'mp3' | 'wav' };
  /**
   * 게임 아이콘(선택) — 둘은 Ren'Py 안에서 쓰이는 자리가 완전히 다르다.
   *  · ico    : 프로젝트 **루트**의 `icon.ico`. 배포 빌드 때 Ren'Py 런처가 exe 의 리소스를 다시 써
   *             박아 넣는다(launcher/game/distribute.rpy 가 `<프로젝트경로>/icon.ico` 를 읽는다).
   *             그래서 `renpy.exe <폴더>` 로 그냥 실행해선 안 보이고, 배포 결과물에서만 보인다.
   *  · window : 실행 중 창·작업표시줄 아이콘(`gui.window_icon` → game/gui/window_icon.png).
   *             엔진 기본값이 None 이라 안 올리면 Ren'Py 기본 아이콘이 뜬다.
   * 하나만 올려도 되고, 둘 다 없으면 생성물이 기존과 바이트 단위로 같다(회귀 0).
   */
  gameIcon?: { ico?: string; window?: string };
  /**
   * BGM 재생 방식(선택, 미지정이면 아래 기본값). 두 필드 모두 **켜는 쪽이 예외 동작**이 되도록
   * 이름을 잡았다 — 그래야 필드가 없는 기존 프로젝트(=대다수)가 아무것도 안 해도 원하는 기본값을
   * 그대로 받는다(옵트아웃 네이밍).
   *  · restartSameBgm : 장면이 바뀔 때 **같은 곡이어도** 끊고 처음부터 다시 재생한다.
   *                     미지정/false = 같은 곡이면 안 끊고 이어간다(기본, `play music … if_changed`
   *                     — Ren'Py 가 현재 재생 중인 파일명과 새로 요청한 파일명이 같으면 dequeue·
   *                     fadeout 을 건너뛰고 fadein 을 0 으로 강제한다. renpy/audio/music.py 확인).
   *  · stopWhenUnset  : BGM 을 **지정하지 않은** 장면에 들어가면 음악을 멈춘다(`stop music fadeout 1.0`).
   *                     미지정/false = 앞 곡이 그대로 이어진다(기본 = 기존 동작).
   *                     판정은 `#BGM` 을 아예 안 적은 장면(hasBgm(scene)===false)에만 걸린다 —
   *                     "안 적었다"와 "적었지만 아직 업로드를 안 했다"는 다르다. 후자(`#BGM` 은
   *                     있는데 bgmAssetId 가 없는 장면)는 작가가 곡을 의도한 자리라, 아직 파일을
   *                     안 올렸다고 음악을 멈춰버리면 업로드 전 임시 플레이 중 앞 곡이 끊기는
   *                     불편이 생긴다 — 그래서 이름만 있고 파일이 없는 장면은 멈추지 않는다.
   */
  bgmPlayback?: { restartSameBgm?: boolean; stopWhenUnset?: boolean };
  /**
   * 아이템(소품) 팝업 이미지 — 아이템 이름 → assetId. 같은 이름은 한 이미지를 공유한다.
   * 대본 `#아이템 <이름>` 태그로 참조되고, "발견한 아이템" 보관함이 이 목록을 갤러리로 보여준다.
   */
  itemAssetIds?: Record<string, string>;
  /**
   * 자동 번역(GPT) 모드. 미지정/off = 사용 안 함(엑셀 직접 번역만). fast=gpt-4o-mini, quality=gpt-4o.
   * off 가 아닐 때만 장면 탭에 "전체 자동 번역" 버튼이 노출된다. 프로젝트별로 저장·내보내기된다.
   */
  translateMode?: TranslateMode;
  /**
   * GUI 대사창·폰트 사용자 조정(테마 위에 덮어씀). 비면 테마 기본값 사용.
   * 필드 설명은 GuiOverrides(renpy/gui/theme.ts) 쪽 JSDoc 참고 — 이 타입은 거기서 가져온다
   * (types.ts 가 이미 그쪽에서 GenreId/GuiTheme 를 import 하고 있어, 반대로 theme.ts 가 types.ts 를
   * import 하면 순환이 생긴다 — 그래서 canonical 정의는 theme.ts 에 남기고 여기서 재사용만 한다).
   */
  guiOverrides?: GuiOverrides;
  /**
   * 배경 이름 키워드 → 캐릭터 의상 자동 지정 규칙(프로젝트 단위, 에셋 탭 캐릭터 카드에서 편집).
   * 장면마다 `#복장`을 반복해 적지 않아도, 배경 이름에 키워드가 들어가면 자동으로 그 의상을 입힌다.
   * 우선순위는 resolveOutfit 참고(장면 직접 지정 > 규칙 첫 일치 > '기본').
   */
  outfitRules?: OutfitRule[];
  /**
   * 플레이어가 직접 정하는 주인공 이름(선택, opt-in). 미지정이면 대본에 적힌 이름 고정(= 기존 동작,
   * 회귀 0 — generate.ts characterDefs 가 이 필드 유무로 분기한다).
   * character = 대상 화자의 project.characters[].name. 대본을 다시 파싱해 그 이름이 사라지면
   * (캐릭터 삭제/개명) 생성기가 조용히 이 기능을 끈다 — 없는 캐릭터를 참조하지 않는다(characterDefs 의
   * `project.characters.find(c => c.name === playerName.character)` 게이트, 못 찾으면 undefined 와 동일 출력).
   * Ren'Py 쪽 구현은 `Character(<callable>, dynamic=True)` — say 문이 실행될 때마다 who() 를 다시
   * 불러서(renpy/character.py) persistent 에 담긴 이름이 세이브를 넘어서도 따라온다.
   * ⚠️ **"즉시"가 아니라 "다음 대사부터"다** — 설정에서 이름을 바꿔도 화면에 이미 떠 있는 줄과
   * 기록(히스토리)의 옛 항목은 그대로 남는다. 엔진 한계이지 버그가 아니고 우회로도 없다
   * (근거·시도하지 말아야 할 것은 CLAUDE.md "플레이어 지정 주인공 이름은 다음 대사부터" 항목 참고).
   */
  playerName?: { character: string };
  /** 메인 메뉴 이미지 GUI(업로드 전용). 비어 있으면 기존 텍스트 메뉴 그대로 나간다(회귀 0). */
  mainMenuUi?: {
    buttons?: Partial<Record<MenuButtonSlot, Partial<Record<MenuButtonState, string>>>>; // assetId
    logo?: string; // assetId
    /** 로고 원본 가로/세로 비율(naturalWidth/naturalHeight). importTitleLogo 가 업로드 시점에 잰다. */
    logoAspect?: number;
    layout?: MainMenuLayout;
    /** 배치 프리셋(미지정 = DEFAULT_MAIN_MENU_PRESET='left-column'). */
    preset?: MainMenuPresetId;
    /** 프리셋 기본 라벨(MAIN_MENU_PRESETS[..].labels) 위에 사용자가 덮어쓴 라벨. */
    labels?: Partial<Record<MenuButtonSlot, { main?: string; sub?: string }>>;
    /** 메뉴 버튼 텍스트 폰트(main/sub) — src/fonts/fontCatalog.ts 의 FontPreset id. 미지정이면 본문/주 폰트를 따라간다. */
    menuFontId?: string;
    menuSubFontId?: string;
    /**
     * 텍스트 프리셋(이미지 없는 슬롯)의 글자 외곽선. 미지정 = true(켜짐).
     * 이미지 버튼 경로에서는 원래 텍스트 메뉴가 깔고 있던 main_menu_frame(좌측 어두운 스크림
     * gui.menu_overlay_color)을 제거했다(시안에 없는 어두운 띠라서) — 그래서 텍스트 프리셋은
     * 사용자가 올린 배경 아트 위에 아무 보호막 없이 놓인다. 아트가 밝으면 글자가 거의 안
     * 보인다(실기 확인) — 배경에 기대지 않는 외곽선으로 대비를 스스로 만든다. 아트가 이미
     * 어두워 외곽선이 오히려 거슬리는 게임은 꺼도 된다.
     */
    textOutline?: boolean;
    /**
     * 타이틀의 정보/크레딧/도움말 링크 표시(기본 true). 이 셋은 MAIN_MENU_SLOTS 에 없어 이미지 버튼
     * 슬롯 자체가 없다 — 이미지 GUI를 쓰면 혼자 맨 텍스트로 남아 겉돈다(실기 확인). 꺼도 게임 중
     * ESC 메뉴(screen navigation)에는 그대로 남아 있어 접근성 손실은 없다.
     */
    showInfoLinks?: boolean;
  };
  /**
   * 인게임 우측 퀵메뉴 이미지 GUI(업로드 전용). 비어 있으면 기존 텍스트 알약 메뉴 그대로 나간다
   * (회귀 0 — mainMenuUi 와 같은 계약). 'menu' 슬롯의 idle 이미지가 있어야 이미지 모드가 켜진다.
   */
  quickMenuUi?: {
    buttons?: Partial<Record<QuickButtonSlot, Partial<Record<QuickButtonState, string>>>>; // assetId
    /** 버튼 뒤 보조 패널 assetId(선택 — 없으면 패널 없이 버튼만 그린다). */
    panel?: string;
    /** 패널 원본 가로/세로(px). importQuickPanel 이 업로드 시점에 잰다. 없으면 232×625 로 가정. */
    panelWidth?: number;
    panelHeight?: number;
    layout?: QuickMenuLayout;
  };
  /**
   * ESC(게임 중) 메뉴 이미지 GUI(업로드 전용). 비어 있으면 기존 스타일 그대로 나간다(회귀 0).
   * 메인/퀵메뉴와 달리 "슬롯 × 상태" 격자가 아니라 **역할마다 파일 1장**인 평평한 맵이다 —
   * 슬라이더 트랙엔 hover 가 없고 팝업 배경엔 상태가 없어서 격자로 두면 빈칸이 절반이 된다.
   *
   * ⚠️ 이 에셋들엔 **글자를 굽지 않는다**(좌측 메뉴 배경 226×50 처럼 틀만). 라벨은 Ren'Py 가 그려야
   * 자막 언어를 바꿀 때 메뉴도 같이 바뀐다 — 이 앱의 다국어가 핵심 기능이라 지켜야 하는 제약이다.
   */
  escMenuUi?: {
    images?: Partial<Record<EscImageId, string>>;
    /**
     * ESC 메뉴 위 **글자색**. 이미지가 아니라 Ren'Py 가 그리는 텍스트(세이브 날짜·대사 기록·페이지
     * 번호·버전 문자열 등 동적 텍스트)라 이미지 버튼으로는 대체할 수 없어 색으로만 맞춘다.
     *
     * 미지정이면 DEFAULT_ESC_COLORS(밝은 아이보리 카드 아트 기준). **어두운 아트를 쓰는 게임은 여기만
     * 바꾸면 된다** — 이 값을 코드에 하드코딩하면 다음 게임에서 정확히 반대로 안 읽힌다(좌측 내비만은
     * 어두운 사이드바 위라 애초에 규칙이 반대다 — screensRpy 의 ESC_TEXT_COLORS 주석 참고).
     */
    colors?: EscColors;
    /**
     * ESC 메뉴 글꼴 — src/fonts/fontCatalog.ts 의 FontPreset id. 미지정 = 인터페이스 폰트(본문 폰트)를
     * 그대로 따라간다. colors 와 같은 게이트 — **ESC 이미지를 하나라도 올린 프로젝트에서만 적용된다**
     * (images 가 비어 있으면 escMenuUi 자체가 회귀 0 이라 이 필드도 무시된다).
     */
    fontId?: string;
    /**
     * 좌측 사이드바에 메인 메뉴 타이틀 로고(mainMenuUi.logo)를 작게 표시(기본 true=켜짐). 시안엔
     * 사이드바 위에 게임 제목이 있는데, ESC 이미지 GUI 는 새 화면을 만들지 않고 기존 화면에 스타일만
     * 얹는 방식이라 이 자리를 채울 전용 텍스트 위젯이 없었다 — 로고가 있으면 그걸 재사용한다. logo
     * 자체가 없으면 이 값과 무관하게 표시되지 않는다.
     */
    showSidebarLogo?: boolean;
  };
}

/**
 * ESC 메뉴 텍스트 팔레트. 롤은 다섯뿐이고 각각이 여러 Ren'Py 스타일에 퍼진다(어느 스타일에
 * 꽂히는지는 screensRpy 의 buildEscMenuStyles 가 단일 소스).
 */
export interface EscColors {
  /** 본문·설명·대사 기록·슬롯 캡션 — 카드 위에서 가장 많이 읽히는 색. */
  body?: string;
  /** 화면 제목(저장/설정/기록…). */
  title?: string;
  /** 그룹 라벨·도움말 키 이름·페이지 라벨 등 강조 텍스트. */
  accent?: string;
  /** 날짜·페이지 번호·잠긴 항목 같은 보조 텍스트. */
  muted?: string;
  /** 선택된 항목의 배경(페이지 번호·도움말 탭). 그 위 글자는 자동으로 밝은 색이 된다. */
  selectedBg?: string;
}

/** 밝은 아이보리 카드 아트 기준 기본 팔레트(카페테리아 에셋에 맞춰 실기에서 조정). */
export const DEFAULT_ESC_COLORS: Required<EscColors> = {
  body: '#4a3a2f',
  title: '#4a3730',
  accent: '#8a6a4f',
  muted: '#9b8977',
  selectedBg: '#6b4f3a',
};

/** escMenuUi.colors + 기본값 병합(부분 지정·빈 문자열 모두 기본값으로 떨어진다). */
export function escColors(colors?: EscColors): Required<EscColors> {
  return {
    body: colors?.body || DEFAULT_ESC_COLORS.body,
    title: colors?.title || DEFAULT_ESC_COLORS.title,
    accent: colors?.accent || DEFAULT_ESC_COLORS.accent,
    muted: colors?.muted || DEFAULT_ESC_COLORS.muted,
    selectedBg: colors?.selectedBg || DEFAULT_ESC_COLORS.selectedBg,
  };
}

/** 메인 메뉴 버튼 슬롯(순서 고정 — 처음부터→이어하기→불러오기→환경설정→갤러리→게임종료). */
export type MenuButtonSlot = 'start' | 'continue' | 'load' | 'prefs' | 'gallery' | 'quit';
/** 버튼 이미지 상태 4종(사용자 제공 에셋 기준). */
export type MenuButtonState = 'idle' | 'hover' | 'press' | 'disabled';

/**
 * 메인 메뉴 이미지 GUI 좌표(전부 1920×1080 기준 px — 다른 해상도는 렌더 시점에 height/1080 배율을
 * 곱해 구운다, MainMenuPlan.scale 참고). gap 은 버튼 세로 간격(78px 버튼 + 12px 간격 = 90px 행 간격이
 * 스펙 좌표와 정확히 맞아떨어져, 절대좌표 6개 대신 vbox spacing 하나로 재현된다).
 */
export interface MainMenuLayout {
  x?: number;
  y?: number;
  gap?: number;
  hoverShiftX?: number;
  logoX?: number;
  logoY?: number;
  logoWidth?: number;
}

/** 사용자 제공 스펙의 권장 좌표(처음부터 X96/Y350, 78px 버튼 + 12px 간격). */
const DEFAULT_MAIN_MENU_LAYOUT: Required<MainMenuLayout> = {
  x: 96,
  y: 350,
  gap: 12,
  hoverShiftX: 8,
  logoX: 96,
  logoY: 90,
  logoWidth: 700,
};

/** 메뉴 버튼 슬롯 정의(순서 = 메뉴 표시 순서). fileKeywords 는 일괄 업로드 파일명 자동 매칭용. */
export const MAIN_MENU_SLOTS: { id: MenuButtonSlot; label: string; fileKeywords: string[] }[] = [
  { id: 'start', label: '처음부터', fileKeywords: ['처음부터', '시작'] },
  { id: 'continue', label: '이어하기', fileKeywords: ['이어하기', '계속'] },
  { id: 'load', label: '불러오기', fileKeywords: ['불러오기', '로드'] },
  { id: 'prefs', label: '환경설정', fileKeywords: ['환경설정', '설정'] },
  { id: 'gallery', label: '갤러리', fileKeywords: ['갤러리'] },
  { id: 'quit', label: '게임 종료', fileKeywords: ['게임종료', '게임 종료', '종료', '끝내기'] },
];

/**
 * 버튼 상태 정의. fileKeywords 는 일괄 업로드 파일명 자동 매칭용.
 * renpySupported=false(press) 는 Ren'Py imagebutton 이 "누르는 중" 전용 이미지 슬롯을 지원하지
 * 않아(엔진 전수 조사 결과 activate_ 프리픽스를 실제로 세팅하는 코드가 없는 죽은 슬롯) 업로드는
 * 받되 저장·출력하지 않는다 — 그래도 매칭 자체는 계속 인식해야 "건너뜀" 안내를 낼 수 있어 목록엔 남긴다.
 */
export const MENU_BUTTON_STATES: { id: MenuButtonState; label: string; fileKeywords: string[]; renpySupported: boolean }[] = [
  { id: 'idle', label: '기본', fileKeywords: ['기본'], renpySupported: true },
  { id: 'hover', label: '마우스오버', fileKeywords: ['마우스오버', '마우스 오버', '호버', 'hover'], renpySupported: true },
  { id: 'press', label: '클릭', fileKeywords: ['클릭', '눌림', 'press'], renpySupported: false },
  { id: 'disabled', label: '비활성화', fileKeywords: ['비활성화', '비활성', 'disabled'], renpySupported: true },
];

/**
 * 인게임 우측 퀵메뉴 버튼 슬롯(순서 = 화면 표시 순서). 'menu' 는 나머지를 펼치는 토글이라
 * 목록에서 따로 떼어 맨 위 고정 위치에 그린다(QUICK_LIST_SLOTS 참고).
 * fileKeywords 는 일괄 업로드 파일명 자동 매칭용 — '저장'이 '빠른저장'의 부분문자열이지만
 * matchLongestKeyword 가 긴 키워드부터 검사해 정확히 갈린다.
 */
export type QuickButtonSlot =
  | 'menu'
  | 'back'
  | 'history'
  | 'skip'
  | 'auto'
  | 'hide'
  | 'save'
  | 'qsave'
  | 'qload'
  | 'prefs';

/**
 * 퀵메뉴 버튼 이미지 상태. 메인 메뉴 4종에 'selected'(활성화)를 더한 것 —
 * 스킵·자동은 켜져 있는 동안 Ren'Py 가 selected 상태가 되므로 전용 이미지를 쓸 수 있다.
 * (메인 메뉴 쪽 MENU_BUTTON_STATES 에는 selected 를 넣지 않는다 — 거기엔 토글 버튼이 없어
 *  업로드 그리드에 의미 없는 열이 하나 늘 뿐이다.)
 */
export type QuickButtonState = MenuButtonState | 'selected';

export const QUICK_MENU_SLOTS: {
  id: QuickButtonSlot;
  label: string;
  fileKeywords: string[];
  /** 이 슬롯이 selected(활성화) 이미지를 쓰는가 — 스킵·자동만 해당. */
  selectable?: boolean;
}[] = [
  { id: 'menu', label: '메뉴', fileKeywords: ['메뉴'] },
  { id: 'back', label: '뒤로', fileKeywords: ['뒤로'] },
  { id: 'history', label: '기록', fileKeywords: ['기록'] },
  { id: 'skip', label: '스킵', fileKeywords: ['스킵'], selectable: true },
  { id: 'auto', label: '자동', fileKeywords: ['자동'], selectable: true },
  { id: 'hide', label: '숨기기', fileKeywords: ['숨기기'] },
  { id: 'save', label: '저장', fileKeywords: ['저장'] },
  { id: 'qsave', label: '빠른저장', fileKeywords: ['빠른저장'] },
  { id: 'qload', label: '빠른불러오기', fileKeywords: ['빠른불러오기'] },
  { id: 'prefs', label: '설정', fileKeywords: ['설정'] },
];

/** 'menu'(토글) 를 뺀 펼침 목록 — 화면에서 listY 부터 listStep 간격으로 쌓인다. */
export const QUICK_LIST_SLOTS = QUICK_MENU_SLOTS.filter((s) => s.id !== 'menu');

/**
 * 퀵메뉴 버튼 상태 정의. press 가 renpySupported=false 인 이유는 MENU_BUTTON_STATES 와 같다
 * (엔진에 "누르는 중" 이미지 슬롯이 없다 — 누르는 동안엔 hover 가 보인다).
 * '비활성화'가 '활성화'를 포함하지만 matchLongestKeyword 가 긴 쪽을 먼저 보므로 안전하다.
 */
export const QUICK_BUTTON_STATES: {
  id: QuickButtonState;
  label: string;
  fileKeywords: string[];
  renpySupported: boolean;
}[] = [
  { id: 'idle', label: '기본', fileKeywords: ['기본'], renpySupported: true },
  { id: 'hover', label: '마우스오버', fileKeywords: ['마우스오버', '마우스 오버', '호버', 'hover'], renpySupported: true },
  { id: 'press', label: '클릭', fileKeywords: ['클릭', '눌림', 'press'], renpySupported: false },
  { id: 'disabled', label: '비활성화', fileKeywords: ['비활성화', '비활성', 'disabled'], renpySupported: true },
  { id: 'selected', label: '활성화', fileKeywords: ['활성화', 'selected', 'active'], renpySupported: true },
];

/**
 * 퀵메뉴 좌표(전부 1920×1080 기준 px — 렌더 시점에 height/1080 배율을 곱해 굽는다).
 * 사용자 제공 스펙: 패널 X1688/Y0(232×625), 버튼 X1718, 메뉴 Y16, 목록 Y82 부터 53px 간격.
 * 메뉴(토글)와 목록 시작 Y 를 따로 두는 건 스펙상 그 사이만 간격이 다르기(66px) 때문이다.
 */
export interface QuickMenuLayout {
  panelX?: number;
  panelY?: number;
  btnX?: number;
  menuY?: number;
  listY?: number;
  /** 목록 버튼의 행 간격(버튼 높이 포함한 시작점 간 거리). */
  listStep?: number;
}

export const DEFAULT_QUICK_MENU_LAYOUT: Required<QuickMenuLayout> = {
  panelX: 1688,
  panelY: 0,
  btnX: 1718,
  menuY: 16,
  listY: 82,
  listStep: 53,
};

/** 프로젝트에 저장된 값 위에 기본값을 덮어 최종 좌표를 만든다. */
export function quickMenuLayout(p: Project): Required<QuickMenuLayout> {
  return { ...DEFAULT_QUICK_MENU_LAYOUT, ...p.quickMenuUi?.layout };
}

/**
 * Ren'Py 프로젝트 안의 퀵메뉴 이미지 경로(game/ 기준). screensRpy·buildZip 공용 —
 * menuButtonFile 과 같은 이유로 여기가 단일 소스다(어긋나면 없는 파일 참조 → 런타임 크래시).
 * 메인 메뉴는 `gui/menu/`, 퀵메뉴는 `gui/quick/` 로 네임스페이스를 분리한다.
 */
export function quickButtonFile(slot: QuickButtonSlot, state: QuickButtonState): string {
  return `gui/quick/${slot}_${state}.png`;
}

/** 퀵메뉴 보조 패널(버튼 뒤에 깔리는 아이보리 판) 경로. */
export const QUICK_PANEL_FILE = 'gui/quick/panel.png';

/**
 * ESC 게임 메뉴 이미지 역할 id. 사용자 에셋 23장과 1:1 대응한다.
 * 이름은 "무엇을 칠하는가"가 아니라 "어느 위젯의 어느 상태인가"로 지었다 — screensRpy 가 스타일
 * 배경으로 꽂을 때 그대로 읽히도록.
 */
export type EscImageId =
  | 'bg'
  | 'nav_idle'
  | 'nav_hover'
  | 'nav_selected'
  | 'card'
  | 'choice_idle'
  | 'choice_hover'
  | 'choice_selected'
  | 'choice_disabled'
  | 'slider_track'
  | 'slider_fill'
  | 'slider_thumb'
  | 'save_idle'
  | 'save_hover'
  | 'save_empty'
  | 'gallery_idle'
  | 'gallery_locked'
  | 'scroll_track'
  | 'scroll_thumb'
  | 'popup_bg'
  | 'popup_btn_idle'
  | 'popup_btn_hover'
  | 'popup_btn_selected';

/**
 * ESC 메뉴 이미지 정의(업로드 UI 표시 순서 = 이 배열 순서).
 * fileKeywords 는 일괄 업로드 파일명 자동 매칭용 — matchEscImageFile 이 `_`·공백을 지운 뒤 비교하므로
 * 여기 키워드도 붙여 쓴다('좌측메뉴기본'). 긴 키워드가 먼저 검사되므로 '선택버튼선택'이
 * '선택버튼'에 잡아먹히지 않는다(메뉴 쪽 '저장' vs '빠른저장'과 같은 함정).
 */
export const ESC_IMAGES: {
  id: EscImageId;
  label: string;
  group: string;
  hint: string;
  fileKeywords: string[];
}[] = [
  { id: 'bg', label: '공통 배경', group: '공통', hint: '1920×1080 · 사이드바 폭 361 · 카드 안쪽 361~1868 × 51~1028', fileKeywords: ['esc공통배경', '공통배경'] },
  { id: 'nav_idle', label: '좌측메뉴 기본', group: '공통', hint: '226×50 · 평상시엔 전부 투명(배경 없음이 의도)', fileKeywords: ['좌측메뉴기본'] },
  { id: 'nav_hover', label: '좌측메뉴 마우스오버', group: '공통', hint: '226×50 · 모서리 19', fileKeywords: ['좌측메뉴마우스오버'] },
  { id: 'nav_selected', label: '좌측메뉴 선택', group: '공통', hint: '226×50 · 모서리 18', fileKeywords: ['좌측메뉴선택'] },
  { id: 'card', label: '콘텐츠 카드', group: '공통', hint: '96×96 9slice · 테두리 24px · 모서리 21', fileKeywords: ['콘텐츠카드'] },
  { id: 'choice_idle', label: '선택버튼 기본', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼기본'] },
  { id: 'choice_hover', label: '선택버튼 마우스오버', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼마우스오버'] },
  { id: 'choice_selected', label: '선택버튼 선택', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼선택'] },
  { id: 'choice_disabled', label: '선택버튼 비활성화', group: '버튼', hint: '188×48 · 모서리 17', fileKeywords: ['선택버튼비활성화'] },
  { id: 'slider_track', label: '슬라이더 트랙', group: '슬라이더', hint: '600×14 · 모서리 3', fileKeywords: ['슬라이더트랙'] },
  { id: 'slider_fill', label: '슬라이더 채움', group: '슬라이더', hint: '600×14 · 모서리 3', fileKeywords: ['슬라이더채움'] },
  { id: 'slider_thumb', label: '슬라이더 핸들', group: '슬라이더', hint: '28×28 · 모서리 11', fileKeywords: ['슬라이더핸들'] },
  { id: 'save_idle', label: '저장슬롯 기본', group: '슬롯', hint: '320×190 · 안쪽 칸 298×132(여백 좌우상 11, 하 47) · 모서리 15', fileKeywords: ['저장슬롯기본'] },
  { id: 'save_hover', label: '저장슬롯 마우스오버', group: '슬롯', hint: '320×190 · 안쪽 칸 298×132(여백 좌우상 11, 하 47) · 모서리 15', fileKeywords: ['저장슬롯마우스오버'] },
  { id: 'save_empty', label: '저장슬롯 빈슬롯', group: '슬롯', hint: '320×190 · 안쪽 칸 298×132(여백 좌우상 11, 하 47) · 모서리 15', fileKeywords: ['저장슬롯빈슬롯'] },
  { id: 'gallery_idle', label: '갤러리슬롯 기본', group: '슬롯', hint: '300×180 · 안쪽 칸 278×126(여백 좌우상 11, 하 43) · 모서리 15 · 아이템·CG 갤러리 공용(칸 비율에 맞춰 늘어남)', fileKeywords: ['갤러리슬롯기본'] },
  { id: 'gallery_locked', label: '갤러리슬롯 잠김', group: '슬롯', hint: '300×180 · 안쪽 칸 278×126(여백 좌우상 11, 하 43) · 모서리 15 · 아이템·CG 갤러리 공용(칸 비율에 맞춰 늘어남)', fileKeywords: ['갤러리슬롯잠김'] },
  { id: 'scroll_track', label: '스크롤바 트랙', group: '스크롤', hint: '10×600', fileKeywords: ['스크롤바트랙'] },
  { id: 'scroll_thumb', label: '스크롤바 핸들', group: '스크롤', hint: '10×180', fileKeywords: ['스크롤바핸들'] },
  { id: 'popup_bg', label: '종료팝업 배경', group: '팝업', hint: '680×330 · 모서리 27', fileKeywords: ['종료팝업배경'] },
  { id: 'popup_btn_idle', label: '종료버튼 기본', group: '팝업', hint: '200×58 · 모서리 22', fileKeywords: ['종료버튼기본'] },
  { id: 'popup_btn_hover', label: '종료버튼 마우스오버', group: '팝업', hint: '200×58 · 모서리 22', fileKeywords: ['종료버튼마우스오버'] },
  { id: 'popup_btn_selected', label: '종료버튼 선택', group: '팝업', hint: '200×58 · 모서리 22', fileKeywords: ['종료버튼선택'] },
];

/**
 * Ren'Py 프로젝트 안의 ESC 메뉴 이미지 경로(game/ 기준) — screensRpy·buildZip 공용 단일 소스.
 * ⚠️ 예외 하나: 'bg' 는 이 경로를 쓰지 않는다. 공통배경은 곧 `gui.game_menu_background` 이므로
 * buildZip 이 `gui/game_menu.png` 자리에 직접 써서 낸다(파일을 둘로 안 늘린다).
 */
export function escImageFile(id: EscImageId): string {
  return `gui/esc/${id}.png`;
}

/**
 * 저장 슬롯 썸네일 둥근 마스크 PNG 경로(game/ 기준) — 업로드 에셋이 아니라 앱이 직접 굽는 생성물
 * (roundedMaskPng, escSlotThumbMetrics 가 크기 단일 소스)이라 escImageFile 의 `gui/esc/<id>.png`
 * 패턴 밖에 별도 상수로 둔다. screensRpy(AlphaMask 참조)와 buildZip(실제 PNG 배치) 양쪽이 이
 * 상수 하나만 봐야 경로가 어긋나지 않는다.
 */
export const ESC_SAVE_THUMB_MASK_FILE = 'gui/esc/save_thumb_mask.png';

/**
 * 감상한 CG 갤러리 썸네일 둥근 마스크 PNG 경로(game/ 기준) — ESC_SAVE_THUMB_MASK_FILE 과 같은 이유로
 * 별도 생성물 상수(escCgThumbMetrics 가 크기 단일 소스, renpy/gui). 발견한 아이템 쪽은 `fit "contain"`
 * 으로 절대 자르지 않아 마스크가 필요 없다 — CG 만 `fit "cover"` + 이 마스크로 둥근 모서리를 낸다.
 */
export const ESC_CG_THUMB_MASK_FILE = 'gui/esc/cg_thumb_mask.png';

/**
 * 파일명 → ESC 이미지 역할. 메뉴 버튼 매칭과 같은 규칙에 **`_`·`-` 제거**를 더한다
 * (`GUI_좌측메뉴_기본.png` → `좌측메뉴기본`) — 에셋 파일명이 밑줄로 낱말을 끊어놨기 때문.
 */
export function matchEscImageFile(filename: string): EscImageId | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/^GUI_/i, '').replace(/[\s_-]+/g, '').toLowerCase();
  return matchLongestKeyword(norm, ESC_IMAGES);
}

/** 파일명 → 퀵메뉴 슬롯·상태. matchMenuButtonFile 과 동일한 정규화 규칙. */
export function matchQuickButtonFile(
  filename: string,
): { slot: QuickButtonSlot; state: QuickButtonState } | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/^GUI_/i, '').replace(/\s+/g, '').toLowerCase();
  const slot = matchLongestKeyword(norm, QUICK_MENU_SLOTS);
  const state = matchLongestKeyword(norm, QUICK_BUTTON_STATES);
  if (!slot || !state) return undefined;
  return { slot, state };
}

/**
 * 메인 메뉴 배치 프리셋 5종. `align`/`direction` 은 screensRpy 의 컨테이너(vbox/hbox)·정렬 축을
 * 결정하고, `layout` 은 그 프리셋을 골랐을 때 기본으로 쓰일 좌표(mainMenuLayout 이 병합).
 * `labels` 는 프리셋별 기본 라벨(main=주 텍스트, sub=부 텍스트) — 비어 있는 슬롯은 mainMenuLabels
 * 가 MAIN_MENU_SLOTS 의 원래 label 로 폴백한다(1줄 프리셋은 굳이 여기 채우지 않는다).
 */
export type MainMenuPresetId = 'left-column' | 'bottom-row' | 'right-dual' | 'right-marker' | 'renpy-classic';

export interface MainMenuPresetDef {
  id: MainMenuPresetId;
  label: string; // 한글 표시명(UI 프리셋 선택 카드)
  hint: string; // UI 한 줄 설명
  align: 'left' | 'right' | 'center'; // center = 하단 가로
  direction: 'vertical' | 'horizontal';
  dualLabel: boolean; // 주+부 2줄 표시 여부
  marker: 'none' | 'triangle'; // 좌측 마커 글리프(▶) 사용 여부
  mainSize: number; // 주 텍스트 크기(1920 기준 px)
  subSize: number; // 부 텍스트 크기(1920 기준 px)
  layout: Required<MainMenuLayout>;
  labels: Partial<Record<MenuButtonSlot, { main?: string; sub?: string }>>;
}

/**
 * 프리셋 5종 정의. `left-column` 의 layout 은 DEFAULT_MAIN_MENU_LAYOUT 을 그대로 참조한다
 * (같은 값을 두 곳에 따로 적으면 언젠가 어긋난다 — 회귀 0 의 핵심이라 단일 소스로 강제).
 */
export const MAIN_MENU_PRESETS: Record<MainMenuPresetId, MainMenuPresetDef> = {
  'left-column': {
    id: 'left-column',
    label: '좌측 세로 (기본)',
    hint: '화면 좌측 상단에 버튼이 세로로 나열됩니다(기존 기본 배치).',
    align: 'left',
    direction: 'vertical',
    dualLabel: false,
    marker: 'none',
    mainSize: 42,
    subSize: 22,
    layout: DEFAULT_MAIN_MENU_LAYOUT,
    labels: {},
  },
  'bottom-row': {
    id: 'bottom-row',
    label: '하단 가로 (제목+설명)',
    hint: '화면 하단에 버튼이 가로로 나열되고, 버튼마다 제목+설명 2줄이 표시됩니다.',
    align: 'center',
    direction: 'horizontal',
    dualLabel: true,
    marker: 'none',
    mainSize: 40,
    // gap 60→30·subSize 20→18(실기 확인: 원래 값은 1920px 폭을 넘겨 첫 항목이 화면 밖으로
    // 잘렸다). screensRpy.ts 가 항목마다 xsize round(270*scale) 고정폭을 주므로
    // 6×270 + 5×30(gap) = 1770 < 1920 — 화면 안에 정확히 들어간다(HORIZONTAL_ITEM_WIDTH 참고).
    subSize: 18,
    layout: { x: 0, y: 830, gap: 30, hoverShiftX: 0, logoX: 610, logoY: 60, logoWidth: 700 },
    labels: {
      // 고정 xsize(270px) 안에서 줄바꿈 없이 들어가도록 기본 문구도 짧게(실기 확인).
      start: { main: '게임 시작', sub: '새로운 이야기 시작' },
      continue: { main: '이어하기', sub: '이어서 진행합니다' },
      load: { main: '불러오기', sub: '저장 기록 불러오기' },
      prefs: { main: '환경 설정', sub: '세부 설정 조절' },
      gallery: { main: '엑스트라', sub: 'CG·이벤트 감상' },
      quit: { main: '게임 종료', sub: '게임을 끝냅니다' },
    },
  },
  'right-dual': {
    id: 'right-dual',
    label: '우측 2줄 (영문+한글)',
    hint: '화면 우측에 버튼이 세로로 나열되고, 버튼마다 영문 주 라벨 + 한글 부 라벨이 표시됩니다.',
    align: 'right',
    direction: 'vertical',
    dualLabel: true,
    marker: 'none',
    mainSize: 40,
    subSize: 22,
    layout: { x: 120, y: 320, gap: 28, hoverShiftX: 8, logoX: 1180, logoY: 80, logoWidth: 620 },
    labels: {
      start: { main: 'New Game', sub: '새로하기' },
      continue: { main: 'Continue', sub: '이어하기' },
      load: { main: 'Load Data', sub: '불러오기' },
      prefs: { main: 'Settings', sub: '시스템' },
      gallery: { main: 'Extra', sub: '콘텐츠 감상' },
      quit: { main: 'Exit', sub: '나가기' },
    },
  },
  'right-marker': {
    id: 'right-marker',
    label: '우측 마커 (▶)',
    hint: '화면 우측에 버튼이 세로로 나열되고, 호버 시 왼쪽에 ▶ 마커가 나타납니다.',
    align: 'right',
    direction: 'vertical',
    dualLabel: false,
    marker: 'triangle',
    mainSize: 38,
    subSize: 20,
    layout: { x: 140, y: 400, gap: 24, hoverShiftX: 0, logoX: 1180, logoY: 80, logoWidth: 620 },
    labels: {},
  },
  'renpy-classic': {
    id: 'renpy-classic',
    label: '렌파이 기본 (좌측 단순)',
    hint: "Ren'Py 기본 템플릿과 비슷한 좌측 단순 배치입니다(로고는 하단).",
    align: 'left',
    direction: 'vertical',
    dualLabel: false,
    marker: 'none',
    mainSize: 34,
    subSize: 20,
    layout: { x: 120, y: 380, gap: 18, hoverShiftX: 0, logoX: 1100, logoY: 800, logoWidth: 700 },
    labels: {},
  },
};

/** 프리셋 미지정 프로젝트의 기본값 — 기존 좌측 세로 1열(회귀 0). */
export const DEFAULT_MAIN_MENU_PRESET: MainMenuPresetId = 'left-column';

/** 프로젝트가 고른 프리셋 정의(미지정이면 DEFAULT_MAIN_MENU_PRESET). 잘못된 id 도 기본값으로 방어. */
export function mainMenuPreset(p: Project): MainMenuPresetDef {
  const id = p.mainMenuUi?.preset ?? DEFAULT_MAIN_MENU_PRESET;
  return MAIN_MENU_PRESETS[id] ?? MAIN_MENU_PRESETS[DEFAULT_MAIN_MENU_PRESET];
}

/**
 * 기본값 위에 프로젝트가 저장한 값을 병합한 유효 레이아웃. 기본값은 이제 고정된
 * DEFAULT_MAIN_MENU_LAYOUT 이 아니라 "선택된 프리셋의 layout"이다 — preset 미지정이면
 * left-column=DEFAULT_MAIN_MENU_LAYOUT 이라 기존 동작과 완전히 동일하다(회귀 0).
 */
export function mainMenuLayout(p: Project): Required<MainMenuLayout> {
  return { ...mainMenuPreset(p).layout, ...(p.mainMenuUi?.layout ?? {}) };
}

/**
 * 프리셋 기본 라벨 위에 사용자 편집(mainMenuUi.labels)을 덮은 최종 라벨(6슬롯 전부 채워 반환).
 * 프리셋이 그 슬롯의 기본 라벨을 안 갖고 있으면(1줄 프리셋 대부분) MAIN_MENU_SLOTS 의 원래
 * label 로 폴백하고 sub 는 빈 문자열(=1줄 렌더, screensRpy 가 sub 빈 문자열이면 text 줄 자체를 안 낸다).
 */
export function mainMenuLabels(p: Project): Record<MenuButtonSlot, { main: string; sub: string }> {
  const preset = mainMenuPreset(p);
  const overrides = p.mainMenuUi?.labels ?? {};
  const out = {} as Record<MenuButtonSlot, { main: string; sub: string }>;
  for (const slot of MAIN_MENU_SLOTS) {
    const presetLabel = preset.labels[slot.id];
    const override = overrides[slot.id];
    out[slot.id] = {
      main: override?.main ?? presetLabel?.main ?? slot.label,
      sub: override?.sub ?? presetLabel?.sub ?? '',
    };
  }
  return out;
}

/**
 * Ren'Py 프로젝트 안의 메뉴 버튼 이미지 경로(game/ 기준). screensRpy·buildZip 공용 —
 * 파일명 규칙의 단일 소스라 여기서만 만든다(어긋나면 없는 파일 참조 → 런타임 크래시).
 */
export function menuButtonFile(slot: MenuButtonSlot, state: MenuButtonState): string {
  return `gui/menu/${slot}_${state}.png`;
}

/** 타이틀 로고 이미지 경로(game/ 기준). */
export const TITLE_LOGO_FILE = 'gui/title_logo.png';

/**
 * Windows exe 아이콘 — **프로젝트 루트**(game/ 의 형제) 경로다. Ren'Py 런처가 배포 빌드 때
 * `os.path.join(project.path, "icon.ico")` 로 딱 이 이름만 찾으므로 바꾸면 안 된다.
 * (루트 파일 출력은 README.md 가 이미 쓰는 경로라 별도 배관이 필요 없다.)
 */
export const GAME_ICON_FILE = 'icon.ico';

/** 실행 중 창·작업표시줄 아이콘(game/ 기준). gui.window_icon 이 가리킨다. */
export const WINDOW_ICON_FILE = 'gui/window_icon.png';

/**
 * 타이틀 화면 BGM 경로(game/ 기준). 참조 쪽(generate.ts)과 배치 쪽(buildZip.ts)이 각자
 * 문자열을 만들면 어긋난 순간 없는 파일 참조로 런타임에 죽는다 — 단일 소스로만 만들 것.
 */
export function titleBgmFile(ext: 'mp3' | 'wav' = 'mp3'): string {
  return `audio/title_bgm.${ext}`;
}

/**
 * text 안에서 entries 의 키워드 중 가장 긴 것부터 순서대로 찾아 첫 매치의 id 를 반환한다.
 * 긴 키워드를 먼저 검사해야 짧은 키워드가 우연히 먼저 걸려 다른(더 구체적인) 슬롯/상태를
 * 가리키는 걸 놓치는 오탐을 막는다(예: '비활성' vs '비활성화').
 */
function matchLongestKeyword<T extends string>(
  text: string,
  entries: { id: T; fileKeywords: string[] }[],
): T | undefined {
  const candidates: { id: T; kw: string }[] = [];
  for (const e of entries) {
    for (const kw of e.fileKeywords) candidates.push({ id: e.id, kw: kw.replace(/\s+/g, '').toLowerCase() });
  }
  candidates.sort((a, b) => b.kw.length - a.kw.length);
  for (const c of candidates) {
    if (c.kw && text.includes(c.kw)) return c.id;
  }
  return undefined;
}

/**
 * 파일명(예 `GUI_처음부터_기본.png`)에서 확장자·`GUI_` 접두어·공백을 제거한 뒤 슬롯·상태를
 * keyword substring 매칭으로 판정한다. 슬롯·상태 둘 다 매칭돼야 성공, 하나라도 실패하면 undefined
 * (importMenuButtons 가 이 결과로 매칭 실패 파일을 사용자에게 알린다 — 조용히 버리지 않기 위함).
 */
export function matchMenuButtonFile(filename: string): { slot: MenuButtonSlot; state: MenuButtonState } | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/^GUI_/i, '').replace(/\s+/g, '').toLowerCase();
  const slot = matchLongestKeyword(norm, MAIN_MENU_SLOTS);
  const state = matchLongestKeyword(norm, MENU_BUTTON_STATES);
  if (!slot || !state) return undefined;
  return { slot, state };
}

/**
 * 파일명 → 표정 이름(스프라이트 일괄 업로드). 메뉴 버튼 매칭과 같은 정규화지만, 후보가 모듈 상수가
 * 아니라 **사용자가 정의한 표정 목록**이라 런타임 테이블을 만들어 넘긴다.
 * 긴 이름부터 검사하는 건 여기서도 필수다 — '미소'와 '옅은 미소'가 둘 다 있으면 짧은 쪽이 먼저
 * 걸려 엉뚱한 칸에 들어간다(메뉴 쪽 '저장' vs '빠른저장'과 같은 함정).
 * 캐릭터 이름은 매칭에 쓰지 않는다 — 업로드는 이미 특정 캐릭터 카드에서 일어나므로 축이 하나뿐이고,
 * 파일명에 캐릭터 이름이 들어 있어도(`한지수_옅은미소.png`) 표정만 찾으면 된다.
 */
export function matchExpressionFile(filename: string, expressions: string[]): string | undefined {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const norm = withoutExt.replace(/\s+/g, '').toLowerCase();
  const table = expressions.map((e) => ({ id: e, fileKeywords: [e] }));
  return matchLongestKeyword(norm, table);
}

/** 프로젝트의 유효 표정 목록('기본'을 항상 맨 앞에 포함). list 미지정/빈 배열이면 기본 세트. */
export function effectiveExpressions(list?: string[]): string[] {
  const base = list && list.length ? list.slice() : [...DEFAULT_EXPRESSIONS];
  return base.includes('기본') ? base : ['기본', ...base];
}

/** 캐릭터의 의상 이름 목록('기본'을 항상 맨 앞에 포함). */
export function characterOutfits(c: Character): string[] {
  return ['기본', ...(c.outfits?.map((o) => o.name) ?? [])];
}

/** (캐릭터, 의상, 표정) → 스프라이트 assetId. 해당 의상에 그 표정이 없으면 기본 의상으로 폴백. */
export function spriteAssetId(c: Character, outfit: string | undefined, expr: Expression): string | undefined {
  if (outfit && outfit !== '기본') {
    const o = c.outfits?.find((x) => x.name === outfit);
    const id = o?.expressions[expr];
    if (id) return id;
  }
  return c.expressions[expr];
}

/**
 * 1) 장면 직접 지정(#복장·장면 카드) → 2) 배경 이름에 키워드가 든 규칙 중 **가장 긴 키워드** →
 * 3) '기본'. 길이가 같으면 먼저 추가된 규칙이 이긴다.
 */
export function resolveOutfit(rules: OutfitRule[] | undefined, scene: Scene, charName: string): string {
  const explicit = scene.outfits?.[charName];
  if (explicit) return explicit;
  const bg = scene.background ?? '';
  let best: { outfit: string; len: number } | undefined;
  for (const r of rules ?? []) {
    const kw = r.keyword.trim();
    if (!kw || r.charName !== charName || !bg.includes(kw)) continue;
    // 더 구체적인(긴) 키워드가 이긴다. 동률이면 먼저 추가된 규칙 유지(> 가 아니라 >= 를 쓰지 않는 이유).
    if (!best || kw.length > best.len) best = { outfit: r.outfit, len: kw.length };
  }
  return best?.outfit ?? '기본';
}

/**
 * 장면의 줄마다 "스프라이트를 숨겨야 하는지"를 판정하는 단일 소스 — generate.ts(scriptBody)와
 * ScenePlayer 가 각자 계산하면 어긋나므로(CLAUDE.md 의 resolveEmotion 규칙과 같은 이유) 이 함수만
 * 본다. scene.hideSprites(장면 시작 상태)에서 출발해, 각 줄의 hideSprites(dialogue/narration 만
 * 가짐, 3-state — 미지정이면 앞 줄 상태 유지)로 뒤집힌다. `#CG` 게이팅(장면 끝까지 스프라이트 숨김)은
 * 이 함수가 모르는 별개 상태라 호출 측이 OR 로 합친다.
 */
export function spriteHiddenFlags(scene: Scene): boolean[] {
  const flags: boolean[] = [];
  let hidden = scene.hideSprites ?? false;
  for (const line of scene.lines) {
    if ((line.kind === 'dialogue' || line.kind === 'narration') && line.hideSprites !== undefined) {
      hidden = line.hideSprites;
    }
    flags.push(hidden);
  }
  return flags;
}

/**
 * 프로젝트의 base 로케일(대본 원문 언어). 미지정이면 'ko'.
 * 파라미터를 Pick 으로 좁혀둔 이유: 컴포넌트가 project 전체가 아니라 baseLocale 필드만 구독하고
 * (whole-project 셀렉터는 매 저장마다 새 객체라 무관한 필드 변경에도 리렌더를 유발) 그 값만
 * `{ baseLocale }` 로 넘겨도 그대로 동작하게 하기 위함 — Project 는 이 Pick 을 항상 만족하므로
 * 기존 전체 project 를 넘기던 호출부는 그대로 컴파일된다.
 */
export function baseLocaleOf(p: Pick<Project, 'baseLocale'>): Locale {
  return p.baseLocale ?? 'ko';
}

/** 프로젝트의 자동 번역 모드(미지정 = off). Pick 인 이유는 baseLocaleOf 와 동일. */
export function translateModeOf(p: Pick<Project, 'translateMode'>): TranslateMode {
  return p.translateMode ?? 'off';
}

/** 번역 모드 → OpenAI 모델 이름. off 면 null(번역 비활성). */
export function translateModelFor(mode: TranslateMode): string | null {
  if (mode === 'quality') return 'gpt-4o';
  if (mode === 'fast') return 'gpt-4o-mini';
  return null;
}

/**
 * 유효 자막 로케일(base 를 항상 맨 앞에 포함, 중복 제거). 2개 이상일 때만 번역 파일·선택 UI 가 의미 있다.
 * 목록 = 두 소스의 합집합:
 *   1) 명시적 지정(#설정_글언어 태그) — p.textLocales
 *   2) 자동감지 — 대사/지문에 번역(i18n)이 하나라도 있는 언어. 엑셀 C열=en·D열=ja 에 번역만
 *      채우면 태그 없이도 그 언어로 인게임 전환이 켜진다(번역=출력 의사로 간주).
 * base 원문에 번역만 있는(다국어 미사용) 프로젝트는 그대로 [base] 하나 → 하위호환.
 * 파라미터를 Pick 으로 좁혀둔 이유는 baseLocaleOf 와 동일(project 전체 대신 필요한 3개 필드만
 * 구독하는 컴포넌트가 그대로 넘길 수 있게).
 */
export function effectiveTextLocales(p: Pick<Project, 'baseLocale' | 'textLocales' | 'scenes'>): Locale[] {
  const base = baseLocaleOf(p);
  const set = new Set<Locale>();
  for (const l of p.textLocales ?? []) set.add(l); // ① 태그로 명시 지정한 언어
  for (const sc of p.scenes) {
    // ② 번역(i18n)이 실제로 들어 있는 언어를 자동 포함
    for (const line of sc.lines) {
      if (line.kind === 'item' || line.kind === 'cg' || line.kind === 'bgm' || !line.i18n) continue; // 아이템·CG·BGM 라인은 번역 대상 아님
      for (const [loc, v] of Object.entries(line.i18n) as [Locale, string | undefined][]) {
        if (v && v.trim()) set.add(loc);
      }
    }
  }
  return [base, ...[...set].filter((l) => l !== base)];
}

/** 유효 음성 로케일(base 를 앞에 포함, 중복 제거). 비어 있으면 음성 미사용([]) — base 만이면 단일 음성. */
export function effectiveVoiceLocales(p: Project): Locale[] {
  const list = p.voiceLocales ?? [];
  if (!list.length) return [];
  const base = baseLocaleOf(p);
  return list.includes(base) ? [base, ...list.filter((l) => l !== base)] : list.slice();
}

export function emptyProject(): Project {
  return {
    title: '나의 비주얼노벨',
    author: '작가',
    width: 1920,
    height: 1080,
    scenes: [],
    characters: [],
    rawInput: '',
    genre: 'romance',
    // 새 프로젝트는 그라데이션 대사창 기본 켜짐(사용자 확정). 단, 이 초기값은 emptyProject 에만
    // 적용된다 — resolve 단계에서 `?? true` 로 바꾸면 이미 설정을 건드린 적 없는 기존 저장
    // 프로젝트(guiOverrides 자체가 없거나 dialogueGradient 미지정)까지 전부 그라데이션으로
    // 바뀌어버린다(회귀). "새 프로젝트만" 이라는 조건은 emptyProject 호출 시점에만 걸 수 있다.
    guiOverrides: { dialogueGradient: true },
  };
}
