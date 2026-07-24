// Typecast TTS(https://typecast.ai/docs/api-reference) — 히로인 대사 성우 테스트용.
// 이전 TTS 벤더 서비스 종료로 이관(CLAUDE.md 참고). CORS 문제로 브라우저가
// api.typecast.ai 를 직접 못 부를 수 있어, 항상 aiConfig.voice.proxyBase
// (배포=Vercel Edge 함수, 로컬=vite dev 프록시. 둘 다 같은 경로 /api/typecast) 를 거쳐 호출한다.
//
// ⚠️ Typecast 엔드포인트는 버전이 리소스마다 다르다(문서 WebFetch 로 확정, 2026-07-23):
//   - TTS 생성: POST /v1/text-to-speech
//   - 보이스 목록: GET /v2/voices (v1 아님!)
//   - 구독/크레딧: GET /v1/users/me/subscription
// 그래서 UPSTREAM 은 버전을 포함하지 않고(api/typecast.ts 참고), 각 하위경로가 자기 버전을 갖는다.

import { aiConfig } from '../../config/aiConfig';
import type { Locale } from '../../types';

/** 감정 강도(0~2) 등 Typecast output/prompt 파라미터에 대응하는 음성 설정. */
export interface VoiceSettings {
  /** 배속. 0.5~2, 기본 1(Typecast output.audio_tempo). */
  tempo?: number;
  /** 음높이(반음). ±12, 기본 0(Typecast output.audio_pitch — 이전 벤더 대비 범위 절반이라 클램프 필요). */
  pitch?: number;
  /** 음량. 0~200, 기본 100(Typecast output.volume). */
  volume?: number;
}

export interface TtsParams {
  voiceId: string;
  text: string;
  language: Locale;
  model?: string; // 기본 aiConfig.voice.defaultModel(ssfm-v30)
  /** 'smart'(문맥 자동) 또는 이 보이스가 지원하는 감정 프리셋 이름(normal/happy/sad/angry/whisper/toneup/tonedown 등). */
  emotion?: string;
  /** emotion 이 프리셋일 때만 의미 있음. 0~2, 기본 1. */
  intensity?: number;
  settings?: VoiceSettings;
}

export interface TtsResult {
  blob: Blob;
  seconds: number;
}

/** GET /v2/voices 한 보이스가 지원하는 모델별 감정 목록(모델마다 지원 감정이 다를 수 있음). */
export interface TtsVoiceModel {
  version: string;
  emotions: string[];
}

export interface TtsVoice {
  voiceId: string;
  name: string;
  models: TtsVoiceModel[];
  gender?: string;
  age?: string;
  useCases?: string[];
  /** 'original' | 'custom' — uc_ 접두사 커스텀 보이스 여부 판별용(참고 표시). */
  voiceType?: string;
}

/** GET /v1/users/me/subscription — 플랜명·크레딧 잔량/사용량·동시성(문서 WebFetch 로 확정, 2026-07-23). */
export interface Subscription {
  plan: string;
  planCredits: number;
  usedCredits: number;
  concurrencyLimit?: number;
  customVoiceSlot?: number;
}

// 실제 Typecast 하위경로는 ?path= 쿼리로 넘긴다(고정 경로 하나만 씀 — api/typecast.ts 참고,
// 다단계 catch-all 라우팅이 Vercel 배포에서 깨지는 걸 이전 TTS 프록시에서 이미 확인해 그 방식을 유지).
function proxyUrl(subpath: string, query?: Record<string, string>): string {
  const qs = new URLSearchParams({ path: subpath, ...query });
  return `${aiConfig.voice.proxyBase}?${qs.toString()}`;
}

/**
 * HTTP 상태코드 → 사용자용 에러 메시지(순수 함수 — 단위테스트 대상). 402(크레딧 부족)는
 * store.ts 의 배치 중단 가드가 문자열 매칭(/크레딧이 부족/)으로 감지하니 문구를 바꿀 땐 함께 갱신.
 */
export function errorMessageForStatus(status: number, bodyMessage?: unknown): string {
  if (status === 401) return 'Typecast 키가 올바르지 않습니다.';
  if (status === 402) return 'Typecast 크레딧이 부족합니다.';
  if (status === 404) return 'Typecast 보이스를 찾을 수 없습니다(voice_id 확인).';
  if (status === 422) return 'Typecast 요청 형식이 올바르지 않습니다(텍스트 길이 1~2000자 등).';
  if (status === 429) return 'Typecast 요청이 너무 잦습니다(레이트 리밋) — 잠시 후 다시 시도하세요.';
  if (bodyMessage) return `Typecast 오류: ${typeof bodyMessage === 'string' ? bodyMessage : JSON.stringify(bodyMessage)}`;
  return `Typecast 요청 실패 (HTTP ${status})`;
}

