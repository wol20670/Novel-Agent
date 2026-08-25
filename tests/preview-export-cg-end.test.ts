// 미리보기 ↔ Ren'Py 출력 parity — post-v1 `#CG끝`(CG 종료 → 일반 장면 복귀).
//
// ⚠️ **비교 기준은 raw `show` 줄의 집합이 아니라 "최종 effective sprite state"** 다. `#CG끝` 은
// 복원 show 를 그 자리에서 내고, 바로 다음 줄이 그 캐릭터의 대사면 화자 show 가 한 번 더 나간다
// (두 문 사이엔 interaction 이 없어 user-visible 차이는 0이고, 없애려면 look-ahead 가 필요하다).
// 그래서 기존 preview-export-fallback.test.ts 의 `exportAt` 관용구를 그대로 쓴다 — 그쪽은
// show/hide 를 위에서 아래로 **접어** 각 say 시점의 상태만 스냅샷하므로 중복 show 가 자동 해소된다.
//
// parity checkpoint = **첫 post-CG user-visible interaction**(첫 post-CG 대사/지문). 마커 줄 자체는
// Ren'Py 에 대응 interaction 이 없으므로 1:1 비교 지점으로 쓰지 않는다.
// 새 helper framework 를 만들지 않으려고 필요한 최소 파싱만 여기서 재현한다.

import { describe, it, expect } from 'vitest';
import {
  generateRenpyFiles,
  charIdMap,
  outfitAttrFor,
  attrFor,
} from '../src/renpy/generate';
import { computeSpriteDisplay, computeStagePositions } from '../src/components/ScenePlayer';
import { cgActiveFlags, type Character, type Project, type Scene } from '../src/types';
import { contentOf, dialogue, projectWith, scene } from './fixtures';

const heroine = (patch: Partial<Character> = {}): Character => ({
  name: '민주',
  color: '#f88',
  expressions: {},
  ...patch,
});

/** 기본 의상 + 추가 의상 둘. 'A' 에 기쁨이 없어 강등(표시 attr carry)이 관측된다. */
const carryChar = (): Character =>
  heroine({
    expressions: { 기본: 'b-base', 기쁨: 'b-joy' },
    outfits: [
      { name: 'A', expressions: { 기본: 'a-base' } },
      { name: 'B', expressions: { 기본: 'bb-base', 기쁨: 'bb-joy' } },
    ],
  });

const friend = (): Character =>
  heroine({ name: '지수', color: '#8cf', expressions: { 기본: 'f-base', 기쁨: 'f-joy' } });

/** assetId → 논리 의상(미리보기 결과를 출력과 같은 축으로 환산하기 위해). */
function outfitOfAsset(c: Character, assetId: string | undefined): string {
  if (assetId === undefined) return '기본';
  if (Object.values(c.expressions).some((id) => id === assetId)) return '기본';
  for (const o of c.outfits ?? []) {
    if (Object.values(o.expressions).some((id) => id === assetId)) return o.name;
  }
  throw new Error('outfitOfAsset: 어느 의상에도 없는 assetId — ' + assetId);
}

function previewAt(p: Project, sc: Scene, line: number, name: string) {
  const d = computeSpriteDisplay(p, sc, line).get(name);
  if (!d) return null;
  const c = p.characters.find((x) => x.name === name)!;
  return { outfitAttr: outfitAttrFor(outfitOfAsset(c, d.assetId)), attr: attrFor(d.expr) };
}

/**
 * 생성된 script.rpy 를 위에서 아래로 접어 **각 대사(`L{n}`) 시점의 최종 표시 상태**를 복원한다.
 * `scene` 은 이미지 레이어를 통째로 비우고(= CG 진입/복귀), `show` 는 상태를 갱신, `hide` 는 제거.
 * 속성 없는 재배치 `show <id> at vn_char(..)` 는 토큰 수가 달라 정규식에 안 걸린다(상태 불변).
 */
