import { describe, it, expect, vi } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene, type Line } from '../src/types';

// fontGamePath 를 부분 모킹 — 실제 GCS 카탈로그 없이도(테스트 환경엔 네트워크가 없다) 메뉴 폰트
// 배선(project.mainMenuUi.menuFontId/menuSubFontId → gui.rpy 의 define)이 정확한 id 를 쓰는지
// 구분해서 검증하기 위함('menu-serif' 만 가짜 경로, 나머지 id 는 실제 폴백(기본 폰트) 그대로).
vi.mock('../src/fonts/fontCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/fonts/fontCatalog')>();
  return {
    ...actual,
    fontGamePath: (id?: string) => (id === 'menu-serif' ? 'fonts/MenuSerif.ttf' : actual.fontGamePath(id)),
  };
});

function sceneWith(cg: string[], lines: Line[], id = 's1', title = '장면1'): Scene {
  return { id, title, direction: [], cg, lines, choices: [], status: 'approved' };
}

function projectWith(scenes: Scene[], extra?: Partial<Project>): Project {
  return { ...emptyProject(), scenes, ...extra };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

// screens.rpy 전체에는 "xalign 0.5"/"xanchor ..." 가 다른 화면(세이브 슬롯·페이지 라벨 등)에도
// 무수히 등장한다 — "이 좌표가 안 나온다" 류의 부재 검증은 반드시 main_menu 컨테이너 블록으로
// 범위를 좁혀야 한다(continue_slot 대입부터 링크 버튼 전 null height 스페이서 직전까지).
// 'null height' 는 세로 배치 스페이서뿐 아니라 preferences 화면(정적 템플릿)에도 나오므로,
// 반드시 screen main_menu() 정의가 끝나는 지점('style main_menu_frame is empty' — base 템플릿에서
// 항상 그 화면 바로 다음에 온다)까지로 잘라야 한다.
function mainMenuBlock(sc: string): string {
  const start = sc.indexOf('$ continue_slot = renpy.newest_slot');
  const end = sc.indexOf('style main_menu_frame is empty', start);
  return sc.slice(start, end);
}

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

// ── 배치 프리셋 5종 ──────────────────────────────────────────────────────────
// 아래 시나리오들은 버튼 이미지를 하나도 안 올린 "순수 텍스트 프리셋"이다 — preset 을 기본값
// (left-column)이 아닌 걸로 바꾸는 것 자체가 buildMainMenuPlan 의 활성화 사유라(이미지·로고와
// 별개), 이미지 없이도 프리셋별 컨테이너·라벨이 그대로 나가는지 검증할 수 있다.

describe('generateRenpyFiles: 프리셋 5종 — 컨테이너/정렬/좌표(1920x1080, scale=1)', () => {
  it('left-column — 라벨 오버라이드만으로 활성화, vbox 좌표는 스펙 기본값 그대로(xanchor/xalign 없음)', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { preset: 'left-column', labels: { start: { main: '왼쪽시작' } } },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('vbox:');
    expect(sc).toContain('xpos 96');
    expect(sc).toContain('ypos 350');
    expect(sc).toContain('spacing 12');
    expect(mainMenuBlock(sc)).not.toContain('xanchor');
    expect(mainMenuBlock(sc)).not.toContain('xalign');
    expect(sc).toContain('textbutton _("왼쪽시작") action Start() style_prefix "mm"');
  });

  it('bottom-row — hbox + xalign 0.5 + 좌표(0/830/30, gap 30 — 실기 확인 후 60→30로 축소)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'bottom-row' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('hbox:');
    expect(sc).toContain('xalign 0.5');
    expect(sc).toContain('ypos 830');
    expect(sc).toContain('spacing 30');
    expect(mainMenuBlock(sc)).not.toContain('xanchor');
    // 6개 항목 고정폭(270) + gap(30) 5개 = 1770 < 1920 — 화면 밖으로 안 잘린다(실기 확인 버그 수정).
    expect(sc).toContain('xsize 270');
  });

  it('right-dual — vbox + xanchor 1.0 + 좌표((1920-120)=1800/320/28)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'right-dual' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('vbox:');
    expect(sc).toContain('xpos 1800');
    expect(sc).toContain('xanchor 1.0');
    expect(sc).toContain('ypos 320');
    expect(sc).toContain('spacing 28');
  });

  it('right-marker — vbox + xanchor 1.0 + 좌표((1920-140)=1780/400/24)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'right-marker' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('vbox:');
    expect(sc).toContain('xpos 1780');
    expect(sc).toContain('xanchor 1.0');
    expect(sc).toContain('ypos 400');
    expect(sc).toContain('spacing 24');
  });

  it('renpy-classic — vbox + 좌표(120/380/18), xanchor 없음(좌측 정렬)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'renpy-classic' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('vbox:');
    expect(sc).toContain('xpos 120');
    expect(sc).toContain('ypos 380');
    expect(sc).toContain('spacing 18');
    expect(mainMenuBlock(sc)).not.toContain('xanchor');
    expect(sc).toContain('textbutton _("처음부터") action Start() style_prefix "mm"');
  });
});

