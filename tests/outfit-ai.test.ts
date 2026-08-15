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
