import { describe, it, expect } from 'vitest';
import { collectVoiceTargets } from '../src/generators/voice/collectByCharacter';
import { emptyProject, type Project, type Scene } from '../src/types';

function scene(id: string, lines: Scene['lines']): Scene {
  return { id, title: id, direction: [], cg: [], lines, choices: [], status: 'approved' };
}

function projectWith(scenes: Scene[]): Project {
  return { ...emptyProject(), scenes };
}

describe('collectVoiceTargets', () => {
  it('해당 캐릭터의 단일 화자 대사만, ko(base) 텍스트로 모은다', () => {
    const p = projectWith([
      scene('s1', [
        { kind: 'dialogue', speaker: '한지수', text: '안녕' },
        { kind: 'dialogue', speaker: '강민주', text: '반가워' }, // 다른 화자 — 제외
        { kind: 'narration', text: '지문' }, // 화자 없음 — 제외
      ]),
    ]);
    const items = collectVoiceTargets(p, '한지수', 'ko', 'ko');
    expect(items).toEqual([{ sceneId: 's1', lineIndex: 0, text: '안녕' }]);
  });

  it('이미 그 언어 음성이 있는 줄은 건너뛴다(개별 미세조정 보존)', () => {
    const p = projectWith([
      scene('s1', [
        { kind: 'dialogue', speaker: '한지수', text: '안녕', voiceAssetIds: { ko: 'asset1' } },
        { kind: 'dialogue', speaker: '한지수', text: '잘가' },
      ]),
    ]);
    const items = collectVoiceTargets(p, '한지수', 'ko', 'ko');
    expect(items).toEqual([{ sceneId: 's1', lineIndex: 1, text: '잘가' }]);
  });

  it('합동 대사(members)는 제외한다(generate.ts 도 vo() 를 안 냄)', () => {
    const p = projectWith([
      scene('s1', [{ kind: 'dialogue', speaker: '한지수 & 강민주', text: '안녕', members: ['한지수', '강민주'] }]),
    ]);
    expect(collectVoiceTargets(p, '한지수', 'ko', 'ko')).toEqual([]);
  });

  it('base 가 아닌 로케일이면 번역(i18n)을 쓰고, 없으면 원문으로 폴백한다', () => {
    const p = projectWith([
      scene('s1', [
        { kind: 'dialogue', speaker: '한지수', text: '안녕', i18n: { en: 'Hello' } },
        { kind: 'dialogue', speaker: '한지수', text: '잘가' }, // en 번역 없음 → 원문 폴백
      ]),
    ]);
    const items = collectVoiceTargets(p, '한지수', 'en', 'ko');
    expect(items).toEqual([
      { sceneId: 's1', lineIndex: 0, text: 'Hello' },
      { sceneId: 's1', lineIndex: 1, text: '잘가' },
    ]);
  });
});
