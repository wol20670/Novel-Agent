// 미리보기 ↔ Ren'Py 출력의 **스프라이트 표시 parity**(Phase 9).
//
// ⚠️ 이 파일의 의미는 Phase 9 에서 **뒤집혔다**. 예전엔 "두 경로의 폴백이 서로 다르다"는 divergence 를
// 기록하는 파일이었고, 그 머리주석이 *"후속 Phase 가 두 폴백을 통합하기로 하면 이 테스트를 함께 바꾸는
// 것이 정상"* 이라고 적어두었다. 그 후속 Phase 가 이것이다.
//
// 예전 divergence(둘 다 production 코드였다):
//   · 미리보기 = spriteAssetId — 그 의상에 그 표정이 없으면 **기본 의상의 같은 표정**(옷을 버림)
//   · 출력     = pickSpriteAttrs — 그 의상을 지키고 **표정만** neutral/pool[0] 로 강등(표정을 버림)
// 게임이 정본이므로(줄의 canonical 의상은 outfitFlags 가 정한다) **미리보기를 출력에 맞췄다.**
//
// 이 파일이 고정하는 두 축:
//   1. 폴백 사다리(Step A: 의상 pool 선택 / Step B: 속성 선택)   → T1~T5, T12·T13
//   2. **줄 사이 상태 carry** — 생성기는 lastShown.attr(실제 표시된 속성)을 나르고 화자 줄에서만
//      논리 표정을 다시 계산한다. 미리보기도 같아야 한다.                → T6~T10
//
// 검증 방식(반-tautology): 기대값을 미리보기 함수로 만들지 않는다. **실제 generateRenpyFiles 출력의
// show/hide 줄을 파싱**해 그 줄 시점의 표시 상태를 복원하고, 미리보기 결과와 대조한다. 핵심 케이스는
// Export literal · Preview literal · parity 를 **셋 다** 검사한다(양쪽이 동시에 잘못 바뀌어도 통과하지
// 않게).

import { describe, it, expect } from 'vitest';
import {
  generateRenpyFiles,
  charIdMap,
  outfitAttrFor,
  attrFor,
  selectSprite,
  type SpriteSlot,
} from '../src/renpy/generate';
import { computeSpriteDisplay } from '../src/components/ScenePlayer';
import type { Character, Project, Scene } from '../src/types';
import { contentOf, dialogue, projectWith, scene } from './fixtures';

// ── fixture 헬퍼 ─────────────────────────────────────────────────────────────
// ⚠️ 모든 fixture 의 공통 전제(이걸 어기면 테스트가 다른 것을 재게 된다):
//   · optedIn === true : 기본 의상에 업로드된 스프라이트가 **최소 1개**. false 면 생성기가 캐릭터를
//     통째로 건너뛰어(D3) 비교할 show 자체가 없다 — 그건 T17 이 따로 본다.
//   · status: 'approved' : 생성기는 승인 장면만 내보내고 expressionPlan 도 승인 장면만 본다.
//   · CG 없음 : cgActive 는 세 전이를 전부 막는다(T16 이 따로 본다).
//   · assetId 는 (의상, 표정)마다 **고유 문자열** — 아래 outfitOfAsset 이 되짚을 수 있어야 한다.

/** 지문 한 줄. 텍스트가 곧 줄 마커(L{index})다. */
function narration(text: string, extra?: Record<string, unknown>): Scene['lines'][number] {
  return { kind: 'narration', text, ...extra } as Scene['lines'][number];
}

function heroine(patch: Partial<Character> = {}): Character {
  return { name: '민주', color: '#f88', expressions: {}, ...patch };
}

/** assetId → 그 그림이 속한 논리 의상. 추가 의상 칸은 항상 assetId 를 갖고, 없으면 기본 의상 칸이다. */
function outfitOfAsset(c: Character, assetId: string | undefined): string {
  if (assetId === undefined) return '기본'; // 플레이스홀더 슬롯은 기본 의상에서만 생긴다
  if (Object.values(c.expressions).some((id) => id === assetId)) return '기본';
  for (const o of c.outfits ?? []) {
    if (Object.values(o.expressions).some((id) => id === assetId)) return o.name;
  }
  throw new Error(`outfitOfAsset: 어느 의상에도 없는 assetId — ${assetId}`);
}

