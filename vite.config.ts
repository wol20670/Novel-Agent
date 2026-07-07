import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // 이미지(배경·캐릭터·CG)·음악(BGM)은 이제 앱이 생성하지 않는다(ChatGPT/Suno 등 외부 도구 →
    // 업로드). OpenAI(텍스트, gpt-4o-mini)는 브라우저 직접 호출을 허용해 프록시가 필요 없다.
    // Supertone(TTS)은 CORS 를 막을 수 있어, 배포(Vercel Edge 함수 api/supertone)와 동일한
    // 경로 `/api/supertone`를 로컬 dev 에서도 그대로 쓰도록 프록시한다.
    proxy: {
      '/api/supertone': {
        target: 'https://supertoneapi.com/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supertone/, ''),
      },
    },
  },
});
