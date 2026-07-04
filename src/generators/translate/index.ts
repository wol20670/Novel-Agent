// KO 원문 대사·지문 → EN/JA 자동 번역(비주얼노벨 로컬라이징).
// promptCompiler 의 chat() 과 같은 fetch 패턴을 쓰되 번역 전용 system prompt + JSON I/O.
// 한 장면의 미번역 줄들을 배열로 묶어 1콜로 처리한다(콜 수 = 장면 수).

import { aiConfig } from '../../config/aiConfig';
import type { Locale } from '../../types';

const LOCALE_NAME: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

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
  const res = await fetch(aiConfig.chat.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    let msg = `번역 실패 (HTTP ${res.status})`;
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

/** 한 배치(주로 한 장면)의 줄들을 번역. 실패는 예외 → 호출측이 장면 단위로 폴백/스킵. */
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
  const raw = await chat(systemPrompt(targets), user, model, apiKey);
  return parseTranslateResponse(raw, targets);
}
