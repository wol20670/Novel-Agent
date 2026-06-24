// 이미지 생성 어댑터: 키가 있으면 OpenAI, 없으면 Canvas 폴백.
// 추후 다른 provider(예: 다른 이미지 모델, 백엔드 프록시)를 여기에 추가한다.

import { canvasImage } from './canvasProvider';
import { canvasSprite } from './canvasSprite';
import { openaiImage, openaiImageEdit } from './openaiProvider';
import { aiConfig, type ImageQuality, type GptImageSize } from '../../config/aiConfig';
import type { Expression } from '../../types';

export interface ImageRequest {
  /** 배경/CG 의미를 담은 프롬프트(배경명 + 연출 + CG 설명 조합). */
  prompt: string;
  /** 폴백 캔버스에 찍을 짧은 라벨. */
  label: string;
  width: number;
  height: number;
  apiKey?: string;
  /** 생성 품질(비용 제어). 미지정 시 배경 기본값. */
  quality?: ImageQuality;
}

export interface ImageResult {
  blob: Blob;
  source: 'openai' | 'canvas';
}

export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  if (req.apiKey && req.apiKey.trim()) {
    const blob = await openaiImage(req.prompt, {
      apiKey: req.apiKey.trim(),
      width: req.width,
      height: req.height,
      quality: req.quality ?? aiConfig.image.quality.background,
    });
    return { blob, source: 'openai' };
  }
  const blob = await canvasImage(req.prompt, req.label, req.width, req.height);
  return { blob, source: 'canvas' };
}

/**
 * 장면 정보 → 배경 프롬프트. `core` 에 디테일 프롬프트(없으면 배경 이름)를 넣는다.
 * 배경 그림체(backgroundStyle)는 캐릭터와 분리해 더 디테일·사실적 조명을 쓴다.
 */
export function buildBackgroundPrompt(
  core: string | undefined,
  title: string,
  directions: string[],
): string {
  const parts = [
    core || title,
    ...directions,
    '비주얼노벨 배경(인물 없음), 와이드 구도',
    aiConfig.image.backgroundStyle,
  ].filter(Boolean);
  return parts.join(', ');
}

export function buildCgPrompt(desc: string, directions: string[]): string {
  return [desc, ...directions, '비주얼노벨 CG 한 장면(감정적 연출)', aiConfig.image.artStyle].join(', ');
}

