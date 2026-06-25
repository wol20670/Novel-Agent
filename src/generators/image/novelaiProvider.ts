// NovelAI(image.novelai.net) 이미지 생성. 브라우저에서 직접 호출(BYO persistent token).
// - 응답은 ZIP 바이너리 → jszip 으로 첫 PNG 추출.
// - 투명 배경은 생성 단계가 아니라 Director Tools 의 bg-removal(augment-image)로 별도 처리.
// - CORS: 개발(Vite)에선 '/nai' 프록시로 우회, 배포에선 host 직접 호출.
// 모델·사이즈·스텝·네거티브 기본값은 src/config/aiConfig.ts 한 곳에서 가져온다.

import JSZip from 'jszip';
import { aiConfig, type NaiSize } from '../../config/aiConfig';

/** 개발 모드에선 Vite dev proxy('/nai')로, 배포에선 실제 host 로 보낸다(CORS 우회). */
function apiBase(): string {
  return import.meta.env.DEV ? '/nai' : aiConfig.image.novelai.host;
}

function dims(size: NaiSize): { width: number; height: number } {
  const [w, h] = size.split('x').map(Number);
  return { width: w, height: h };
}

/** 문자열 → 결정적 시드(같은 캐릭터의 표정 6종을 같은 시드로 묶어 일관성 확보). */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 4_294_967_295;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 4_294_967_295);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000; // 대형 이미지 atob 안전을 위해 청크 단위로 문자열화.
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** 이미지 Blob 의 실제 픽셀 크기(bg-removal 에 원본 크기 전달용). */
async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

function naiErrorMessage(status: number, detail: string, label: string): string {
  const head = `NovelAI ${label} 실패 (HTTP ${status})`;
  if (status === 401) return `${head}: 토큰이 올바르지 않습니다. NovelAI persistent token(pst-…)을 확인하세요.`;
  if (status === 402)
    return `${head}: Anlas(크레딧) 부족 또는 유료 사이즈입니다. 더 작은 사이즈/스텝(≤28)으로 시도하거나 구독을 확인하세요.`;
  if (status === 429) return `${head}: 동시 생성 제한입니다. 잠시 후 다시 시도하세요.`;
  if (status === 400) return `${head}: 요청 형식 오류${detail ? ` — ${detail}` : ''}.`;
  return detail ? `${head}: ${detail}` : head;
}

/** POST 후 ZIP 응답에서 첫 PNG 를 Blob 으로 추출. */
async function postAndUnzip(url: string, body: unknown, apiKey: string, label: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // CORS 차단 시 TypeError("Failed to fetch") 가 난다 → 친절한 안내로 변환.
    throw new Error(
      `NovelAI ${label} 호출에 실패했습니다(네트워크/CORS). 개발 중이면 Vite dev 서버(프록시)에서 실행 중인지, ` +
        `배포본이면 프록시가 필요한지 확인하세요. (${(e as Error).message})`,
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.message || j?.error || j?.statusText || '';
    } catch {
      /* 본문이 JSON 이 아닐 수 있음 */
    }
    throw new Error(naiErrorMessage(res.status, detail, label));
  }
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const pngs = Object.values(zip.files)
    .filter((f) => !f.dir && /\.png$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (pngs.length === 0) throw new Error(`NovelAI ${label}: 응답 ZIP 에 이미지가 없습니다.`);
  const out = await pngs[0].async('blob');
  // jszip blob 의 type 이 비어있을 수 있어 image/png 로 재지정.
  return out.slice(0, out.size, 'image/png');
}

interface BuildParamsOpts {
  prompt: string;
  negative: string;
  size: NaiSize;
  steps: number;
  scale: number;
  seed: number;
  img2img?: { image: string; strength: number; noise: number };
  /** 그림체 참조(vibe transfer) — base64 이미지 여러 장 + 강도. */
  vibe?: { images: string[]; infoExtracted: number; strength: number };
}

function isV4(model: string): boolean {
  return /diffusion-4/.test(model);
}

/** generate/img2img 공용 parameters 객체. v4(4.x) 모델은 v4_prompt 구조를 함께 채운다. */
function buildParameters(o: BuildParamsOpts): Record<string, unknown> {
  const cfg = aiConfig.image.novelai;
  const { width, height } = dims(o.size);
  const p: Record<string, unknown> = {
    params_version: 3,
    width,
    height,
    scale: o.scale,
    sampler: cfg.sampler,
    steps: o.steps,
    n_samples: 1,
    ucPreset: cfg.ucPreset,
    // 품질 태그는 withQualityTags 로 직접 끝에 부착하므로 서버 자동부착은 끈다(이중 방지·결정적).
    qualityToggle: false,
    autoSmea: false,
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: true,
    cfg_rescale: 0,
    noise_schedule: 'karras',
    legacy_v3_extend: false,
    seed: o.seed,
    negative_prompt: o.negative,
  };
  if (isV4(cfg.model)) {
    p.use_coords = false;
    p.characterPrompts = [];
    p.v4_prompt = {
      caption: { base_caption: o.prompt, char_captions: [] },
      use_coords: false,
      use_order: true,
    };
    p.v4_negative_prompt = {
      caption: { base_caption: o.negative, char_captions: [] },
      use_coords: false,
    };
  }
  if (o.img2img) {
    p.image = o.img2img.image;
    p.strength = o.img2img.strength;
    p.noise = o.img2img.noise;
    p.extra_noise_seed = o.seed;
  }
  if (o.vibe && o.vibe.images.length) {
    // 그림체 참조(vibe transfer). 여러 장이면 각 이미지에 동일 강도/정보추출량을 적용.
    // (V4.x 에선 vibe 인코딩이 필요할 수 있어, 첫 실호출 결과를 보고 조정 대상으로 둔다.)
    p.reference_image_multiple = o.vibe.images;
    p.reference_information_extracted_multiple = o.vibe.images.map(() => o.vibe!.infoExtracted);
    p.reference_strength_multiple = o.vibe.images.map(() => o.vibe!.strength);
  }
  return p;
}

