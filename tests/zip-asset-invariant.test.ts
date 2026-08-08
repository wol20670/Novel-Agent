// 불변식: collectProjectFiles() 가 만든 .rpy 텍스트가 참조하는 모든 에셋 경로는
// 같은 결과의 파일 목록에 실제로 존재해야 한다. 어긋나면 lint 는 통과하지만(스텁으로 채워짐)
// 실제 Ren'Py 실행은 "파일을 찾을 수 없음" 런타임 크래시가 난다(CLAUDE.md 최상위 함정).
//
// vitest 는 기본 node 환경으로 돈다(vite.config.ts 에 test 블록 없음) — collectProjectFiles 가
// 물고 들어오는 브라우저 전용 코드(IndexedDB 에셋 저장소, Canvas 폴백 생성기, 폰트 캐시의 FontFace/
// IndexedDB)는 전부 모킹한다. src/fonts/fontCatalog 는 모킹하지 않는다 — VITE_FONTS_BASE_URL 이
// 테스트 환경엔 없어 loadFontCatalog() 가 네트워크 없이 기본 폰트만 담긴 카탈로그로 즉시 끝나므로
// (fontsBaseUrl() === '' → catalogCache = [DEFAULT_FONT]) 모킹할 이유 자체가 없다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectProjectFiles } from '../src/zip/buildZip';
import {
  emptyProject,
  MAIN_MENU_PRESETS,
  MAIN_MENU_SLOTS,
  MENU_BUTTON_STATES,
  menuButtonFile,
  QUICK_MENU_SLOTS,
  QUICK_BUTTON_STATES,
  quickButtonFile,
  QUICK_PANEL_FILE,
  ESC_IMAGES,
  escImageFile,
  type Character,
  type EscImageId,
  type MainMenuPresetId,
  type MenuButtonSlot,
  type MenuButtonState,
  type Project,
  type QuickButtonSlot,
  type QuickButtonState,
  type Scene,
} from '../src/types';
import { getAsset } from '../src/storage/assetStore';
import { ensureFontBlob, ensureFontLicense } from '../src/fonts/fontCache';

// ── 모킹 ─────────────────────────────────────────────────────────────────────
// vi.mock 팩토리는 파일 최상단으로 호이스팅되므로 바깥 스코프 변수를 참조하지 않고
// 전부 팩토리 안에서 완결시킨다(Blob 은 Node 전역이라 안전하게 새로 만들 수 있다).

vi.mock('../src/storage/assetStore', () => ({
  // "에셋이 존재한다"가 기본 케이스가 되도록 임의 id 에 대해 항상 fake Blob 을 돌려준다.
  // (a) 테스트가 특정 id 만 undefined 로 override 한다.
  getAsset: vi.fn(async (id: string) => new Blob([`stub:${id}`], { type: 'image/png' })),
}));

vi.mock('../src/generators/image/canvasProvider', () => ({
  canvasImage: vi.fn(async () => new Blob(['stub:canvas-image'], { type: 'image/png' })),
}));

vi.mock('../src/generators/image/canvasSprite', () => ({
  canvasSprite: vi.fn(async () => new Blob(['stub:canvas-sprite'], { type: 'image/png' })),
}));

// canvasMenu 는 buttonBgAssets/quickPillAssets 처럼 Canvas 를 전혀 안 쓰는 순수 함수(색상 목록
// 반환)도 내보낸다 — 이 둘은 실제 구현을 그대로 쓰고, Canvas 를 쓰는 4개(menuBackdropPng/solidPng/
// textboxGradientPng/roundedPillPng)만 Blob 을 즉시 반환하도록 바꾼다.
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

