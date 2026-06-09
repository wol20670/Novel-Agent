// 도메인 데이터 모델 — 파서 출력, UI 상태, Ren'Py 생성이 모두 공유한다.

export type SceneStatus = 'review' | 'approved' | 'needs_fix';

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  review: '검토중',
  approved: '승인',
  needs_fix: '수정필요',
};

/** 표준 표정 세트 (캐릭터 스프라이트). */
export const EXPRESSIONS = ['기본', '기쁨', '슬픔', '화남', '놀람', '수줍음'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export type Line =
  | { kind: 'dialogue'; speaker: string; text: string; emotion?: string }
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
  cg: string[]; // #CG
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
}

export function emptyProject(): Project {
  return {
    title: '나의 비주얼노벨',
    author: '작가',
    width: 1280,
    height: 720,
    scenes: [],
    characters: [],
    rawInput: '',
  };
}
