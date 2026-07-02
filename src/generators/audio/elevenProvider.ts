// ElevenLabs Music(Eleven Music) BGM 생성 — 브라우저 직접 호출(BYO 토큰, 기존 NovelAI/OpenAI 와 동일 방식).
//
// 선정 이유(음악 생성 AI 비교 결과)
//  - 공식 API 제공(Suno/Udio 는 공식 API 없음 → 서드파티 리셀러만 존재, 법적 불확실).
//  - 라이선스 음원으로 학습 → 게임 포함 상업적 사용 허가(유료 플랜). 상업 배포 VN 에 법적으로 가장 안전.
//  - 동기(synchronous) REST: 요청 1번에 오디오 바이너리를 바로 반환 → 폴링/작업ID 불필요(매우 단순).
//  - force_instrumental 로 가사 없는 BGM 보장(우리 요구와 정확히 일치).
//
// 설계 메모
//  - force_instrumental 은 true 고정(가사 없는 게임 BGM). 인증 헤더는 'xi-api-key'(Bearer 아님).
//  - CORS: 개발(Vite)에선 '/eleven' 프록시로 우회(배포에선 ElevenLabs 가 CORS 를 허용해야 하며, 아니면 dev 한정).
//  - BGM 은 앱 전체가 .wav 로 다루므로(renpy/generate·zip), 응답을 항상 WAV 로 만들어 그대로 흘려보낸다.
//    기본은 raw PCM(pcm_44100)을 받아 WAV 헤더만 붙인다 → 손실 mp3 인코딩·AudioContext 디코딩을 모두 건너뛴다(음질↑).
//    (mp3/opus 등 컨테이너 포맷으로 바꾸면 decodeAudioData 폴백으로 트랜스코드한다.)

import { aiConfig } from '../../config/aiConfig';
import { encodeWav } from './synthProvider';

/** 개발 모드에선 Vite dev proxy('/eleven')로, 배포에선 실제 host 로 보낸다(CORS 우회). */
function apiBase(): string {
  return import.meta.env.DEV ? '/eleven' : aiConfig.audio.eleven.host;
}

function elevenErrorMessage(status: number, detail: string): string {
  const head = `ElevenLabs Music 생성 실패 (HTTP ${status})`;
  if (status === 401) return `${head}: 토큰이 올바르지 않습니다. ElevenLabs API 키(xi-api-key)를 확인하세요.`;
  if (status === 403) return `${head}: 권한이 없습니다(무료 플랜은 음악 생성/상업 사용이 제한됩니다). 유료 플랜을 확인하세요.`;
  if (status === 422) return `${head}: 요청 파라미터 오류${detail ? ` — ${detail}` : ''}.`;
  if (status === 429) return `${head}: 크레딧 부족 또는 요청 제한입니다. 잠시 후 다시 시도하세요.`;
  return detail ? `${head}: ${detail}` : head;
}

/** mp3(또는 임의 오디오) 바이너리 → 16bit PCM WAV(기존 BGM 파이프라인과 동일 포맷). */
async function transcodeToWav(buf: ArrayBuffer): Promise<Blob> {
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    // decodeAudioData 는 버퍼를 detach 하므로 재사용하지 않는다.
    const audioBuffer = await ctx.decodeAudioData(buf);
    return encodeWav(audioBuffer);
  } catch (e) {
    throw new Error(`ElevenLabs 오디오 디코딩 실패(지원되지 않는 포맷일 수 있음). (${(e as Error).message})`);
  } finally {
    void ctx.close();
  }
}

/** 출력 포맷 문자열('pcm_44100')에서 샘플레이트(Hz)를 뽑는다. 못 읽으면 44100. */
function pcmSampleRate(fmt: string): number {
  const m = /^pcm_(\d+)/.exec(fmt);
  return m ? Number(m[1]) : 44100;
}

/**
 * raw PCM 은 헤더가 없어 채널 수(모노/스테레오)를 알 수 없다. 요청 길이·샘플레이트로 "채널당 기대 샘플 수"를
 * 구해 실제 바이트 길이와 비교해 추정한다 — 모노(≈1배)와 스테레오(≈2배)는 차이가 2배라 길이 오차에 안전하다.
 * (하드코딩 대신 응답 실측으로 판정 → music 이 스테레오여도 재생 속도/피치가 깨지지 않는다.)
 */
