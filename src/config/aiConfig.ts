// ───────────────────────────────────────────────────────────────────────────
//  AI / 외부 API 중앙 설정 — "실연동" 시 여기 값만 바꾸면 전체에 반영된다.
//
//  이미지(배경·캐릭터·CG)·음악(BGM)·성우(TTS)는 이제 앱이 생성하지 않는다.
//  ChatGPT/Suno 등 외부 도구에서 만든 파일을 앱에 업로드하는 방식으로 바뀌었다
//  (자세한 워크플로우는 CLAUDE.md 참고). 여기 남은 건 텍스트 전용 OpenAI 설정뿐이다.
//   - 대본 번역, AI GUI 테마 생성이 모두 이 chat(gpt-4o-mini) 설정 하나를 공유한다.
//  키(API Key)는 여기 적지 않는다. 키는 사용자가 화면에서 입력 → 브라우저(localStorage)
//  에만 저장된다(코드/깃에 절대 커밋 금지).
// ───────────────────────────────────────────────────────────────────────────

export interface AiConfig {
  chat: {
    /** Chat Completions 엔드포인트(번역/테마 등 텍스트 추론용). */
    endpoint: string;
    /** GUI 테마(색 팔레트) 생성 모델. */
    themeModel: string;
    /** 창의성. 0=결정적, 1=다양. */
    temperature: number;
  };
  /**
   * 성우(TTS) — Typecast(https://typecast.ai/docs/api-reference). CORS 문제로 브라우저 직접
   * 호출 대신 같은 origin의 Vercel Edge 함수(api/typecast, 로컬은 vite dev 프록시)를 통해
   * 중계한다. 키(X-API-KEY)는 프록시가 저장 없이 그대로 통과시킨다(BYO 키 원칙 유지).
   * 과금이 "1글자 = 1크레딧"으로 고정이라(문서 확인) 이전 TTS 벤더 때와 달리 크레딧/초 추정치·실측
   * 보정이 필요 없다 — 글자수 합이 곧 정확한 견적(src/generators/voice/estimate.ts).
   */
  voice: {
    proxyBase: string;
    defaultModel: string;
  };
}

export const aiConfig: AiConfig = {
  chat: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    themeModel: 'gpt-4o-mini',
    temperature: 0.8,
  },
  voice: {
    proxyBase: '/api/typecast',
    defaultModel: 'ssfm-v30',
  },
};
