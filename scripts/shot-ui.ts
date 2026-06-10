// 인앱 Theme Studio 스크린샷(검증/데모용). dev 서버가 떠 있어야 함.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync(join(process.cwd(), '.preview'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

// 샘플 로드 → 장면/시놉시스 확보
await page.getByRole('button', { name: '✨ 샘플', exact: true }).click();
await page.waitForTimeout(600);

// AI 테마 생성(키 없으면 오프라인 변형)
const mood = page.getByPlaceholder(/네온 도시|첫사랑/);
await mood.fill('비 내리는 네온 사이버펑크 도시, 차갑고 외로운');
await page.getByRole('button', { name: /AI 테마 생성|테마 재생성/ }).click();
await page.waitForTimeout(2500); // 생성 + 프리뷰 캔버스 렌더

// 좌측 패널(테마 스튜디오 포함) 클립 스크린샷
await page.screenshot({ path: '.preview/theme-studio.png', clip: { x: 0, y: 0, width: 380, height: 950 } });
console.log('✓ .preview/theme-studio.png');

await browser.close();