// createImageBitmap/document 를 전역에 심지 않는다 — buildZip.ts 의 trimSpriteMargins() 은 자체
// try/catch 로 감싸여 있어(createImageBitmap 이 undefined 라 호출 자체가 TypeError) catch 가 원본
// blob 을 그대로 반환한다. fetch 도 OFL.txt/SourceHanSansLite.ttf 호출부가 `.catch(() => null)` 로
// 감싸여 있어 기본적으로는 모킹이 필요 없다 — 단, 일본어 로케일 테스트(5, (c))는 예외다: 그 두
// 경로에서 fetch 가 "실패"하면(Node 에서 상대 경로 fetch 는 항상 실패한다) SourceHanSansLite.ttf
// 파일 자체가 안 만들어져, guiRpy 가 내는 참조와 어긋나는 게 "코드 버그"가 아니라 "테스트 환경에
// 서버가 없어서" 생기는 거짓 실패가 된다 — 그 두 테스트에서만 withFetchStub() 으로 국소적으로 채운다.

// ── 테스트 픽스처 ─────────────────────────────────────────────────────────────

function fakeBlob(id: string, type = 'image/png'): Blob {
  return new Blob([`stub:${id}`], { type });
}

/** 매트릭스 항목 1(기본/빈 프로젝트) — 스프라이트·아이템·CG·음성·메뉴 아트 전부 없음. */
function plainScene(id: string, title: string): Scene {
  return {
    id,
    title,
    direction: [],
    cg: [],
    lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕' }],
    choices: [],
    status: 'approved',
  };
}

function plainProject(): Project {
  return { ...emptyProject(), scenes: [plainScene('s1', '장면1'), plainScene('s2', '장면2')], characters: [] };
}

/** 매트릭스 항목 2~7 용 "종합 세트" 장면 — 배경/BGM/CG/아이템/음성/선택지를 전부 갖춘다. */
function kitchenScene(): Scene {
  return {
    id: 's1',
    title: '장면1',
    background: '교실',
    bgm: '테마곡',
    direction: ['노을'],
    cg: ['노을 아래 재회'],
    cgAssetIds: ['asset-cg-1'],
    lines: [
      { kind: 'dialogue', speaker: '민주', text: '안녕', voiceAssetIds: { ko: 'asset-voice-1' } },
      { kind: 'item', name: '편지' },
      { kind: 'item', name: '' }, // #아이템끝
      { kind: 'cg', desc: '노을 아래 재회' },
      { kind: 'narration', text: '내레이션' },
    ],
    choices: [{ text: '선택1' }],
    status: 'approved',
    backgroundAssetId: 'asset-bg-1',
    bgmAssetId: 'asset-bgm-1',
  };
}

function kitchenCharacter(): Character {
  return { name: '민주', color: '#ffaacc', expressions: { 기본: 'asset-sprite-1', 기쁨: 'asset-sprite-2' } };
}

function kitchenSinkProject(overrides: Partial<Project> = {}): Project {
  return {
    ...emptyProject(),
    scenes: [kitchenScene()],
    characters: [kitchenCharacter()],
    itemAssetIds: { 편지: 'asset-item-1' },
    ...overrides,
  };
}

/** 6슬롯 × 4상태(press 포함 — renpySupported=false 라 출력엔 안 나가야 정상) 전부 업로드 + 로고. */
function allButtonsMainMenuUi(): NonNullable<Project['mainMenuUi']> {
  const buttons: Partial<Record<MenuButtonSlot, Partial<Record<MenuButtonState, string>>>> = {};
  for (const slot of MAIN_MENU_SLOTS) {
    const states: Partial<Record<MenuButtonState, string>> = {};
    for (const state of MENU_BUTTON_STATES) states[state.id] = `asset-btn-${slot.id}-${state.id}`;
    buttons[slot.id] = states;
  }
  return { buttons, logo: 'asset-logo-1' };
}

