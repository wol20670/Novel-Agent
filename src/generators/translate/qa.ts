// 번역 품질 QA(의심 번역 탐지) — post-v1 번역 개선 Phase 3 의 **순수 계약**.
//
// Phase 1(collectUntranslated)은 "번역 없음", Phase 2(anchor guard)는 "새로 생기는 stale 번역"을
// 막는다. 이 모듈이 다루는 건 **그 둘을 정상적으로 통과하는** 결함이다 — 번역이 존재하고 현재
// 원문과 연결돼 있는데 의미가 틀린 경우(그리고 원문이 번역 칸에 그대로 복사된 경우).
//
// 결과는 **오류 판정이 아니라 "의심 번역(검토 필요)"** 이고, 이 모듈은 canonical 을 쓰지 않는다
// (Line.i18n 을 읽기만 한다 — 수정은 사용자가 장면 카드에서 직접 한다).
//
// 파이프라인(이 순서가 계약이다):
//   비어있지 않은 번역 칸 → 유효 캐시 skip → copy-through 검사(hit 면 로컬 확정 · AI 제외)
//   → aiCells → planQaRequests(장면·로케일 grouping + chunkItems) → buildQaRequest → parseQaResponse

import { aiConfig } from '../../config/aiConfig';
import { baseLocaleOf, type Line, type Locale, type Project, type Scene } from '../../types';
import { retryWithBackoff } from '../shared/retry';
import { chunkItems, isTransientTranslateError } from './index';

const LOCALE_NAME: Record<Locale, string> = { ko: 'Korean', en: 'English', ja: 'Japanese' };

const QA_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 4096;

/** 결과를 만든 주체. 세 값 모두 실제 분기에 쓰인다(캐시 재사용·모델 변경 대응) — 표시용 장식이 아니다. */
export type QaOrigin = 'rule' | 'ai' | 'manual';

/** 의심 사유 분류. 새 값을 늘리지 말 것(스타일·자연스러움은 의도적으로 없다). */
export type QaCategory = 'meaning' | 'omission' | 'addition' | 'language';

const QA_CATEGORIES: readonly QaCategory[] = ['meaning', 'omission', 'addition', 'language'];

/**
 * QA 결과 하나가 "무엇을 보고 내려졌는지" — **reviewer 가 실제 읽은 semantic input 만** 담는다.
 *
 * source·target 을 둘 다 들고 있는 게 핵심이다: 원문이 그대로여도 번역이 바뀌었으면 옛 번역에
 * 대한 판단을 새 번역에 붙이면 안 된다. 비교는 **exact** 다 — Phase 2 generation validity 의
 * sameLooseText 를 쓰지 않는다(그쪽은 만들어진 *산출물*을 표기 편집에서 지키는 게 목적이라
 * 느슨한 게 맞고, 이쪽은 그 두 문자열에 대한 *transient 판단*이라 엄격한 게 안전하다).
 *
 * ⚠️ sceneId+lineIndex 는 좌표일 뿐 stable identity 가 아니다 — Line UUID 를 만들지 않는다.
 */
export interface TranslationQaAnchor {
  sceneId: string;
  lineIndex: number;
  /** 원문 언어(= project.baseLocale). ⚠️ 항상 'ko' 가 아니다 — #설정_글언어 로 en/ja 가 될 수 있다. */
  sourceLocale: Locale;
  targetLocale: Locale;
  source: string;
  target: string;
  speaker?: string;
  narration?: boolean;
}

/**
 * 검수 결과 하나. **session-only 런타임 state 전용** — Project·localStorage·.npproj.zip·협업 어디에도
 * 실리지 않는다(persistent QA metadata 를 만들지 않는다).
 */
export interface TranslationQaResult {
  anchor: TranslationQaAnchor;
  verdict: 'ok' | 'review';
  origin: QaOrigin;
  /** verdict==='review' 일 때만. 모르는 값이 오면 category 없이 review 만 남는다. */
  category?: QaCategory;
  /**
   * 사용자 검수 UI 표시 전용 문자열. **session state 에는 저장하지만 Project 에는 저장하지 않는다.**
   * ⚠️ OutfitSuggestion.reason("수락하면 버려진다")의 수명과 다르다 — QA 는 수락 개념이 없어
   * 세션 동안 계속 표시된다.
   */
  reason?: string;
  /**
   * origin==='ai' 일 때 그 판정을 낸 reviewer 모델. **session-only QA metadata** 이지
   * persistent translation version/hash 가 아니다 — 캐시 재사용 조건에만 쓴다.
   */
  model?: string;
}