async function errorMessage(res: Response): Promise<string> {
  if ([401, 402, 404, 422, 429].includes(res.status)) return errorMessageForStatus(res.status);
  try {
    const j = await res.json();
    return errorMessageForStatus(res.status, j?.error ?? j?.message);
  } catch {
    /* 응답이 JSON 이 아니면 무시(예: 바이너리) */
  }
  return errorMessageForStatus(res.status);
}

/** Novel-Agent Locale → Typecast language(ISO 639-3). 문서 확인분: kor/eng/jpn. */
export function localeToTypecastLanguage(locale: Locale): string {
  const map: Record<Locale, string> = { ko: 'kor', en: 'eng', ja: 'jpn' };
  return map[locale];
}

function buildTtsBody(params: Omit<TtsParams, 'voiceId'>): Record<string, unknown> {
  const { text, language, model, emotion, intensity, settings } = params;
  const body: Record<string, unknown> = {
    text,
    model: model || aiConfig.voice.defaultModel,
    language: localeToTypecastLanguage(language),
  };
  if (emotion === 'smart') {
    body.prompt = { emotion_type: 'smart' };
  } else if (emotion) {
    body.prompt = { emotion_type: 'preset', emotion_preset: emotion, emotion_intensity: intensity ?? 1 };
  }
  const output: Record<string, unknown> = { audio_format: 'mp3' };
  if (settings?.volume !== undefined) output.volume = settings.volume;
  if (settings?.pitch !== undefined) output.audio_pitch = clamp(settings.pitch, -12, 12);
  if (settings?.tempo !== undefined) output.audio_tempo = clamp(settings.tempo, 0.5, 2);
  body.output = output;
  return body;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** blob 의 실제 재생 길이(초)를 오프라인으로 구한다. 실패하면 0(기존 경로도 0 허용). */
async function decodeSeconds(blob: Blob): Promise<number> {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return 0;
    const buf = await blob.arrayBuffer();
    const ctx = new AC();
    try {
      const decoded = await ctx.decodeAudioData(buf);
      return decoded.duration || 0;
    } finally {
      void ctx.close().catch(() => {});
    }
  } catch {
    return 0;
  }
}

