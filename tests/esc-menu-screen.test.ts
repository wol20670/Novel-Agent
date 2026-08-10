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
import {
  escHistoryMetrics,
  escCgThumbMetrics,
  ESC_LAYOUT,
  GALLERY_GRID_SAFETY,
  ITEM_CELL,
  CG_CELL,
  galleryThumbRect,
} from '../src/renpy/gui';
import type { EscImageId, Line } from '../src/types';
import { ESC_IMAGES, DEFAULT_ESC_COLORS } from '../src/types';
import { fontGamePath } from '../src/fonts/fontCatalog';
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

/**
 * escFontStyles(작업 1) 가 낸 글꼴 블록만 잘라낸다 — styleBlock() 은 이름의 "첫 등장"만 잡는데,
 * navigation_button_text 등 여러 이름이 위 색 블록에도 이미 나와서(escFontStyles 가 buildEscMenuStyles
 * 의 맨 마지막에 push 되는 이유) 재사용할 수 없다. 전용 마커(escFontStyles 의 주석 문구)로 꼬리 전체를
 * 잘라낸 뒤, 그 안에서 원하는 이름의 style 블록을 styleBlock() 과 같은 규칙으로 다시 잘라낸다.
 */
function escFontBlock(tail: string): string {
  const marker = '## ESC 메뉴 이미지 GUI — 글꼴(escMenuUi.fontId 지정 시에만';
  const start = tail.indexOf(marker);
  return start >= 0 ? tail.slice(start) : '';
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

  it('설정 화면·제목 밑줄도 원본 그대로다(그룹 카드·장식선 미출력)', () => {
    const { files } = generateRenpyFiles(projectWith([plainScene()]));
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('esc_pref_card');
    expect(sc).not.toContain('esc_pref_title');
    // 기존 배치의 표식: style_prefix 로 묶인 vbox + label(카드 배치는 text + 명시 style 을 쓴다).
    expect(sc).toContain('                    vbox:\n                        style_prefix "radio"\n                        label _("디스플레이")');
    expect(sc).toContain('    label title\n\n    if main_menu:');
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
    // slot_button 은 예외 — escLayoutStyles 의 padding (0,0) 재정의는 특정 에셋 게이트가 아니라
    // escMenu 존재 자체로 항상 나온다(레이아웃이 절대좌표라 배경 이미지 유무와 무관하게 필요).
    // 배경 이미지가 실제로 얹히는 idle_background 등은 save_idle 을 안 올렸으니 여전히 없어야 한다.
    const slotBlock = styleBlock(tail, 'slot_button');
    expect(slotBlock).toContain('padding (0, 0)');
    expect(slotBlock).not.toContain('idle_background');
    for (const name of ['navigation_button', 'radio_button', 'check_button', 'confirm_button', 'confirm_frame', 'slider', 'vscrollbar']) {
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
    // escMenu 가 붙으면 격자 자체가 시안 배치(칸 안 좌하단 캡션)로 바뀐다 — 칸 치수는 ITEM_CELL/
    // CG_CELL 의 1920 기준 px 가 구워져 나온다(projectWith 는 1920×1080). 실측 기준값(324×288/
    // 440×328)은 뷰포트보다 넓어(스크롤바 거터 차감분까지 고려하면 넘친다) fitGalleryCell 이 비율
    // 그대로 축소한 값(아이템 320×284, CG 434×324)이 실제로 구워진다 — "gallery-grid-fit" 버그의
    // 회귀 가드(아래 fitGalleryCell 불변식 테스트들과 짝).
    expect(sc).toContain(`button:\n                        style "esc_gallery_idle_button"\n                        xysize (${ITEM_CELL.width}, ${ITEM_CELL.height})`);
    expect(sc).toContain(`button:\n                        style "esc_gallery_idle_button"\n                        xysize (${CG_CELL.width}, ${CG_CELL.height})`);
  });

  it('gallery_locked 업로드 시 잠금 칸의 인라인 Solid 배경이 style 태그로 바뀐다', () => {
    const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_locked']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    // item_gallery + cg_gallery 잠금 칸 2곳 모두 바뀐다. 전체 파일에서 'background
    // Solid(gui.frame_bg_color)' 자체를 금지하진 않는다 — base 템플릿의 기본 style frame:/
    // slot_button 이 원래도 그 문구를 쓰므로(gallery_locked 와 무관하게 항상 존재), 잠금 칸
    // 패턴(frame: 블록 안의 xysize 다음 줄)만 콕 집어 확인한다.
    expect((sc.match(/style "esc_gallery_locked_frame"/g) ?? []).length).toBe(2);
    expect(sc).not.toContain(`xysize (${ITEM_CELL.width}, ${ITEM_CELL.height})\n                        background Solid(gui.frame_bg_color)`);
    expect(sc).not.toContain(`xysize (${CG_CELL.width}, ${CG_CELL.height})\n                        background Solid(gui.frame_bg_color)`);
  });

  it('아이템 그리드: 그림칸은 확정 수치(칸 320×284 안 pos(12,17) 297×199, fit "contain")로 정사각을 유지하고 마스크가 없다', () => {
    // 이 테스트만은 계획서가 직접 검산한 확정 수치를 리터럴로 박아둔다(1080p 프로젝트 기준) — 아래
    // '갤러리 격자 기하' describe 의 불변식 테스트들이 로직 자체를 검증하므로, 여기서는 "실제로
    // 생성된 screens.rpy 에 그 값이 그대로 나오는가"만 본다(수치가 맞다는 걸 눈으로 확인하는 골든
    // 값 — ITEM_CELL/galleryThumbRect 를 그대로 재계산해 쓰면 구현 버그가 나도 테스트가 항상
    // 통과하는 동어반복이 된다).
    const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_idle']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    expect(sc).toContain('pos (12, 17)\n                            xysize (297, 199)');
    expect(sc).toContain('add it_tag:\n                                fit "contain"\n                                xysize (297, 199)\n                                align (0.5, 0.5)');
    expect(sc).not.toContain('AlphaMask(Transform(it_tag');
    expect(sc).toContain('text it_name:\n                            pos (12, 239)');
  });

  it('CG 그리드: 그림칸은 확정 수치(칸 434×324 안 pos(16,20) 402×227≈16:9)에 fit "cover" + 둥근 마스크를 씌운다', () => {
    // 위와 같은 이유로 골든 값을 리터럴로 검증(1080p 프로젝트 기준).
    const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_idle']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    expect(sc).toContain('pos (16, 20)\n                            xysize (402, 227)');
    expect(sc).toContain('add AlphaMask(Transform(cg_tag, fit="cover", xysize=(402, 227)), "gui/esc/cg_thumb_mask.png")');
    expect(sc).toContain('text cg_name:\n                            pos (16, 274)');
  });

});