function exportStates(p: Project, name: string) {
  const script = contentOf(generateRenpyFiles(p).files, 'game/script.rpy');
  const id = charIdMap(p).get(name)!;
  const showRe = new RegExp('^\\s+show ' + id + ' (\\S+) (\\S+) at vn_char\\((\\d+)\\)');
  const hideRe = new RegExp('^\\s+hide ' + id + '\\s*$');
  const sceneRe = /^\s+scene \S+/;
  const sayRe = /"L(\d+)"/;
  const out = new Map<number, { outfitAttr: string; attr: string; pos: number } | null>();
  let state: { outfitAttr: string; attr: string; pos: number } | null = null;
  for (const ln of script.split('\n')) {
    const sh = showRe.exec(ln);
    if (sh) {
      state = { outfitAttr: sh[1], attr: sh[2], pos: Number(sh[3]) };
      continue;
    }
    if (hideRe.test(ln)) {
      state = null;
      continue;
    }
    if (sceneRe.test(ln)) {
      state = null; // scene 문은 레이어를 비운다(CG 진입·복귀 둘 다)
      continue;
    }
    const say = sayRe.exec(ln);
    if (say) out.set(Number(say[1]), state);
  }
  return out;
}

const cgStart = (desc: string) => ({ kind: 'cg', desc }) as Scene['lines'][number];
const cgEnd = () => ({ kind: 'cg', desc: '', end: true }) as Scene['lines'][number];

