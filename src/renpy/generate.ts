// 승인된 장면들로 Ren'Py 프로젝트 파일 집합을 생성한다.
// 파일 본문(텍스트)만 만들고, 바이너리 에셋(PNG/WAV)은 zip 빌더가 채운다.

import type { Project, Scene, Character, Expression } from '../types';
import { SlugMap } from './slug';
import { generateGuiFiles, resolveTheme } from './gui';

export interface RenpyFile {
  path: string; // game/ 이하 경로
  content: string;
}

/** 한글 표정 → Ren'Py 이미지 속성(ASCII). 이미지 attribute 는 ASCII 가 안전. */
export const EXPR_ATTR: Record<Expression, string> = {
  기본: 'neutral',
  기쁨: 'happy',
  슬픔: 'sad',
  화남: 'angry',
  놀람: 'surprised',
  수줍음: 'shy',
};

export interface SpriteRef {
  charId: string; // c_1 …
  charName: string;
  expr: Expression;
  attr: string; // neutral/happy/…
  file: string; // sprite_c_1_happy.png
  assetId: string;
}

/** 캐릭터 이름 → 안정적 Ren'Py 식별자. project.characters 순서로 발급(스프라이트와 공유). */
export function charIdMap(project: Project): Map<string, string> {
  const slug = new SlugMap('c');
  const m = new Map<string, string>();
  for (const c of project.characters) m.set(c.name, slug.get(c.name));
  return m;
}

/** 생성된 캐릭터 스프라이트(표정별 assetId 보유)만 추려 ref 로 반환. */
export function resolveSprites(project: Project, ids: Map<string, string>): SpriteRef[] {
  const out: SpriteRef[] = [];
  for (const c of project.characters) {
    const charId = ids.get(c.name);
    if (!charId) continue;
    for (const expr of Object.keys(c.expressions) as Expression[]) {
      const assetId = c.expressions[expr];
      if (!assetId) continue;
      const attr = EXPR_ATTR[expr] ?? 'neutral';
      out.push({ charId, charName: c.name, expr, attr, file: `sprite_${charId}_${attr}.png`, assetId });
    }
  }
  return out;
}

/** 승인 장면에 부여되는 결정적 에셋 이름(ordinal 기반). zip 빌더와 규칙을 공유한다. */
export interface SceneAssetRef {
  scene: Scene;
  ordinal: number; // 1-based, 승인 장면 순서
  label: string;
  bgTag: string; // 배경 이미지 태그/파일베이스 (bg_1)
  bgFile: string; // bg_1.png
  bgmFile?: string; // bgm_1.wav (BGM 지정 시)
  cgTags: string[]; // cg_1_1 ...
  cgFiles: string[]; // cg_1_1.png ...
}

const indent = (n: number) => '    '.repeat(n);

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
}

/** 승인 장면 + 결정적 에셋 이름을 계산. zip 빌더가 동일 함수로 파일명을 안다. */
export function resolveSceneAssets(project: Project): SceneAssetRef[] {
  const approved = project.scenes.filter((s) => s.status === 'approved');
  return approved.map((scene, i) => {
    const ordinal = i + 1;
    const cgTags = scene.cg.map((_, j) => `cg_${ordinal}_${j + 1}`);
    return {
      scene,
      ordinal,
      label: `scene_${ordinal}`,
      bgTag: `bg_${ordinal}`,
      bgFile: `bg_${ordinal}.png`,
      bgmFile: scene.bgm || scene.bgmAssetId ? `bgm_${ordinal}.wav` : undefined,
      cgTags,
      cgFiles: cgTags.map((t) => `${t}.png`),
    };
  });
}

/** 제목 → 라벨 해석. 동명 장면은 "현재 이후 첫 매치, 없으면 전체 첫 매치". */
function makeResolver(refs: SceneAssetRef[]) {
  return (title: string | undefined, fromOrdinal: number): string | undefined => {
    if (!title) return undefined;
    const matches = refs.filter((r) => r.scene.title.trim() === title.trim());
    if (matches.length === 0) return undefined;
    const after = matches.find((m) => m.ordinal > fromOrdinal);
    return (after ?? matches[0]).label;
  };
}