// 갤러리 격자가 뷰포트(콘텐츠 폭 − 스크롤바 거터)보다 넓어 맨 오른쪽 열 카드 테두리가 스크롤바에
// 잘려 보이던 버그(fix/gallery-grid-fit)의 회귀 가드 — 칸 크기·그림칸·마스크 짝을 하드코딩 수치가
// 아니라 "어떤 조건을 항상 만족해야 하는가"로 검증한다. ESC_LAYOUT/GALLERY_GRID_SAFETY 상수가
// 나중에 바뀌어도(다른 아트·다른 카드 여백) 이 불변식들은 여전히 성립해야 한다.
describe('갤러리 격자 기하 — 뷰포트 안에 들어가는지 불변식으로 검증', () => {
  const available = ESC_LAYOUT.contentRight - ESC_LAYOUT.contentLeft - ESC_LAYOUT.scrollbarGutter;

  it('아이템 4열 격자가 뷰포트 안에 들어가고, 남는 여유가 GALLERY_GRID_SAFETY 이상이다', () => {
    const gridWidth = 4 * ITEM_CELL.width + 3 * ESC_LAYOUT.gallerySpacing;
    expect(gridWidth).toBeLessThanOrEqual(available);
    expect(available - gridWidth).toBeGreaterThanOrEqual(GALLERY_GRID_SAFETY);
  });

  it('CG 3열 격자가 뷰포트 안에 들어가고, 남는 여유가 GALLERY_GRID_SAFETY 이상이다', () => {
    const gridWidth = 3 * CG_CELL.width + 2 * ESC_LAYOUT.gallerySpacing;
    expect(gridWidth).toBeLessThanOrEqual(available);
    expect(available - gridWidth).toBeGreaterThanOrEqual(GALLERY_GRID_SAFETY);
  });

  it('아이템 그림칸이 칸 안에 들어간다(넘치지 않음)', () => {
    const thumb = galleryThumbRect(ITEM_CELL.width, ITEM_CELL.height);
    expect(thumb.left + thumb.width).toBeLessThanOrEqual(ITEM_CELL.width);
    expect(thumb.top + thumb.height).toBeLessThanOrEqual(ITEM_CELL.height);
  });

  it('CG 그림칸이 칸 안에 들어간다(넘치지 않음)', () => {
    const thumb = galleryThumbRect(CG_CELL.width, CG_CELL.height);
    expect(thumb.left + thumb.width).toBeLessThanOrEqual(CG_CELL.width);
    expect(thumb.top + thumb.height).toBeLessThanOrEqual(CG_CELL.height);
  });

  it('아이템 캡션이 그림칸 아래 · 칸 안에 들어간다', () => {
    const thumb = galleryThumbRect(ITEM_CELL.width, ITEM_CELL.height);
    const captionLineHeight = Math.round(17 * 1.2); // size 17 텍스트 한 줄의 대략적인 높이.
    expect(thumb.top + thumb.height).toBeLessThanOrEqual(ITEM_CELL.captionTop);
    expect(ITEM_CELL.captionTop + captionLineHeight).toBeLessThanOrEqual(ITEM_CELL.height);
  });

  it('CG 캡션이 그림칸 아래 · 칸 안에 들어간다', () => {
    const thumb = galleryThumbRect(CG_CELL.width, CG_CELL.height);
    const captionLineHeight = Math.round(17 * 1.2);
    expect(thumb.top + thumb.height).toBeLessThanOrEqual(CG_CELL.captionTop);
    expect(CG_CELL.captionTop + captionLineHeight).toBeLessThanOrEqual(CG_CELL.height);
  });

  it('CG 그림칸 비율이 16:9 에 3% 이내로 근접한다', () => {
    const thumb = galleryThumbRect(CG_CELL.width, CG_CELL.height);
    const ratio = thumb.width / thumb.height;
    expect(Math.abs(ratio - 16 / 9)).toBeLessThanOrEqual(0.03);
  });

  it('escCgThumbMetrics(마스크 PNG 픽셀 크기)가 galleryThumbRect(CG_CELL)와 정확히 같다(단일 소스 짝)', () => {
    // height=1080 이면 scale=1 이라 escCgThumbMetrics 의 두 번째 스케일링이 항등이 되므로
    // galleryThumbRect(CG_CELL.width, CG_CELL.height) 결과와 1:1로 비교할 수 있다 — 어긋나면
    // buildZip 이 그리는 마스크 PNG 와 screensRpy 의 AlphaMask xysize 가 안 맞아 둥근 모서리가
    // 뭉개진다(CLAUDE.md).
    const metrics = escCgThumbMetrics(1080);
    const thumb = galleryThumbRect(CG_CELL.width, CG_CELL.height);
    expect(metrics).toEqual({ width: thumb.width, height: thumb.height, radius: thumb.radius });
  });
});

