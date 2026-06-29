// NovelAI 프롬프트 컴파일러 — 한국어 외형/장면 설명을 단부루(Danbooru) 영문 태그로 변환한다.
// gpt-4o-mini(aiConfig.chat) 를 쓰며, 같은 입력은 메모리 캐시해 캐릭터 표정 6종이 동일한 외형 태그를
// 공유하도록(=일관성) 한다. 품질 프리픽스는 provider(withQualityTags)가 단일 소스로 앞에 붙이므로
// 여기서는 본문 태그 + 감정/구조 태그만 조립한다(이중 prefix 방지).

import { aiConfig } from '../../config/aiConfig';
import {
  dictionaryPromptBlock,
  recordUnmatchedTags,
  ALL_CATEGORIES,
} from './tagDictionary';

type CompileMode = 'character' | 'scene' | 'cg' | 'emotion';

const SYS: Record<CompileMode, string> = {
  character:
    'You convert a short Korean character description into comma-separated English Danbooru tags for an anime ' +
    'illustration model (NovelAI Diffusion). Output ONLY lowercase comma-separated tags — no sentences, no ' +
    'explanation, no quotes, no markdown. If it is a single character, start with "1girl, solo" or "1boy, solo" ' +
    'as appropriate. Use concise tags (hair color/length, hairstyle, eye color, clothing, accessories, held items, body type). ' +
    'IMPORTANT for hair: if a partial-dye / highlight / streak / two-tone is described (브릿지, 메쉬, 하이라이트, 투톤, ' +
    '인이어/이너 컬러), tag it as "multicolored hair, streaked hair" plus the accent color (e.g. "mint green"), and ALSO ' +
    'keep the BASE hair color as its own tag. Do NOT recolor the entire hair with the accent color. If a streak is on the ' +
    'front hair/bangs, add "colored inner hair" or "streaked hair" with the bangs. For items in hands use "holding <item>" ' +
    '(e.g. holding tablet, holding pen). ' +
    'NEVER output generic medium words (anime style, manga, manga style, 2d illustration, digital painting) ' +
    'and NEVER output quality words (masterpiece, best quality) or background tags. Stay faithful; do not invent. Output plain tags only — never use parentheses or :: weighting syntax.',
  scene:
    'You convert a short Korean background/scene description into comma-separated English Danbooru tags for an ' +
    'anime background illustration (NovelAI Diffusion). Output ONLY lowercase comma-separated tags — no sentences, ' +
    'no explanation, no quotes, no markdown. Focus on place, time of day, lighting, weather, objects. ' +
    'Do NOT include people/characters. NEVER output generic medium words (anime style, manga, 2d illustration, ' +
    'digital painting) or quality words. Stay faithful; do not invent. Output plain tags only — never use parentheses or :: weighting syntax.',
  cg:
    'You convert a short Korean scene description (a story CG with characters) into comma-separated English ' +
    'Danbooru tags for an anime illustration (NovelAI Diffusion). Output ONLY lowercase comma-separated tags — ' +
    'no sentences, no explanation, no quotes, no markdown. Include subject count (1girl/1boy/2girls…), pose, ' +
    'action, setting. NEVER output generic medium words (anime style, manga, 2d illustration, digital painting) ' +
    'or quality words. Stay faithful; do not invent. Output plain tags only — never use parentheses or :: weighting syntax.',
  emotion:
    'You convert a Korean facial expression/emotion word into 1-2 English Danbooru expression tags. ' +
    'Output ONLY lowercase comma-separated tags — no sentences, no quotes, no "1girl", no markdown.',
};

// 모드별 사전 주입 분류(표준 11개 카테고리 기준, 규칙으로 자동 분류).
//  - 장면(배경)에 쓰는 환경 카테고리.
const SCENE_CATS = new Set(['Scene', 'LightFX', 'Style', 'Camera']);
//  - 캐릭터에 넣지 않을 카테고리(환경 + 품질). 그 외(Subject·Body·Expression·Pose·Clothing·Accessory)는 캐릭터에 주입.
const CHARACTER_EXCLUDE = new Set(['Scene', 'LightFX', 'Quality']);

