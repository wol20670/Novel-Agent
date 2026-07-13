// 검증용: 장면 "중간"의 #CG 배경 전환 — 그 지점부터 배경=CG(블러 백드롭 합성), 스프라이트
// 등장·재배치 억제(장면 끝까지), 대사는 계속, 다음 CG 는 배경만 교체, 다음 장면은 정상 복귀.
// gen-lint 처럼 실제 폴더(.lint-tmp/cg)에 써서 `renpy.exe .lint-tmp/cg lint` 를 돌릴 수 있다.
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseText } from '../src/parser/parseText';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject } from '../src/types';

const STORY = `장면: 교실 아침
배경: 아침 햇살 교실

한지수(기쁨): 좋은 아침! 오늘도 힘내자.
강민주: 나도 방금 왔어.
CG: 창가에서 마주본 두 사람
한지수: 이 순간을 오래 기억하고 싶어.
강민주: 나도 그래.
CG: 노을이 지는 교실
한지수: 벌써 노을이 지네.

장면: 다음 날
배경: 학교 운동장
강민주: 어제는 고마웠어.
`;

const { scenes, characters } = parseText(STORY);
const project = {
  ...emptyProject(),
  scenes: scenes.map((s) => ({ ...s, status: 'approved' as const })),
  // 더미 assetId 로 스프라이트 보유 캐릭터로 만들어 "CG 이후 show 억제"까지 검증한다.
  characters: characters.map((c) =>
    c.isProtagonist ? c : { ...c, expressions: { 기본: 'stub' } },
  ),
};

const { files } = generateRenpyFiles(project);
const script = files.find((f) => f.path.endsWith('game/script.rpy'))!.content;
const assets = files.find((f) => f.path.endsWith('game/assets.rpy'))!.content;
const s1 = script.slice(script.indexOf('label scene_1:'), script.indexOf('label scene_2:'));
const s2 = script.slice(script.indexOf('label scene_2:'), script.indexOf('label _vn_end:'));

let fail = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
};

const firstCg = s1.indexOf('scene cg_1_scene with dissolve');
const secondCg = s1.indexOf('scene cg_2_scene with dissolve');
check('CG 이전엔 스프라이트 show 정상 방출', firstCg > 0 && s1.slice(0, firstCg).includes('show c_'));
check('첫 #CG 위치에서 scene cg_1_scene 방출', firstCg >= 0);
check('둘째 #CG 는 배경만 다음 CG 로 교체', secondCg > firstCg);
check('CG 이후 스프라이트 show 억제', s1.lastIndexOf('show c_') < firstCg);
check('CG 뒤에도 대사 계속(팝업 pause 없음)', !s1.includes('pause') && s1.indexOf('이 순간을') > firstCg);
check('다음 장면은 정상 복귀(배경+스프라이트)', s2.includes('scene bg_2 at vn_bg') && s2.includes('show c_'));
check('블러 백드롭 합성 이미지 정의', assets.includes('image cg_1_scene = Fixed(At('));
check('블러 transform 정의', script.includes('transform vn_cg_backdrop:') && script.includes('blur 24'));

// ── 실제 lint 용 폴더 쓰기 (gen-lint.ts 와 동일 패턴) ──
const OUT = join(process.cwd(), '.lint-tmp', 'cg');
const GAME = join(OUT, 'game');
const PNG_STUB = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(GAME, { recursive: true });
for (const f of files) {
  const p = join(OUT, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content, 'utf8');
}
const allText = files.map((f) => f.content).join('\n');
for (const m of allText.matchAll(/"((?:images|gui)\/[^"]+\.png)"/g)) {
  const p = join(GAME, m[1]);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, PNG_STUB);
}
const fontSrc = join(process.cwd(), 'public', 'fonts', 'NanumGothic.ttf');
const fontDst = join(GAME, 'fonts', 'NanumGothic.ttf');
mkdirSync(dirname(fontDst), { recursive: true });
if (existsSync(fontSrc)) copyFileSync(fontSrc, fontDst);

console.log(`\nlint 대상 생성: ${OUT}`);
console.log(fail ? `\n❌ ${fail}개 실패` : '\n✅ CG 배경 전환 검증 통과');
process.exit(fail ? 1 : 0);