describe('esc-menu-screen: 저장 슬롯 스타일', () => {
  it('esc_gallery_idle_button/esc_gallery_locked_frame 은 padding (0, 0) 을 준다(패딩 함정 — 저장 슬롯과 같은 이유)', () => {
    const p = projectWith([galleryScene()], { escMenuUi: { images: escImages(['gallery_idle', 'gallery_locked']) } });
    const tail = escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    expect(styleBlock(tail, 'esc_gallery_idle_button')).toContain('padding (0, 0)');
    expect(styleBlock(tail, 'esc_gallery_locked_frame')).toContain('padding (0, 0)');
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

describe('generateRenpyFiles: escMenuUi 에 save_empty 가 없어도 file_slots 레이아웃은 ESC 배치를 따른다', () => {
  // 배경 이미지 선택(esc_save_empty_button 스타일 분기)과 썸네일/캡션 레이아웃은 서로 다른 조건으로
  // 갈린다(fileSlotsBody 주석 참고) — save_empty 가 없으면 전자만 빠지고, escMenu 가 있는 한
  // 후자(fixed 썸네일 칸 + "빈 슬롯" 오버레이)는 다른 ESC 그룹들과 똑같이 나온다.
  it('save_idle/save_hover 만 있어도(save_empty 없음) 배경 style 분기는 안 생기지만 썸네일 레이아웃은 그대로 적용된다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['save_idle', 'save_hover']) } });
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('style "esc_save_empty_button"');
    expect(sc).not.toContain('if FileLoadable(slot):\n                            style "slot_button"');
    expect(sc).toContain('button:\n                        action FileAction(slot)\n                        xysize (384, 228)');
    expect(sc).toContain('fixed:\n                            pos (13, 13)\n                            xysize (358, 158)');
    expect(sc).toContain('if not FileLoadable(slot):\n                                text _("빈 슬롯") align (0.5, 0.5) style "esc_slot_empty_text"');
  });
});

describe('generateRenpyFiles: escMenuUi 텍스트 팔레트 — 밝은 아트 기본값 + 앱에서 조절', () => {
  const tailWith = (colors?: Record<string, string>) => {
    const p = projectWith([plainScene()], {
      escMenuUi: { images: escImages(['bg']), ...(colors ? { colors } : {}) },
    });
    return escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
  };

  it('색을 안 주면 밝은 아이보리 카드 기준 기본값이 나온다', () => {
    const tail = tailWith();
    expect(styleBlock(tail, 'about_text')).toContain(`color "${DEFAULT_ESC_COLORS.body}"`);
    expect(styleBlock(tail, 'game_menu_label_text')).toContain(`color "${DEFAULT_ESC_COLORS.title}"`);
    expect(styleBlock(tail, 'pref_label_text')).toContain(`color "${DEFAULT_ESC_COLORS.accent}"`);
    expect(styleBlock(tail, 'slot_name_text')).toContain(`color "${DEFAULT_ESC_COLORS.muted}"`);
  });

  it('색을 주면 그 값이 나온다(어두운 아트로 뒤집는 경로)', () => {
    const tail = tailWith({ body: '#f0eae0', title: '#ffffff', accent: '#d8b98a', muted: '#8f8577' });
    expect(styleBlock(tail, 'about_text')).toContain('color "#f0eae0"');
    expect(styleBlock(tail, 'help_text')).toContain('color "#f0eae0"');
    expect(styleBlock(tail, 'history_text')).toContain('color "#f0eae0"');
    expect(styleBlock(tail, 'game_menu_label_text')).toContain('color "#ffffff"');
    expect(styleBlock(tail, 'help_label_text')).toContain('color "#d8b98a"');
  });

  it('일부만 주면 나머지는 기본값으로 채워진다', () => {
    const tail = tailWith({ body: '#123456' });
    expect(styleBlock(tail, 'about_text')).toContain('color "#123456"');
    expect(styleBlock(tail, 'pref_label_text')).toContain(`color "${DEFAULT_ESC_COLORS.accent}"`);
  });

  it('선택 배경 위 글자색은 그 배경 밝기로 자동 결정된다(둘 다 어두운 색 사고 방지)', () => {
    // help_button 은 선택버튼 에셋이 없을 때 selectedBg 를 Solid 로 칠하는 자리 — 그 위 글자색.
    expect(styleBlock(tailWith({ selectedBg: '#2a1c12' }), 'help_button_text')).toContain('selected_color "#fdf6ec"');
    expect(styleBlock(tailWith({ selectedBg: '#f5efe4' }), 'help_button_text')).toContain('selected_color "#3b2f26"');
  });

  it('도움말 탭은 선택버튼 알약이 있으면 각진 Solid 대신 그 이미지를 쓴다', () => {
    const p = projectWith([plainScene()], {
      escMenuUi: { images: escImages(['bg', 'choice_idle', 'choice_hover', 'choice_selected', 'choice_disabled']) },
    });
    const block = styleBlock(escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy')), 'help_button');
    expect(block).toContain('Frame("gui/esc/choice_selected.png", 0, 0)');
    expect(block).not.toContain('Solid(');
  });

  it('페이지 번호는 사각 색블록 없이 글자색만으로 현재 페이지를 표시한다', () => {
    const tail = tailWith();
    expect(styleBlock(tail, 'page_button')).not.toContain('Solid(');
    expect(styleBlock(tail, 'page_button_text')).toContain(`selected_color "${DEFAULT_ESC_COLORS.title}"`);
  });

  it('배경 알약을 걷어낸 버튼(page/help)도 네 롤을 전부 닫는다 — CRASH TRAP', () => {
    const tail = tailWith();
    for (const name of ['page_button', 'help_button']) {
      const block = styleBlock(tail, name);
      for (const role of ['idle_background', 'hover_background', 'selected_background', 'insensitive_background']) {
        expect(block, `${name} 에 ${role} 이 없다`).toContain(role);
      }
    }
  });
});

describe('generateRenpyFiles: escMenuUi 레이아웃 — 콘텐츠가 배경 아트의 카드 안에 들어온다', () => {
  const tail = escStylesBlock(
    contentOf(
      generateRenpyFiles(projectWith([galleryScene()], { escMenuUi: { images: escImages(['bg', 'card']) } })).files,
      'game/screens.rpy',
    ),
  );
  const num = (block: string, prop: string) => {
    const m = new RegExp(`${prop} (-?\\d+)`).exec(block);
    if (!m) throw new Error(`${prop} 를 찾지 못함`);
    return Number(m[1]);
  };

  it('제목이 좌측 사이드바(0..320) 밖, 카드 안에서 시작한다', () => {
    const xpos = num(styleBlock(tail, 'game_menu_label'), 'xpos');
    expect(xpos).toBeGreaterThan(320);
    expect(xpos).toBeLessThan(1810);
  });

  it('자리채기 프레임 + 콘텐츠 여백의 합이 제목 x 와 정확히 같다(둘이 어긋나면 콘텐츠만 밀린다)', () => {
    const navSpacer = num(styleBlock(tail, 'game_menu_navigation_frame'), 'xsize');
    const leftMargin = num(styleBlock(tail, 'game_menu_content_frame'), 'left_margin');
    expect(navSpacer + leftMargin).toBe(num(styleBlock(tail, 'game_menu_label'), 'xpos'));
  });

  it('뷰포트 + 우측 여백이 화면 폭을 넘지 않는다(넘으면 격자가 카드 밖으로 잘려 나간다)', () => {
    const navSpacer = num(styleBlock(tail, 'game_menu_navigation_frame'), 'xsize');
    const content = styleBlock(tail, 'game_menu_content_frame');
    const viewport = num(styleBlock(tail, 'game_menu_viewport'), 'xsize');
    const total = navSpacer + num(content, 'left_margin') + viewport + num(content, 'right_margin');
    expect(total).toBeLessThanOrEqual(1920);
  });

  it('갤러리 격자 한 줄이 뷰포트 폭 안에 들어온다', () => {
    const viewport = num(styleBlock(tail, 'game_menu_viewport'), 'xsize');
    const sc = contentOf(
      generateRenpyFiles(projectWith([galleryScene()], { escMenuUi: { images: escImages(['bg']) } })).files,
      'game/screens.rpy',
    );
    for (const [cols, cell] of [
      [4, 320],
      [3, 430],
    ] as const) {
      expect(sc).toContain(`cols ${cols}`);
      expect(cols * cell + (cols - 1) * 20).toBeLessThanOrEqual(viewport);
    }
  });

  it('설정 그룹이 카드(frame)로 감싸이고 카드 두 장이 뷰포트 폭에 들어간다', () => {
    const sc = contentOf(
      generateRenpyFiles(projectWith([plainScene()], { escMenuUi: { images: escImages(['card']) } })).files,
      'game/screens.rpy',
    );
    expect(sc).toContain('frame:\n                    style "esc_pref_card"');
    expect(sc).toContain('text _("디스플레이") style "esc_pref_title"');
    // style_prefix 를 안 쓴다 — 정의된 적 없는 radio_hbox 를 찾다 죽는 것을 막는 계약.
    expect(sc).not.toContain('style_prefix "radio"\n                        label _("디스플레이")');

    const cardTail = escStylesBlock(sc);
    const cardW = num(styleBlock(cardTail, 'esc_pref_card'), 'xsize');
    const viewport = num(styleBlock(cardTail, 'game_menu_viewport'), 'xsize');
    expect(cardW * 2).toBeLessThanOrEqual(viewport);
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

// 배치시안 대조로 나온 세 가지 마무리(저장 슬롯 본문/페이지 라벨 위치/좌측 내비 기하) — 전부
// escMenu 존재 자체로 갈리고(퀵메뉴처럼 특정 앵커 이미지를 요구하지 않는다), 안 켠 프로젝트는
// screens.rpy 가 바이트 단위로 그대로여야 한다(회귀 0 가드는 마지막 describe).
describe('generateRenpyFiles: ESC 저장 화면·좌측 내비 — 배치시안 마무리 3건', () => {
  it('슬롯 본문 — 실측 아트 규격(320×190) 을 1.2배 구운 절대 배치, 썸네일은 둥근 마스크로 잘라낸다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    // 셀 자체가 아트 비율(384×228)로 고정 — 예전엔 has vbox 라 셀 크기를 못 정했다.
    expect(sc).toContain('button:\n                        action FileAction(slot)\n                        xysize (384, 228)');
    // 안쪽 회색 칸(298×132 를 1.2배 구운 358×158, 좌상단 13,13) — 16:9 스크린샷을 fit=cover 로
    // 채워 자른 뒤 AlphaMask 로 칸 모양(둥근 모서리)대로 마스킹한다.
    expect(sc).toContain('fixed:\n                            pos (13, 13)\n                            xysize (358, 158)');
    expect(sc).toContain('add AlphaMask(Transform(FileScreenshot(slot), fit="cover", xysize=(358, 158)), "gui/esc/save_thumb_mask.png")');
    expect(sc).toContain('text _("빈 슬롯") align (0.5, 0.5) style "esc_slot_empty_text"');
    // 캡션은 칸 아래 여백(slotCaptionTop=186)에 절대좌표로 — 날짜는 칸 좌측, 세이브명은 칸 우측
    // 끝(371=13+358)에 xanchor 1.0 으로 오른쪽 정렬(시안 배치).
    expect(sc).toContain('text FileTime(slot, format=_("{#file_time}%Y.%m.%d · %H:%M"), empty=_("슬롯 [slot]")):\n                            style "slot_time_text"\n                            pos (13, 186)');
    expect(sc).toContain('text FileSaveName(slot):\n                            style "slot_name_text"\n                            pos (371, 186)\n                            xanchor 1.0');
  });

  it('FileTime 에 xanchor 0.0, FileSaveName 에 xanchor 1.0 — 스타일 xalign(0.5) 이 pos 위에 xanchor 로 남아 캡션이 왼쪽으로 밀리지 않게', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    const fileTimeIdx = sc.indexOf('text FileTime(');
    const fileSaveNameIdx = sc.indexOf('text FileSaveName(');
    expect(fileTimeIdx).toBeGreaterThan(-1);
    expect(fileSaveNameIdx).toBeGreaterThan(fileTimeIdx);
    // FileTime 의 xanchor 는 FileSaveName 정의가 시작되기 전(같은 위젯 블록 안)에 나와야 한다.
    expect(sc.slice(fileTimeIdx, fileSaveNameIdx)).toContain('xanchor 0.0');
    expect(sc.slice(fileSaveNameIdx)).toContain('xanchor 1.0');
  });

  it('slot_button 스타일 — padding (0, 0) 으로 재정의(has fixed 자식의 절대좌표 원점이 카드 모서리가 되도록)', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const tail = escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    expect(styleBlock(tail, 'slot_button')).toContain('padding (0, 0)');
  });

  it('slot_time_text/slot_name_text 스타일엔 xalign 이 없다(fixed 안에서 pos 와 앵커가 안 싸우게)', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const tail = escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    expect(styleBlock(tail, 'slot_time_text')).not.toContain('xalign');
    expect(styleBlock(tail, 'slot_name_text')).not.toContain('xalign');
  });

  it('page_label — 제목 옆 절대 위치(xalign 0.0, 음수 ypos)로 덮이고 xalign 0.5 는 안 남는다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const tail = escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    const block = styleBlock(tail, 'page_label');
    expect(block).toContain('xalign 0.0');
    expect(block).not.toContain('xalign 0.5');
    expect(/ypos -\d+/.test(block)).toBe(true);

    const textBlock = styleBlock(tail, 'page_label_text');
    expect(textBlock).toContain(`size ${24}`);
  });

  it('navigation_button/return_button — xminimum/yminimum/selected_left_padding, 글자 크기 축소', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['nav_idle']) } });
    const tail = escStylesBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    for (const name of ['navigation_button', 'return_button']) {
      const block = styleBlock(tail, name);
      expect(block).toContain('xminimum 227');
      expect(block).toContain('yminimum 50');
      expect(block).toContain('selected_left_padding 62');
    }
    for (const name of ['navigation_button_text', 'return_button_text']) {
      expect(styleBlock(tail, name)).toContain('size 28');
    }
  });

  it('ESC 미사용(escMenuUi 없음)이면 위 세 변경 모두 나오지 않고 기존 문구가 그대로다(회귀 0)', () => {
    const { files } = generateRenpyFiles(projectWith([plainScene()]));
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('esc_slot_empty_text');
    expect(sc).not.toContain('AlphaMask(');
    expect(sc).not.toContain('gui/esc/save_thumb_mask.png');
    expect(sc).not.toContain('xysize (384, 228)');
    expect(sc).not.toContain('슬롯 [slot]');
    expect(sc).toContain('empty=_("빈 슬롯")');
    expect(sc).not.toContain('selected_left_padding');
    // 기존(회귀 0) 경로는 원래 has vbox + config.thumbnail_* 그대로.
    expect(sc).toContain('has vbox\n\n                        add FileScreenshot(slot) xalign 0.5');
    // 슬롯 패딩 제거(padding (0, 0))·캡션 xanchor 보정은 escLayoutStyles/fileSlotsBody 의 ESC
    // 분기에서만 나온다. 주의: "xanchor" 자체는 base 템플릿(이름표·기록 화면의 name_xalign 등)에
    // 이미 항상 나오므로 블랭킷 금지는 오검출 — file_slots 캡션에서만 쓰는 "xanchor 0.0"(FileTime)
    // 과 padding (0, 0) 만 콕 집어 없음을 확인한다. xanchor 1.0(FileSaveName)은 이미 위에서
    // "has vbox…" 문구 자체가 회귀 0 임을 보장하므로 별도로 안 짚어도 된다.
    expect(sc).not.toContain('padding (0, 0)');
    expect(sc).not.toContain('xanchor 0.0');
  });
});

