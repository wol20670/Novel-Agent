// BGM 무드 프리셋. 프롬프트 키워드로 분위기를 고른다.

export type WaveType = OscillatorType;

export interface Mood {
  key: string;
  name: string;
  bpm: number;
  /** 반음 단위 코드 진행 (루트로부터의 오프셋 배열의 배열). */
  progression: number[][];
  /** 루트 음 주파수(Hz). */
  root: number;
  lead: WaveType;
  pad: WaveType;
  /** 멜로디 활성 여부. */
  arpeggio: boolean;
}

const MOODS: Mood[] = [
  {
    key: 'piano',
    name: '모던 피아노',
    bpm: 72,
    root: 261.63, // C4
    progression: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], // I vi IV V 느낌
    lead: 'triangle',
    pad: 'sine',
    arpeggio: true,
  },
  {
    key: 'rain',
    name: '비 오는 감성',
    bpm: 60,
    root: 220.0, // A3
    progression: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
    lead: 'sine',
    pad: 'sine',
    arpeggio: true,
  },
  {
    key: 'citypop',
    name: '시티팝',
    bpm: 104,
    root: 293.66, // D4
    progression: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9], [-2, 2, 5, 9]],
    lead: 'sawtooth',
    pad: 'triangle',
    arpeggio: true,
  },
  {
    key: 'mystery',
    name: '미스터리',
    bpm: 80,
    root: 246.94, // B3
    progression: [[0, 3, 6], [-1, 2, 5], [0, 4, 7], [-2, 1, 6]],
    lead: 'square',
    pad: 'sawtooth',
    arpeggio: false,
  },
  {
    key: 'dream',
    name: '몽환 패드',
    bpm: 66,
    root: 196.0, // G3
    progression: [[0, 4, 7, 11], [2, 5, 9, 12], [-3, 0, 4, 7], [-1, 2, 7, 11]],
    lead: 'sine',
    pad: 'sine',
    arpeggio: false,
  },
];

export function pickMood(prompt: string): Mood {
  const p = (prompt || '').toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => p.includes(w.toLowerCase()));
  // 밝은/아침 신호를 먼저 확인해 "비추는"(=빛나는) 같은 오탐을 막는다.
  if (has('아침', '맑', '햇살', '따뜻', 'morning', '피아노', 'piano')) return moodByKey('piano');
  // rain 은 '비'만으로는 너무 광범위 → 더 구체적인 토큰만 매칭.
  if (has('비가', '비 오', '빗', '눈물', '슬픔', '우울', 'rain')) return moodByKey('rain');
  if (has('시티', 'citypop', '도시', '거리', '상가', '활기')) return moodByKey('citypop');
  if (has('미스터리', '긴장', '불안', 'mystery', '어둠', '밤')) return moodByKey('mystery');
  if (has('몽환', '꿈', 'dream', '환상', '패드')) return moodByKey('dream');
  return moodByKey('piano');
}

export function moodByKey(key: string): Mood {
  return MOODS.find((m) => m.key === key) ?? MOODS[0];
}

export const ALL_MOODS = MOODS;
