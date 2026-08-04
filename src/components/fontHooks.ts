// LeftPanel(대사창 폰트)과 MainMenuGui(메뉴 폰트) 둘 다 "GCS 폰트 카탈로그를 불러와 카테고리별로
// 묶고, 고른 id 로 미리보기 CSS font-family 를 얻는다"는 같은 패턴을 쓴다. 로직이 갈라지면 한쪽만
// 고치고 잊어버리기 쉬워(예: 매니페스트 로드 실패 폴백 문구) 훅으로 뽑아 공용화한다.

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_FONT, getCachedCatalog, loadFontCatalog } from '../fonts/fontCatalog';
import type { FontPreset } from '../fonts/fontCatalog';
import { loadFontFace } from '../fonts/fontCache';

export type { FontPreset };
export { DEFAULT_FONT };

/**
 * 폰트 카탈로그(GCS 매니페스트, loadFontCatalog 가 세션 내 1회만 fetch)를 카테고리별로 묶어 반환.
 * customAvailable=false 면 매니페스트 로드 실패/미설정(오프라인 정상 동작, 기본 폰트만 사용 가능).
 */
export function useFontCatalog(): {
  fonts: FontPreset[];
  grouped: [string, FontPreset[]][];
  customAvailable: boolean;
} {
  const [fonts, setFonts] = useState<FontPreset[]>(getCachedCatalog());
  useEffect(() => {
    loadFontCatalog().then(setFonts);
  }, []);
  const grouped = useMemo(() => {
    const byCat = new Map<string, FontPreset[]>();
    for (const f of fonts) {
      const list = byCat.get(f.category) ?? [];
      list.push(f);
      byCat.set(f.category, list);
    }
    return [...byCat.entries()];
  }, [fonts]);
  return { fonts, grouped, customAvailable: fonts.length > 1 };
}

/** 폰트 id → 미리보기용 CSS font-family(로드 전/실패 시 undefined = 브라우저 기본 폰트). */
export function useFontFamily(id: string | undefined): string | undefined {
  const [family, setFamily] = useState<string>();
  useEffect(() => {
    let alive = true;
    setFamily(undefined);
    loadFontFace(id).then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return family;
}

/** select 의 "미지정(따라감)" 옵션 값 — 빈 문자열 대신 명시적 sentinel(빈 문자열도 유효한 id 로 오인 방지). */
export const INHERIT_FONT = '__inherit__';
