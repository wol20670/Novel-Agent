// 장면 내 의상 전환(Line.outfits) — 판정 단일 소스는 outfitFlags(types/project.ts), generate.ts 는
// 그 결과를 ① 숨김 복원 ② 비화자 의상 동기화 ③ 화자 show 세 자리에서 같은 폴백 사다리
// (pickSpriteAttrs)로 emit 한다. 이 파일은 그 emit 결과를 검증한다(generate-hide-sprites.test.ts 형식).

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, charIdMap, outfitAttrFor } from '../src/renpy/generate';
import type { Character, Line } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

/** 기본 의상만 가진 캐릭터(표정은 '기본' 하나). */
function charWithSprite(name: string): Character {
  return { name, color: '#ffffff', expressions: { 기본: `${name}-base-neutral` } };
}

/** 기본 의상 + 추가 의상들(각 의상마다 표정 세트를 따로 준다). */
function charWithOutfits(
  name: string,
  base: Record<string, string>,
  outfits: { name: string; expressions: Record<string, string> }[],
): Character {
  return { name, color: '#ffffff', expressions: base, outfits };
}

/** script.rpy 에서 그 캐릭터의 show 문만(속성 없는 재배치 show 포함) 순서대로 뽑는다. */
function showsOf(script: string, id: string): string[] {
  return script
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(`show ${id} `) || l === `show ${id}`);
}

const O = outfitAttrFor; // '기본'→base, 그 외→o<슬러그>