// escFontStyles/escFontLine(guiRpy.ts) 이 내는 style 이름 24개 — buildEscMenuStyles 의 이유 주석과 동일.
const ESC_FONT_STYLE_NAMES = [
  'navigation_button_text',
  'return_button_text',
  'game_menu_label_text',
  'page_label_text',
  'page_button_text',
  'slot_button_text',
  'slot_time_text',
  'slot_name_text',
  'esc_slot_empty_text',
  'radio_button_text',
  'check_button_text',
  'pref_label_text',
  'esc_pref_title',
  'esc_pref_sub',
  'history_text',
  'history_name_text',
  'history_label_text',
  'about_text',
  'about_label_text',
  'help_text',
  'help_label_text',
  'help_button_text',
  'confirm_prompt_text',
  'confirm_button_text',
] as const;

describe('generateRenpyFiles: ESC 메뉴 글꼴(escMenuUi.fontId, 작업 1) — mainMenuUi.menuFontId 와 같은 배선', () => {
  it('fontId 미지정이면 gui.rpy·screens.rpy 어디에도 gui.esc_text_font 가 없다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const { files } = generateRenpyFiles(p);
    expect(contentOf(files, 'game/gui.rpy')).not.toContain('gui.esc_text_font');
    expect(contentOf(files, 'game/screens.rpy')).not.toContain('gui.esc_text_font');
  });

  it('이미지가 하나도 없으면(escMenuUi 자체가 회귀 0) fontId 를 줘도 무시된다', () => {
    // buildEscMenuPlan 은 images 가 비어 있으면 무조건 undefined 를 반환한다 — fontId 는 EscMenuPlan
    // 필드가 아니라 project.escMenuUi 필드라 여기까지 값은 있지만, 플랜 자체가 없어 화면 출력엔
    // 어차피 안 쓰인다. 다만 gui.rpy 의 escFont define 은 project.escMenuUi?.fontId 만 보고 독립적으로
    // 나가므로(EscMenuPlan 게이트와 별개) 여기선 gui.rpy 쪽만 확인한다.
    const p = projectWith([plainScene()], { escMenuUi: { fontId: 'custom-esc' } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    expect(sc).not.toContain('ESC 메뉴 이미지 GUI'); // 회귀 0(images 없음) — 스타일 블록 자체가 없다.
  });

  it('fontId 를 지정하면 gui.rpy 에 define 이 나오고, 지정된 스타일 24개 전부에 font gui.esc_text_font 가 붙는다', () => {
    const p = projectWith([plainScene()], {
      escMenuUi: { images: escImages(['bg']), fontId: 'custom-esc' },
    });
    const { files } = generateRenpyFiles(p);
    const gui = contentOf(files, 'game/gui.rpy');
    expect(gui).toContain(`define gui.esc_text_font = "${fontGamePath('custom-esc')}"`);

    const tail = escStylesBlock(contentOf(files, 'game/screens.rpy'));
    const fontTail = escFontBlock(tail);
    expect(fontTail).not.toBe('');
    for (const name of ESC_FONT_STYLE_NAMES) {
      expect(fontTail, `style ${name} 에 font gui.esc_text_font 가 없다`).toContain(`style ${name}:\n    font gui.esc_text_font`);
    }
  });

  it('일본어(textLocales 에 ja)면 define 이 _font_jp(...) 로 감싸진다', () => {
    const p = projectWith([plainScene()], {
      escMenuUi: { images: escImages(['bg']), fontId: 'custom-esc' },
      textLocales: ['ko', 'ja'],
    });
    const gui = contentOf(generateRenpyFiles(p).files, 'game/gui.rpy');
    expect(gui).toContain(`define gui.esc_text_font = _font_jp("${fontGamePath('custom-esc')}")`);
  });
});

describe('generateRenpyFiles: 기록(대사 로그) 행 간격(작업 2) — ESC 활성 여부로만 갈린다(escFont 와 별개)', () => {
  it('ESC 이미지가 있으면(글꼴 미지정이어도) 행 높이가 None, 간격이 escHistoryMetrics(1080).rowGap, 모바일 변형도 None', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const gui = contentOf(generateRenpyFiles(p).files, 'game/gui.rpy');
    expect(gui).toContain('define gui.history_height = None');
    // gui.scale()(720p 기준)이 아니라 baked px — historyBody(screensRpy.ts)의 구분선과 같은 단일
    // 소스(escHistoryMetrics)를 같은 인자(project.height=1080)로 불러야 한다.
    expect(gui).toContain(`define gui.history_spacing = ${escHistoryMetrics(1080).rowGap}`);
    expect((gui.match(/history_height = None/g) ?? []).length).toBe(2); // 기본 + small 변형.
    expect(gui).not.toContain('gui.history_height = gui.scale(140)');
    expect(gui).not.toContain('gui.history_height = gui.scale(190)');
  });

  it('ESC 미사용이면 기존 고정값 그대로다(회귀 0)', () => {
    const gui = contentOf(generateRenpyFiles(projectWith([plainScene()])).files, 'game/gui.rpy');
    expect(gui).toContain('define gui.history_height = gui.scale(140)');
    expect(gui).toContain('define gui.history_spacing = 0');
    expect(gui).toContain('gui.history_height = gui.scale(190)');
    expect(gui).not.toContain('history_height = None');
  });
});