describe('generateRenpyFiles: bottom-row/right-dual — 2줄(주+부) 렌더', () => {
  it('bottom-row: button: + 내부 vbox 에 text 2개(주 mm_main_text, 부 mm_sub_text)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'bottom-row' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('button:');
    expect(sc).toContain('style "mm_button"');
    expect(sc).toContain('text "게임 시작" style "mm_main_text"');
    expect(sc).toContain('text "새로운 이야기 시작" style "mm_sub_text"');
    // hbox(가운데 정렬 컨테이너) 안이므로 항목에도 xalign 0.5 가 붙는다.
    expect(sc).toContain('xalign 0.5');
  });

  it('right-dual: 영문 주 라벨 + 한글 부 라벨 2줄, xalign 1.0(우측 정렬 항목)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'right-dual' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('text "New Game" style "mm_main_text"');
    expect(sc).toContain('text "새로하기" style "mm_sub_text"');
    expect(sc).toContain('xalign 1.0');
  });

  it('sub 를 빈 문자열로 덮으면 그 슬롯은 text 1개만(2줄 → 1줄로 자연 축소)', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { preset: 'bottom-row', labels: { gallery: { sub: '' } } },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    // gallery 의 프리셋 기본 sub("CG·이벤트 감상")가 통째로 사라져야 한다.
    expect(sc).toContain('text "엑스트라" style "mm_main_text"');
    expect(sc).not.toContain('CG·이벤트 감상');
    // 다른 슬롯은 여전히 2줄(회귀 없음 확인).
    expect(sc).toContain('text "새로운 이야기 시작" style "mm_sub_text"');
  });
});

describe('generateRenpyFiles: right-marker — ▶ 마커 스타일', () => {
  it('마커 텍스트가 평상시 완전 투명(#00000000), hover 시 accent_color', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'right-marker' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('text "▶" style "mm_marker_text"');
    expect(sc).toContain('style mm_marker_text:');
    expect(sc).toContain('color "#00000000"');
    expect(sc).toContain('hover_color gui.accent_color');
    // ▶(U+25B6) 는 Ren'Py 이모지 트라이에서 UNQUALIFIED 라 기본 prefer_emoji True 와 만나면
    // 번들 Twemoji(파란 재생버튼 이모지)로 치환된다(실기 확인) — emoji_font None 으로 꺼야 한다.
    expect(sc).toContain('emoji_font None');
    // 라벨 자체는 프리셋 labels 가 비어 있으므로 MAIN_MENU_SLOTS 원래 라벨로 폴백.
    expect(sc).toContain('text "처음부터" style "mm_button_text"');
  });
});

describe('generateRenpyFiles: 메뉴 라벨 이스케이프(escRpyText) — %/[/{ 런타임 크래시 방지', () => {
  it('할인 20% / [속보] 시작 / {웃음} 라벨이 안전하게 이스케이프된다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: {
        preset: 'renpy-classic', // 1줄 textbutton 경로 — 가장 단순한 이스케이프 확인 지점.
        labels: {
          start: { main: '할인 20%' },
          continue: { main: '[속보] 시작' },
          load: { main: '{웃음}' },
        },
      },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('20%%'); // % → %% (Ren'Py 문자열 포맷 코드 오인 방지)
    expect(sc).toContain('[[속보]'); // [ → [[ (변수 보간 오인 방지)
    expect(sc).toContain('{{웃음}'); // { → {{ (텍스트 태그 오인 방지)
  });
});

