// esbuild 번들 진입점 — 브라우저 전용 생성기들을 헤드리스 페이지에 노출(window.Gen).
// build-zip.ts 가 이 번들을 Playwright 페이지에 주입해 실제 에셋을 생성한다.
export { canvasImage } from '../src/generators/image/canvasProvider';
export { canvasSprite } from '../src/generators/image/canvasSprite';
export { canvasMenuArt, solidPng } from '../src/generators/image/canvasMenu';
