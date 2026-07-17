// Supertone TTS 생성 전 비용 추정 — Predict Duration(무료)으로 실제 합성 없이 초 단위 길이를
// 예측하고, 대본이 길면 전부 조회하는 대신 일부만 샘플링해 글자수→초 환산 계수를 뽑아 나머지에
// 외삽한다. 크레딧/초 단가는 비공개라 aiConfig 의 추정치를 쓰되, 실제 배치 생성 전후 크레딧
// 차이를 잴 때마다(store.ts) recordMeasuredCreditsPerSec 로 보정값을 남겨 다음 견적부터 더
// 정확해지게 한다.

import { aiConfig } from '../../config/aiConfig';
import { baseLocaleOf, type Locale, type Project } from '../../types';
import { collectVoiceTargets, type VoiceBatchItem } from './collectByCharacter';
import { predictDuration } from './supertoneProvider';

const CREDITS_PER_SEC_KEY = 'novel-agent:creditsPerSec';
/** predict-duration/text-to-speech 공통 300자 제한(초과 시 호출 자체가 실패). */
const TEXT_LIMIT = 300;

export interface CharEstimate {
  name: string;
  lines: number;
  chars: number;
  estSeconds: number;
  estCredits: number;
}

export interface OverLimitLine {
  scene: string;
  speaker: string;
  chars: number;
}

export interface VoiceEstimate {
  perChar: CharEstimate[];
  totalLines: number;
  totalChars: number;
  totalSeconds: number;
  totalCredits: number;
  overLimit: OverLimitLine[];
  /** 보이스 프리셋(char.voice)이 없어 견적에서 제외된 캐릭터 이름. */
  noPreset: string[];
}

/**
 * 대본이 길 때 전부 predict-duration 을 부르지 않고, 글자수 기준으로 짧은 것부터 긴 것까지
 * 고르게 n개만 골라 그 결과로 계수를 뽑는다(전수조사 없이도 분포를 대표하도록 stratified 샘플링).
 * targets 가 n개 이하면 어차피 전부 조회하는 게 더 정확하니 그대로 반환한다.
 */
export function pickSamples<T extends { text: string }>(targets: T[], n = 15): T[] {
  if (targets.length <= n) return targets.slice();
  const sorted = targets.map((t, i) => ({ t, i })).sort((a, b) => a.t.text.length - b.t.text.length);
  const idxSet = new Set<number>();
  for (let i = 0; i < n; i++) {
    idxSet.add(Math.round((i * (sorted.length - 1)) / (n - 1)));
  }
  return [...idxSet].sort((a, b) => a - b).map((idx) => sorted[idx].t);
}

export interface SampledDuration {
  chars: number;
  seconds: number;
}

/**
 * 샘플 결과(글자수→초)로 계수(초/글자)를 뽑아 targets 전체 글자수에 외삽한다.
 * sampled 가 targets 를 1:1로 전부 덮으면(=샘플링 없이 전수조사) 계수 계산이 그대로 실측 합과
 * 같아져(coefficient * totalChars = totalSampledSeconds) 별도 분기 없이도 "정확한 합"이 나온다.
 */
export function estimateFromSamples(
  targets: { text: string }[],
  sampled: SampledDuration[],
  creditsPerSec: number,
): { estSeconds: number; estCredits: number } {
  const totalSampledSeconds = sampled.reduce((sum, s) => sum + s.seconds, 0);
  const totalSampledChars = sampled.reduce((sum, s) => sum + s.chars, 0);
  const coefficient = totalSampledChars > 0 ? totalSampledSeconds / totalSampledChars : 0;
  const totalChars = targets.reduce((sum, t) => sum + t.text.length, 0);
  const estSeconds = coefficient * totalChars;
  const estCredits = estSeconds * creditsPerSec;
  return { estSeconds, estCredits };
}

/** targets 중 300자를 넘는(=predict-duration/text-to-speech 둘 다 실패할) 줄을 장면 제목과 함께 뽑는다. */
export function findOverLimitTargets(
  project: Project,
  targets: VoiceBatchItem[],
  speaker: string,
  limit = TEXT_LIMIT,
): OverLimitLine[] {
  return targets
    .filter((t) => t.text.length > limit)
    .map((t) => {
      const scene = project.scenes.find((s) => s.id === t.sceneId);
      return { scene: scene?.title ?? t.sceneId, speaker, chars: t.text.length };
    });
}

/**
 * 크레딧/초 단가 — localStorage 에 실측 보정값이 있으면 그걸, 없으면(또는 값이 이상하면)
 * aiConfig 의 추정 기본값을 쓴다. vitest(node 환경)에서 localStorage 가 없을 수 있어 가드한다.
 */
