// 인게임 우측 퀵메뉴 이미지 GUI(project.quickMenuUi) — mainMenuUi 와 같은 계약(회귀 0 + 슬롯별
// idle 폴백)을 검증한다. tests/fixtures.ts 는 이 작업의 편집 대상이 아니므로 블록 추출 헬퍼는
// 이 파일 안에 로컬로 둔다(tests/main-menu-ui.test.ts 의 mainMenuBlock() 과 같은 이유).

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import type { QuickButtonSlot, QuickButtonState } from '../src/types';
import { QUICK_MENU_SLOTS } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

/**
 * game/screens.rpy 전체에는 'imagebutton'/'textbutton' 이 다른 화면(메인 메뉴 등)에도 나올 수 있어,
 * "이 좌표/이미지가 나온다·안 나온다" 류의 검증은 데스크톱 quick_menu 화면 정의로 범위를 좁혀야 한다.
 * 터치 variant(`screen quick_menu(): variant "touch"`)는 항상 그 뒤에 별도로 존재하고, 데스크톱
 * 정의는 screensRpy.ts 의 base 템플릿에서 `${quickMenuScreen}` 바로 뒤에
 * 'config.overlay_screens.append("quick_menu")' 가 오므로 그 직전까지 자르면 데스크톱 화면만 남는다.
 */
function quickMenuDesktopBlock(sc: string): string {
  const start = sc.indexOf('screen quick_menu():');
  const end = sc.indexOf('config.overlay_screens.append("quick_menu")', start);
  return sc.slice(start, end);
}

const plainScene = () => scene({ lines: [dialogue('민주', '안녕')] });

/** 지정한 상태들을 지정한 슬롯들에 채운 quickMenuUi.buttons 픽스처(assetId 는 `<slot>_<state>` 형태). */
function quickButtons(
  states: QuickButtonState[],
  slots: QuickButtonSlot[] = QUICK_MENU_SLOTS.map((s) => s.id),
): Partial<Record<QuickButtonSlot, Partial<Record<QuickButtonState, string>>>> {
  const out: Partial<Record<QuickButtonSlot, Partial<Record<QuickButtonState, string>>>> = {};
  for (const slot of slots) {
    const perState: Partial<Record<QuickButtonState, string>> = {};
    for (const st of states) perState[st] = `${slot}_${st}`;
    out[slot] = perState;
  }
  return out;
}

describe('generateRenpyFiles: quickMenuUi 게이트 — menu.idle 없으면 텍스트 모드 그대로', () => {
  it('quickMenuUi 자체가 없으면 이미지 모드가 아니다', () => {
    const p = projectWith([plainScene()]);
    const { files } = generateRenpyFiles(p);
    const block = quickMenuDesktopBlock(contentOf(files, 'game/screens.rpy'));
    expect(block).toContain('textbutton _("메뉴"):');
    expect(block).not.toContain('imagebutton');
    expect(block).not.toContain('gui/quick/');
  });

  it('menu 이외의 슬롯만 업로드해도(menu.idle 없음) 이미지 모드로 전환되지 않는다', () => {
    const p = projectWith([plainScene()], {
      quickMenuUi: { buttons: quickButtons(['idle'], ['back', 'history']) },
    });
    const { files } = generateRenpyFiles(p);
    const block = quickMenuDesktopBlock(contentOf(files, 'game/screens.rpy'));
    expect(block).toContain('textbutton _("메뉴"):');
    expect(block).not.toContain('imagebutton');
    expect(block).not.toContain('gui/quick/');
  });
});

