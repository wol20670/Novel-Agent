// KO 원문 대사·지문 → EN/JA 자동 번역(비주얼노벨 로컬라이징).
// OpenAI Chat Completions 를 직접 호출하되 번역 전용 system prompt + JSON I/O.
// 한 장면의 미번역 줄들을 배열로 묶어 1콜로 처리한다(콜 수 = 장면 수).

import { aiConfig } from '../../config/aiConfig';
import type { Locale } from '../../types';
import { retryWithBackoff } from '../shared/retry';

const LOCALE_NAME: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

// 90초 — 정상적으로 오래 걸리는 대형 청크는 넉넉히 봐주면서도, 진짜 멎어버린 요청은 확실히 끊어낸다.
const TRANSLATE_TIMEOUT_MS = 90_000;
// 응답이 무한정 길어지는(폭주) 사고를 방지하는 상한선.
const MAX_OUTPUT_TOKENS = 4096;
// 한 콜에 담을 최대 줄 수 — 평범한 장면 분량 정도라 대부분 장면이 청크 1개로 끝난다.
const LINES_PER_CHUNK = 40;
// 줄 수는 적어도 지문이 아주 길면 콜 하나가 비대해질 수 있어 글자 수도 함께 캡을 건다.
const CHARS_PER_CHUNK = 4000;

/** 번역할 한 줄. i = 원본 줄 인덱스(응답 매칭 키), speaker/narration = 말투 판단 컨텍스트. */
export interface TranslateItem {
  i: number;
  ko: string;
  speaker?: string;
  narration?: boolean;
}

function systemPrompt(targets: Locale[]): string {
  const langs = targets.map((l) => LOCALE_NAME[l]).join(' and ');
  const keys = targets.map((l) => `"${l}":"..."`).join(', ');
  return (
    `You are a professional visual-novel localizer. Translate each Korean line into ${langs}. ` +
    `Preserve tone and register (반말/존댓말), speaker voice, and emotional nuance. Make it natural, ` +
    `not word-for-word. Keep proper-noun character names consistent. Narration lines (narration:true) ` +
    `are prose, not spoken dialogue. ` +
    `Output STRICT JSON only — a single array, no markdown, no commentary: ` +
    `[{"i":0, ${keys}}]. The "i" MUST equal the input item's "i". Do not add or drop items.`
  );
}

/** OpenAI 응답 문자열 → { 줄인덱스: {locale: 번역} }. 코드펜스/잡텍스트를 걷어내고 JSON 배열만 파싱. */
export function parseTranslateResponse(
  raw: string,
  targets: Locale[],
): Record<number, Partial<Record<Locale, string>>> {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('번역 응답에서 JSON 배열을 찾지 못했습니다.');
  const arr = JSON.parse(cleaned.slice(start, end + 1)) as Array<Record<string, unknown>>;
  const out: Record<number, Partial<Record<Locale, string>>> = {};
  for (const row of arr) {
    const i = typeof row.i === 'number' ? row.i : Number(row.i);
    if (!Number.isFinite(i)) continue;
    const entry: Partial<Record<Locale, string>> = {};
    for (const loc of targets) {
      const v = row[loc];
      if (typeof v === 'string' && v.trim()) entry[loc] = v.trim();
    }
    if (Object.keys(entry).length) out[i] = entry;
  }
  return out;
}

async function chat(system: string, user: string, model: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(aiConfig.chat.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('번역 요청 시간 초과(레이트 리밋/네트워크 의심)');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `번역 실패 (HTTP ${res.status})`;
    if (res.status === 429) msg += ': 레이트 리밋';
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? '';
}

/** 일시적 오류(재시도하면 성공할 가능성 있음) — 레이트리밋/타임아웃/5xx. */
export function isTransientTranslateError(e: unknown): boolean {
  return /레이트 리밋|시간 초과|HTTP 5\d\d/.test((e as Error)?.message ?? '');
}

/** 치명적 오류(재시도 무의미) — 키 인증 실패/쿼터 소진. 배치 전체를 중단해야 한다. */
export function isFatalTranslateError(e: unknown): boolean {
  return /HTTP 401|HTTP 403|quota|insufficient_quota/i.test((e as Error)?.message ?? '');
}

/**
 * items 를 줄 수(maxLines)·글자 수(maxChars) 상한 안에서 순서를 보존하며 청크로 묶는다.
 * 한 아이템 자체가 maxChars 를 넘어도 누락/무한루프 없이 그 아이템 단독 청크가 된다.
 */
export function chunkItems(
  items: TranslateItem[],
  maxLines = LINES_PER_CHUNK,
  maxChars = CHARS_PER_CHUNK,
): TranslateItem[][] {
  const chunks: TranslateItem[][] = [];
  let current: TranslateItem[] = [];
  let currentChars = 0;
  for (const it of items) {
    const len = it.ko.length;
    const wouldExceed = current.length > 0 && (current.length + 1 > maxLines || currentChars + len > maxChars);
    if (wouldExceed) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(it);
    currentChars += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** chat() 을 레이트리밋/타임아웃/5xx 에 한해 2s→4s→8s 지수 백오프로 최대 3회 재시도. */
function chatWithRetry(system: string, user: string, model: string, apiKey: string): Promise<string> {
  return retryWithBackoff(() => chat(system, user, model, apiKey), isTransientTranslateError);
}

/**
 * 한 배치(청크 하나 — 호출측이 chunkItems 로 미리 잘라 넘긴다)의 줄들을 번역.
 * 실패는 예외 → 호출측이 장면/청크 단위로 폴백/스킵.
 */
export async function translateBatch(
  items: TranslateItem[],
  targets: Locale[],
  model: string,
  apiKey: string,
): Promise<Record<number, Partial<Record<Locale, string>>>> {
  if (!items.length || !targets.length) return {};
  const user = JSON.stringify(
    items.map((it) => ({ i: it.i, ko: it.ko, speaker: it.speaker, narration: it.narration || undefined })),
  );
  const raw = await chatWithRetry(systemPrompt(targets), user, model, apiKey);
  return parseTranslateResponse(raw, targets);
}
