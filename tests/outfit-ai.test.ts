// Outfit AI 수집·계획·요청·파싱 — Phase 7 회귀 매트릭스 O2·O3·O4·O6·O7·O9·O10·O11·O18·O21·O25.
// 전부 순수 함수라 API 없이 정면 검증한다(실제 배정 품질은 여기서 증명하지 않는다 — 구조만).

import { describe, it, expect } from 'vitest';
import {
  buildOutfitRequest,
  collectOutfitTargets,
  getFirstEffectiveCgIndex,
  parseOutfitResponse,
  planOutfitWindows,
  type OutfitBatch,
  type OutfitWindowPlan,
} from '../src/generators/outfit';
import type { Character, Line, Project } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

const CTX = { sceneTitle: '장면1', direction: [], synopsis: '' };

/** 추가 의상을 가진 히로인. */
function heroine(name = '민주', outfits = ['교복', '사복']): Character {
  return {
    name,
    color: '#fff',
    expressions: { 기본: 'a-base' },
    outfits: outfits.map((o) => ({ name: o, expressions: { 기본: `a-${o}` } })),
  };
}

function narration(text: string, extra?: Partial<Extract<Line, { kind: 'narration' }>>): Line {
  return { kind: 'narration', text, ...extra };
}

/** 배치 1개짜리 프로젝트에서 (batch, plans) 를 한 번에 뽑는 헬퍼. */
function planOf(project: Project): { batch: OutfitBatch; plans: OutfitWindowPlan[] } {
  const batches = collectOutfitTargets(project);
  expect(batches.length).toBe(1);
  const batch = batches[0];
  const sc = project.scenes.find((s) => s.id === batch.sceneId)!;
  return { batch, plans: planOutfitWindows(batch, sc, project.outfitRules) };
}

function reply(changes: unknown[]): string {
  return JSON.stringify({ changes });
}

describe('O2 — 대상이 없으면 배치가 비고 요청도 0회', () => {
  it('추가 의상을 가진 캐릭터가 없으면 배치 0', () => {
    const c: Character = { name: '민주', color: '#fff', expressions: { 기본: 'a' } };
    const p = projectWith([scene({ lines: [dialogue('민주', '안녕')] })], { characters: [c] });
    expect(collectOutfitTargets(p)).toEqual([]);
  });

  it('의상은 있지만 그 장면에서 말하지 않으면 배치 0', () => {
    const p = projectWith([scene({ lines: [narration('아무도 말하지 않는다')] })], {
      characters: [heroine()],
    });
    expect(collectOutfitTargets(p)).toEqual([]);
  });
});

describe('O3 — 대상 캐릭터 gate(주인공·미등록·joint)', () => {
  it('주인공은 후보에서 빠지지만 그 대사 줄은 scan(근거)으로 남는다', () => {
    const me: Character = {
      name: '나',
      color: '#fff',
      expressions: {},
      isProtagonist: true,
      outfits: [{ name: '교복', expressions: {} }],
    };
    const p = projectWith(
      [scene({ lines: [dialogue('나', '갈아입고 올게'), dialogue('민주', '응')] })],
      { characters: [me, heroine()] },
    );
    const { batch } = planOf(p);
    expect(batch.characters).toEqual(['민주']); // 주인공 제외
    expect(batch.writable.map((l) => l.i)).toEqual([0, 1]); // 주인공 대사도 근거 줄로는 남는다
  });

  it('joint 합성 라벨은 후보가 아니고 member 는 정상 후보다', () => {
    const p = projectWith(
      [
        scene({
          lines: [dialogue('민주 & 지수', '같이 가자', { members: ['민주', '지수'] })],
        }),
      ],
      { characters: [heroine('민주'), heroine('지수')] },
    );
    const { batch } = planOf(p);
    expect(batch.characters).toEqual(['민주', '지수']);
    expect(batch.characters).not.toContain('민주 & 지수');
  });

  it('미등록 화자는 후보가 아니다', () => {
    const p = projectWith([scene({ lines: [dialogue('낯선이', '...'), dialogue('민주', 'ㅇ')] })], {
      characters: [heroine()],
    });
    expect(planOf(p).batch.characters).toEqual(['민주']);
  });
});

describe('O25 — first effective CG 4갈래 + writable 경계', () => {
  const lines = (): Line[] => [dialogue('민주', 'a'), dialogue('민주', 'b'), dialogue('민주', 'c')];

  it('① scene.cg 없음 → cutoff 없음, 전체 writable', () => {
    const sc = scene({ lines: lines() });
    expect(getFirstEffectiveCgIndex(sc)).toBeNull();
    const p = projectWith([sc], { characters: [heroine()] });
    expect(planOf(p).batch.writable.map((l) => l.i)).toEqual([0, 1, 2]);
  });

  it('② cg 는 있는데 kind:cg 줄이 전무 → 레거시 폴백(cutoff 0) → writable 0 → 배치 없음', () => {
    const sc = scene({ cg: ['키스'], lines: lines() });
    expect(getFirstEffectiveCgIndex(sc)).toBe(0);
    const p = projectWith([sc], { characters: [heroine()] });
    expect(collectOutfitTargets(p)).toEqual([]); // 요청 0회
  });

  it('③ 유효 마커 → 그 인덱스가 cutoff, 그 뒤는 writable 아님', () => {
    const sc = scene({
      cg: ['키스'],
      lines: [dialogue('민주', 'a'), { kind: 'cg', desc: '키스' }, dialogue('민주', 'b')],
    });
    expect(getFirstEffectiveCgIndex(sc)).toBe(1);
    const p = projectWith([sc], { characters: [heroine()] });
    expect(planOf(p).batch.writable.map((l) => l.i)).toEqual([0]);
  });

  it('④ orphan 마커만 → CG 가 끝까지 안 켜져 전체 writable', () => {
    const sc = scene({
      cg: ['키스'],
      lines: [dialogue('민주', 'a'), { kind: 'cg', desc: '없는설명' }, dialogue('민주', 'b')],
    });
    expect(getFirstEffectiveCgIndex(sc)).toBeNull();
    const p = projectWith([sc], { characters: [heroine()] });
    expect(planOf(p).batch.writable.map((l) => l.i)).toEqual([0, 2]);
  });

  it('CG 마커는 first effective CG 만 · 마지막 window 에만 실린다(orphan 은 안 실림)', () => {
    const p = projectWith(
      [
        scene({
          cg: ['키스'],
          lines: [
            dialogue('민주', 'a'),
            { kind: 'cg', desc: '없는설명' }, // orphan — marker 로 나가면 안 된다
            dialogue('민주', 'b'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans.flatMap((pl) => pl.markers).filter((m) => m.event === 'cg')).toEqual([]);
  });

  it('유효 cutoff 이 있으면 마지막 window 에 경계 sentinel 이 붙는다', () => {
    const p = projectWith(
      [
        scene({
          cg: ['키스'],
          lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), { kind: 'cg', desc: '키스' }],
        }),
      ],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    const last = plans[plans.length - 1];
    expect(last.markers).toContainEqual({ i: 2, event: 'cg' });
  });
});

describe('O11 — hide 는 request-start 상태와 실제 전이를 분리한다', () => {
  it('A. visible 로 시작하면 initialHidden 없음 · synthetic marker 없음', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] })], {
      characters: [heroine()],
    });
    const { plans } = planOf(p);
    expect(plans[0].initialHidden).toBe(false);
    expect(plans[0].markers).toEqual([]);
  });

  it('B. Scene.hideSprites=true 로 계속 숨김 → initialHidden=true, 가짜 hidden marker 없음', () => {
    const p = projectWith(
      [scene({ hideSprites: true, lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] })],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans[0].initialHidden).toBe(true);
    expect(plans[0].markers).toEqual([]); // ← v3 알고리즘이면 여기에 없던 hidden 이 생겼다
  });

  it('C. 이미 숨겨진 구간 한가운데서 시작하는 window 도 가짜 marker 없이 상태만 전달', () => {
    // 첫 줄에서 숨기고 계속 숨긴 채 여러 줄 — 두 번째 window 를 만들려고 긴 텍스트로 청크를 가른다.
    const long = 'ㄱ'.repeat(1800);
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', 'a', { hideSprites: true }),
            dialogue('민주', long),
            dialogue('민주', long),
            dialogue('민주', 'z'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans.length).toBeGreaterThan(1);
    const second = plans[1];
    expect(second.initialHidden).toBe(true);
    expect(second.markers.filter((m) => m.i === second.scan[0].i)).toEqual([]);
  });

  it('D. window 첫 줄에서 visible → hidden 이면 그 줄에 hidden marker', () => {
    const p = projectWith(
      [scene({ lines: [dialogue('민주', 'a', { hideSprites: true }), dialogue('민주', 'b')] })],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans[0].initialHidden).toBe(false);
    expect(plans[0].markers).toEqual([{ i: 0, event: 'hidden' }]);
  });

  it('E. window 첫 줄에서 hidden → shown 이면 initialHidden=true 이고 그 줄에 shown marker', () => {
    // ⚠️ v3 의 prev=false 방식이 통째로 놓치던 회귀 케이스.
    const p = projectWith(
      [
        scene({
          hideSprites: true,
          lines: [dialogue('민주', 'a', { hideSprites: false }), dialogue('민주', 'b')],
        }),
      ],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans[0].initialHidden).toBe(true);
    expect(plans[0].markers).toEqual([{ i: 0, event: 'shown' }]);
  });

  it('F. hide → 숨김 중 전환 → show 의 두 전이가 모두 잡히고 숨김 중 줄도 writable 이다', () => {
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', 'a'),
            narration('민주가 자리를 비웠다', { hideSprites: true }),
            narration('옷을 갈아입는 소리'),
            dialogue('민주', '기다렸지?', { hideSprites: false }),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);
    expect(plans[0].markers).toEqual([
      { i: 1, event: 'hidden' },
      { i: 3, event: 'shown' },
    ]);
    // 숨김 구간의 줄도 정상 target(복원 블록이 그 줄 fold 값을 쓰므로 실제로 새 옷이 나온다)
    expect(batch.writable.map((l) => l.i)).toContain(2);
  });
});

