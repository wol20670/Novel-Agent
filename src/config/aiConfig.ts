// ───────────────────────────────────────────────────────────────────────────
//  AI / 외부 API 중앙 설정 — "실연동" 시 여기 값만 바꾸면 전체에 반영된다.
//
//  원칙
//   - 키(API Key)는 여기 적지 않는다. 키는 사용자가 화면에서 입력 → 브라우저(localStorage)
//     에만 저장된다(코드/깃에 절대 커밋 금지). 이 파일은 "어떤 모델/사이즈/엔드포인트를
//     쓸지"만 담는다.
//   - 키가 없으면 자동으로 오프라인(Canvas/합성) 폴백이 동작한다. 이 파일은 온라인 경로의
//     기본값일 뿐, 폴백 동작에는 영향이 없다.
//
//  이미지 모델은 NovelAI(image.novelai.net) 단일.
//   - 서브컬쳐/애니 일러스트 품질이 월등. 응답은 ZIP → 첫 PNG 추출. 투명배경은 생성 단계가
//     아니라 누끼(브라우저 무료 / Director Tools)로 별도 처리. 토큰은 persistent token(pst-…).
//   - 배경/CG/스프라이트 모두 같은 이미지 모델을 쓰되 사이즈·투명배경만 다르다.
//   - 텍스트(한국어 프롬프트 → 영문 태그 변환, AI 테마)는 chat(gpt-4o-mini)을 쓴다.
// ───────────────────────────────────────────────────────────────────────────

/**
 * NovelAI 출력 사이즈.
 * - Normal(≤1MP): Opus 무료 무제한. 832×1216(세로) / 1216×832(가로) / 1024×1024(정방).
 * - Large(>1MP): 더 선명·디테일하지만 Anlas 소모. 1024×1536 / 1536×1024 / 1472×1472.
 * (NovelAI 웹 공식 프리셋과 동일. 모델이 이 비율로 학습돼 구도·품질이 가장 안정적이다.)
 */
export type NaiSize =
  | '832x1216'
  | '1216x832'
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | '1472x1472';

/** NovelAI 생성 모드. free=Opus 무료(≤1MP) · high=고품질(큰 해상도, Anlas 소모). */
export type NaiMode = 'free' | 'high';