export interface NaiGenerateOpts {
  apiKey: string;
  size: NaiSize;
  steps: number;
  scale?: number;
  seed?: number;
  negative?: string;
  /** 그림체 참조 이미지(여러 장). vibe transfer 로 화풍만 반영한다. */
  styleReferences?: Blob[];
}

/** 긍정 프롬프트 "끝"에 V4.5 품질 태그를 붙인다(권장 위치). */
function withQualityTags(prompt: string): string {
  const tags = aiConfig.image.novelai.qualityTags;
  return tags ? `${prompt}, ${tags}` : prompt;
}

/** 그림체 참조 Blob[] → buildParameters 의 vibe 옵션(base64 변환). */
async function toVibe(refs: Blob[] | undefined) {
  if (!refs || refs.length === 0) return undefined;
  const cfg = aiConfig.image.novelai;
  const images = await Promise.all(refs.map(blobToBase64));
  return { images, infoExtracted: cfg.vibeInfoExtracted, strength: cfg.vibeStrength };
}

/** 텍스트 → 이미지(불투명). 투명배경이 필요하면 호출부에서 removeBackground 를 이어 붙인다. */
export async function novelaiGenerate(prompt: string, opts: NaiGenerateOpts): Promise<Blob> {
  const cfg = aiConfig.image.novelai;
  const vibe = await toVibe(opts.styleReferences);
  const body = {
    input: withQualityTags(prompt),
    model: cfg.model,
    action: 'generate',
    parameters: buildParameters({
      prompt: withQualityTags(prompt),
      negative: opts.negative ?? cfg.negativePrompt,
      size: opts.size,
      steps: opts.steps,
      scale: opts.scale ?? cfg.scale,
      seed: opts.seed ?? randomSeed(),
      vibe,
    }),
  };
  console.info(
    `%c[NovelAI] generate (텍스트·베이스없음 → Opus 무료)`,
    'color:#4ade80',
    { size: opts.size, steps: opts.steps, model: cfg.model, vibe: !!vibe },
  );
  return postAndUnzip(apiBase() + cfg.generatePath, body, opts.apiKey, '이미지 생성');
}

export interface NaiImg2imgOpts extends NaiGenerateOpts {
  /** 0~1, 낮을수록 원본 유지. 미지정 시 config 기본값. */
  strength?: number;
  noise?: number;
}

/** 소스 이미지 + 프롬프트 → 변형 이미지(img2img). 표정 수정·참조 CG·배경 변주에 사용. */
export async function novelaiImg2img(prompt: string, source: Blob, opts: NaiImg2imgOpts): Promise<Blob> {
  const cfg = aiConfig.image.novelai;
  const image = await blobToBase64(source);
  const body = {
    input: withQualityTags(prompt),
    model: cfg.model,
    action: 'img2img',
    parameters: buildParameters({
      prompt: withQualityTags(prompt),
      negative: opts.negative ?? cfg.negativePrompt,
      size: opts.size,
      steps: opts.steps,
      scale: opts.scale ?? cfg.scale,
      seed: opts.seed ?? randomSeed(),
      img2img: { image, strength: opts.strength ?? cfg.img2imgStrength, noise: opts.noise ?? 0 },
    }),
  };
  console.info(
    `%c[NovelAI] img2img (베이스 이미지 사용 → Anlas 소모!)`,
    'color:#fbbf24',
    { size: opts.size, steps: opts.steps, strength: opts.strength ?? cfg.img2imgStrength },
  );
  return postAndUnzip(apiBase() + cfg.generatePath, body, opts.apiKey, 'img2img');
}

/**
 * Director Tools 배경 제거 → 투명 PNG. 스프라이트 누끼에 사용.
 * (응답 ZIP 의 첫 PNG 를 쓴다. 결과가 기대와 다르면 첫 호출 후 출력 선택 로직만 조정하면 된다.)
 */
export async function novelaiRemoveBackground(source: Blob, opts: { apiKey: string }): Promise<Blob> {
  const cfg = aiConfig.image.novelai;
  const { width, height } = await imageSize(source);
  const image = await blobToBase64(source);
  const body = { req_type: 'bg-removal', width, height, image };
  console.info(
    `%c[NovelAI] bg-removal 누끼 (Director Tool → Anlas 소모!)`,
    'color:#fbbf24',
    { width, height },
  );
  return postAndUnzip(apiBase() + cfg.augmentPath, body, opts.apiKey, '배경 제거');
}