describe('generateRenpyFiles: 장면 내 의상 전환(Line.outfits)', () => {
  it('① 같은 장면에서 동일 캐릭터가 2회 이상 갈아입는다(화자 줄에서 전환)', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [
      { name: '교복', expressions: { 기본: 'a-u' } },
      { name: '사복', expressions: { 기본: 'a-c' } },
    ]);
    const sc = scene({
      lines: [
        dialogue('A', '0'),
        dialogue('A', '1', { outfits: { A: '교복' } }),
        dialogue('A', '2', { outfits: { A: '사복' } }),
      ],
    });
    const project = projectWith([sc], { characters: [A] });
    const id = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');

    const shows = showsOf(s, id);
    expect(shows).toHaveLength(3); // 줄마다 화자 show 1회씩 — 전환 때문에 늘지 않는다
    expect(shows[0]).toContain(` ${O('기본')} `);
    expect(shows[1]).toContain(` ${O('교복')} `);
    expect(shows[2]).toContain(` ${O('사복')} `);
  });

  it('② 다른 화자의 줄에서도 서 있는 캐릭터의 의상이 바뀐다(비화자 동기화 show 1회)', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [{ name: '교복', expressions: { 기본: 'a-u' } }]);
    const B = charWithSprite('B');
    const sc = scene({
      lines: [dialogue('A', '0'), dialogue('B', '1'), dialogue('B', '2', { outfits: { A: '교복' } })],
    });
    const project = projectWith([sc], { characters: [A, B] });
    const ids = charIdMap(project);
    const aId = ids.get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    const lines = s.split('\n').map((l) => l.trim());

    // A 의 마지막 show 는 교복이고, B 가 말하는 그 줄 **앞**에서 나간다(전환이 대사보다 먼저 보여야 한다).
    const aShows = showsOf(s, aId);
    expect(aShows[aShows.length - 1]).toContain(` ${O('교복')} `);
    const syncIdx = lines.findIndex((l) => l.startsWith(`show ${aId} ${O('교복')} `));
    const sayIdx = lines.findIndex((l) => l.endsWith('"2"'));
    expect(syncIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeLessThan(sayIdx);
  });

  it('③ 지문(narration) 줄에서도 전환된다', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [{ name: '사복', expressions: { 기본: 'a-c' } }]);
    const sc = scene({
      lines: [
        dialogue('A', '0'),
        { kind: 'narration', text: '퇴근 시간.', outfits: { A: '사복' } } as Line,
        dialogue('A', '2'),
      ],
    });
    const project = projectWith([sc], { characters: [A] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    const lines = s.split('\n').map((l) => l.trim());

    const syncIdx = lines.findIndex((l) => l.startsWith(`show ${aId} ${O('사복')} `));
    const narrIdx = lines.findIndex((l) => l === '"퇴근 시간."');
    expect(syncIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeLessThan(narrIdx); // 지문이 나오기 전에 이미 갈아입은 상태
  });

  it('④ 숨김 중에 바뀐 의상은 다시 표시될 때 "숨기기 직전"이 아니라 최신 의상으로 복원된다', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [
      { name: '교복', expressions: { 기본: 'a-u' } },
      { name: '카페복', expressions: { 기본: 'a-cafe' } },
    ]);
    const sc = scene({
      lines: [
        dialogue('A', '0', { outfits: { A: '교복' } }),
        { kind: 'narration', text: '숨김', hideSprites: true } as Line,
        { kind: 'narration', text: '숨김 중 환복', outfits: { A: '카페복' } } as Line,
        { kind: 'narration', text: '다시 표시', hideSprites: false } as Line,
      ],
    });
    const project = projectWith([sc], { characters: [A] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');

    const lastHideIdx = s.lastIndexOf('hide ');
    const restore = s.slice(lastHideIdx).match(new RegExp(`show ${aId} (\\S+) (\\S+) at vn_char`));
    expect(restore).not.toBeNull();
    expect(restore![1]).toBe(O('카페복')); // 교복(숨기기 직전)이 아니라 카페복
    // 숨김 구간에서는 hide 말고 아무 show 도 나가지 않는다(② 동기화가 숨김 중엔 침묵).
    const hiddenSpan = s.slice(s.indexOf('hide '), lastHideIdx + 1);
    expect(hiddenSpan.includes(`show ${aId}`)).toBe(false);
  });

  it('⑤ 전환과 화자 등장이 같은 줄이면 show 가 늘지 않는다(중복 발행 없음)', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [{ name: '교복', expressions: { 기본: 'a-u' } }]);
    const lines: Line[] = [dialogue('A', '0'), dialogue('A', '1')];
    const withTransition: Line[] = [dialogue('A', '0'), dialogue('A', '1', { outfits: { A: '교복' } })];
    const idOf = (ls: Line[]) => {
      const project = projectWith([scene({ lines: ls })], { characters: [A] });
      return showsOf(contentOf(generateRenpyFiles(project).files, 'game/script.rpy'), charIdMap(project).get('A')!);
    };
    expect(idOf(withTransition)).toHaveLength(idOf(lines).length); // 개수 동일, 속성만 다름
    expect(idOf(withTransition)[1]).toContain(` ${O('교복')} `);
  });

  it('⑥ 아직 등장하지 않은 캐릭터의 의상을 먼저 바꿔두면, 최초 등장부터 그 의상으로 선다', () => {
    const A = charWithSprite('A');
    const B = charWithOutfits('B', { 기본: 'b-b' }, [{ name: '교복', expressions: { 기본: 'b-u' } }]);
    const sc = scene({
      lines: [dialogue('A', '0', { outfits: { B: '교복' } }), dialogue('B', '1')],
    });
    const project = projectWith([sc], { characters: [A, B] });
    const bId = charIdMap(project).get('B')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');

    const bShows = showsOf(s, bId);
    expect(bShows).toHaveLength(1); // 등장 전엔 아무것도 안 낸다(유령 show 없음)
    expect(bShows[0]).toContain(` ${O('교복')} `);
  });

  it('⑦ 같은 의상을 다시 지정해도 show 가 다시 나가지 않는다(wanted 재발행 판정)', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [{ name: '교복', expressions: { 기본: 'a-u' } }]);
    const B = charWithSprite('B');
    const sc = scene({
      lines: [
        dialogue('A', '0', { outfits: { A: '교복' } }),
        dialogue('B', '1', { outfits: { A: '교복' } }), // 같은 값 재지정 — 아무것도 안 나가야 한다
        dialogue('B', '2'),
      ],
    });
    const project = projectWith([sc], { characters: [A, B] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    // A 의 속성 있는 show 는 첫 줄 1회뿐(B 등장에 따른 속성 없는 재배치 show 는 별개로 허용).
    expect(showsOf(s, aId).filter((l) => l.includes(` ${O('교복')} `))).toHaveLength(1);
  });

  it('⑧ 줄 의상을 안 쓰면 출력이 장면 단위 의상과 완전히 동일하다(회귀 0)', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, [{ name: '교복', expressions: { 기본: 'a-u' } }]);
    const lines: Line[] = [dialogue('A', '0'), dialogue('A', '1')];
    const sceneLevel = projectWith([scene({ lines, outfits: { A: '교복' } })], { characters: [A] });
    const lineLevel = projectWith(
      [scene({ lines: [dialogue('A', '0', { outfits: { A: '교복' } }), dialogue('A', '1')] })],
      { characters: [A] },
    );
    const a = contentOf(generateRenpyFiles(sceneLevel).files, 'game/script.rpy');
    const b = contentOf(generateRenpyFiles(lineLevel).files, 'game/script.rpy');
    expect(b).toBe(a); // 첫 줄부터 교복이면 두 방식의 출력이 바이트 단위로 같다
  });
});

