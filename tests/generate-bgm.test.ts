import { describe, it, expect } from 'vitest';
import { generateRenpyFiles } from '../src/renpy/generate';
import type { Line } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

describe('generateRenpyFiles: BGM 은 kind:bgm 마커 위치에서 재생(장면 시작 아님)', () => {
  it('마커가 있으면 play music 이 label 직후가 아니라 해당 대사 뒤에 나온다', () => {
    const lines: Line[] = [
      dialogue('민주', '안녕'),
      { kind: 'bgm', name: 'busy_city' },
      dialogue('민주', '잘 가'),
    ];
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', bgmAssetId: 'a1', lines })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    const labelIdx = s.indexOf('label scene_1:');
    const playIdx = s.indexOf('play music "audio/'); // 슬러그 파일명은 무관 — "재생 자체가 어디서 나오는지"만 본다
    const line1Idx = s.indexOf('"안녕"');
    const line2Idx = s.indexOf('"잘 가"');
    expect(playIdx).toBeGreaterThan(-1);
    expect(labelIdx).toBeGreaterThan(-1);
    // label 바로 다음 줄(scene bg)에서 곧장 재생되는 게 아니라 첫 대사 뒤, 둘째 대사 앞이어야 한다.
    expect(playIdx).toBeGreaterThan(line1Idx);
    expect(playIdx).toBeLessThan(line2Idx);
  });

  it('마커가 없는 장면(옛 데이터)은 지금처럼 장면 시작(label 직후)에서 재생된다(회귀 없음)', () => {
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', bgmAssetId: 'a1', lines: [dialogue('민주', '안녕')] })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    const bgIdx = s.indexOf('scene bg_');
    const playIdx = s.indexOf('play music "audio/'); // 슬러그 파일명은 무관 — "재생 자체가 어디서 나오는지"만 본다
    const line1Idx = s.indexOf('"안녕"');
    expect(playIdx).toBeGreaterThan(-1);
    expect(playIdx).toBeGreaterThan(bgIdx);
    expect(playIdx).toBeLessThan(line1Idx); // 첫 대사보다 먼저 — 장면 시작에서 재생
  });

  it('업로드본(bgmAssetId)이 없으면 마커가 있어도 play music 이 아예 나오지 않는다(없는 파일 참조 방지)', () => {
    const lines: Line[] = [dialogue('민주', '안녕'), { kind: 'bgm', name: 'busy_city' }, dialogue('민주', '잘 가')];
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', lines })]), // bgmAssetId 없음
    );
    const s = contentOf(files, 'game/script.rpy');
    expect(s).not.toContain('play music');
  });
});
