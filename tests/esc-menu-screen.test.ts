// ESC(게임 중) 메뉴 이미지 GUI(project.escMenuUi) — mainMenuUi/quickMenuUi 와 같은 회귀 0 계약이지만
// 새 화면을 만드는 대신 기존 화면(navigation/game_menu/file_slots/preferences/confirm/item_gallery/
// cg_gallery)의 style 블록만 뒤에 이어붙인다(screensRpy.ts 의 buildEscMenuStyles). 그래서 검증도
// "이 좌표/컨테이너가 나온다" 류가 아니라 "이 style 블록이 뒤에 나온다·안 나온다" 류가 중심이다.
// escStylesBlock() 이 첫 마커('## ESC 메뉴 이미지 GUI —')부터 파일 끝까지 잘라내는 이유는, 이
// 마커 문자열이 buildEscMenuStyles 가 내는 모든 블록에 공통이고 다른 어디에도(기존 base 템플릿·
// 메인/퀵메뉴 블록) 나오지 않기 때문 — 그 앞부분(quick_button 의 idle_background 등 기존 정적
// 정의)과 뒤섞이지 않게 범위를 좁힌다.

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import type { EscImageId, Line } from '../src/types';
import { ESC_IMAGES } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

/** screens.rpy 전체에서 buildEscMenuStyles 가 이어붙인 꼬리 부분만 잘라낸다(없으면 빈 문자열). */
function escStylesBlock(sc: string): string {
  const marker = '## ESC 메뉴 이미지 GUI —';
  const start = sc.indexOf(marker);
  return start >= 0 ? sc.slice(start) : '';
}

/**
 * escStylesBlock() 안에서 `style <name>` 정의 하나만 잘라낸다(다음 `\nstyle ` 직전까지). 콜론까지
 * 요구하지 않는 이유는 esc_gallery_idle_button/esc_save_empty_button 이 `style X is Y:` 형태라서
 * (부모 스타일에서 padding 등을 물려받으려고) 콜론 앞에 " is Y" 가 끼기 때문 — "style <name>" 까지만
 * 매칭하면 두 형태 다 잡힌다. 이 꼬리 안에서는 각 스타일 이름이 정확히 한 번만 나오므로(원본 base
 * 템플릿의 같은 이름 블록은 꼬리 밖에 있다) indexOf 로 충분하다.
 */
function styleBlock(tail: string, name: string): string {
  // 줄 시작(\n 직후)에서만 찾는다 — return_button 그룹의 코멘트 안에 "style return_button is
  // navigation_button" 이라는 설명 문구가 그대로 들어 있어(따옴표 안), 줄 시작 여부를 안 가리면
  // 코멘트가 먼저 걸려 실제 정의 앞에서 블록이 잘린다.
  const marker = `\nstyle ${name}`;
  const start = tail.indexOf(marker);
  if (start < 0) throw new Error(`esc-menu-screen.test: style ${name} 블록을 찾지 못함`);
  const next = tail.indexOf('\nstyle ', start + 1);
  return tail.slice(start + 1, next >= 0 ? next : undefined);
}

/** ids 각각에 `<id>_asset` assetId 를 매핑한 escMenuUi.images 픽스처. */
function escImages(ids: EscImageId[]): Partial<Record<EscImageId, string>> {
  const out: Partial<Record<EscImageId, string>> = {};
  for (const id of ids) out[id] = `${id}_asset`;
  return out;
}

const ALL_ESC_IDS = ESC_IMAGES.map((e) => e.id);

const plainScene = () => scene({ lines: [dialogue('민주', '안녕')] });

/** item_gallery·cg_gallery 화면이 실제로 나오도록 아이템 1개 + CG 1개를 심어둔 장면. */
const galleryLines: Line[] = [
  { kind: 'item', name: '편지' },
  { kind: 'item', name: '' },
  { kind: 'cg', desc: '노을 아래 재회' },
  dialogue('민주', '안녕'),
];
const galleryScene = () => scene({ cg: ['노을 아래 재회'], lines: galleryLines });