/** 미리보기가 그 줄에 실제로 그리는 것 → (outfitAttr, attr) 로 환산(출력과 같은 축으로 비교하려고). */
function previewAt(project: Project, sc: Scene, line: number, charName: string) {
  const d = computeSpriteDisplay(project, sc, line).get(charName);
  if (!d) return null; // 안 그림(숨김·CG·미등장)
  const c = project.characters.find((x) => x.name === charName)!;
  return { outfitAttr: outfitAttrFor(outfitOfAsset(c, d.assetId)), attr: attrFor(d.expr), assetId: d.assetId };
}

/**
 * 실제 생성된 script.rpy 를 위에서 아래로 읽어 **그 줄 시점의 표시 상태**를 복원한다.
 * show 로 상태를 갱신하고 hide 로 비우며, 각 대사·지문(고유 텍스트 `L{index}`)을 만나는 순간을 스냅샷.
 * 속성 없는 재배치 `show <id> at vn_char(..)` 는 토큰 수가 달라 정규식에 안 걸린다(상태 불변 — 생성기와 동일).
 */
function exportAt(
  project: Project,
  charName: string,
  tag = 'L',
): Map<number, { outfitAttr: string; attr: string } | null> {
  const { files } = generateRenpyFiles(project);
  const script = contentOf(files, 'game/script.rpy');
  const id = charIdMap(project).get(charName)!;
  const showRe = new RegExp(`^\\s+show ${id} (\\S+) (\\S+) at vn_char`);
  const hideRe = new RegExp(`^\\s+hide ${id}\\s*$`);
  const sayRe = new RegExp(`"${tag}(\\d+)"`);
  const out = new Map<number, { outfitAttr: string; attr: string } | null>();
  let state: { outfitAttr: string; attr: string } | null = null;
  for (const ln of script.split('\n')) {
    const sh = showRe.exec(ln);
    if (sh) {
      state = { outfitAttr: sh[1], attr: sh[2] };
      continue;
    }
    if (hideRe.test(ln)) {
      state = null;
      continue;
    }
    const say = sayRe.exec(ln);
    if (say) out.set(Number(say[1]), state);
  }
  return out;
}

/** 핵심 케이스용 — Export literal · Preview literal · parity 를 한 번에. */
function expectBoth(
  project: Project,
  sc: Scene,
  line: number,
  charName: string,
  want: { outfitAttr: string; attr: string },
  tag = 'L',
) {
  const exp = exportAt(project, charName, tag).get(line);
  const prev = previewAt(project, sc, line, charName);
  expect(exp, 'Export 가 그 줄에서 세운 스프라이트').toEqual(want); // ① Export literal
  expect(prev && { outfitAttr: prev.outfitAttr, attr: prev.attr }, '미리보기').toEqual(want); // ② Preview literal
  expect(prev && { outfitAttr: prev.outfitAttr, attr: prev.attr }).toEqual(exp); // ③ parity
}

// ── T1~T5 : 폴백 사다리(Step A/B) ────────────────────────────────────────────