/** 세션 캐시 모양 — store 가 그대로 들고 있는 것과 같다(sceneId → 결과들). */
export type TranslationQaCache = Record<string, TranslationQaResult[]>;

export interface QaCollection {
  /** 이번 실행에서 실제로 검수하는 칸 전체(유효 캐시 skip 이후) = ruleResults + aiCells. */
  cells: TranslationQaAnchor[];
  /** copy-through 로 **API 호출 없이** 확정된 결과. */
  ruleResults: TranslationQaResult[];
  /** AI reviewer 로 보낼 칸(= cells − rule hit). */
  aiCells: TranslationQaAnchor[];
}

/** 칸 identity — 좌표 3개. 구분자 문자를 박지 않으려고 JSON 배열을 쓴다(candidateKey 와 같은 이유). */
export function qaCellKey(a: Pick<TranslationQaAnchor, 'sceneId' | 'lineIndex' | 'targetLocale'>): string {
  return JSON.stringify([a.sceneId, a.lineIndex, a.targetLocale]);
}

/** 두 anchor 가 같은가 — 필드 전부 exact 비교(동치 관계를 새로 만들지 않는다). */
export function sameQaAnchor(a: TranslationQaAnchor, b: TranslationQaAnchor): boolean {
  return (
    a.sceneId === b.sceneId &&
    a.lineIndex === b.lineIndex &&
    a.sourceLocale === b.sourceLocale &&
    a.targetLocale === b.targetLocale &&
    a.source === b.source &&
    a.target === b.target &&
    a.speaker === b.speaker &&
    !!a.narration === !!b.narration
  );
}

/**
 * 그 줄·그 로케일이 지금 QA 대상인지 보고 anchor 를 만든다(아니면 null).
 * 대상 판정의 **단일 소스** — 수집과 유효성 검사가 같은 답을 내야 한다(resolveEmotion 규칙과 같다).
 *
 * ⚠️ 빈/공백 번역은 대상이 **아니다** — 그건 Phase 1(missing)의 영역이다. canonical write path 는
 * 그런 값을 만들지 않지만(setLineTranslation 이 로케일을 지운다) legacy/외부 project 에 있을 수
 * 있어서 여기서 한 번 더 거른다.
 */
function anchorFor(
  sceneId: string,
  lineIndex: number,
  line: Line,
  sourceLocale: Locale,
  targetLocale: Locale,
): TranslationQaAnchor | null {
  if (line.kind !== 'dialogue' && line.kind !== 'narration') return null;
  if (!line.text.trim()) return null;
  const target = line.i18n?.[targetLocale];
  if (!target || !target.trim()) return null;
  return {
    sceneId,
    lineIndex,
    sourceLocale,
    targetLocale,
    source: line.text,
    target,
    speaker: line.kind === 'dialogue' ? line.speaker : undefined,
    narration: line.kind === 'narration',
  };
}

/**
 * 저장된 결과가 지금도 유효한가 — **표시·compaction 공용**.
 * 무효화 배선(epoch·invalidate 액션)을 만들지 않고 이 술어 하나로 원문 수정·번역 수정·줄 삭제·
 * 줄 삽입·화자 변경·kind 변경·재분석·원격 반영을 전부 덮는다(QA 는 적용 경로가 없어서 가능하다).
 */
export function isQaResultValid(
  anchor: TranslationQaAnchor,
  scene: Scene | undefined,
  sourceLocale: Locale,
): boolean {
  if (anchor.sourceLocale !== sourceLocale) return false;
  if (!scene || scene.id !== anchor.sceneId) return false;
  const line = scene.lines[anchor.lineIndex];
  if (!line) return false;
  const current = anchorFor(anchor.sceneId, anchor.lineIndex, line, sourceLocale, anchor.targetLocale);
  return !!current && sameQaAnchor(current, anchor);
}