describe('generateRenpyFiles: escMenuUi 없으면 회귀 0', () => {
  it('escMenuUi 자체가 없으면 gui/esc/ 참조도, ESC 스타일 블록도 없다', () => {
    const { files } = generateRenpyFiles(projectWith([plainScene()]));
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('gui/esc/');
    expect(sc).not.toContain('ESC 메뉴 이미지 GUI');
  });

  it('escMenuUi.images 가 빈 객체여도 마찬가지(회귀 0)', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: {} } });
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('gui/esc/');
    expect(sc).not.toContain('ESC 메뉴 이미지 GUI');
  });

  it('file_slots 화면이 원본 그대로다(FileLoadable 분기 없음)', () => {
    const { files } = generateRenpyFiles(projectWith([plainScene()]));
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('FileLoadable');
    expect(sc).toContain('button:\n                        action FileAction(slot)');
  });

  it('아이템/CG 갤러리 화면도 원본 그대로다(인라인 배경·무명 button 유지)', () => {
    const { files } = generateRenpyFiles(projectWith([galleryScene()]));
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('esc_gallery');
    // 해금 칸: button: 바로 다음 줄이 style 태그 없이 곧장 xysize.
    expect(sc).toContain('button:\n                            xysize (gui.scale(200), gui.scale(200))');
    expect(sc).toContain('button:\n                            xysize (gui.scale(300), gui.scale(190))');
    // 잠금 칸: 인라인 Solid 배경이 그대로. 'background Solid(gui.frame_bg_color)' 자체는 base
    // 템플릿의 기본 style frame:/slot_button 도 쓰므로(gallery 와 무관하게 항상 2회) 잠금 칸
    // 패턴(xysize 다음 줄)만 콕 집어 2회(item+cg) 확인한다.
    expect((sc.match(/xysize \(gui\.scale\(\d+\), gui\.scale\(\d+\)\)\n\s+background Solid\(gui\.frame_bg_color\)/g) ?? []).length).toBe(2);
  });
});

describe('generateRenpyFiles: escMenuUi 그룹별 부분 업로드 — 있는 그룹만 나온다', () => {
  it('card 하나만 업로드하면 style frame: 만 나오고 다른 그룹은 없다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['card']) } });
    const { files } = generateRenpyFiles(p);
    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));
    expect(tail).toContain('style frame:');
    expect(tail).toContain('gui/esc/card.png');
    for (const name of ['navigation_button', 'radio_button', 'check_button', 'slot_button', 'confirm_button', 'confirm_frame', 'slider', 'vscrollbar']) {
      expect(tail).not.toContain(`style ${name}:`);
    }
  });

  it('nav_hover 만 있고 nav_idle 이 없으면(앵커 없음) 내비게이션 그룹 전체가 생략된다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['nav_hover']) } });
    const { files } = generateRenpyFiles(p);
    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));
    expect(tail).not.toContain('style navigation_button:');
    expect(tail).not.toContain('style return_button:');
    expect(tail).not.toContain('gui/esc/nav_hover.png');
  });

  it('choice_hover 만 있고 choice_idle 이 없으면 라디오/체크 그룹이 생략된다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['choice_hover']) } });
    const { files } = generateRenpyFiles(p);
    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));
    expect(tail).not.toContain('style radio_button:');
    expect(tail).not.toContain('style check_button:');
  });

  it('slider_fill 하나만 업로드하면 left_bar 만 교체되고 right_bar/thumb 은 원본(Solid) 유지', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['slider_fill']) } });
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    const tail = escStylesBlock(sc);
    const block = styleBlock(tail, 'slider');
    expect(block).toContain('left_bar Frame("gui/esc/slider_fill.png", 0, 0)');
    expect(block).not.toContain('right_bar Frame(');
    expect(block).not.toContain('thumb Frame(');
  });

  it('scroll_thumb 하나만 업로드하면 thumb 만 교체되고 base_bar 는 원본 유지', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['scroll_thumb']) } });
    const { files } = generateRenpyFiles(p);
    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));
    const block = styleBlock(tail, 'vscrollbar');
    expect(block).toContain('thumb Frame("gui/esc/scroll_thumb.png", 0, 0)');
    expect(block).not.toContain('base_bar Frame(');
  });

  it('popup_bg 만 있으면 confirm_frame 만 나오고 confirm_button 은 없다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['popup_bg']) } });
    const { files } = generateRenpyFiles(p);
    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));
    expect(tail).toContain('style confirm_frame:');
    expect(tail).not.toContain('style confirm_button:');
  });

  it('gallery_idle/gallery_locked 는 서로 독립적으로 게이팅된다', () => {
    const idleOnly = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_idle']) } });
    const tailIdle = escStylesBlock(contentOf(generateRenpyFiles(idleOnly).files, 'game/screens.rpy'));
    expect(tailIdle).toContain('style esc_gallery_idle_button is button:');
    expect(tailIdle).not.toContain('style esc_gallery_locked_frame is frame:');

    const lockedOnly = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_locked']) } });
    const tailLocked = escStylesBlock(contentOf(generateRenpyFiles(lockedOnly).files, 'game/screens.rpy'));
    expect(tailLocked).not.toContain('style esc_gallery_idle_button is button:');
    expect(tailLocked).toContain('style esc_gallery_locked_frame is frame:');
  });

  it('gallery_idle 업로드 시 item_gallery/cg_gallery 의 해금 칸 button: 에 style 태그가 실제로 붙는다', () => {
    const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_idle']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    expect(sc).toContain('button:\n                            style "esc_gallery_idle_button"\n                            xysize (gui.scale(200), gui.scale(200))');
    expect(sc).toContain('button:\n                            style "esc_gallery_idle_button"\n                            xysize (gui.scale(300), gui.scale(190))');
  });

  it('gallery_locked 업로드 시 잠금 칸의 인라인 Solid 배경이 style 태그로 바뀐다', () => {
    const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_locked']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    // item_gallery + cg_gallery 잠금 칸 2곳 모두 바뀐다. 전체 파일에서 'background
    // Solid(gui.frame_bg_color)' 자체를 금지하진 않는다 — base 템플릿의 기본 style frame:/
    // slot_button 이 원래도 그 문구를 쓰므로(gallery_locked 와 무관하게 항상 존재), 잠금 칸
    // 패턴(frame: 블록 안의 xysize 다음 줄)만 콕 집어 확인한다.
    expect((sc.match(/style "esc_gallery_locked_frame"/g) ?? []).length).toBe(2);
    expect(sc).not.toContain('xysize (gui.scale(200), gui.scale(200))\n                            background Solid(gui.frame_bg_color)');
    expect(sc).not.toContain('xysize (gui.scale(300), gui.scale(190))\n                            background Solid(gui.frame_bg_color)');
  });
});