describe('T1~T5 — 폴백 사다리: 의상 pool 선택 → 속성 선택', () => {
  it('T1(N1) 그 의상에 그 표정이 있으면 둘 다 그대로 쓴다', () => {
    const c = heroine({
      expressions: { 기본: 'b-base' },
      outfits: [{ name: '교복', expressions: { 기본: 'u-base', 기쁨: 'u-joy' } }],
    });
    const sc = scene({ outfits: { 민주: '교복' }, lines: [dialogue('민주', 'L0', { emotion: '기쁨' })] });
    const p = projectWith([sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('교복'), attr: 'happy' });
    expect(previewAt(p, sc, 0, '민주')!.assetId).toBe('u-joy');
  });

  it('T2(N2) 그 의상에 그 표정이 없고 기본 표정이 있으면 — 의상 유지 + neutral 로 강등', () => {
    const c = heroine({
      expressions: { 기본: 'b-base', 기쁨: 'b-joy' },
      outfits: [{ name: '사복', expressions: { 기본: 's-base' } }],
    });
    const sc = scene({ outfits: { 민주: '사복' }, lines: [dialogue('민주', 'L0', { emotion: '기쁨' })] });
    const p = projectWith([sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('사복'), attr: 'neutral' });
    // Phase 9 이전 미리보기는 여기서 "기본 의상의 기쁨"(b-joy)을 그렸다 — 그게 divergence 였다.
    expect(previewAt(p, sc, 0, '민주')!.assetId).toBe('s-base');
  });

  it('T3(N3) 그 의상에 그 표정도 기본 표정도 없으면 — pool 의 첫 칸으로', () => {
    const c = heroine({
      expressions: { 슬픔: 'b-sad' }, // optedIn=true, 기본 asset 은 없다
      outfits: [{ name: '사복', expressions: { 기쁨: 's-joy' } }], // 기본 없음
    });
    const sc = scene({ outfits: { 민주: '사복' }, lines: [dialogue('민주', 'L0', { emotion: '기본' })] });
    const p = projectWith([sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('사복'), attr: 'happy' });
    expect(previewAt(p, sc, 0, '민주')!.assetId).toBe('s-joy');
  });

  it('T4(N4) 그 의상에 칸이 하나도 없으면 기본 의상 pool 로 내려간다', () => {
    const c = heroine({
      expressions: { 기본: 'b-base', 기쁨: 'b-joy' },
      outfits: [{ name: '체육복', expressions: {} }], // 업로드 0개 → 칸 없음
    });
    const sc = scene({ outfits: { 민주: '체육복' }, lines: [dialogue('민주', 'L0', { emotion: '기쁨' })] });
    const p = projectWith([sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: 'base', attr: 'happy' });
    expect(previewAt(p, sc, 0, '민주')!.assetId).toBe('b-joy');
  });

  it('T5 기본 의상 칸은 "대본에 쓰인 표정"으로도 생긴다 — 업로드가 없으면 플레이스홀더', () => {
    const c = heroine({ expressions: { 슬픔: 'b-sad' } }); // 기쁨 asset 은 어디에도 없다
    const sc = scene({ lines: [dialogue('민주', 'L0', { emotion: '기쁨' })] });
    const p = projectWith([sc], { characters: [c] });
    // 대본이 쓴 표정이라 expressionPlan 이 기본 의상에 칸을 만든다(그림은 빌더가 Canvas 로 채움).
    expectBoth(p, sc, 0, '민주', { outfitAttr: 'base', attr: 'happy' });
    expect(previewAt(p, sc, 0, '민주')!.assetId).toBeUndefined(); // 플레이스홀더
  });
});

// ── T6~T10 : 줄 사이 상태 carry ──────────────────────────────────────────────

/** A 에는 기본만, B 에는 기본·기쁨 둘 다 — "강등된 뒤 갈아입기"를 만드는 최소 배치. */
function carryChar(): Character {
  return heroine({
    expressions: { 기본: 'b-base', 기쁨: 'b-joy' },
    outfits: [
      { name: 'A', expressions: { 기본: 'a-base' } }, // 기쁨 없음 → 강등이 일어난다
      { name: 'B', expressions: { 기본: 'bb-base', 기쁨: 'bb-joy' } },
    ],
  });
}

