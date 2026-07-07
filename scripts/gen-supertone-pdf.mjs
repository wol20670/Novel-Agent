// docs/supertone-api-reference.html → docs/supertone-api-reference.pdf (로컬 참조용, docs/는 gitignore).
// 재실행 = 최신화. Supertone 문서가 바뀌면 html을 고치고 이 스크립트만 다시 돌리면 된다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const html = join(root, 'docs', 'supertone-api-reference.html');
const pdf = join(root, 'docs', 'supertone-api-reference.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href);
await page.pdf({ path: pdf, format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
await browser.close();
console.log('생성됨:', pdf);