export function currentCreditsPerSec(): number {
  try {
    if (typeof localStorage === 'undefined') return aiConfig.voice.defaultCreditsPerSec;
    const raw = localStorage.getItem(CREDITS_PER_SEC_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : aiConfig.voice.defaultCreditsPerSec;
  } catch {
    return aiConfig.voice.defaultCreditsPerSec;
  }
}

/** 배치 생성 전후 실제 크레딧 차이를 재서 단가를 보정·저장한다(다음 견적부터 더 정확해짐). */
export function recordMeasuredCreditsPerSec(creditDelta: number, seconds: number): void {
  if (!(creditDelta > 0) || !(seconds > 1)) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const value = Math.round((creditDelta / seconds) * 1000) / 1000;
    localStorage.setItem(CREDITS_PER_SEC_KEY, String(value));
  } catch {
    /* 저장 실패해도 견적 기능 자체엔 영향 없음(다음 배치 때 다시 시도) */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * predict-duration 호출도 text-to-speech 와 동일하게 레이트리밋(429)에 걸릴 수 있어, 배치 생성
 * (store.ts batchVoiceCharacter)과 같은 지수 백오프(2s→4s→8s, 최대 3회)를 그대로 재현한다.
 * 레이트리밋 이외의 오류(잘못된 키 401 등)는 조용히 0초로 삼키면 견적 전체가 과소·왜곡되므로
 * 즉시 던져서 호출측(store)이 에러 토스트로 보여주게 한다.
 */
async function predictDurationWithRetry(
  params: Parameters<typeof predictDuration>[0],
  apiKey: string,
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await predictDuration(params, apiKey);
    } catch (e) {
      const isRateLimit = /레이트 리밋/.test((e as Error).message);
      if (!isRateLimit || attempt === 3) throw e;
      await sleep(2000 * 2 ** attempt);
    }
  }
}

/**
 * 프로젝트 전체(보이스 프리셋이 저장된 캐릭터만)의 예상 비용을 계산한다. 대사가 20줄 이하인
 * 캐릭터는 전부 조회하고, 그보다 많으면 pickSamples 로 15개만 조회해 외삽한다(호출 수·시간 절약).
 * PACE_MS=900 로 batchVoiceCharacter 와 동일하게 페이싱한다(연속 호출 시 429 방지).
 */
export async function estimateVoiceCostForProject(
  project: Project,
  locale: Locale,
  apiKey: string,
  onProgress?: (charName: string, done: number, total: number) => void,
): Promise<VoiceEstimate> {
  const base = baseLocaleOf(project);
  const creditsPerSec = currentCreditsPerSec();
  const PACE_MS = 900;

  const perChar: CharEstimate[] = [];
  const overLimit: OverLimitLine[] = [];
  const noPreset: string[] = [];
  let totalLines = 0;
  let totalChars = 0;
  let totalSeconds = 0;
  let totalCredits = 0;

  for (const char of project.characters) {
    if (char.isProtagonist) continue; // 주인공·나레이션 전용 화자는 VoiceLab 대상이 아님(canVoice 와 동일 기준)
    const targets = collectVoiceTargets(project, char.name, locale, base);
    if (!targets.length) continue; // 이 캐릭터가 말하는(아직 음성 없는) 대사가 아예 없으면 견적에서 제외

    if (!char.voice) {
      noPreset.push(char.name);
      continue;
    }

    overLimit.push(...findOverLimitTargets(project, targets, char.name));
    const withinLimit = targets.filter((t) => t.text.length <= TEXT_LIMIT);
    const chars = targets.reduce((sum, t) => sum + t.text.length, 0);

    if (!withinLimit.length) {
      perChar.push({ name: char.name, lines: targets.length, chars, estSeconds: 0, estCredits: 0 });
      continue;
    }

    const sampled = pickSamples(withinLimit, 15);
    const durations: SampledDuration[] = [];
    for (let i = 0; i < sampled.length; i++) {
      if (i > 0) await sleep(PACE_MS);
      const item = sampled[i];
      const seconds = await predictDurationWithRetry(
        {
          voiceId: char.voice.voiceId,
          text: item.text,
          language: locale,
          model: char.voice.model || aiConfig.voice.defaultModel,
          style: char.voice.style,
          settings: char.voice.settings,
        },
        apiKey,
      );
      durations.push({ chars: item.text.length, seconds });
      onProgress?.(char.name, i + 1, sampled.length);
    }

    const { estSeconds, estCredits } = estimateFromSamples(withinLimit, durations, creditsPerSec);
    perChar.push({ name: char.name, lines: targets.length, chars, estSeconds, estCredits });
    totalLines += targets.length;
    totalChars += chars;
    totalSeconds += estSeconds;
    totalCredits += estCredits;
  }

  return { perChar, totalLines, totalChars, totalSeconds, totalCredits, overLimit, noPreset };
}
