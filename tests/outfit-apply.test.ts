// Outfit AI 수락 경로(순수) — O5·O8·O16·O17·O19·O20·O22·O27.
// store 하네스 없이 정면 검증한다: 9+2 재검증 · 레코드 머지/정리 · 일괄 적용의 순차 재검증.

import { describe, it, expect } from 'vitest';
import {
  foldSceneSuggestions,
  mergeLineOutfit,
  outfitLineKey,
  validateOutfitSuggestion,
  type OutfitSuggestion,
} from '../src/generators/outfit';
import { collectEmotionTargets } from '../src/generators/emotion/aiSelect';
import { generateRenpyFiles } from '../src/renpy/generate';
import { outfitFlags, resolveOutfit, type Character, type Line, type Project, type Scene } from '../src/types';
import { contentOf, dialogue, projectWith, scene } from './fixtures';

function heroine(name = '민주', outfits = ['교복', '사복']): Character {
  return {
    name,
    color: '#fff',
    expressions: { 기본: 'a-base', 기쁨: 'a-joy' },
    outfits: outfits.map((o) => ({ name: o, expressions: { 기본: `a-${o}`, 기쁨: `a-${o}-joy` } })),
  };
}

function sug(patch: Partial<OutfitSuggestion> & { lineIndex: number }, sc: Scene): OutfitSuggestion {
  return {
    sceneId: sc.id,
    character: '민주',
    outfit: '사복',
    lineKey: outfitLineKey(sc.lines[patch.lineIndex]),
    ...patch,
  };
}

describe('O5 — mergeLineOutfit: 같은 줄 다중 캐릭터 머지 + 빈 레코드 정리', () => {
  const base = scene({ lines: [dialogue('민주', 'a'), dialogue('지수', 'b')] });

  it('같은 줄에 두 캐릭터를 각각 머지한다(서로 덮어쓰지 않는다)', () => {
    let sc = mergeLineOutfit(base, 0, '민주', '사복');
    sc = mergeLineOutfit(sc, 0, '지수', '교복');
    expect((sc.lines[0] as Extract<Line, { kind: 'dialogue' }>).outfits).toEqual({
      민주: '사복',
      지수: '교복',
    });
  });

  it('한 키만 지우면 나머지 키는 남는다', () => {
    let sc = mergeLineOutfit(base, 0, '민주', '사복');
    sc = mergeLineOutfit(sc, 0, '지수', '교복');
    sc = mergeLineOutfit(sc, 0, '민주', undefined);
    expect((sc.lines[0] as Extract<Line, { kind: 'dialogue' }>).outfits).toEqual({ 지수: '교복' });
  });

  it('마지막 키를 지우면 빈 {} 가 아니라 undefined 가 된다', () => {
    let sc = mergeLineOutfit(base, 0, '민주', '사복');
    sc = mergeLineOutfit(sc, 0, '민주', undefined);
    expect((sc.lines[0] as Extract<Line, { kind: 'dialogue' }>).outfits).toBeUndefined();
  });

  it('대사·지문이 아닌 줄엔 쓰지 않는다', () => {
    const withCg = scene({ cg: ['키스'], lines: [{ kind: 'cg', desc: '키스' }] });
    expect(mergeLineOutfit(withCg, 0, '민주', '사복')).toBe(withCg);
  });
});

