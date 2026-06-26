// 이미지 생성 어댑터: 키가 있으면 NovelAI, 없으면 Canvas 오프라인 폴백.
// (이미지 모델은 NovelAI 단일. OpenAI gpt-image-1 경로는 제거됨 — 텍스트 변환용 gpt-4o-mini 만 유지.)

import { canvasImage } from './canvasProvider';
import { canvasSprite } from './canvasSprite';
import {
  novelaiGenerate,
  novelaiImg2img,
  novelaiRemoveBackground,
  seedFromString,
} from './novelaiProvider';
import { browserRemoveBackground } from './bgRemoveLocal';
import { aiRemoveBackground } from './bgRemoveAi';
import { aiConfig, naiSize, naiActiveSizes, naiActiveSteps } from '../../config/aiConfig';
import type { Expression } from '../../types';

/**
 * 스프라이트 누끼 방식.
 *  - browser : 무료·즉시(브라우저 flood-fill). 단순 배경에 빠르지만 가장자리 색충돌에 약함.
 *  - ai      : 무료·고품질(ML 세그멘테이션, MODNet). 색 충돌 없음. 첫 1회 모델 다운로드(~수십 MB).
 *  - novelai : Director Tools(Anlas 소모). 머리카락 경계 최강.
 *  - none    : 흰 배경 유지.
 */
export type BgRemoval = 'browser' | 'ai' | 'novelai' | 'none';

/** 선택한 방식으로 누끼 처리(none 이거나 transparent 비활성이면 원본 그대로). */
async function applyBgRemoval(blob: Blob, method: BgRemoval, apiKey: string): Promise<Blob> {
  if (!aiConfig.image.sprite.transparent || method === 'none') return blob;
  if (method === 'novelai') return novelaiRemoveBackground(blob, { apiKey });
  if (method === 'ai') return aiRemoveBackground(blob);
  return browserRemoveBackground(blob);
}

export interface ImageRequest {
  /** 배경/CG 의미를 담은 프롬프트(배경명 + 연출 + CG 설명 조합). */
  prompt: string;
  /** 폴백 캔버스에 찍을 짧은 라벨. */
  label: string;
  width: number;
  height: number;
  apiKey?: string;
  /** NovelAI 용으로 미리 컴파일된 프롬프트(단부루 태그). 있으면 이걸 그대로 쓴다. */
  promptOverride?: string;
}

export interface ImageResult {
  blob: Blob;
  source: 'novelai' | 'canvas';
}

