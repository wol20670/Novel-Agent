// 승인된 장면들로 Ren'Py 프로젝트 파일 집합을 생성한다.
// 파일 본문(텍스트)만 만들고, 바이너리 에셋(PNG/WAV)은 zip 빌더가 채운다.

import type { Project, Scene, Character } from '../types';
import { SlugMap } from './slug';

export interface RenpyFile {
  path: string; // game/ 이하 경로
  content: string;
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

function characterDefs(project: Project, charSlug: SlugMap): string {
  const lines = ['# 자동 생성: 캐릭터 정의', ''];
  for (const c of project.characters) {
    const id = charSlug.get(c.name);
    lines.push(`define ${id} = Character("${esc(c.name)}", color="${c.color}")`);
  }
  if (project.characters.length === 0) lines.push('# (등장 캐릭터 없음)');
  return lines.join('\n') + '\n';
}

function assetDefs(refs: SceneAssetRef[]): string {
  const lines = ['# 자동 생성: 이미지·오디오 에셋 정의', ''];
  for (const r of refs) {
    lines.push(`image ${r.bgTag} = "images/${r.bgFile}"`);
    r.cgTags.forEach((tag, j) => {
      lines.push(`image ${tag} = "images/${r.cgFiles[j]}"`);
    });
  }
  return lines.join('\n') + '\n';
}

function scriptBody(refs: SceneAssetRef[], charSlug: SlugMap): string {
  const resolve = makeResolver(refs);
  const out: string[] = [];
  out.push('# 자동 생성: 메인 스크립트', '');
  out.push('label start:');
  if (refs.length > 0) out.push(`    jump ${refs[0].label}`);
  else out.push('    "승인된 장면이 없습니다."', '    return');
  out.push('');

  for (const r of refs) {
    const s = r.scene;
    out.push(`# ── ${s.title} ──`);
    out.push(`label ${r.label}:`);
    out.push(`${indent(1)}scene ${r.bgTag} with fade`);
    if (r.bgmFile) out.push(`${indent(1)}play music "audio/${r.bgmFile}" fadein 1.0`);
    // CG 컷
    r.cgTags.forEach((tag) => out.push(`${indent(1)}show ${tag} with dissolve`));
    if (s.direction.length) out.push(`${indent(1)}# 연출: ${s.direction.join(' / ')}`);

    for (const line of s.lines) {
      if (line.kind === 'dialogue') {
        const id = charSlug.get(line.speaker);
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
    '',
    `## 저자: ${esc(project.author)}`,
    `init python:`,
    `    config.screen_width = ${project.width}`,
    `    config.screen_height = ${project.height}`,
    '',
  ].join('\n');
}

// 버전에 거의 안 타는 최소 자립형 화면 정의.
// - 메인메뉴를 건너뛰고 바로 start (label main_menu: return 트릭)
// - 게임메뉴(Esc/우클릭) 비활성화 → 누락 화면 오류 방지
// - say/choice 만 직접 정의(화면 언어 핵심 — 7.x~8.x 안정).
// 정식 출시 시에는 Ren'Py 런처의 풀 GUI 프로젝트로 교체할 것.
const SCREENS_RPY = `# 자동 생성: 최소 자립형 화면 (테스트용)
# 정식 출시 전에는 Ren'Py 런처가 만든 풀 GUI(screens.rpy/gui.rpy)로 교체하세요.

# 메인 메뉴를 건너뛰고 곧바로 start 로 진입
label main_menu:
    return

init python:
    # 최소 구성에서 누락된 화면으로 인한 오류를 막기 위해 게임 메뉴를 비활성화
    config.keymap['game_menu'] = []
    config.keymap['hide_windows'] = []

# 대사 화면 — 하단 반투명 박스 + 흰 글씨
screen say(who, what):
    window:
        style "empty"
        background "#000000cc"
        xfill True
        yalign 1.0
        xpadding 50
        ypadding 28
        vbox:
            spacing 6
            if who is not None:
                text who color "#ffd479" size 28 bold True
            text what color "#ffffff" size 26

# 선택지 화면 — 화면 중앙 버튼 목록
screen choice(items):
    vbox:
        xalign 0.5
        yalign 0.5
        spacing 14
        for i in items:
            textbutton i.caption:
                action i.action
                xpadding 36
                ypadding 12
                background "#00000099"
                hover_background "#6366f1cc"
                text_color "#ffffff"
                text_size 26
                text_xalign 0.5
`;

const README = `# Ren'Py 프로젝트 (Novel-Agent 자동 생성)

## 실행 방법 (간편 — 최소 자립형)
1. Ren'Py SDK (https://www.renpy.org/) 설치 후 런처 실행
2. 이 폴더를 런처의 projects 디렉터리에 두거나, 런처에서 프로젝트로 추가
3. 프로젝트 선택 → Launch Project
   → 메인 메뉴 없이 곧바로 첫 장면이 재생됩니다.

이 프로젝트는 버전에 안정적인 최소 화면(대사/선택지)만 포함해 바로 실행되도록 만들어졌습니다.
화면 모양은 검은 박스 + 흰 글씨의 소박한 테스트용입니다.

## 폴백 (위가 안 될 때 — 항상 작동)
1. 런처에서 "새 프로젝트 만들기"로 빈 프로젝트 생성(해상도 동일하게)
2. 그 프로젝트의 game/ 안에 이 폴더의 다음만 복사:
   script.rpy, characters.rpy, assets.rpy, images/, audio/
   (options.rpy, screens.rpy 는 복사하지 말 것 — 새 프로젝트 것과 충돌)
3. 새 프로젝트의 기본 script.rpy 는 우리 것으로 덮어쓰기 → Launch

## 포함 파일
- game/script.rpy     : 승인된 장면의 대사·연출·분기
- game/characters.rpy : 캐릭터 정의
- game/assets.rpy     : 이미지·오디오 에셋 정의
- game/options.rpy    : 해상도·제목·저자
- game/screens.rpy    : 최소 자립형 화면(대사/선택지) — 정식 출시 시 풀 GUI 로 교체
- game/images/        : 배경/CG PNG (생성된 것 또는 임시)
- game/audio/         : BGM WAV

## 상업 배포 전
- 임시 배경/합성 BGM 은 테스트용입니다. 정식 일러스트·BGM·SFX 로 교체하세요.
- screens.rpy 를 Ren'Py 런처의 풀 GUI(screens.rpy/gui.rpy)로 교체하세요.
- 폰트 라이선스(OFL 등) 를 확인하세요.
- 실제 Windows 환경에서 Ren'Py 빌드를 테스트하세요.
`;

/** Ren'Py 텍스트 파일 전체를 생성한다. */
export function generateRenpyFiles(project: Project): {
  files: RenpyFile[];
  refs: SceneAssetRef[];
  characters: Character[];
} {
  const refs = resolveSceneAssets(project);
  const charSlug = new SlugMap('c');

  const files: RenpyFile[] = [
    { path: 'game/script.rpy', content: scriptBody(refs, charSlug) },
    { path: 'game/characters.rpy', content: characterDefs(project, charSlug) },
    { path: 'game/assets.rpy', content: assetDefs(refs) },
    { path: 'game/options.rpy', content: optionsRpy(project) },
    { path: 'game/screens.rpy', content: SCREENS_RPY },
    { path: 'README.md', content: README },
  ];
  return { files, refs, characters: project.characters };
}