describe('generateRenpyFiles: 메인 메뉴 버튼 폰트(menuFontId/menuSubFontId) 배선', () => {
  it('menuFontId 만 지정하면 주/부 둘 다 그 폰트(부는 주를 따라간다)', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { preset: 'renpy-classic', menuFontId: 'menu-serif' },
    });
    const { files } = generateRenpyFiles(p);
    const gui = fileOf(files, 'game/gui.rpy')!.content;
    expect(gui).toContain('define gui.menu_text_font = "fonts/MenuSerif.ttf"');
    expect(gui).toContain('define gui.menu_sub_text_font = "fonts/MenuSerif.ttf"');
  });

  it('menuFontId·menuSubFontId 를 각각 다르게 지정하면 서로 다른 경로가 나온다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { preset: 'renpy-classic', menuFontId: 'menu-serif', menuSubFontId: 'nanum-gothic' },
    });
    const { files } = generateRenpyFiles(p);
    const gui = fileOf(files, 'game/gui.rpy')!.content;
    expect(gui).toContain('define gui.menu_text_font = "fonts/MenuSerif.ttf"');
    expect(gui).toContain('define gui.menu_sub_text_font = "fonts/NanumGothic.ttf"');
  });

  it('둘 다 미지정이면 본문 폰트(gui.text_font)와 같은 값을 따라간다', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'renpy-classic' } });
    const { files } = generateRenpyFiles(p);
    const gui = fileOf(files, 'game/gui.rpy')!.content;
    expect(gui).toContain('define gui.text_font = "fonts/NanumGothic.ttf"');
    expect(gui).toContain('define gui.menu_text_font = "fonts/NanumGothic.ttf"');
    expect(gui).toContain('define gui.menu_sub_text_font = "fonts/NanumGothic.ttf"');
  });
});

describe('generateRenpyFiles: 해상도 배율 — 우측 정렬 xpos = 실제 화면 폭(project.width) - round(x*scale)', () => {
  it('1280x720(scale=2/3), right-marker(x=140) → xpos 1187(=1280-93), ypos 267, spacing 16', () => {
    const p = projectWith([plainScene()], {
      width: 1280,
      height: 720,
      mainMenuUi: { preset: 'right-marker' },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('xpos 1187');
    expect(sc).toContain('xanchor 1.0');
    expect(sc).toContain('ypos 267');
    expect(sc).toContain('spacing 16');
  });
});

// ── 실기(Ren'Py 8.5.3) 검증 후 수정 5건 ─────────────────────────────────────

describe('generateRenpyFiles: 가로 배치(hbox) — 정보/크레딧/도움말은 별도 컨테이너로 분리', () => {
  it('bottom-row: 메뉴 hbox 안에는 링크가 없고, 별도 hbox(xalign 0.5, ypos (830+150)=980)에 링크 3개', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'bottom-row' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    // main_menu 화면 전체 블록 안에는 세로 배치 전용 'null height' 스페이서가 없다(가로는 별도 컨테이너).
    expect(mainMenuBlock(sc)).not.toContain('null height');
    // 별도 hbox 로 ypos (y+150)*scale = (830+150)*1 = 980 에 뜬다.
    expect(mainMenuBlock(sc)).toContain('ypos 980');
    const linkBlock = mainMenuBlock(sc).slice(mainMenuBlock(sc).indexOf('ypos 980') - 40);
    expect(linkBlock).toContain('xalign 0.5');
    expect(linkBlock).toContain('textbutton _("정보") action ShowMenu("about") style_prefix "mm_link"');
    expect(linkBlock).toContain('textbutton _("크레딧") action ShowMenu("credits") style_prefix "mm_link"');
    expect(linkBlock).toContain('textbutton _("도움말") action ShowMenu("help") style_prefix "mm_link"');
  });

  it('right-marker(세로 배치)는 기존처럼 같은 vbox 안에 null height 스페이서로 이어붙인다(회귀 없음)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'right-marker' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('null height 24');
    expect(sc).toContain('textbutton _("정보") action ShowMenu("about") style_prefix "mm_link"');
  });
});

describe('generateRenpyFiles: 텍스트 프리셋 글자 외곽선(textOutline, 기본 true)', () => {
  it('미지정(기본 true) — mm_button_text/mm_main_text/mm_sub_text 에 2px 검정 외곽선', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'renpy-classic' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('outlines [ (absolute(2), "#000000", absolute(0), absolute(0)) ]');
  });

  it('textOutline: false — 외곽선 줄 자체가 안 나온다', () => {
    const p = projectWith([plainScene()], {
      mainMenuUi: { preset: 'renpy-classic', textOutline: false },
    });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).not.toContain('outlines [ (absolute(2), "#000000"');
  });

  it('right-marker: 마커는 idle 때 투명 외곽선, hover 때만 불투명 검정(완전 투명 유지 + 가독성 양립)', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'right-marker' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('outlines [ (absolute(2), "#00000000", absolute(0), absolute(0)) ]');
    expect(sc).toContain('hover_outlines [ (absolute(2), "#000000", absolute(0), absolute(0)) ]');
  });
});

describe('generateRenpyFiles: mm_button_text 비활성(insensitive) 색', () => {
  it('mm_button_text 에 insensitive_color gui.insensitive_color 가 정의된다', () => {
    const p = projectWith([plainScene()], { mainMenuUi: { preset: 'renpy-classic' } });
    const { files } = generateRenpyFiles(p);
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('insensitive_color gui.insensitive_color');
  });
});
