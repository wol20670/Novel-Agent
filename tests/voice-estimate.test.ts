import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  pickSamples,
  estimateFromSamples,
  findOverLimitTargets,
  currentCreditsPerSec,
} from '../src/generators/voice/estimate';
import { aiConfig } from '../src/config/aiConfig';
import { emptyProject, type Project, type Scene } from '../src/types';

function scene(id: string, lines: Scene['lines']): Scene {
  return { id, title: id, direction: [], cg: [], lines, choices: [], status: 'approved' };
}

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}

describe('pickSamples', () => {
  it('targets 가 n 이하면 전부 반환한다', () => {
    const targets = [{ text: 'a' }, { text: 'bb' }, { text: 'ccc' }];
    expect(pickSamples(targets, 15)).toEqual(targets);
  });

  it('targets 가 n 보다 많으면 정확히 n개를 뽑고, 가장 짧은/가장 긴 것을 포함한다(분포 대표)', () => {
    const targets = Array.from({ length: 50 }, (_, i) => ({ text: 'x'.repeat(i + 1) }));
    const picked = pickSamples(targets, 15);
    expect(picked).toHaveLength(15);
    const lengths = picked.map((t) => t.text.length);
    expect(Math.min(...lengths)).toBe(1); // 가장 짧은 것 포함
    expect(Math.max(...lengths)).toBe(50); // 가장 긴 것 포함
    // 중복 없이 오름차순으로 커버해야 "짧은~긴 걸 고르게" 뽑은 것.
    expect(new Set(lengths).size).toBe(15);
    expect([...lengths]).toEqual([...lengths].sort((a, b) => a - b));
  });
});

describe('estimateFromSamples', () => {
  it('계수(초/글자)를 뽑아 targets 전체 글자수에 외삽한다', () => {
    // 샘플: 총 10자에 5초 → 계수 0.5초/자. targets 총 40자 → 예상 20초.
    const targets = [{ text: 'a'.repeat(30) }, { text: 'b'.repeat(10) }];
    const sampled = [
      { chars: 6, seconds: 3 },
      { chars: 4, seconds: 2 },
    ];
    const creditsPerSec = 10;
    const { estSeconds, estCredits } = estimateFromSamples(targets, sampled, creditsPerSec);
    expect(estSeconds).toBeCloseTo(20, 5);
    expect(estCredits).toBeCloseTo(200, 5);
  });

  it('sampled 가 targets 를 1:1로 전부 덮으면(전수조사) 실측 합과 정확히 같다', () => {
    const targets = [{ text: 'abc' }, { text: 'de' }, { text: 'fghij' }];
    const sampled = [
      { chars: 3, seconds: 1.2 },
      { chars: 2, seconds: 0.5 },
      { chars: 5, seconds: 2.1 },
    ];
    const { estSeconds } = estimateFromSamples(targets, sampled, 5);
    expect(estSeconds).toBeCloseTo(1.2 + 0.5 + 2.1, 6);
  });

  it('샘플 글자수 합이 0이면(빈 목록) 0을 반환한다', () => {
    const { estSeconds, estCredits } = estimateFromSamples([], [], 10);
    expect(estSeconds).toBe(0);
    expect(estCredits).toBe(0);
  });
});

describe('findOverLimitTargets', () => {
  it('300자를 넘는 줄만 장면 제목·화자와 함께 뽑는다', () => {
    const p = projectWith([scene('s1', [])]);
    const targets = [
      { sceneId: 's1', lineIndex: 0, text: 'a'.repeat(301) },
      { sceneId: 's1', lineIndex: 1, text: 'a'.repeat(300) }, // 정확히 300자는 포함 안 됨(제한은 초과부터)
      { sceneId: 's1', lineIndex: 2, text: '짧은 대사' },
    ];
    const over = findOverLimitTargets(p, targets, '한지수');
    expect(over).toEqual([{ scene: 's1', speaker: '한지수', chars: 301 }]);
  });

  it('장면 제목이 있으면 sceneId 대신 title 을 쓴다', () => {
    const p = projectWith([{ ...scene('s1', []), title: '1화 - 등굣길' }]);
    const targets = [{ sceneId: 's1', lineIndex: 0, text: 'a'.repeat(400) }];
    const over = findOverLimitTargets(p, targets, '강민주');
    expect(over).toEqual([{ scene: '1화 - 등굣길', speaker: '강민주', chars: 400 }]);
  });
});

describe('currentCreditsPerSec', () => {
  const KEY = 'novel-agent:creditsPerSec';
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  });

  it('localStorage 에 저장된 실측값이 있으면 그 값을 우선한다', () => {
    store[KEY] = '7.25';
    expect(currentCreditsPerSec()).toBe(7.25);
  });

  it('저장된 값이 없으면 aiConfig 기본값을 쓴다', () => {
    expect(currentCreditsPerSec()).toBe(aiConfig.voice.defaultCreditsPerSec);
  });

  it('저장된 값이 이상하면(NaN·0 이하) 기본값으로 폴백한다', () => {
    store[KEY] = 'not-a-number';
    expect(currentCreditsPerSec()).toBe(aiConfig.voice.defaultCreditsPerSec);
    store[KEY] = '-3';
    expect(currentCreditsPerSec()).toBe(aiConfig.voice.defaultCreditsPerSec);
    store[KEY] = '0';
    expect(currentCreditsPerSec()).toBe(aiConfig.voice.defaultCreditsPerSec);
  });

  it('localStorage 자체가 없는 환경(node)에서도 크래시 없이 기본값을 반환한다', () => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    expect(currentCreditsPerSec()).toBe(aiConfig.voice.defaultCreditsPerSec);
  });
});
