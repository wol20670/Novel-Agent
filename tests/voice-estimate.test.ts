import { describe, it, expect } from 'vitest';
import { estimateVoiceCostForProject, findOverLimitTargets } from '../src/generators/voice/estimate';
import type { Project } from '../src/types';
import { scene, projectWith } from './fixtures';

describe('findOverLimitTargets', () => {
  it('2000자를 넘는 줄만 장면 제목·화자와 함께 뽑는다', () => {
    const p = projectWith([scene({ id: 's1', title: 's1', lines: [] })]);
    const targets = [
      { sceneId: 's1', lineIndex: 0, text: 'a'.repeat(2001) },
      { sceneId: 's1', lineIndex: 1, text: 'a'.repeat(2000) }, // 정확히 2000자는 포함 안 됨(제한은 초과부터)
      { sceneId: 's1', lineIndex: 2, text: '짧은 대사' },
    ];
    const over = findOverLimitTargets(p, targets, '한지수');
    expect(over).toEqual([{ scene: 's1', speaker: '한지수', chars: 2001 }]);
  });

  it('장면 제목이 있으면 sceneId 대신 title 을 쓴다', () => {
    const p = projectWith([scene({ id: 's1', title: '1화 - 등굣길', lines: [] })]);
    const targets = [{ sceneId: 's1', lineIndex: 0, text: 'a'.repeat(2100) }];
    const over = findOverLimitTargets(p, targets, '강민주');
    expect(over).toEqual([{ scene: '1화 - 등굣길', speaker: '강민주', chars: 2100 }]);
  });
});

describe('estimateVoiceCostForProject', () => {
  // 최소 캐릭터 프리셋(테스트에서 필요한 필드만 채움 — 나머지 Character 필드는 프로젝트 헬퍼로 보완).
  function char(name: string, opts: { voice?: boolean } = {}): Project['characters'][number] {
    return {
      name,
      color: '#ffffff',
      expressions: {},
      ...(opts.voice ? { voice: { voiceId: 'tc_abc123' } } : {}),
    };
  }

  it('글자수 합이 곧 크레딧이다(1글자=1크레딧, API 호출 없이 동기 계산)', () => {
    const p = projectWith(
      [scene({ lines: [{ kind: 'dialogue', speaker: '한지수', text: '안녕하세요' }] })], // 5자
      { characters: [char('한지수', { voice: true })] },
    );
    const result = estimateVoiceCostForProject(p, 'ko');
    expect(result.totalChars).toBe(5);
    expect(result.totalCredits).toBe(5); // 정확값 — 근사 아님
    expect(result.totalLines).toBe(1);
    // expect.any(Number) 는 NaN 도 통과시킨다(estSeconds 계산이 깨져 NaN 이 나와도 초록불) —
    // APPROX_CHARS_PER_SEC=5.5 기준 실제 값(5/5.5)을 고정해 진짜 회귀를 잡는다.
    expect(result.perChar).toEqual([{ name: '한지수', lines: 1, chars: 5, estSeconds: 5 / 5.5, estCredits: 5 }]);
  });

  it('보이스 프리셋이 없는 캐릭터는 noPreset 에 담기고 견적에서 제외된다', () => {
    const p = projectWith(
      [scene({ lines: [{ kind: 'dialogue', speaker: '강민주', text: '반가워' }] })],
      { characters: [char('강민주')] }, // voice 없음
    );
    const result = estimateVoiceCostForProject(p, 'ko');
    expect(result.noPreset).toEqual(['강민주']);
    expect(result.perChar).toEqual([]);
    expect(result.totalCredits).toBe(0);
  });

  it('주인공(isProtagonist)은 견적 대상에서 제외된다', () => {
    const p = projectWith(
      [scene({ lines: [{ kind: 'dialogue', speaker: '주인공', text: '오늘도 화이팅' }] })],
      { characters: [{ ...char('주인공', { voice: true }), isProtagonist: true }] },
    );
    const result = estimateVoiceCostForProject(p, 'ko');
    expect(result.perChar).toEqual([]);
    expect(result.totalLines).toBe(0);
  });

  it('여러 캐릭터의 크레딧을 합산한다', () => {
    const p = projectWith(
      [
        scene({
          lines: [
            { kind: 'dialogue', speaker: '한지수', text: '가나다' }, // 3자
            { kind: 'dialogue', speaker: '강민주', text: '라마바사' }, // 4자
          ],
        }),
      ],
      { characters: [char('한지수', { voice: true }), char('강민주', { voice: true })] },
    );
    const result = estimateVoiceCostForProject(p, 'ko');
    expect(result.totalChars).toBe(7);
    expect(result.totalCredits).toBe(7);
  });
});
