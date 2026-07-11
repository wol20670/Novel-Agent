import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import { emptyProject, type Project, type Scene } from '../src/types';

function sceneWith(cg: string[]): Scene {
  return {
    id: 's1',
    title: '장면1',
    direction: [],
    cg,
    lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕' }],
    choices: [],
    status: 'approved',
  };
}

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}

const fileOf = (files: { path: string; content: string }[], path: string) =>
  files.find((f) => f.path === path);

describe('generateRenpyFiles: CG는 화면보다 커도 안 잘리게 fit contain으로 표시', () => {
  it('vn_cg 트랜스폼을 정의하고 CG show에 적용한다', () => {
    const { files } = generateRenpyFiles(projectWith([sceneWith(['교문 앞 재회'])]));
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).toContain('transform vn_cg:');
    expect(s).toContain('fit "contain"');
    expect(s).toContain('show cg_1 at vn_cg with dissolve');
  });

  it('CG가 없는 장면엔 show 라인 자체가 없다(트랜스폼 정의는 항상 존재)', () => {
    const { files } = generateRenpyFiles(projectWith([sceneWith([])]));
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).toContain('transform vn_cg:');
    expect(s).not.toContain('at vn_cg with dissolve');
  });

  it('CG는 클릭(pause) 한 번 후 dissolve로 사라진다(계속 화면에 남던 버그 수정)', () => {
    const { files } = generateRenpyFiles(projectWith([sceneWith(['교문 앞 재회'])]));
    const s = fileOf(files, 'game/script.rpy')!.content;
    const showIdx = s.indexOf('show cg_1 at vn_cg with dissolve');
    const pauseIdx = s.indexOf('pause', showIdx);
    const hideIdx = s.indexOf('hide cg_1 with dissolve', pauseIdx);
    expect(showIdx).toBeGreaterThan(-1);
    expect(pauseIdx).toBeGreaterThan(showIdx);
    expect(hideIdx).toBeGreaterThan(pauseIdx);
  });

  it('CG가 없으면 pause/hide도 없다', () => {
    const { files } = generateRenpyFiles(projectWith([sceneWith([])]));
    const s = fileOf(files, 'game/script.rpy')!.content;
    expect(s).not.toContain('hide cg_1');
  });
});