describe('T6~T10 — 강등된 "실제 표시 속성"이 다음 줄로 이어진다', () => {
  it('T6 강등 후 비화자 줄에서 의상이 바뀌어도 논리 표정으로 되돌아가지 않는다', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [dialogue('민주', 'L0', { emotion: '기쁨' }), narration('L1', { outfits: { 민주: 'B' } })],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('A'), attr: 'neutral' }); // 강등
    // B 에는 '기쁨' 그림이 있지만, 이어받는 값은 논리 표정이 아니라 **강등된 neutral** 이다.
    expectBoth(p, sc, 1, '민주', { outfitAttr: outfitAttrFor('B'), attr: 'neutral' });
    expect(previewAt(p, sc, 1, '민주')!.assetId).toBe('bb-base');
    expect(previewAt(p, sc, 1, '민주')!.assetId).not.toBe('bb-joy'); // stateless 구현이 내는 값
  });

  it('T7 숨겼다가 다시 보일 때도 강등된 속성을 이어받는다(의상만 현재 값으로)', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [
        dialogue('민주', 'L0', { emotion: '기쁨' }),
        narration('L1', { hideSprites: true }),
        narration('L2', { outfits: { 민주: 'B' } }), // 숨어 있는 동안 갈아입음
        narration('L3', { hideSprites: false }),
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    expect(previewAt(p, sc, 1, '민주'), '숨김 줄엔 아무도 안 그린다').toBeNull();
    expect(exportAt(p, '민주').get(1), '출력도 hide 상태').toBeNull();
    expectBoth(p, sc, 3, '민주', { outfitAttr: outfitAttrFor('B'), attr: 'neutral' });
  });

  it('T8 (경계) 같은 배치라도 그 줄의 화자가 되면 논리 표정을 다시 계산한다', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [
        dialogue('민주', 'L0', { emotion: '기쁨' }),
        dialogue('민주', 'L1', { emotion: '기쁨', outfits: { 민주: 'B' } }), // 이번엔 화자
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    expectBoth(p, sc, 1, '민주', { outfitAttr: outfitAttrFor('B'), attr: 'happy' }); // carry 아님
    expect(previewAt(p, sc, 1, '민주')!.assetId).toBe('bb-joy');
  });

  it('T9 강등은 누적된다 — 이어받은 속성이 다음 의상에서 또 강등된다', () => {
    const c = heroine({
      expressions: { 기본: 'b-base', 기쁨: 'b-joy' },
      outfits: [
        { name: 'A', expressions: { 기본: 'a-base' } },
        { name: 'B', expressions: { 놀람: 'bb-sur' } }, // 기본도 기쁨도 없다
      ],
    });
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [dialogue('민주', 'L0', { emotion: '기쁨' }), narration('L1', { outfits: { 민주: 'B' } })],
    });
    const p = projectWith([sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('A'), attr: 'neutral' });
    expectBoth(p, sc, 1, '민주', { outfitAttr: outfitAttrFor('B'), attr: 'surprised' }); // pool[0]
  });

  it('T10 강등이 없으면 논리 표정이 그대로 유지된다(과잉 교정 방지)', () => {
    const c = heroine({
      expressions: { 기본: 'b-base', 기쁨: 'b-joy' },
      outfits: [
        { name: 'A', expressions: { 기본: 'a-base', 기쁨: 'a-joy' } },
        { name: 'B', expressions: { 기본: 'bb-base', 기쁨: 'bb-joy' } },
      ],
    });
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [dialogue('민주', 'L0', { emotion: '기쁨' }), narration('L1', { outfits: { 민주: 'B' } })],
    });
    const p = projectWith([sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('A'), attr: 'happy' });
    expectBoth(p, sc, 1, '민주', { outfitAttr: outfitAttrFor('B'), attr: 'happy' });
  });
});

// ── T11 : 실제 출력과 줄 단위 교차 검증 ─────────────────────────────────────

describe('T11 — 실제 generateRenpyFiles 출력과 줄 단위로 대조', () => {
  it('전환·숨김·복원이 섞인 장면에서 모든 줄이 일치한다', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [
        dialogue('민주', 'L0', { emotion: '기쁨' }), // A/neutral (강등)
        narration('L1'), // 변화 없음
        narration('L2', { outfits: { 민주: 'B' } }), // B/neutral (carry)
        dialogue('민주', 'L3', { emotion: '기쁨' }), // B/happy (화자 재계산)
        narration('L4', { hideSprites: true }), // 숨김
        narration('L5', { outfits: { 민주: 'A' } }), // 숨은 채 갈아입음
        narration('L6', { hideSprites: false }), // A/neutral 로 복원(happy 는 A 에 없다)
        dialogue('민주', 'L7', { emotion: '기본' }), // A/neutral
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    const exp = exportAt(p, '민주');
    for (let k = 0; k < sc.lines.length; k++) {
      const prev = previewAt(p, sc, k, '민주');
      const e = exp.get(k) ?? null;
      expect(prev && { outfitAttr: prev.outfitAttr, attr: prev.attr }, `줄 ${k}`).toEqual(e);
    }
    // 흐름 자체가 의도한 모양인지도 못박는다(파서가 전부 null 을 돌려주는 식으로 통과하지 않게).
    expect(exp.get(0)).toEqual({ outfitAttr: outfitAttrFor('A'), attr: 'neutral' });
    expect(exp.get(3)).toEqual({ outfitAttr: outfitAttrFor('B'), attr: 'happy' });
    expect(exp.get(4)).toBeNull();
    expect(exp.get(6)).toEqual({ outfitAttr: outfitAttrFor('A'), attr: 'neutral' });
  });
});