/** 10슬롯 × 5상태(press 포함 — renpySupported=false 라 출력엔 안 나가야 정상) 전부 업로드 + 보조 패널. */
function allButtonsQuickMenuUi(): NonNullable<Project['quickMenuUi']> {
  const buttons: Partial<Record<QuickButtonSlot, Partial<Record<QuickButtonState, string>>>> = {};
  for (const slot of QUICK_MENU_SLOTS) {
    const states: Partial<Record<QuickButtonState, string>> = {};
    for (const state of QUICK_BUTTON_STATES) states[state.id] = `asset-qbtn-${slot.id}-${state.id}`;
    buttons[slot.id] = states;
  }
  return { buttons, panel: 'asset-quick-panel-1' };
}

/** ESC 메뉴 23개 역할 전부 업로드(슬롯×상태 격자가 아니라 역할 하나짜리 평평한 맵). */
function allEscImages(): NonNullable<Project['escMenuUi']> {
  const images: Partial<Record<EscImageId, string>> = {};
  for (const img of ESC_IMAGES) images[img.id] = `asset-esc-${img.id}`;
  return { images };
}

/** gui.rpy/screens.rpy(텍스트)가 참조하는 game/ 상대 경로 중, files 목록에 실제로 없는 것들. */
async function danglingRefs(project: Project): Promise<string[]> {
  const { files } = await collectProjectFiles(project);
  const written = new Set(files.map((f) => f.path.replace(/^game\//, '')));
  const text = files
    .filter((f): f is { path: string; data: string } => typeof f.data === 'string')
    .map((f) => f.data)
    .join('\n');
  // 음성 파일(game/voices/<locale>/...)은 일부러 이 스캔에서 뺐다 — voiceBaseName(generate.ts)이
  // 결정론적 파일명을 만들긴 하지만, voices.rpy 의 vo() 는 그 이름을 리터럴 문자열이 아니라
  // "voices/%s/%s.%s" 런타임 % 포맷팅(+ renpy.loadable 소프트 체크, 없으면 무음 폴백)으로 조립한다
  // (실측: prefix 를 "voices"로 넣으면 이 %s 템플릿 문자열 자체가 "참조"로 잡혀 거짓 댕글링이
  // 뜬다 — 실제로 이 파일로 확인함). 즉 정적 텍스트에는 완결된 "voices/xxx" 리터럴이 애초에
  // 나오지 않고, 없어도 vo() 가 조용히 무음으로 넘어가도록 설계돼 있어(script.rpy 를 깨뜨리지
  // 않음) 이 불변식(참조 → 반드시 존재)의 대상이 아니다.
  const referenced = [...text.matchAll(/"((?:images|gui|fonts|audio)\/[^"]+)"/g)].map((m) => m[1]);
  return [...new Set(referenced)].filter((r) => !written.has(r));
}

async function expectNoDangling(project: Project): Promise<void> {
  const dangling = await danglingRefs(project);
  expect(dangling, `참조되었지만 실제 파일 목록에 없는 경로: ${dangling.join(', ') || '(없음)'}`).toEqual([]);
}

/** ja 로케일 테스트 전용 — OFL.txt/SourceHanSansLite.ttf 의 상대경로 fetch 를 성공으로 스텁한다. */
async function withFetchStub<T>(fn: () => Promise<T>): Promise<T> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      blob: async () => fakeBlob('fetched-font', 'font/ttf'),
      text: async () => 'OFL stub',
    })),
  );
  try {
    return await fn();
  } finally {
    vi.unstubAllGlobals();
  }
}