function inferPcmChannels(byteLength: number, sampleRate: number, lengthMs: number): number {
  const totalSamples = byteLength / 2; // 16bit LE
  const perChannel = sampleRate * (lengthMs / 1000);
  const ratio = perChannel > 0 ? totalSamples / perChannel : 1;
  return ratio >= 1.5 ? 2 : 1; // 1.5 임계 → 길이 ±50% 오차까지 오판 없음
}

/** 헤더 없는 16bit LE PCM(raw) → WAV Blob. 손실 mp3·AudioContext 없이 헤더 44바이트만 붙인다. */
function pcmToWav(pcm: ArrayBuffer, sampleRate: number, channels: number): Blob {
  const blockAlign = channels * 2; // 16bit
  const dataSize = pcm.byteLength;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(ab, 44).set(new Uint8Array(pcm)); // 이미 16bit 정수라 변환 없이 그대로 복사
  return new Blob([ab], { type: 'audio/wav' });
}

export interface ElevenBgmResult {
  /** WAV 로 트랜스코드된 BGM(기존 .wav 파이프라인 호환). */
  blob: Blob;
}

/**
 * 프롬프트(분위기/장면) 텍스트 → instrumental BGM(WAV). 동기 호출 — 폴링 없이 한 번에 오디오를 받는다.
 * 영어 서술이 가장 잘 먹지만(예: "warm lo-fi piano, gentle rain, slow tempo"), 자연어 프롬프트를 그대로 받는다.
 */
export async function elevenGenerateBgm(
  prompt: string,
  opts: { apiKey: string; lengthMs?: number; model?: string },
): Promise<ElevenBgmResult> {
  const p = prompt.trim();
  if (!p) throw new Error('BGM 프롬프트(분위기) 텍스트가 비어 있습니다.');
  const apiKey = opts.apiKey.trim();
  if (!apiKey) throw new Error('ElevenLabs API 키가 필요합니다.');

  const cfg = aiConfig.audio.eleven;
  // 길이는 3,000~600,000ms 범위로 클램프(스펙 제약).
  const lengthMs = Math.max(3000, Math.min(600000, Math.round(opts.lengthMs ?? cfg.lengthMs)));
  const body = {
    prompt: p,
    model_id: opts.model || cfg.model,
    music_length_ms: lengthMs,
    force_instrumental: true, // 가사 없는 게임 BGM 보장(고정)
  };
  const url = `${apiBase()}${cfg.composePath}?output_format=${encodeURIComponent(cfg.outputFormat)}`;

  console.info('%c[ElevenLabs] music (BGM 생성 → 크레딧 소모)', 'color:#a78bfa', {
    model: body.model_id,
    lengthMs,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `ElevenLabs Music 호출 실패(네트워크/CORS). 개발 중이면 Vite dev 서버(프록시)에서 실행 중인지 확인하세요. (${(e as Error).message})`,
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
    throw new Error(elevenErrorMessage(res.status, String(detail)));
  }

  // 동기 응답: 오디오 바이너리가 그대로 온다(작업ID·폴링 없음).
  const audio = await res.arrayBuffer();
  if (audio.byteLength === 0) throw new Error('ElevenLabs 응답 오디오가 비어 있습니다(0바이트).');

  // 기본(pcm_*): raw PCM → WAV 헤더만 붙임(손실/디코딩 없음). 그 외 컨테이너 포맷은 decodeAudioData 폴백.
  if (cfg.outputFormat.startsWith('pcm_')) {
    const sr = pcmSampleRate(cfg.outputFormat);
    const channels = inferPcmChannels(audio.byteLength, sr, lengthMs);
    console.info('%c[ElevenLabs] PCM→WAV (무손실 랩)', 'color:#a78bfa', {
      sampleRate: sr,
      channels,
      bytes: audio.byteLength,
    });
    return { blob: pcmToWav(audio, sr, channels) };
  }
  return { blob: await transcodeToWav(audio) };
}