// ── T12~T13 : 기본 의상 pool 재진입 ─────────────────────────────────────────
// 이어받은 속성이 **기본 의상 칸에도 없을 수 있다**(대본 논리 표정이 아니라 pool[0] 폴백에서 나온
// 값이면 expressionPlan 에 없다). 그때 base/그대로 가 아니라 다시 사다리를 타야 한다.

/** 이어받는 속성이 'happy' 인데 기본 의상엔 그 칸이 없는 배치(기쁨은 대본 논리 표정이 아니다). */
function reentryChar(): Character {
  return heroine({
    expressions: { 슬픔: 'b-sad' }, // optedIn=true. 기본·기쁨 asset 없음
    outfits: [
      { name: 'A', expressions: { 기쁨: 'a-joy' } }, // neutral 이 없어 pool[0]=기쁨 으로 강등된다
      { name: 'B', expressions: {} }, // 칸 0개
    ],
  });
}

describe('T12~T13 — 기본 의상 pool 로 되돌아갈 때도 다시 폴백한다', () => {
  it('T12 칸이 없는 의상으로 갈아입으면 base/neutral (이어받은 happy 칸이 base 에 없다)', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [dialogue('민주', 'L0', { emotion: '기본' }), narration('L1', { outfits: { 민주: 'B' } })],
    });
    const p = projectWith([sc], { characters: [reentryChar()] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('A'), attr: 'happy' }); // pool[0] 강등
    expectBoth(p, sc, 1, '민주', { outfitAttr: 'base', attr: 'neutral' }); // base/happy 가 아니다
    expect(previewAt(p, sc, 1, '민주')!.assetId, '기본 의상의 기본 표정은 업로드가 없다').toBeUndefined();
  });

  it('T13 기본 의상을 직접 요청해도 마찬가지다', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      lines: [dialogue('민주', 'L0', { emotion: '기본' }), narration('L1', { outfits: { 민주: '기본' } })],
    });
    const p = projectWith([sc], { characters: [reentryChar()] });
    expectBoth(p, sc, 1, '민주', { outfitAttr: 'base', attr: 'neutral' });
  });
});

// ── T14 : 속성 매핑과 "속성 존재" 기반 선택 ─────────────────────────────────