/** 모드별로 System Prompt 에 주입할 카테고리 목록(현재 사전에 존재하는 카테고리에서 선별). */
function dictCatsFor(mode: CompileMode): string[] {
  if (mode === 'emotion') return ['Expression'];
  if (mode === 'scene') return ALL_CATEGORIES.filter((c) => SCENE_CATS.has(c));
  if (mode === 'cg') return ALL_CATEGORIES.filter((c) => c !== 'Quality'); // 인물+배경 모두
  return ALL_CATEGORIES.filter((c) => !CHARACTER_EXCLUDE.has(c)); // character
}

// 사전 매칭 규칙 — DB 우선 매칭, 없는 묘사만 직접 Danbooru 태그 생성.
const DICT_RULE =
  'Below is a [Tag Dictionary] (Korean meaning => English NovelAI tag). RULES: ' +
  '(1) Whenever the input expresses a meaning that exists in the dictionary, you MUST use the exact ' +
  'dictionary English tag(s) for it — do not paraphrase or invent a synonym. ' +
  '(2) For descriptions NOT covered by the dictionary, generate your own Danbooru-style English tags and append them. ' +
  '(3) Keep everything comma-separated, lowercase, plain tags only.';

/** 모드별 최종 System Prompt = 기본 지시 + 사전 규칙 + 주입된 사전 블록. */
function systemFor(mode: CompileMode): string {
  const block = dictionaryPromptBlock(dictCatsFor(mode));
  if (!block) return SYS[mode];
  return `${SYS[mode]}\n\n${DICT_RULE}\n\n[Tag Dictionary]\n${block}`;
}

// 알려진 표정 → 강조 태그. NovelAI V4.5 가중치 문법은 `weight::tag::` (예: 1.3::smiling::).
// (Stable Diffusion 의 (tag:1.3) 문법은 NovelAI 에서 동작하지 않음.)
// 얼굴(표정)만 바꾸도록 "약한 단일 페이스 태그"로 둔다. 강한 가중치/포즈 함의 태그(happy 등)는
// 같은 시드라도 구도·복장까지 흔들어버리므로 피한다(표정만 바뀌고 나머지는 유지되게).
const EMOTION_TAGS: Record<string, string> = {
  기본: 'neutral expression, closed mouth',
  기쁨: 'smile',
  슬픔: 'sad, frown',
  화남: 'angry, frown',
  놀람: 'surprised, open mouth',
  수줍음: 'blush, embarrassed',
};

/** 캐릭터 단독 입화 구조 태그(배경 제거) · 배경 단독 구조 태그(인물 제외). */
const SPRITE_TAIL = 'transparent background, white background, simple background';
// 입화 프레이밍 — 표정 세트를 같은 구도로 고정(공식 가이드: 구도/앵글 태그를 앞쪽 + 가중치로 배치).
// VN 스프라이트는 전신(발끝까지). 끝에 두면 무릎 위로 잘리므로 1.4 가중치로 강하게 건다(배치 생성과 동일).
const SPRITE_FRAMING = '1.4::full body::, full body shot, standing, head to toe, looking at viewer';
// 얼굴 품질 보강 — 전신이라 얼굴이 더 작게 잡혀 흐려지기 쉬워, 눈동자·얼굴 디테일을 명시해 보강한다.
const SPRITE_FACE = 'beautiful detailed eyes, detailed face';
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
  // 키가 없으면(영어 입력 모드이거나 OpenAI 키 미설정) 변환 없이 원문 그대로 사용 → 바로 NovelAI 로.
  if (!apiKey.trim()) return t;
  const key = `${mode}|${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = chat(systemFor(mode), t, apiKey).then((out) => {
    // 변환 과정 가시화(devtools 에서 입력→출력 확인) + 미등록 태그 피드백 누적.
    console.info(`%c[태그변환:${mode}]`, 'color:#60a5fa', `"${t}" → ${out}`);
    if (mode !== 'emotion') recordUnmatchedTags(out.split(','));
    return out;
  });
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
  return [charTags, SPRITE_FRAMING, SPRITE_FACE, emo, SPRITE_TAIL].filter(Boolean).join(', ');
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
