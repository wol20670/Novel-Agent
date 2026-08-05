// script.rpy 의 `# ...` 코멘트에 실리는 사용자 텍스트(장면 제목·연출 메모)는 esc() 를 거치지 않는
// 유일한 삽입 경로다 — esc() 는 따옴표·%·[/{ 안엔 필요하지만 코멘트 안엔 안 통과해도 됐었는데,
// 정작 코멘트에서 진짜 문제인 건 "개행"이다. 코멘트는 그 줄 전체가 '#' 로 시작해야 유효한데, 사용자가
// Excel 등에서 복붙한 제목/연출에 줄바꿈이 섞여 있으면 그 뒤 텍스트가 '#' 없는 날것 줄로 script.rpy
// 에 그대로 삽입되어 문법 오류로 죽는다(lint 로도 typecheck 로도 못 잡는 런타임 크래시 — CLAUDE.md
// 최상위 함정과 같은 종류). commentSafe() 가 개행·제어문자를 공백 하나로 접어 막는다.

import { describe, expect, it } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene } from '../src/types';

function sceneWith(overrides: Partial<Scene>): Scene {
  return {
    id: 's1',
    title: '장면1',
    direction: [],
    cg: [],
    lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕' }],
    choices: [],
    status: 'approved',
    ...overrides,
  };
}

function projectWith(scene: Scene): Project {
  return { ...emptyProject(), scenes: [scene] };
}

function scriptOf(project: Project): string {
  const { files } = generateRenpyFiles(project);
  return files.find((f) => f.path === 'game/script.rpy')!.content;
}

describe('generate.ts — 코멘트에 실리는 사용자 텍스트의 개행·제어문자 처리', () => {
  it('장면 제목에 개행이 섞여 있어도 "# ── 제목 ──" 코멘트가 한 줄로 유지된다(회귀: 예전엔 raw 삽입)', () => {
    const evilTitle = '제목1\n악성라인()';
    const script = scriptOf(projectWith(sceneWith({ title: evilTitle })));

    // 개행 뒤 텍스트가 '#' 없는 독립 줄로 새 나가면 안 된다 — 이 줄이 존재하면 Ren'Py 파서가
    // "악성라인()" 을 코드로 해석하려다 문법 오류를 낸다.
    expect(script).not.toContain('\n악성라인()');
    // 대신 같은 코멘트 줄 안에서 공백 하나로 접혀 들어가야 한다.
    const lines = script.split('\n');
    const commentLine = lines.find((l) => l.startsWith('# ── '));
    expect(commentLine).toBe('# ── 제목1 악성라인() ──');
  });

  it('연출(direction) 메모에 개행이 섞여 있어도 "# 연출: ..." 코멘트가 한 줄로 유지된다', () => {
    const script = scriptOf(
      projectWith(sceneWith({ direction: ['노을\r\n지는 하늘', '\t탭\x07제어문자'] })),
    );
    const lines = script.split('\n');
    const directionLine = lines.find((l) => l.trim().startsWith('# 연출:'));
    expect(directionLine).toBeDefined();
    // 원본에 있던 개행·탭·제어문자가 코멘트 밖으로 그대로 남아있지 않아야 한다(전부 공백으로 접힘).
    expect(directionLine).not.toMatch(/[\r\n\t\x07]/);
    // commentSafe 는 제어문자 자체만 공백으로 접는다(주변의 일반 공백까지 합치지는 않는다) —
    // "/" 뒤 구분 공백 + 탭이 접힌 공백이 겹쳐 이중 공백이 남는 건 정상(코멘트 가독성엔 무해).
    expect(directionLine).toBe('    # 연출: 노을 지는 하늘 /  탭 제어문자');
  });

  it('제목이 정상(개행 없음)이면 기존과 동일하게 그대로 나간다(회귀 0)', () => {
    const script = scriptOf(projectWith(sceneWith({ title: '평범한 제목' })));
    expect(script).toContain('# ── 평범한 제목 ──');
  });

  it('점프 대상을 못 찾은 경우의 코멘트는 esc() 를 이미 거쳐 개행이 있어도 안전하다(회귀 확인용)', () => {
    const script = scriptOf(
      projectWith(sceneWith({ jumpTo: '없는장면\n제목' })),
    );
    const lines = script.split('\n');
    const jumpLine = lines.find((l) => l.includes('점프 대상'));
    expect(jumpLine).toBeDefined();
    expect(jumpLine).not.toMatch(/[\r\n]/);
  });
});
