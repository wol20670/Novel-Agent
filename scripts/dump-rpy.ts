// 출력 회귀 0 증명용 덤프 — 여러 구성으로 generateRenpyFiles 를 돌려 .rpy 텍스트를 폴더에 쓴다.
// 생성기(generate.ts / gui/*)를 건드리는 작업에서 "기능을 안 켠 프로젝트의 출력은 1바이트도
// 안 달라진다"를 증명하는 데 쓴다(CLAUDE.md "출력 회귀 0 증명법").
//
//   npm run dump:rpy -- <출력폴더>        # 작업 전 커밋에서 한 번
//   ...작업...
//   npm run dump:rpy -- <출력폴더2>       # 작업 후
//   diff -r <출력폴더> <출력폴더2>        # 아무것도 안 나와야 정상
//
// ⚠️ 출력 폴더는 **OneDrive 밖**(스크래치패드 등)으로 줄 것 — 리포 안에 쓰면 vite/esbuild 와 같은
// exit 127 함정에 걸려 조용히 옛 산출물이 남고, 그걸 통과로 착각하게 된다(CLAUDE.md 환경 함정).
// 완료 로그("덤프 완료")가 안 찍혔으면 실패다.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseText } from '../src/parser/parseText';
import { generateRenpyFiles } from '../src/renpy/generate';
import {
  emptyProject,
  MAIN_MENU_PRESETS,
  MAIN_MENU_SLOTS,
  QUICK_MENU_SLOTS,
  ESC_IMAGES,
  type MainMenuPresetId,
  type Project,
} from '../src/types';
import { SAMPLE_STORY } from '../src/sample';

const OUT = process.argv[2];
if (!OUT) {
  console.error('사용법: npm run dump:rpy -- <출력폴더>  (OneDrive 밖 경로)');
  process.exit(1);
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

const { scenes, characters } = parseText(SAMPLE_STORY);
// 에셋 id 를 채워두는 이유: assetId 가 없으면 생성기가 BGM `play music` 이나 스프라이트 선언 자체를
// 내지 않아(업로드 게이팅) 정작 대조하고 싶은 출력 경로가 덤프에서 빠진다.
const base = (): Project => ({
  ...emptyProject(),
  scenes: scenes.map((s) => ({
    ...s,
    status: 'approved' as const,
    bgmAssetId: s.bgm ? 'a-bgm' : undefined,
  })),
  characters: characters.map((c) => ({ ...c, expressions: { ...c.expressions, 기본: 'a-sp' } })),
});

const allMenuButtons = Object.fromEntries(
  MAIN_MENU_SLOTS.map((s) => [s.id, { idle: `a-btn-${s.id}`, hover: `a-btn-${s.id}-h` }]),
) as NonNullable<Project['mainMenuUi']>['buttons'];
const allQuickButtons = Object.fromEntries(
  QUICK_MENU_SLOTS.map((s) => [s.id, { idle: `a-q-${s.id}` }]),
) as NonNullable<Project['quickMenuUi']>['buttons'];
const allEscImages = Object.fromEntries(ESC_IMAGES.map((i) => [i.id, `a-esc-${i.id}`])) as NonNullable<
  NonNullable<Project['escMenuUi']>['images']
>;

// 의상 구성 — 장면 단위 의상(#복장)과 배경 키워드 규칙 두 경로가 실제 `show` 문에 반영되는지
// 대조하기 위한 구성. ⚠️ 아무 캐릭터나 고르면 안 된다 — 주인공(isProtagonist)이나 스프라이트가
// 없는 화자를 고르면 생성기가 애초에 show 를 안 내서 plain 과 똑같은 덤프가 나온다(실제로 겪음).
// 그래서 "실제로 대사를 하는 비주인공 화자"를 대본에서 찾아 쓴다.
function withOutfits(): Project {
  const p = base();
  const spriteOwner = p.scenes
    .flatMap((s) => s.lines.map((l) => ({ scene: s, line: l })))
    .find(
      ({ line }) =>
        line.kind === 'dialogue' &&
        !line.members?.length &&
        p.characters.some((c) => c.name === line.speaker && !c.isProtagonist),
    );
  if (!spriteOwner || spriteOwner.line.kind !== 'dialogue') return p;
  const name = spriteOwner.line.speaker;
  const target = p.characters.find((c) => c.name === name)!;
  // 의상 세트는 기본 의상과 같은 표정 키를 채운다 — 비면 생성기가 기본 의상으로 폴백해버려
  // 역시 의상 경로가 덤프에 안 남는다.
  const outfitExprs = Object.fromEntries(
    Object.keys(target.expressions).map((e) => [e, `a-sp-uniform-${e}`]),
  );
  const bg = spriteOwner.scene.background ?? '';
  return {
    ...p,
    characters: p.characters.map((c) =>
      c.name === name ? { ...c, outfits: [{ name: '교복', expressions: outfitExprs }] } : c,
    ),
    // 규칙(배경 키워드)과 장면 직접 지정을 둘 다 켜 우선순위 경로까지 함께 굳힌다.
    outfitRules: bg ? [{ charName: name, outfit: '교복', keyword: bg.slice(0, 2) }] : [],
    scenes: p.scenes.map((s) => (s.id === spriteOwner.scene.id ? { ...s, outfits: { [name]: '교복' } } : s)),
  };
}

const configs: Record<string, Project> = {
  plain: base(),
  'genre-thriller': { ...base(), genre: 'thriller' },
  'gradient-on': { ...base(), guiOverrides: { dialogueGradient: true } },
  'gradient-off': { ...base(), guiOverrides: { dialogueGradient: false } },
  i18n: { ...base(), textLocales: ['ko', 'en', 'ja'], voiceLocales: ['ko', 'ja'] },
  'menu-images': { ...base(), mainMenuUi: { buttons: allMenuButtons, logo: 'a-logo' } },
  'quick-images': { ...base(), quickMenuUi: { buttons: allQuickButtons, panel: 'a-qpanel' } },
  'esc-images': { ...base(), escMenuUi: { images: allEscImages } },
  'esc+menu+quick': {
    ...base(),
    mainMenuUi: { buttons: allMenuButtons, logo: 'a-logo' },
    quickMenuUi: { buttons: allQuickButtons, panel: 'a-qpanel' },
    escMenuUi: { images: allEscImages, fontId: 'nanum-gothic' },
  },
  'bgm-restart': { ...base(), bgmPlayback: { restartSameBgm: true } },
  'bgm-stop-unset': { ...base(), bgmPlayback: { stopWhenUnset: true } },
  'title-bgm': { ...base(), titleBgm: { assetId: 'a-title', ext: 'mp3' } },
  'player-name': { ...base(), playerName: { character: characters[0]?.name ?? '' } },
  'game-icon': { ...base(), gameIcon: { ico: 'a-ico', window: 'a-win' } },
  'menu-art': { ...base(), menuArt: { main: 'a-main' } },
  outfits: withOutfits(),
};
for (const id of Object.keys(MAIN_MENU_PRESETS) as MainMenuPresetId[]) {
  configs[`preset-${id}`] = { ...base(), mainMenuUi: { preset: id } };
}

let n = 0;
for (const [name, project] of Object.entries(configs)) {
  const { files } = generateRenpyFiles(project);
  for (const f of files) {
    const p = join(OUT, name, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, 'utf8');
    n++;
  }
}
console.log(`덤프 완료: ${Object.keys(configs).length}구성 / ${n}파일 → ${OUT}`);
