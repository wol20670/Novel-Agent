import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, resolveItems } from '../src/renpy/generate';
import { fileOf, contentOf, scene, dialogue, projectWith } from './fixtures';

describe('resolveItems', () => {
  it('이름 기준으로 유니크 수집하고 같은 이름은 같은 태그를 공유한다', () => {
    const p = projectWith([
      scene({
        lines: [
          { kind: 'item', name: '편지' },
          { kind: 'item', name: '' }, // 닫기 마커는 제외
          { kind: 'item', name: '반지' },
        ],
      }),
      scene({ id: 's2', lines: [{ kind: 'item', name: '편지' }] }), // 다른 장면의 같은 이름 → 공유
    ]);
    const items = resolveItems(p);
    expect(items.map((i) => i.name)).toEqual(['편지', '반지']);
    expect(items[0].tag).toBe('item_1');
    expect(items[0].file).toBe('item_1.png');
  });

  it('승인되지 않은 장면의 아이템은 제외한다', () => {
    const draft = scene({ lines: [{ kind: 'item', name: '비밀' }], status: 'review' });
    expect(resolveItems(projectWith([draft]))).toHaveLength(0);
  });
});

describe('generateRenpyFiles: 아이템 팝업 + 보관함 출력', () => {
  const p = projectWith([
    scene({
      lines: [
        { kind: 'item', name: '편지' },
        { kind: 'narration', text: '낡은 편지가 떨어져 있었다' },
        { kind: 'item', name: '' },
        dialogue('민주', '이건...'),
      ],
    }),
  ]);
  const { files } = generateRenpyFiles(p);

  it('script.rpy 에 해금·팝업 표시·닫기가 순서대로 나온다', () => {
    const s = contentOf(files, 'game/script.rpy');
    expect(s).toContain('$ persistent.item_found["item_1"] = True');
    expect(s).toContain('show screen item_popup("item_1", "편지")');
    expect(s).toContain('hide screen item_popup');
  });

  it('assets.rpy 에 아이템 이미지가 정의된다', () => {
    expect(contentOf(files, 'game/assets.rpy')).toContain('image item_1 = "images/item_1.png"');
  });

  it('items.rpy 가 persistent 기본값·갤러리 목록과 함께 생성된다', () => {
    const it = fileOf(files, 'game/items.rpy');
    expect(it).toBeTruthy();
    expect(it!.content).toContain('default persistent.item_found = dict()');
    expect(it!.content).toContain('define gui.items_all = [ ("item_1", "편지") ]');
  });

  it('screens.rpy 에 팝업·라이트박스·갤러리 화면과 내비 버튼이 들어간다', () => {
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).toContain('screen item_popup(img, caption):');
    expect(sc).toContain('screen gallery_lightbox(img):');
    expect(sc).toContain('screen item_gallery():');
    expect(sc).toContain('textbutton _("발견한 아이템") action ShowMenu("item_gallery")');
  });
});

describe('generateRenpyFiles: 아이템이 없으면 관련 출력을 내지 않는다', () => {
  const { files } = generateRenpyFiles(projectWith([scene({ lines: [dialogue('민주', '안녕')] })]));

  it('items.rpy 를 만들지 않는다', () => {
    expect(fileOf(files, 'game/items.rpy')).toBeFalsy();
  });

  it('screens.rpy 에 갤러리·내비 버튼이 없다', () => {
    const sc = contentOf(files, 'game/screens.rpy');
    expect(sc).not.toContain('screen item_gallery');
    expect(sc).not.toContain('발견한 아이템');
  });
});
