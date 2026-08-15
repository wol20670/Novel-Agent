// 의상 추천 비용 견적 — O15(견적 요청 수 == 실행 요청 수) · O2(대상 0 이면 0원).
// 견적과 실행이 **같은 planner** 를 쓰는지가 핵심이다(다른 근사식을 쓰면 견적이 거짓말을 한다).

import { describe, it, expect } from 'vitest';
import {
  collectOutfitTargets,
  estimateOutfitCost,
  planOutfitWindows,
} from '../src/generators/outfit';
import type { Character, Line, Project } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

function heroine(name = '민주'): Character {
  return {
    name,
    color: '#fff',
    expressions: { 기본: 'a' },
    outfits: [{ name: '사복', expressions: { 기본: 'b' } }],
  };
}

/** 실행이 실제로 보낼 요청 수 = 배치별 window 수의 합. */
function runtimeRequestCount(project: Project): number {
  let n = 0;
  for (const b of collectOutfitTargets(project)) {
    const sc = project.scenes.find((s) => s.id === b.sceneId)!;
    n += planOutfitWindows(b, sc, project.outfitRules).length;
  }
  return n;
}

describe('O2 — 대상이 없으면 요청 0 · 비용 0', () => {
  it('추가 의상이 없는 프로젝트', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], {
      characters: [{ name: '민주', color: '#fff', expressions: {} }],
    });
    expect(estimateOutfitCost(p)).toMatchObject({ requests: 0, scanLines: 0, usd: 0 });
    expect(runtimeRequestCount(p)).toBe(0);
  });

  it('레거시 CG 폴백 장면(writable 0)도 요청 0', () => {
    const p = projectWith([scene({ cg: ['키스'], lines: [dialogue('민주', 'a')] })], {
      characters: [heroine()],
    });
    expect(estimateOutfitCost(p).requests).toBe(0);
    expect(runtimeRequestCount(p)).toBe(0);
  });
});

describe('O15 — 견적 요청 수 == 실행 요청 수', () => {
  it('한 장면 한 요청', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] })], {
      characters: [heroine()],
    });
    expect(estimateOutfitCost(p).requests).toBe(runtimeRequestCount(p));
    expect(estimateOutfitCost(p).requests).toBe(1);
    expect(estimateOutfitCost(p).scanLines).toBe(2);
  });

  it('여러 장면 · 청크가 갈리는 장면에서도 같다', () => {
    const long = 'ㄱ'.repeat(1800);
    const many: Line[] = Array.from({ length: 8 }, (_, i) => dialogue('민주', i % 2 ? long : `line${i}`));
    const p = projectWith(
      [
        scene({ id: 's1', lines: many }),
        scene({ id: 's2', lines: [dialogue('민주', 'x')] }),
        scene({ id: 's3', lines: Array.from({ length: 70 }, (_, i) => dialogue('민주', `n${i}`)) }),
      ],
      { characters: [heroine()] },
    );
    const est = estimateOutfitCost(p);
    expect(est.requests).toBe(runtimeRequestCount(p));
    expect(est.requests).toBeGreaterThan(3); // 실제로 여러 window 로 갈렸다
    expect(est.usd).toBeGreaterThan(0);
  });

  it('scanLines 는 writable 줄 수의 합과 같다', () => {
    const p = projectWith(
      [
        scene({
          id: 's1',
          cg: ['키스'],
          lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), { kind: 'cg', desc: '키스' }, dialogue('민주', 'c')],
        }),
      ],
      { characters: [heroine()] },
    );
    // cutoff(2) 이후 줄은 스캔 대상이 아니다.
    expect(estimateOutfitCost(p).scanLines).toBe(2);
  });
});
