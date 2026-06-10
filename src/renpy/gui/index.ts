// 자체 GUI 파일 묶음 — generate.ts 가 호출.
// 텍스트(.rpy)만 생성한다. 메뉴 배경 PNG 는 브라우저 Canvas 가 buildZip 단계에서 채운다.

import type { RenpyFile } from '../generate';
import type { GuiTheme } from './theme';
import { guiRpy } from './guiRpy';
import { screensRpy } from './screensRpy';

// 스톡 guisupport.rpy 는 런처 gui7 로 PNG 를 자동 생성(SDK 경로 의존)한다.
// 우리는 zero-PNG(Solid) 라 그 부분을 빼고, gui.rpy 가 쓰는 gui.scale() 정의만 남긴다.
const GUISUPPORT_RPY = `# 자동 생성: gui.scale 정의 (스톡의 PNG 자동생성부 제거 — 우리는 Solid 기반)
init -100 python in gui:

    def scale(n):
        return int(n)
`;

/** GuiTheme + 해상도 → game/gui.rpy · screens.rpy · guisupport.rpy */
export function generateGuiFiles(theme: GuiTheme, width: number, height: number): RenpyFile[] {
  return [
    { path: 'game/guisupport.rpy', content: GUISUPPORT_RPY },
    { path: 'game/gui.rpy', content: guiRpy(theme, width, height) },
    { path: 'game/screens.rpy', content: screensRpy() },
  ];
}

export { resolveTheme, PRESETS, GENRE_OPTIONS, DEFAULT_GENRE } from './theme';
export type { GuiTheme, GenreId, MenuArtStyle } from './theme';