describe('T18 — `#CG끝` 이후 첫 interaction 에서 미리보기와 출력의 effective state 가 같다', () => {
  it('T18a 배경 복귀 + 스프라이트 복원(의상·표정·위치)이 양쪽에서 일치한다', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      cg: ['둘이 마주보는 장면'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기쁨' }), // A 에 기쁨이 없어 neutral 로 강등
        cgStart('둘이 마주보는 장면'),
        dialogue('민주', 'L2', { emotion: '기본' }), // CG 중(양쪽 다 안 그림)
        cgEnd(),
        dialogue('민주', 'L4', { emotion: '기본' }), // ← parity checkpoint
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    const exp = exportStates(p, '민주');

    // CG 구간은 양쪽 다 비어 있다(기존 계약 유지).
    expect(previewAt(p, sc, 2, '민주')).toBeNull();
    expect(exp.get(2)).toBeNull();

    // 복귀 후 첫 interaction — 셋 다 검사(Export literal · Preview literal · parity).
    const want = { outfitAttr: outfitAttrFor('A'), attr: 'neutral' };
    const e = exp.get(4)!;
    expect({ outfitAttr: e.outfitAttr, attr: e.attr }, 'Export').toEqual(want);
    expect(previewAt(p, sc, 4, '민주'), 'Preview').toEqual(want);
    // 위치도 같다(미리보기 computeStagePositions ↔ 출력 vn_char 인자).
    expect(computeStagePositions(sc, p.characters, 4, cgActiveFlags(sc)[4]).get('민주')).toBe(e.pos);
  });

  it('T18b CG 구간에서 바뀐 의상이 양쪽 모두 복귀 시점에 반영된다', () => {
    const sc = scene({
      outfits: { 민주: 'A' },
      cg: ['컷'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기본' }),
        cgStart('컷'),
        dialogue('민주', 'L2', { emotion: '기본', outfits: { 민주: 'B' } }), // CG 중 갈아입음
        cgEnd(),
        dialogue('민주', 'L4', { emotion: '기본' }),
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    const want = { outfitAttr: outfitAttrFor('B'), attr: 'neutral' };
    const e = exportStates(p, '민주').get(4)!;
    expect({ outfitAttr: e.outfitAttr, attr: e.attr }, 'Export').toEqual(want);
    expect(previewAt(p, sc, 4, '민주'), 'Preview').toEqual(want);
  });

  it('T18c 복귀 표정은 CG 중 대사가 아니라 **CG 진입 전 실제 표시 attr** 이다(양쪽 동일)', () => {
    const sc = scene({
      outfits: { 민주: 'B' }, // B 에는 기쁨이 있다 → 강등 없이 happy 로 선다
      cg: ['컷'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기쁨' }), // 표시 attr = happy
        cgStart('컷'),
        dialogue('민주', 'L2', { emotion: '기본' }), // CG 중 — 실제로 안 그려졌다
        cgEnd(),
        { kind: 'narration', text: 'L4' } as Scene['lines'][number], // 화자가 아닌 줄로 복귀 확인
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    const want = { outfitAttr: outfitAttrFor('B'), attr: attrFor('기쁨') };
    const e = exportStates(p, '민주').get(4)!;
    expect({ outfitAttr: e.outfitAttr, attr: e.attr }, 'Export').toEqual(want);
    expect(previewAt(p, sc, 4, '민주'), 'Preview').toEqual(want);
  });

  it('T18d CG 중에만 처음 말한 화자는 양쪽 다 복귀 순간엔 없고, 다음 발화에서 등장한다', () => {
    const sc = scene({
      cg: ['컷'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기본' }),
        cgStart('컷'),
        dialogue('지수', 'L2', { emotion: '기본' }), // CG 중 첫 등장 → 세우지 않는다
        cgEnd(),
        { kind: 'narration', text: 'L4' } as Scene['lines'][number], // 복귀 직후
        dialogue('지수', 'L5', { emotion: '기본' }), // 여기서 정상 등장
      ],
    });
    const p = projectWith([sc], { characters: [carryChar(), friend()] });
    const exp = exportStates(p, '지수');
    expect(previewAt(p, sc, 4, '지수'), 'Preview 복귀 직후').toBeNull();
    expect(exp.get(4), 'Export 복귀 직후').toBeNull();
    expect(previewAt(p, sc, 5, '지수'), 'Preview 다음 발화').not.toBeNull();
    expect(exp.get(5), 'Export 다음 발화').not.toBeNull();
    // 원래 서 있던 캐릭터는 복귀 직후부터 다시 보인다.
    expect(previewAt(p, sc, 4, '민주')).not.toBeNull();
    expect(exportStates(p, '민주').get(4)).not.toBeNull();
  });

  it('T18e 종료 시점이 숨김이면 양쪽 다 복원하지 않는다', () => {
    const sc = scene({
      cg: ['컷'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기본' }),
        cgStart('컷'),
        dialogue('민주', 'L2', { emotion: '기본', hideSprites: true }),
        cgEnd(),
        { kind: 'narration', text: 'L4' } as Scene['lines'][number],
        { kind: 'narration', text: 'L5', hideSprites: false } as Scene['lines'][number],
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    const exp = exportStates(p, '민주');
    expect(previewAt(p, sc, 4, '민주'), 'Preview 숨김 유지').toBeNull();
    expect(exp.get(4), 'Export 숨김 유지').toBeNull();
    expect(previewAt(p, sc, 5, '민주'), 'Preview #인물표시 복원').not.toBeNull();
    expect(exp.get(5), 'Export #인물표시 복원').not.toBeNull();
  });

  it('T18f 다중 CG 구간에서도 구간마다 양쪽이 같이 꺼지고 같이 돌아온다', () => {
    const sc = scene({
      cg: ['A', 'B'],
      lines: [
        dialogue('민주', 'L0', { emotion: '기본' }),
        cgStart('A'),
        { kind: 'narration', text: 'L2' } as Scene['lines'][number],
        cgEnd(),
        { kind: 'narration', text: 'L4' } as Scene['lines'][number],
        cgStart('B'),
        { kind: 'narration', text: 'L6' } as Scene['lines'][number],
        cgEnd(),
        { kind: 'narration', text: 'L8' } as Scene['lines'][number],
      ],
    });
    const p = projectWith([sc], { characters: [carryChar()] });
    const exp = exportStates(p, '민주');
    for (const [k, visible] of [
      [2, false],
      [4, true],
      [6, false],
      [8, true],
    ] as [number, boolean][]) {
      expect(previewAt(p, sc, k, '민주') !== null, `Preview L${k}`).toBe(visible);
      expect(exp.get(k) !== null, `Export L${k}`).toBe(visible);
    }
  });
});