describe('O9 — window 경계와 request-local metadata 절단(look-ahead 금지)', () => {
  const long = 'ㄱ'.repeat(1800);
  /**
   * 짧은 줄 70개 → 줄 수 상한(60)으로 청크가 갈린다(글자 수가 아니라). 그래야 두 번째 window 의
   * lead-in 이 실제로 채워져 경계 검증이 의미가 있다 — 앞줄이 500자를 넘으면 lead-in 은 정상적으로
   * 통째로 잘려 비어버린다(상한 계약대로).
   */
  function multiWindow(): Project {
    const lines: Line[] = Array.from({ length: 70 }, (_, i) => {
      if (i === 65) return dialogue('민주', `m${i}`, { outfits: { 민주: '사복' } }); // 미래의 manual
      if (i === 66) return narration(`n${i}`, { hideSprites: true }); // 미래의 hide
      return dialogue('민주', `s${i}`);
    });
    return projectWith([scene({ lines })], { characters: [heroine()] });
  }

  it('window 는 disjoint 하고 lead-in 은 scan 시작 이전 줄만 담는다', () => {
    const { plans } = planOf(multiWindow());
    expect(plans.length).toBeGreaterThan(1);
    expect(plans[1].leadIn.length).toBeGreaterThan(0); // 두 번째 요청엔 실제로 앞문맥이 실린다
    const seen = new Set<number>();
    for (const pl of plans) {
      for (const l of pl.scan) {
        expect(seen.has(l.i)).toBe(false); // disjoint
        seen.add(l.i);
      }
      for (const l of pl.leadIn) expect(l.i).toBeLessThan(pl.scan[0].i);
      expect(pl.leadIn.length).toBeLessThanOrEqual(10);
      expect(pl.leadIn.reduce((n, l) => n + l.text.length, 0)).toBeLessThanOrEqual(500);
    }
  });

  it('scan 뒤의 미래 manual Line.outfits 는 현재 요청의 fixed 에 안 들어간다', () => {
    const { plans } = planOf(multiWindow());
    for (const pl of plans) {
      const scanEnd = pl.scan[pl.scan.length - 1].i;
      for (const f of pl.fixed) {
        expect(f.i).toBeGreaterThanOrEqual(pl.scan[0].i);
        expect(f.i).toBeLessThanOrEqual(scanEnd);
      }
    }
  });

  it('scan 뒤의 미래 hide/show 는 현재 요청의 markers 에 안 들어간다', () => {
    const { plans } = planOf(multiWindow());
    for (const pl of plans) {
      const scanEnd = pl.scan[pl.scan.length - 1].i;
      const first = (pl.leadIn[0] ?? pl.scan[0]).i;
      for (const m of pl.markers.filter((x) => x.event !== 'cg')) {
        expect(m.i).toBeGreaterThanOrEqual(first);
        expect(m.i).toBeLessThanOrEqual(scanEnd);
      }
    }
  });

  it('lead-in 안의 과거 hide/show 는 정상 포함된다', () => {
    // 59번 줄에서 숨긴다 → 그 줄은 두 번째 window 의 lead-in 에 들어간다(scan 은 60부터).
    const lines: Line[] = Array.from({ length: 70 }, (_, i) =>
      i === 59 ? dialogue('민주', `s${i}`, { hideSprites: true }) : dialogue('민주', `s${i}`),
    );
    const { plans } = planOf(projectWith([scene({ lines })], { characters: [heroine()] }));
    const second = plans[1];
    expect(second.leadIn.some((l) => l.i === 59)).toBe(true);
    expect(second.markers).toContainEqual({ i: 59, event: 'hidden' });
    expect(second.initialHidden).toBe(false); // 그 전이는 이 요청 안에서 일어난다(상태가 아니라 event)
  });

  it('앞줄이 lead-in 글자 상한을 넘으면 lead-in 은 비고, 그래도 미래 metadata 는 안 샌다', () => {
    const p = projectWith(
      [
        scene({
          lines: [dialogue('민주', 'x0'), dialogue('민주', long), dialogue('민주', long), dialogue('민주', 'tail')],
        }),
      ],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans[1].leadIn).toEqual([]); // 1800자 줄은 500자 상한에 걸려 통째로 잘린다
    expect(plans[1].scan[0].i).toBe(2);
  });
});

