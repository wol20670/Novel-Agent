// 도메인 데이터 모델 — 파서 출력, UI 상태, Ren'Py 생성이 모두 공유한다.

import type { GenreId, GuiTheme } from './renpy/gui/theme';

export type SceneStatus = 'review' | 'approved' | 'needs_fix';

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  review: '검토중',
  approved: '승인',
  needs_fix: '수정필요',
};

/** 표준 표정 세트 (캐릭터 스프라이트). */
export const EXPRESSIONS = ['기본', '기쁨', '슬픔', '화남', '놀람', '수줍음'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** 표정 표시용 이모지 (UI 공통). */
export const EXPR_EMOJI: Record<Expression, string> = {
  기본: '😐', 기쁨: '😊', 슬픔: '😢', 화남: '😠', 놀람: '😲', 수줍음: '😳',
};

export type Line =
  | {
      kind: 'dialogue';
      speaker: string; // 표시 이름표 (합동 대사면 "한지수 & 강민주")
      text: string;
      emotion?: string;
      /** 합동 대사(둘 이상이 동시에) — 등록 캐릭터 이름 배열. 있으면 speaker 는 묶음 라벨이다. */
      members?: string[];
    }
  | { kind: 'narration'; text: string };

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
}

export interface Character {
  name: string;
  color: string;
  /** 표정 → assetId (스프라이트). v1에서는 선택만 보관. */
  expressions: Partial<Record<Expression, string>>;
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

export type AssetKind = 'background' | 'cg' | 'sprite' | 'bgm';

export interface AssetMeta {
  id: string;
  kind: AssetKind;
  prompt: string;
  mime: string; // image/png | audio/wav
  /** 어떤 provider 로 생성됐는지 (canvas | openai | synth ...). */
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
  /** GUI 테마(장르 프리셋). 미지정이면 기본 프리셋이 적용된다. */
  genre?: GenreId;
  /** AI/오프라인으로 생성한 커스텀 테마. 있으면 genre 프리셋보다 우선한다. */
  guiTheme?: GuiTheme;
  /** AI 테마 생성에 쓰는 분위기/요청 텍스트(선택). */
  mood?: string;
  /**
   * 게임 내 "크레딧/라이선스 고지" 화면에 표시할 자유 텍스트(선택).
   * 사용한 일러스트·BGM·효과음·성우 등의 출처/라이선스를 적는다(상업 배포 전 필수 정리).
   */
  credits?: string;
  /** 외부에서 업로드한 메뉴 배경(자체 GUI 위에 덮어씀). 없으면 Canvas 생성. */
  menuArt?: { main?: string; game?: string };
  /**
   * 캐릭터 "그림체 참조" 이미지들(선택, 여러 장). 업로드하면 기본 입화 생성 시 이 그림들의
   * 화풍·채색·렌더링만 참고(NovelAI vibe transfer)하고, 인물은 캐릭터 외형 설명대로 새로 그린다
   * (전 캐릭터 공통). 여러 장일수록 화풍 반영 정확도가 올라간다.
   */
  styleRefAssetIds?: string[];
  /**
   * 배경 이름(라벨, backgroundKey)별 "상세 생성 프롬프트".
   * 비어 있으면 배경 이름을 그대로 프롬프트로 쓴다. 있으면 이름은 라벨로만 쓰고
   * 이 텍스트로 생성한다(이름은 그대로 두고 디테일하게 지시).
   */
  backgroundPrompts?: Record<string, string>;
  /**
   * GUI 대사창·폰트 사용자 조정(테마 위에 덮어씀). 비면 테마 기본값 사용.
   * - dialogueOpacity: 대사창 검정 배경 불투명도(0~1, 권장 0.1~0.2)
   * - textColor: 본문 글자색 / nameColor: 화자 이름색
   * - outline: 글자 외곽선 사용 / outlineColor: 외곽선색
   */
  guiOverrides?: {
    dialogueBoxColor?: string;
    dialogueOpacity?: number;
    textColor?: string;
    nameColor?: string;
    outline?: boolean;
    outlineColor?: string;
  };
}

export type GuiOverrides = NonNullable<Project['guiOverrides']>;

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
