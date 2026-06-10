// 검증용 미리보기: 실제 canvasMenu(출하 코드)로 테마 배경을 그리고,
// screens.rpy 의 main_menu 레이아웃(좌측 오버레이 패널 + 내비 + 우하단 타이틀)을
// 동일 테마값으로 합성해 5종 메뉴 미리보기 PNG 를 만든다(헤드리스 Chromium).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { PRESETS } from '../src/renpy/gui/theme';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), '.preview');
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 출하 코드 canvasMenu.ts 를 브라우저 IIFE 로 번들 → window.MenuArt.canvasMenuArt
const bundled = await build({
  entryPoints: ['src/generators/image/canvasMenu.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'MenuArt',
  write: false,
});
const js = bundled.outputFiles[0].text;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addScriptTag({ content: js });

for (const id of Object.keys(PRESETS)) {
  const theme = PRESETS[id as keyof typeof PRESETS];
  const dataUrl: string = await page.evaluate(async (t) => {
    const w = 1280,
      h = 720;
    // 실제 출하 배경 아트
    const blob = await (window as any).MenuArt.canvasMenuArt(t, w, h, 'main');
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, w, h);

    // main_menu 좌측 오버레이 패널 (style main_menu_frame: xsize 320, Solid(menu_overlay))
    ctx.fillStyle = t.menuOverlay;
    ctx.fillRect(0, 0, 320, h);

    // navigation 버튼들 (yalign 0.5, xpos 40)
    const items = ['시작', '불러오기', '설정', '정보', '도움말', '종료'];
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '600 26px "Malgun Gothic", sans-serif';
    const spacing = 46;
    let y = h / 2 - ((items.length - 1) * spacing) / 2;
    for (let i = 0; i < items.length; i++) {
      ctx.fillStyle = i === 0 ? t.accent : t.interfaceText;
      ctx.fillText(items[i], 40, y);
      y += spacing;
    }

    // 우하단 타이틀 (main_menu_vbox: xalign 1.0, yalign 1.0)
    ctx.textAlign = 'right';
    ctx.fillStyle = t.accent;
    ctx.font = '700 50px "Malgun Gothic", sans-serif';
    ctx.fillText('나의 비주얼노벨', w - 30, h - 78);
    ctx.fillStyle = t.interfaceText;
    ctx.font = '400 22px "Malgun Gothic", sans-serif';
    ctx.fillText('1.0', w - 30, h - 40);

    // 테마 라벨 (좌상단 워터마크)
    ctx.textAlign = 'left';
    ctx.fillStyle = t.idle;
    ctx.font = '500 18px "Malgun Gothic", sans-serif';
    ctx.fillText('[' + t.label + ']', 40, 36);

    return c.toDataURL('image/png');
  }, theme);

  writeFileSync(join(OUT, `menu_${id}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`✓ menu_${id}.png  (${theme.label})`);
}

await browser.close();
console.log(`\n미리보기 5종 생성: ${OUT}`);
