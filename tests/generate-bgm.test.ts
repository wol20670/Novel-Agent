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

describe('generateRenpyFiles: project.bgmPlayback — 재생 방식 토글', () => {
  it('기본값(설정 없음)은 play music 뒤에 if_changed 가 붙는다(같은 곡이면 안 끊고 이어감)', () => {
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', bgmAssetId: 'a1', lines: [dialogue('민주', '안녕')] })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    expect(s).toContain('play music "audio/');
    const playLine = s.split('\n').find((l) => l.includes('play music "audio/'));
    expect(playLine).toMatch(/fadein 1\.0 if_changed$/);
  });

  it('restartSameBgm: true 면 if_changed 가 없다(옛 동작 — 장면마다 무조건 재시작, 회귀 0 대상 문자열)', () => {
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', bgmAssetId: 'a1', lines: [dialogue('민주', '안녕')] })], {
        bgmPlayback: { restartSameBgm: true },
      }),
    );
    const s = contentOf(files, 'game/script.rpy');
    const playLine = s.split('\n').find((l) => l.includes('play music "audio/'));
    expect(playLine).toMatch(/fadein 1\.0$/);
    expect(playLine).not.toContain('if_changed');
  });

  it('위치 마커(kind:bgm)가 있는 장면도 같은 헬퍼를 타서 if_changed 가 붙는다(두 방출 경로 일치 확인)', () => {
    const lines: Line[] = [
      dialogue('민주', '안녕'),
      { kind: 'bgm', name: 'busy_city' },
      dialogue('민주', '잘 가'),
    ];
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', bgmAssetId: 'a1', lines })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    const playLine = s.split('\n').find((l) => l.includes('play music "audio/'));
    expect(playLine).toMatch(/fadein 1\.0 if_changed$/);
  });

  it('stopWhenUnset: true + BGM 지정이 아예 없는 장면 → 그 라벨에 stop music fadeout 1.0', () => {
    const { files } = generateRenpyFiles(
      projectWith([scene({ lines: [dialogue('민주', '안녕')] })], {
        bgmPlayback: { stopWhenUnset: true },
      }),
    );
    const s = contentOf(files, 'game/script.rpy');
    expect(s).toContain('stop music fadeout 1.0');
  });

  it('stopWhenUnset: true + #BGM 은 적었지만 bgmAssetId 없음 → stop music 이 안 나온다(업로드 대기 중인 자리를 끊지 않음)', () => {
    const { files } = generateRenpyFiles(
      projectWith([scene({ bgm: 'busy_city', lines: [dialogue('민주', '안녕')] })], {
        bgmPlayback: { stopWhenUnset: true },
      }),
    );
    const s = contentOf(files, 'game/script.rpy');
    expect(s).not.toContain('stop music');
    expect(s).not.toContain('play music'); // bgmAssetId 가 없으니 재생도 안 나온다(기존 규칙)
  });

  it('stopWhenUnset 미지정(기본)이면 BGM 없는 장면이어도 stop music 이 어디에도 없다(회귀 0)', () => {
    const { files } = generateRenpyFiles(projectWith([scene({ lines: [dialogue('민주', '안녕')] })])); // bgmPlayback 없음
    const s = contentOf(files, 'game/script.rpy');
    expect(s).not.toContain('stop music');
  });
});
