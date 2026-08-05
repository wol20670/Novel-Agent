import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import type { Project, Line } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

function projectWithChar(scenes: Parameters<typeof projectWith>[0]): Project {
  return projectWith(scenes, {
    // 스프라이트 보유 캐릭터 — "CG 이후 show 억제" 검증에 필요(더미 assetId).
    characters: [{ name: '민주', color: '#e91e63', expressions: { 기본: 'stub' } }],
  });
}

describe('generateRenpyFiles: CG는 그 지점부터 장면 배경(블러 백드롭) + 스프라이트 숨김', () => {
  it('블러 백드롭 transform 과 합성 이미지(cg_N_scene)를 정의한다', () => {
    const { files } = generateRenpyFiles(
      projectWithChar([scene({ cg: ['교문 앞 재회'], lines: [dialogue('민주', '안녕')] })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    const a = contentOf(files, 'game/assets.rpy');
    expect(s).toContain('transform vn_cg_backdrop:');
    expect(s).toContain('blur 24');
    expect(s).toContain('transform vn_cg_fit:');
    expect(a).toContain(
      'image cg_1_scene = Fixed(At("images/cg_1.png", vn_cg_backdrop), At("images/cg_1.png", vn_cg_fit))',
    );
  });

  it('kind:cg 마커 위치에서 scene 문으로 배경을 교체하고, 이후엔 스프라이트를 세우지 않는다', () => {
    const lines: Line[] = [
      dialogue('민주', '안녕'),
      { kind: 'cg', desc: '교문 앞 재회' },
      dialogue('민주', '잘 가'),
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['교문 앞 재회'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const cgIdx = s.indexOf('scene cg_1_scene with dissolve');
    expect(cgIdx).toBeGreaterThan(-1);
    expect(s.indexOf('show c_1')).toBeGreaterThan(-1);
    expect(s.indexOf('show c_1')).toBeLessThan(cgIdx); // CG 이전엔 정상 등장
    expect(s.lastIndexOf('show c_1')).toBeLessThan(cgIdx); // CG 이후엔 억제
    expect(s.indexOf('"잘 가"', cgIdx)).toBeGreaterThan(cgIdx); // 대사는 계속
    expect(s).not.toContain('pause'); // 옛 팝업(클릭 대기) 방식 아님
  });

  it('CG 가 둘이면 배경이 순서대로 다음 CG 로 교체된다', () => {
    const lines: Line[] = [
      { kind: 'cg', desc: '첫 컷' },
      dialogue('민주', '안녕'),
      { kind: 'cg', desc: '둘째 컷' },
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['첫 컷', '둘째 컷'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const first = s.indexOf('scene cg_1_scene with dissolve');
    const second = s.indexOf('scene cg_2_scene with dissolve');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it('위치 마커가 없는 기존 데이터(재파싱 전)는 장면 시작부터 CG 배경으로 폴백한다', () => {
    const { files } = generateRenpyFiles(
      projectWithChar([scene({ cg: ['교문 앞 재회'], lines: [dialogue('민주', '안녕')] })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    const bgIdx = s.indexOf('scene bg_1 at vn_bg');
    const cgIdx = s.indexOf('scene cg_1_scene with dissolve');
    expect(cgIdx).toBeGreaterThan(bgIdx);
    expect(cgIdx).toBeLessThan(s.indexOf('"안녕"')); // 첫 대사 전에 이미 CG 배경
    expect(s).not.toContain('show c_1'); // 장면 전체 스프라이트 억제
  });

  it('CG 가 없는 장면엔 scene cg_* 교체가 없다(트랜스폼 정의는 항상 존재)', () => {
    const { files } = generateRenpyFiles(
      projectWithChar([scene({ cg: [], lines: [dialogue('민주', '안녕')] })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    expect(s).toContain('transform vn_cg_backdrop:');
    expect(s).not.toContain('scene cg_');
  });
});