describe('generateRenpyFiles: 의상 전환 시 스프라이트 폴백(pickSpriteAttrs — 기존 사다리 그대로)', () => {
  it('⑮a 요청 의상 pool 은 있는데 그 표정만 없으면, **그 의상 안에서** neutral → pool[0] 로 내려간다', () => {
    // 교복 의상엔 '화남'이 없고 '기본'(=neutral)이 있다 → 의상은 교복 유지, 표정만 neutral.
    const A = charWithOutfits('A', { 기본: 'a-b', 화남: 'a-angry' }, [
      { name: '교복', expressions: { 기본: 'a-u-neutral' } },
    ]);
    const sc = scene({
      lines: [dialogue('A', '0', { emotion: '화남', outfits: { A: '교복' } })],
    });
    const project = projectWith([sc], { characters: [A] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    expect(showsOf(s, aId)[0]).toContain(`show ${aId} ${O('교복')} neutral `); // 의상은 교복 그대로
  });

  it('⑮a-2 neutral 도 없으면 그 의상 pool 의 첫 표정으로 내려간다(기본 의상으로 새지 않는다)', () => {
    const A = charWithOutfits('A', { 기본: 'a-b', 화남: 'a-angry' }, [
      { name: '교복', expressions: { 슬픔: 'a-u-sad' } }, // neutral 도 화남도 없음
    ]);
    const sc = scene({ lines: [dialogue('A', '0', { emotion: '화남', outfits: { A: '교복' } })] });
    const project = projectWith([sc], { characters: [A] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    expect(showsOf(s, aId)[0]).toContain(`show ${aId} ${O('교복')} sad `);
  });

  it('⑮b 요청 의상 pool 자체가 없을 때만 기본 의상 pool 로 폴백하고, 표정은 그 pool 안에서 판정된다', () => {
    // '수영복' 의상엔 스프라이트가 하나도 없다 → 기본 의상(base) pool 로 폴백, 표정은 요청대로 화남.
    const A = charWithOutfits('A', { 기본: 'a-b', 화남: 'a-angry' }, [
      { name: '교복', expressions: { 기본: 'a-u' } },
    ]);
    const sc = scene({ lines: [dialogue('A', '0', { emotion: '화남', outfits: { A: '수영복' } })] });
    const project = projectWith([sc], { characters: [A] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    expect(showsOf(s, aId)[0]).toContain(`show ${aId} ${O('기본')} angry `);
  });

  it('⑮c 폴백으로 실제 의상이 안 바뀌어도 같은 요청이 반복되면 show 는 한 번만 나간다', () => {
    const A = charWithOutfits('A', { 기본: 'a-b' }, []); // 추가 의상 없음 — 무엇을 요청해도 base
    const B = charWithSprite('B');
    const sc = scene({
      lines: [
        dialogue('A', '0'),
        dialogue('B', '1', { outfits: { A: '수영복' } }), // base 로 폴백되지만 wanted 는 '수영복'
        dialogue('B', '2', { outfits: { A: '수영복' } }), // 같은 요청 — 재발행 없음
      ],
    });
    const project = projectWith([sc], { characters: [A, B] });
    const aId = charIdMap(project).get('A')!;
    const s = contentOf(generateRenpyFiles(project).files, 'game/script.rpy');
    expect(showsOf(s, aId).filter((l) => l.includes(` ${O('기본')} `))).toHaveLength(2); // 최초 등장 + 폴백 전환 1회뿐
  });
});