/** 한 줄 텍스트를 음성으로 합성. 결과 오디오는 호출측이 재생만 하고 저장은 하지 않는다(테스트 전용). */
export async function typecastTTS(params: TtsParams, apiKey: string): Promise<TtsResult> {
  const body = buildTtsBody(params);
  body.voice_id = params.voiceId;
  const res = await fetch(proxyUrl('v1/text-to-speech'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const blob = await res.blob();
  const seconds = await decodeSeconds(blob);
  return { blob, seconds };
}

/**
 * 보이스 목록 조회(드롭다운용). GET /v2/voices — 문서 확인분 필드: voice_id/voice_name/models[]
 * (models[].version·models[].emotions[])/gender/age/use_cases/voice_type. 페이징 없음(전체 반환).
 * 응답 스키마가 문서와 다를 가능성에 대비해 여러 후보 필드명을 방어적으로 시도한다.
 *
 * opts 의 gender/age/useCase 는 서버 쿼리(gender/age/use_cases)로 그대로 전달할 수 있게 구현은
 * 해두지만(단위테스트 대상), 실제 UI(VoiceLab)는 전체 목록을 한 번만 받아 **클라이언트에서 필터링**한다
 * (getAllVoices 참고) — 토글마다 재요청하지 않아 API 호출을 아끼고 필터 반응이 즉각적이다.
 * enum(문서 WebFetch 로 확정, 2026-07-24): gender=male|female,
 * age=child|teenager|young_adult|middle_age|elder,
 * useCase=Announcer|Anime|Audiobook|Conversational|Documentary|E-learning|Rapper|Game|Tiktok/Reels|News|Podcast|Voicemail|Ads.
 */
export async function listVoices(
  opts: { model?: string; gender?: string; age?: string; useCase?: string },
  apiKey: string,
): Promise<TtsVoice[]> {
  const query: Record<string, string> = {};
  if (opts.model) query.model = opts.model;
  if (opts.gender) query.gender = opts.gender;
  if (opts.age) query.age = opts.age;
  if (opts.useCase) query.use_cases = opts.useCase;
  const res = await fetch(proxyUrl('v2/voices', query), {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const j = await res.json();
  // 응답이 배열이 아니라 { voices: [...] } / { items: [...] } 로 감싸져 올 가능성도 방어.
  const items: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.voices) ? j.voices : Array.isArray(j?.items) ? j.items : [];
  return items.map((raw): TtsVoice => {
    const v = raw as Record<string, unknown>;
    const rawModels = v.models;
    let models: TtsVoiceModel[];
    if (Array.isArray(rawModels)) {
      models = rawModels.map((m) => {
        const mm = m as Record<string, unknown>;
        return {
          version: String(mm.version ?? mm.model ?? mm.name ?? ''),
          emotions: Array.isArray(mm.emotions) ? mm.emotions.map(String) : [],
        };
      });
    } else if (typeof v.model === 'string') {
      // 구형/변형 응답 대비: 모델이 단일 문자열 + emotions 가 최상위에 있는 형태.
      models = [{ version: v.model, emotions: Array.isArray(v.emotions) ? v.emotions.map(String) : [] }];
    } else {
      models = [];
    }
    return {
      voiceId: String(v.voice_id ?? v.voiceId ?? ''),
      name: String(v.voice_name ?? v.voiceName ?? v.name ?? '(이름 없음)'),
      models,
      gender: typeof v.gender === 'string' ? v.gender : undefined,
      age: typeof v.age === 'string' ? v.age : undefined,
      useCases: Array.isArray(v.use_cases) ? v.use_cases.map(String) : undefined,
      voiceType: typeof v.voice_type === 'string' ? v.voice_type : undefined,
    };
  });
}

// ── 전체 보이스 목록 모듈 캐시 ──────────────────────────────────────────────
// GET /v2/voices 는 700+개를 반환하는 정적 데이터(자주 안 바뀜)라, 필터 없이 세션당 1회만
// fetch 하고 이후 필터 토글은 이 배열을 클라이언트에서 걸러 쓴다(VoiceLab). 키가 바뀌면
// (다른 프로젝트로 전환 등) 캐시를 무효화한다. 실패한 요청은 캐시하지 않아 재시도가 자연히 된다.
let voiceCache: { key: string; promise: Promise<TtsVoice[]> } | null = null;

/** 필터 없는 전체 보이스 목록을 모듈 캐시로 반환(같은 apiKey 로 재호출하면 네트워크 없이 즉시). */
export function getAllVoices(apiKey: string): Promise<TtsVoice[]> {
  if (voiceCache && voiceCache.key === apiKey) return voiceCache.promise;
  const promise = listVoices({}, apiKey);
  // 실패 시 다음 호출에서 재시도할 수 있게 캐시를 비운다(빈 배열/에러를 영구히 캐시하지 않음).
  promise.catch(() => {
    if (voiceCache?.promise === promise) voiceCache = null;
  });
  voiceCache = { key: apiKey, promise };
  return promise;
}

/** 테스트·키 변경 시 강제 무효화용(단위테스트에서 모듈 상태를 리셋할 때 사용). */
export function clearVoiceCache(): void {
  voiceCache = null;
}

export interface VoiceRecommendation {
  voiceId: string;
  name: string;
  score: number;
}

/**
 * 자연어 설명으로 보이스 추천. GET /v1/voices/recommendations?query=&limit= — 문서 확인분 응답
 * 필드: voice_id/voice_name/score(플랜 조사 결과, 2026-07-24). 메타(성별·나이 등)는 응답에 없어
 * 호출측이 getAllVoices 결과와 voiceId 로 조인해 보강해야 한다. 응답 스키마가 문서와 다를 가능성에
 * 대비해 여러 후보 필드명 + 감싼 형태({voices:[...]} 등)를 방어적으로 시도한다.
 */
export async function recommendVoices(query: string, limit: number, apiKey: string): Promise<VoiceRecommendation[]> {
  const res = await fetch(proxyUrl('v1/voices/recommendations', { query, limit: String(limit) }), {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const j = await res.json();
  const items: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray(j?.voices)
      ? j.voices
      : Array.isArray(j?.recommendations)
        ? j.recommendations
        : Array.isArray(j?.items)
          ? j.items
          : [];
  return items
    .map((raw): VoiceRecommendation => {
      const v = raw as Record<string, unknown>;
      return {
        voiceId: String(v.voice_id ?? v.voiceId ?? ''),
        name: String(v.voice_name ?? v.voiceName ?? v.name ?? '(이름 없음)'),
        score: Number(v.score ?? 0) || 0,
      };
    })
    .filter((r) => r.voiceId); // voice_id 없는 항목은 선택 불가하니 애초에 제외.
}

/**
 * 구독/크레딧 조회(선택 — 표시용). GET /v1/users/me/subscription. 실패해도 호출측(LeftPanel
 * 크레딧 표시)이 에러를 삼켜 테스트 자체는 계속 가능해야 한다. 응답 스키마가 문서와 다를 가능성에
 * 대비해 여러 후보 필드명을 방어적으로 시도한다.
 */
export async function getSubscription(apiKey: string): Promise<Subscription> {
  const res = await fetch(proxyUrl('v1/users/me/subscription'), {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const j = await res.json();
  const credits = (j?.credits ?? {}) as Record<string, unknown>;
  const limits = (j?.limits ?? {}) as Record<string, unknown>;
  return {
    plan: String(j?.plan ?? '알 수 없음'),
    planCredits: Number(credits.plan_credits ?? j?.plan_credits ?? j?.total_credits ?? 0),
    usedCredits: Number(credits.used_credits ?? j?.used_credits ?? 0),
    concurrencyLimit: limits.concurrency_limit !== undefined ? Number(limits.concurrency_limit) : undefined,
    customVoiceSlot: limits.custom_voice_slot !== undefined ? Number(limits.custom_voice_slot) : undefined,
  };
}
