// 게임 아이콘(exe icon.ico / 창 gui/window_icon.png) 출력 규칙.
// 핵심은 두 가지다:
//  (1) icon.ico 는 **game/ 밖 프로젝트 루트**로 나가야 한다 — Ren'Py 런처가 배포 빌드 때
//      `os.path.join(project.path, "icon.ico")` 딱 그 경로만 읽는다(launcher/game/distribute.rpy).
//      game/ 안에 들어가면 조용히 무시돼 "배포했더니 기본 아이콘"이 된다.
//  (2) 창 아이콘 define 은 options.rpy 의 `config.window_icon` 이며(gui.window_icon 이 아니다 —
//      그 이름으로 정의하면 엔진이 조용히 무시한다), PNG 가 실제로 나갈 때만 내야 한다.
//      무조건 내면 없는 파일을 참조해 zip 불변식(tests/zip-asset-invariant.test.ts)이 깨진다.
//
// zip-asset-invariant 와 같은 이유로 브라우저 전용 의존을 전부 모킹한다(node 환경).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectProjectFiles } from '../src/zip/buildZip';
import { emptyProject, GAME_ICON_FILE, WINDOW_ICON_FILE, type Project } from '../src/types';
import { getAsset } from '../src/storage/assetStore';
import { extFor } from '../src/project/transfer';
import { scene } from './fixtures';

vi.mock('../src/storage/assetStore', () => ({
  getAsset: vi.fn(async (id: string) => new Blob([`stub:${id}`], { type: 'image/png' })),
}));

vi.mock('../src/generators/image/canvasProvider', () => ({
  canvasImage: vi.fn(async () => new Blob(['stub:canvas-image'], { type: 'image/png' })),
}));

vi.mock('../src/generators/image/canvasSprite', () => ({
  canvasSprite: vi.fn(async () => new Blob(['stub:canvas-sprite'], { type: 'image/png' })),
}));

// buttonBgAssets/quickPillAssets 는 Canvas 를 안 쓰는 순수 함수라 실제 구현을 그대로 쓴다
// (zip-asset-invariant.test.ts 와 동일한 이유·형태).
vi.mock('../src/generators/image/canvasMenu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/generators/image/canvasMenu')>();
  return {
    ...actual,
    menuBackdropPng: vi.fn(async () => new Blob(['stub:menu-backdrop'], { type: 'image/png' })),
    solidPng: vi.fn(async () => new Blob(['stub:solid'], { type: 'image/png' })),
    textboxGradientPng: vi.fn(async () => new Blob(['stub:textbox-gradient'], { type: 'image/png' })),
    roundedPillPng: vi.fn(async () => new Blob(['stub:pill'], { type: 'image/png' })),
  };
});

vi.mock('../src/fonts/fontCache', () => ({
  ensureFontBlob: vi.fn(async () => new Blob(['stub:font'], { type: 'font/ttf' })),
  ensureFontLicense: vi.fn(async () => undefined),
}));

function projectWith(gameIcon?: Project['gameIcon']): Project {
  return {
    ...emptyProject(),
    scenes: [scene({ lines: [{ kind: 'dialogue', speaker: '한지수', text: '안녕' }] })],
    characters: [{ name: '한지수', color: '#fff', expressions: {} }],
    gameIcon,
  };
}

async function pathsOf(project: Project): Promise<Set<string>> {
  const { files } = await collectProjectFiles(project);
  return new Set(files.map((f) => f.path));
}

/**
 * 창 아이콘 define 은 **options.rpy** 의 `config.window_icon` 이다(gui.rpy 의 gui.window_icon 이 아님).
 * gui.window_icon 을 정의해도 그 값을 config 로 옮겨주는 코드가 엔진에 없어 조용히 무시된다 —
 * 실제 실행에서 아이콘이 안 바뀌는 걸 보고 잡았다. 스톡 템플릿(gui/game/options.rpy:156)과 같은 자리.
 */
async function optionsRpyOf(project: Project): Promise<string> {
  const { files } = await collectProjectFiles(project);
  const opt = files.find((f) => f.path === 'game/options.rpy');
  return typeof opt?.data === 'string' ? opt.data : '';
}

