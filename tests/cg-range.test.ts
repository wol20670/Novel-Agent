// CG 활성 구간 판정(`cgActiveFlags`) + 시작 마커 술어(`hasCgStartMarker`) — post-v1 CG 종료(`#CG끝`).
//
// 이 파일이 고정하는 핵심:
//   1. `cgActiveFlags` 는 **per-line 상태**("그 줄을 처리한 뒤 지금 CG 인가")다.
//   2. `getFirstEffectiveCgIndex`(generators/outfit)는 **1회 경계**("최초 CG 경계가 어디인가")다.
//   3. ⚠️ **둘은 의미가 달라 답이 갈리는 입력이 실제로 있다** — 그 차이 자체를 assertion 으로 박는다.
//      합치려는 미래의 리팩터는 여기서 실패해야 한다(합치면 그 장면에서 Outfit AI writable 이
//      장면 전체로 열려, 이번 Phase 가 하지 않기로 한 post-CG 확장이 배선 사고로 일어난다).

import { describe, it, expect } from 'vitest';
import { cgActiveFlags, hasCgStartMarker, type Line } from '../src/types';
import { getFirstEffectiveCgIndex } from '../src/generators/outfit';
import { scene, dialogue } from './fixtures';

const start = (desc: string): Line => ({ kind: 'cg', desc });
const end = (): Line => ({ kind: 'cg', desc: '', end: true });
const say = (t: string): Line => dialogue('민주', t);

describe('hasCgStartMarker — 종료 마커를 시작 마커로 세지 않는다', () => {
  it('시작 마커가 있으면 true', () => {
    expect(hasCgStartMarker(scene({ cg: ['A'], lines: [start('A')] }))).toBe(true);
  });
  it('종료 마커만 있으면 false (레거시 폴백이 살아 있어야 한다)', () => {
    expect(hasCgStartMarker(scene({ cg: ['A'], lines: [end()] }))).toBe(false);
  });
  it('orphan 시작 마커(매칭 실패)도 시작 마커이므로 true', () => {
    expect(hasCgStartMarker(scene({ cg: ['A'], lines: [start('없는 CG')] }))).toBe(true);
  });
  it('cg 줄이 아예 없으면 false', () => {
    expect(hasCgStartMarker(scene({ cg: ['A'], lines: [say('L0')] }))).toBe(false);
  });
});

describe('cgActiveFlags — 기존 4갈래(회귀)', () => {
  it('① scene.cg 가 없으면 전 구간 -1', () => {
    expect(cgActiveFlags(scene({ cg: [], lines: [say('L0'), say('L1')] }))).toEqual([-1, -1]);
  });

  it('② 레거시 폴백 — scene.cg 는 있는데 시작 마커가 없으면 장면 시작부터 CG', () => {
    expect(cgActiveFlags(scene({ cg: ['A'], lines: [say('L0'), say('L1')] }))).toEqual([0, 0]);
  });

  it('③ 매칭되는 시작 마커 — 그 줄부터(마커 줄 자신 포함) 활성', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), start('A'), say('L2')] });
    expect(cgActiveFlags(sc)).toEqual([-1, 0, 0]);
  });

  it('④ 시작 마커가 전부 orphan 이면 CG 가 안 켜진다', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), start('없는 CG'), say('L2')] });
    expect(cgActiveFlags(sc)).toEqual([-1, -1, -1]);
  });

  it('desc 는 trim 기준으로 매칭한다(기존 규칙)', () => {
    const sc = scene({ cg: ['  A  '], lines: [start('A'), say('L1')] });
    expect(cgActiveFlags(sc)).toEqual([0, 0]);
  });
});

