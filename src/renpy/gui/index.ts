// 자체 GUI 파일 묶음 — generate.ts 가 호출.
// 텍스트(.rpy)만 생성한다. 메뉴 배경 PNG 는 브라우저 Canvas 가 buildZip 단계에서 채운다.

import type { RenpyFile } from '../generate';
import type { Locale } from '../../types';
import type { GuiTheme } from './theme';
import { guiRpy } from './guiRpy';
import { screensRpy } from './screensRpy';

/** 설정 화면에 낼 다국어 선택 목록(자막·음성 각각). 각 2개 이상일 때만 해당 선택 UI 가 생긴다. */
export interface GuiLocales {
  text: Locale[];
  voice: Locale[];
}

// 스톡 guisupport.rpy 는 런처 gui7 로 PNG 를 자동 생성(SDK 경로 의존)한다.
// 우리는 zero-PNG(Solid) 라 그 부분을 빼고, gui.rpy 가 쓰는 gui.scale() 정의만 남긴다.
// 배율은 생성 시점에 리터럴로 굽는다(런타임 gui.init 순서에 기대지 않음).
const guisupportRpy = (height: number) => `# 자동 생성: gui.scale 정의 (스톡의 PNG 자동생성부 제거 — 우리는 Solid 기반)
# 스톡 Ren'Py 와 동일하게 720p 기준 수치에 해상도 배율을 곱한다(1080p → 1.5배).
# 예전엔 이 배율이 빠져 있어(항등 함수) 720p 용 UI 가 1080p 화면에 그대로 그려졌다.
init -100 python in gui:

    def scale(n):
        return int(round(n * ${(height / 720).toFixed(4)}))
`;

/** GuiTheme + 해상도 → game/gui.rpy · screens.rpy · guisupport.rpy */
export function generateGuiFiles(
  theme: GuiTheme,
  width: number,
  height: number,
  outline?: { enabled: boolean; color: string },
  dialogueGradient?: boolean,
  locales?: GuiLocales,
  hasItems?: boolean,
  hasCg?: boolean,
): RenpyFile[] {
  // 일본어(자막·음성 어느 쪽이든)가 하나라도 있으면 gui.rpy 가 JP 폰트(FontGroup)를 참조·번들한다.
  // 없으면 생략 → buildZip 의 폰트 번들 조건과 일치해야 한다(같은 규칙: ja ∈ text|voice).
  const japanese = !!locales && (locales.text.includes('ja') || locales.voice.includes('ja'));
  return [
    { path: 'game/guisupport.rpy', content: guisupportRpy(height) },
    { path: 'game/gui.rpy', content: guiRpy(theme, width, height, outline, dialogueGradient, japanese) },
    { path: 'game/screens.rpy', content: screensRpy(locales, hasItems, hasCg) },
  ];
}

export { resolveTheme, PRESETS, GENRE_OPTIONS, DEFAULT_GENRE, withGuiOverrides, hexWithAlpha } from './theme';
export type { GuiTheme, GenreId, GuiOverrides } from './theme';