beforeEach(() => {
  vi.mocked(getAsset).mockImplementation(async (id: string) => new Blob([`stub:${id}`], { type: 'image/png' }));
});

describe('게임 아이콘 출력', () => {
  it('아이콘을 안 올리면 아무 파일도 안 나오고 config.window_icon 정의도 없다(회귀 0)', async () => {
    const paths = await pathsOf(projectWith(undefined));
    expect(paths.has(GAME_ICON_FILE)).toBe(false);
    expect(paths.has(`game/${WINDOW_ICON_FILE}`)).toBe(false);
    expect(await optionsRpyOf(projectWith(undefined))).not.toContain('config.window_icon');
  });

  it('ico 는 game/ 밖 프로젝트 루트로 나간다 — Ren\'Py 런처가 그 경로만 읽는다', async () => {
    const paths = await pathsOf(projectWith({ ico: 'icon-asset' }));
    expect(paths.has('icon.ico')).toBe(true);
    // game/ 안에 잘못 들어가면 배포 빌드가 조용히 무시한다 — 가장 알아채기 어려운 실패라 못박는다.
    expect(paths.has('game/icon.ico')).toBe(false);
  });

  it('ico 만 올리면 창 아이콘은 안 나오고 config.window_icon 도 정의되지 않는다(둘은 별개)', async () => {
    const project = projectWith({ ico: 'icon-asset' });
    const paths = await pathsOf(project);
    expect(paths.has(`game/${WINDOW_ICON_FILE}`)).toBe(false);
    expect(await optionsRpyOf(project)).not.toContain('config.window_icon');
  });

  it('창 아이콘을 올리면 PNG 와 define 이 함께 나온다(참조하면 파일이 있다)', async () => {
    const project = projectWith({ window: 'win-asset' });
    const paths = await pathsOf(project);
    expect(paths.has(`game/${WINDOW_ICON_FILE}`)).toBe(true);
    expect(await optionsRpyOf(project)).toContain(`define config.window_icon = "${WINDOW_ICON_FILE}"`);
  });

  it('둘 다 올리면 둘 다 각자 자리에 나온다', async () => {
    const paths = await pathsOf(projectWith({ ico: 'icon-asset', window: 'win-asset' }));
    expect(paths.has(GAME_ICON_FILE)).toBe(true);
    expect(paths.has(`game/${WINDOW_ICON_FILE}`)).toBe(true);
  });

  it('blob 이 사라진 창 아이콘은 파일도 define 도 안 낸다 — 없는 파일 참조 방지(resolveGameIcon)', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'win-gone' ? undefined : new Blob([`stub:${id}`], { type: 'image/png' }),
    );
    const project = projectWith({ ico: 'icon-asset', window: 'win-gone' });
    const paths = await pathsOf(project);
    expect(paths.has(`game/${WINDOW_ICON_FILE}`)).toBe(false);
    expect(await optionsRpyOf(project)).not.toContain('config.window_icon');
    // ico 는 blob 이 살아 있으니 그대로 나가야 한다(한쪽 유실이 다른 쪽을 죽이면 안 된다).
    expect(paths.has(GAME_ICON_FILE)).toBe(true);
  });

  it('blob 이 사라진 ico 는 루트 파일을 안 낸다', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'ico-gone' ? undefined : new Blob([`stub:${id}`], { type: 'image/png' }),
    );
    expect((await pathsOf(projectWith({ ico: 'ico-gone' }))).has(GAME_ICON_FILE)).toBe(false);
  });
});

describe('.npproj.zip 내보내기 확장자', () => {
  it('ico mime 은 .ico 로 저장된다(예전엔 .png 로 잘못 붙었다)', () => {
    expect(extFor('image/x-icon')).toBe('ico');
    expect(extFor('image/vnd.microsoft.icon')).toBe('ico');
  });

  it('기존 매핑은 그대로', () => {
    expect(extFor('image/png')).toBe('png');
    expect(extFor('image/jpeg')).toBe('jpg');
    expect(extFor('audio/mpeg')).toBe('mp3');
  });
});
