// ElevenLabs 다국어 성우(TTS) — 브라우저 직접 호출(BYO 토큰, BGM/NovelAI 와 동일 방식).
//
// 설계 메모
//  - BGM(elevenProvider)과 같은 키(na_eleven_key)·'/eleven' 프록시·xi-api-key 를 공유한다.
//  - 모델 = eleven_multilingual_v2: 넣어준 텍스트의 "언어를 자동 감지"하므로, 해당 로케일 텍스트를
//    그대로 보내면 그 언어로 발화한다(자막 언어와 독립 — 교차 선택 가능).
//  - 캐릭터별 voice_id 는 코드가 아니라 프로젝트 데이터(Character.voiceIds[locale])에 둔다.
//  - 음성은 신규 파이프라인이라 mp3 를 그대로 쓴다(Ren'Py voice 는 mp3 재생 OK — WAV 트랜스코드 불필요).
//  - 크레딧은 Music 과 공유 → 라인 opt-in(Line.voiced)으로만 생성한다(비용 안전장치). 배치는 순차 실행.

import { aiConfig } from '../../config/aiConfig';
import type { Locale } from '../../types';

/** 개발 모드에선 Vite dev proxy('/eleven')로, 배포에선 실제 host 로 보낸다(CORS 우회). */
function apiBase(): string {
  return import.meta.env.DEV ? '/eleven' : aiConfig.audio.eleven.host;
}

/** Ren'Py 참조용 결정적 base 이름(언어·확장자 없음). vo("...") 와 zip 경로가 이걸 공유한다. */
export function voiceBaseName(charId: string, sceneLabel: string, lineIdx: number): string {
  return `${charId}_${sceneLabel}_${String(lineIdx).padStart(3, '0')}`;
}

/** base + 로케일 → Ren'Py game/ 기준 상대 경로(voices/<lang>/<base>.mp3). zip 빌더가 이 경로에 쓴다. */
export function voiceRelPath(base: string, locale: Locale): string {
  return `voices/${locale}/${base}.mp3`;
}

function elevenVoiceError(status: number, detail: string): string {
  const head = `ElevenLabs 음성 생성 실패 (HTTP ${status})`;
  if (status === 401) return `${head}: 토큰이 올바르지 않습니다. ElevenLabs API 키(xi-api-key)를 확인하세요.`;
  if (status === 403) return `${head}: 권한이 없습니다(플랜/음성 접근 제한). 유료 플랜·voice_id 접근 권한을 확인하세요.`;
  if (status === 404) return `${head}: voice_id 를 찾을 수 없습니다. 캐릭터별 voice_id 를 확인하세요.`;
  if (status === 422) return `${head}: 요청 파라미터 오류${detail ? ` — ${detail}` : ''}.`;
  if (status === 429) return `${head}: 크레딧 부족 또는 요청 제한입니다. 잠시 후 다시 시도하세요.`;
  return detail ? `${head}: ${detail}` : head;
}

/** 성우 음성 1건의 생성 대상(캐릭터·장면·라인·언어). */
export interface VoiceJob {
  /** Ren'Py 캐릭터 id(c_1 …) — 파일명·vo() base 에 쓰인다. */
  charId: string;
  /** 사람이 읽는 캐릭터 이름(에러 메시지·에셋 메타용). */
  charName: string;
  /** 이 (캐릭터, 언어)의 ElevenLabs voice_id. */
  voiceId: string;
  /** 장면 라벨(scene_1 …) — 파일명 결정적화. */
  sceneLabel: string;
  /** 장면 내 라인 인덱스. */
  lineIdx: number;
  /** 발화 언어. */
  locale: Locale;
  /** 이 언어의 텍스트(원문 또는 번역 검수본). */
  text: string;
}

export interface VoiceResult extends VoiceJob {
  /** mp3 오디오(트랜스코드 없이 그대로). */
  blob: Blob;
  /** Ren'Py game/ 기준 상대 경로(zip 빌더가 이 경로에 기록). */
  relPath: string;
}

/**
 * 한 (캐릭터·라인·언어)의 성우 음성을 생성한다. 동기 응답(오디오 바이너리 즉시 반환).
 * multilingual_v2 는 텍스트에서 언어를 자동 감지하므로 locale 별 텍스트를 그대로 보낸다.
 */
export async function elevenGenerateVoice(job: VoiceJob, apiKey: string): Promise<VoiceResult> {
  const key = apiKey.trim();
  if (!key) throw new Error('ElevenLabs API 키가 필요합니다.');
  if (!job.voiceId) throw new Error(`캐릭터 '${job.charName}' 의 ${job.locale} voice_id 가 지정되지 않았습니다.`);
  const text = job.text.trim();
  if (!text) throw new Error('음성으로 만들 텍스트가 비어 있습니다.');

  const cfg = aiConfig.audio.elevenVoice;
  const url = `${apiBase()}${cfg.ttsPathPrefix}/${encodeURIComponent(job.voiceId)}?output_format=${encodeURIComponent(
    cfg.outputFormat,
  )}`;
  const body = {
    text,
    model_id: cfg.model,
    voice_settings: cfg.voiceSettings,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key, Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `ElevenLabs 음성 호출 실패(네트워크/CORS). 개발 중이면 Vite dev 서버(프록시)에서 실행 중인지 확인하세요. (${
        (e as Error).message
      })`,
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.detail?.message || j?.detail || j?.message || '';
      if (typeof detail === 'object') detail = JSON.stringify(detail);
    } catch {
      /* 본문이 JSON 이 아닐 수 있음(오디오/텍스트) */
    }
    throw new Error(elevenVoiceError(res.status, String(detail)));
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error('ElevenLabs 음성 응답이 비어 있습니다(0바이트).');
  const base = voiceBaseName(job.charId, job.sceneLabel, job.lineIdx);
  return { ...job, blob: new Blob([buf], { type: 'audio/mpeg' }), relPath: voiceRelPath(base, job.locale) };
}

/**
 * 잡 목록을 순차 실행한다(레이트리밋 완화 + 진행률 표시). 실패한 잡은 예외로 중단되므로
 * 호출 측이 재시도/부분성공 정책을 정한다. 각 완료마다 onProgress(done, total) 호출.
 */
export async function runVoiceBatch(
  jobs: VoiceJob[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<VoiceResult[]> {
  const out: VoiceResult[] = [];
  for (let i = 0; i < jobs.length; i++) {
    out.push(await elevenGenerateVoice(jobs[i], apiKey));
    onProgress?.(i + 1, jobs.length);
  }
  return out;
}
