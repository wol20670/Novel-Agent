import { describe, it, expect } from 'vitest';
import { collectReferencedAssetIds, collectReferencedAssetKinds } from '../src/assetRefs';
import { emptyProject, type Project, type Scene, type Character } from '../src/types';
import { scene } from './fixtures';

describe('collectReferencedAssetIds', () => {
  const scenes: Scene[] = [
    scene({
      backgroundAssetId: 'bg1',
      bgmAssetId: 'bgm1',
      cgAssetIds: ['cg1', 'cg2'],
      lines: [
        {
          kind: 'dialogue',
          speaker: '한지수',
          text: '안녕',
          voiceAssetIds: { ko: 'voice_ko', en: 'voice_en' },
        },
        { kind: 'narration', text: '지문' },
      ],
    }),
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
    menuArt: { main: 'menu_main' },
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

describe('collectReferencedAssetKinds', () => {
  // collectReferencedAssetIds 테스트와 같은 project fixture 를 재사용 — kind 매핑이 참조 수집과
  // 필드 대 필드로 대응한다는 걸 같은 데이터로 확인한다(위 describe 블록의 project 변수와 별개로
  // 이 블록에도 필요한 만큼 최소로 다시 구성).
  const scenes: Scene[] = [
    scene({
      backgroundAssetId: 'bg1',
      bgmAssetId: 'bgm1',
      cgAssetIds: ['cg1', 'cg2'],
      lines: [
        {
          kind: 'dialogue',
          speaker: '한지수',
          text: '안녕',
          voiceAssetIds: { ko: 'voice_ko', en: 'voice_en' },
        },
        { kind: 'narration', text: '지문' },
      ],
    }),
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
    menuArt: { main: 'menu_main' },
    mainMenuUi: {
      buttons: {
        start: { idle: 'menu_start_idle', hover: 'menu_start_hover' },
        continue: { idle: 'menu_continue_idle', disabled: 'menu_continue_disabled' },
      },
      logo: 'menu_logo',
    },
  };

  const kinds = collectReferencedAssetKinds(project);

  it('배경·BGM·CG 는 각각 background/bgm/cg', () => {
    expect(kinds.get('bg1')).toBe('background');
    expect(kinds.get('bgm1')).toBe('bgm');
    expect(kinds.get('cg1')).toBe('cg');
    expect(kinds.get('cg2')).toBe('cg');
  });

  it('성우 음성은 voice(includeVoice 옵션 없이 항상 포함)', () => {
    expect(kinds.get('voice_ko')).toBe('voice');
    expect(kinds.get('voice_en')).toBe('voice');
  });

  it('캐릭터 표정·의상 표정은 sprite', () => {
    expect(kinds.get('expr_base')).toBe('sprite');
    expect(kinds.get('expr_happy')).toBe('sprite');
    expect(kinds.get('outfit_base')).toBe('sprite');
  });

  it('아이템은 item', () => {
    expect(kinds.get('item1')).toBe('item');
  });

  it('메뉴아트(menuArt)·메인메뉴 로고·버튼은 전용 kind 가 없어 cg 로 매핑된다', () => {
    expect(kinds.get('menu_main')).toBe('cg');
    expect(kinds.get('menu_logo')).toBe('cg');
    expect(kinds.get('menu_start_idle')).toBe('cg');
    expect(kinds.get('menu_start_hover')).toBe('cg');
    expect(kinds.get('menu_continue_idle')).toBe('cg');
    expect(kinds.get('menu_continue_disabled')).toBe('cg');
  });

  it('참조되지 않는 id 는 맵에 없다', () => {
    expect(kinds.has('nonexistent')).toBe(false);
  });

  it('collectReferencedAssetIds(includeVoice: true) 와 정확히 같은 id 집합을 커버한다', () => {
    const ids = collectReferencedAssetIds(project, { includeVoice: true });
    expect(new Set(kinds.keys())).toEqual(ids);
  });
});

describe('titleBgm — 타이틀 화면 BGM (별도 fixture, 기존 describe 의 exact-match 스냅샷을 건드리지 않기 위해 분리)', () => {
  const project: Project = { ...emptyProject(), titleBgm: { assetId: 'title_bgm1' } };

  it('참조 집합에 titleBgm.assetId 가 들어간다', () => {
    expect(collectReferencedAssetIds(project).has('title_bgm1')).toBe(true);
    expect(collectReferencedAssetIds(project, { includeVoice: true }).has('title_bgm1')).toBe(true);
  });

  it("kind 맵에서 titleBgm.assetId 는 'bgm'(메뉴 아트의 'cg' 우회와 달리 진짜 오디오)", () => {
    expect(collectReferencedAssetKinds(project).get('title_bgm1')).toBe('bgm');
  });

  it('titleBgm 이 없으면 참조·kind 어디에도 안 걸린다', () => {
    const empty = emptyProject();
    expect(collectReferencedAssetIds(empty).size).toBe(0);
    expect(collectReferencedAssetKinds(empty).size).toBe(0);
  });
});