const NO_ISSUES: TranslationQaResult[] = [];

/**
 * 지금 화면에 띄워야 할 의심 번역 — **표시 판정의 단일 소스**(전체 카운트·장면 배지·줄 경고 공용).
 *
 * 무효화 배선(epoch·invalidate 액션) 대신 이 render-time 필터 하나로 stale 을 처리한다: 사용자가
 * 번역을 고치면 anchor 가 어긋나 경고가 **저절로** 사라진다 — UI 가 setLineTranslation 뒤에
 * clearTranslationQa 같은 걸 부르면 안 된다(그 순간 다른 칸의 유효한 결과까지 날아간다).
 * `manual`/`ai` 의 'ok' 는 애초에 verdict 가 review 가 아니라 자연히 빠진다.
 */
export function activeQaIssues(
  results: TranslationQaResult[] | undefined,
  scene: Scene | undefined,
  sourceLocale: Locale,
): TranslationQaResult[] {
  if (!results?.length) return NO_ISSUES;
  return results.filter((r) => r.verdict === 'review' && isQaResultValid(r.anchor, scene, sourceLocale));
}

/**
 * deterministic copy-through — 원문이 번역 칸에 **그대로** 복사된 경우.
 *
 * Phase 1(missing)·Phase 2(stale validity)를 정상 통과하는 별개의 language anomaly 이고,
 * API 호출 없이 값싸게 잡을 수 있어서 채택했다.
 * ⚠️ known false positives 가 있다: 고유명사만으로 된 줄 · 효과음 · 의도적 원어 유지.
 *    조건을 좁혀 precision 을 우선한 것일 뿐 FP 0 을 가정하지 않으며, 결과는 **의심 번역**이다.
 * ⚠️ 이걸 generic language-heuristic framework 로 키우지 말 것 — 두 번째 heuristic 은 이 rule 의
 *    확장이 아니라 새 Phase 의 판단 대상이다.
 * ⚠️ sourceLocale==='ko' 를 **명시 조건**으로 둔다(한글 검사에 암묵적으로 기대지 않는다).
 */
export function detectCopyThrough(anchor: TranslationQaAnchor): boolean {
  if (anchor.sourceLocale !== 'ko') return false;
  if (anchor.targetLocale !== 'en' && anchor.targetLocale !== 'ja') return false;
  if (anchor.target.trim() !== anchor.source.trim()) return false;
  return /[가-힣]/.test(anchor.source);
}

/**
 * 유효 캐시로 이번 실행에서 건너뛸 칸인가.
 *
 * rule·manual 은 모델과 무관하다(전자는 무료·결정적, 후자는 사람의 판단이라 reviewer 가 바뀌어도
 * 뒤집히면 안 된다). ai 만 **같은 모델일 때만** 재사용한다 — fast(mini)에서 ok 였던 칸이
 * quality(gpt-4o)로 바꿔 재실행할 때 검수되지 않고 지나가면 사용자가 고른 모델 정책과 어긋난다.
 */
function shouldSkipCell(
  cached: TranslationQaResult | undefined,
  anchor: TranslationQaAnchor,
  model: string,
): boolean {
  if (!cached) return false;
  if (!sameQaAnchor(cached.anchor, anchor)) return false;
  if (cached.origin === 'rule' || cached.origin === 'manual') return true;
  return cached.model === model;
}

/**
 * 이번 실행의 검수 대상을 모은다 — **deterministic short-circuit 포함**.
 * copy-through 로 걸린 칸은 로컬에서 확정하고 aiCells 에서 빠진다(요청·비용·견적 전부에서 빠진다).
 *
 * ⚠️ 대상 판정을 다른 곳에서 다시 계산하지 말 것 — 견적과 실행이 이 함수 하나를 공유해야 숫자가
 *    갈라지지 않는다(Phase 15 "estimate 의 계약은 planner parity" 와 같은 규칙).
 */
