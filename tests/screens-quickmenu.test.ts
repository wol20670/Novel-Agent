import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene } from '../src/types';

function sceneWith(lines: Scene['lines']): Scene {
  return { id: 's1', title: '장면1', direction: [], cg: [], lines, choices: [], status: 'approved' };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

describe('quick_menu "숨기기" 버튼 — 대사창/메뉴를 감출 방법이 없다는 사용자 리포트에 대한 회귀 가드', () => {
  it('game/screens.rpy 는 데스크톱·터치 두 quick_menu 변형 모두에 HideInterface()/_("숨기기") 를 갖는다', () => {
    const p = projectWith([sceneWith([{ kind: 'narration', text: '안녕' }])]);
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/screens.rpy')!.content;

    const hideCount = (s.match(/HideInterface\(\)/g) ?? []).length;
    expect(hideCount).toBe(2); // 데스크톱 드롭다운 + 터치 variant
    expect(s).toContain('_("숨기기")');
  });

  it('버튼의 action 리스트에서 SetVariable("quick_menu_expanded", False) 가 HideInterface() 보다 먼저 온다', () => {
    const p = projectWith([sceneWith([{ kind: 'narration', text: '안녕' }])]);
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/screens.rpy')!.content;

    // "숨기기" 버튼 라인들을 찾아 각각 순서를 검사한다(데스크톱 드롭다운 + 터치 variant 둘 다).
    const hideButtonLines = s.split('\n').filter((line) => line.includes('_("숨기기")'));
    expect(hideButtonLines.length).toBe(2);
    for (const line of hideButtonLines) {
      const setVarIdx = line.indexOf('SetVariable("quick_menu_expanded", False)');
      const hideIdx = line.indexOf('HideInterface()');
      expect(setVarIdx).toBeGreaterThanOrEqual(0);
      expect(hideIdx).toBeGreaterThanOrEqual(0);
      expect(setVarIdx).toBeLessThan(hideIdx);
    }
  });

  it('영어 자막을 쓰는 프로젝트는 game/tl/english/ui.rpy 에 old "숨기기" / new "Hide UI" 쌍이 생긴다', () => {
    const p: Project = { ...projectWith([sceneWith([{ kind: 'narration', text: '안녕' }])]), textLocales: ['ko', 'en'] };
    const { files } = generateRenpyFiles(p);
    const ui = fileOf(files, 'game/tl/english/ui.rpy')!.content;

    expect(ui).toContain('old "숨기기"');
    expect(ui).toContain('new "Hide UI"');
  });
});

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}