describe('T14 — 표정 속성 매핑과 폴백 판정 기준', () => {
  it('T14a 알려진 표정 6종의 매핑은 고정이고 서로 겹치지 않는다', () => {
    const known = { 기본: 'neutral', 기쁨: 'happy', 슬픔: 'sad', 화남: 'angry', 놀람: 'surprised', 수줍음: 'shy' };
    for (const [expr, attr] of Object.entries(known)) expect(attrFor(expr)).toBe(attr);
    expect(new Set(Object.values(known)).size).toBe(6);
  });

  it("T14b 'neutral' 은 '기본' 전용이다 — 커스텀 표정은 항상 'x' 접두사라 침범할 수 없다", () => {
    expect(attrFor('기본')).toBe('neutral');
    for (const custom of ['옅은 미소', '어색한 미소', 'smile', '?!', '  ', '아주아주긴표정이름입니다']) {
      expect(attrFor(custom).startsWith('x'), custom).toBe(true);
      expect(attrFor(custom)).not.toBe('neutral');
    }
    // 이 성질이 "기본 의상 pool 재진입은 항상 '기본' 에 착지한다"(T12·T13)의 근거다.
  });

  it('T14c 폴백 자격은 Expression identity 가 아니라 **속성 존재**로 정해진다', () => {
    // 커스텀 표정의 속성은 해시라 서로 다른 이름이 같은 속성을 가질 수 있다(D5, 이번 범위 밖).
    // 그래서 pool 에 "원하는 속성"을 가진 칸이 있으면, 그 칸의 표정 이름이 무엇이든 강등되지 않아야 한다.
    const slots: SpriteSlot[] = [
      { expr: '기본', attr: 'neutral', outfit: '기본', outfitAttr: 'base', assetId: 'b1' },
      { expr: '표정하나', attr: 'xCOLLIDE', outfit: '교복', outfitAttr: 'o1', assetId: 'u1' },
      { expr: '기본', attr: 'neutral', outfit: '교복', outfitAttr: 'o1', assetId: 'u2' },
    ];
    // '표정둘'(다른 이름)이 같은 속성으로 해시됐다고 보고 그 속성을 요청한다.
    expect(selectSprite(slots, '교복', 'xCOLLIDE').attr).toBe('xCOLLIDE'); // neutral 로 강등되지 않는다
    expect(selectSprite(slots, '교복', 'xCOLLIDE').outfit).toBe('교복');
    // ⚠️ 어느 칸의 assetId 가 이겼는지는 **여기서 규정하지 않는다**(D5 — Ren'Py 중복 image 정의의
    // 승자를 이번 Phase 가 새로 정하지 않는다).
    expect(selectSprite(slots, '교복', 'xNOPE').attr).toBe('neutral'); // 없는 속성이면 정상 강등
  });
});

// ── T15 : 기본 의상 칸의 입력(대본 논리 표정 집합) ──────────────────────────

