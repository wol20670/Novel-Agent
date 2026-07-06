// 폰트 프리셋 목록 — 사용자 소유 GCS 공개 버킷의 manifest.json 을 읽어온다(scripts/upload-fonts.mjs
// 가 올림). 폰트 추가는 그 스크립트 재실행만으로 끝나고 앱 재배포가 필요 없다(manifest 가 데이터).
//
// 경로 해석(fontGamePath)은 항상 동기(sync) 로 유지한다 — gui.rpy 를 만드는
// resolveTheme/withGuiOverrides(src/renpy/gui/theme.ts) 가 이미 앱 전역에서 동기 함수로 쓰이고
// 있어(LeftPanel 렌더 중 등) 여기서 async 로 바꾸면 파급이 크다. 대신 이 모듈이 모듈 스코프
// 캐시(catalogCache)를 두고, loadFontCatalog()(비동기, LeftPanel 마운트·buildZip 시작 시 호출)가
// 그 캐시를 채운 뒤, fontGamePath 는 "그 시점의 캐시"를 동기로 읽기만 한다. 캐시가 아직 없으면
// 기본 폰트로 안전하게 폴백한다.

export interface FontPreset {
  id: string;
  label: string; // 한글 표시명
  file: string; // 게임 내 파일명(예: 'NanumGothic.ttf') — game/fonts/<file> 로 그대로 씀
  category: '고딕' | '명조' | '손글씨' | '둥근' | '임팩트';
  /** false 면 상용 한글 2,350자만 커버(현대 한글 완전 미지원) — UI 에 "이름·제목 권장" 배지. */
  fullHangul: boolean;
  /** true 면 public/fonts 에 로컬 번들돼 있어 네트워크 없이도 항상 동작(기본 폰트만). */
  bundled?: boolean;
}

/** 기본 폰트 — 로컬 번들(public/fonts/NanumGothic.ttf), 매니페스트 로드 실패해도 항상 선택 가능. */
export const DEFAULT_FONT: FontPreset = {
  id: 'nanum-gothic',
  label: '나눔고딕 (기본)',
  file: 'NanumGothic.ttf',
  category: '고딕',
  fullHangul: true,
  bundled: true,
};

interface FontManifest {
  fonts: FontPreset[];
}

let catalogCache: FontPreset[] | null = null;
let inflight: Promise<FontPreset[]> | null = null;

/** GCS 버킷 base URL(끝 슬래시 제거). 미설정이면 빈 문자열(= 커스텀 폰트 기능 비활성). */
export function fontsBaseUrl(): string {
  return (import.meta.env.VITE_FONTS_BASE_URL ?? '').trim().replace(/\/$/, '');
}

/**
 * 매니페스트를 읽어와 카탈로그를 채운다(세션 내 1회만 fetch, 이후 캐시 반환).
 * base URL 미설정/네트워크 실패 시 조용히 기본 폰트만 담은 목록으로 폴백한다(오프라인 정상 동작).
 */
export async function loadFontCatalog(): Promise<FontPreset[]> {
  if (catalogCache) return catalogCache;
  if (inflight) return inflight;
  const base = fontsBaseUrl();
  if (!base) {
    catalogCache = [DEFAULT_FONT];
    return catalogCache;
  }
  inflight = (async () => {
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as FontManifest;
      const remote = Array.isArray(data.fonts) ? data.fonts : [];
      catalogCache = [DEFAULT_FONT, ...remote.filter((f) => f.id !== DEFAULT_FONT.id)];
    } catch (e) {
      console.warn('[fonts] 매니페스트 로드 실패(기본 폰트만 사용):', (e as Error).message);
      catalogCache = [DEFAULT_FONT];
    } finally {
      inflight = null;
    }
    return catalogCache!;
  })();
  return inflight;
}

/** 지금까지 로드된 카탈로그(동기). 아직 로드 전이면 기본 폰트만. */
export function getCachedCatalog(): FontPreset[] {
  return catalogCache ?? [DEFAULT_FONT];
}

/** id → FontPreset. 못 찾으면 기본 폰트. */
export function fontById(id: string | undefined): FontPreset {
  if (!id) return DEFAULT_FONT;
  return getCachedCatalog().find((f) => f.id === id) ?? DEFAULT_FONT;
}

/** id → gui.rpy/zip 이 공통으로 쓰는 게임 내 경로(예: 'fonts/NanumGothic.ttf'). 항상 동기. */
export function fontGamePath(id: string | undefined): string {
  return `fonts/${fontById(id).file}`;
}
