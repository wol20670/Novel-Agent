/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 협업(실시간 공유)용 Supabase 프로젝트 URL — 빌드에 내장(anon key와 함께 공개돼도 되는 값). */
  readonly VITE_SUPABASE_URL?: string;
  /** 협업용 Supabase anon(public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * 폰트 프리셋용 — 사용자 소유 GCS 공개 버킷의 base URL(끝에 슬래시 없이,
   * 예: https://storage.googleapis.com/<버킷이름>). manifest.json·각 폰트 .ttf 가 이 아래 있다.
   * 없으면 기본 번들 폰트(나눔고딕)만 쓰고 프리셋 목록은 비어 있다(오프라인 정상 동작).
   */
  readonly VITE_FONTS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
