// 로맨스(또는 인자 장르) Ren'Py ZIP 을 실제 생성기로 빌드한다.
// 텍스트 .rpy 는 node(generateRenpyFiles), 바이너리(배경/CG/BGM/스프라이트/메뉴아트)는
// 실제 브라우저 생성기를 헤드리스 Chromium 에서 돌려 만든다(앱과 동일 코드 경로).
// 빌드 후 .romance-build 로 풀어 Ren'Py lint 까지 돌려 실행 가능성을 확인한다.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseText } from '../src/parser/parseText';
import { generateRenpyFiles } from '../src/renpy/generate';
import { resolveTheme } from '../src/renpy/gui';
import { buttonBgAssets } from '../src/generators/image/canvasMenu';
import { emptyProject, type Project } from '../src/types';
import { SAMPLE_STORY } from '../src/sample';

const genre = (process.argv[2] as Project['genre']) || 'romance';

const { scenes, characters } = parseText(SAMPLE_STORY);
const project: Project = {
  ...emptyProject(),
  genre,
  scenes: scenes.map((s) => ({ ...s, status: 'approved' as const })),
  characters,
};

const { files, refs, sprites } = generateRenpyFiles(project);
const theme = resolveTheme(project.genre, project.guiTheme);
const { width: W, height: H } = project;

// 브라우저 생성기 번들 → window.Gen
const bundled = await build({
  entryPoints: ['scripts/browserGen.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'Gen',
  write: false,
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: bundled.outputFiles[0].text });
await page.addScriptTag({
  content: `window.toB64 = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  };`,
});

// 수집한 모든 파일(텍스트+바이너리)
const out: { path: string; data: Buffer | string }[] = files.map((f) => ({ path: f.path, data: f.content }));

const b64ToBuf = (s: string) => Buffer.from(s, 'base64');

// 배경 / CG / BGM
for (const ref of refs) {
  const s = ref.scene;
  const bgPrompt = [s.background || s.title, ...s.direction].join(', ');
  const bgLabel = s.background || s.title;
  const bg = await page.evaluate(
    async ([p, l, w, h]) => (window as any).toB64(await (window as any).Gen.canvasImage(p, l, w, h)),
    [bgPrompt, bgLabel, W, H] as const,
  );
  out.push({ path: `game/images/${ref.bgFile}`, data: b64ToBuf(bg) });

  for (let j = 0; j < ref.cgFiles.length; j++) {
    const cg = await page.evaluate(
      async ([p, l, w, h]) => (window as any).toB64(await (window as any).Gen.canvasImage(p, l, w, h)),
      [s.cg[j], `CG: ${s.cg[j]}`, W, H] as const,
    );
    out.push({ path: `game/images/${ref.cgFiles[j]}`, data: b64ToBuf(cg) });
  }
  // BGM 은 이제 업로드본만 있다(생성 폴백 없음) — 샘플 스토리는 업로드가 없어 ref.bgmFile 이 항상
  // undefined 이므로(§renpy/generate.ts bgmAssetId 게이팅) 여기선 채울 것이 없다.
}

// 캐릭터 스프라이트(있으면)
for (const sp of sprites) {
  const color = project.characters.find((c) => c.name === sp.charName)?.color ?? '#9fd3ff';
  const png = await page.evaluate(
    async ([n, e, c]) => (window as any).toB64(await (window as any).Gen.canvasSprite(n, e, c)),
    [sp.charName, sp.expr, color] as const,
  );
  out.push({ path: `game/images/${sp.file}`, data: b64ToBuf(png) });
}

// 메뉴 아트(테마)
for (const variant of ['main', 'game'] as const) {
  const png = await page.evaluate(
    async ([t, w, h, v]) => (window as any).toB64(await (window as any).Gen.canvasMenuArt(t, w, h, v)),
    [theme, W, H, variant] as const,
  );
  out.push({ path: `game/gui/${variant === 'main' ? 'main_menu' : 'game_menu'}.png`, data: b64ToBuf(png) });
}

// 버튼 배경 PNG (gui.button_properties 요구)
for (const b of buttonBgAssets(theme)) {
  const png = await page.evaluate(
    async (color) => (window as any).toB64(await (window as any).Gen.solidPng(color)),
    b.color,
  );
  out.push({ path: `game/gui/button/${b.name}`, data: b64ToBuf(png) });
}

await browser.close();

// 한글 폰트
for (const [src, dst] of [
  ['public/fonts/NanumGothic.ttf', 'game/fonts/NanumGothic.ttf'],
  ['public/fonts/OFL.txt', 'game/fonts/OFL.txt'],
] as const) {
  if (existsSync(src)) out.push({ path: dst, data: readFileSync(src) });
}

// 1) 폴더로 풀어 lint 검증
const BUILD = join(process.cwd(), '.romance-build');
if (existsSync(BUILD)) rmSync(BUILD, { recursive: true, force: true });
for (const f of out) {
  const p = join(BUILD, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.data);
}

// 2) ZIP 묶기
const zip = new JSZip();
for (const f of out) zip.file(f.path, f.data);
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const zipName = `${genre}_renpy.zip`;
writeFileSync(join(process.cwd(), zipName), buf);

console.log(`✅ ${zipName} 생성 (${(buf.length / 1024).toFixed(0)} KB, 파일 ${out.length}개)`);
console.log(`   lint 검증용 폴더: .romance-build`);
