import { describe, it, expect } from 'vitest';
import { generateGuiFiles, resolveTheme } from '../src/renpy/gui';
import { contentOf as fileOf } from './fixtures';

describe('generateGuiFiles: 해상도 비례 gui.scale() + 대사창 1/4 고정', () => {
  it('1080p: guisupport.rpy 에 배율 1.5, gui.rpy 에 textbox_height 270 이 박혀 나온다', () => {
    const theme = resolveTheme('romance');
    const files = generateGuiFiles(theme, 1920, 1080);
    const guisupport = fileOf(files, 'game/guisupport.rpy');
    const gui = fileOf(files, 'game/gui.rpy');

    // 예전엔 이 배율이 항등(n*1)이라 720p 용 UI 가 1080p 화면에 그대로 그려졌다 — 회귀 방지.
    expect(guisupport).toContain('n * 1.5000');
    expect(gui).toContain('define gui.textbox_height = 270');
    // 나머지 720p 기준 수치는 그대로 gui.scale() 을 거쳐 런타임에 배율이 곱해진다.
    expect(gui).toContain('define gui.text_size = gui.scale(22)');
    expect(gui).toContain('define gui.name_text_size = gui.scale(30)');
  });

  it('720p: 배율은 1, textbox_height 는 180', () => {
    const theme = resolveTheme('romance');
    const files = generateGuiFiles(theme, 1280, 720);
    const guisupport = fileOf(files, 'game/guisupport.rpy');
    const gui = fileOf(files, 'game/gui.rpy');

    expect(guisupport).toContain('n * 1.0000');
    expect(gui).toContain('define gui.textbox_height = 180');
  });

  it('gui.rpy 전체에 NaN/undefined 가 섞이지 않은 유효한 Ren\'Py 구문이다', () => {
    const theme = resolveTheme('horror');
    const files = generateGuiFiles(theme, 1920, 1080);
    const gui = fileOf(files, 'game/gui.rpy');
    const guisupport = fileOf(files, 'game/guisupport.rpy');
    expect(gui).not.toMatch(/NaN|undefined/);
    expect(guisupport).not.toMatch(/NaN|undefined/);
  });
});
