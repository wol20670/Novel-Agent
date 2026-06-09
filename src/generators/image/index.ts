// 이미지 생성 어댑터: 키가 있으면 OpenAI, 없으면 Canvas 폴백.
// 추후 다른 provider(예: 다른 이미지 모델, 백엔드 프록시)를 여기에 추가한다.

import { canvasImage } from './canvasProvider';
import { openaiImage } from './openaiProvider';

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
