// 순수 로직 검증: 샘플 파싱 → 전체 승인 → Ren'Py 스크립트 생성.
import { parseText } from '../src/parser/parseText';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject } from '../src/types';
import { SAMPLE_STORY } from '../src/sample';

const { scenes, characters } = parseText(SAMPLE_STORY);
const project = {
  ...emptyProject(),
  scenes: scenes.map((s) => ({ ...s, status: 'approved' as const })),
  characters,
};

console.log('=== 장면', scenes.length, '· 캐릭터', characters.length, '===');
for (const s of scenes) {
  console.log(
    `· "${s.title}" bg=${s.background ?? '-'} bgm=${s.bgm ?? '-'} 대사=${s.lines.length} 선택지=${s.choices.length} 점프=${s.jumpTo ?? '-'}`,
  );
}

const { files } = generateRenpyFiles(project);
const script = files.find((f) => f.path === 'game/script.rpy')!;
console.log('\n===== script.rpy =====\n');
console.log(script.content);

// 간단 단언
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else console.log('✅', msg);
};
console.log('\n===== 검증 =====');
assert(scenes.length === 5, '장면 5개 파싱');
assert(characters.some((c) => c.name === '배민규'), '배민규 캐릭터 수집');
assert(/menu:/.test(script.content), 'menu 블록 생성');
assert(/jump scene_/.test(script.content), 'jump 생성');
// 동명 "밤, 상가거리" → 점프는 분기 이후(수렴) 장면으로 resolve 되어야 함(자기 자신/이전 루프 금지)
const jumpLines = script.content.split('\n').filter((l) => l.trim().startsWith('jump scene_'));
console.log('jump 라인들:', jumpLines.map((l) => l.trim()));