export function collectQaTargets(
  project: Pick<Project, 'scenes' | 'baseLocale'>,
  targets: Locale[],
  cache: TranslationQaCache,
  model: string,
): QaCollection {
  const sourceLocale = baseLocaleOf(project);
  const cachedByCell = new Map<string, TranslationQaResult>();
  for (const list of Object.values(cache)) {
    for (const r of list) cachedByCell.set(qaCellKey(r.anchor), r);
  }

  const cells: TranslationQaAnchor[] = [];
  const ruleResults: TranslationQaResult[] = [];
  const aiCells: TranslationQaAnchor[] = [];

  for (const sc of project.scenes) {
    sc.lines.forEach((line, i) => {
      for (const loc of targets) {
        if (loc === sourceLocale) continue; // 원문 언어 칸은 번역이 아니다
        const anchor = anchorFor(sc.id, i, line, sourceLocale, loc);
        if (!anchor) continue;
        if (shouldSkipCell(cachedByCell.get(qaCellKey(anchor)), anchor, model)) continue;
        cells.push(anchor);
        if (detectCopyThrough(anchor)) {
          ruleResults.push({
            anchor,
            verdict: 'review',
            origin: 'rule',
            category: 'language',
            reason: '번역 칸에 원문이 그대로 들어가 있습니다(고유명사·효과음이면 무시해도 됩니다).',
          });
        } else {
          aiCells.push(anchor);
        }
      }
    });
  }

  return { cells, ruleResults, aiCells };
}

/** 한 번의 AI 요청 — 같은 장면·같은 대상 로케일의 칸들만 담는다. */
export interface QaRequestPlan {
  sceneId: string;
  sourceLocale: Locale;
  targetLocale: Locale;
  /** 이 요청의 target. **배열 위치가 곧 요청-local `i`** 다(줄 인덱스가 아니다). */
  items: TranslationQaAnchor[];
}

/**
 * AI 대상 칸 → 실제 요청 목록. **견적과 실행이 반드시 이 함수 하나를 공유한다**(요청 수가 어긋날 수
 * 없게). 새 generic batch framework 를 만들지 않고 기존 chunkItems 를 그대로 쓴다.
 * grouping 은 장면 → 대상 로케일(첫 등장 순서 보존)이라 프롬프트가 "이 언어를 검수하라"로 명확해진다.
 */
export function planQaRequests(aiCells: TranslationQaAnchor[]): QaRequestPlan[] {
  const groups = new Map<string, TranslationQaAnchor[]>();
  for (const a of aiCells) {
    const key = JSON.stringify([a.sceneId, a.targetLocale]);
    const g = groups.get(key);
    if (g) g.push(a);
    else groups.set(key, [a]);
  }
  const plans: QaRequestPlan[] = [];
  for (const items of groups.values()) {
    for (const chunk of chunkItems(items, (a) => a.source.length + a.target.length)) {
      plans.push({
        sceneId: chunk[0].sceneId,
        sourceLocale: chunk[0].sourceLocale,
        targetLocale: chunk[0].targetLocale,
        items: chunk,
      });
    }
  }
  return plans;
}

/**
 * 요청 프롬프트. 두 가지를 강하게 못박는다:
 *  ① **대체 번역을 만들지 말 것**(자동 적용 경로가 없고, 만들면 사용자가 그걸 그대로 붙여넣게 된다)
 *  ② **확신이 낮으면 ok**(precision 우선 — 문체·표현 취향으로 review 를 남발하면 검수 UX 가 죽는다)
 */
function systemPrompt(sourceLocale: Locale, targetLocale: Locale): string {
  const src = LOCALE_NAME[sourceLocale];
  const dst = LOCALE_NAME[targetLocale];
  return (
    `You are a bilingual QA reviewer for a visual-novel localization. Each item gives one ${src} ` +
    `source line and ONE existing ${dst} translation of that line. Decide whether a human should ` +
    `re-check that translation. Items with "narration":true are prose, not spoken dialogue. ` +
    `Answer "review" ONLY for clear defects: ` +
    `meaning (the translation states something different from the source, including reversed polarity), ` +
    `omission (meaningful content of the source is missing), ` +
    `addition (the translation adds content that is not in the source), ` +
    `language (the translation is not written in ${dst}, or is unintelligible). ` +
    `Do NOT answer "review" for style, word choice, punctuation, register shades, or natural ` +
    `paraphrase. If you are not confident, answer "ok". Never propose or output a replacement ` +
    `translation. ` +
    `Output STRICT JSON only — no markdown, no commentary: ` +
    `{"results":[{"i":0,"v":"ok"},{"i":1,"v":"review","c":"meaning","r":"짧은 한국어 설명"}]}. ` +
    `The "i" MUST equal the input item's "i". "v" is "ok" or "review". "c" and "r" are given ONLY ` +
    `when "v" is "review" — "c" is one of meaning|omission|addition|language, "r" is a short Korean reason.`
  );
}