/**
 * screens.rpy 전체에서 screen history() 정의 하나만 잘라낸다 — 'add Solid(' 같은 패턴은 item_popup
 * (`add Solid("#00000073")`) 등 escMenu 와 무관한 다른 화면에도 항상 나오므로, historyBody 검증은
 * 반드시 이 범위로 좁혀야 한다(mainMenuBlock 과 같은 이유, fixtures.ts 참고).
 */
function historyBlock(sc: string): string {
  const start = sc.indexOf('screen history():');
  const end = sc.indexOf('define gui.history_allow_tags', start);
  return sc.slice(start, end);
}

describe('generateRenpyFiles: 기록(대사 로그) 화면 본문 — ESC 모드는 대사 한 줄마다 구분선을 두는 카드 배치로 바뀐다', () => {
  it('ESC 모드면 구분선(add Solid)이 나오고 style_prefix "history" 도 who_args 색 분기도 없다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const block = historyBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    expect(block).toContain('add Solid(');
    expect(block).not.toContain('if "color" in h.who_args');
    // style_prefix "history" 는 새로 감싼 vbox 가 history_vbox(정의된 적 없는 스타일)를 찾다
    // 죽는 원인이라(CLAUDE.md) ESC 분기에선 아예 쓰지 않는다 — 위젯마다 style 을 직접 명시한다.
    expect(block).not.toContain('style_prefix "history"');
    expect(block).toContain('window:\n                    style "history_window"');
    expect(block).toContain('text what:\n                        style "history_text"');
    expect(block).toContain('label _("대화 기록이 비어 있습니다.") style "history_label"');
  });

  it('ESC 미사용이면 stock 그대로 — 구분선 없이 style_prefix "history" 와 who_args 색 분기가 남는다(회귀 0)', () => {
    const block = historyBlock(contentOf(generateRenpyFiles(projectWith([plainScene()])).files, 'game/screens.rpy'));
    expect(block).toContain('        style_prefix "history"');
    expect(block).toContain('if "color" in h.who_args:');
    expect(block).not.toContain('add Solid(');
    expect(block).toContain('label _("대화 기록이 비어 있습니다.")\n');
  });

  it('구분선의 xysize/xoffset 이 escHistoryMetrics 값과 일치한다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const block = historyBlock(contentOf(generateRenpyFiles(p).files, 'game/screens.rpy'));
    const m = escHistoryMetrics(1080);
    expect(block).toContain('add Solid(');
    expect(block).toContain(`xysize (${m.ruleWidth}, ${m.ruleThickness})\n                    xoffset ${m.ruleX}`);
    expect(block).toContain(`vbox:\n                spacing ${m.dividerGap}`);
  });
});