function characterDefs(project: Project, ids: Map<string, string>): string {
  const lines = ['# 자동 생성: 캐릭터 정의', ''];
  for (const c of project.characters) {
    lines.push(`define ${ids.get(c.name)} = Character("${esc(c.name)}", color="${c.color}")`);
  }
  if (project.characters.length === 0) lines.push('# (등장 캐릭터 없음)');
  return lines.join('\n') + '\n';
}

function assetDefs(refs: SceneAssetRef[], sprites: SpriteRef[]): string {
  const lines = ['# 자동 생성: 이미지·오디오 에셋 정의', ''];
  for (const r of refs) {
    lines.push(`image ${r.bgTag} = "images/${r.bgFile}"`);
    r.cgTags.forEach((tag, j) => {
      lines.push(`image ${tag} = "images/${r.cgFiles[j]}"`);
    });
  }
  if (sprites.length) {
    lines.push('', '# 캐릭터 스프라이트');
    for (const sp of sprites) {
      lines.push(`image ${sp.charId} ${sp.attr} = "images/${sp.file}"`);
    }
  }
  return lines.join('\n') + '\n';
}

const POSITIONS = ['left', 'right', 'center'];

/** 한 장면 안에서 말하는 캐릭터들에게 등장 위치를 배정. 1명이면 center. */
function scenePositions(scene: Scene, ids: Map<string, string>): Map<string, string> {
  const order: string[] = [];
  for (const line of scene.lines) {
    if (line.kind !== 'dialogue') continue;
    const id = ids.get(line.speaker);
    if (id && !order.includes(id)) order.push(id);
  }
  const pos = new Map<string, string>();
  if (order.length === 1) {
    pos.set(order[0], 'center');
  } else {
    order.forEach((id, i) => pos.set(id, POSITIONS[i] ?? 'center'));
  }
  return pos;
}

function scriptBody(
  refs: SceneAssetRef[],
  ids: Map<string, string>,
  sprites: SpriteRef[],
  transition: string,
): string {
  const resolve = makeResolver(refs);
  const spritesByChar = new Map<string, SpriteRef[]>();
  for (const sp of sprites) {
    (spritesByChar.get(sp.charId) ?? spritesByChar.set(sp.charId, []).get(sp.charId)!).push(sp);
  }
  const out: string[] = [];
  out.push('# 자동 생성: 메인 스크립트', '');
  out.push('label start:');
  if (refs.length > 0) out.push(`    jump ${refs[0].label}`);
  else out.push('    "승인된 장면이 없습니다."', '    return');
  out.push('');

  for (const r of refs) {
    const s = r.scene;
    const pos = scenePositions(s, ids);
    out.push(`# ── ${s.title} ──`);
    out.push(`label ${r.label}:`);
    out.push(`${indent(1)}scene ${r.bgTag} with ${transition}`);
    if (r.bgmFile) out.push(`${indent(1)}play music "audio/${r.bgmFile}" fadein 1.0`);
    // CG 컷
    r.cgTags.forEach((tag) => out.push(`${indent(1)}show ${tag} with dissolve`));
    if (s.direction.length) out.push(`${indent(1)}# 연출: ${s.direction.join(' / ')}`);

    for (const line of s.lines) {
      if (line.kind === 'dialogue') {
        const id = ids.get(line.speaker)!;
        // 스프라이트가 있으면 화자 등장(표정 반영)
        const owned = spritesByChar.get(id);
        if (owned && owned.length) {
          const want = line.emotion ? EXPR_ATTR[line.emotion as Expression] : undefined;
          const attr =
            (want && owned.some((o) => o.attr === want) && want) ||
            (owned.some((o) => o.attr === 'neutral') ? 'neutral' : owned[0].attr);
          out.push(`${indent(1)}show ${id} ${attr} at ${pos.get(id) ?? 'center'}`);
        }
        out.push(`${indent(1)}${id} "${esc(line.text)}"`);
      } else {
        out.push(`${indent(1)}"${esc(line.text)}"`);
      }
    }

    if (s.choices.length) {
      out.push(`${indent(1)}menu:`);
      for (const ch of s.choices) {
        out.push(`${indent(2)}"${esc(ch.text)}":`);
        const target = resolve(ch.target, r.ordinal);
        out.push(`${indent(3)}${target ? `jump ${target}` : 'pass'}`);
      }
    }

    if (s.jumpTo) {
      const target = resolve(s.jumpTo, r.ordinal);
      if (target) out.push(`${indent(1)}jump ${target}`);
      else out.push(`${indent(1)}# 점프 대상 '${esc(s.jumpTo)}' 을(를) 찾지 못함`);
    }
    out.push('');
  }

  // 마지막 장면이 명시 분기 없이 끝나면 자연 종료.
  out.push('label _vn_end:');
  out.push(`${indent(1)}"— 끝 —"`);
  out.push(`${indent(1)}return`);
  return out.join('\n') + '\n';
}

