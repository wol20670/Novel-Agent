// OpenAI gpt-image-1 배경/CG 생성. 브라우저에서 직접 호출(BYO Key).
// 키는 호출 시점에 전달되며 어디에도 영구 전송되지 않는다(로컬 저장은 store 책임).

function b64ToBlob(b64: string, mime = 'image/png'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** gpt-image-1 이 지원하는 사이즈로 정규화 (가로/세로/정방형). */
function normalizeSize(w: number, h: number): '1536x1024' | '1024x1536' | '1024x1024' {
  const ratio = w / h;
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

export interface OpenAIImageOpts {
  apiKey: string;
  width: number;
  height: number;
  model?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
}

export async function openaiImage(prompt: string, opts: OpenAIImageOpts): Promise<Blob> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? 'gpt-image-1',
      prompt,
      n: 1,
      size: normalizeSize(opts.width, opts.height),
      quality: opts.quality ?? 'medium',
    }),
  });

  if (!res.ok) {
    let msg = `OpenAI 이미지 생성 실패 (HTTP ${res.status})`;
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