/**
 * screens.rpy 전체에서 screen game_menu(...) 정의 하나만 잘라낸다 — "add Transform(" 은 다른 화면
 * (메인 메뉴 자체 로고 등)에도 나오므로 전체 문자열 검색은 오검출이다(mainMenuBlock/historyBlock 과
 * 같은 이유, fixtures.ts 참고). 끝 지점은 screen 정의 바로 다음에 오는 첫 style 문(base 템플릿에서
 * 항상 그 자리에 있다).
 */
function gameMenuBlock(sc: string): string {
  const start = sc.indexOf('screen game_menu(title, scroll=None, yinitial=0.0, spacing=0):');
  const end = sc.indexOf('style game_menu_outer_frame is empty', start);
  return sc.slice(start, end);
}

describe('generateRenpyFiles: 좌측 사이드바 타이틀 로고 — mainMenuUi.logo 재사용, screen game_menu 전용', () => {
  it('mainMenuUi.logo 가 없으면 title_logo 참조가 없다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    expect(sc).not.toContain('title_logo.png');
  });

  it('로고가 있으면 screen game_menu() 블록 안에 조건 없이 나오고, screen navigation() 블록엔 없다(메인메뉴 자체 로고와 별개)', () => {
    const p = projectWith([plainScene()], {
      escMenuUi: { images: escImages(['bg']) },
      mainMenuUi: { logo: 'logo-asset-1', logoAspect: 2 },
    });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');

    const gmBlock = gameMenuBlock(sc);
    expect(gmBlock).toContain('    add Transform("gui/title_logo.png"');
    // game_menu 는 타이틀 화면엔 안 열리는 메뉴 전용 화면이라 로고가 두 번 나올 일이 없다 — navigation
    // 에 있던 예전 "if not main_menu:" 래핑이 이제 필요 없다.
    expect(gmBlock).not.toContain('if not main_menu:');

    const navStart = sc.indexOf('screen navigation():');
    const navEnd = sc.indexOf('style navigation_button is gui_button');
    expect(navStart).toBeGreaterThan(-1);
    expect(navEnd).toBeGreaterThan(navStart);
    expect(sc.slice(navStart, navEnd)).not.toContain('title_logo.png');

    // 메인 메뉴 화면 자체의 큰 로고(buildImageMainMenuScreen) 1개 + 사이드바 작은 로고 1개 = 총 2번.
    expect((sc.match(/title_logo\.png/g) ?? []).length).toBe(2);
  });

  it('showSidebarLogo: false 면 로고가 있어도 game_menu 블록엔 나오지 않는다(메인 메뉴 자체 로고는 유지)', () => {
    const p = projectWith([plainScene()], {
      escMenuUi: { images: escImages(['bg']), showSidebarLogo: false },
      mainMenuUi: { logo: 'logo-asset-1' },
    });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    expect(gameMenuBlock(sc)).not.toContain('title_logo.png');
    // 메인 메뉴 자체 로고(1개)는 showSidebarLogo 와 무관하게 그대로 남는다.
    expect((sc.match(/title_logo\.png/g) ?? []).length).toBe(1);
  });
});

