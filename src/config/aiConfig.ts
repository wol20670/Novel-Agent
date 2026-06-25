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
//  이미지 provider 는 둘 중 하나를 쓴다(aiConfig.provider 로 스위치).
//   - 'novelai' : NovelAI(image.novelai.net). 서브컬쳐/애니 일러스트 품질이 월등. 기본값.
//                 응답은 ZIP → 첫 PNG 추출. 투명배경은 생성 단계가 아니라 Director Tools
//                 의 bg-removal 로 별도 처리. 토큰은 persistent token(pst-…).
//   - 'openai'  : OpenAI gpt-image-1. 비-애니/폴백·비교용으로 남겨둔다.
//  → 배경/CG/스프라이트 모두 같은 이미지 모델을 쓰되 사이즈·투명배경만 다르다.
// ───────────────────────────────────────────────────────────────────────────

/** 활성 이미지 provider. NovelAI 가 검증되면 추후 'openai' 경로를 제거할 수 있다. */
export type ImageProvider = 'openai' | 'novelai';

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

/** gpt-image-1 이 허용하는 출력 사이즈. (가로형 / 세로형 / 정방형) */
export type GptImageSize = '1536x1024' | '1024x1536' | '1024x1024';

/**
 * NovelAI 출력 사이즈.
 * - Normal(≤1MP): Opus 무료 무제한. 832×1216(세로) / 1216×832(가로) / 1024×1024(정방).
 * - Large(>1MP): 더 선명·디테일하지만 Anlas 소모. 1024×1536 / 1536×1024 / 1472×1472.
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
  /** 활성 이미지 provider. 'novelai' 가 기본. */
  provider: ImageProvider;
  image: {
    /** 이미지 생성 엔드포인트(OpenAI Images API). */
    endpoint: string;
    /** 기준 이미지에서 표정만 바꿔 그릴 때 쓰는 편집 엔드포인트(일관성 유지용). */
    editEndpoint: string;
    /** 이미지 모델. 실연동 시 변경 지점. */
    model: string;
    /**
     * 에셋 종류별 생성 품질 (비용에 직접 영향).
     * gpt-image-1 단가(1024²): low ≈ $0.01 · medium ≈ $0.04 · high ≈ $0.17.
     *  - background: 뒤에 깔리고 텍스트·캐릭터에 가려져 low 로도 충분(비용 4배↓). 최종본만 medium↑.
     *  - cg/sprite: 초점이 되는 그림이라 medium 권장.
     */
    quality: { background: ImageQuality; cg: ImageQuality; sprite: ImageQuality };
    /** 배경/CG: 가로·세로 비율 → 실제 출력 사이즈 매핑 임계값. */
    landscapeRatio: number; // 이 값보다 가로가 길면 1536x1024
    portraitRatio: number; //  이 값보다 세로가 길면 1024x1536
    /**
     * 모든 이미지(배경·CG·스프라이트)에 공통으로 붙는 "그림체" 지시.
     * 원하는 룩이 바뀌면 여기 한 줄만 고치면 전체 톤이 바뀐다.
     * gpt-image-1 은 별도 네거티브 프롬프트가 없어, 피하고 싶은 것도 문장으로 적는다.
     */
    artStyle: string;
    /**
     * 배경 전용 그림체. 배경은 캐릭터(artStyle)보다 디테일·깊이감·사실적 조명을 강조하고
     * 평면적인 셀 셰이딩 느낌을 줄인다(너무 2D 틱하지 않게). 인물·글자 없음.
     */
    backgroundStyle: string;
    /** 캐릭터 스프라이트(입화) 설정. */
    sprite: {
      /** 스프라이트는 세로로 길다 → 세로형 사이즈로 고정. */
      size: GptImageSize;
      /** 투명 배경(인물만 오려낸 PNG). gpt-image-1 의 background:'transparent'. */
      transparent: boolean;
      /**
       * 표정 6종을 "같은 인물"로 보이게 하는 전략.
       *  - 'appearance' : 캐릭터 외형 설명(appearance)을 6종 프롬프트에 공통 주입(가벼움, 부분 일관).
       *  - 'reference'  : 먼저 '기본' 표정을 생성 → 그 이미지를 기준으로 나머지 표정을
       *                   '편집(edits)'으로 그려 인물 정체성을 유지(권장, 비용 ↑).
       */
      consistency: 'appearance' | 'reference';
    };
    /** NovelAI(image.novelai.net) 설정. provider==='novelai' 일 때 사용. */
    novelai: {
      /** API 호스트. 개발(Vite)에선 CORS 우회를 위해 '/nai' 프록시로 대체된다(provider 코드에서 판단). */
      host: string;
      /** 이미지 생성 경로(generate / img2img 공용). */
      generatePath: string;
      /** Director Tools(배경 제거 등) 경로. */
      augmentPath: string;
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
      /** 긍정 프롬프트 앞에 붙는 NAI 품질 태그. */
      qualityTags: string;
      /** img2img 기본 변형 강도(0~1). 낮을수록 원본 유지. */
      img2imgStrength: number;
      /** 그림체 참조(vibe transfer) 기본 강도(0~1). */
      vibeStrength: number;
      /** 그림체 참조 정보 추출량(0~1, 1=화풍 강하게 반영). */
      vibeInfoExtracted: number;
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
  // NovelAI 가 기본. 비교/폴백이 필요하면 'openai' 로 바꾼다.
  provider: 'novelai',
  image: {
    endpoint: 'https://api.openai.com/v1/images/generations',
    editEndpoint: 'https://api.openai.com/v1/images/edits',
    model: 'gpt-image-1',
    // 배경은 medium(텍스트·캐릭터에 가려지지 않는 메인 비주얼이라 품질↑). 더 높이려면 'high'.
    quality: { background: 'medium', cg: 'medium', sprite: 'medium' },
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
      size: '1024x1536',
      transparent: true,
      consistency: 'reference',
    },
    novelai: {
      host: 'https://image.novelai.net',
      generatePath: '/ai/generate-image',
      augmentPath: '/ai/augment-image',
      model: 'nai-diffusion-4-5-full',
      models: ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full', 'nai-diffusion-3'],
      sampler: 'k_euler_ancestral',
      scale: 5,
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
      // NovelAI 호출의 핵심 디폴트. 인체 오류(손·손가락·해부학)를 원천 차단하는 고정 네거티브.
      // 앞쪽이 사용자가 지정한 필수 토큰, 뒤쪽은 품질·중복인물 방지 보강.
      negativePrompt:
        'lowres, bad anatomy, bad hands, text, error, missing fingers, ' +
        'extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, ' +
        'signature, watermark, username, blurry, artist name, multiple views, multiple people',
      // 긍정 프롬프트 앞에 붙는 NAI 품질 태그(qualityToggle 과 함께 마감 품질을 끌어올린다).
      qualityTags: 'very aesthetic, masterpiece, best quality, highres',
      img2imgStrength: 0.6,
      // 그림체 참조(vibe transfer) 기본 강도/정보추출량(여러 장 업로드 시 각 이미지에 공통 적용).
      vibeStrength: 0.6,
      vibeInfoExtracted: 1.0,
    },
  },
  chat: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    themeModel: 'gpt-4o-mini',
    emotionModel: 'gpt-4o-mini',
    temperature: 0.8,
  },
};