describe('O20 — apply 직전 재검증 9+2', () => {
  const sc = scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] });
  const project = projectWith([sc], { characters: [heroine()] });
  const ok = sug({ lineIndex: 1 }, sc);

  it('정상 제안은 ok', () => {
    expect(validateOutfitSuggestion(project, sc, ok)).toBe('ok');
  });

  it('1·2 scene/lineIndex 범위', () => {
    expect(validateOutfitSuggestion(project, undefined, ok)).toBe('stale');
    expect(validateOutfitSuggestion(project, sc, { ...ok, lineIndex: 99 })).toBe('stale');
  });

  it('3 dialogue/narration 이 아닌 줄', () => {
    const cgScene = scene({ cg: ['x'], lines: [{ kind: 'cg', desc: 'x' }] });
    const p2 = projectWith([cgScene], { characters: [heroine()] });
    expect(
      validateOutfitSuggestion(p2, cgScene, { ...ok, sceneId: cgScene.id, lineIndex: 0, lineKey: 'cg||' }),
    ).toBe('stale');
  });

  it('4 lineKey 불일치(O17 — 그 사이 대본이 바뀜)', () => {
    expect(validateOutfitSuggestion(project, sc, { ...ok, lineKey: 'dialogue|민주|옛 대사' })).toBe('stale');
  });

  it('5 캐릭터 없음 / 6 주인공·의상 0 / 그 장면 화자 아님', () => {
    expect(validateOutfitSuggestion(project, sc, { ...ok, character: '없는사람' })).toBe('stale');
    const pro = projectWith([sc], { characters: [{ ...heroine(), isProtagonist: true }] });
    expect(validateOutfitSuggestion(pro, sc, ok)).toBe('stale');
    const noOutfit = projectWith([sc], { characters: [{ name: '민주', color: '#fff', expressions: {} }] });
    expect(validateOutfitSuggestion(noOutfit, sc, ok)).toBe('stale');
    const other = scene({ lines: [dialogue('지수', 'a'), dialogue('지수', 'b')] });
    const p3 = projectWith([other], { characters: [heroine(), heroine('지수')] });
    expect(validateOutfitSuggestion(p3, other, { ...ok, sceneId: other.id, lineKey: outfitLineKey(other.lines[1]) })).toBe(
      'stale',
    );
  });

  it('7 후보 밖 의상(fuzzy 없음)', () => {
    expect(validateOutfitSuggestion(project, sc, { ...ok, outfit: '드레스' })).toBe('stale');
  });

  it('8 그 사이 사람이 그 자리를 선점', () => {
    const taken = mergeLineOutfit(sc, 1, '민주', '교복');
    const p2 = projectWith([taken], { characters: [heroine()] });
    expect(validateOutfitSuggestion(p2, taken, ok)).toBe('stale');
  });

  it('9 no-op(현재 fold 기준 같은 의상)', () => {
    expect(validateOutfitSuggestion(project, sc, { ...ok, outfit: '기본' })).toBe('noop');
  });

  it('10 그 사이 CG cutoff 가 앞으로 이동하면 stale(dead write 방지)', () => {
    const withCg: Scene = {
      ...sc,
      cg: ['키스'],
      lines: [dialogue('민주', 'a'), { kind: 'cg', desc: '키스' }, dialogue('민주', 'b')],
    };
    const p2 = projectWith([withCg], { characters: [heroine()] });
    // lineIndex 2 는 이제 cutoff(1) 뒤라 생성기가 아무것도 내지 않는다.
    expect(
      validateOutfitSuggestion(p2, withCg, { ...ok, lineIndex: 2, lineKey: outfitLineKey(withCg.lines[2]) }),
    ).toBe('stale');
  });

  it('11 첫 텍스트 줄인데 그 사이 Scene.outfits manual baseline 이 생기면 stale', () => {
    // ⚠️ 8·9 만으로는 못 잡는다: 줄 manual 은 없고(8 통과) 교복≠사복이라 no-op 도 아니다(9 통과).
    const withBaseline: Scene = { ...sc, outfits: { 민주: '교복' } };
    const p2 = projectWith([withBaseline], { characters: [heroine()] });
    const firstLine = sug({ lineIndex: 0 }, sc);
    expect(validateOutfitSuggestion(p2, withBaseline, firstLine)).toBe('stale');
    // 첫 줄이 아니면 여전히 적용 가능하다.
    expect(validateOutfitSuggestion(p2, withBaseline, sug({ lineIndex: 1 }, sc))).toBe('ok');
  });
});

describe('O22 — joint 줄에서 두 member 각각 target · 같은 줄 머지', () => {
  it('합동 대사 줄에 두 member 제안을 적용하면 한 레코드에 둘 다 들어간다', () => {
    const sc = scene({
      lines: [dialogue('민주 & 지수', '같이 가자', { members: ['민주', '지수'] }), dialogue('민주', 'b')],
    });
    const project = projectWith([sc], { characters: [heroine('민주'), heroine('지수')] });
    const list: OutfitSuggestion[] = [
      sug({ lineIndex: 0, character: '민주', outfit: '사복' }, sc),
      sug({ lineIndex: 0, character: '지수', outfit: '교복' }, sc),
    ];
    const r = foldSceneSuggestions(project, sc, list);
    expect(r.applied).toBe(2);
    expect((r.scene.lines[0] as Extract<Line, { kind: 'dialogue' }>).outfits).toEqual({
      민주: '사복',
      지수: '교복',
    });
  });
});

describe('O27 — 일괄 적용은 갱신된 working state 로 순차 재검증한다', () => {
  it('앞 적용이 뒤 제안을 no-op 으로 만들면 그건 건너뛴다', () => {
    const sc = scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), dialogue('민주', 'c')] });
    const project = projectWith([sc], { characters: [heroine()] });
    const list: OutfitSuggestion[] = [
      sug({ lineIndex: 1, outfit: '사복' }, sc),
      sug({ lineIndex: 2, outfit: '사복' }, sc), // 1번이 적용되면 carry 되어 no-op 이 된다
    ];
    const r = foldSceneSuggestions(project, sc, list);
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(1);
    expect((r.scene.lines[2] as Extract<Line, { kind: 'dialogue' }>).outfits).toBeUndefined();
    // 원본 스냅샷 기준으로 독립 판정했다면 둘 다 적용돼 중복 지정이 남았을 것이다.
    expect(outfitFlags(r.scene, undefined, '민주')).toEqual(['기본', '사복', '사복']);
  });

  it('전부 스킵되면 changed=false(커밋·revision 대상 아님)', () => {
    const sc = scene({ lines: [dialogue('민주', 'a')] });
    const project = projectWith([sc], { characters: [heroine()] });
    const r = foldSceneSuggestions(project, sc, [sug({ lineIndex: 0, outfit: '기본' }, sc)]);
    expect(r).toMatchObject({ applied: 0, skipped: 1, changed: false });
    expect(r.scene).toBe(sc); // 원본 그대로
  });

  it('lineIndex 오름차순으로 처리한다(입력 순서가 뒤섞여 있어도)', () => {
    const sc = scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), dialogue('민주', 'c')] });
    const project = projectWith([sc], { characters: [heroine('민주', ['교복', '사복'])] });
    const r = foldSceneSuggestions(project, sc, [
      sug({ lineIndex: 2, outfit: '교복' }, sc),
      sug({ lineIndex: 1, outfit: '사복' }, sc),
    ]);
    expect(r.applied).toBe(2);
    expect(outfitFlags(r.scene, undefined, '민주')).toEqual(['기본', '사복', '교복']);
  });
});

