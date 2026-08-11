// .npproj.zip 내보내기/가져오기 왕복 — Line 의 optional 메타(줄 의상 등)가 project.json 통째
// 직렬화로 보존되는지를 "주장"이 아니라 테스트로 고정한다.
// ⚠️ 에셋을 하나도 참조하지 않는 프로젝트여야 한다 — 참조가 있으면 exportProjectFile 이 IndexedDB
// (getAsset)를 건드리는데 vitest 기본 환경(node)엔 indexedDB 가 없다. IDB 목을 새로 만들지 않고
// "참조 0" 픽스처로 그 경로를 피한다(assetStore 는 openDb() 안에서만 indexedDB 를 열므로 import
// 자체는 안전하다).

import { describe, it, expect } from 'vitest';
import { exportProjectFile, importProjectFile } from '../src/project/transfer';
import { emptyProject, type Project, type Line } from '../src/types';

function projectWithLineOutfits(): Project {
  return {
    ...emptyProject(),
    title: '왕복 테스트',
    characters: [{ name: '히로인', color: '#fff', expressions: {} }], // assetId 없음(참조 0)
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
          { kind: 'dialogue', speaker: '히로인', text: '둘', outfits: { 히로인: '카페복' } },
          { kind: 'narration', text: '퇴근 시간.', outfits: { 히로인: '사복' } },
        ],
      },
    ],
  };
}

const outfitsOf = (l: Line) => (l.kind === 'dialogue' || l.kind === 'narration' ? l.outfits : undefined);

describe('.npproj.zip: 프로젝트 왕복(export → import)', () => {
  it('줄 단위 의상 전환(Line.outfits)이 그대로 복원된다', async () => {
    const project = projectWithLineOutfits();
    const { blob, assetCount } = await exportProjectFile(project, {});
    expect(assetCount).toBe(0); // 참조 0 — IndexedDB 경로를 타지 않는다

    const restored = (await importProjectFile(blob)).project;
    const lines = restored.scenes[0].lines;
    expect(restored.scenes[0].outfits).toEqual({ 히로인: '교복' });
    expect(outfitsOf(lines[0])).toBeUndefined();
    expect(outfitsOf(lines[1])).toEqual({ 히로인: '카페복' });
    expect(outfitsOf(lines[2])).toEqual({ 히로인: '사복' });
    // 장면 메타도 함께 살아남는지(직렬화 경로가 project 통째인지) 최소 확인.
    expect(restored.title).toBe('왕복 테스트');
    expect(restored.scenes[0].status).toBe('approved');
  });
});