describe('O10 — currentOutfit 은 outfitFlags 값과 항상 같다(미승인 제안 overlay 없음)', () => {
  it('window 시작 의상이 canonical fold 값과 일치한다', () => {
    const p = projectWith(
      [
        scene({
          outfits: { 민주: '교복' },
          lines: [
            dialogue('민주', 'a'),
            dialogue('민주', 'b', { outfits: { 민주: '사복' } }),
            dialogue('민주', 'c'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);
    const flags = batch.flagsByChar.get('민주')!;
    expect(flags).toEqual(['교복', '사복', '사복']);
    expect(plans[0].characters[0].currentOutfit).toBe(flags[plans[0].scan[0].i]);
  });
});

describe('O18 — outfitSource 우선순위와 currentOutfit 일관성 / 조건부 payload', () => {
  it('A. rule 만 있으면 source=rule', () => {
    const p = projectWith([scene({ background: '해변', lines: [dialogue('민주', 'a')] })], {
      characters: [heroine('민주', ['교복', '수영복'])],
      outfitRules: [{ keyword: '해변', charName: '민주', outfit: '수영복' }],
    });
    const { plans } = planOf(p);
    expect(plans[0].characters[0]).toMatchObject({ currentOutfit: '수영복', outfitSource: 'rule' });
  });

  it('B. Scene.outfits 만 있으면 source=scene-manual', () => {
    const p = projectWith([scene({ outfits: { 민주: '교복' }, lines: [dialogue('민주', 'a')] })], {
      characters: [heroine()],
    });
    const { plans } = planOf(p);
    expect(plans[0].characters[0]).toMatchObject({
      currentOutfit: '교복',
      outfitSource: 'scene-manual',
    });
  });

  it('C. 이전 줄 manual 이 값을 정했으면 Scene.outfits 가 있어도 source=line-manual', () => {
    // ⚠️ outfitFlags 는 줄 override 를 그 줄 index 에 이미 반영하므로 Scene 을 먼저 보면 값과 라벨이 모순된다.
    const long = 'ㄱ'.repeat(1800);
    const p = projectWith(
      [
        scene({
          outfits: { 민주: '교복' },
          lines: [
            dialogue('민주', 'a', { outfits: { 민주: '사복' } }),
            dialogue('민주', long),
            dialogue('민주', long),
            dialogue('민주', 'z'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    const second = plans[1];
    expect(second.characters[0].currentOutfit).toBe('사복');
    expect(second.characters[0].outfitSource).toBe('line-manual');
  });

  it('D. 아무것도 없으면 source=default', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], { characters: [heroine()] });
    expect(planOf(p).plans[0].characters[0]).toMatchObject({
      currentOutfit: '기본',
      outfitSource: 'default',
    });
  });

  it('E. window 시작 줄 자체의 manual 도 값·라벨이 일치하고 fixed 로 보호된다', () => {
    const p = projectWith(
      [scene({ lines: [dialogue('민주', 'a', { outfits: { 민주: '사복' } }), dialogue('민주', 'b')] })],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    expect(plans[0].characters[0]).toMatchObject({
      currentOutfit: '사복',
      outfitSource: 'line-manual',
    });
    expect(plans[0].fixed).toEqual([{ i: 0, character: '민주', outfit: '사복' }]);
  });

  it('시스템 프롬프트가 currentOutfit 을 "window 시작 상태"로 설명한다(영구 금지값 아님)', () => {
    // 전체 프롬프트 스냅샷은 만들지 않는다 — 되살아나면 안 되는 **의미**만 고정한다.
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], { characters: [heroine()] });
    const { plans } = planOf(p);
    const { system } = buildOutfitRequest(plans[0], CTX);
    expect(system).toContain('window-start state, not a ban');
    expect(system).toContain('unchanged at that');
    // 예전의 blanket 금지 문장이 되돌아오면 정상 "되돌아가기" 전환이 통째로 억제된다.
    expect(system).not.toContain('merely repeats');
  });

  it('fixed 가 실릴 때 그 상태가 이후까지 유효하다는 설명이 붙는다', () => {
    const p = projectWith(
      [scene({ lines: [dialogue('민주', 'a', { outfits: { 민주: '사복' } }), dialogue('민주', 'b')] })],
      { characters: [heroine()] },
    );
    const { plans } = planOf(p);
    const { system } = buildOutfitRequest(plans[0], CTX);
    expect(system).toContain('stays in effect from that point onward');
    expect(system).toContain('already reflected in "currentOutfit"'); // 첫 줄 fixed 중복 해석 방지
  });

  it('조건부 키는 비면 payload 에서 통째로 생략된다', () => {
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], { characters: [heroine()] });
    const { plans } = planOf(p);
    const { user } = buildOutfitRequest(plans[0], CTX);
    const parsed = JSON.parse(user);
    expect(parsed).not.toHaveProperty('context');
    expect(parsed).not.toHaveProperty('fixed');
    expect(parsed).not.toHaveProperty('markers');
    expect(parsed).not.toHaveProperty('initialHidden');
    expect(parsed).not.toHaveProperty('synopsis');
    expect(parsed.lines).toHaveLength(1);
  });
});

describe('O4·O6·O7·O21 — 응답 파서의 항목별 거부(추측 보정 없음)', () => {
  function base(): Project {
    return projectWith(
      [scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), dialogue('민주', 'c')] })],
      { characters: [heroine()] },
    );
  }

  it('정상 응답은 후보 원문으로 통과한다', () => {
    const p = base();
    const { batch, plans } = planOf(p);
    const out = parseOutfitResponse(reply([{ i: 1, character: '민주', outfit: '사복', reason: 'ㅇ' }]), plans[0], batch);
    expect(out).toEqual([{ i: 1, character: '민주', outfit: '사복', reason: 'ㅇ' }]);
  });

  it('scan 밖 인덱스·후보 밖 캐릭터·후보 밖 의상·중복은 각각 버린다', () => {
    const p = base();
    const { batch, plans } = planOf(p);
    const out = parseOutfitResponse(
      reply([
        { i: 99, character: '민주', outfit: '사복' }, // 유령 인덱스
        { i: 1, character: '지수', outfit: '사복' }, // 후보 캐릭터 밖
        { i: 1, character: '민주', outfit: '드레스' }, // 후보 의상 밖(새 이름 생성 금지)
        { i: 1, character: '민주', outfit: '사복' }, // 정상
        { i: 1, character: '민주', outfit: '교복' }, // 같은 (i,character) 중복
      ]),
      plans[0],
      batch,
    );
    expect(out).toEqual([{ i: 1, character: '민주', outfit: '사복' }]);
  });

  it('no-op(그 줄의 현재 의상과 같음)은 버린다', () => {
    const p = projectWith(
      [scene({ outfits: { 민주: '교복' }, lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] })],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);
    expect(parseOutfitResponse(reply([{ i: 1, character: '민주', outfit: '교복' }]), plans[0], batch)).toEqual([]);
  });

  it('O4 — 사람이 이미 지정한 (i,character)는 덮지 않는다', () => {
    const p = projectWith(
      [
        scene({
          lines: [dialogue('민주', 'a'), dialogue('민주', 'b', { outfits: { 민주: '교복' } })],
        }),
      ],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);
    expect(parseOutfitResponse(reply([{ i: 1, character: '민주', outfit: '사복' }]), plans[0], batch)).toEqual([]);
  });

  it('O7 — lead-in 인덱스로 답해도 저장되지 않는다(쓰기 경계)', () => {
    // 짧은 줄 70개 → 줄 수 상한으로 청크가 갈려 두 번째 window 에 lead-in 이 실제로 실린다.
    const lines: Line[] = Array.from({ length: 70 }, (_, i) => dialogue('민주', `s${i}`));
    const { batch, plans } = planOf(projectWith([scene({ lines })], { characters: [heroine()] }));
    const second = plans[1];
    expect(second.leadIn.length).toBeGreaterThan(0);
    const leadIdx = second.leadIn[0].i;
    expect(second.scan.some((l) => l.i === leadIdx)).toBe(false);
    expect(parseOutfitResponse(reply([{ i: leadIdx, character: '민주', outfit: '사복' }]), second, batch)).toEqual([]);
  });

  it('O21 — 첫 줄 보호 4갈래: rule/default 허용, scene-manual/line-manual 거부', () => {
    const mk = (patch: Parameters<typeof scene>[0], extra?: Partial<Project>) =>
      projectWith([scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b')], ...patch })], {
        characters: [heroine('민주', ['교복', '사복', '수영복'])],
        ...extra,
      });

    // default → 허용
    let { batch, plans } = planOf(mk({}));
    expect(parseOutfitResponse(reply([{ i: 0, character: '민주', outfit: '사복' }]), plans[0], batch)).toHaveLength(1);

    // rule → 허용
    ({ batch, plans } = planOf(
      mk({ background: '해변' }, { outfitRules: [{ keyword: '해변', charName: '민주', outfit: '수영복' }] }),
    ));
    expect(parseOutfitResponse(reply([{ i: 0, character: '민주', outfit: '사복' }]), plans[0], batch)).toHaveLength(1);

    // scene-manual → 첫 줄 거부(둘째 줄은 허용)
    ({ batch, plans } = planOf(mk({ outfits: { 민주: '교복' } })));
    expect(parseOutfitResponse(reply([{ i: 0, character: '민주', outfit: '사복' }]), plans[0], batch)).toEqual([]);
    expect(parseOutfitResponse(reply([{ i: 1, character: '민주', outfit: '사복' }]), plans[0], batch)).toHaveLength(1);

    // line-manual(첫 줄 자체에 manual) → 거부(O4 와 같은 경로)
    ({ batch, plans } = planOf(
      mk({ lines: [dialogue('민주', 'a', { outfits: { 민주: '교복' } }), dialogue('민주', 'b')] }),
    ));
    expect(parseOutfitResponse(reply([{ i: 0, character: '민주', outfit: '사복' }]), plans[0], batch)).toEqual([]);
  });

  it('fixed 전환 뒤 window 시작 의상으로 되돌아가는 것은 정상 transition 이다(no-op 아님)', () => {
    // ⚠️ currentOutfit 은 window **시작 시점** 상태일 뿐 이 요청 내내 금지되는 값이 아니다.
    // i=1 의 manual(fixed) 전환 때문에 i=2 시점 effective outfit 은 '사복' 이므로 '기본' 으로
    // 되돌아가는 제안은 진짜 변화다. 파서는 window 시작값이 아니라 **그 줄 시점 fold** 로 판정한다.
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', '평소 차림'),
            dialogue('민주', '갈아입고 옴', { outfits: { 민주: '사복' } }),
            narration('민주는 다시 평소 옷으로 갈아입었다'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);

    expect(plans[0].characters[0].currentOutfit).toBe('기본'); // window 시작 상태
    expect(batch.flagsByChar.get('민주')).toEqual(['기본', '사복', '사복']); // i=2 시점은 사복
    expect(plans[0].fixed).toEqual([{ i: 1, character: '민주', outfit: '사복' }]);

    const out = parseOutfitResponse(reply([{ i: 2, character: '민주', outfit: '기본' }]), plans[0], batch);
    expect(out).toEqual([{ i: 2, character: '민주', outfit: '기본' }]);
  });

  it('reason 은 프롬프트 계약과 같은 40자로 잘린다(저장은 안 됨 — 검수 표시 전용)', () => {
    const p = base();
    const { batch, plans } = planOf(p);
    const long = '가'.repeat(120);
    const out = parseOutfitResponse(
      reply([{ i: 1, character: '민주', outfit: '사복', reason: long }]),
      plans[0],
      batch,
    );
    expect(out[0].reason).toHaveLength(40);
    expect(out[0].reason).toBe('가'.repeat(40));
  });

  it('깨진 JSON 은 예외로 알린다(그 요청만 스킵됨)', () => {
    const p = base();
    const { batch, plans } = planOf(p);
    expect(() => parseOutfitResponse('그냥 텍스트', plans[0], batch)).toThrow();
  });
});

