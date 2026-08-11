import { describe, it, expect } from 'vitest';
import { resolveOutfit, outfitFlags } from '../src/types';
import type { Scene, OutfitRule, Line } from '../src/types';

function scene(patch: Partial<Scene> = {}): Scene {
  return {
    id: 's1',
    title: '장면1',
    direction: [],
    cg: [],
    lines: [],
    choices: [],
    status: 'review',
    ...patch,
  };
}

describe('resolveOutfit: 배경 키워드 규칙 우선순위(장면 직접 지정 > 가장 구체적인 키워드 > 기본)', () => {
  it('scene.outfits 의 장면 직접 지정이 매칭되는 규칙보다 우선한다', () => {
    const rules: OutfitRule[] = [{ keyword: '카페', charName: '한지수', outfit: '카페복' }];
    const sc = scene({ background: '아침 카페', outfits: { 한지수: '교복' } });
    expect(resolveOutfit(rules, sc, '한지수')).toBe('교복');
  });

  it('배경 이름에 키워드가 부분 포함되면 규칙이 적용된다', () => {
    const rules: OutfitRule[] = [{ keyword: '카페', charName: '한지수', outfit: '카페복' }];
    const sc = scene({ background: '아침 카페 안' });
    expect(resolveOutfit(rules, sc, '한지수')).toBe('카페복');
  });

  it('두 규칙이 모두 매칭되면 더 구체적인(긴) 키워드가 이긴다 — 배열 순서와 무관', () => {
    const rules: OutfitRule[] = [
      { keyword: '방', charName: '한지수', outfit: '잠옷' }, // 짧지만 앞에 있음
      { keyword: '해변가', charName: '한지수', outfit: '수영복' },
    ];
    const sc = scene({ background: '해변가 방 안' });
    expect(resolveOutfit(rules, sc, '한지수')).toBe('수영복');
    // 순서를 뒤집어도 결과가 같아야 한다(순서 조정 없이도 의도대로 동작하는 게 이 규칙의 목적).
    expect(resolveOutfit([...rules].reverse(), sc, '한지수')).toBe('수영복');
  });

  it('더 구체적인 키워드로 일반 규칙을 덮어쓸 수 있다 — 카페 vs 밤 카페', () => {
    const rules: OutfitRule[] = [
      { keyword: '카페', charName: '한지수', outfit: '카페복' },
      { keyword: '밤 카페', charName: '한지수', outfit: '기본' }, // 퇴근 후엔 사복
    ];
    expect(resolveOutfit(rules, scene({ background: '아침 카페 안' }), '한지수')).toBe('카페복');
    expect(resolveOutfit(rules, scene({ background: '밤 카페 안' }), '한지수')).toBe('기본');
  });

  it('키워드 길이가 같으면 먼저 추가한 규칙이 이긴다(결정적 동작)', () => {
    const rules: OutfitRule[] = [
      { keyword: '카페', charName: '한지수', outfit: '카페복' },
      { keyword: '아침', charName: '한지수', outfit: '잠옷' },
    ];
    expect(resolveOutfit(rules, scene({ background: '아침 카페 안' }), '한지수')).toBe('카페복');
  });

  it('다른 캐릭터(charName) 대상 규칙은 적용되지 않는다', () => {
    const rules: OutfitRule[] = [{ keyword: '카페', charName: '강민주', outfit: '카페복' }];
    const sc = scene({ background: '아침 카페' });
    expect(resolveOutfit(rules, sc, '한지수')).toBe('기본');
  });

  it('배경이 없거나 매칭되는 규칙이 없으면 기본으로 폴백한다', () => {
    const rules: OutfitRule[] = [{ keyword: '카페', charName: '한지수', outfit: '카페복' }];
    expect(resolveOutfit(rules, scene(), '한지수')).toBe('기본');
    expect(resolveOutfit(rules, scene({ background: '학교' }), '한지수')).toBe('기본');
  });

  it('공백만 있는 키워드는 무시된다(오입력 방지)', () => {
    const rules: OutfitRule[] = [{ keyword: '   ', charName: '한지수', outfit: '카페복' }];
    const sc = scene({ background: '아무 배경' });
    expect(resolveOutfit(rules, sc, '한지수')).toBe('기본');
  });
});

/** 대사 한 줄(줄 의상 override 를 붙일 수 있게 한 축약). */
function dlg(speaker: string, text: string, outfits?: Record<string, string>): Line {
  return { kind: 'dialogue', speaker, text, ...(outfits ? { outfits } : {}) };
}

describe('outfitFlags: 장면 내 줄 단위 의상 전환(판정 단일 소스)', () => {
  it('줄 override 가 하나도 없으면 전 줄이 resolveOutfit 결과와 같다(회귀 0)', () => {
    const rules: OutfitRule[] = [{ keyword: '카페', charName: '한지수', outfit: '카페복' }];
    const sc = scene({ background: '아침 카페', lines: [dlg('한지수', 'a'), dlg('한지수', 'b')] });
    expect(outfitFlags(sc, rules, '한지수')).toEqual(['카페복', '카페복']);
  });

  it('줄 override 는 그 줄부터 적용되고 다음 override 까지 유지된다(같은 장면 2회 전환)', () => {
    const sc = scene({
      outfits: { 한지수: '교복' },
      lines: [
        dlg('한지수', '0'),
        dlg('한지수', '1', { 한지수: '카페복' }),
        dlg('한지수', '2'),
        dlg('한지수', '3', { 한지수: '사복' }),
        dlg('한지수', '4'),
      ],
    });
    expect(outfitFlags(sc, undefined, '한지수')).toEqual(['교복', '카페복', '카페복', '사복', '사복']);
  });

  it('지문(narration) 줄에서도 전환되고, 적히지 않은 캐릭터는 앞 상태를 유지한다', () => {
    const sc = scene({
      lines: [
        dlg('한지수', '0'),
        { kind: 'narration', text: '지문', outfits: { 한지수: '사복' } },
        dlg('강민주', '2', { 강민주: '교복' }),
      ],
    });
    expect(outfitFlags(sc, undefined, '한지수')).toEqual(['기본', '사복', '사복']);
    expect(outfitFlags(sc, undefined, '강민주')).toEqual(['기본', '기본', '교복']);
  });

  it('줄 override 는 장면 직접 지정·배경 키워드 규칙보다 우선한다(그 줄 이후로만)', () => {
    const rules: OutfitRule[] = [{ keyword: '카페', charName: '한지수', outfit: '카페복' }];
    const sc = scene({
      background: '아침 카페',
      outfits: { 한지수: '교복' },
      lines: [dlg('한지수', '0'), dlg('한지수', '1', { 한지수: '수영복' })],
    });
    expect(outfitFlags(sc, rules, '한지수')).toEqual(['교복', '수영복']);
  });

  it('의상 마커가 아닌 라인(item/cg/bgm)도 자리를 차지해 인덱스가 lines 와 1:1 로 맞는다', () => {
    const sc = scene({
      lines: [
        dlg('한지수', '0'),
        { kind: 'cg', desc: '컷' },
        dlg('한지수', '2', { 한지수: '사복' }),
        { kind: 'item', name: '편지' },
      ],
    });
    expect(outfitFlags(sc, undefined, '한지수')).toEqual(['기본', '기본', '사복', '사복']);
  });
});
