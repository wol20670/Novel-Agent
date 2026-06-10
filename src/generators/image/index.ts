// 이미지 생성 어댑터: 키가 있으면 OpenAI, 없으면 Canvas 폴백.
// 추후 다른 provider(예: 다른 이미지 모델, 백엔드 프록시)를 여기에 추가한다.

import { canvasImage } from './canvasProvider';
import { canvasSprite } from './canvasSprite';
import { openaiImage } from './openaiProvider';
import type { Expression } from '../../types';

export interface ImageRequest {
  /** 배경/CG 의미를 담은 프롬프트(배경명 + 연출 + CG 설명 조합). */
  prompt: string;
  /** 폴백 캔버스에 찍을 짧은 라벨. */
  label: string;
  width: number;
  height: number;
  apiKey?: string;
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
    });
    return { blob, source: 'openai' };
  }
  const blob = await canvasImage(req.prompt, req.label, req.width, req.height);
  return { blob, source: 'canvas' };
}

/** 장면 정보 → 이미지 프롬프트 문자열. */
export function buildBackgroundPrompt(
  background: string | undefined,
  title: string,
  directions: string[],
): string {
  const parts = [
    background || title,
    ...directions,
    '비주얼노벨 배경 일러스트, 인물 없음, 와이드 구도, 고품질 디지털 페인팅',
  ].filter(Boolean);
  return parts.join(', ');
}

export function buildCgPrompt(desc: string, directions: string[]): string {
  return [desc, ...directions, '비주얼노벨 CG 일러스트, 감정적인 한 장면, 고품질'].join(', ');
}

export interface SpriteRequest {
  name: string;
  expression: Expression;
  color: string;
  apiKey?: string;
  /** 일관성을 위한 외형 설명(선택). */
  appearance?: string;
}

/**
 * 캐릭터 스프라이트 생성. 키 없으면 Canvas 임시 입화(투명 PNG).
 * 키 있으면 gpt-image-1 투명 배경(주의: 표정 간 동일 인물 일관성은 미보장 — 추후 개선).
 */
export async function generateSprite(req: SpriteRequest): Promise<ImageResult> {
  if (req.apiKey && req.apiKey.trim()) {
    const prompt = [
      `비주얼노벨 캐릭터 입화(서 있는 전신), 이름 ${req.name}`,
      req.appearance,
      `표정: ${req.expression}`,
      '투명 배경, 단일 인물, 깔끔한 셀 채색, 정면',
    ]
      .filter(Boolean)
      .join(', ');
    const blob = await openaiImage(prompt, {
      apiKey: req.apiKey.trim(),
      width: 832,
      height: 1216,
      transparent: true,
    });
    return { blob, source: 'openai' };
  }
  const blob = await canvasSprite(req.name, req.expression, req.color);
  return { blob, source: 'canvas' };
}