function optionsRpy(project: Project): string {
  return [
    '# 자동 생성: 기본 옵션',
    `define config.name = _("${esc(project.title)}")`,
    `define config.version = "1.0"`,
    `define config.has_sound = True`,
    `define config.has_music = True`,
    `define config.window_title = "${esc(project.title)}"`,
    `define build.name = "${esc(project.title)}"`,
    `define gui.about = _("제작: ${esc(project.author)}")`,
    '',
    `## 저자: ${esc(project.author)}`,
    `init python:`,
    `    config.screen_width = ${project.width}`,
    `    config.screen_height = ${project.height}`,
    '',
  ].join('\n');
}

function readme(theme: { label: string }): string {
  return `# Ren'Py 프로젝트 (Novel-Agent 자동 생성)

적용 테마: **${theme.label}**

## 실행 방법
1. Ren'Py SDK (https://www.renpy.org/) 설치 후 런처 실행
2. 이 폴더를 런처의 projects 디렉터리에 두거나, 런처에서 프로젝트로 추가
3. 프로젝트 선택 → Launch Project
   → 자체 제작 메인 메뉴(테마 적용)가 뜨고, 시작을 누르면 첫 장면이 재생됩니다.

이 프로젝트는 **자체 제작 풀 GUI**(메인/게임 메뉴·저장/불러오기·설정·기록·도움말 등)를
포함합니다. 메뉴 배경 외 인터페이스는 전부 코드(Solid) 기반이라 외부 GUI 이미지 의존이 없습니다.

## 포함 파일
- game/script.rpy      : 승인된 장면의 대사·연출·분기
- game/characters.rpy  : 캐릭터 정의
- game/assets.rpy      : 이미지·오디오 에셋 정의
- game/options.rpy     : 해상도·제목·저자
- game/gui.rpy         : 테마 변수(색·폰트·전환) — 자체 GUI
- game/screens.rpy     : 자체 제작 화면 전체 (zero-PNG)
- game/guisupport.rpy  : gui.scale 정의
- game/gui/            : 메뉴 배경(main_menu/game_menu PNG, Canvas 생성)
- game/fonts/          : 한글 폰트(나눔고딕, OFL) + 라이선스
- game/images/         : 배경/CG/스프라이트 PNG (생성된 것 또는 임시)
- game/audio/          : BGM WAV

## 상업 배포 전
- 임시 배경/합성 BGM/Canvas 메뉴 배경은 테스트용입니다. 정식 일러스트·BGM·SFX 로 교체하세요.
- 폰트 라이선스(OFL 등) 를 확인하세요.
- 실제 Windows 환경에서 Ren'Py 빌드를 테스트하세요.
`;
}

/** Ren'Py 텍스트 파일 전체를 생성한다. */
export function generateRenpyFiles(project: Project): {
  files: RenpyFile[];
  refs: SceneAssetRef[];
  sprites: SpriteRef[];
  characters: Character[];
} {
  const refs = resolveSceneAssets(project);
  const ids = charIdMap(project);
  const sprites = resolveSprites(project, ids);
  const theme = resolveTheme(project.genre, project.guiTheme);

  const files: RenpyFile[] = [
    { path: 'game/script.rpy', content: scriptBody(refs, ids, sprites, theme.sceneTransition) },
    { path: 'game/characters.rpy', content: characterDefs(project, ids) },
    { path: 'game/assets.rpy', content: assetDefs(refs, sprites) },
    { path: 'game/options.rpy', content: optionsRpy(project) },
    ...generateGuiFiles(theme, project.width, project.height),
    { path: 'README.md', content: readme(theme) },
  ];
  return { files, refs, sprites, characters: project.characters };
}