beforeEach(() => {
  // 이전 테스트가 override 한 구현을 되돌려 "에셋/폰트 blob 은 항상 존재"를 매 테스트의 출발점으로 삼는다.
  vi.mocked(getAsset).mockImplementation(async (id: string) => fakeBlob(id));
  vi.mocked(ensureFontBlob).mockImplementation(async () => fakeBlob('font-blob', 'font/ttf'));
  vi.mocked(ensureFontLicense).mockImplementation(async () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 매트릭스: 다양한 프로젝트 설정에서 불변식이 항상 성립하는지 ──────────────────

describe('zip 에셋 불변식 매트릭스', () => {
  it('1) 기본(빈) 프로젝트 + 승인 장면 2개 — 스프라이트/아이템/CG/메뉴아트 전부 미사용', async () => {
    await expectNoDangling(plainProject());
  });

  it('2) 메인 메뉴 6슬롯 × 전 상태 업로드 + 타이틀 로고', async () => {
    await expectNoDangling(kitchenSinkProject({ mainMenuUi: allButtonsMainMenuUi() }));
  });

  it('3) 메인 메뉴 버튼 일부만 업로드(부분 커버리지 — 나머지는 텍스트 버튼 폴백)', async () => {
    await expectNoDangling(
      kitchenSinkProject({
        mainMenuUi: {
          buttons: {
            start: { idle: 'asset-btn-start-idle' },
            gallery: { idle: 'asset-btn-gallery-idle', hover: 'asset-btn-gallery-hover' },
          },
        },
      }),
    );
  });

  it('4) 커스텀 본문/이름/메뉴 폰트 id 지정', async () => {
    await expectNoDangling(
      kitchenSinkProject({
        guiOverrides: { bodyFontId: 'custom-body', nameFontId: 'custom-name' },
        mainMenuUi: { menuFontId: 'custom-menu', menuSubFontId: 'custom-menu-sub' },
      }),
    );
  });

  it('5) 자막 로케일에 일본어 포함 — guiRpy 의 FontGroup(fg.add) 참조', async () => {
    await withFetchStub(async () => {
      await expectNoDangling(kitchenSinkProject({ textLocales: ['ko', 'ja'] }));
    });
  });

  it('6-a) 대사창 그라데이션 켜짐(gui/textbox.png)', async () => {
    await expectNoDangling(kitchenSinkProject({ guiOverrides: { dialogueGradient: true } }));
  });

  it('6-b) 대사창 그라데이션 꺼짐(단색 박스)', async () => {
    await expectNoDangling(kitchenSinkProject({ guiOverrides: { dialogueGradient: false } }));
  });

  for (const presetId of Object.keys(MAIN_MENU_PRESETS) as MainMenuPresetId[]) {
    it(`7) 메인 메뉴 프리셋 — ${presetId}`, async () => {
      await expectNoDangling(kitchenSinkProject({ mainMenuUi: { preset: presetId } }));
    });
  }

  it('8) 퀵메뉴 10슬롯 × 전 상태 업로드 + 보조 패널', async () => {
    await expectNoDangling(kitchenSinkProject({ quickMenuUi: allButtonsQuickMenuUi() }));
  });

  it('9) ESC 메뉴 23종 역할 전부 업로드(bg 포함 — game/gui/game_menu.png 로 옮겨 씀)', async () => {
    await expectNoDangling(kitchenSinkProject({ escMenuUi: allEscImages() }));
  });
});

// ── 타겟 회귀 3건 ────────────────────────────────────────────────────────────

describe('회귀 (a): 메뉴 버튼 assetId 는 있지만 실제 blob 이 사라진 경우(고아 참조)', () => {
  it('screens.rpy 는 blob 이 사라진 상태를 아예 참조하지 않는다(gui.rpy 생성 전에 미리 가지치기)', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'asset-btn-start-idle' ? undefined : fakeBlob(id),
    );
    const project = kitchenSinkProject({
      mainMenuUi: { buttons: { start: { idle: 'asset-btn-start-idle' } } },
    });
    // 고쳐지기 전엔 여기서 [menuButtonFile('start','idle')] 이 나왔다(참조는 하는데 파일은 안 씀).
    // 지금은 resolveMainMenuArt 가 blob 없는 상태를 gui.rpy 생성 전에 걸러내 애초에 참조가 없다 —
    // 유일한 버튼도 사라지므로 buildMainMenuPlan 자체가 비활성화되고 기존 텍스트 메뉴로 폴백한다.
    await expectNoDangling(project);
  });

  it('타이틀 로고도 같은 패턴 — logo blob 이 없으면 로고 없이(버튼은 유지) 안전하게 폴백한다', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'asset-logo-missing' ? undefined : fakeBlob(id),
    );
    const project = kitchenSinkProject({
      mainMenuUi: { buttons: { start: { idle: 'asset-btn-start-idle' } }, logo: 'asset-logo-missing' },
    });
    // 로고만 가지치기되고(hasLogo=false) start 버튼은 blob 이 있으니 그대로 살아남는다 — 정상 버튼과
    // 파일까지 확인하려고 danglingRefs 대신 files 목록을 직접 검사한다.
    const { files } = await collectProjectFiles(project);
    const written = new Set(files.map((f) => f.path));
    expect(written.has(`game/${menuButtonFile('start', 'idle')}`)).toBe(true);
    expect(written.has('game/gui/title_logo.png')).toBe(false);
    await expectNoDangling(project);
  });
});

