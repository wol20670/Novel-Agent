// Supertone TTS(https://docs.supertoneapi.com) — 히로인 대사 성우 테스트용.
// CORS 문제로 브라우저가 supertoneapi.com 을 직접 못 부를 수 있어, 항상 aiConfig.voice.proxyBase
// (배포=Vercel Edge 함수, 로컬=vite dev 프록시. 둘 다 같은 경로 /api/supertone) 를 거쳐 호출한다.

import { aiConfig } from '../../config/aiConfig';
import type { Locale } from '../../types';

export interface VoiceSettings {
  speed?: number; // 0.5~2, 기본 1
  pitchShift?: number; // -24~24 반음, 기본 0
  pitchVariance?: number; // 0~2, 기본 1
  textGuidance?: number; // 0~4, 기본 1
}

export interface TtsParams {
  voiceId: string;
  text: string;
  language: Locale;
  model?: string; // 기본 aiConfig.voice.defaultModel(sona_speech_2)
  style?: string; // 감정 스타일(선택 음성의 styles 중 하나)
  settings?: VoiceSettings;
}

export interface TtsResult {
  blob: Blob;
  seconds: number;
}

export interface SupertoneVoice {
  voiceId: string;
  name: string;
  gender?: string;
  age?: string;
  language: string[];
  styles: string[];
  models?: string[];
}

// 실제 Supertone 하위경로는 ?path= 쿼리로 넘긴다(고정 경로 하나만 씀 — api/supertone.ts 참고,
// 다단계 catch-all 라우팅이 Vercel 배포에서 깨지는 걸 확인해 이 방식으로 통일했다).
function proxyUrl(subpath: string, query?: Record<string, string>): string {
  const qs = new URLSearchParams({ path: subpath, ...query });
  return `${aiConfig.voice.proxyBase}?${qs.toString()}`;
}

async function errorMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Supertone 키가 올바르지 않습니다.';
  if (res.status === 402) return 'Supertone 크레딧이 부족합니다.';
  if (res.status === 429) return 'Supertone 요청이 너무 잦습니다(레이트 리밋) — 잠시 후 다시 시도하세요.';
  try {
    const j = await res.json();
    if (j?.error) return `Supertone 오류: ${typeof j.error === 'string' ? j.error : JSON.stringify(j.error)}`;
  } catch {
    /* 응답이 JSON 이 아니면 무시(예: 바이너리) */
  }
  return `Supertone 요청 실패 (HTTP ${res.status})`;
}

/** 한 줄 텍스트를 음성으로 합성. 결과 오디오는 호출측이 재생만 하고 저장은 하지 않는다(테스트 전용). */
export async function supertoneTTS(params: TtsParams, apiKey: string): Promise<TtsResult> {
  const { voiceId, text, language, model, style, settings } = params;
  const body: Record<string, unknown> = {
    text,
    language,
    model: model || aiConfig.voice.defaultModel,
    output_format: 'mp3',
  };
  if (style) body.style = style;
  if (settings) {
    body.voice_settings = {
      ...(settings.speed !== undefined ? { speed: settings.speed } : {}),
      ...(settings.pitchShift !== undefined ? { pitch_shift: settings.pitchShift } : {}),
      ...(settings.pitchVariance !== undefined ? { pitch_variance: settings.pitchVariance } : {}),
      ...(settings.textGuidance !== undefined ? { text_guidance: settings.textGuidance } : {}),
    };
  }

  const res = await fetch(proxyUrl(`text-to-speech/${voiceId}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sup-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const blob = await res.blob();
  const seconds = Number(res.headers.get('X-Audio-Length')) || 0;
  return { blob, seconds };
}

/** 음성 목록 검색(드롭다운용). language/style 은 콤마 구분 OR 조건. */
export async function searchVoices(
  opts: { language?: Locale; style?: string; pageSize?: number },
  apiKey: string,
): Promise<SupertoneVoice[]> {
  const query: Record<string, string> = { page_size: String(opts.pageSize ?? 50) };
  if (opts.language) query.language = opts.language;
  if (opts.style) query.style = opts.style;

  const res = await fetch(proxyUrl('voices/search', query), {
    headers: { 'x-sup-api-key': apiKey },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const j = await res.json();
  const items = Array.isArray(j?.items) ? j.items : [];
  return items.map(
    (v: Record<string, unknown>): SupertoneVoice => ({
      voiceId: String(v.voice_id ?? v.voiceId ?? ''),
      name: String(v.name ?? '(이름 없음)'),
      gender: typeof v.gender === 'string' ? v.gender : undefined,
      age: typeof v.age === 'string' ? v.age : undefined,
      language: Array.isArray(v.language) ? v.language.map(String) : [],
      styles: Array.isArray(v.styles) ? v.styles.map(String) : [],
      models: Array.isArray(v.models) ? v.models.map(String) : undefined,
    }),
  );
}

/** 남은 크레딧 조회(선택 — 표시용). 실패해도 테스트 자체는 계속 가능해야 하므로 호출측이 에러를 삼켜도 된다. */
export async function getCredits(apiKey: string): Promise<number> {
  const res = await fetch(proxyUrl('credits'), { headers: { 'x-sup-api-key': apiKey } });
  if (!res.ok) throw new Error(await errorMessage(res));
  const j = await res.json();
  return Number(j?.creditBalance ?? j?.credit_balance ?? 0);
}
