// 검증용: 샘플 → 전체 승인 → generateRenpyFiles 의 텍스트 .rpy 를 실제 폴더에 쓰고,
// 참조되는 이미지/폰트는 스텁으로 채운 뒤 Ren'Py lint 를 돌릴 수 있게 한다.
// (메뉴/배경 PNG 는 평소 브라우저 Canvas 가 만들지만, lint 는 파일 존재만 보면 되므로 1x1 스텁으로 충분.)
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseText } from '../src/parser/parseText';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject } from '../src/types';
import { SAMPLE_STORY } from '../src/sample';

const OUT = join(process.cwd(), '.lint-tmp');
const GAME = join(OUT, 'game');

// 1x1 투명 PNG
const PNG_STUB = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(GAME, { recursive: true });

const genre = (process.argv[2] as any) || 'romance';
const { scenes, characters } = parseText(SAMPLE_STORY);
const project = {
  ...emptyProject(),
  genre,
  scenes: scenes.map((s) => ({ ...s, status: 'approved' as const })),
  characters,
};

// 3번째 인자(분위기)가 있으면 오프라인 AI 테마를 적용해 검증.
const mood = process.argv[3];
if (mood) {
  const { generateTheme } = await import('../src/generators/theme');
  const { contrastReport } = await import('../src/generators/theme/buildTheme');
  const g = await generateTheme({ project, mood, apiKey: undefined });
  project.guiTheme = g.theme;
  const cr = contrastReport(g.theme);
  console.log(
    `테마(${g.source}) "${g.theme.label}" accent=${g.theme.accent} bgTop=${g.theme.bgTop} ` +
      `| 대비 대사=${cr.dialogue.toFixed(2)} 이름=${cr.name.toFixed(2)}`,
  );
}

const { files } = generateRenpyFiles(project);

// 텍스트 파일 쓰기
for (const f of files) {
  const p = join(OUT, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content, 'utf8');
}

// 참조되는 이미지 경로(`"images/..png"`, `"gui/..png"`)를 스캔해 스텁 생성
const allText = files.map((f) => f.content).join('\n');
const imgRefs = new Set<string>();
for (const m of allText.matchAll(/"((?:images|gui)\/[^"]+\.png)"/g)) imgRefs.add(m[1]);
// gui.main_menu_background = "gui/main_menu.png" 등 define 형태도 포함됨
for (const rel of imgRefs) {
  const p = join(GAME, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, PNG_STUB);
}

// 오디오 스텁(짧은 무음 WAV) — `play music "audio/..wav"` 참조분.
function silentWav(samples = 8000): Buffer {
  const data = Buffer.alloc(samples).fill(128); // 8-bit unsigned 무음 = 128
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24); // sample rate
  header.writeUInt32LE(8000, 28); // byte rate
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
// BGM 은 이제 업로드본만 있어(생성 폴백 없음) 보통 audio 참조가 없지만, 방어적으로 wav/mp3 모두 스텁한다.
const wavRefs = new Set<string>();
for (const m of allText.matchAll(/"(audio\/[^"]+\.(?:wav|mp3))"/g)) wavRefs.add(m[1]);
for (const rel of wavRefs) {
  const p = join(GAME, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, silentWav());
}

// 한글 폰트 — gui.text_font 가 참조. public 에서 복사.
const fontSrc = join(process.cwd(), 'public', 'fonts', 'NanumGothic.ttf');
const fontDst = join(GAME, 'fonts', 'NanumGothic.ttf');
mkdirSync(dirname(fontDst), { recursive: true });
if (existsSync(fontSrc)) copyFileSync(fontSrc, fontDst);

console.log(`생성 완료: ${OUT}`);
console.log(`테마: ${genre} · 이미지 스텁 ${imgRefs.size}개 · 폰트 ${existsSync(fontDst) ? 'OK' : '없음'}`);
// lint 는 파일 존재만 보고 내용은 안 보므로, 여기서 1x1 PNG 로 "가짜로 채운" 참조를 숨기지 않고
// 명시적으로 나열한다 — 안 그러면 lint 통과가 "진짜 에셋이 다 있다"는 착각을 준다(CLAUDE.md:
// "lint 통과 ≠ 동작"). 진짜 파일 존재 검증은 tests/zip-asset-invariant.test.ts 가 담당한다.
console.log(`\n=== 스텁(1x1 PNG)으로 가짜로 채운 이미지 참조 ${imgRefs.size}개 — 실제 에셋 아님 ===`);
console.log([...imgRefs].sort().join('\n'));
