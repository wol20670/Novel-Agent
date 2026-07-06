// 실제 브라우저(헤드리스 Chromium)로 전체 파이프라인을 클릭 검증한다.
// 샘플 → 분석 → 전체 승인 → 배경/BGM/스프라이트 업로드(픽스처 파일) → Ren'Py 확인 → ZIP 다운로드 → 내용물 검증.
// 이미지·음악은 이제 앱이 생성하지 않으므로(ChatGPT/Suno 등 외부 도구 → 업로드), 여기선 작은 픽스처
// 파일을 업로드 버튼의 숨김 input 에 직접 주입해 업로드 경로를 검증한다.
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const shotDir = join(root, 'e2e-shots');
mkdirSync(shotDir, { recursive: true });

// 업로드 버튼 검증용 픽스처(1x1 PNG · 최소 mp3 프레임 헤더).
const fixturePng = join(shotDir, 'fixture.png');
writeFileSync(
  fixturePng,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const fixtureMp3 = join(shotDir, 'fixture.mp3');
writeFileSync(fixtureMp3, Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]));

/** UploadButton은 <button>과 숨김 <input type=file> 을 형제로 렌더링한다 — 버튼 기준으로 input을 찾아 파일을 주입. */
const uploadVia = (button, file) => button.locator('xpath=following-sibling::input[@type="file"]').first().setInputFiles(file);

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const log = (...a) => console.log(...a);
const fails = [];
const assert = (cond, msg) => {
  log(cond ? '✅' : '❌', msg);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') log('  [browser console.error]', m.text());
});
page.on('pageerror', (e) => log('  [pageerror]', e.message));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  assert(await page.getByText('Novel-Agent').first().isVisible(), '앱 로드(헤더 표시)');

  // 1) 샘플 → 분석
  await page.getByRole('button', { name: /^✨ 샘플$/ }).click();
  await page.getByRole('button', { name: /^🔍 분석$/ }).click();
  await page.waitForTimeout(500);
  const cardCount = await page.locator('input.field.font-semibold').count();
  assert(cardCount === 5, `장면 카드 5개 렌더 (실제 ${cardCount})`);
  await page.screenshot({ path: join(shotDir, '1-scenes.png'), fullPage: true });

  // 2) 전체 승인
  await page.getByRole('button', { name: '전체 승인' }).click();
  await page.waitForTimeout(300);
  const approvedChips = await page.getByRole('button', { name: '✓ 전체 승인됨' }).count();
  assert(approvedChips > 0, '전체 승인 완료 상태 표시');

  // 3) 첫 장면 배경 업로드 (픽스처 PNG) — SceneCard 첫 버튼
  await uploadVia(page.getByRole('button', { name: /배경 업로드/ }).first(), fixturePng);
  await page.waitForSelector('img[src^="blob:"]', { timeout: 15000 });
  assert(true, '배경 이미지(blob) 업로드·표시');

  // 4) 첫 장면 BGM 업로드 (픽스처 mp3)
  await uploadVia(page.getByRole('button', { name: /BGM 업로드/ }).first(), fixtureMp3);
  await page.waitForSelector('audio[src^="blob:"]', { timeout: 20000 });
  assert(true, 'BGM 오디오(blob) 업로드·표시');
  await page.screenshot({ path: join(shotDir, '2-generated.png'), fullPage: true });

  // 4.5) 에셋 탭 — 첫 캐릭터 기본 입화 업로드 (픽스처 PNG)
  await page.getByRole('button', { name: /^🎨 에셋$/ }).click();
  await page.waitForTimeout(300);
  const before = await page.locator('img[src^="blob:"]').count();
  await uploadVia(page.getByRole('button', { name: /기본 입화 업로드/ }).first(), fixturePng);
  await page.waitForFunction(
    (n) => document.querySelectorAll('img[src^="blob:"]').length > n,
    before,
    { timeout: 20000 },
  );
  assert(true, '캐릭터 스프라이트(업로드) 표시');
  await page.screenshot({ path: join(shotDir, '4-sprites.png'), fullPage: true });

  // 5) Ren'Py 탭 — 스크립트 내용 확인
  await page.getByRole('button', { name: /Ren'Py/ }).click();
  await page.waitForTimeout(300);
  const pre = await page.locator('pre').first().innerText();
  log('  --- script.rpy 앞부분 ---\n' + pre.split('\n').slice(0, 14).map((l) => '    ' + l).join('\n'));
  assert(/label scene_1\b/.test(pre), "script.rpy 에 label scene_1 존재");
  assert(/menu:/.test(pre), 'script.rpy 에 menu 블록 존재');
  assert(/show c_\d+ \w+ at /.test(pre), 'script.rpy 에 캐릭터 show 문 존재');
  await page.screenshot({ path: join(shotDir, '3-renpy.png'), fullPage: true });

  // 6) ZIP 생성 → 다운로드 → 내용물 검증
  await page.getByRole('button', { name: /ZIP 생성/ }).click();
  let download;
  try {
    download = await page.waitForEvent('download', { timeout: 90000 });
  } catch (err) {
    const toastTxt = await page.locator('.fixed.bottom-4').textContent().catch(() => '(toast 없음)');
    log('  ⏱ download 미발생. 현재 toast:', toastTxt);
    throw err;
  }
  const zipPath = join(shotDir, 'out.zip');
  await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  log('  ZIP 내용:', names.join(', '));
  assert(names.includes('game/script.rpy'), 'ZIP: game/script.rpy');
  assert(names.includes('game/characters.rpy'), 'ZIP: game/characters.rpy');
  assert(names.includes('game/assets.rpy'), 'ZIP: game/assets.rpy');
  assert(names.includes('game/options.rpy'), 'ZIP: game/options.rpy');
  assert(names.includes('game/screens.rpy'), 'ZIP: game/screens.rpy (최소 자립형 화면)');
  assert(names.includes('game/fonts/NanumGothic.ttf'), 'ZIP: 한글 폰트(나눔고딕) 포함');
  assert(names.some((n) => n.startsWith('game/images/sprite_') && n.endsWith('.png')), 'ZIP: 캐릭터 스프라이트 PNG 포함');
  assert(names.some((n) => n.startsWith('game/images/bg_') && n.endsWith('.png')), 'ZIP: 배경 PNG 포함');
  assert(names.some((n) => n.startsWith('game/audio/bgm_') && n.endsWith('.mp3')), 'ZIP: 업로드한 BGM mp3 포함');

  // PNG 매직넘버 + BGM 은 업로드 픽스처 바이트가 그대로 들어갔는지 확인.
  const bgFile = names.find((n) => n.startsWith('game/images/bg_'));
  const pngBuf = await zip.files[bgFile].async('uint8array');
  assert(pngBuf[0] === 0x89 && pngBuf[1] === 0x50, `배경 PNG 시그니처 정상 (${bgFile}, ${pngBuf.length} bytes)`);
  const mp3File = names.find((n) => n.startsWith('game/audio/bgm_'));
  const mp3Buf = await zip.files[mp3File].async('uint8array');
  const fixtureMp3Buf = readFileSync(fixtureMp3);
  assert(
    mp3Buf.length === fixtureMp3Buf.length && mp3Buf.every((b, i) => b === fixtureMp3Buf[i]),
    `BGM mp3 픽스처 바이트 일치 (${mp3File}, ${mp3Buf.length} bytes)`,
  );

  // 7) 새로고침 후 자동복원
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const restored = await page.locator('input.field.font-semibold').count();
  assert(restored === 5, `새로고침 후 자동복원 (장면 ${restored})`);

  // 8) 프로젝트 내보내기 → 초기화 → 가져오기 round-trip
  const [proj] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /내보내기/ }).click(),
  ]);
  const projPath = join(shotDir, 'project.npproj.zip');
  await proj.saveAs(projPath);
  // 내보낸 파일 자체 검증
  const pzip = await JSZip.loadAsync(readFileSync(projPath));
  const pnames = Object.keys(pzip.files).filter((n) => !pzip.files[n].dir);
  assert(pnames.includes('project.json'), '프로젝트 파일: project.json 포함');
  assert(pnames.some((n) => n.startsWith('assets/')), '프로젝트 파일: 에셋 바이너리 포함');

  // 초기화(confirm 수락) → 장면 0
  page.once('dialog', (d) => d.accept());
  await page.getByTitle('모두 초기화').click();
  await page.waitForTimeout(500);
  const afterReset = await page.locator('input.field.font-semibold').count();
  assert(afterReset === 0, `초기화 후 장면 0 (실제 ${afterReset})`);

  // 가져오기: 숨김 input 에 파일 주입
  await page.locator('input[type=file][accept*="npproj"]').setInputFiles(projPath);
  await page.waitForTimeout(1000);
  const afterImport = await page.locator('input.field.font-semibold').count();
  assert(afterImport === 5, `가져오기 후 장면 5 복원 (실제 ${afterImport})`);
  const restoredImg = await page.locator('img[src^="blob:"]').count();
  assert(restoredImg > 0, '가져오기 후 배경 에셋(blob) 복원');
  await page.screenshot({ path: join(shotDir, '4-imported.png'), fullPage: true });
} catch (e) {
  log('❌ 예외:', e.message);
  fails.push('예외: ' + e.message);
  await page.screenshot({ path: join(shotDir, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

log('\n=== 결과:', fails.length === 0 ? '전체 통과 ✅' : `${fails.length}개 실패 ❌`, '===');
if (fails.length) process.exitCode = 1;
