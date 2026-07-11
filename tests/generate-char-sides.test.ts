import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, charIdMap } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene, type Character } from '../src/types';

function charWithSprite(name: string, side?: 'left' | 'right' | 'auto'): Character {
  return {
    name,
    color: '#ffffff',
    expressions: { 기본: `${name}-asset` }, // opt-in 스프라이트(비어있으면 resolveSprites가 제외)
    ...(side ? { side } : {}),
  };
}

function sceneWithSpeakers(speakers: string[]): Scene {
  return {
    id: 's1',
    title: '장면1',
    direction: [],
    cg: [],
    lines: speakers.map((sp) => ({ kind: 'dialogue' as const, speaker: sp, text: '대사' })),
    choices: [],
    status: 'approved',
  };
}

function projectWith(characters: Character[], scenes: Scene[]): Project {
  return { ...emptyProject(), characters, scenes };
}

function xpctOf(script: string, charId: string): number {
  const m = script.match(new RegExp(`show ${charId} \\S+ \\S+ at vn_char\\((\\d+(?:\\.\\d+)?)\\)`));
  if (!m) throw new Error(`${charId} 의 vn_char 위치를 못 찾음`);
  return Number(m[1]);
}

describe('generateRenpyFiles: 캐릭터 좌우 고정 위치', () => {
  it('side 미지정(auto)이면 기존처럼 등장 순서대로 좌→우 배치', () => {
    const A = charWithSprite('A');
    const B = charWithSprite('B');
    const project = projectWith([A, B], [sceneWithSpeakers(['A', 'B'])]);
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const s = files.find((f) => f.path === 'game/script.rpy')!.content;
    expect(xpctOf(s, ids.get('A')!)).toBeLessThan(xpctOf(s, ids.get('B')!));
  });

  it('side 지정은 등장 순서를 무시하고 항상 그 위치로 고정된다', () => {
    // A(오른쪽 고정)가 먼저 말하고 B(왼쪽 고정)가 나중에 말해도, 순서와 무관하게 B가 왼쪽.
    const A = charWithSprite('A', 'right');
    const B = charWithSprite('B', 'left');
    const project = projectWith([A, B], [sceneWithSpeakers(['A', 'B'])]);
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const s = files.find((f) => f.path === 'game/script.rpy')!.content;
    expect(xpctOf(s, ids.get('B')!)).toBeLessThan(xpctOf(s, ids.get('A')!));
  });

  it('혼자 등장하면 side 와 무관하게 항상 중앙(50)', () => {
    const A = charWithSprite('A', 'left');
    const project = projectWith([A], [sceneWithSpeakers(['A'])]);
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const s = files.find((f) => f.path === 'game/script.rpy')!.content;
    expect(xpctOf(s, ids.get('A')!)).toBe(50);
  });

  it('혼자 있다가 2번째가 등장하면, 먼저 있던 캐릭터가 고정 위치로 스냅 이동한다', () => {
    // A(왼쪽 고정)가 먼저 두 줄 혼자 말하고(그동안 중앙), B(오른쪽 고정)가 나중에 등장.
    const A = charWithSprite('A', 'left');
    const B = charWithSprite('B', 'right');
    const scene: Scene = {
      id: 's1',
      title: '장면1',
      direction: [],
      cg: [],
      lines: [
        { kind: 'dialogue', speaker: 'A', text: '혼자 있을 때' },
        { kind: 'dialogue', speaker: 'A', text: '아직 혼자' },
        { kind: 'dialogue', speaker: 'B', text: '이제 등장' },
      ],
      choices: [],
      status: 'approved',
    };
    const project = projectWith([A, B], [scene]);
    const ids = charIdMap(project);
    const aId = ids.get('A')!;
    const bId = ids.get('B')!;
    const { files } = generateRenpyFiles(project);
    const s = files.find((f) => f.path === 'game/script.rpy')!.content;

    // A의 첫 등장은 중앙(50).
    const firstShowIdx = s.indexOf(`show ${aId} `);
    expect(firstShowIdx).toBeGreaterThan(-1);
    expect(s.slice(firstShowIdx, firstShowIdx + 80)).toContain('at vn_char(50)');

    // B가 등장하기 전, A를 고정 위치(왼쪽 슬롯)로 재배치하는 속성 없는 show 가 있어야 한다.
    const bFirstShowIdx = s.indexOf(`show ${bId} `);
    expect(bFirstShowIdx).toBeGreaterThan(-1);
    const reposIdx = s.indexOf(`show ${aId} at vn_char(`, firstShowIdx + 1);
    expect(reposIdx).toBeGreaterThan(-1);
    expect(reposIdx).toBeLessThan(bFirstShowIdx);

    // 재배치 후엔 A(왼쪽)가 B(오른쪽)보다 작은 xpct.
    const reposMatch = s.slice(reposIdx, reposIdx + 40).match(/at vn_char\((\d+)\)/)!;
    const bMatch = s.slice(bFirstShowIdx, bFirstShowIdx + 80).match(/at vn_char\((\d+)\)/)!;
    expect(Number(reposMatch[1])).toBeLessThan(Number(bMatch[1]));
    expect(Number(reposMatch[1])).not.toBe(50); // 더 이상 중앙이 아님
  });
});