export interface AiConfig {
  image: {
    /** 배경/CG: 가로·세로 비율 → 실제 출력 사이즈 매핑 임계값. */
    landscapeRatio: number; // 이 값보다 가로가 길면 1216x832 (high: 1536x1024)
    portraitRatio: number; //  이 값보다 세로가 길면 1024x1536
    /**
     * 모든 이미지(배경·CG·스프라이트)에 공통으로 붙는 "그림체" 지시.
     * 원하는 룩이 바뀌면 여기 한 줄만 고치면 전체 톤이 바뀐다.
     * (피하고 싶은 요소는 novelai.negativePrompt 에 둔다.)
     */
    artStyle: string;
    /**
     * 배경 전용 그림체. 배경은 캐릭터(artStyle)보다 디테일·깊이감·사실적 조명을 강조하고
     * 평면적인 셀 셰이딩 느낌을 줄인다(너무 2D 틱하지 않게). 인물·글자 없음.
     */
    backgroundStyle: string;
    /** 캐릭터 스프라이트(입화) 설정. */
    sprite: {
      /** 투명 배경(인물만 오려낸 PNG). NovelAI 는 흰 배경으로 뽑은 뒤 누끼로 처리. */
      transparent: boolean;
    };
    /** NovelAI(image.novelai.net) 설정. provider==='novelai' 일 때 사용. */
    novelai: {
      /** 이미지 API 호스트(생성/증강/encode-vibe). 개발(Vite)에선 '/nai' 프록시로 대체된다. */
      host: string;
      /** Primary API 호스트(계정·업스케일 등). 개발에선 '/nai-api' 프록시로 대체된다. */
      apiHost: string;
      /** 이미지 생성 경로(generate / img2img 공용). */
      generatePath: string;
      /** Director Tools(배경 제거 등) 경로. */
      augmentPath: string;
      /** 업스케일(1.5~4배) 경로. 무료 farming 당첨작을 고해상도화할 때. Anlas 소모. */
      upscalePath: string;
      /** Vibe(그림체 참조) 인코딩 경로. V4/V4.5 는 참조 이미지를 먼저 인코딩해야 한다(이미지당 2 Anlas). */
      encodeVibePath: string;
      /** 모델. 2026 기준 최신 = nai-diffusion-4-5-full. */
      model: string;
      /** 선택 가능한 모델 목록(참고/추후 UI 용). */
      models: string[];
      /** 샘플러. */
      sampler: string;
      /** 프롬프트 가이던스(CFG). NAI 권장 5~6. */
      scale: number;
      /** 현재 생성 모드(설정에서 변경). free=Opus 무료 · high=고품질(Anlas). */
      mode: NaiMode;
      /** 모드별 정의 — 무료(≤1MP)/고품질(큰 해상도). 스텝은 둘 다 ≤28. */
      modes: Record<
        NaiMode,
        {
          /** UI 표시 이름. */
          label: string;
          /** Opus 무료 범위인가(고품질은 Anlas 소모). */
          free: boolean;
          /** 생성 스텝(≤28 권장). */
          steps: number;
          /** 종류별 출력 사이즈(세로=스프라이트, 가로=배경/CG, 정방=기타). */
          sizes: { portrait: NaiSize; landscape: NaiSize; square: NaiSize };
        }
      >;
      /** 네거티브 프리셋 번호(0=Heavy). */
      ucPreset: number;
      /** 공통 네거티브(uc) 프롬프트. NAI 의 핵심 디폴트(인체 오류 차단). */
      negativePrompt: string;
      /** 긍정 프롬프트 "끝"에 붙는 V4.5 품질 태그(모델별 권장값). */
      qualityTags: string;
      /**
       * CG 전용 품질 태그(맨 끝 부착). 스프라이트를 그대로 베낀 그림이 아니라 "웹소설 표지 일러스트"
       * 느낌을 내려고 배경·조명·구도 관련 태그를 강화한다(스프라이트/배경 공용 qualityTags 와 별개).
       */
      qualityTagsCg: string;
      /** img2img 기본 변형 강도(0~1). 낮을수록 원본 유지. */
      img2imgStrength: number;
      /** 그림체 참조(vibe transfer) 기본 강도(0~1). */
      vibeStrength: number;
      /** 그림체 참조 정보 추출량(0~1, 1=화풍 강하게 반영). */
      vibeInfoExtracted: number;
      /**
       * CG 캐릭터 참조 전용 vibe 강도/정보추출량 — 스프라이트를 "그대로 베끼기"가 아니라
       * 머리색·의상 등 필수 특징만 느슨하게 반영하도록 스프라이트/배경 공용값보다 낮게 잡는다.
       * (정보추출량을 낮추면 구도 위주로만 반영 → 투명/흰 배경이 CG 에 새어드는 것도 막아준다.)
       */
      cgVibeStrength: number;
      cgVibeInfoExtracted: number;
      /**
       * 표정(Emotion Director) 적용 강도 = defry(0~5). 웹 Director 의 Normal/Slightly Weak/… 와 동일.
       * 0=Normal(가장 강하게 적용 → 눈색·머리 등 드리프트↑), 클수록 약하게 적용 → 원본 보존↑(표정 변화는 약해짐).
       */
      emotionDefry: number;
    };
  };
  /**
   * 음악(BGM) 생성 — ElevenLabs Music(Eleven Music). 토큰이 있으면 실제 BGM, 없으면 오프라인 synth 폴백.
   * force_instrumental 은 provider 에서 true 고정(가사 없는 게임 BGM). 동기 호출이라 폴링 설정이 없다.
   * (선정 이유: 공식 API + 라이선스 음원 학습 → 상업/게임 사용 허가 + 요청 1번에 오디오 반환.)
   */
  audio: {
    eleven: {
      /** 프로덕션 호스트. 개발(Vite)에선 '/eleven' 프록시로 대체된다(CORS 우회, dev 한정). */
      host: string;
      /** 음악 생성(compose) 경로. */
      composePath: string;
      /** 모델 식별자('music_v1' 안정 · 'music_v2' 최신). */
      model: string;
      /** 생성 길이(ms, 3,000~600,000). BGM 기본값. */
      lengthMs: number;
      /** 출력 포맷(query). 기본 'pcm_44100'(raw PCM)→WAV 헤더만 붙임(무손실·디코딩 없음). mp3_* 로 바꾸면 트랜스코드 폴백. */
      outputFormat: string;
    };
    /**
     * 다국어 성우(TTS) — ElevenLabs Multilingual. BGM(eleven)과 같은 BYO 키(na_eleven_key)·'/eleven'
     * 프록시·xi-api-key 를 공유한다. 캐릭터별 voice_id 는 코드가 아니라 프로젝트 데이터(Character.voiceIds)에 둔다.
     * 크레딧은 Music 과 공유되므로 라인 opt-in(Line.voiced)으로만 생성한다(비용 안전장치).
     */
    elevenVoice: {
      /** TTS 경로 접두어. 실제 요청은 `${prefix}/{voice_id}` 로 만든다. */
      ttsPathPrefix: string;
      /** 모델('eleven_multilingual_v2' = ko/en/ja 등 29개 언어, 텍스트에서 언어 자동 감지). */
      model: string;
      /** 출력 포맷(query). Ren'Py voice 는 mp3 재생 OK → BGM 과 달리 트랜스코드 없이 그대로 쓴다. */
      outputFormat: string;
      /** 보이스 세팅(0~1). stability↑=일관, similarity_boost↑=원본 유사, style↑=표현력, speaker_boost=명료도. */
      voiceSettings: {
        stability: number;
        similarity_boost: number;
        style: number;
        use_speaker_boost: boolean;
      };
    };
  };
  chat: {
    /** Chat Completions 엔드포인트(테마/표정 분류 등 텍스트 추론용). */
    endpoint: string;
    /** GUI 테마(색 팔레트) 생성 모델. */
    themeModel: string;
    /** (선택·추후) 대사→표정 LLM 분류 모델. 미연동 시 오프라인 휴리스틱이 동작. */
    emotionModel: string;
    /** 창의성. 0=결정적, 1=다양. */
    temperature: number;
  };
}

