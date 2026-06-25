// NovelAI 프롬프트 컴파일러 — 한국어 외형/장면 설명을 단부루(Danbooru) 영문 태그로 변환한다.
// gpt-4o-mini(aiConfig.chat) 를 쓰며, 같은 입력은 메모리 캐시해 캐릭터 표정 6종이 동일한 외형 태그를
// 공유하도록(=일관성) 한다. 품질 프리픽스는 provider(withQualityTags)가 단일 소스로 앞에 붙이므로
// 여기서는 본문 태그 + 감정/구조 태그만 조립한다(이중 prefix 방지).

import { aiConfig } from '../../config/aiConfig';

type CompileMode = 'character' | 'scene' | 'cg' | 'emotion';

const SYS: Record<CompileMode, string> = {
  character:
    'You convert a short Korean character description into comma-separated English Danbooru tags for an anime ' +
    'illustration model (NovelAI Diffusion). Output ONLY lowercase comma-separated tags — no sentences, no ' +
    'explanation, no quotes, no markdown. If it is a single character, start with "1girl, solo" or "1boy, solo" ' +
    'as appropriate. Use concise tags (hair color/length, eye color, clothing, accessories, body type). ' +
    'NEVER output generic medium words (anime style, manga, manga style, 2d illustration, digital painting) ' +
    'and NEVER output quality words (masterpiece, best quality) or background tags. Stay faithful; do not invent.',
  scene:
    'You convert a short Korean background/scene description into comma-separated English Danbooru tags for an ' +
    'anime background illustration (NovelAI Diffusion). Output ONLY lowercase comma-separated tags — no sentences, ' +
    'no explanation, no quotes, no markdown. Focus on place, time of day, lighting, weather, objects. ' +
    'Do NOT include people/characters. NEVER output generic medium words (anime style, manga, 2d illustration, ' +
    'digital painting) or quality words. Stay faithful; do not invent.',
  cg:
    'You convert a short Korean scene description (a story CG with characters) into comma-separated English ' +
    'Danbooru tags for an anime illustration (NovelAI Diffusion). Output ONLY lowercase comma-separated tags — ' +
    'no sentences, no explanation, no quotes, no markdown. Include subject count (1girl/1boy/2girls…), pose, ' +
    'action, setting. NEVER output generic medium words (anime style, manga, 2d illustration, digital painting) ' +
    'or quality words. Stay faithful; do not invent.',
  emotion:
    'You convert a Korean facial expression/emotion word into 1-2 English Danbooru expression tags. ' +
    'Output ONLY lowercase comma-separated tags — no sentences, no quotes, no "1girl", no markdown.',
};

/** 알려진 표정 → 가중치 강조 태그(규칙 2b). 커스텀 표정은 LLM 번역으로 폴백. */
const EMOTION_TAGS: Record<string, string> = {
  기본: 'neutral expression',
  기쁨: '(smiling:1.3), (happy:1.2)',
  슬픔: '(crying:1.3), (sad expression:1.2)',
  화남: '(angry:1.3), (frown:1.2)',
  놀람: '(surprised:1.3), (wide-eyed:1.2)',
  수줍음: '(blush:1.3), (shy:1.2)',
};

/** 캐릭터 단독 입화 구조 태그(배경 제거) · 배경 단독 구조 태그(인물 제외). */
const SPRITE_TAIL = 'transparent background, white background, simple background';
const SCENE_HEAD = 'scenery, no humans';

const cache = new Map<string, Promise<string>>();

function sanitize(s: string): string {
  return s
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/\s*\n+\s*/g, ', ')
    .replace(/^["'\s,]+|["'\s,]+$/g, '')
    .trim();
}

async function chat(system: string, user: string, apiKey: string): Promise<string> {
  const res = await fetch(aiConfig.chat.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: aiConfig.chat.themeModel, // gpt-4o-mini
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    let msg = `프롬프트 변환 실패 (HTTP ${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = await res.json();
  return sanitize(j?.choices?.[0]?.message?.content ?? '');
}

/** 한국어 문구 → 단부루 태그(모드별 시스템 프롬프트, 입력 단위 캐시). */
export async function compileTags(text: string, mode: CompileMode, apiKey: string): Promise<string> {
  const t = text.trim();
  if (!t) return '';
  const key = `${mode}|${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = chat(SYS[mode], t, apiKey);
  cache.set(key, p);
  try {
    return await p;
  } catch (e) {
    cache.delete(key); // 실패는 캐시하지 않음(다음에 재시도)
    throw e;
  }
}

/** 캐릭터 입화 프롬프트(외형 태그 + 감정 + 배경제거 구조). 품질 프리픽스는 provider 가 붙인다. */
export async function compileSpritePrompt(opts: {
  appearance?: string;
  emotion: string;
  apiKey: string;
}): Promise<string> {
  const charTags = opts.appearance?.trim()
    ? await compileTags(opts.appearance, 'character', opts.apiKey)
    : '1girl, solo';
  let emo = EMOTION_TAGS[opts.emotion];
  if (emo === undefined && opts.emotion && opts.emotion !== '기본') {
    try {
      emo = await compileTags(opts.emotion, 'emotion', opts.apiKey);
    } catch {
      emo = '';
    }
  }
  return [charTags, emo, SPRITE_TAIL].filter(Boolean).join(', ');
}

/** 배경(scenery) 프롬프트(인물 제외 + 장면 태그). 품질 프리픽스는 provider 가 붙인다. */
export async function compileScenePrompt(opts: { text: string; apiKey: string }): Promise<string> {
  const tags = await compileTags(opts.text, 'scene', opts.apiKey);
  return [SCENE_HEAD, tags].filter(Boolean).join(', ');
}

/** CG 컷 프롬프트(인물 포함 장면 태그). 품질 프리픽스는 provider 가 붙인다. */
export async function compileCgPrompt(opts: { text: string; apiKey: string }): Promise<string> {
  return compileTags(opts.text, 'cg', opts.apiKey);
}
