import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadProject, saveProject } from '../src/storage/projectStore';
import { emptyProject, type Project } from '../src/types';

// vitest 기본 환경(node)엔 localStorage 가 없어 최소 인메모리 폴리필로 대체한다.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('loadProject: project/assets 파싱 독립성(P0-4)', () => {
  it('assets 키만 손상돼도 project 는 살아있고 assets 는 빈 값으로 복원한다', () => {
    const project: Project = { ...emptyProject(), title: '살아남은 프로젝트' };
    localStorage.setItem('novel-agent:project', JSON.stringify(project));
    localStorage.setItem('novel-agent:assets', '{ 이건 깨진 JSON');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = loadProject();

    expect(result).not.toBeNull();
    expect(result!.project.title).toBe('살아남은 프로젝트');
    expect(result!.assets).toEqual({});
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('project 자체가 손상되면 null 을 반환한다', () => {
    localStorage.setItem('novel-agent:project', '{ 이것도 깨진 JSON');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(loadProject()).toBeNull();

    errSpy.mockRestore();
  });

  it('정상 저장 후 로드하면 project·assets 모두 그대로 복원된다', () => {
    const project: Project = { ...emptyProject(), title: '정상 프로젝트' };
    const assets = { a1: { name: 'a1', mime: 'image/png', size: 1 } } as unknown as Record<string, unknown>;
    saveProject(project, assets as never);

    const result = loadProject();

    expect(result!.project.title).toBe('정상 프로젝트');
    expect(result!.assets).toEqual(assets);
  });
});

describe('save/load: 줄 단위 의상 전환(Line.outfits) 보존', () => {
  it('저장 → 로드 후에도 줄 의상이 그대로 남는다(별도 마이그레이션 불필요)', () => {
    const project: Project = {
      ...emptyProject(),
      scenes: [
        {
          id: 's1',
          title: '카페',
          direction: [],
          cg: [],
          choices: [],
          status: 'approved',
          outfits: { 히로인: '교복' },
          lines: [
            { kind: 'dialogue', speaker: '히로인', text: '하나' },
            { kind: 'dialogue', speaker: '히로인', text: '둘', outfits: { 히로인: '사복' } },
            { kind: 'narration', text: '지문', outfits: { 히로인: '수영복' } },
          ],
        },
      ],
    };
    saveProject(project, {} as never);

    const loaded = loadProject()!.project;
    const lines = loaded.scenes[0].lines;
    expect(loaded.scenes[0].outfits).toEqual({ 히로인: '교복' });
    expect((lines[0] as { outfits?: unknown }).outfits).toBeUndefined();
    expect((lines[1] as { outfits?: unknown }).outfits).toEqual({ 히로인: '사복' });
    expect((lines[2] as { outfits?: unknown }).outfits).toEqual({ 히로인: '수영복' });
  });
});