/** 배경/CG 의 (가로,세로) 요청을 gpt-image-1 이 지원하는 사이즈로 정규화. */
export function normalizeImageSize(w: number, h: number): GptImageSize {
  const ratio = w / h;
  if (ratio > aiConfig.image.landscapeRatio) return '1536x1024';
  if (ratio < aiConfig.image.portraitRatio) return '1024x1536';
  return '1024x1024';
}

/** 현재 NovelAI 모드의 사이즈 세트. */
export function naiActiveSizes(): { portrait: NaiSize; landscape: NaiSize; square: NaiSize } {
  const nai = aiConfig.image.novelai;
  return nai.modes[nai.mode].sizes;
}

/** 현재 NovelAI 모드의 생성 스텝. */
export function naiActiveSteps(): number {
  const nai = aiConfig.image.novelai;
  return nai.modes[nai.mode].steps;
}

/** 배경/CG 의 (가로,세로) 요청을 현재 NovelAI 모드 사이즈로 정규화. */
export function naiSize(w: number, h: number): NaiSize {
  const sizes = naiActiveSizes();
  const ratio = w / h;
  if (ratio > aiConfig.image.landscapeRatio) return sizes.landscape;
  if (ratio < aiConfig.image.portraitRatio) return sizes.portrait;
  return sizes.square;
}
