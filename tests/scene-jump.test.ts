// nextFlaggedSceneId — "다음 대상 장면" 선택의 순수 계약(off-by-one·wrap 회귀 가드).
//
// ⚠️ jumpToScene 자체(스크롤 정착 루프)는 DOM·requestAnimationFrame 동작이라 여기서 테스트하지
//    않는다 — 그쪽 정본은 실브라우저 회귀 확인이다(새 navigation test framework 를 만들지 않는다).

import { describe, it, expect } from 'vitest';
import { nextFlaggedSceneId } from '../src/components/sceneJump';

const IDS = ['s1', 's2', 's3', 's4'];

describe('nextFlaggedSceneId', () => {
  it('현재 장면 다음의 대상으로 간다', () => {
    expect(nextFlaggedSceneId(IDS, new Set(['s2', 's4']), 's1')).toBe('s2');
    expect(nextFlaggedSceneId(IDS, new Set(['s2', 's4']), 's2')).toBe('s4');
  });

  it('마지막 대상 뒤에서는 처음 대상으로 wrap 한다', () => {
    expect(nextFlaggedSceneId(IDS, new Set(['s2', 's4']), 's4')).toBe('s2');
  });

  it('선택된 장면이 없거나 목록에 없으면 첫 대상부터 시작한다', () => {
    expect(nextFlaggedSceneId(IDS, new Set(['s3']), null)).toBe('s3');
    expect(nextFlaggedSceneId(IDS, new Set(['s3']), '없는id')).toBe('s3');
  });

  it('대상이 현재 장면 하나뿐이면 그 자리에 머문다(한 바퀴 돌아 자기 자신)', () => {
    expect(nextFlaggedSceneId(IDS, new Set(['s2']), 's2')).toBe('s2');
  });

  it('대상이나 장면이 없으면 null — 빈 대상으로 이동을 시도하지 않는다', () => {
    expect(nextFlaggedSceneId(IDS, new Set(), 's1')).toBeNull();
    expect(nextFlaggedSceneId([], new Set(['s1']), null)).toBeNull();
  });
});