// ── Phase 11 · B ────────────────────────────────────────────────────────────
// **같은 응답 안**(= 같은 요청·같은 scan window)의 연쇄 전환만 시간순으로 읽는다. 앞선 전환이
// 사실이라고 가정하면 뒤의 복귀는 진짜 변화다(예전엔 canonical 스냅샷에 독립 판정해 A→B→A 의
// 마지막 A 가 통째로 사라졌다). 가정은 파서 함수 안에서만 살고 **다음 window·store·canonical 로
// 전파되지 않는다** — cross-window 비전파는 아래에서 따로 고정한다.
describe('P11 — 같은 응답 안의 연쇄 전환(response-local chronology)', () => {
  /** 장면 시작 '사복' + 5줄 — P3(사복 → 체육복 → 사복) 형상. */
  function chainProject(outfits = ['사복', '체육복']): Project {
    return projectWith(
      [
        scene({
          outfits: { 민주: '사복' },
          lines: [
            narration('가방을 고쳐 멨다'),
            narration('체육복으로 갈아입고 나갔다'),
            dialogue('민주', '한 바퀴만 뛸게'),
            narration('다시 사복으로 갈아입고 돌아왔다'),
            dialogue('민주', '이제 가자'),
          ],
        }),
      ],
      { characters: [heroine('민주', outfits)] },
    );
  }

  it('A→B→A 두 전환이 모두 남는다(canonical 은 장면 내내 사복이라 예전엔 뒤가 사라졌다)', () => {
    const { batch, plans } = planOf(chainProject());
    expect(batch.flagsByChar.get('민주')).toEqual(['사복', '사복', '사복', '사복', '사복']);

    const out = parseOutfitResponse(
      reply([
        { i: 1, character: '민주', outfit: '체육복' },
        { i: 3, character: '민주', outfit: '사복' },
      ]),
      plans[0],
      batch,
    );
    expect(out).toEqual([
      { i: 1, character: '민주', outfit: '체육복' },
      { i: 3, character: '민주', outfit: '사복' },
    ]);
  });

  it('선행 전환이 없으면 그 복귀는 여전히 canonical no-op 으로 버려진다', () => {
    const { batch, plans } = planOf(chainProject());
    expect(parseOutfitResponse(reply([{ i: 3, character: '민주', outfit: '사복' }]), plans[0], batch)).toEqual([]);
  });

  it('모델이 역순으로 내도 판정은 같고, **반환 순서는 모델 출력 순서 그대로**다', () => {
    const { batch, plans } = planOf(chainProject());
    const out = parseOutfitResponse(
      reply([
        { i: 3, character: '민주', outfit: '사복' },
        { i: 1, character: '민주', outfit: '체육복' },
      ]),
      plans[0],
      batch,
    );
    // 판정: 둘 다 통과(시간순으로 읽었다) / 순서: 모델이 낸 그대로(3 → 1)
    expect(out).toEqual([
      { i: 3, character: '민주', outfit: '사복' },
      { i: 1, character: '민주', outfit: '체육복' },
    ]);
  });

  it('중간의 canonical manual 이 앞선 가정을 끊는다(사람 값이 이긴다)', () => {
    // base '기본' + i=2 에 사람이 '사복' 을 박아 둠 → i=3 시점 canonical 은 이미 사복이다.
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', 'a'),
            dialogue('민주', 'b'),
            dialogue('민주', 'c', { outfits: { 민주: '사복' } }),
            dialogue('민주', 'd'),
          ],
        }),
      ],
      { characters: [heroine('민주', ['사복', '체육복'])] },
    );
    const { batch, plans } = planOf(p);
    expect(batch.flagsByChar.get('민주')).toEqual(['기본', '기본', '사복', '사복']);

    const out = parseOutfitResponse(
      reply([
        { i: 1, character: '민주', outfit: '체육복' },
        { i: 3, character: '민주', outfit: '사복' }, // manual 로 이미 사복 → 진짜 no-op
      ]),
      plans[0],
      batch,
    );
    expect(out).toEqual([{ i: 1, character: '민주', outfit: '체육복' }]);
  });

  it('manual 뒤에 새로 통과한 전환은 다시 기준이 된다(manual 은 앞 가정만 끊는다)', () => {
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', 'a'),
            dialogue('민주', 'b'),
            dialogue('민주', 'c', { outfits: { 민주: '사복' } }),
            dialogue('민주', 'd'),
            dialogue('민주', 'e'),
            dialogue('민주', 'f'),
          ],
        }),
      ],
      { characters: [heroine('민주', ['사복', '체육복', '교복'])] },
    );
    const { batch, plans } = planOf(p);

    const out = parseOutfitResponse(
      reply([
        { i: 1, character: '민주', outfit: '체육복' }, // 가정 ①
        { i: 3, character: '민주', outfit: '교복' }, // manual(i=2)이 ①을 끊음 → 사복 기준, 교복은 변화
        { i: 5, character: '민주', outfit: '사복' }, // 교복 기준 → 사복 복귀는 진짜 변화
      ]),
      plans[0],
      batch,
    );
    expect(out.map((c) => `${c.i}:${c.outfit}`)).toEqual(['1:체육복', '3:교복', '5:사복']);
  });

  it('가정은 캐릭터별로 독립이다', () => {
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', 'a'),
            dialogue('지수', 'b'),
            dialogue('민주', 'c'),
            dialogue('민주', 'd'),
          ],
        }),
      ],
      { characters: [heroine('민주', ['사복', '체육복']), heroine('지수', ['사복', '체육복'])] },
    );
    const { batch, plans } = planOf(p);

    // 지수의 전환은 민주의 기준을 바꾸지 않는다 → 민주 '기본' 제안은 canonical no-op 그대로.
    expect(
      parseOutfitResponse(
        reply([
          { i: 1, character: '지수', outfit: '체육복' },
          { i: 2, character: '민주', outfit: '기본' },
        ]),
        plans[0],
        batch,
      ),
    ).toEqual([{ i: 1, character: '지수', outfit: '체육복' }]);

    // 반대로 민주 자신의 전환 뒤 복귀는 통과한다.
    expect(
      parseOutfitResponse(
        reply([
          { i: 1, character: '민주', outfit: '체육복' },
          { i: 3, character: '민주', outfit: '기본' },
        ]),
        plans[0],
        batch,
      ),
    ).toHaveLength(2);
  });

  it('거부된 항목은 가정을 전진시키지 않는다(유령 인덱스·후보 밖)', () => {
    const { batch, plans } = planOf(chainProject());
    const out = parseOutfitResponse(
      reply([
        { i: 99, character: '민주', outfit: '체육복' }, // B — scan 밖
        { i: 1, character: '민주', outfit: '드레스' }, // D — 후보 밖
        { i: 3, character: '민주', outfit: '사복' }, // 앞 두 개가 전제가 됐다면 통과했을 것
      ]),
      plans[0],
      batch,
    );
    expect(out).toEqual([]);
  });

  it('사람이 선점한 자리(E)의 거부도 가정을 전진시키지 않는다', () => {
    const p = projectWith(
      [
        scene({
          outfits: { 민주: '사복' },
          lines: [
            dialogue('민주', 'a'),
            dialogue('민주', 'b', { outfits: { 민주: '사복' } }), // 사람이 '사복' 을 못 박음
            dialogue('민주', 'c'),
          ],
        }),
      ],
      { characters: [heroine('민주', ['사복', '체육복'])] },
    );
    const { batch, plans } = planOf(p);
    const out = parseOutfitResponse(
      reply([
        { i: 1, character: '민주', outfit: '체육복' }, // E 로 거부(그 자리는 사람 값)
        { i: 2, character: '민주', outfit: '사복' }, // 위가 전제였다면 복귀로 통과했을 것
      ]),
      plans[0],
      batch,
    );
    expect(out).toEqual([]);
  });

  it('같은 (i,character) 중복은 먼저 낸 유효 항목이 이기고, 거부된 중복은 가정을 덮지 않는다', () => {
    const { batch, plans } = planOf(chainProject(['사복', '체육복', '교복']));
    const out = parseOutfitResponse(
      reply([
        { i: 1, character: '민주', outfit: '체육복' }, // 유효
        { i: 1, character: '민주', outfit: '교복' }, // C2 중복 → 거부
        { i: 3, character: '민주', outfit: '체육복' }, // 가정이 '교복' 으로 덮였다면 통과했을 것
      ]),
      plans[0],
      batch,
    );
    expect(out).toEqual([{ i: 1, character: '민주', outfit: '체육복' }]);
  });

  it('window 사이에는 가정이 전달되지 않는다(cross-window 비전파)', () => {
    const lines: Line[] = Array.from({ length: 70 }, (_, i) => dialogue('민주', `s${i}`));
    const { batch, plans } = planOf(
      projectWith([scene({ lines })], { characters: [heroine('민주', ['사복', '체육복'])] }),
    );
    expect(plans.length).toBeGreaterThan(1);

    // window 1 에서 '체육복' 전환이 통과해도…
    expect(
      parseOutfitResponse(reply([{ i: 1, character: '민주', outfit: '체육복' }]), plans[0], batch),
    ).toHaveLength(1);

    // …window 2 의 기준은 여전히 canonical('기본')이라 '기본' 복귀 제안은 no-op 이다.
    const second = plans[1];
    expect(second.characters[0].currentOutfit).toBe('기본'); // 계획 쪽도 canonical 만 본다
    const i2 = second.scan[1].i;
    expect(parseOutfitResponse(reply([{ i: i2, character: '민주', outfit: '기본' }]), second, batch)).toEqual([]);
  });

  it('망가진 항목은 예전처럼 조용히 무시된다(정렬 때문에 예외가 나면 안 된다)', () => {
    const { batch, plans } = planOf(chainProject());
    const raw = JSON.stringify({
      changes: [
        null,
        42,
        '문자열',
        [],
        {},
        { i: 'abc', character: '민주', outfit: '체육복' },
        { i: 1, character: '민주', outfit: '체육복' },
      ],
    });
    expect(parseOutfitResponse(raw, plans[0], batch)).toEqual([{ i: 1, character: '민주', outfit: '체육복' }]);
    // changes 자체가 배열이 아니면 빈 결과(예외 아님)
    expect(parseOutfitResponse(JSON.stringify({ changes: null }), plans[0], batch)).toEqual([]);
  });
});