describe('generateRenpyFiles: game_menu 배경 — 타이틀에서 연 메뉴도 ESC 공통배경으로 통일(has(\'bg\') 게이트)', () => {
  it('bg 를 올리면 배경이 gui.game_menu_background 단일 분기로 통일되고 main_menu_background 참조가 없다', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['bg']) } });
    const sc = contentOf(generateRenpyFiles(p).files, 'game/screens.rpy');
    const block = gameMenuBlock(sc);
    expect(block).toContain(
      '    add Transform(gui.game_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))',
    );
    expect(block).not.toContain('gui.main_menu_background');
    // game_menu 블록엔 "if main_menu:"가 배경 분기 말고 하단의 key "game_menu" 처리에도 등장하므로
    // (base 템플릿 stock 부분, escMenu 와 무관) 배경 if/else 자체가 없어졌는지는 정확한 패턴으로 짚는다.
    expect(block).not.toContain('    if main_menu:\n        add Transform(');
  });

  it('bg 없이 다른 ESC 롤만 올리면 기존 if main_menu: 분기가 그대로 남는다(스크림 제거도 같은 게이트라 짝이 맞다)', () => {
    const p = projectWith([plainScene()], { escMenuUi: { images: escImages(['card']) } });
    const { files } = generateRenpyFiles(p);
    const sc = contentOf(files, 'game/screens.rpy');
    const block = gameMenuBlock(sc);
    expect(block).toContain(
      '    if main_menu:\n        add Transform(gui.main_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))\n    else:\n        add Transform(gui.game_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))',
    );
    // 스크림 제거(buildEscMenuStyles)도 has('bg') 게이트라, bg 가 없으면 이쪽도 안 나와야 짝이 맞는다.
    expect(escStylesBlock(sc)).not.toContain('style game_menu_outer_frame:\n    background None');
  });

  it('ESC 미사용이면 game_menu/navigation 두 화면 모두 stock 그대로다(회귀 0)', () => {
    const sc = contentOf(generateRenpyFiles(projectWith([plainScene()])).files, 'game/screens.rpy');
    const block = gameMenuBlock(sc);
    expect(block).toContain(
      '    if main_menu:\n        add Transform(gui.main_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))\n    else:\n        add Transform(gui.game_menu_background, fit="cover", xysize=(config.screen_width, config.screen_height))',
    );
    const navStart = sc.indexOf('screen navigation():');
    const navEnd = sc.indexOf('style navigation_button is gui_button');
    expect(sc.slice(navStart, navEnd)).not.toContain('title_logo.png');
  });
});
