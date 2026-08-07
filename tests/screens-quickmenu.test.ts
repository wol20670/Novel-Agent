import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import type { Project } from '../src/types';
import { contentOf, scene, projectWith } from './fixtures';

describe('quick_menu "숨기기" 버튼 — 대사창/메뉴를 감출 방법이 없다는 사용자 리포트에 대한 회귀 가드', () => {
  it('game/screens.rpy 는 데스크톱·터치 두 quick_menu 변형 모두에 HideInterface()/_("숨기기") 를 갖는다', () => {
    const p = projectWith([scene({ lines: [{ kind: 'narration', text: '안녕' }] })]);
    const { files } = generateRenpyFiles(p);
    const s = contentOf(files, 'game/screens.rpy');

    const hideCount = (s.match(/HideInterface\(\)/g) ?? []).length;
    expect(hideCount).toBe(2); // 데스크톱 드롭다운 + 터치 variant
    expect(s).toContain('_("숨기기")');
  });

  it('버튼의 action 리스트에서 SetVariable("quick_menu_expanded", False) 가 HideInterface() 보다 먼저 온다', () => {
    const p = projectWith([scene({ lines: [{ kind: 'narration', text: '안녕' }] })]);
    const { files } = generateRenpyFiles(p);
    const s = contentOf(files, 'game/screens.rpy');

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
    const p: Project = {
      ...projectWith([scene({ lines: [{ kind: 'narration', text: '안녕' }] })]),
      textLocales: ['ko', 'en'],
    };
    const { files } = generateRenpyFiles(p);
    const ui = contentOf(files, 'game/tl/english/ui.rpy');

    expect(ui).toContain('old "숨기기"');
    expect(ui).toContain('new "Hide UI"');
  });
});

describe('quickMenuUi 미지정 — 텍스트 퀵메뉴 회귀 0 (mainMenuUi 와 같은 계약)', () => {
  it('quickMenuUi 가 없으면 quick_menu 화면은 이미지 모드로 전환되지 않는다', () => {
    const p = projectWith([scene({ lines: [{ kind: 'narration', text: '안녕' }] })]);
    const { files } = generateRenpyFiles(p);
    const s = contentOf(files, 'game/screens.rpy');

    expect(s).toContain('textbutton _("메뉴"):');
    // 이 프로젝트는 mainMenuUi 도 미설정이라 파일 전체에 imagebutton/gui/quick 참조가 전혀 없어야 한다.
    expect(s).not.toContain('imagebutton');
    expect(s).not.toContain('gui/quick/');
  });
});