describe('O19 — Scene 경계 비전파', () => {
  it('한 장면의 Line.outfits 를 고쳐도 다음 장면 baseline 은 그대로다(자동 분할 sibling 포함)', () => {
    const s1 = scene({ id: 's1', title: '카페', lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] });
    const s2 = scene({ id: 's2', title: '카페 · 이어서', lines: [dialogue('민주', 'c')] });
    const project = projectWith([s1, s2], { characters: [heroine()] });

    const r = foldSceneSuggestions(project, s1, [sug({ lineIndex: 1, outfit: '사복' }, s1)]);
    expect(r.applied).toBe(1);

    // 현재 장면 안에서만 carry
    expect(outfitFlags(r.scene, undefined, '민주')).toEqual(['기본', '사복']);
    // 다음 장면은 그대로 — Scene.outfits 도 baseline 도 안 바뀐다(propagation engine 없음)
    expect(s2.outfits).toBeUndefined();
    expect(resolveOutfit(undefined, s2, '민주')).toBe('기본');
    expect(outfitFlags(s2, undefined, '민주')).toEqual(['기본']);
  });
});

describe('O8 — 첫 텍스트 줄 적용 = Scene-start 지정과 관찰 결과가 같다', () => {
  const lines: Line[] = [dialogue('민주', '안녕'), dialogue('민주', '오늘 어때')];

  it('첫 줄부터의 outfitFlags 가 동일하다', () => {
    const viaScene = scene({ id: 'sx', outfits: { 민주: '사복' }, lines });
    const viaLine = mergeLineOutfit(scene({ id: 'sx', lines }), 0, '민주', '사복');
    expect(outfitFlags(viaLine, undefined, '민주')).toEqual(outfitFlags(viaScene, undefined, '민주'));
  });

  it('생성된 script.rpy 가 바이트 단위로 같다', () => {
    const mk = (sc: Scene): Project => projectWith([sc], { characters: [heroine()] });
    const viaScene = generateRenpyFiles(mk(scene({ id: 'sx', title: '장면1', outfits: { 민주: '사복' }, lines })));
    const viaLine = generateRenpyFiles(mk(mergeLineOutfit(scene({ id: 'sx', title: '장면1', lines }), 0, '민주', '사복')));
    expect(contentOf(viaLine.files, 'game/script.rpy')).toBe(contentOf(viaScene.files, 'game/script.rpy'));
  });
});

describe('O16 — 수락 후 표정 AI 후보는 새 의상 기준, 기존 표정 값은 보존', () => {
  it('collectEmotionTargets 가 새 의상의 후보를 본다', () => {
    // '사복'에만 있는 표정을 하나 만들어, 전환 뒤 줄의 후보가 바뀌는지 본다.
    const c: Character = {
      name: '민주',
      color: '#fff',
      expressions: { 기본: 'a-base' },
      outfits: [{ name: '사복', expressions: { 기본: 'a-c-base', 기쁨: 'a-c-joy' } }],
    };
    const sc = scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] });
    const before = projectWith([sc], { characters: [c] });
    const beforeCands = collectEmotionTargets(before)[0].candidatesByKey;
    expect([...beforeCands.values()][0]).toEqual(['기본']); // 기본 의상엔 기쁨 스프라이트가 없다

    const applied = mergeLineOutfit(sc, 1, '민주', '사복');
    const after = projectWith([applied], { characters: [c] });
    const afterBatch = collectEmotionTargets(after)[0];
    const line1 = afterBatch.items.find((it) => it.i === 1)!;
    expect(line1.outfit).toBe('사복');
    expect(afterBatch.candidatesByKey.get(JSON.stringify(['민주', '사복']))).toEqual(['기본', '기쁨']);
  });

  it('기존 emotion·emotionAuto 는 의상 적용으로 지워지지 않는다', () => {
    const sc = scene({
      lines: [
        dialogue('민주', 'a', { emotion: '기쁨' }),
        dialogue('민주', 'b', { emotionAuto: '슬픔' }),
      ],
    });
    const next = mergeLineOutfit(sc, 1, '민주', '사복');
    expect((next.lines[0] as Extract<Line, { kind: 'dialogue' }>).emotion).toBe('기쁨');
    expect((next.lines[1] as Extract<Line, { kind: 'dialogue' }>).emotionAuto).toBe('슬픔');
  });
});
