// 검증용(임시): voiceLocales 2개 + 첫 대사에 voiced=true 를 넣어 voices.rpy·vo()·설정화면
// 음성 언어 라디오가 실제로 나오는지, lint 가 통과하는지 확인한다. gen-lint.ts 와 동일 패턴.
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseText } from '../src/parser/parseText';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject } from '../src/types';
import { SAMPLE_STORY } from '../src/sample';

const OUT = join(process.cwd(), '.lint-tmp-voice');
const GAME = join(OUT, 'game');
const PNG_STUB = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(GAME, { recursive: true });

const { scenes, characters } = parseText(SAMPLE_STORY);
let firstVoiced = false;
const project = {
  ...emptyProject(),
  genre: 'romance' as const,
  baseLocale: 'ko' as const,
  textLocales: ['ko'] as const,
  voiceLocales: ['ko', 'ja'] as const, // 자막은 ko 단일, 음성은 ko/ja 두 개(교차 선택 시나리오).
  scenes: scenes.map((s) => ({
    ...s,
    status: 'approved' as const,
    lines: s.lines.map((l) => {
      if (!firstVoiced && l.kind === 'dialogue' && !l.members?.length) {
        firstVoiced = true;
        return { ...l, voiced: true };
      }
      return l;
    }),
  })),
  characters,
};

const { files } = generateRenpyFiles(project as any);
for (const f of files) {
  const p = join(OUT, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content, 'utf8');
}

const allText = files.map((f) => f.content).join('\n');
const imgRefs = new Set<string>();
for (const m of allText.matchAll(/"((?:images|gui)\/[^"]+\.png)"/g)) imgRefs.add(m[1]);
for (const rel of imgRefs) {
  const p = join(GAME, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, PNG_STUB);
}

const fontSrc = join(process.cwd(), 'public', 'fonts', 'NanumGothic.ttf');
const fontDst = join(GAME, 'fonts', 'NanumGothic.ttf');
mkdirSync(dirname(fontDst), { recursive: true });
if (existsSync(fontSrc)) copyFileSync(fontSrc, fontDst);

console.log(`생성 완료: ${OUT}`);
console.log(`voices.rpy 존재:`, files.some((f) => f.path === 'game/voices.rpy'));
console.log(`첫 voiced 라인 emit 확인용 script.rpy 발췌:`);
const scriptFile = files.find((f) => f.path === 'game/script.rpy');
const voLine = scriptFile?.content.split('\n').find((l) => l.includes('vo('));
console.log(voLine ?? '(vo() 호출 없음 — 문제)');
