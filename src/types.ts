// 도메인 데이터 모델 — 파서 출력, UI 상태, Ren'Py 생성이 모두 공유한다.

import type { GenreId, GuiTheme } from './renpy/gui/theme';

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
export const DEFAULT_EXPRESSIONS = ['기본', '기쁨', '슬픔', '화남', '놀람', '수줍음'] as const;
/** 호환용 별칭(기존 코드의 "기본 목록" 참조). */
export const EXPRESSIONS = DEFAULT_EXPRESSIONS;
/** 표정 이름. 사용자가 추가/이름변경할 수 있어 자유 문자열이다('기본'은 항상 존재·고정). */
export type Expression = string;

/** 알려진 표정의 표시 이모지(UI 공통). 커스텀 표정은 emojiFor 로 기본 이모지를 준다. */
export const EXPR_EMOJI: Record<string, string> = {
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
      emotion?: string;
      /** 합동 대사(둘 이상이 동시에) — 등록 캐릭터 이름 배열. 있으면 speaker 는 묶음 라벨이다. */
      members?: string[];
      /** 로케일별 번역 검수본(엑셀 C/D열 등). 없으면 자막은 원문 폴백. */
      i18n?: I18nText;
      /** 이 라인에 성우 음성을 생성할지(opt-in). 크레딧 폭탄 방지로 기본은 미생성. */
      voiced?: boolean;
    }
  | { kind: 'narration'; text: string; i18n?: I18nText; voiced?: boolean }
  /**
   * 아이템(소품) 팝업 인라인 이벤트. 태그 위치(그 순간)에 사물을 라이트박스로 잠깐 띄운다.
   * name === '' 이면 hide 마커(#아이템끝). 이미지는 프로젝트 공유(Project.itemAssetIds[name]).
   */
  | { kind: 'item'; name: string };

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
}

/** 캐릭터 의상(복장) — 의상마다 표정 세트를 따로 가진다. '기본' 의상은 Character.expressions 자체. */
export interface Outfit {
  /** 의상 이름(예: '수영복', '교복'). '기본'은 예약어. */
  name: string;
  /** 이 의상의 복장/외형 묘사. 기본 외형(appearance)에 덧붙여 생성에 반영된다. */
  appearance?: string;
  /**
   * 이 의상에서 "빠져야 할" 것(예: 수영복의 '재킷, 가방'). 기본 외형(appearance)에 박힌 옷·소품이
   * 이 의상까지 따라붙는 누수를 막는다 — 긍정 프롬프트에서 해당 태그를 빼고 네거티브로도 억제한다.
   */
  exclude?: string;
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
   * 외형 설명(선택) — GPT 스프라이트 생성 시 6종 표정 프롬프트에 공통 주입해
   * 같은 인물로 보이게 한다. 예: "갈색 단발, 교복, 푸른 눈".
   */
  appearance?: string;
  /**
   * 성격·역할 설명(선택) — 그림의 분위기·표정·포즈에 참고로 주입한다.
   * 예: "밝고 장난기 많은 카페 알바생, 17세". 외형(appearance)을 보조한다.
   */
  personality?: string;
  /**
   * 내레이션·대사 전용 화자(주인공 등). true 면 화면에 스프라이트를 세우지 않고
   * 에셋 창의 스프라이트 관리에서도 제외한다. 대사 이름표·분기에는 정상 참여.
   */
  isProtagonist?: boolean;
}

export type AssetKind = 'background' | 'cg' | 'sprite' | 'bgm' | 'voice' | 'item';

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
   * 게임 내 "크레딧/라이선스 고지" 화면에 표시할 자유 텍스트(선택).
   * 사용한 일러스트·BGM·효과음·성우 등의 출처/라이선스를 적는다(상업 배포 전 필수 정리).
   */
  credits?: string;
  /** 외부에서 업로드한 메뉴 배경(자체 GUI 위에 덮어씀). 없으면 Canvas 생성. */
  menuArt?: { main?: string; game?: string };
  /**
   * 아이템(소품) 팝업 이미지 — 아이템 이름 → assetId. 같은 이름은 한 이미지를 공유한다.
   * 대본 `#아이템 <이름>` 태그로 참조되고, "발견한 아이템" 보관함이 이 목록을 갤러리로 보여준다.
   */
  itemAssetIds?: Record<string, string>;
  /**
   * GUI 대사창·폰트 사용자 조정(테마 위에 덮어씀). 비면 테마 기본값 사용.
   * - dialogueOpacity: 대사창 배경 불투명도(0~1, 기본 0.4 · 그라데이션 권장 0.35~0.45)
   * - textColor: 본문 글자색 / nameColor: 화자 이름색
   * - outline: 글자 외곽선 사용 / outlineColor: 외곽선색
   * - dialogueGradient: 대사창을 단색 대신 세로 그라데이션(위로 투명)으로 — 시네마틱·고투명
   */
  /**
   * 자동 번역(GPT) 모드. 미지정/off = 사용 안 함(엑셀 직접 번역만). fast=gpt-4o-mini, quality=gpt-4o.
   * off 가 아닐 때만 장면 탭에 "전체 자동 번역" 버튼이 노출된다. 프로젝트별로 저장·내보내기된다.
   */
  translateMode?: TranslateMode;
  guiOverrides?: {
    dialogueBoxColor?: string;
    dialogueOpacity?: number;
    textColor?: string;
    nameColor?: string;
    outline?: boolean;
    outlineColor?: string;
    dialogueGradient?: boolean;
  };
}

export type GuiOverrides = NonNullable<Project['guiOverrides']>;

/** 프로젝트의 유효 표정 목록('기본'을 항상 맨 앞에 포함). list 미지정/빈 배열이면 기본 세트. */
export function effectiveExpressions(list?: string[]): string[] {
  const base = list && list.length ? list.slice() : [...DEFAULT_EXPRESSIONS];
  return base.includes('기본') ? base : ['기본', ...base];
}

/** 프로젝트 객체에서 유효 표정 목록을 구한다. */
export function projectExpressions(p: Project): string[] {
  return effectiveExpressions(p.expressions);
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

/** 프로젝트의 base 로케일(대본 원문 언어). 미지정이면 'ko'. */
export function baseLocaleOf(p: Project): Locale {
  return p.baseLocale ?? 'ko';
}

/** 프로젝트의 자동 번역 모드(미지정 = off). */
export function translateModeOf(p: Project): TranslateMode {
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
 */
export function effectiveTextLocales(p: Project): Locale[] {
  const base = baseLocaleOf(p);
  const set = new Set<Locale>();
  for (const l of p.textLocales ?? []) set.add(l); // ① 태그로 명시 지정한 언어
  for (const sc of p.scenes) {
    // ② 번역(i18n)이 실제로 들어 있는 언어를 자동 포함
    for (const line of sc.lines) {
      if (line.kind === 'item' || !line.i18n) continue; // 아이템 라인은 번역 대상 아님
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
  };
}
