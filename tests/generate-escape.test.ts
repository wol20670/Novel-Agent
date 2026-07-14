import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, esc, escRpyText, escLit } from '../src/renpy/generate';
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

describe('esc/escRpyText/escLit: escapeRpy 코어 통합 후 각 래퍼의 동작 단위 테스트', () => {
  it('esc: [ { % 이스케이프 + 개행은 공백으로 뭉개고 앞뒤를 trim한다', () => {
    expect(esc('  [속보] {태그} 20%\n둘째 줄  ')).toBe('[[속보] {{태그} 20%% 둘째 줄');
  });

  it('esc: \\r\\n 도 공백으로 처리된다(잔여 \\r 제거)', () => {
    expect(esc('첫 줄\r\n둘째 줄')).toBe('첫 줄 둘째 줄');
  });

  it('escRpyText: [ { % 이스케이프는 동일하되 개행은 \\n 리터럴로 보존한다', () => {
    expect(escRpyText('  [속보] {태그} 20%\n둘째 줄  ')).toBe('[[속보] {{태그} 20%%\\n둘째 줄');
  });

  it('escLit: {b}·[config.version!t] 같은 태그·보간은 보존하고 따옴표·%·개행만 처리한다', () => {
    expect(escLit('{b}굵게{/b} "인용" 20% 버전 [config.version!t]\n둘째 줄')).toBe(
      '{b}굵게{/b} \\"인용\\" 20%% 버전 [config.version!t]\\n둘째 줄',
    );
  });

  it('escLit: trim 하지 않는다(앞뒤 공백 보존)', () => {
    expect(escLit('  여백  ')).toBe('  여백  ');
  });
});
