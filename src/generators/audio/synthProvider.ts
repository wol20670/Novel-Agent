// Web Audio(OfflineAudioContext) 로 무드 기반 루프형 BGM 을 렌더하고 WAV 로 인코딩한다.
// 서버·API 불필요. v1 의 유일한 실제 BGM provider.

import { pickMood, moodByKey, type Mood } from './moods';

export interface SynthOptions {
  seconds?: number; // 길이(초)
  volume?: number; // 0~1
  bpm?: number; // 무드 기본값 덮어쓰기
  moodKey?: string; // 특정 무드 강제
}

function semitone(root: number, n: number): number {
  return root * Math.pow(2, n / 12);
}

/** 단일 음을 ADSR 엔벨로프로 스케줄. */
function note(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  start: number,
  dur: number,
  gain: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const a = 0.02;
  const r = Math.min(0.5, dur * 0.5);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + a);
  g.gain.setValueAtTime(gain, start + Math.max(a, dur - r));
  g.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(g).connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function renderMood(ctx: OfflineAudioContext, mood: Mood, opts: Required<SynthOptions>) {
  const master = ctx.createGain();
  master.gain.value = opts.volume;
  // 부드러운 저역 통과로 합성 톤을 덜 거칠게
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  master.connect(lp).connect(ctx.destination);

  const beat = 60 / opts.bpm;
  const barLen = beat * 4;
  const bars = Math.ceil(opts.seconds / barLen);

  for (let bar = 0; bar < bars; bar++) {
    const chord = mood.progression[bar % mood.progression.length];
    const t0 = bar * barLen;
    if (t0 >= opts.seconds) break;

    // 패드(코드 지속음)
    for (const n of chord) {
      note(ctx, master, mood.pad, semitone(mood.root, n), t0, barLen * 0.98, 0.05);
    }
    // 베이스
    note(ctx, master, 'sine', semitone(mood.root / 2, chord[0]), t0, beat * 0.9, 0.12);
    note(ctx, master, 'sine', semitone(mood.root / 2, chord[0]), t0 + beat * 2, beat * 0.9, 0.1);

    // 아르페지오 멜로디
    if (mood.arpeggio) {
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const n = chord[(s + bar) % chord.length] + (s % 4 === 3 ? 12 : 0);
        const st = t0 + (s * barLen) / steps;
        if (st >= opts.seconds) break;
        note(ctx, master, mood.lead, semitone(mood.root, n), st, (barLen / steps) * 0.9, 0.07);
      }
    }
  }
}

/** AudioBuffer → 16bit PCM WAV Blob. synth 렌더 결과와 ElevenLabs mp3 트랜스코드 결과가 공용으로 쓴다. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
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
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export interface SynthResult {
  blob: Blob;
  moodKey: string;
  moodName: string;
}

export async function synthBgm(prompt: string, options: SynthOptions = {}): Promise<SynthResult> {
  const mood = options.moodKey ? moodByKey(options.moodKey) : pickMood(prompt);
  const opts: Required<SynthOptions> = {
    seconds: options.seconds ?? 16,
    volume: options.volume ?? 0.8,
    bpm: options.bpm ?? mood.bpm,
    moodKey: mood.key,
  };
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * opts.seconds), sr);
  renderMood(ctx, mood, opts);
  const buffer = await ctx.startRendering();
  return { blob: encodeWav(buffer), moodKey: mood.key, moodName: mood.name };
}
