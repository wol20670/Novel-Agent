/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 협업(실시간 공유)용 Supabase 프로젝트 URL — 빌드에 내장(anon key와 함께 공개돼도 되는 값). */
  readonly VITE_SUPABASE_URL?: string;
  /** 협업용 Supabase anon(public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