/** 타이틀(메인 메뉴)/게임 메뉴 배경 키 아트 프롬프트. 인물·글자 없는 분위기 배경. */
export function buildMenuArtPrompt(
  title: string,
  genreLabel: string,
  mood: string | undefined,
  which: 'main' | 'game',
): string {
  return [
    `비주얼노벨 ${which === 'main' ? '타이틀(메인 메뉴)' : '게임 내 메뉴'} 화면 배경 키 아트`,
    title && `작품: ${title}`,
    `장르 분위기: ${genreLabel}`,
    mood,
    '인물 없는 분위기 있는 와이드 배경, 시네마틱 구도',
    which === 'main' ? '제목 로고를 얹을 여백 확보' : '차분하고 약간 어두운 톤(메뉴 글자 가독성)',
    '그림 안에 글자·텍스트·로고·UI·워터마크 없음',
    aiConfig.image.artStyle,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * 캐릭터 입화(+선택적으로 장면 배경)를 소스로 CG 한 컷을 합성한다(images/edits 다중 참조).
 * 캐릭터의 얼굴·머리·의상 정체성과 배경의 장소·분위기를 최대한 유지해
 * "그 캐릭터가 그 배경에 있는" CG 를 만든다. 키 필수.
 */
export async function generateCgFromReference(opts: {
  description: string;
  directions: string[];
  character: Blob;
  background?: Blob;
  apiKey: string;
  size?: GptImageSize;
}): Promise<ImageResult> {
  const refs = opts.background ? [opts.character, opts.background] : [opts.character];
  const guide = opts.background
    ? '첫 번째 참조 이미지의 인물(얼굴·머리·의상·색감)을 동일 인물로 유지하고, 두 번째 참조 이미지의 장소·분위기를 배경으로 사용해 자연스럽게 배치한'
    : '참조 이미지의 인물(얼굴·머리·의상·색감)을 동일 인물로 유지한';
  const prompt = [
    opts.description,
    ...opts.directions,
    `${guide} 비주얼노벨 CG 한 장면(감정적 연출, 인물 포함)`,
    aiConfig.image.artStyle,
  ]
    .filter(Boolean)
    .join(', ');
  const blob = await openaiImageEdit(prompt, refs, {
    apiKey: opts.apiKey.trim(),
    transparent: false,
    size: opts.size ?? '1536x1024',
    quality: aiConfig.image.quality.cg,
  });
  return { blob, source: 'openai' };
}

export interface SpriteRequest {
  name: string;
  expression: Expression;
  color: string;
  apiKey?: string;
  /** 일관성을 위한 외형 설명(선택) — 6종 표정 프롬프트에 공통 주입된다. */
  appearance?: string;
  /** 성격·역할(선택) — 그림의 분위기·표정 참고용으로 가볍게 주입된다. */
  personality?: string;
  /**
   * 같은 인물의 기준 입화(보통 '기본' 표정 PNG). 주어지고 consistency='reference' 면
   * 새로 그리지 않고 이 이미지에서 "표정만" 바꿔(편집) 정체성을 유지한다.
   */
  reference?: Blob;
}

/** 스프라이트 생성 프롬프트(외형 설명 공유로 일관성↑). */
function spritePrompt(req: SpriteRequest): string {
  return [
    `비주얼노벨 캐릭터 입화(서 있는 전신), 이름 ${req.name}`,
    req.appearance,
    req.personality && `성격·분위기 참고: ${req.personality}`,
    `표정: ${req.expression}`,
    '투명 배경, 단일 인물, 정면',
    aiConfig.image.artStyle,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * 캐릭터 스프라이트 생성. 키 없으면 Canvas 임시 입화(투명 PNG).
 * 키 있으면 gpt-image-1:
 *   - reference 가 있고 consistency='reference' → 기준 입화에서 표정만 편집(동일 인물 유지).
 *   - 아니면 텍스트 프롬프트로 새로 생성(appearance 설명으로 일관성 보강).
 */
export async function generateSprite(req: SpriteRequest): Promise<ImageResult> {
  const apiKey = req.apiKey?.trim();
  if (apiKey) {
    const { consistency, transparent, size } = aiConfig.image.sprite;
    const quality = aiConfig.image.quality.sprite;
    if (req.reference && consistency === 'reference') {
      const blob = await openaiImageEdit(
        `이 캐릭터의 표정만 '${req.expression}'(으)로 바꾸고, 인물의 외형·의상·머리·색감은 그대로 유지`,
        req.reference,
        { apiKey, transparent, size, quality },
      );
      return { blob, source: 'openai' };
    }
    const blob = await openaiImage(spritePrompt(req), {
      apiKey,
      width: 1024,
      height: 1536,
      transparent,
      quality,
    });
    return { blob, source: 'openai' };
  }
  const blob = await canvasSprite(req.name, req.expression, req.color);
  return { blob, source: 'canvas' };
}

/**
 * 이미 생성된 이미지를 지시문대로 "조금만 수정"한다(gpt-image-1 edits).
 * 마음에 드는 결과를 버리지 않고 부분만 손볼 때 사용. 키 필수(폴백 없음).
 */
export async function editImage(opts: {
  blob: Blob;
  instruction: string;
  apiKey: string;
  kind: 'background' | 'sprite';
  /** 출력 사이즈(미지정 시 배경=가로형, 스프라이트=세로형). */
  size?: GptImageSize;
}): Promise<ImageResult> {
  const isSprite = opts.kind === 'sprite';
  const blob = await openaiImageEdit(opts.instruction, opts.blob, {
    apiKey: opts.apiKey.trim(),
    transparent: isSprite ? aiConfig.image.sprite.transparent : false,
    size: opts.size ?? (isSprite ? aiConfig.image.sprite.size : '1536x1024'),
    quality: isSprite ? aiConfig.image.quality.sprite : aiConfig.image.quality.background,
  });
  return { blob, source: 'openai' };
}
