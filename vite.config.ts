import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // NovelAI 는 브라우저 직접 호출(CORS)을 허용하지 않을 수 있어, 개발 중엔 이 프록시로 우회한다.
    // 코드에서 '/nai/ai/generate-image' 로 부르면 image.novelai.net 으로 전달된다(Authorization 헤더 보존).
    proxy: {
      // 주의: '/nai-api' 를 '/nai' 보다 먼저 둬야 한다('/nai' 가 '/nai-api/...' 까지 삼키는 것 방지).
      // 업스케일(/ai/upscale) 등 일부는 Primary 호스트(api.novelai.net)에 있다.
      '/nai-api': {
        target: 'https://api.novelai.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nai-api/, ''),
      },
      // 이미지 생성/증강(generate-image, augment-image, encode-vibe)은 image.novelai.net.
      '/nai': {
        target: 'https://image.novelai.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nai/, ''),
      },
    },
  },
});
