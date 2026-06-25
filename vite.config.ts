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
      '/nai': {
        target: 'https://image.novelai.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nai/, ''),
      },
    },
  },
});
