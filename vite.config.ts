import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // 이미지(배경·캐릭터·CG)·음악(BGM)은 이제 앱이 생성하지 않는다(ChatGPT/Suno 등 외부 도구 →
    // 업로드). 남은 유일한 외부 API 는 OpenAI(텍스트, gpt-4o-mini)이며 브라우저 직접 호출을
    // 허용하므로 dev 프록시가 필요 없다.
  },
});
