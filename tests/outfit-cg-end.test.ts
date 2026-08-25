// post-v1 `#CG끝` × 의상 경계 — **두 경계가 의도적으로 다르다**는 것을 못 박는 파일.
//
//   manual writable (장면 카드 👗) = cgActiveFlags[i] < 0   → CG 구간만 차단, `#CG끝` 이후 다시 허용
//   AI writable (collectOutfitTargets · validateOutfitSuggestion gate 10)
//                                  = getFirstEffectiveCgIndex → 최초 CG 앞까지(Phase 14 동결 그대로)
//
// ⚠️ AI 축을 `#CG끝` 때문에 넓히지 않는다 — writable 을 비연속 다중 range 로 만들면 planOutfitWindows
// 의 chunking·lead-in 인과·`{i: cgCutoff, event:'cg'}` sentinel 전제가 전부 깨진다(별도 Phase).
// 이 파일은 그 divergence 가 **유지되는지**를 검사한다.
//
// 수동 쪽 실제 버튼 상태(SceneCard)는 UI 테스트 인프라가 없어 브라우저 스모크로 확인한다 —
// 이 작업 때문에 jsdom/testing-library 를 새로 들이지 않는다. 여기서는 그 버튼이 보는 **술어**를
// 컴포넌트와 동일한 식으로 재현해 고정한다.

import { describe, it, expect } from 'vitest';
import { collectOutfitTargets, getFirstEffectiveCgIndex } from '../src/generators/outfit';
import { validateOutfitSuggestion } from '../src/generators/outfit/apply';
import { cgActiveFlags, type Character, type Line, type Project, type Scene } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

const heroine = (): Character => ({
  name: '민주',
  color: '#fff',
  expressions: { 기본: 'a-base' },
  outfits: [
    { name: '교복', expressions: { 기본: 'a-교복' } },
    { name: '사복', expressions: { 기본: 'a-사복' } },
  ],
});

/** SceneCard 의 `manualOutfitWritable` 과 **같은 식**(컴포넌트를 렌더하지 않고 술어만 재현). */
const manualWritable = (sc: Scene, index: number) => (cgActiveFlags(sc)[index] ?? -1) < 0;

/** `일반 → CG → 일반` 한 장면. 텍스트 줄 index = 0, 2, 4. */
function sceneWithCgEnd(): Scene {
  const lines: Line[] = [
    dialogue('민주', 'a'), // 0 · CG 이전
    { kind: 'cg', desc: '키스' }, // 1
    dialogue('민주', 'b'), // 2 · CG 중
    { kind: 'cg', desc: '', end: true }, // 3
    dialogue('민주', 'c'), // 4 · CG 이후
  ];
  return scene({ cg: ['키스'], lines });
}

describe('수동 의상 전환 — CG 구간만 차단하고 `#CG끝` 이후 다시 허용한다', () => {
  it('CG 이전 허용 · CG 구간 차단 · 종료 이후 다시 허용', () => {
    const sc = sceneWithCgEnd();
    expect(manualWritable(sc, 0)).toBe(true); // CG 이전
    expect(manualWritable(sc, 2)).toBe(false); // CG 구간
    expect(manualWritable(sc, 4)).toBe(true); // `#CG끝` 이후 — 여기가 이번 Phase 의 변화
  });

  it('종료가 없으면 예전과 똑같이 첫 CG 이후 전부 차단이다(회귀 0)', () => {
    const sc = scene({
      cg: ['키스'],
      lines: [dialogue('민주', 'a'), { kind: 'cg', desc: '키스' }, dialogue('민주', 'b')],
    });
    expect(manualWritable(sc, 0)).toBe(true);
    expect(manualWritable(sc, 2)).toBe(false);
  });

  it('다중 구간 — 일반 구간마다 열리고 CG 구간마다 닫힌다', () => {
    const sc = scene({
      cg: ['A', 'B'],
      lines: [
        dialogue('민주', 'a'), // 0 일반
        { kind: 'cg', desc: 'A' }, // 1
        dialogue('민주', 'b'), // 2 CG A
        { kind: 'cg', desc: '', end: true }, // 3
        dialogue('민주', 'c'), // 4 일반
        { kind: 'cg', desc: 'B' }, // 5
        dialogue('민주', 'd'), // 6 CG B
        { kind: 'cg', desc: '', end: true }, // 7
        dialogue('민주', 'e'), // 8 일반
      ],
    });
    expect([0, 2, 4, 6, 8].map((i) => manualWritable(sc, i))).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
  });
});

describe('Outfit AI 경계 — `#CG끝` 이 있어도 최초 CG 앞까지 그대로다(의도된 divergence)', () => {
  it('writable 집합이 CG 종료 유무와 무관하게 동일하다', () => {
    const withEnd = projectWith([sceneWithCgEnd()], { characters: [heroine()] });
    const noEnd = projectWith(
      [
        scene({
          cg: ['키스'],
          lines: [
            dialogue('민주', 'a'),
            { kind: 'cg', desc: '키스' },
            dialogue('민주', 'b'),
            dialogue('민주', 'c'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const idx = (p: Project) => collectOutfitTargets(p)[0].writable.map((l) => l.i);
    expect(idx(withEnd)).toEqual([0]); // 종료 뒤 줄(4)이 **들어오지 않는다**
    expect(idx(noEnd)).toEqual([0]);
  });

  it('cutoff 자체도 최초 `#CG` 위치 그대로다', () => {
    expect(getFirstEffectiveCgIndex(sceneWithCgEnd())).toBe(1);
  });

  it('gate 10 — 종료 뒤 줄을 가리키는 AI 제안은 여전히 stale 이다', () => {
    const sc = sceneWithCgEnd();
    const p = projectWith([sc], { characters: [heroine()] });
    const line = sc.lines[4] as Extract<Line, { kind: 'dialogue' }>;
    expect(
      validateOutfitSuggestion(p, sc, {
        sceneId: sc.id,
        lineIndex: 4,
        character: '민주',
        outfit: '사복',
        lineKey: `dialogue|${line.speaker}|${line.text}`,
        reason: '',
      }),
    ).toBe('stale');
  });

  it('⚠️ 그래서 같은 줄에서 수동은 허용되고 AI 는 제안하지 않는다 — 의도된 차이', () => {
    const sc = sceneWithCgEnd();
    expect(manualWritable(sc, 4)).toBe(true);
    expect(collectOutfitTargets(projectWith([sc], { characters: [heroine()] }))[0].writable).toHaveLength(
      1,
    );
  });
});