describe('generateRenpyFiles: quickMenuUi 전체 업로드(1920x1080, scale=1)', () => {
  const p = projectWith([plainScene()], {
    quickMenuUi: {
      buttons: {
        ...quickButtons(['idle', 'hover', 'disabled'], QUICK_MENU_SLOTS.map((s) => s.id)),
        skip: { idle: 'skip_idle', hover: 'skip_hover', disabled: 'skip_disabled', selected: 'skip_selected' },
        auto: { idle: 'auto_idle', hover: 'auto_hover', disabled: 'auto_disabled', selected: 'auto_selected' },
      },
      panel: 'panel1',
    },
  });
  const { files } = generateRenpyFiles(p);
  const sc = contentOf(files, 'game/screens.rpy');
  const block = quickMenuDesktopBlock(sc);

  it('imagebutton 이 10개(메뉴 토글 + 목록 9개) 나온다', () => {
    expect((block.match(/imagebutton:/g) ?? []).length).toBe(10);
  });

  it('패널 add 가 모든 imagebutton 보다 먼저 나온다(메뉴 토글 포함)', () => {
    const panelIdx = block.indexOf('add Transform("gui/quick/panel.png"');
    const firstButtonIdx = block.indexOf('imagebutton:');
    expect(panelIdx).toBeGreaterThanOrEqual(0);
    expect(panelIdx).toBeLessThan(firstButtonIdx);
  });

  it('패널 좌표 xpos 1688 / ypos 0, 크기 232x625', () => {
    expect(block).toContain('xpos 1688');
    expect(block).toContain('ypos 0');
    expect(block).toContain('xysize=(232, 625)');
  });

  it('모든 버튼 xpos 1718(btnX)', () => {
    expect((block.match(/xpos 1718/g) ?? []).length).toBe(10);
  });

  it('메뉴/목록 9개의 ypos 가 스펙 그대로(16/82/135/188/241/294/347/400/453/506)', () => {
    for (const y of [16, 82, 135, 188, 241, 294, 347, 400, 453, 506]) {
      expect(block).toContain(`ypos ${y}`);
    }
  });

  it('selected_idle/selected_hover 는 skip/auto 에만 나온다(다른 8개는 selectable 이 아니다)', () => {
    expect(block).toContain('selected_idle "gui/quick/skip_selected.png"');
    expect(block).toContain('selected_hover "gui/quick/skip_hover.png"');
    expect(block).toContain('selected_idle "gui/quick/auto_selected.png"');
    expect(block).toContain('selected_hover "gui/quick/auto_hover.png"');
    for (const slot of ['menu', 'back', 'history', 'hide', 'save', 'qsave', 'qload', 'prefs']) {
      expect(block).not.toContain(`${slot}_selected.png`);
    }
  });

  it('insensitive 는 disabled 이미지가 있는 슬롯마다(10개) 나온다', () => {
    expect((block.match(/insensitive "gui\/quick\//g) ?? []).length).toBe(10);
  });

  it('focus_mask 는 어디에도 없다', () => {
    expect(block).not.toContain('focus_mask');
  });

  it('press 이미지는 절대 참조되지 않는다', () => {
    expect(block).not.toContain('_press.png');
  });

  it('alternate Skip(fast=True, confirm=True) 가 살아있다(스킵 길게 누르기)', () => {
    expect(block).toContain('alternate Skip(fast=True, confirm=True)');
  });

  it('hide 액션은 SetVariable 이 HideInterface 보다 먼저 온다(순서 고정)', () => {
    const idx = block.indexOf("action [SetVariable(\"quick_menu_expanded\", False), HideInterface()]");
    expect(idx).toBeGreaterThanOrEqual(0);
  });
});

describe('generateRenpyFiles: quickMenuUi 부분 업로드 — 슬롯별 이미지/텍스트 혼합 폴백', () => {
  it('menu + 목록 3개만 idle 이 있으면 imagebutton 4개 + 나머지 6개는 원래 알약 textbutton 폴백(같은 절대좌표)', () => {
    const p = projectWith([plainScene()], {
      quickMenuUi: {
        buttons: {
          menu: { idle: 'menu_idle' },
          back: { idle: 'back_idle' },
          history: { idle: 'history_idle' },
          hide: { idle: 'hide_idle' },
        },
      },
    });
    const { files } = generateRenpyFiles(p);
    const block = quickMenuDesktopBlock(contentOf(files, 'game/screens.rpy'));

    expect((block.match(/imagebutton:/g) ?? []).length).toBe(4); // menu + back + history + hide

    for (const label of ['스킵', '자동', '저장', '빠른저장', '빠른불러오기', '설정']) {
      expect(block).toContain(`textbutton _("${label}"):`);
    }
    // 폴백 textbutton 도 이미지가 있었다면 쓰였을 것과 같은 절대좌표(스킵 = ypos 188)에 위치.
    const skipIdx = block.indexOf('textbutton _("스킵"):');
    const skipEnd = block.indexOf('\n\n', skipIdx);
    const skipChunk = block.slice(skipIdx, skipEnd >= 0 ? skipEnd : undefined);
    expect(skipChunk).toContain('style "quick_button"');
    expect(skipChunk).toContain('xpos 1718');
    expect(skipChunk).toContain('ypos 188');
    expect(skipChunk).toContain('alternate Skip(fast=True, confirm=True)');
  });
});

describe('generateRenpyFiles: 해상도 배율(height/1080) — 1280x720', () => {
  it('좌표가 Math.round(원본 * 720/1080) 로 스케일된다(gui.scale() 미사용)', () => {
    const p = projectWith([plainScene()], {
      width: 1280,
      height: 720,
      quickMenuUi: {
        buttons: quickButtons(['idle'], QUICK_MENU_SLOTS.map((s) => s.id)),
        panel: 'panel1',
      },
    });
    const { files } = generateRenpyFiles(p);
    const block = quickMenuDesktopBlock(contentOf(files, 'game/screens.rpy'));

    const scale = 720 / 1080;
    const scaled = (n: number) => Math.round(n * scale);

    expect(block).toContain(`xpos ${scaled(1718)}`);
    for (const y of [16, 82, 135, 188, 241, 294, 347, 400, 453, 506]) {
      expect(block).toContain(`ypos ${scaled(y)}`);
    }
    expect(block).toContain(`xpos ${scaled(1688)}`);
    expect(block).toContain(`xysize=(${scaled(232)}, ${scaled(625)})`);
    expect(block).not.toContain('gui.scale(');
  });
});

describe('generateRenpyFiles: 패널 미업로드', () => {
  it('패널 없이도 버튼 10개는 정상 렌더되고 gui/quick/panel.png 참조가 없다', () => {
    const p = projectWith([plainScene()], {
      quickMenuUi: { buttons: quickButtons(['idle'], QUICK_MENU_SLOTS.map((s) => s.id)) },
    });
    const { files } = generateRenpyFiles(p);
    const block = quickMenuDesktopBlock(contentOf(files, 'game/screens.rpy'));
    expect(block).not.toContain('gui/quick/panel.png');
    expect((block.match(/imagebutton:/g) ?? []).length).toBe(10);
  });
});

describe('generateRenpyFiles: press 이미지는 업로드해도 절대 참조되지 않는다', () => {
  it('menu.press 를 채워도 _press.png 는 어디에도 없다(이미지 모드는 idle 만으로 활성화)', () => {
    const p = projectWith([plainScene()], {
      quickMenuUi: { buttons: { menu: { idle: 'menu_idle', press: 'menu_press' } } },
    });
    const { files } = generateRenpyFiles(p);
    const block = quickMenuDesktopBlock(contentOf(files, 'game/screens.rpy'));
    expect(block).not.toContain('_press.png');
    expect(block).toContain('imagebutton:');
  });
});