describe('cgActiveFlags — `#CG끝`', () => {
  it('종료 마커 줄부터 다시 -1 (일반 장면)', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), start('A'), say('L2'), end(), say('L4')] });
    expect(cgActiveFlags(sc)).toEqual([-1, 0, 0, -1, -1]);
  });

  it('CG 가 안 켜진 상태의 종료 마커는 no-op (orphan end)', () => {
    const sc = scene({ cg: [], lines: [say('L0'), end(), say('L2')] });
    expect(cgActiveFlags(sc)).toEqual([-1, -1, -1]);
  });

  it('다중 구간 — 일반 → CG A → 일반 → CG B → 일반', () => {
    const sc = scene({
      cg: ['A', 'B'],
      lines: [
        say('L0'),
        start('A'),
        say('L2'),
        end(),
        say('L4'),
        start('B'),
        say('L6'),
        end(),
        say('L8'),
      ],
    });
    expect(cgActiveFlags(sc)).toEqual([-1, 0, 0, -1, -1, 1, 1, -1, -1]);
  });

  it('종료 없이 CG 를 갈아타면 기존대로 배경만 다음 CG 로 바뀐다', () => {
    const sc = scene({ cg: ['A', 'B'], lines: [start('A'), say('L1'), start('B'), say('L3')] });
    expect(cgActiveFlags(sc)).toEqual([0, 0, 1, 1]);
  });

  it('레거시 폴백 + 중간 `#CG끝` — end 이전은 활성, 이후는 일반', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), say('L1'), end(), say('L3')] });
    expect(cgActiveFlags(sc)).toEqual([0, 0, -1, -1]);
  });

  it('edge — 레거시 폴백 장면의 첫 줄이 `#CG끝` 이면 전 구간 -1', () => {
    const sc = scene({ cg: ['A'], lines: [end(), say('L1')] });
    expect(cgActiveFlags(sc)).toEqual([-1, -1]);
  });

  it('줄이 0개면 빈 배열(호출측이 폴백을 판단한다)', () => {
    expect(cgActiveFlags(scene({ cg: ['A'], lines: [] }))).toEqual([]);
  });
});

describe('⚠️ cgActiveFlags 와 getFirstEffectiveCgIndex 는 다른 helper 다 — 합치지 말 것', () => {
  it('대부분의 입력에서는 "최초 활성 index" 가 일치한다', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), start('A'), say('L2'), end(), say('L4')] });
    expect(cgActiveFlags(sc).findIndex((v) => v >= 0)).toBe(1);
    expect(getFirstEffectiveCgIndex(sc)).toBe(1); // `#CG끝` 이 있어도 경계는 최초 `#CG` 위치
  });

  it('레거시 폴백 + 첫 줄 `#CG끝` 에서 두 답이 **의도적으로 갈린다**', () => {
    const sc = scene({ cg: ['legacy'], lines: [end(), say('L1')] });
    // 상태: "line 0 을 처리한 뒤 CG 는 꺼져 있다" → 수동 의상 전환은 L1 에서 허용된다
    expect(cgActiveFlags(sc)).toEqual([-1, -1]);
    expect(cgActiveFlags(sc).findIndex((v) => v >= 0)).toBe(-1);
    // 경계: "이 장면은 시작부터 CG 였다" → Outfit AI writable 은 0줄(보수적, Phase 14 정책 유지)
    expect(getFirstEffectiveCgIndex(sc)).toBe(0);
  });
});

describe('getFirstEffectiveCgIndex — 기존 4갈래 + `#CG끝` 이후에도 경계 유지', () => {
  it('① scene.cg 없음 → null', () => {
    expect(getFirstEffectiveCgIndex(scene({ cg: [], lines: [say('L0')] }))).toBeNull();
  });
  it('② 시작 마커 없음(레거시 폴백) → 0', () => {
    expect(getFirstEffectiveCgIndex(scene({ cg: ['A'], lines: [say('L0')] }))).toBe(0);
  });
  it('③ 매칭 시작 마커 → 그 index', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), start('A')] });
    expect(getFirstEffectiveCgIndex(sc)).toBe(1);
  });
  it('④ orphan 시작 마커만 → null', () => {
    const sc = scene({ cg: ['A'], lines: [say('L0'), start('없는 CG')] });
    expect(getFirstEffectiveCgIndex(sc)).toBeNull();
  });
  it('종료 마커는 경계 후보가 아니다 — orphan 시작 + 종료 조합도 여전히 null', () => {
    const sc = scene({ cg: ['A'], lines: [start('없는 CG'), end(), say('L2')] });
    expect(getFirstEffectiveCgIndex(sc)).toBeNull();
  });
  it('다중 구간에서도 **최초** 경계 하나만 돌려준다', () => {
    const sc = scene({
      cg: ['A', 'B'],
      lines: [say('L0'), start('A'), end(), start('B'), say('L4')],
    });
    expect(getFirstEffectiveCgIndex(sc)).toBe(1);
  });
});
