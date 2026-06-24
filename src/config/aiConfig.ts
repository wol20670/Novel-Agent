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
    // 배경은 medium(텍스트·캐릭터에 가려지지 않는 메인 비주얼이라 품질↑). 더 높이려면 'high'.
    quality: { background: 'medium', cg: 'medium', sprite: 'medium' },
    landscapeRatio: 1.2,
    portraitRatio: 0.83,
    artStyle:
      '고퀄리티 서브컬쳐/가챠 게임 캐릭터 일러스트 그림체, 미려하고 매력적인 캐릭터 디자인, ' +
      '정교한 셀 셰이딩과 부드러운 그라데이션, 깨끗하고 또렷한 라인아트, 윤기나는 머리카락과 ' +
      '디테일한 눈동자, 입체감 있는 음영과 하이라이트, 화사하고 채도 높은 색감, 프로페셔널 일러스트 퀄리티. ' +
      '(high-quality Japanese gacha / subculture game character illustration, beautiful appealing character ' +
      'design, refined cel shading with soft gradients, crisp clean lineart, glossy detailed hair and eyes, ' +
      'volumetric shading — NOT photorealistic, NOT 3D, NOT a photo, NOT sketchy, NOT flat, NOT washed out)',
    backgroundStyle:
      '디테일이 풍부한 비주얼노벨/애니메이션 배경 일러스트, 깊이감 있는 원근과 정교한 묘사, ' +
      '사실적인 빛과 그림자, 분위기 있는 조명, 높은 디테일과 선명한 질감. ' +
      '(lush, highly detailed anime-style background art, painterly and atmospheric, ' +
      'realistic lighting and depth, rich textures, semi-realistic — no people, no characters, no text or watermark)',
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
