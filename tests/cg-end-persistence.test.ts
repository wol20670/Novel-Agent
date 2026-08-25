// post-v1 `#CG끝` — 병합 identity + `.npproj.zip` 왕복.
//
// 이번 변경은 엄밀히 **Line serialized shape 에 backward-compatible optional field(`end?: true`)
// 1개 추가**다(schema version bump 없음 · migration 없음 · container format 무변경). 그 두 축을
// "주장"이 아니라 테스트로 고정한다.

import { describe, it, expect } from 'vitest';
import { mergeScenes, previewMerge, diffMatchedScene } from '../src/project/mergeScenes';
import { exportProjectFile, importProjectFile } from '../src/project/transfer';
import { emptyProject, type Line, type Project, type Scene } from '../src/types';

function sc(id: string, title: string, patch: Partial<Scene> = {}): Scene {
  return { id, title, direction: [], cg: [], lines: [], choices: [], status: 'review', ...patch };
}

const cgStart = (desc: string): Line => ({ kind: 'cg', desc });
const cgEnd = (): Line => ({ kind: 'cg', desc: '', end: true });

describe('mergeScenes — 기존 CG 줄의 identity 는 그대로, 종료 마커만 구별된다', () => {
  it('설명 없는 `#CG` 와 `#CG끝` 은 서로 다른 줄로 취급된다', () => {
    const prev = [sc('s1', '장면1', { cg: [''], lines: [cgStart('')] })];
    const next = [sc('n1', '장면1', { cg: [], lines: [cgEnd()] })];
    // 내용이 다르므로 "줄 하나가 사라지고 하나가 생긴" 것으로 집계된다(같은 줄로 접히지 않는다).
    const d = diffMatchedScene(prev[0], next[0]);
    expect(d.linesCarried).toBe(0);
    expect(d.linesRemoved).toBe(1);
  });

  it('종료 마커가 없는 기존 대본은 재분석에서 그대로 승계된다(회귀 0)', () => {
    const lines: Line[] = [
      { kind: 'dialogue', speaker: '민주', text: '하나' },
      cgStart('키스'),
      { kind: 'dialogue', speaker: '민주', text: '둘' },
    ];
    const prev = [sc('s1', '장면1', { cg: ['키스'], lines, status: 'approved' })];
    const next = [sc('n1', '장면1', { cg: ['키스'], lines: lines.map((l) => ({ ...l })) })];
    expect(previewMerge(prev, next)).toMatchObject({ linesCarried: 3, linesRemoved: 0 });
    expect(mergeScenes(prev, next, 'merge')[0].status).toBe('approved');
  });

  it('`#CG끝` 이 포함된 장면도 내용이 같으면 통째로 승계된다(승인 유지)', () => {
    const lines: Line[] = [
      { kind: 'dialogue', speaker: '민주', text: '하나' },
      cgStart('키스'),
      { kind: 'dialogue', speaker: '민주', text: '둘' },
      cgEnd(),
      { kind: 'dialogue', speaker: '민주', text: '셋' },
    ];
    const prev = [sc('s1', '장면1', { cg: ['키스'], lines, status: 'approved' })];
    const next = [sc('n1', '장면1', { cg: ['키스'], lines: lines.map((l) => ({ ...l })) })];
    expect(previewMerge(prev, next)).toMatchObject({ linesCarried: 5, linesRemoved: 0 });
    expect(mergeScenes(prev, next, 'merge')[0].status).toBe('approved'); // 내용 동일 → 승인 승계
  });

  it('종료 마커를 지우면 그 줄만 사라진 것으로 잡힌다(다른 줄은 승계)', () => {
    const withEnd: Line[] = [
      { kind: 'dialogue', speaker: '민주', text: '하나' },
      cgStart('키스'),
      cgEnd(),
    ];
    const withoutEnd: Line[] = [
      { kind: 'dialogue', speaker: '민주', text: '하나' },
      cgStart('키스'),
    ];
    const d = diffMatchedScene(
      sc('s1', '장면1', { cg: ['키스'], lines: withEnd }),
      sc('n1', '장면1', { cg: ['키스'], lines: withoutEnd }),
    );
    expect(d.linesCarried).toBe(2);
    expect(d.linesRemoved).toBe(1);
  });
});

describe('.npproj.zip — `end: true` 가 왕복에서 보존된다(migration 없이)', () => {
  // ⚠️ 에셋 참조 0 픽스처 — 참조가 있으면 export 가 IndexedDB 를 건드린다(기존 왕복 테스트와 같은 이유).
  function project(): Project {
    return {
      ...emptyProject(),
      title: 'CG 종료 왕복',
      characters: [{ name: '민주', color: '#fff', expressions: {} }],
      scenes: [
        {
          id: 's1',
          title: '카페',
          direction: [],
          cg: ['키스'],
          choices: [],
          status: 'approved',
          lines: [
            { kind: 'dialogue', speaker: '민주', text: '하나' },
            cgStart('키스'),
            { kind: 'dialogue', speaker: '민주', text: '둘' },
            cgEnd(),
            { kind: 'dialogue', speaker: '민주', text: '셋' },
          ],
        },
      ],
    };
  }

  it('kind/desc/end 가 그대로 복원되고 Scene.cg 는 늘지 않는다', async () => {
    const { blob, assetCount } = await exportProjectFile(project(), {});
    expect(assetCount).toBe(0);

    const restored = (await importProjectFile(blob)).project;
    const lines = restored.scenes[0].lines;
    expect(lines.filter((l) => l.kind === 'cg')).toEqual([
      { kind: 'cg', desc: '키스' },
      { kind: 'cg', desc: '', end: true },
    ]);
    expect(restored.scenes[0].cg).toEqual(['키스']); // 종료 마커는 에셋이 아니다
  });

  it('종료 마커가 없는 기존 프로젝트는 `end` 키 자체가 생기지 않는다(하위호환)', async () => {
    const p = project();
    p.scenes[0].lines = p.scenes[0].lines.filter((l) => !(l.kind === 'cg' && l.end));
    const restored = (await importProjectFile((await exportProjectFile(p, {})).blob)).project;
    const cg = restored.scenes[0].lines.find((l) => l.kind === 'cg')!;
    expect(Object.prototype.hasOwnProperty.call(cg, 'end')).toBe(false);
  });
});
