import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import type { Line } from '../src/types';
import { fileOf, contentOf, scene, dialogue, projectWith } from './fixtures';

describe('generateRenpyFiles: CG 가 없으면 갤러리 관련 출력을 내지 않는다', () => {
  const { files } = generateRenpyFiles(projectWith([scene({ lines: [dialogue('민주', '안녕')] })]));

  it('cg.rpy 를 만들지 않는다', () => {
    expect(fileOf(files, 'game/cg.rpy')).toBeFalsy();
  });

  it('screens.rpy 에 cg_gallery 화면·감상한 CG 문구가 없다', () => {
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('screen cg_gallery');
    expect(sc).not.toContain('감상한 CG');
  });
});

describe('generateRenpyFiles: CG 갤러리 출력', () => {
  const lines: Line[] = [
    { kind: 'cg', desc: '노을 아래 재회' },
    dialogue('민주', '안녕'),
  ];
  const p = projectWith([scene({ cg: ['노을 아래 재회'], lines })]);
  const { files } = generateRenpyFiles(p);

  it('cg.rpy 가 persistent 기본값·갤러리 목록과 함께 생성된다', () => {
    const cg = fileOf(files, 'game/cg.rpy');
    expect(cg).toBeTruthy();
    expect(cg!.content).toContain('default persistent.cg_seen = dict()');
    expect(cg!.content).toContain('define gui.cgs_all = [ ("cg_1", "노을 아래 재회") ]');
  });

  it('script.rpy 는 scene cg_1_scene 진입 직전에 persistent.cg_seen 을 기록한다', () => {
    const s = contentOf(files, 'game/script.rpy');
    const idx = s.indexOf('scene cg_1_scene with dissolve');
    expect(idx).toBeGreaterThan(-1);
    const before = s.slice(0, idx).trimEnd();
    expect(before.endsWith('$ persistent.cg_seen["cg_1"] = True')).toBe(true);
  });

  it('screens.rpy 에 갤러리 화면·라이트박스·내비 버튼이 들어간다', () => {
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).toContain('screen cg_gallery():');
    expect(sc).toContain('screen gallery_lightbox(img):');
    expect(sc).toContain('textbutton _("감상한 CG") action ShowMenu("cg_gallery")');
  });
});

describe('generateRenpyFiles: 같은 CG 설명이 여러 장면에 쓰이면 갤러리엔 한 번만', () => {
  it('gui.cgs_all 에 cg_1 항목이 한 번만 나오고 cg_2 는 생기지 않는다', () => {
    const desc = '공원에서의 산책';
    const p = projectWith([
      scene({ id: 's1', title: '장면1', cg: [desc], lines: [{ kind: 'cg', desc }] }),
      scene({ id: 's2', title: '장면2', cg: [desc], lines: [{ kind: 'cg', desc }] }),
    ]);
    const { files } = generateRenpyFiles(p);
    const cg = contentOf(files, 'game/cg.rpy');
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
    const p = projectWith([scene({ cg: ['노을 아래 재회'], lines })]);
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    const count = (sc.match(/screen gallery_lightbox\(/g) ?? []).length;
    expect(count).toBe(1);
    // 두 갤러리 화면·내비 버튼이 모두 존재.
    expect(sc).toContain('screen item_gallery():');
    expect(sc).toContain('screen cg_gallery():');
    expect(sc).toContain('textbutton _("발견한 아이템") action ShowMenu("item_gallery")');
    expect(sc).toContain('textbutton _("감상한 CG") action ShowMenu("cg_gallery")');
  });
});

describe('generateRenpyFiles: gallery_lightbox 는 이름 캡션·닫기 버튼 없이 dismiss 로 닫힌다', () => {
  const lines: Line[] = [
    { kind: 'item', name: '편지' },
    { kind: 'cg', desc: '노을 아래 재회' },
  ];
  const p = projectWith([scene({ cg: ['노을 아래 재회'], lines })]);
  const { files } = generateRenpyFiles(p);
  const sc = contentOf(files, 'game/screens.rpy');
  // gallery_lightbox 정의만 잘라낸다(다음 screen 정의 직전까지) — item_popup 등 다른 화면의
  // 비슷한 문구(예: 주석 속 "닫기")와 안 섞이게.
  const start = sc.indexOf('screen gallery_lightbox(img):');
  const end = sc.indexOf('\nscreen ', start + 1);
  const block = sc.slice(start, end);

  it('caption 텍스트·닫기 버튼 블록이 없다', () => {
    expect(block).not.toContain('text caption:');
    expect(block).not.toContain('textbutton _("닫기")');
  });

  it('dismiss 로 화면 아무 곳이나 클릭하면 닫힌다(item_popup 과 같은 패턴)', () => {
    expect(block).toContain('dismiss action Hide("gallery_lightbox")');
  });

  it('Show("gallery_lightbox", ...) 호출 2곳(아이템·CG) 모두 caption= 을 안 넘긴다', () => {
    expect(sc).not.toContain('caption=');
    expect(sc).toContain('action Show("gallery_lightbox", img=it_tag)');
    expect(sc).toContain('action Show("gallery_lightbox", img=cg_tag)');
  });

  it('갤러리 목록 칸 아래 이름 캡션은 그대로 남아 있다(라이트박스 안의 이름만 지운 것)', () => {
    expect(sc).toContain('text it_name xalign 0.5 size gui.scale(16)');
    expect(sc).toContain('text cg_name xalign 0.5 size gui.scale(16)');
  });
});

describe('generateRenpyFiles: ESC 이미지 GUI 켠 구성에서도 gallery_lightbox Show 호출에 caption 없음', () => {
  it('escMenuUi 가 있어도(비-회귀 대상인 galleryGrid ESC 분기) caption= 이 안 붙는다', () => {
    const lines: Line[] = [
      { kind: 'item', name: '편지' },
      { kind: 'cg', desc: '노을 아래 재회' },
    ];
    const p = projectWith([scene({ cg: ['노을 아래 재회'], lines })], {
      escMenuUi: { images: { card: 'card_asset' } },
    });
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('caption=');
    expect(sc).toContain('action Show("gallery_lightbox", img=it_tag)');
    expect(sc).toContain('action Show("gallery_lightbox", img=cg_tag)');
  });
});

// 주의: 이 fit=cover 래핑은 game_menu() 화면의 base 템플릿(screensRpy.ts)에 있는 항상 나오는
// 문구라 CG 유무와는 무관하다(CG 갤러리 전용 기능이 아님) — 이 파일에 있는 건 편의상 scene()/
// projectWith 를 재사용했을 뿐, 실제로는 CG 갤러리 경로를 검증하지 않는다는 걸 명확히 하기 위해
// describe 를 그렇게 적는다.
describe('generateRenpyFiles: 메뉴 배경은 CG 유무와 무관하게 항상 화면에 꽉 차도록(fit=cover) 렌더된다(base 템플릿 회귀 가드)', () => {
  it('screens.rpy 가 main_menu_background/game_menu_background 를 Transform(fit="cover")로 감싼다', () => {
    const { files } = generateRenpyFiles(projectWith([scene({ cg: [], lines: [dialogue('민주', '안녕')] })]));
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).toContain('Transform(gui.main_menu_background, fit="cover"');
    expect(sc).toContain('Transform(gui.game_menu_background, fit="cover"');
  });
});
