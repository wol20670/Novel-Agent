// OpenAI gpt-image-1 배경/CG/스프라이트 생성. 브라우저에서 직접 호출(BYO Key).
// 키는 호출 시점에 전달되며 어디에도 영구 전송되지 않는다(로컬 저장은 store 책임).
// 모델·사이즈·품질·엔드포인트 기본값은 src/config/aiConfig.ts 한 곳에서 가져온다.

import { aiConfig, normalizeImageSize } from '../../config/aiConfig';

function b64ToBlob(b64: string, mime = 'image/png'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** 응답 JSON 에서 첫 이미지 b64 추출(생성/편집 공통). */
async function readImageResponse(res: Response, label: string): Promise<Blob> {
  if (!res.ok) {
    let msg = `OpenAI ${label} 실패 (HTTP ${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI 응답에 이미지 데이터가 없습니다.');
  return b64ToBlob(b64);
}

export interface OpenAIImageOpts {
  apiKey: string;
  width: number;
  height: number;
  model?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  /** 투명 배경(캐릭터 스프라이트용). gpt-image-1 의 background 파라미터. */
  transparent?: boolean;
}

export async function openaiImage(prompt: string, opts: OpenAIImageOpts): Promise<Blob> {
  const res = await fetch(aiConfig.image.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? aiConfig.image.model,
      prompt,
      n: 1,
      size: normalizeImageSize(opts.width, opts.height),
      quality: opts.quality ?? 'medium',
      ...(opts.transparent ? { background: 'transparent' } : {}),
    }),
  });
  return readImageResponse(res, '이미지 생성');
}

export interface OpenAIEditOpts {
  apiKey: string;
  model?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  transparent?: boolean;
  size?: string;
}

/**
 * 기준 이미지(reference)에서 프롬프트대로 부분만 바꿔 새 이미지를 생성한다(images/edits).
 * 스프라이트 표정 일관성에 사용: '기본' 입화를 기준으로 같은 인물의 다른 표정을 그린다.
 * reference 를 여러 장 주면(예: [캐릭터, 배경]) gpt-image-1 이 모두 참고해 합성한다.
 */
export async function openaiImageEdit(
  prompt: string,
  reference: Blob | Blob[],
  opts: OpenAIEditOpts,
): Promise<Blob> {
  const form = new FormData();
  form.append('model', opts.model ?? aiConfig.image.model);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', opts.size ?? aiConfig.image.sprite.size);
  form.append('quality', opts.quality ?? 'medium');
  if (opts.transparent) form.append('background', 'transparent');
  const refs = Array.isArray(reference) ? reference : [reference];
  if (refs.length === 1) {
    form.append('image', refs[0], 'reference.png');
  } else {
    // 여러 참조: gpt-image-1 의 image[] 다중 입력.
    refs.forEach((r, i) => form.append('image[]', r, `reference_${i}.png`));
  }

  const res = await fetch(aiConfig.image.editEndpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` }, // multipart: Content-Type 자동
    body: form,
  });
  return readImageResponse(res, '이미지 편집');
}
