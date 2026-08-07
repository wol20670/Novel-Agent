// AI 문맥 표정 배정 — 번역 파이프라인(generators/translate/index.ts)과 같은 골격을 공유한다:
// 장면 단위로 대상을 모으고(collectEmotionTargets ≈ collectUntranslated), OpenAI 를 직접
// 호출하고(selectEmotionsBatch ≈ translateBatch), 방어적으로 파싱한다(parseEmotionResponse ≈
// parseTranslateResponse). 다른 점은 결과의 "정답 공간"이 자유 텍스트가 아니라 **후보 집합
// 하나**라는 것 — 오답의 대가가 다르다(엉뚱한 번역은 어색할 뿐이지만 엉뚱한 표정은 화난 장면에
// 웃는 그림을 보여준다). 그래서 파싱 실패·후보 밖 응답은 절대 추측하지 않고 그 줄만 버린다
// (호출부인 resolve.ts 의 우선순위 사슬이 알아서 휴리스틱으로 폴백한다 — emotionAuto 가 비면
// 그 다음 단계인 inferEmotion 이 대신 고른다).
//
// **동기·순수해야 하는 resolve.ts 와 달리 이 모듈은 실제 네트워크 호출**이다 — 그래서 결과를
// Line.emotionAuto 에 미리 계산해 저장해두는 구조(store.ts 의 배치 액션)와만 짝지어 쓴다.

import { aiConfig } from '../../config/aiConfig';
import { retryWithBackoff } from '../shared/retry';
import { isTransientTranslateError } from '../translate';
import { availableExpressions } from './resolve';
import {
  effectiveExpressions,
  resolveOutfit,
  type Character,
  type Expression,
  type Project,
} from '../../types';

// 90초 — translate/index.ts 와 동일 기준(정상적으로 오래 걸리는 대형 청크는 봐주되, 멎은 요청은 끊는다).
const EMOTION_TIMEOUT_MS = 90_000;
// 응답은 {"i":N,"expr":"..."} 나열뿐이라 번역보다 훨씬 짧다 — 폭주 방지 상한만 넉넉히.
const MAX_OUTPUT_TOKENS = 2048;

/** AI 표정 배정이 필요한 대사 한 줄. i = scene.lines 안의 원본 인덱스(응답 매칭 키). */
export interface EmotionItem {
  i: number;
  speaker: string;
  text: string;
}

/** 한 장면의 AI 표정 배정 대상 — 화자별 후보 목록은 장면 안에서 공유(의상은 장면 단위로 고정). */
export interface EmotionBatch {
  sceneId: string;
  items: EmotionItem[];
  /** 화자 이름 → 후보 표정 목록. project.expressions 순서를 그대로 따른다(계열/강도 순 = 정보). */
  candidatesBySpeaker: Map<string, Expression[]>;
}

/**
 * 프로젝트에서 "AI 표정 배정이 필요한 대사 줄"을 장면별로 모은다(collectUntranslated 와 동일한
 * 역할). 대상 = dialogue 줄 중 ① 합동 대사(members)가 아니고 ② 화자가 주인공(isProtagonist)이
 * 아니며 ③ 아직 emotion(작가 수동)도 emotionAuto(AI 배정)도 없고 ④ 그 화자가 실제로 스프라이트를
 * 올려둔(availableExpressions 가 비지 않은) 표정이 하나라도 있는 경우.
 * ③ 덕분에 재실행(증분)이 공짜다 — 이미 채운 줄은 다시 API 를 태우지 않는다.
 */