/**
 * 요청 원문 두 개. 항목의 i 는 **요청-local 인덱스**(배열 위치)다.
 * ⚠️ 주변 줄 문맥을 싣지 않는다. 문맥을 넣으면 "문맥이 바뀌었는가"까지 anchor 로 검증해야 해서
 *    표정 AI 의 requestKey 급 복잡도가 따라온다. 대명사 선행사·문체 일관성은 accepted limitation.
 */
export function buildQaRequest(plan: QaRequestPlan): { system: string; user: string } {
  const user = JSON.stringify({
    items: plan.items.map((a, i) => ({
      i,
      sourceLocale: a.sourceLocale,
      targetLocale: a.targetLocale,
      source: a.source,
      target: a.target,
      speaker: a.speaker,
      narration: a.narration || undefined,
    })),
  });
  return { system: systemPrompt(plan.sourceLocale, plan.targetLocale), user };
}

/** 파싱된 판정 하나(아직 anchor 와 묶이기 전). */
export interface QaVerdict {
  verdict: 'ok' | 'review';
  category?: QaCategory;
  reason?: string;
}

/** 값 정규화 — NFKC·trim·소문자 후 **exact** 비교(fuzzy 금지, Outfit kind 와 같은 규율). */
function normalizeToken(v: unknown): string {
  return typeof v === 'string' ? v.normalize('NFKC').trim().toLowerCase() : '';
}

/**
 * 응답 문자열 → { 요청-local i: 판정 }. 구조는 parseEmotionResponse 와 같다(코드펜스 제거 →
 * 객체 슬라이스 → JSON.parse → **요청한 인덱스만** 인정).
 *
 * ⚠️ **duplicate i 는 last wins 가 아니라 unreviewed 다** — emotion 의 관용구를 재사용하되 그
 * semantic 은 일부러 복사하지 않았다. [{"i":3,"v":"review"},{"i":3,"v":"ok"}] 에서 last wins 를
 * 쓰면 실제 review 신호가 조용히 사라지는데, QA 의 기본 정책은 "모르는 결과를 ok 로 추측하지 않는다"
 * 이다. 해당 항목만 빠지고 정상 행과 배치 전체는 살린다(다음 실행에서 자연히 다시 대상이 된다).
 * ⚠️ 같은 이유로 **v 누락·unknown 도 ok 가 아니라 unreviewed** 다(ok 로 캐시하면 skip gate 때문에
 * 영원히 재검수되지 않는다). 반면 **c 가 unknown 이면 판정은 살리고 category 만 비운다** —
 * 그건 표시용 분류일 뿐이라 버리면 review 신호를 잃는다.
 */
export function parseQaResponse(raw: string, items: TranslationQaAnchor[]): Record<number, QaVerdict> {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('번역 QA 응답에서 JSON 객체를 찾지 못했습니다.');

  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as { results?: unknown };
  } catch {
    throw new Error('번역 QA 응답을 JSON 으로 해석하지 못했습니다.');
  }
  const arr = Array.isArray(parsed.results) ? parsed.results : [];

  const out: Record<number, QaVerdict> = {};
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const i = typeof r.i === 'number' ? r.i : Number(r.i);
    if (!Number.isFinite(i)) continue;
    if (!items[i]) continue; // 요청하지 않은 인덱스(유령 응답) — 버림
    if (seen.has(i)) {
      dupes.add(i);
      continue;
    }
    seen.add(i);

    const v = normalizeToken(r.v);
    if (v !== 'ok' && v !== 'review') continue; // unknown/missing → unreviewed
    if (v === 'ok') {
      out[i] = { verdict: 'ok' };
      continue;
    }
    const c = normalizeToken(r.c);
    const category = QA_CATEGORIES.find((x) => x === c);
    const reason = typeof r.r === 'string' && r.r.trim() ? r.r.trim() : undefined;
    out[i] = { verdict: 'review', category, reason };
  }
  for (const i of dupes) delete out[i];
  return out;
}