describe('회귀 (b): 폰트 다운로드가 전면 실패(기본/번들 폰트 포함)', () => {
  it('ensureFontBlob 이 전부 실패해도 gui.rpy 는 fonts/NanumGothic.ttf 를 참조하지 않는다(엔진 내장 DejaVuSans.ttf 로 대체)', async () => {
    vi.mocked(ensureFontBlob).mockImplementation(async () => undefined);
    const project = kitchenSinkProject();
    // 고쳐지기 전엔 여기서 ['fonts/NanumGothic.ttf'] 가 나왔다(파일 없이 참조만 함 → 실행 불가 zip).
    // 지금은 generateRenpyFiles 가 fontFallback 신호를 받아 gui.text_font 등을 "DejaVuSans.ttf"
    // (game/fonts/ 접두사 없음 — 엔진 common 내장이라 번들 자체가 필요 없음)로 낸다. danglingRefs 의
    // 정규식은 images/gui/fonts/audio/ 접두사가 붙은 참조만 추적하므로, 접두사 없는 이 값은 애초에
    // "번들해야 할 파일 참조"로 잡히지도 않는다(의도된 동작 — 확인만 별도로 한다).
    await expectNoDangling(project);
    const { files } = await collectProjectFiles(project);
    const guiRpy = files.find((f) => f.path === 'game/gui.rpy');
    expect(typeof guiRpy?.data).toBe('string');
    expect(guiRpy!.data as string).toContain('gui.text_font = "DejaVuSans.ttf"');
    expect(guiRpy!.data as string).not.toContain('fonts/NanumGothic.ttf');
  });
});

describe('회귀 (c): 일본어 폰트 참조(guiRpy opts.locales) vs 번들 조건(buildZip includeJapanese)', () => {
  it('ja 로케일 + 커스텀 폰트 id 조합에서도 현재 코드는 항상 일치한다(재현 불가 — 아래 report 의 결론 참고)', async () => {
    await withFetchStub(async () => {
      const project = kitchenSinkProject({
        textLocales: ['ko', 'ja'],
        voiceLocales: ['ko', 'ja'],
        guiOverrides: { bodyFontId: 'custom-body' },
        mainMenuUi: { menuFontId: 'custom-menu' },
      });
      const dangling = await danglingRefs(project);
      expect(dangling).toEqual([]);
    });
  });
});

