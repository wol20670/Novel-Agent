import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene, type Line } from '../src/types';

function sceneWith(cg: string[], lines?: Line[], id = 's1', title = '장면1'): Scene {
  return {
    id,
    title,
    direction: [],
    cg,
    lines: lines ?? [{ kind: 'dialogue', speaker: '민주', text: '안녕' }],
    choices: [],
    status: 'approved',
  };
}

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

describe('generateRenpyFiles: CG 가 없으면 갤러리 관련 출력을 내지 않는다', () => {
  const { files } = generateRenpyFiles(
    projectWith([sceneWith([], [{ kind: 'dialogue', speaker: '민주', text: '안녕' }])]),
  );

  it('cg.rpy 를 만들지 않는다', () => {
    expect(fileOf(files, 'game/cg.rpy')).toBeFalsy();
  });

  it('screens.rpy 에 cg_gallery 화면·감상한 CG 문구가 없다', () => {
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).not.toContain('screen cg_gallery');
    expect(sc).not.toContain('감상한 CG');
  });
});

describe('generateRenpyFiles: CG 갤러리 출력', () => {
  const lines: Line[] = [
    { kind: 'cg', desc: '노을 아래 재회' },
    { kind: 'dialogue', speaker: '민주', text: '안녕' },
  ];
  const p = projectWith([sceneWith(['노을 아래 재회'], lines)]);
  const { files } = generateRenpyFiles(p);

  it('cg.rpy 가 persistent 기본값·갤러리 목록과 함께 생성된다', () => {
    const cg = fileOf(files, 'game/cg.rpy');
    expect(cg).toBeTruthy();
    expect(cg!.content).toContain('default persistent.cg_seen = dict()');
    expect(cg!.content).toContain('define gui.cgs_all = [ ("cg_1", "노을 아래 재회") ]');
  });

  it('script.rpy 는 scene cg_1_scene 진입 직전에 persistent.cg_seen 을 기록한다', () => {
    const s = fileOf(files, 'game/script.rpy')!.content;
    const idx = s.indexOf('scene cg_1_scene with dissolve');
    expect(idx).toBeGreaterThan(-1);
    const before = s.slice(0, idx).trimEnd();
    expect(before.endsWith('$ persistent.cg_seen["cg_1"] = True')).toBe(true);
  });

  it('screens.rpy 에 갤러리 화면·라이트박스·내비 버튼이 들어간다', () => {
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('screen cg_gallery():');
    expect(sc).toContain('screen gallery_lightbox(img, caption):');
    expect(sc).toContain('textbutton _("감상한 CG") action ShowMenu("cg_gallery")');
  });
});

describe('generateRenpyFiles: 같은 CG 설명이 여러 장면에 쓰이면 갤러리엔 한 번만', () => {
  it('gui.cgs_all 에 cg_1 항목이 한 번만 나오고 cg_2 는 생기지 않는다', () => {
    const desc = '공원에서의 산책';
    const p = projectWith([
      sceneWith([desc], [{ kind: 'cg', desc }], 's1', '장면1'),
      sceneWith([desc], [{ kind: 'cg', desc }], 's2', '장면2'),
    ]);
    const { files } = generateRenpyFiles(p);
    const cg = fileOf(files, 'game/cg.rpy')!.content;
    expect(cg).toContain(`define gui.cgs_all = [ ("cg_1", "${desc}") ]`);
    expect(cg).not.toContain('cg_2');
  });
});

describe('generateRenpyFiles: 아이템·CG 갤러리가 함께 있어도 gallery_lightbox 는 1번만', () => {
  it('screens.rpy 에 screen gallery_lightbox 정의가 정확히 1번 나온다', () => {
    const lines: Line[] = [
      { kind: 'item', name: '편지' },
      { kind: 'cg', desc: '노을 아래 재회' },
    ];
    const p = projectWith([sceneWith(['노을 아래 재회'], lines)]);
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    const count = (sc.match(/screen gallery_lightbox\(/g) ?? []).length;
    expect(count).toBe(1);
    // 두 갤러리 화면·내비 버튼이 모두 존재.
    expect(sc).toContain('screen item_gallery():');
    expect(sc).toContain('screen cg_gallery():');
    expect(sc).toContain('textbutton _("발견한 아이템") action ShowMenu("item_gallery")');
    expect(sc).toContain('textbutton _("감상한 CG") action ShowMenu("cg_gallery")');
  });
});

describe('generateRenpyFiles: 메뉴 배경이 화면에 꽉 차도록(fit=cover) 렌더된다', () => {
  it('screens.rpy 가 main_menu_background/game_menu_background 를 Transform(fit="cover")로 감싼다', () => {
    const { files } = generateRenpyFiles(projectWith([sceneWith([])]));
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('Transform(gui.main_menu_background, fit="cover"');
    expect(sc).toContain('Transform(gui.game_menu_background, fit="cover"');
  });
});
