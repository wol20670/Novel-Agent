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
//  이미지는 GPT(OpenAI gpt-image-1)로 생성한다.
//  → 배경/CG/스프라이트 모두 같은 이미지 모델을 쓰되 사이즈·투명배경만 다르다.
// ───────────────────────────────────────────────────────────────────────────

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

/** gpt-image-1 이 허용하는 출력 사이즈. (가로형 / 세로형 / 정방형) */
export type GptImageSize = '1536x1024' | '1024x1536' | '1024x1024';

export interface AiConfig {
  image: {
    /** 이미지 생성 엔드포인트(OpenAI Images API). */
    endpoint: string;
    /** 기준 이미지에서 표정만 바꿔 그릴 때 쓰는 편집 엔드포인트(일관성 유지용). */
    editEndpoint: string;
    /** 이미지 모델. 실연동 시 변경 지점. */
    model: string;
    /** 생성 품질. high = 더 또렷/고비용, low = 빠름/저비용. */
    quality: ImageQuality;
    /** 배경/CG: 가로·세로 비율 → 실제 출력 사이즈 매핑 임계값. */
    landscapeRatio: number; // 이 값보다 가로가 길면 1536x1024
    portraitRatio: number; //  이 값보다 세로가 길면 1024x1536
    /**
     * 모든 이미지(배경·CG·스프라이트)에 공통으로 붙는 "그림체" 지시.
     * 원하는 룩이 바뀌면 여기 한 줄만 고치면 전체 톤이 바뀐다.
     * gpt-image-1 은 별도 네거티브 프롬프트가 없어, 피하고 싶은 것도 문장으로 적는다.
     */
    artStyle: string;
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
    endpoint: 'https://api.openai.com/v1/images/generations',
    editEndpoint: 'https://api.openai.com/v1/images/edits',
    model: 'gpt-image-1',
    quality: 'medium',
    landscapeRatio: 1.2,
    portraitRatio: 0.83,
    artStyle:
      '일본풍 애니메이션 비주얼노벨 그림체, 2D 셀 셰이딩, 손그림 감성의 디테일한 일러스트, ' +
      '부드러운 자연광, 선명한 라인아트, 채도 높은 색감. ' +
      '(Japanese anime / visual-novel art style, 2D cel-shaded anime illustration, hand-drawn look, ' +
      'soft lighting, clean line art — NOT photorealistic, NOT a 3D render, NOT a photo)',
    sprite: {
      size: '1024x1536',
      transparent: true,
      consistency: 'reference',
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