describe('generateRenpyFiles: escMenuUi 전체 업로드 — 이미지화된 버튼 style 은 네 롤을 전부 채운다', () => {
  const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(ALL_ESC_IDS) } });
  const { files } = generateRenpyFiles(p);
  const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));

  // CRASH TRAP(CLAUDE.md) — gui.button_properties(kind) 의 기본 background 는 실존하지 않는
  // gui/button/*.png 를 가리킨다. 이미지를 하나라도 얹은 버튼 style 은 idle/hover/selected/
  // insensitive 네 롤을 전부 명시해야 없는 파일을 찾다 프리캐시가 크래시하지 않는다 — 미래에
  // 그룹이 늘어도 이 루프에 이름만 추가하면 검증이 자동으로 따라오도록 배열로 관리한다.
  const imageifiedButtonStyles = [
    'navigation_button',
    'return_button',
    'radio_button',
    'check_button',
    'slot_button',
    'esc_save_empty_button',
    'confirm_button',
    'esc_gallery_idle_button',
  ];

  for (const name of imageifiedButtonStyles) {
    it(`style ${name} 는 idle/hover/selected/insensitive_background 를 전부 갖는다`, () => {
      const block = styleBlock(tail, name);
      expect(block).toContain('idle_background Frame(');
      expect(block).toContain('hover_background Frame(');
      expect(block).toContain('selected_background Frame(');
      expect(block).toContain('insensitive_background Frame(');
    });
  }

  it('frame 계열(card/popup_bg/gallery_locked)은 버튼이 아니라 background 하나만 있으면 된다', () => {
    expect(styleBlock(tail, 'frame')).toContain('background Frame(');
    expect(styleBlock(tail, 'confirm_frame')).toContain('background Frame(');
    expect(styleBlock(tail, 'esc_gallery_locked_frame')).toContain('background Frame(');
  });

  it('save_empty 존재 시 file_slots 에 FileLoadable 분기가 나온다', () => {
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).toContain('if FileLoadable(slot):');
    expect(sc).toContain('style "slot_button"');
    expect(sc).toContain('style "esc_save_empty_button"');
  });

  it('focus_mask 는 어디에도 없다', () => {
    expect(tail).not.toContain('focus_mask');
  });
});

describe('generateRenpyFiles: escMenuUi 에 save_empty 가 없으면 file_slots 는 원본 그대로', () => {
  it('save_idle/save_hover 만 있어도(save_empty 없음) FileLoadable 분기는 생기지 않는다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['save_idle', 'save_hover']) } });
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('FileLoadable');
    expect(sc).toContain('button:\n                        action FileAction(slot)');
  });
});

describe('generateRenpyFiles: 해상도 배율(height/1080) — 1280x720', () => {
  it('card 테두리가 Math.round(24 * 720/1080) 로 스케일되고 gui.scale( 은 새 블록에 없다', () => {
    const p = projectWith([plainScene()], {
      width: 1280,
      height: 720,
      escMenuUi: { images: escImages(['card']) },
    });
    const { files } = generateRenpyFiles(p);
    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));

    const border = Math.round(24 * (720 / 1080));
    expect(tail).toContain(`Frame("gui/esc/card.png", ${border}, ${border})`);
    expect(tail).not.toContain('gui.scale(');
  });
});