export const aiConfig: AiConfig = {
  image: {
    landscapeRatio: 1.2,
    portraitRatio: 0.83,
    // NovelAI 는 서브컬쳐 노벨 화풍이 모델 자체의 디폴트라, GPT 용 범용 만화풍 유도어
    // (anime style / manga 등)나 "NOT photorealistic …" 부정문을 긍정 프롬프트에 넣지 않는다.
    // 화풍은 모델에 맡기고, 여기엔 "매력 포인트"만 가볍게 적는다(피하고 싶은 건 negativePrompt 로).
    artStyle:
      '매력적인 캐릭터 디자인, 정교한 셀 셰이딩, 윤기나는 머리카락과 디테일한 눈동자, ' +
      '입체적인 음영과 하이라이트, 화사한 색감',
    backgroundStyle:
      '디테일이 풍부한 비주얼노벨 배경, 깊이감 있는 원근과 정교한 묘사, 분위기 있는 조명, 인물 없음',
    sprite: {
      transparent: true,
    },
    novelai: {
      host: 'https://image.novelai.net',
      apiHost: 'https://api.novelai.net',
      generatePath: '/ai/generate-image',
      augmentPath: '/ai/augment-image',
      upscalePath: '/ai/upscale',
      encodeVibePath: '/ai/encode-vibe',
      // 정통 서브컬처 미소녀 게임 화풍 최적화. (API id 는 하이픈 4-5, 점 4.5 아님)
      model: 'nai-diffusion-4-5-curated',
      models: ['nai-diffusion-4-5-curated', 'nai-diffusion-4-5-full', 'nai-diffusion-4-full', 'nai-diffusion-3'],
      sampler: 'k_euler_ancestral',
      scale: 6,
      // 기본은 무료 모드(Opus 무제한). 고품질은 큰 해상도라 Anlas 를 쓴다.
      mode: 'free',
      modes: {
        free: {
          label: '무료',
          free: true,
          // ≤1MP·≤28스텝·1장 → Opus 구독 무제한 무료.
          steps: 28,
          sizes: { portrait: '832x1216', landscape: '1216x832', square: '1024x1024' },
        },
        high: {
          label: '고품질',
          free: false,
          // Large 사이즈(>1MP) → 더 선명·디테일, Anlas 소모.
          steps: 28,
          sizes: { portrait: '1024x1536', landscape: '1536x1024', square: '1472x1472' },
        },
      },
      ucPreset: 0,
      // NovelAI V4.5 공식 Undesired Content 프리셋 기준(2026-07-01 docs.novelai.net).
      // = Curated 'Heavy' 프리셋 + Human Focus 의 인체 보호(bad anatomy·bad hands).
      //   (앱은 배경/CG/스프라이트에 단일 네거티브를 공용하므로 캐릭터 안전 태그를 함께 둔다.)
      //   + 검은 레터박스/장식 테두리 억제: V4.5 계열이 scenery 배경에 검은 띠·프레임을 구워 넣는
      //     경향이 있어(danbooru 'letterboxed'/'border' 분포) 배경·CG·스프라이트 공통으로 막는다.
      negativePrompt:
        'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, ' +
        'worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, ' +
        'halftone, multiple views, logo, too many watermarks, negative space, blank page, ' +
        'bad anatomy, bad hands, ' +
        'letterboxed, black bars, border, frame, framed',
      // V4.5 품질 태그는 프롬프트 "맨 끝"에 붙인다(모델별 공식 권장값, 2026-07-01 docs.novelai.net).
      // 현재 모델=Curated → 공식 권장 'location, masterpiece, no text, -0.8::feet::, rating:general'.
      // 단 '-0.8::feet::' 는 전신 입화(head to toe)와 충돌해 의도적으로 제외한다(재추가 시 발 잘림).
      // V4.5 Full 이면 'location, very aesthetic, masterpiece, no text'.
      // qualityToggle(서버 자동부착)에 의존하지 않고 직접 부착해 결정적으로 동작시킨다.
      qualityTags: 'location, masterpiece, no text, rating:general',
      // CG는 스프라이트 복제가 아니라 "웹소설 표지 일러스트" 톤을 노린다 — 배경 존재를 강제하는
      // detailed background 를 포함해 img2img 폐기 후에도 빈 배경으로 돌아가지 않게 한다.
      qualityTagsCg:
        'very aesthetic, beautiful detailed background, cinematic lighting, dramatic composition, ' +
        'official art, absurdres, masterpiece, no text',
      img2imgStrength: 0.6,
      // 그림체 참조(vibe transfer) 기본 강도/정보추출량(여러 장 업로드 시 각 이미지에 공통 적용).
      vibeStrength: 0.6,
      vibeInfoExtracted: 1.0,
      // CG 캐릭터 참조는 느슨하게 — 머리색·의상 등 "필수 특징"만 반영하고 구도·배경은 새로 그리게 한다.
      cgVibeStrength: 0.4,
      cgVibeInfoExtracted: 0.35,
      // 표정 강도 기본값: 1=Slightly Weak(약간 약하게 → 눈색 등 보존). 0 이면 가장 강하게(드리프트↑).
      emotionDefry: 1,
    },
  },
  audio: {
    eleven: {
      // ElevenLabs Music 공식 API. (dev 프록시 target 은 vite.config.ts 의 '/eleven' 와 일치.)
      host: 'https://api.elevenlabs.io',
      composePath: '/v1/music',
      model: 'music_v1',
      lengthMs: 30000, // 30초 BGM(비용·루프 감안). 필요시 조정.
      // raw PCM(무손실 16bit) → provider 가 WAV 헤더만 붙인다(손실 mp3 인코딩·AudioContext 디코딩 회피).
      outputFormat: 'pcm_44100',
    },
    elevenVoice: {
      // ElevenLabs Text-to-Speech(Multilingual). 요청 URL = '/eleven' + '/v1/text-to-speech/{voice_id}'.
      ttsPathPrefix: '/v1/text-to-speech',
      model: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
      voiceSettings: { stability: 0.4, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    },
  },
  chat: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    themeModel: 'gpt-4o-mini',
    emotionModel: 'gpt-4o-mini',
    temperature: 0.8,
  },
};

/** 지정 모드(미지정 시 현재 전역 모드)의 사이즈 세트. 개별 호출에서 전역 모드를 안 건드리고 크기만 오버라이드할 때 쓴다(예: CG 고품질 토글). */
export function naiActiveSizes(modeOverride?: NaiMode): { portrait: NaiSize; landscape: NaiSize; square: NaiSize } {
  const nai = aiConfig.image.novelai;
  return nai.modes[modeOverride ?? nai.mode].sizes;
}

/** 지정 모드(미지정 시 현재 전역 모드)의 생성 스텝. */
export function naiActiveSteps(modeOverride?: NaiMode): number {
  const nai = aiConfig.image.novelai;
  return nai.modes[modeOverride ?? nai.mode].steps;
}

/** 배경/CG 의 (가로,세로) 요청을 지정(또는 현재) NovelAI 모드 사이즈로 정규화. */
export function naiSize(w: number, h: number, modeOverride?: NaiMode): NaiSize {
  const sizes = naiActiveSizes(modeOverride);
  const ratio = w / h;
  if (ratio > aiConfig.image.landscapeRatio) return sizes.landscape;
  if (ratio < aiConfig.image.portraitRatio) return sizes.portrait;
  return sizes.square;
}
