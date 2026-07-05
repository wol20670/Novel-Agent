import { describe, it, expect } from 'vitest';
import { parseText } from '../src/parser';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene } from '../src/types';

function sceneWith(lines: Scene['lines']): Scene {
  return { id: 's1', title: '장면1', direction: [], cg: [], lines, choices: [], status: 'approved' };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

describe('parser: #설정_이름', () => {
  it('원문 = en | ja 를 캐릭터 i18nName 으로 파싱한다', () => {
    const text = ['#설정_이름 한지수 = Jisoo Han | ハン・ジス', '#S 도입', '한지수: 안녕'].join('\n');
    const { characters } = parseText(text);
    const c = characters.find((c) => c.name === '한지수');
    expect(c?.i18nName).toEqual({ en: 'Jisoo Han', ja: 'ハン・ジス' });
  });

  it('en 만 있어도(ja 생략) 있는 것만 채운다', () => {
    const text = ['#설정_이름 강민주 = Minju Kang', '#S 도입', '강민주: 안녕'].join('\n');
    const { characters } = parseText(text);
    const c = characters.find((c) => c.name === '강민주');
    expect(c?.i18nName).toEqual({ en: 'Minju Kang' });
  });

  it('태그가 없는 캐릭터는 i18nName 이 undefined(하위호환)', () => {
    const { characters } = parseText(['#S 도입', '민주: 안녕'].join('\n'));
    expect(characters.find((c) => c.name === '민주')?.i18nName).toBeUndefined();
  });

  it('이름: 필드형 별칭도 동일하게 동작한다', () => {
    const text = ['이름: 한지수 = Jisoo Han | ハン・ジス', '#S 도입', '한지수: 안녕'].join('\n');
    const { characters } = parseText(text);
    expect(characters.find((c) => c.name === '한지수')?.i18nName).toEqual({
      en: 'Jisoo Han',
      ja: 'ハン・ジス',
    });
  });
});

describe('generateRenpyFiles: 캐릭터 이름 다국어 출력', () => {
  function projectWithName(): Project {
    const p = emptyProject();
    p.scenes = [sceneWith([{ kind: 'dialogue', speaker: '한지수', text: '안녕' }])];
    p.characters = [
      { name: '한지수', color: '#9fd3ff', expressions: {}, i18nName: { en: 'Jisoo Han', ja: 'ハン・ジス' } },
    ];
    return p;
  }

  it('characters.rpy 가 이름을 _() 로 감싸 등록한다', () => {
    const { files } = generateRenpyFiles(projectWithName());
    const chars = fileOf(files, 'game/characters.rpy')!.content;
    expect(chars).toContain('Character(_("한지수")');
  });

  it('tl/english, tl/japanese 의 script.rpy 에 이름 old/new 가 들어간다(자동 로케일 감지)', () => {
    const { files } = generateRenpyFiles(projectWithName());
    const en = fileOf(files, 'game/tl/english/script.rpy')!.content;
    const ja = fileOf(files, 'game/tl/japanese/script.rpy')!.content;
    expect(en).toContain('old "한지수"');
    expect(en).toContain('new "Jisoo Han"');
    expect(ja).toContain('old "한지수"');
    expect(ja).toContain('new "ハン・ジス"');
  });

  it('i18nName 이 없는 프로젝트는 이름 번역이 없고(하위호환) tl 파일 자체가 생략된다', () => {
    const p = emptyProject();
    p.scenes = [sceneWith([{ kind: 'dialogue', speaker: '민주', text: '안녕' }])];
    p.characters = [{ name: '민주', color: '#9fd3ff', expressions: {} }];
    const { files } = generateRenpyFiles(p);
    expect(fileOf(files, 'game/characters.rpy')!.content).toContain('Character(_("민주")');
    expect(fileOf(files, 'game/tl/english/script.rpy')).toBeFalsy();
    expect(fileOf(files, 'game/tl/japanese/script.rpy')).toBeFalsy();
  });
});