export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const apiKey = req.apiKey?.trim();
  if (apiKey) {
    const blob = await novelaiGenerate(req.promptOverride?.trim() || req.prompt, {
      apiKey,
      size: naiSize(req.width, req.height),
      steps: naiActiveSteps(),
    });
    return { blob, source: 'novelai' };
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
    '비주얼노벨 배경(인물 없음), 와이드 구도, 눈높이 카메라, 균형 잡힌 구도',
    '중앙은 캐릭터가 설 여백을 남기고 하단은 대사 UI 를 위해 단순하게, 16:9',
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
 * 타이틀/메뉴 배경 생성. 캐릭터 참조를 주면 그 입화를 소스로 img2img(외형 유지),
 * 없으면 텍스트로 생성. 키 필수.
 */
export async function generateMenuArtImage(opts: {
  which: 'main' | 'game';
  title: string;
  genreLabel: string;
  mood?: string;
  character?: Blob;
  background?: Blob;
  apiKey: string;
}): Promise<ImageResult> {
  const apiKey = opts.apiKey.trim();
  const base = buildMenuArtPrompt(opts.title, opts.genreLabel, opts.mood, opts.which);
  const size = naiActiveSizes().landscape;
  const steps = naiActiveSteps();
  // 캐릭터 참조가 있으면 그 입화를 소스로 img2img(외형 유지), 없으면 텍스트 생성.
  if (opts.character) {
    const blob = await novelaiImg2img(base, opts.character, { apiKey, size, steps, strength: 0.6 });
    return { blob, source: 'novelai' };
  }
  const blob = await novelaiGenerate(base, { apiKey, size, steps });
  return { blob, source: 'novelai' };
}

/**
 * 캐릭터 입화를 소스로 CG 한 컷을 합성한다(img2img). 캐릭터의 얼굴·머리·의상 정체성을
 * 유지해 "그 캐릭터가 그 배경에 있는" CG 를 만든다. 배경은 텍스트로 묘사. 키 필수.
 */
export async function generateCgFromReference(opts: {
  description: string;
  directions: string[];
  character: Blob;
  background?: Blob;
  apiKey: string;
}): Promise<ImageResult> {
  const prompt = [
    opts.description,
    ...opts.directions,
    '같은 인물을 유지한 비주얼노벨 CG 한 장면(감정적 연출, 인물 포함)',
    aiConfig.image.artStyle,
  ]
    .filter(Boolean)
    .join(', ');
  const blob = await novelaiImg2img(prompt, opts.character, {
    apiKey: opts.apiKey.trim(),
    size: naiActiveSizes().landscape,
    steps: naiActiveSteps(),
    strength: 0.7,
  });
  return { blob, source: 'novelai' };
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
  /** 그림체 참조 여러 장(NovelAI vibe transfer). 화풍만 반영, 인물은 설명대로. */
  styleReferences?: Blob[];
  /** NovelAI 용으로 미리 컴파일된 프롬프트(단부루 태그). 있으면 spritePrompt 대신 이걸 쓴다. */
  promptOverride?: string;
  /** 누끼 방식. 미지정 시 browser(무료). */
  bgRemoval?: BgRemoval;
}

/** 스프라이트 생성 프롬프트(외형 설명 공유로 일관성↑). 번역 폴백용(컴파일 프롬프트 없을 때). */
function spritePrompt(req: SpriteRequest): string {
  return [
    `비주얼노벨 캐릭터 입화, 이름 ${req.name}`,
    req.appearance,
    req.personality && `성격·분위기 참고: ${req.personality}`,
    `표정: ${req.expression}`,
    // 표정 6종을 같은 구도로 고정(허벅지 위 반신 + 정면).
    'cowboy shot, 정면(looking at viewer)',
    // NovelAI 는 생성 단계에서 투명배경을 못 만들어, 깔끔한 단색 배경으로 뽑고 bg-removal 로 누끼.
    '흰색 단순 배경(plain white background), 단일 인물',
    '정교한 음영과 하이라이트, 깔끔한 라인아트, 고품질 서브컬쳐 게임 일러스트',
    aiConfig.image.artStyle,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * 캐릭터 스프라이트 생성. 키 없으면 Canvas 임시 입화(투명 PNG).
 * 키 있으면 NovelAI: 이름 기반 고정 시드 + 외형/표정 태그로 "같은 인물, 다른 표정" 일관성 확보
 * (OpenAI reference-edit 대신 시드 고정이 더 안정적). 생성 후 누끼로 투명 배경 처리.
 */
export async function generateSprite(req: SpriteRequest): Promise<ImageResult> {
  const apiKey = req.apiKey?.trim();
  if (apiKey) {
    const seed = seedFromString(req.name);
    let blob = await novelaiGenerate(req.promptOverride?.trim() || spritePrompt(req), {
      apiKey,
      size: naiActiveSizes().portrait,
      steps: naiActiveSteps(),
      seed,
      styleReferences: req.styleReferences,
    });
    blob = await applyBgRemoval(blob, req.bgRemoval ?? 'browser', apiKey);
    return { blob, source: 'novelai' };
  }
  const blob = await canvasSprite(req.name, req.expression, req.color);
  return { blob, source: 'canvas' };
}

/**
 * 이미 생성된 이미지를 지시문대로 "조금만 수정"한다(NovelAI img2img).
 * 마음에 드는 결과를 버리지 않고 부분만 손볼 때 사용. 키 필수(폴백 없음).
 */
export async function editImage(opts: {
  blob: Blob;
  instruction: string;
  apiKey: string;
  kind: 'background' | 'sprite';
  /** (스프라이트) 누끼 방식. 미지정 시 browser(무료). */
  bgRemoval?: BgRemoval;
}): Promise<ImageResult> {
  const isSprite = opts.kind === 'sprite';
  const apiKey = opts.apiKey.trim();
  const sizes = naiActiveSizes();
  const size = isSprite ? sizes.portrait : sizes.landscape;
  // 표정 수정(스프라이트)은 인물 정체성을 더 보존하도록 강도를 낮춘다(원본 유지력↑).
  let blob = await novelaiImg2img(opts.instruction, opts.blob, {
    apiKey,
    size,
    steps: naiActiveSteps(),
    strength: isSprite ? 0.4 : 0.5,
  });
  if (isSprite) blob = await applyBgRemoval(blob, opts.bgRemoval ?? 'browser', apiKey);
  return { blob, source: 'novelai' };
}
