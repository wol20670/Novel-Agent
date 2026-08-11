// 의상 삭제(removeOutfit) 시 그 의상을 가리키던 장면 참조 정리 — 장면 시작 의상(Scene.outfits)과
// 줄 단위 전환(Line.outfits) 두 자리 모두. 액션 본체는 IndexedDB(commitAssetSwap)를 타서 node
// 환경 단위테스트가 어려우므로, 판정 자체는 순수 함수(store/helpers.ts)로 두고 여기서 검증한다.

import { describe, it, expect } from 'vitest';
import { stripOutfitRefs } from '../src/store/helpers';
import type { Line, Scene } from '../src/types';
import { scene, dialogue } from './fixtures';

const outfitsOf = (l: Line) => (l.kind === 'dialogue' || l.kind === 'narration' ? l.outfits : undefined);

describe('stripOutfitRefs: 삭제된 의상을 가리키던 참조 정리', () => {
  it('장면 참조와 줄 참조를 함께 지우되, 같은 레코드의 다른 캐릭터 전환은 보존한다', () => {
    const scenes: Scene[] = [
      scene({
        outfits: { 히로인: 'cafe_uniform', 민주: '교복' },
        lines: [
          dialogue('히로인', '0'),
          dialogue('히로인', '1', { outfits: { 히로인: 'cafe_uniform', 민주: '교복' } }),
          { kind: 'narration', text: '지문', outfits: { 히로인: 'cafe_uniform' } } as Line,
          { kind: 'item', name: '편지' },
        ],
      }),
    ];

    const [sc] = stripOutfitRefs(scenes, '히로인', 'cafe_uniform');

    expect(sc.outfits).toEqual({ 민주: '교복' }); // 장면 참조에서 히로인만 빠진다
    expect(outfitsOf(sc.lines[0])).toBeUndefined();
    expect(outfitsOf(sc.lines[1])).toEqual({ 민주: '교복' }); // 다른 캐릭터 전환은 그대로
    expect(outfitsOf(sc.lines[2])).toBeUndefined(); // 비면 undefined 로 정리
    expect(sc.lines[3]).toEqual({ kind: 'item', name: '편지' }); // item/cg/bgm 은 무관
  });

  it('다른 의상값·다른 캐릭터 참조는 건드리지 않는다', () => {
    const scenes: Scene[] = [
      scene({
        outfits: { 히로인: '사복' },
        lines: [
          dialogue('히로인', '0', { outfits: { 히로인: '사복' } }), // 다른 의상값
          dialogue('민주', '1', { outfits: { 민주: 'cafe_uniform' } }), // 다른 캐릭터
        ],
      }),
    ];

    const [sc] = stripOutfitRefs(scenes, '히로인', 'cafe_uniform');

    expect(sc).toBe(scenes[0]); // 참조가 없으면 장면 객체 identity 까지 그대로(불필요한 리렌더 방지)
    expect(sc.outfits).toEqual({ 히로인: '사복' });
    expect(outfitsOf(sc.lines[1])).toEqual({ 민주: 'cafe_uniform' });
  });

  it('장면 참조만 있어도(줄 참조 없음) 기존 동작 그대로 그 키만 지운다', () => {
    const scenes: Scene[] = [scene({ outfits: { 히로인: 'cafe_uniform' }, lines: [dialogue('히로인', '0')] })];
    const [sc] = stripOutfitRefs(scenes, '히로인', 'cafe_uniform');
    expect(sc.outfits).toEqual({}); // 빈 객체를 남기는 기존 semantics 유지
    expect(sc.lines[0]).toBe(scenes[0].lines[0]);
  });
});
