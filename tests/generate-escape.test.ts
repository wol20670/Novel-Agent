import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene } from '../src/types';

function sceneWith(lines: Scene['lines']): Scene {
  return { id: 's1', title: '장면1', direction: [], cg: [], lines, choices: [], status: 'approved' };
}

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

describe('esc(): 대사·이름의 [ ] { } % 는 Ren\'Py 런타임 크래시를 막기 위해 이스케이프되어야 한다', () => {
  it('대사 텍스트의 [속보] {태그} 20% 가 [[ {{ %% 로 나온다', () => {
    const p = projectWith([
      sceneWith([{ kind: 'dialogue', speaker: '민주', text: '[속보] {태그} 20%' }]),
    ]);
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).toContain('[[속보] {{태그} 20%%');
    expect(s).not.toContain('"[속보]');
  });

  it('캐릭터 이름의 [ { 도 이스케이프된다', () => {
    const p: Project = {
      ...projectWith([sceneWith([{ kind: 'dialogue', speaker: '[특별]{손님}', text: '안녕' }])]),
      characters: [{ name: '[특별]{손님}', color: '#ffffff', expressions: {} }],
    };
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/characters.rpy')!.content;
    expect(s).toContain('Character(_("[[특별]{{손님}")');
  });
});
