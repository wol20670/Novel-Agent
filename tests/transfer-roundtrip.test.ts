// .npproj.zip 내보내기/가져오기 왕복 — Line 의 optional 메타(줄 의상 등)가 project.json 통째
// 직렬화로 보존되는지를 "주장"이 아니라 테스트로 고정한다.
// ⚠️ 에셋을 하나도 참조하지 않는 프로젝트여야 한다 — 참조가 있으면 exportProjectFile 이 IndexedDB
// (getAsset)를 건드리는데 vitest 기본 환경(node)엔 indexedDB 가 없다. IDB 목을 새로 만들지 않고
// "참조 0" 픽스처로 그 경로를 피한다(assetStore 는 openDb() 안에서만 indexedDB 를 열므로 import
// 자체는 안전하다).

import { describe, it, expect } from 'vitest';
import { exportProjectFile, importProjectFile } from '../src/project/transfer';
import { mergeLineOutfit } from '../src/generators/outfit';
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

  // O14(Phase 7) — 위 테스트가 "수락값 유지"를 이미 증명하므로, 여기선 나머지 절반인
  // **"제안은 안 실린다"** 를 실제 zip 왕복으로 고정한다. Outfit AI 제안은 project 밖 런타임
  // state(outfitSuggestions)라 구조적으로 직렬화 대상이 아니지만, 나중에 누가 project 안으로
  // 옮기면 조용히 저장·협업·zip 에 새어 나가므로 그 회귀를 여기서 잡는다.
  it('AI 수락 경로로 만든 줄 의상은 왕복하고, 제안의 transient metadata 는 zip 에 실리지 않는다', async () => {
    const project = projectWithLineOutfits();
    // 실제 수락 경로(applyOutfitSuggestion)가 쓰는 순수 함수로 값을 만든다.
    const accepted = mergeLineOutfit(project.scenes[0], 0, '히로인', '체육복');
    const withAccepted: Project = { ...project, scenes: [accepted] };

    const { blob } = await exportProjectFile(withAccepted, {});
    const restored = (await importProjectFile(blob)).project;

    expect(outfitsOf(restored.scenes[0].lines[0])).toEqual({ 히로인: '체육복' });
    expect(outfitsOf(restored.scenes[0].lines[1])).toEqual({ 히로인: '카페복' }); // 기존 값도 그대로

    // 제안 전용 필드는 어디에도 없어야 한다(project JSON 통째가 zip 페이로드다).
    const payload = JSON.stringify(restored);
    expect(payload).not.toContain('outfitSuggestion');
    expect(payload).not.toContain('lineKey');
    expect(payload).not.toContain('reason');
  });
});
