/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 협업·Auth 용 Supabase 프로젝트 URL — 빌드에 내장(publishable key와 함께 공개돼도 되는 값). */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * Supabase publishable key(`sb_publishable_…`) — 협업 relay 와 Auth 가 함께 쓴다.
   * ⚠️ legacy anon JWT 용 `VITE_SUPABASE_ANON_KEY` 를 폴백으로 되살리지 말 것 — S1-B 에서 같은
   * deploy 안에서 원자적으로 교체했다. 두 이름을 `??` 로 잇는 순간 어느 키가 실제로 쓰였는지
   * 알 수 없게 되고, 옛 키가 살아 있는 동안 마이그레이션이 끝났는지 확인할 방법도 없어진다.
   * secret/service_role 키는 절대 이 자리에 넣지 않는다(RLS 를 통째로 우회한다).
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
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
