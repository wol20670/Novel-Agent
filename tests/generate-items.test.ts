import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, resolveItems } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene } from '../src/types';

function sceneWith(lines: Scene['lines']): Scene {
  return { id: 's1', title: '장면1', direction: [], cg: [], lines, choices: [], status: 'approved' };
}

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

describe('resolveItems', () => {
  it('이름 기준으로 유니크 수집하고 같은 이름은 같은 태그를 공유한다', () => {
    const p = projectWith([
      sceneWith([
        { kind: 'item', name: '편지' },
        { kind: 'item', name: '' }, // 닫기 마커는 제외
        { kind: 'item', name: '반지' },
      ]),
      sceneWith([{ kind: 'item', name: '편지' }]), // 다른 장면의 같은 이름 → 공유
    ]);
    const items = resolveItems(p);
    expect(items.map((i) => i.name)).toEqual(['편지', '반지']);
    expect(items[0].tag).toBe('item_1');
    expect(items[0].file).toBe('item_1.png');
  });

  it('승인되지 않은 장면의 아이템은 제외한다', () => {
    const draft = sceneWith([{ kind: 'item', name: '비밀' }]);
    draft.status = 'review';
    expect(resolveItems(projectWith([draft]))).toHaveLength(0);
  });
});

describe('generateRenpyFiles: 아이템 팝업 + 보관함 출력', () => {
  const p = projectWith([
    sceneWith([
      { kind: 'item', name: '편지' },
      { kind: 'narration', text: '낡은 편지가 떨어져 있었다' },
      { kind: 'item', name: '' },
      { kind: 'dialogue', speaker: '민주', text: '이건...' },
    ]),
  ]);
  const { files } = generateRenpyFiles(p);

  it('script.rpy 에 해금·팝업 표시·닫기가 순서대로 나온다', () => {
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).toContain('$ persistent.item_found["item_1"] = True');
    expect(s).toContain('show screen item_popup("item_1", "편지")');
    expect(s).toContain('hide screen item_popup');
  });

  it('assets.rpy 에 아이템 이미지가 정의된다', () => {
    expect(fileOf(files, 'game/assets.rpy')!.content).toContain('image item_1 = "images/item_1.png"');
  });

  it('items.rpy 가 persistent 기본값·갤러리 목록과 함께 생성된다', () => {
    const it = fileOf(files, 'game/items.rpy');
    expect(it).toBeTruthy();
    expect(it!.content).toContain('default persistent.item_found = dict()');
    expect(it!.content).toContain('define gui.items_all = [ ("item_1", "편지") ]');
  });

  it('screens.rpy 에 팝업·라이트박스·갤러리 화면과 내비 버튼이 들어간다', () => {
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('screen item_popup(img, caption):');
    expect(sc).toContain('screen item_lightbox(img, caption):');
    expect(sc).toContain('screen item_gallery():');
    expect(sc).toContain('textbutton _("발견한 아이템") action ShowMenu("item_gallery")');
  });

  it('item_popup 의 페이드/줌 인 애니메이션은 별도 transform 으로 분리된다(add 블록에 SL 프로퍼티와 ATL 워퍼를 섞으면 파싱 에러)', () => {
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).toContain('add img at item_popup_appear:');
    expect(sc).toContain('transform item_popup_appear:');
    expect(sc).toContain('easein 0.22 alpha 1.0 zoom 1.0');
    // add 블록 안에는 순수 SL 프로퍼티만 남아야 한다(easein 이 함께 있으면 회귀).
    const addBlock = sc.slice(sc.indexOf('add img at item_popup_appear:'), sc.indexOf('text caption:'));
    expect(addBlock).not.toContain('easein');
  });
});

describe('generateRenpyFiles: 아이템이 없으면 관련 출력을 내지 않는다', () => {
  const { files } = generateRenpyFiles(
    projectWith([sceneWith([{ kind: 'dialogue', speaker: '민주', text: '안녕' }])]),
  );

  it('items.rpy 를 만들지 않는다', () => {
    expect(fileOf(files, 'game/items.rpy')).toBeFalsy();
  });

  it('screens.rpy 에 갤러리·내비 버튼이 없다', () => {
    const sc = fileOf(files, 'game/screens.rpy')!.content;
    expect(sc).not.toContain('screen item_gallery');
    expect(sc).not.toContain('발견한 아이템');
  });
});
