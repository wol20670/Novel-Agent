import { describe, it, expect } from 'vitest';
import { collectReferencedAssetIds } from '../src/assetRefs';
import { emptyProject, type Project, type Scene, type Character } from '../src/types';

function scene(id: string, extra: Partial<Scene>, lines: Scene['lines'] = []): Scene {
  return { id, title: id, direction: [], cg: [], lines, choices: [], status: 'approved', ...extra };
}

describe('collectReferencedAssetIds', () => {
  const scenes: Scene[] = [
    scene(
      's1',
      { backgroundAssetId: 'bg1', bgmAssetId: 'bgm1', cgAssetIds: ['cg1', 'cg2'] },
      [
        {
          kind: 'dialogue',
          speaker: '한지수',
          text: '안녕',
          voiceAssetIds: { ko: 'voice_ko', en: 'voice_en' },
        },
        { kind: 'narration', text: '지문' },
      ],
    ),
  ];

  const characters: Character[] = [
    {
      name: '한지수',
      color: '#fff',
      expressions: { 기본: 'expr_base', 기쁨: 'expr_happy' },
      outfits: [{ name: '수영복', expressions: { 기본: 'outfit_base' } }],
    },
  ];

  const project: Project = {
    ...emptyProject(),
    scenes,
    characters,
    itemAssetIds: { 편지: 'item1' },
    menuArt: { main: 'menu_main', game: 'menu_game' },
    mainMenuUi: {
      buttons: {
        start: { idle: 'menu_start_idle', hover: 'menu_start_hover' },
        continue: { idle: 'menu_continue_idle', disabled: 'menu_continue_disabled' },
      },
      logo: 'menu_logo',
    },
  };

  const mainMenuIds = [
    'menu_start_idle',
    'menu_start_hover',
    'menu_continue_idle',
    'menu_continue_disabled',
    'menu_logo',
  ];

  it('includeVoice: true 면 성우 음성을 포함해 모든 참조를 모은다', () => {
    const ids = collectReferencedAssetIds(project, { includeVoice: true });
    expect(ids).toEqual(
      new Set([
        'bg1',
        'bgm1',
        'cg1',
        'cg2',
        'voice_ko',
        'voice_en',
        'expr_base',
        'expr_happy',
        'outfit_base',
        'item1',
        'menu_main',
        'menu_game',
        ...mainMenuIds,
      ]),
    );
  });

  it('includeVoice: false 면 성우 음성은 제외하고 나머지는 그대로 포함한다(메인 메뉴 버튼·로고 포함)', () => {
    const ids = collectReferencedAssetIds(project, { includeVoice: false });
    expect(ids.has('voice_ko')).toBe(false);
    expect(ids.has('voice_en')).toBe(false);
    expect(ids).toEqual(
      new Set([
        'bg1',
        'bgm1',
        'cg1',
        'cg2',
        'expr_base',
        'expr_happy',
        'outfit_base',
        'item1',
        'menu_main',
        'menu_game',
        ...mainMenuIds,
      ]),
    );
  });

  it('opts 미지정(기본값)이면 성우 음성을 제외한다', () => {
    const ids = collectReferencedAssetIds(project);
    expect(ids.has('voice_ko')).toBe(false);
    expect(ids.has('bg1')).toBe(true);
  });
});