export function collectEmotionTargets(project: Project): EmotionBatch[] {
  const charByName = new Map<string, Character>(project.characters.map((c) => [c.name, c]));
  const declaredOrder = effectiveExpressions(project.expressions);
  const out: EmotionBatch[] = [];

  for (const scene of project.scenes) {
    const items: EmotionItem[] = [];
    const candidatesBySpeaker = new Map<string, Expression[]>();

    scene.lines.forEach((line, i) => {
      if (line.kind !== 'dialogue') return;
      if (line.members && line.members.length) return; // 합동 대사 — 단일 스프라이트가 없어 AI 가 고를 게 없음
      if (line.emotion || line.emotionAuto) return; // 이미 값이 있음 — 증분 재실행 시 스킵
      const char = charByName.get(line.speaker);
      if (!char || char.isProtagonist) return;

      let candidates = candidatesBySpeaker.get(line.speaker);
      if (!candidates) {
        // 장면(#복장)마다 입는 의상이 달라 실제 업로드된 표정 집합도 달라질 수 있다 — resolveOutfit
        // 으로 이 장면에서 이 캐릭터가 입는 의상을 구해 availableExpressions 에 넘긴다.
        const outfit = resolveOutfit(project.outfitRules, scene, line.speaker);
        const avail = availableExpressions(char, outfit);
        candidates = declaredOrder.filter((e) => avail.has(e));
        candidatesBySpeaker.set(line.speaker, candidates);
      }
      if (!candidates.length) return; // 스프라이트가 하나도 없으면 AI 가 고를 후보 자체가 없다

      items.push({ i, speaker: line.speaker, text: line.text });
    });

    if (items.length) out.push({ sceneId: scene.id, items, candidatesBySpeaker });
  }

  return out;
}