describe('회귀 (d): 퀵메뉴 버튼/패널 assetId 는 있지만 실제 blob 이 사라진 경우(고아 참조)', () => {
  it('resolveQuickMenuArt 가 blob 없는 상태를 gui.rpy 생성 전에 가지치기한다', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'asset-qbtn-history-idle' ? undefined : fakeBlob(id),
    );
    const project = kitchenSinkProject({
      quickMenuUi: { buttons: { history: { idle: 'asset-qbtn-history-idle' } } },
    });
    // 고쳐지기 전 재현은 main-menu 쪽 회귀 (a)와 동일한 형태 — resolveQuickMenuArt 가 blob 없는
    // 상태를 미리 걸러내 애초에 참조가 없어야 한다.
    await expectNoDangling(project);
  });

  it('패널도 같은 패턴 — blob 없으면 패널 없이(버튼은 유지) 안전하게 폴백한다', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'asset-quick-panel-missing' ? undefined : fakeBlob(id),
    );
    const project = kitchenSinkProject({
      quickMenuUi: {
        buttons: { history: { idle: 'asset-qbtn-history-idle' } },
        panel: 'asset-quick-panel-missing',
      },
    });
    const { files } = await collectProjectFiles(project);
    const written = new Set(files.map((f) => f.path));
    expect(written.has(`game/${quickButtonFile('history', 'idle')}`)).toBe(true);
    expect(written.has(`game/${QUICK_PANEL_FILE}`)).toBe(false);
    await expectNoDangling(project);
  });
});

describe('회귀 (e): ESC 메뉴 이미지 assetId 는 있지만 실제 blob 이 사라진 경우(고아 참조)', () => {
  it('resolveEscMenuArt 가 blob 없는 역할을 gui.rpy 생성 전에 가지치기한다', async () => {
    vi.mocked(getAsset).mockImplementation(async (id: string) =>
      id === 'asset-esc-nav-idle-missing' ? undefined : fakeBlob(id),
    );
    const project = kitchenSinkProject({
      escMenuUi: { images: { nav_idle: 'asset-esc-nav-idle-missing', nav_hover: 'asset-esc-nav-hover' } },
    });
    const { files } = await collectProjectFiles(project);
    const written = new Set(files.map((f) => f.path));
    // 고쳐지기 전엔 여기서 [escImageFile('nav_idle')] 이 나왔다(참조는 하는데 파일은 안 씀).
    // 지금은 blob 없는 역할만 조용히 빠지고, blob 있는 역할(nav_hover)은 정상적으로 살아남는다.
    expect(written.has(`game/${escImageFile('nav_idle')}`)).toBe(false);
    expect(written.has(`game/${escImageFile('nav_hover')}`)).toBe(true);
    await expectNoDangling(project);
  });
});

describe("회귀 (f): ESC 메뉴 'bg'(공통 배경)는 game/gui/game_menu.png 를 대체하고 escImageFile('bg') 경로는 쓰지 않는다", () => {
  it("escMenuUi.images.bg 가 project.menuArt.game 보다 우선한다", async () => {
    const project = kitchenSinkProject({
      menuArt: { game: 'asset-menu-game-1' },
      escMenuUi: { images: { bg: 'asset-esc-bg' } },
    });
    const { files } = await collectProjectFiles(project);
    const gameMenu = files.find((f) => f.path === 'game/gui/game_menu.png');
    expect(gameMenu).toBeDefined();
    // menuArt.game('asset-menu-game-1')이 아니라 esc bg('asset-esc-bg') blob 이 실제로 쓰여야 한다.
    expect(await (gameMenu!.data as Blob).text()).toBe('stub:asset-esc-bg');
    // escImageFile('bg') = 'gui/esc/bg.png' 자리엔 파일을 두 번 안 쓴다(둘로 안 늘린다).
    expect(files.some((f) => f.path === `game/${escImageFile('bg')}`)).toBe(false);
    await expectNoDangling(project);
  });

  it('bg 가 없으면 기존처럼 menuArt.game → 그라데이션 폴백 순서를 그대로 따른다(회귀 0)', async () => {
    const project = kitchenSinkProject({ menuArt: { game: 'asset-menu-game-1' } });
    const { files } = await collectProjectFiles(project);
    const gameMenu = files.find((f) => f.path === 'game/gui/game_menu.png');
    expect(gameMenu).toBeDefined();
    expect(await (gameMenu!.data as Blob).text()).toBe('stub:asset-menu-game-1');
  });
});
