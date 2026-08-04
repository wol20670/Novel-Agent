import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene, type Line } from '../src/types';

function sceneWith(cg: string[], lines: Line[], id = 's1', title = '장면1'): Scene {
  return { id, title, direction: [], cg, lines, choices: [], status: 'approved' };
}

function projectWith(scenes: Scene[], extra?: Partial<Project>): Project {
  return { ...emptyProject(), scenes, ...extra };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

const plainScene = () => sceneWith([], [{ kind: 'dialogue', speaker: '민주', text: '안녕' }]);

describe('generateRenpyFiles: mainMenuUi 미지정(회귀 0)', () => {
  it('game/screens.rpy 에 imagebutton 이 없고 use navigation 이 그대로 있다', () => {
    const { files } = generateRenpyFiles(projectWith([plainScene()]));
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).not.toContain('imagebutton');
    expect(sc).toContain('use navigation');
  });
});

describe('generateRenpyFiles: 6슬롯 전부 idle 이미지 업로드', () => {
  const p = projectWith([plainScene()], {
    mainMenuUi: {
      buttons: {
        start: { idle: 'a1' },
        continue: { idle: 'a2' },
        load: { idle: 'a3' },
        prefs: { idle: 'a4' },
        gallery: { idle: 'a5' },
        quit: { idle: 'a6' },
      },
    },
  });
  const { files } = generateRenpyFiles(p);
  const sc = fileOf(files, 'game/screens.rpy')!.content;

  it('imagebutton 이 6개 나온다', () => {
    const count = (sc.match(/imagebutton:/g) ?? []).length;
    expect(count).toBe(6);
  });

  it('vbox 좌표가 스펙 기본값(x96/y350/gap12)대로 나온다(1920x1080 기준 scale=1)', () => {
    expect(sc).toContain('xpos 96');
    expect(sc).toContain('ypos 350');
    expect(sc).toContain('spacing 12');
  });

  it('hover_xoffset 8 이 나온다(기본 hoverShiftX)', () => {
    expect(sc).toContain('hover_xoffset 8');
  });

  it('focus_mask 는 나오지 않는다(투명 여백 많은 아트에서 hover/클릭이 막히는 실기 확인 버그)', () => {
    expect(sc).not.toContain('focus_mask');
  });
});

describe('generateRenpyFiles: 이어하기(continue) 슬롯', () => {
  it('FileLoad(continue_slot, ...) 와 sensitive continue_slot is not None 이 이어하기에만 나온다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { buttons: { continue: { idle: 'a2' } } },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('$ continue_slot = renpy.newest_slot(r"\\d+")');
    expect(sc).toContain('action FileLoad(continue_slot, slot=True, confirm=False)');
    expect(sc).toContain('sensitive continue_slot is not None');
    // 다른 5개 슬롯(전부 텍스트버튼 폴백)에는 continue_slot 참조가 없어야 한다.
    const nonContinueLines = sc
      .split('\n')
      .filter((l) => l.includes('textbutton') && !l.includes('정보') && !l.includes('크레딧') && !l.includes('도움말'));
    expect(nonContinueLines.some((l) => l.includes('continue_slot'))).toBe(false);
  });
});

describe('generateRenpyFiles: idle 없는 슬롯은 텍스트 버튼으로 폴백', () => {
  it('환경설정(prefs) 에 idle 이 없으면 textbutton _("환경설정") 로 나온다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { buttons: { start: { idle: 'a1' } } }, // prefs 는 아예 없음
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('textbutton _("환경설정") action ShowMenu("preferences")');
  });
});

describe('generateRenpyFiles: 갤러리 버튼 대상(galleryTarget)', () => {
  const withGallery = (extraLines: Line[], cg: string[]) =>
    projectWith([sceneWith(cg, [{ kind: 'dialogue', speaker: '민주', text: '안녕' }, ...extraLines])], {
      mainMenuUi: { buttons: { gallery: { idle: 'a5' } } },
    });

  it('아이템만 있으면 ShowMenu("item_gallery")', () => {
    const p = withGallery([{ kind: 'item', name: '편지' }], []);
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('action ShowMenu("item_gallery")');
    expect(sc).not.toContain('screen gallery_hub');
  });

  it('CG만 있으면 ShowMenu("cg_gallery")', () => {
    const p = withGallery([{ kind: 'cg', desc: '노을 아래 재회' }], ['노을 아래 재회']);
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('action ShowMenu("cg_gallery")');
    expect(sc).not.toContain('screen gallery_hub');
  });

  it('아이템·CG 둘 다 있으면 ShowMenu("gallery_hub") + screen gallery_hub 방출', () => {
    const p = withGallery(
      [{ kind: 'item', name: '편지' }, { kind: 'cg', desc: '노을 아래 재회' }],
      ['노을 아래 재회'],
    );
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('action ShowMenu("gallery_hub")');
    expect(sc).toContain('screen gallery_hub():');
    expect(sc).toContain('style_prefix "navigation"');
  });

  it('둘 다 없으면 sensitive False 이고 screen gallery_hub 는 없다', () => {
    const p = withGallery([], []);
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('sensitive False');
    expect(sc).toContain('action NullAction()');
    expect(sc).not.toContain('screen gallery_hub');
  });
});

describe('generateRenpyFiles: 해상도 배율(height/1080)', () => {
  it('1280x720 프로젝트는 좌표가 2/3 배율로 축소된다(xpos 64, ypos 233)', () => {
    const p = projectWith([plainScene()], {
      width: 1280,
      height: 720,
      mainMenuUi: { buttons: { start: { idle: 'a1' } } },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('xpos 64');
    expect(sc).toContain('ypos 233');
  });
});

describe('generateRenpyFiles: 타이틀 로고', () => {
  it('로고가 있으면 gui/title_logo.png 가 나오고 [config.name!t] 텍스트 블록은 안 나온다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { buttons: { start: { idle: 'a1' } }, logo: 'logo1' },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('add Transform("gui/title_logo.png"');
    expect(sc).not.toContain('text "[config.name!t]"');
  });

  it('logoAspect 를 주면 비율대로(700x350 = 2:1) xysize 가 나온다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { buttons: { start: { idle: 'a1' } }, logo: 'logo1', logoAspect: 2 },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('xysize=(700, 350)');
  });

  it('logoAspect 를 안 주면 폴백 3(700x233) 이 쓰인다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { buttons: { start: { idle: 'a1' } }, logo: 'logo1' },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('xysize=(700, 233)');
  });
});