describe('T15 — 기본 의상 칸을 만드는 "대본에 쓰인 표정" 집합', () => {
  it('T15a·T15b 합동 대사는 멤버 각각의 칸을 만든다', () => {
    // 지수·민주 둘 다 base 에 '기쁨' 그림이 없지만, 합동 대사의 논리 표정이 '기쁨'이라 칸이 생긴다.
    const minju = heroine({ expressions: { 슬픔: 'm-sad' }, outfits: [{ name: 'B', expressions: {} }] });
    const jisu: Character = { name: '지수', color: '#8cf', expressions: { 슬픔: 'j-sad' } };
    const sc = scene({
      outfits: { 민주: 'B' }, // 칸 0개 → 기본 의상 pool 로 내려간다
      lines: [dialogue('지수 & 민주', 'L0', { members: ['지수', '민주'], emotion: '기쁨' })],
    });
    const p = projectWith([sc], { characters: [jisu, minju] });
    // 두 멤버 모두 base/happy(플레이스홀더). 합성 라벨이 아니라 멤버 각각이 대상이다.
    expectBoth(p, sc, 0, '민주', { outfitAttr: 'base', attr: 'happy' });
    expectBoth(p, sc, 0, '지수', { outfitAttr: 'base', attr: 'happy' });
    expect(previewAt(p, sc, 0, '민주')!.assetId).toBeUndefined();
  });

  it('T15c 다른 승인 장면에서 쓰인 표정도 칸을 만든다(프로젝트 전체를 본다)', () => {
    // 민주: base 엔 '슬픔'만, A 의상엔 '놀람'만, B 의상은 칸 0개.
    const c = heroine({
      expressions: { 슬픔: 'b-sad' },
      outfits: [{ name: 'A', expressions: { 놀람: 'a-sur' } }, { name: 'B', expressions: {} }],
    });
    // 앞 장면(승인)에서만 '놀람'이 논리 표정으로 쓰인다 → 기본 의상에 '놀람' 칸이 생긴다.
    const other = scene({ id: 's0', title: '앞 장면', lines: [dialogue('민주', 'A0', { emotion: '놀람' })] });
    const sc = scene({
      id: 's1',
      outfits: { 민주: 'A' },
      lines: [
        dialogue('민주', 'L0', { emotion: '기본' }), // A 엔 기본이 없다 → pool[0]='놀람' 으로 강등
        narration('L1', { outfits: { 민주: 'B' } }), // 칸 0개 → 기본 의상 pool 로 재진입
      ],
    });
    const p = projectWith([other, sc], { characters: [c] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('A'), attr: 'surprised' });
    // 이어받은 'surprised' 칸이 기본 의상에 있는 이유는 **앞 장면(s0)** 뿐이다. 현재 장면만 봤다면
    // 그 칸이 없어 neutral 로 강등됐을 것이다 — 즉 이 한 줄이 "프로젝트 전체를 본다"를 고정한다.
    expectBoth(p, sc, 1, '민주', { outfitAttr: 'base', attr: 'surprised' });
    expect(previewAt(p, sc, 1, '민주')!.assetId, '업로드가 없으니 플레이스홀더 칸').toBeUndefined();
  });

  it('T15d 미승인 장면은 넣지 않는다 — 단 지금 보고 있는 장면 하나는 예외', () => {
    // T15c 와 같은 배치인데 앞 장면이 **미승인**이다. 생성기는 미승인 장면을 아예 안 보므로
    // '놀람' 칸이 생기지 않고, 미리보기도 같아야 한다(= 다른 초안 장면을 끌어오면 안 된다).
    const c = heroine({
      expressions: { 슬픔: 'b-sad' },
      outfits: [{ name: 'A', expressions: { 놀람: 'a-sur' } }, { name: 'B', expressions: {} }],
    });
    const draft = scene({ id: 's0', title: '초안', status: 'review', lines: [dialogue('민주', 'A0', { emotion: '놀람' })] });
    const sc = scene({
      id: 's1',
      outfits: { 민주: 'A' },
      lines: [dialogue('민주', 'L0', { emotion: '기본' }), narration('L1', { outfits: { 민주: 'B' } })],
    });
    const p = projectWith([draft, sc], { characters: [c] });

    // 승인 장면(s1)을 보는 동안 초안 s0 의 '놀람'은 칸을 만들지 않는다 → 기본 의상에서 neutral 로 강등.
    expectBoth(p, sc, 1, '민주', { outfitAttr: 'base', attr: 'neutral' });
    expect(exportAt(p, '민주', 'A').has(0), '초안 장면은 출력에 없다').toBe(false);

    // 반대로 그 초안 장면 **자체**를 미리보기 하면 "승인하면 생길 칸"을 보여준다(비교할 출력이 없다).
    expect(previewAt(p, draft, 0, '민주')).toEqual({
      outfitAttr: 'base',
      attr: 'surprised',
      assetId: undefined,
    });
  });

  it('T15e 등록되지 않은 화자 이름은 칸 계산에 끼어들지 않는다', () => {
    const c = heroine({ expressions: { 슬픔: 'b-sad' } });
    const withGhost = scene({
      lines: [dialogue('엑스트라', 'L0', { emotion: '놀람' }), dialogue('민주', 'L1', { emotion: '기본' })],
    });
    const p = projectWith([withGhost], { characters: [c] });
    expectBoth(p, withGhost, 1, '민주', { outfitAttr: 'base', attr: 'neutral' });
  });
});

// ── T16 : CG 구간 ───────────────────────────────────────────────────────────

