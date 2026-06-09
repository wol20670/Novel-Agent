import { pickMood } from '../src/generators/audio/moods';
const cases: [string,string][] = [
  ['morning_breeze 맑은 아침, 운동장 햇살이 환하게 비추는 상쾌한 아침', 'piano'],
  ['city_night 밤, 상가거리 슬로우 줌인', 'citypop'],
  ['어둠 속 긴장된 밤', 'mystery'],
  ['비가 내리는 거리', 'rain'],
  ['몽환적인 꿈속', 'dream'],
];
let ok = true;
for (const [p, want] of cases) {
  const m = pickMood(p);
  const pass = m.key === want;
  ok = ok && pass;
  console.log(pass?'✅':'❌', `"${p.slice(0,18)}…" → ${m.name}(${m.key}) 기대=${want}`);
}
process.exitCode = ok?0:1;