// ── Phase 13 · S(semantic kind gate) ─────────────────────────────────────────
// wire 의 `changes[]` 가 **semantic candidate envelope** 이 됐다: 모델은 전환으로 오인될 만한 후보를
// 내고 각 행에 `kind`("transition" | "non_transition")로 스스로 라벨한다. 파서는 그중
// **non_transition 만** 추가로 거른다(S). 넓어진 건 semantic 경계뿐이라 structural 게이트(B~G)는
// 그대로이고, 이 블록은 **모델의 semantic 정확도가 아니라 파서 계약**만 잰다.
//
// ⚠️ 위 O4/O6/O7/O21·P11 블록은 전부 `kind` 없는 응답이다 — 그게 무수정으로 통과하는 것 자체가
//    "missing kind → legacy accept" 회귀 테스트다(여기서 명시적으로 한 번 더 못 박는다).
describe('P13 — kind semantic gate(S): fail-open · 정규화 · 게이트 위치', () => {
  /** 장면 내내 '기본' 인 3줄짜리 기본형(제안 1건이 정상 통과하는 형상). */
  function base(): Project {
    return projectWith(
      [scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), dialogue('민주', 'c')] })],
      { characters: [heroine()] },
    );
  }
  /** 같은 행을 kind 만 바꿔 던진다 — 통과/거부 차이가 곧 S 의 효과다. */
  function withKind(kind: unknown) {
    const { batch, plans } = planOf(base());
    return parseOutfitResponse(
      reply([{ i: 1, character: '민주', outfit: '사복', kind }]),
      plans[0],
      batch,
    );
  }
  const accepted = [{ i: 1, character: '민주', outfit: '사복' }];

  it('A — fail-open: kind 가 없으면 예전처럼 통과한다', () => {
    const { batch, plans } = planOf(base());
    expect(
      parseOutfitResponse(reply([{ i: 1, character: '민주', outfit: '사복' }]), plans[0], batch),
    ).toEqual(accepted);
    expect(withKind(undefined)).toEqual(accepted); // 키가 있어도 값이 undefined 면 JSON 에서 사라진다
  });

  it('A — fail-open: 모르는 문자열을 non_transition 으로 넘겨짚지 않는다(semantic fuzzy 금지)', () => {
    const unknowns = [
      'completed_transition',
      'transition-ish',
      'non-transition',
      'not_transition',
      'non transition',
      '',
    ];
    for (const k of unknowns) expect(withKind(k), `kind=${JSON.stringify(k)}`).toEqual(accepted);
  });

  it('A — fail-open: 타입이 틀리면(null·number·object·array) 통과한다', () => {
    const wrong: unknown[] = [null, 0, 1, {}, [], { kind: 'non_transition' }, ['non_transition']];
    for (const k of wrong) expect(withKind(k), `kind=${JSON.stringify(k)}`).toEqual(accepted);
  });

  it('B — known 값은 대소문자·앞뒤 공백만 정규화해 두 토큰과 exact 로 맞춘다', () => {
    for (const k of ['transition', 'Transition', 'TRANSITION', '  transition  ']) {
      expect(withKind(k), `kind=${JSON.stringify(k)}`).toEqual(accepted);
    }
    for (const k of ['non_transition', 'NON_TRANSITION', ' Non_Transition ']) {
      expect(withKind(k), `kind=${JSON.stringify(k)}`).toEqual([]);
    }
  });

  it('B — kind 정규화가 identity 로 새지 않는다(캐릭터·의상은 lowercase 하지 않는다)', () => {
    // ⚠️ lowercase 는 kind 축에만 있다. 같은 정규화를 identity 에 쓰면 'Casual' 과 'casual' 이 같아져
    //    canonical exact match 계약이 깨진다.
    const p = projectWith([scene({ lines: [dialogue('Mina', 'a'), dialogue('Mina', 'b')] })], {
      characters: [heroine('Mina', ['Casual', 'Uniform'])],
    });
    const { batch, plans } = planOf(p);
    const run = (row: Record<string, unknown>) => parseOutfitResponse(reply([row]), plans[0], batch);

    expect(run({ i: 1, character: 'Mina', outfit: 'casual', kind: 'transition' })).toEqual([]); // 의상 → D
    expect(run({ i: 1, character: 'mina', outfit: 'Casual', kind: 'transition' })).toEqual([]); // 캐릭터 → C
    expect(run({ i: 1, character: 'Mina', outfit: 'Casual', kind: 'transition' })).toEqual([
      { i: 1, character: 'Mina', outfit: 'Casual' },
    ]);
  });

  it('B — i 는 기존 numeric coercion 그대로다(숫자 문자열 허용 · 그 외 거부)', () => {
    const { batch, plans } = planOf(base());
    const run = (i: unknown) =>
      parseOutfitResponse(
        reply([{ i, character: '민주', outfit: '사복', kind: 'transition' }]),
        plans[0],
        batch,
      );
    expect(run('1')).toEqual(accepted); // {"i":"60"} 이 60 으로 읽히는 그 계약
    expect(run(1)).toEqual(accepted);
    expect(run('abc')).toEqual([]);
    expect(run(99)).toEqual([]); // scan 밖
  });

  it('C — known semantic FP 3종 모양은 non_transition 라벨이 붙을 때만 사라진다', () => {
    // ⚠️ 모델이 그 라벨을 실제로 잘 붙이는지는 여기서 증명하지 않는다(live PRIMARY 의 몫).
    //    고정하는 건 "라벨이 오면 파서가 정확히 그것만 뺀다"는 계약이다.
    const shapes: { id: string; lines: Line[] }[] = [
      { id: 'N1 구매/소유', lines: [dialogue('민주', 'a'), narration('민주는 새 사복을 한 벌 샀다')] },
      { id: 'N3 미래 의도', lines: [dialogue('민주', 'a'), dialogue('민주', '이따 사복으로 갈아입을게')] },
      { id: 'N4 타 캐릭터 화제', lines: [dialogue('민주', 'a'), dialogue('민주', '지수 사복 예쁘더라')] },
    ];
    for (const s of shapes) {
      const { batch, plans } = planOf(
        projectWith([scene({ lines: s.lines })], { characters: [heroine()] }),
      );
      const row = { i: 1, character: '민주', outfit: '사복' };
      // 라벨이 없으면 통과한다 = 이 행을 없앤 건 오직 S 다(structural 게이트가 아니다).
      expect(parseOutfitResponse(reply([row]), plans[0], batch), s.id).toHaveLength(1);
      expect(
        parseOutfitResponse(reply([{ ...row, kind: 'non_transition' }]), plans[0], batch),
        s.id,
      ).toEqual([]);
    }
  });

  it('C/D — P12 경계: 59(미래 의도)는 S 로 빠지고 60(완료)은 자기 window 에서 살아남는다', () => {
    // 70줄 → window0 = 0..59, window1 = 60..69. 59 는 window0 scan 의 마지막 줄이고 완료를 확인하는
    // 60 은 **다른 요청**이다(look-ahead 금지) — 두 행은 서로 다른 응답으로 들어온다.
    const lines: Line[] = Array.from({ length: 70 }, (_, i) => dialogue('민주', `s${i}`));
    const { batch, plans } = planOf(projectWith([scene({ lines })], { characters: [heroine()] }));
    expect(plans[0].scan[plans[0].scan.length - 1].i).toBe(59);
    expect(plans[1].scan[0].i).toBe(60);

    // P12-59 — window0 의 마지막 줄에 붙은 미래 의도 후보
    expect(
      parseOutfitResponse(
        reply([{ i: 59, character: '민주', outfit: '사복', kind: 'non_transition' }]),
        plans[0],
        batch,
      ),
    ).toEqual([]);
    // P12-60 — owner window(=window1)의 실제 완료 전환은 그대로 통과
    expect(
      parseOutfitResponse(
        reply([{ i: 60, character: '민주', outfit: '사복', kind: 'transition' }]),
        plans[1],
        batch,
      ),
    ).toEqual([{ i: 60, character: '민주', outfit: '사복' }]);
  });

  it('D — P10 형상: 한 줄이 여러 캐릭터의 전환을 완료시키면 member 별 행이 모두 남는다', () => {
    const p = projectWith(
      [
        scene({
          lines: [dialogue('민주', 'a'), narration('둘 다 체육복으로 갈아입고 나왔다'), dialogue('지수', 'b')],
        }),
      ],
      { characters: [heroine('민주', ['사복', '체육복']), heroine('지수', ['사복', '체육복'])] },
    );
    const { batch, plans } = planOf(p);
    expect(
      parseOutfitResponse(
        reply([
          { i: 1, character: '민주', outfit: '체육복', kind: 'transition' },
          { i: 1, character: '지수', outfit: '체육복', kind: 'transition' },
        ]),
        plans[0],
        batch,
      ),
    ).toEqual([
      { i: 1, character: '민주', outfit: '체육복' },
      { i: 1, character: '지수', outfit: '체육복' },
    ]);
  });

  it('D — P4 형상: fixed 전환 뒤의 실제 복귀 전환은 transition 라벨로도 그대로 남는다', () => {
    const p = projectWith(
      [
        scene({
          lines: [
            dialogue('민주', '평소 차림'),
            dialogue('민주', '갈아입고 옴', { outfits: { 민주: '사복' } }),
            narration('민주는 다시 평소 옷으로 갈아입었다'),
          ],
        }),
      ],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);
    expect(
      parseOutfitResponse(
        reply([{ i: 2, character: '민주', outfit: '기본', kind: 'transition' }]),
        plans[0],
        batch,
      ),
    ).toEqual([{ i: 2, character: '민주', outfit: '기본' }]);
  });

  it('F — S 는 seen 을 소비하지 않는다(같은 (i,character)의 뒤 행이 다시 심사된다)', () => {
    const { batch, plans } = planOf(base());
    expect(
      parseOutfitResponse(
        reply([
          { i: 1, character: '민주', outfit: '사복', kind: 'non_transition' }, // S 거부 — dupKey 를 안 먹는다
          { i: 1, character: '민주', outfit: '사복', kind: 'transition' }, // 그래서 이 행이 살아난다
        ]),
        plans[0],
        batch,
      ),
    ).toEqual(accepted);
  });

  it('F — S 는 가정 연대기를 전진시키지 않는다(반환 직전 filter 로 만들면 여기서 깨진다)', () => {
    // canonical 은 장면 내내 '기본'. i=1 의 '사복' 후보가 **연대기에 반영되면** i=2 의 '기본' 복귀가
    // 진짜 변화가 돼 통과해버린다. S 를 루프 안에서 거르면 전제가 안 생겨 i=2 는 canonical no-op(G)이다.
    const { batch, plans } = planOf(base());
    expect(
      parseOutfitResponse(
        reply([
          { i: 1, character: '민주', outfit: '사복', kind: 'non_transition' },
          { i: 2, character: '민주', outfit: '기본', kind: 'transition' },
        ]),
        plans[0],
        batch,
      ),
    ).toEqual([]);

    // 대조군 — 앞 행이 transition 이면 Phase 11 연쇄 계약대로 둘 다 남는다(연대기 자체는 살아 있다).
    expect(
      parseOutfitResponse(
        reply([
          { i: 1, character: '민주', outfit: '사복', kind: 'transition' },
          { i: 2, character: '민주', outfit: '기본', kind: 'transition' },
        ]),
        plans[0],
        batch,
      ),
    ).toEqual([
      { i: 1, character: '민주', outfit: '사복' },
      { i: 2, character: '민주', outfit: '기본' },
    ]);
  });

  it('F — S 는 G 뒤에 있다(no-op 은 kind 와 무관하게 G 가 먼저 거른다)', () => {
    const p = projectWith(
      [scene({ outfits: { 민주: '교복' }, lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] })],
      { characters: [heroine()] },
    );
    const { batch, plans } = planOf(p);
    expect(
      parseOutfitResponse(
        reply([{ i: 1, character: '민주', outfit: '교복', kind: 'transition' }]),
        plans[0],
        batch,
      ),
    ).toEqual([]);
  });

  it('F — 반환 순서는 여전히 모델 출력 순서다(S 가 섞여도 재정렬하지 않는다)', () => {
    const { batch, plans } = planOf(base());
    const out = parseOutfitResponse(
      reply([
        { i: 2, character: '민주', outfit: '교복', kind: 'transition' },
        { i: 1, character: '민주', outfit: '교복', kind: 'non_transition' }, // S 거부
        { i: 0, character: '민주', outfit: '사복', kind: 'transition' },
      ]),
      plans[0],
      batch,
    );
    // 판정은 i 오름차순(0 이 먼저 통과해 기준이 '사복' 이 된다), 반환은 모델이 낸 순서(2 → 0).
    expect(out).toEqual([
      { i: 2, character: '민주', outfit: '교복' },
      { i: 0, character: '민주', outfit: '사복' },
    ]);
  });

  it('G — 프롬프트가 candidate + kind 계약을 담고, 옛 transition-only 지시는 사라졌다', () => {
    // 전체 스냅샷은 만들지 않는다(overfit) — **의미**만 고정한다.
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], { characters: [heroine()] });
    const { plans } = planOf(p);
    const { system } = buildOutfitRequest(plans[0], CTX);

    expect(system).toContain('"kind"');
    expect(system).toContain('"transition"');
    expect(system).toContain('"non_transition"');
    expect(system).toContain('candidate');
    expect(system).toContain('do not withhold an eligible candidate'); // 불확실 → 억제 금지(Phase 11 A 반복 방지)
    expect(system).toContain('one candidate per character'); // P10 member 보호
    // 옛 transition-only reporting 지시(= candidate envelope 과 competing instruction)
    expect(system).not.toContain('your only job is to find');
    expect(system).not.toContain('should return few or NO changes');
    expect(system).not.toContain('If nothing in the text states an outfit change');
  });

  it('G — candidate **개수** 에 대한 sparsity prior 가 없다(억제 압력 재유입 방지)', () => {
    // ⚠️ "transition 은 드물다"는 classification 설명이지 "행을 적게 내라"는 지시가 아니다.
    //    후자를 넣으면 Phase 11 A 와 같은 raw omission 회귀가 다시 생긴다.
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], { characters: [heroine()] });
    const { plans } = planOf(p);
    const { system } = buildOutfitRequest(plans[0], CTX);
    for (const banned of ['SPARSE', 'sparse', 'most requests', 'few candidates', 'rare']) {
      expect(system, `금지된 sparsity prior: ${banned}`).not.toContain(banned);
    }
  });

  it('G — candidate 의 i 의미가 kind 별로 분리돼 있다(non_transition 은 미래 줄을 지어내지 않는다)', () => {
    // 구매·미래 의도·타 캐릭터 언급 후보에는 "그 옷이 적용되기 시작하는 줄"이 없다.
    const p = projectWith([scene({ lines: [dialogue('민주', 'a')] })], { characters: [heroine()] });
    const { plans } = planOf(p);
    const { system } = buildOutfitRequest(plans[0], CTX);
    expect(system).toContain('the line from which the completed change takes effect'); // transition
    expect(system).toContain('the line holding that misleading outfit evidence'); // non_transition
    expect(system).toContain('never invent a future line');
    expect(system).toContain('an index that appears in "lines"'); // structural 제한은 그대로
    // 옛 문장(모든 후보에 "적용 시작 줄"을 요구)이 되살아나면 안 된다.
    expect(system).not.toContain('Place a candidate at the line from which that outfit would apply');
  });

  it('G — structural 지시는 그대로 살아 있다(candidate 용어로 바꿔도 의미 보존)', () => {
    const lines: Line[] = Array.from({ length: 70 }, (_, i) =>
      i === 3 ? dialogue('민주', `s${i}`, { outfits: { 민주: '사복' } }) : dialogue('민주', `s${i}`),
    );
    const p = projectWith([scene({ outfits: { 민주: '교복' }, lines })], { characters: [heroine()] });
    const { plans } = planOf(p);
    const { system } = buildOutfitRequest(plans[0], CTX); // fixed + scene-manual 이 함께 실리는 window
    expect(plans[0].fixed.length).toBeGreaterThan(0);

    expect(system).toContain('ONLY for characters listed'); // candidate character 제한
    expect(system).toContain('EXACTLY from that character'); // exact outfit 제한
    expect(system).toContain('an index that appears in "lines"'); // writable scan 제한
    expect(system).toContain('unchanged at that'); // canonical no-op 회피
    expect(system).toContain('stays in effect from that point onward'); // fixed/manual authoritative
    expect(system).toContain('already reflected in "currentOutfit"');
    expect(system).toContain('do NOT report a candidate for them on the very first line'); // scene-start 보호
    expect(system).toContain('window-start state, not a ban');

    // lead-in 이 실리는 window 에는 context 인덱스 결과 금지가 붙는다.
    expect(buildOutfitRequest(plans[1], CTX).system).toContain(
      'NEVER output a result for a "context" index',
    );
  });

  // ── Phase 13 correction · fixed 계약 ────────────────────────────────────
  // PRIMARY Run 1 에서 P4(작가 manual 뒤의 실제 전환)가 raw 에서 사라졌다 — 모델이 **fixed 줄 자체**를
  // 후보로 내고(파서가 E 로 거부) 정답 줄을 건너뛴 형태였다. 두 축을 프롬프트에 못 박는다:
  // ① fixed 행은 candidate universe 밖 ② fixed 이후의 실제 전환은 **복귀든 아니든** 보호.
  // ⚠️ 이 블록은 `fixed` 가 실린 요청에만 해당한다(조건부 블록).

  /** 1번 줄에 작가 manual 이 있는 P4 형상(기본 → fixed 체육복 → 사복 = 복귀가 아닌 이후 전환). */
  function fixedProject(): Project {
    return projectWith(
      [
        scene({
          lines: [
            narration('체육관 안은 후텁지근했다'),
            narration('민주는 체육복으로 갈아입고 돌아왔다', { outfits: { 민주: '체육복' } }),
            dialogue('주인공', '수고했어'),
            narration('수업이 끝나자 민주는 사복으로 갈아입고 교문 앞에 섰다'),
            dialogue('민주', '기다렸어?'), // 후보 자격은 "그 장면 화자"라 대사 줄이 필요하다
          ],
        }),
      ],
      { characters: [heroine('민주', ['사복', '체육복'])] },
    );
  }

  it('H — fixed 행은 "authoritative context, not an AI candidate" 로 후보에서 제외된다', () => {
    const { plans } = planOf(fixedProject());
    expect(plans[0].fixed).toEqual([{ i: 1, character: '민주', outfit: '체육복' }]);
    const { system } = buildOutfitRequest(plans[0], CTX);

    expect(system).toContain('authoritative context, not an AI candidate');
    // 명시적 완료 서술이어도 제외된다는 단서 — 이게 없으면 envelope 상위 문장과 경쟁한다.
    expect(system).toContain('even when that line explicitly describes a completed outfit change');
    // fixed 를 semantic non_transition 으로 재분류하라는 뜻이 아니다(실제 전환이되 AI 후보가 아닐 뿐).
    expect(system).not.toContain('fixed" entry is "non_transition');
    // 기존 의미도 살아 있어야 한다.
    expect(system).toContain('stays in effect from that point onward');
    expect(system).toContain('already reflected in "currentOutfit"');
  });

  it('H — fixed 이후의 실제 전환은 복귀가 아니어도 보호된다(P5 복귀 단서는 유지)', () => {
    const { plans } = planOf(fixedProject());
    const { system } = buildOutfitRequest(plans[0], CTX);

    expect(system).toContain('Keep reading the lines after a "fixed" entry');
    expect(system).toContain('its own "transition" candidate');
    // P5(복귀) 보호가 사라지면 안 되고, P4(비복귀)도 포함돼야 한다.
    expect(system).toContain('includes, but is not limited to, a return to the window-start');
    // 이후의 **모든** 의상 언급이 후보가 되지 않도록 조건이 남아 있어야 한다.
    expect(system).toContain('completes another outfit transition');
    // 복귀에만 걸려 있던 옛 문장이 되살아나면 P4 안전망이 다시 사라진다.
    expect(system).not.toContain('Because of an intervening');
  });

  it('H — FIXED_RULE 은 조건부다(fixed 없는 요청의 프롬프트는 이 블록을 받지 않는다)', () => {
    // blast radius 고정 — 이번 보정이 manual 을 안 쓴 장면의 프롬프트를 바꾸지 않는다는 계약.
    const withFixed = buildOutfitRequest(planOf(fixedProject()).plans[0], CTX).system;
    const plain = projectWith([scene({ lines: [dialogue('민주', 'a'), dialogue('민주', 'b')] })], {
      characters: [heroine()],
    });
    const { plans } = planOf(plain);
    expect(plans[0].fixed).toEqual([]);
    const without = buildOutfitRequest(plans[0], CTX).system;

    expect(withFixed).toContain('authoritative context, not an AI candidate');
    expect(without).not.toContain('authoritative context, not an AI candidate');
    expect(without).not.toContain('Keep reading the lines after a "fixed" entry');
    expect(without).not.toContain('"fixed"');
  });
});