describe('T16 — CG 가 켜지면 양쪽 다 스프라이트를 그만 그린다', () => {
  it('T16a CG 이후로는 미리보기도 출력도 스프라이트가 없다(그 사이 표정·의상이 바뀌어도)', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      cg: ['둘이 마주보는 장면'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기쁨' }), // A/neutral 로 강등
        { kind: 'cg', desc: '둘이 마주보는 장면' } as Scene['lines'][number],
        dialogue('민주', 'L2', { emotion: '기쁨', outfits: { 민주: 'B' } }), // CG 중 변화
        dialogue('민주', 'L3', { emotion: '기본' }),
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    expectBoth(p, sc, 0, '민주', { outfitAttr: outfitAttrFor('A'), attr: 'neutral' });
    const exp = exportAt(p, '민주');
    for (const k of [2, 3]) {
      expect(previewAt(p, sc, k, '민주'), `CG 중 줄 ${k} 는 미리보기에 없다`).toBeNull();
      expect(exp.get(k), `CG 중 줄 ${k} 는 출력에도 새 show 가 없다`).toEqual(exp.get(0));
    }
    // CG 시작 뒤로는 show 가 아예 안 나간다(스프라이트는 scene 문이 지웠다).
    const script = contentOf(generateRenpyFiles(p).files, 'game/script.rpy');
    const afterCg = script.slice(script.indexOf('_scene with dissolve'));
    expect(afterCg).not.toContain('show c_1 ');
  });

  it('T16b CG 활성 4갈래에서 미리보기와 출력의 "그리는 구간"이 같다', () => {
    const mk = (cg: string[], lines: Scene['lines']) => {
      const sc = scene({ cg, lines });
      return { sc, p: projectWith([sc], { characters: [carryChar()] }) };
    };
    const dlg = (t: string) => dialogue('민주', t, { emotion: '기본' });

    // ① CG 자체가 없음 → 끝까지 그린다
    const a = mk([], [dlg('L0'), dlg('L1')]);
    expect(previewAt(a.p, a.sc, 1, '민주')).not.toBeNull();

    // ② cg 는 있는데 마커가 하나도 없음 → 장면 시작부터 비활성(레거시 폴백)
    const b = mk(['CG설명'], [dlg('L0'), dlg('L1')]);
    expect(previewAt(b.p, b.sc, 0, '민주')).toBeNull();
    expect(exportAt(b.p, '민주').get(0)).toBeNull();

    // ③ 매칭되는 마커 → 그 지점부터
    const c = mk(['CG설명'], [dlg('L0'), { kind: 'cg', desc: 'CG설명' } as Scene['lines'][number], dlg('L2')]);
    expect(previewAt(c.p, c.sc, 0, '민주')).not.toBeNull();
    expect(previewAt(c.p, c.sc, 2, '민주')).toBeNull();

    // ④ 마커가 전부 orphan → 끝까지 안 켜진다
    const d = mk(['CG설명'], [dlg('L0'), { kind: 'cg', desc: '없는설명' } as Scene['lines'][number], dlg('L2')]);
    expect(previewAt(d.p, d.sc, 2, '민주')).not.toBeNull();
    expect(exportAt(d.p, '민주').get(2)).not.toBeNull();
  });
});

// ── T17 : 기본 의상 그림이 하나도 없는 캐릭터(Phase 9 범위 밖 영역의 동작 보존) ──
// 생성기는 이런 캐릭터를 통째로 건너뛴다(게임에 안 나온다). parity 대상이 아니므로, Phase 9 는
// **미리보기의 기존 동작을 그대로 둔다** — 새 폴백을 적용하면 목적 밖의 화면 변경이 된다.

describe('T17 — optedIn=false 캐릭터의 미리보기는 예전 그대로다', () => {
  const noBase = (): Character =>
    heroine({ expressions: {}, outfits: [{ name: 'A', expressions: { 기쁨: 'a-joy' } }] });

  it('T17a 요청한 표정이 추가 의상에 없으면 예전처럼 플레이스홀더(추가 의상 그림으로 대체하지 않는다)', () => {
    const sc = scene({ outfits: { 민주: 'A' }, lines: [dialogue('민주', 'L0', { emotion: '기본' })] });
    const p = projectWith([sc], { characters: [noBase()] });
    const d = computeSpriteDisplay(p, sc, 0).get('민주');
    expect(d).toEqual({ expr: '기본', assetId: undefined }); // 새 폴백이면 a-joy 가 나왔을 자리
    // 대사는 나가지만 스프라이트는 한 번도 안 선다(show 가 없어 상태가 계속 null).
    expect(exportAt(p, '민주').get(0), '게임엔 스프라이트가 아예 안 나온다').toBeNull();
  });

  it('T17b 요청한 표정이 추가 의상에 있으면 예전처럼 그 그림을 쓴다', () => {
    const sc = scene({ outfits: { 민주: 'A' }, lines: [dialogue('민주', 'L0', { emotion: '기쁨' })] });
    const p = projectWith([sc], { characters: [noBase()] });
    expect(computeSpriteDisplay(p, sc, 0).get('민주')).toEqual({ expr: '기쁨', assetId: 'a-joy' });
    expect(exportAt(p, '민주').get(0)).toBeNull();
  });
});