async function chat(system: string, user: string, model: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(aiConfig.chat.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        // 재현성 — 같은 대본을 증분 재실행했을 때 판정이 흔들리면 검수 목록을 믿을 수 없다.
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
      throw new Error('번역 QA 요청 시간 초과(레이트 리밋/네트워크 의심)');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `번역 QA 실패 (HTTP ${res.status})`;
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

/**
 * 요청 하나를 실행해 그 요청의 결과들을 돌려준다. 실패는 예외 → 호출측(Phase 3-B)이 요청 단위로
 * 스킵한다. ⚠️ **이미 확정된 rule 결과와 이미 성공한 AI 결과를 run 전체 실패로 버리지 말 것**
 * (copy-through 는 애초에 API 와 무관하게 판정된 무료 결과다).
 * 판정에 없는 항목(unreviewed)은 결과에 담기지 않는다 — 다음 실행에서 자연히 다시 대상이 된다.
 */
export async function reviewTranslationsBatch(
  plan: QaRequestPlan,
  model: string,
  apiKey: string,
): Promise<TranslationQaResult[]> {
  if (!plan.items.length) return [];
  const { system, user } = buildQaRequest(plan);
  const raw = await retryWithBackoff(() => chat(system, user, model, apiKey), isTransientTranslateError);
  const verdicts = parseQaResponse(raw, plan.items);
  const out: TranslationQaResult[] = [];
  for (const [key, v] of Object.entries(verdicts)) {
    const anchor = plan.items[Number(key)];
    if (!anchor) continue;
    out.push({ anchor, verdict: v.verdict, origin: 'ai', category: v.category, reason: v.reason, model });
  }
  return out;
}

/**
 * 세션 캐시를 현재 project 기준으로 정리한다 — **stale 결과 무한 누적 방지**.
 * 새 무효화 배선·persistent registry·global epoch 없이, QA 커밋 경로 안에서만 일어난다.
 * ⚠️ 줄을 하나 삽입하면 그 장면의 삽입 지점 이후 캐시가 전부 무효가 돼 다음 실행에서 재검수된다
 *    (다른 장면은 영향 없다) — accepted limitation 이고 Line UUID 로 해결하지 않는다.
 */
export function compactQaResults(
  cache: TranslationQaCache,
  project: Pick<Project, 'scenes' | 'baseLocale'>,
): TranslationQaCache {
  const sourceLocale = baseLocaleOf(project);
  const sceneMap = new Map(project.scenes.map((s) => [s.id, s]));
  const out: TranslationQaCache = {};
  for (const [sceneId, list] of Object.entries(cache)) {
    const kept = list.filter((r) => isQaResultValid(r.anchor, sceneMap.get(sceneId), sourceLocale));
    if (kept.length) out[sceneId] = kept;
  }
  return out;
}

/**
 * 결과를 **칸 identity 로 upsert** 한다(같은 칸의 옛 판정은 새 판정이 대체). 장면 키는 anchor 에서
 * 나오므로 호출측이 따로 분류하지 않는다. 입력 cache 는 변경하지 않는다(순수).
 */
export function upsertQaResults(
  cache: TranslationQaCache,
  incoming: TranslationQaResult[],
): TranslationQaCache {
  if (!incoming.length) return cache;
  const out: TranslationQaCache = {};
  for (const [sceneId, list] of Object.entries(cache)) out[sceneId] = list.slice();
  for (const r of incoming) {
    const { sceneId } = r.anchor;
    const list = out[sceneId] ?? [];
    const key = qaCellKey(r.anchor);
    const at = list.findIndex((x) => qaCellKey(x.anchor) === key);
    if (at >= 0) list[at] = r;
    else list.push(r);
    out[sceneId] = list;
  }
  return out;
}
