import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, esc, escRpyText, escLit } from '../src/renpy/generate';
import type { Project } from '../src/types';
import { fileOf, contentOf, scene, dialogue, projectWith } from './fixtures';

describe('esc(): 대사·이름의 [ ] { } % 는 Ren\'Py 런타임 크래시를 막기 위해 이스케이프되어야 한다', () => {
  it('대사 텍스트의 [속보] {태그} 20% 가 [[ {{ %% 로 나온다', () => {
    const p = projectWith([
      scene({ lines: [dialogue('민주', '[속보] {태그} 20%')] }),
    ]);
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).toContain('[[속보] {{태그} 20%%');
    expect(s).not.toContain('"[속보]');
  });

  it('캐릭터 이름의 [ { 도 이스케이프된다', () => {
    const p: Project = {
      ...projectWith([scene({ lines: [dialogue('[특별]{손님}', '안녕')] })]),
      characters: [{ name: '[특별]{손님}', color: '#ffffff', expressions: {} }],
    };
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/characters.rpy')!.content;
    expect(s).toContain('Character(_("[[특별]{{손님}")');
  });
});

describe('esc(): optionsRpy(config.name/window_title/build.name, gui.about) 도 이스케이프를 거친다', () => {
  it('제목의 %/[ 가 config.name·config.window_title·build.name 세 곳 전부에 이스케이프되어 나온다', () => {
    const p: Project = {
      ...projectWith([scene({ lines: [dialogue('민주', '안녕')] })]),
      title: '세일 50% [특별판]',
    };
    const { files } = generateRenpyFiles(p);
    const opt = contentOf(files, 'game/options.rpy');
    expect(opt).toContain('define config.name = _("세일 50%% [[특별판]")');
    expect(opt).toContain('define config.window_title = "세일 50%% [[특별판]"');
    expect(opt).toContain('build.name = "세일 50%% [[특별판]"');
  });

  it('저자 이름의 { 가 gui.about 에 이스케이프되어 나온다', () => {
    const p: Project = {
      ...projectWith([scene({ lines: [dialogue('민주', '안녕')] })]),
      author: '작가{테스트}',
    };
    const { files } = generateRenpyFiles(p);
    const opt = contentOf(files, 'game/options.rpy');
    expect(opt).toContain('define gui.about = _("제작: 작가{{테스트}")');
  });
});

describe('esc(): creditsRpy(gui.credits_extra) — escRpyText 로 개행은 \\n 리터럴, [ { % 는 이스케이프', () => {
  it('크레딧 문구의 %/[/{/개행이 한 줄 문자열 리터럴로 안전하게 나온다', () => {
    const p: Project = {
      ...projectWith([scene({ lines: [dialogue('민주', '안녕')] })]),
      credits: '세일 20% [특전] {감사} 문구\n둘째 줄',
    };
    const { files } = generateRenpyFiles(p);
    const credits = contentOf(files, 'game/credits.rpy');
    expect(credits).toContain('define gui.credits_extra = "세일 20%% [[특전] {{감사} 문구\\n둘째 줄"');
  });
});

describe('esc(): uiStringsRpy(ui_strings.rpy) 의 escLit 경로 — 개행 포함 확인창 문구가 안전한 한 줄 리터럴로 나온다', () => {
  it('LOADING/MAIN_MENU 의 실제 개행이 리터럴 \\n 으로 바뀌어 layout./gui. 둘 다 정의된다(원래 개행이 그대로 남으면 문자열이 줄 중간에서 깨진다)', () => {
    const { files } = generateRenpyFiles(projectWith([scene({ lines: [dialogue('민주', '안녕')] })]));
    const ui = contentOf(files, 'game/ui_strings.rpy');
    expect(ui).toContain('layout.LOADING = "불러오면 저장하지 않은 진행이 사라집니다.\\n계속하시겠습니까?"');
    expect(ui).toContain('gui.LOADING = "불러오면 저장하지 않은 진행이 사라집니다.\\n계속하시겠습니까?"');
    expect(ui).toContain('layout.MAIN_MENU = "메인 메뉴로 돌아가시겠습니까?\\n저장하지 않은 진행이 사라집니다."');
  });
});

describe('esc(): 선택지 문구(menu 절)도 esc 를 거친다', () => {
  it('선택지 텍스트의 [ { % 가 이스케이프된다', () => {
    const p = projectWith([
      scene({
        lines: [dialogue('민주', '안녕')],
        choices: [{ text: '[할인] {진행} 20%', target: '끝' }],
      }),
    ]);
    const { files } = generateRenpyFiles(p);
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).toContain('"[[할인] {{진행} 20%%":');
  });
});

describe('esc(): 번역 키 대칭성 — tl/<lang>/script.rpy 의 old 키가 script.rpy 의 say 문 원문과 정확히 같은 이스케이프여야 한다', () => {
  it('% [ { 를 포함한 원문도 script.rpy 의 say 리터럴과 tl/english/script.rpy 의 old 리터럴이 완전히 같다(어긋나면 번역이 조용히 안 걸린다)', () => {
    const p: Project = {
      ...projectWith([
        scene({
          lines: [dialogue('민주', '할인 20% [특가] {오늘만}', { i18n: { en: 'Sale 20% off' } })],
        }),
      ]),
      characters: [{ name: '민주', color: '#e91e63', expressions: {} }],
      textLocales: ['ko', 'en'],
    };
    const { files } = generateRenpyFiles(p);
    const script = contentOf(files, 'game/script.rpy');
    const tl = contentOf(files, 'game/tl/english/script.rpy');

    // Ren'Py 는 old 문자열을 script.rpy 의 실제(이스케이프된) 문자열과 정확히 일치시켜 번역을
    // 찾는다 — 두 출력을 각각 실제 생성물에서 추출해 직접 비교한다(esc() 를 다시 호출해 기대값을
    // 만들지 않는다: generate-char-sides.test.ts 와 같은 이유로, 검증 대상 자체가 "두 출력이
    // 서로 같은가"이기 때문).
    const sayMatch = script.match(/c_1 "([^"]*)"/);
    expect(sayMatch).not.toBeNull();
    const oldMatch = tl.match(/old "([^"]*)"/);
    expect(oldMatch).not.toBeNull();

    expect(oldMatch![1]).toBe(sayMatch![1]);
    // 실제 이스케이프 결과 자체도 고정해 회귀를 잡는다.
    expect(sayMatch![1]).toBe('할인 20%% [[특가] {{오늘만}');
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
