// ScenePlayer(미리보기)의 캐릭터 배치가 실제 생성기(generate.ts scriptBody)와 일치하는지 검증한다.
// 예전엔 ScenePlayer 가 spreadPositions 를 "장면 전체 등장 순서"로 1회만 호출해 Character.side
// (좌우 고정)를 완전히 무시했다 — side:'right' 로 고정한 캐릭터가 미리보기에선 왼쪽에, 실제로
// 내보낸 게임에선 오른쪽에 서는 불일치가 있었다(CLAUDE.md 의 "생성기·미리보기 두 구현이 어긋나면
// 안 된다"는 함정과 같은 종류). 지금은 두 쪽이 export 된 arrangePositions 하나를 공유하고,
// ScenePlayer 쪽 순수 로직은 computeStagePositions 로 뽑아 React 없이 테스트한다.

import { describe, expect, it } from 'vitest';
import { computeStagePositions } from '../src/components/ScenePlayer';
import { generateRenpyFiles, charIdMap } from '../src/renpy/generate';
import { emptyProject, type Character, type Scene, type Project } from '../src/types';

/** 스프라이트를 opt-in 한(=화면에 세워지는) 캐릭터. side 만 케이스별로 다르게 준다. */
function sprited(name: string, side: Character['side']): Character {
  return { name, color: '#ffffff', expressions: { 기본: `asset-${name}` }, side };
}

function dialogueScene(): Scene {
  return {
    id: 's1',
    title: '장면1',
    direction: [],
    cg: [],
    lines: [
      { kind: 'dialogue', speaker: '민주', text: '혼자 등장' },
      { kind: 'dialogue', speaker: '우측', text: '두번째로 등장(side:right)' },
      { kind: 'dialogue', speaker: '좌측', text: '세번째로 등장(side:left)' },
    ],
    choices: [],
    status: 'approved',
  };
}

describe('computeStagePositions — ScenePlayer 미리보기가 generate.ts scriptBody 와 같은 배치를 내는지', () => {
  const scene = dialogueScene();
  // 등장 순서: 민주(auto) → 우측(right) → 좌측(left).
  const characters: Character[] = [sprited('민주', 'auto'), sprited('우측', 'right'), sprited('좌측', 'left')];

  it('혼자 등장한 시점(0번째 줄)엔 side 와 무관하게 항상 중앙(50)', () => {
    const pos = computeStagePositions(scene, characters, 0, -1);
    expect(pos.get('민주')).toBe(50);
    expect(pos.size).toBe(1);
  });

  it('두 번째 캐릭터(side:right)가 등장하면 오른쪽 슬롯(70)으로, 기존 캐릭터는 왼쪽(30)으로 스냅', () => {
    const pos = computeStagePositions(scene, characters, 1, -1);
    expect(pos.get('민주')).toBe(30);
    expect(pos.get('우측')).toBe(70);
  });

  it('세 번째 캐릭터(side:left)가 등장하면 좌/우 고정 캐릭터가 양끝, auto 는 가운데로 재배치', () => {
    const pos = computeStagePositions(scene, characters, 2, -1);
    // arrangePositions: lefts=[좌측], autos=[민주], rights=[우측] → [좌측, 민주, 우측] → 3분할(17,50,83).
    expect(pos.get('좌측')).toBe(17);
    expect(pos.get('민주')).toBe(50);
    expect(pos.get('우측')).toBe(83);
  });

  it('CG 배경이 활성화된 시점(activeCgIdx>=0)엔 스프라이트를 그리지 않으므로 빈 배치를 돌려준다', () => {
    const pos = computeStagePositions(scene, characters, 2, 0);
    expect(pos.size).toBe(0);
  });

  it('실제 생성기(generateRenpyFiles)가 script.rpy 에 emit 하는 최종 vn_char(x) 위치와 정확히 일치한다', () => {
    const project: Project = { ...emptyProject(), scenes: [scene], characters };
    const { files } = generateRenpyFiles(project);
    const script = files.find((f) => f.path === 'game/script.rpy')!.content;
    const ids = charIdMap(project);

    // script.rpy 에서 "show <id> ... at vn_char(<x>)" 를 순서대로 훑어 각 id 의 "마지막(최종)" 위치를
    // 누적한다 — scriptBody 는 새 캐릭터가 등장할 때마다 기존 캐릭터도 재배치(show ... at vn_char(x))
    // 커맨드를 추가로 emit 하므로, 마지막 값이 장면이 끝난 시점의 최종 배치다.
    const finalByCharId = new Map<string, number>();
    const re = /show\s+(c_\d+)[^\n]*\bat vn_char\(([\d.]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(script))) {
      finalByCharId.set(m[1], Number(m[2]));
    }

    const expected = computeStagePositions(scene, characters, scene.lines.length - 1, -1);
    for (const c of characters) {
      const id = ids.get(c.name)!;
      expect(finalByCharId.get(id)).toBe(expected.get(c.name));
    }
  });
});