/** 유니코드 정규화(전각→반각 등) + 앞뒤 공백 제거 + 내부 공백 뭉치기 — AI 응답 표정명을 후보와 비교하기 전 세척. */
function normalizeLabel(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

const SYSTEM_PROMPT =
  'You are a visual-novel director choosing character facial expressions from scene context. ' +
  "For each dialogue line, pick exactly ONE expression from that speaker's candidate list — " +
  'copy a candidate string exactly as given, never invent a new label or translate it. ' +
  'Only change the expression when the emotion actually shifts; if it is unchanged from the ' +
  'previous line, repeat the same expression (avoid flickering between lines). ' +
  'Output STRICT JSON only, no markdown, no commentary: {"results":[{"i":0,"expr":"..."}]}. ' +
  "The \"i\" MUST equal the input item's \"i\". Do not add or drop items.";

export interface EmotionPromptCtx {
  sceneTitle: string;
  background?: string;
  direction: string[];
  cg: string[];
  /** buildSynopsis(theme/index.ts) 로 만든 프로젝트 전체 시놉시스 — 이야기 전체 맥락. */
  synopsis: string;
  /** 이 청크에 실제로 등장하는 화자만으로 좁혀서 넘긴다(프롬프트 비대화 방지). */
  candidatesBySpeaker: Map<string, Expression[]>;
  /** 표정 이름 → 한 줄 설명(project.expressionNotes). 후보 라벨 옆에 괄호로 덧붙인다. */
  expressionNotes?: Record<string, string>;
  /** 직전 청크의 마지막 2~3줄(읽기 전용 문맥) — 청크 경계에서 감정 흐름이 끊기지 않도록. */
  prevContextLines?: { speaker: string; text: string }[];
}

function buildUserPayload(items: EmotionItem[], ctx: EmotionPromptCtx): string {
  const scenePart = [`title: ${ctx.sceneTitle}`];
  if (ctx.background) scenePart.push(`background: ${ctx.background}`);
  if (ctx.direction.length) scenePart.push(`direction: ${ctx.direction.join(' / ')}`);
  if (ctx.cg.length) scenePart.push(`cg: ${ctx.cg.join(' / ')}`);

  const candidates = [...ctx.candidatesBySpeaker.entries()].map(([speaker, exprs]) => ({
    speaker,
    candidates: exprs.map((e) => (ctx.expressionNotes?.[e] ? `${e}(${ctx.expressionNotes[e]})` : e)),
  }));

  return JSON.stringify({
    scene: scenePart.join(' / '),
    synopsis: ctx.synopsis || undefined,
    candidates,
    prevContext: ctx.prevContextLines?.length
      ? ctx.prevContextLines.map((l) => `${l.speaker}: ${l.text}`)
      : undefined,
    items: items.map((it) => ({ i: it.i, speaker: it.speaker, text: it.text })),
  });
}

async function chat(system: string, user: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMOTION_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(aiConfig.chat.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: aiConfig.chat.themeModel, // 텍스트 전용 gpt-4o-mini 하나를 테마 생성과 공유(aiConfig 단일 소스)
        // 재현성 — 같은 대본을 증분 재실행해도 같은 배정이 나와야 "왜 이번엔 다르게 골랐지" 혼란이 없다.
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('표정 배정 요청 시간 초과(레이트 리밋/네트워크 의심)');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `표정 배정 실패 (HTTP ${res.status})`;
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

/** chat() 을 레이트리밋/타임아웃/5xx 에 한해 2s→4s→8s 지수 백오프로 최대 3회 재시도(translate 와 동일 판정 재사용). */
function chatWithRetry(system: string, user: string, apiKey: string): Promise<string> {
  return retryWithBackoff(() => chat(system, user, apiKey), isTransientTranslateError);
}

/**
 * OpenAI 응답 문자열 → { 줄인덱스: 표정 }. parseTranslateResponse 와 같은 방어적 파싱 스타일
 * (코드펜스 제거 → 중괄호 슬라이스 → JSON.parse) 이되, 값 검증이 다르다 — 자유 텍스트가 아니라
 * "그 줄 화자의 후보 목록 안에 정확히 일치하는 이름"만 인정한다. 인덱스가 모르는 값이거나
 * (유령 응답), 정규화 후에도 후보와 안 맞으면 그 항목은 **추측하지 않고 조용히 버린다** —
 * 호출부가 이미 emotionAuto 미설정 상태를 유지해 resolve.ts 의 휴리스틱 폴백으로 자연히 넘어간다.
 */
export function parseEmotionResponse(
  raw: string,
  items: EmotionItem[],
  candidatesBySpeaker: Map<string, Expression[]>,
): Record<number, Expression> {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('표정 배정 응답에서 JSON 객체를 찾지 못했습니다.');

  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as { results?: unknown };
  } catch {
    throw new Error('표정 배정 응답을 JSON 으로 해석하지 못했습니다.');
  }
  const arr = Array.isArray(parsed.results) ? parsed.results : [];

  const speakerByIndex = new Map(items.map((it) => [it.i, it.speaker]));
  const out: Record<number, Expression> = {};
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const i = typeof r.i === 'number' ? r.i : Number(r.i);
    if (!Number.isFinite(i)) continue;
    const speaker = speakerByIndex.get(i);
    if (!speaker) continue; // 요청하지 않은 인덱스(유령 응답) — 버림

    const exprRaw = typeof r.expr === 'string' ? r.expr : '';
    if (!exprRaw.trim()) continue;
    const norm = normalizeLabel(exprRaw);
    const candidates = candidatesBySpeaker.get(speaker) ?? [];
    const match = candidates.find((c) => normalizeLabel(c) === norm);
    if (!match) continue; // 후보 밖 — 추측하지 않고 버림(휴리스틱 폴백에 맡김)

    out[i] = match; // 정규화 전 "후보 원문 그대로"를 저장 — emotionAuto 는 project.expressions 표기와 100% 일치해야 함
  }
  return out;
}

/**
 * 한 배치(청크 하나 — 호출측이 chunkItems 로 미리 잘라 넘긴다)의 대사들에 표정을 배정한다.
 * 실패는 예외 → 호출측(store.ts)이 장면/청크 단위로 스킵(그 줄들은 emotionAuto 없이 남아
 * 휴리스틱 폴백으로 넘어간다).
 */
export async function selectEmotionsBatch(
  items: EmotionItem[],
  ctx: EmotionPromptCtx,
  apiKey: string,
): Promise<Record<number, Expression>> {
  if (!items.length) return {};
  const user = buildUserPayload(items, ctx);
  const raw = await chatWithRetry(SYSTEM_PROMPT, user, apiKey);
  return parseEmotionResponse(raw, items, ctx.candidatesBySpeaker);
}
