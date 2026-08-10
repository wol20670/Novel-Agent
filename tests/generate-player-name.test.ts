// 플레이어가 직접 정하는 주인공 이름(project.playerName, opt-in). 핵심 계약:
//  ① 미지정이면 지금과 바이트 단위로 같은 출력(회귀 0) — Character(_("이름"), ...) 그대로.
//  ② 지정하면 "대상 캐릭터만" Character(player_display_name, dynamic=True, ...) 로 바뀐다.
//  ③ 첫 실행 입력(label start)은 player_name_asked 플래그로 가드되고 jump 보다 앞에 온다.
//  ④ 이름을 받는 두 곳(설정 화면 change_player_name / 첫 실행 label start) 모두
//     exclude="{}[]%" 를 건다 — who() 가 renpy.substitutions.substitute() 를 거치는 함정
//     (CLAUDE.md) 을 플레이어가 이름에 [·% 를 넣어 재현하지 못하게 막는 방어선이라 이 테스트가
//     제일 중요하다(회귀가 나면 lint·typecheck 둘 다 못 잡고 실기에서만 크래시로 드러난다).
//  ⑤ playerName.character 가 존재하지 않는 캐릭터명이면 기능이 꺼진 것과 완전히 같은 출력.
//  ⑥ ESC 이미지 GUI on/off 양쪽 설정 화면에 이름 변경 UI가 나온다.

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, charIdMap } from '../src/renpy/generate';
import type { Character } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

const CHARACTERS: Character[] = [
  { name: '주인공', color: '#ffffff', expressions: {} },
  { name: '친구', color: '#ff8800', expressions: {} },
];

const LINES = [dialogue('주인공', '안녕'), dialogue('친구', '반가워')];

describe('generateRenpyFiles: playerName 미지정 — 회귀 0', () => {
  it('characters.rpy 가 지금 형태(Character(_("주인공"), ...)) 그대로다', () => {
    const project = projectWith([scene({ lines: LINES })], { characters: CHARACTERS });
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const chars = contentOf(files, 'game/characters.rpy');
    expect(chars).toContain(`define ${ids.get('주인공')} = Character(_("주인공"), color="`);
    expect(chars).not.toContain('dynamic=True');
    expect(chars).not.toContain('player_display_name');
    expect(chars).not.toContain('change_player_name');
  });

  it('script.rpy 에 renpy.input 이 없다', () => {
    const project = projectWith([scene({ lines: LINES })], { characters: CHARACTERS });
    const { files } = generateRenpyFiles(project);
    expect(contentOf(files, 'game/script.rpy')).not.toContain('renpy.input');
  });

  it('screens.rpy 에 change_player_name 이 없다', () => {
    const project = projectWith([scene({ lines: LINES })], { characters: CHARACTERS });
    const { files } = generateRenpyFiles(project);
    expect(contentOf(files, 'game/screens.rpy')).not.toContain('change_player_name');
  });
});

describe('generateRenpyFiles: playerName 지정', () => {
  it('대상 캐릭터만 Character(player_display_name, dynamic=True, ...) 로 바뀌고 나머지는 그대로다', () => {
    const project = projectWith([scene({ lines: LINES })], {
      characters: CHARACTERS,
      playerName: { character: '주인공' },
    });
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const chars = contentOf(files, 'game/characters.rpy');
    expect(chars).toContain(`define ${ids.get('주인공')} = Character(player_display_name, dynamic=True, color="`);
    expect(chars).not.toContain(`Character(_("주인공")`); // 대상의 원본 literal 정의는 사라져야 함
    expect(chars).toContain(`define ${ids.get('친구')} = Character(_("친구"), color="`); // 비대상은 그대로
  });

  it('label start 에 player_name_asked 가드가 있고 jump 보다 앞에 온다', () => {
    const project = projectWith([scene({ lines: LINES })], {
      characters: CHARACTERS,
      playerName: { character: '주인공' },
    });
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');
    const labelIdx = s.indexOf('label start:');
    const guardIdx = s.indexOf('if not persistent.player_name_asked:');
    const jumpIdx = s.indexOf('jump scene_1');
    expect(labelIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(labelIdx);
    expect(jumpIdx).toBeGreaterThan(guardIdx);
  });

  it('입력을 받는 두 곳(설정 화면·첫 실행) 모두 exclude="{}[]%" 를 갖는다', () => {
    const project = projectWith([scene({ lines: LINES })], {
      characters: CHARACTERS,
      playerName: { character: '주인공' },
    });
    const { files } = generateRenpyFiles(project);
    const chars = contentOf(files, 'game/characters.rpy'); // change_player_name(설정 화면)
    const s = contentOf(files, 'game/script.rpy'); // label start(첫 실행)
    expect(chars).toContain('exclude="{}[]%"');
    expect(s).toContain('exclude="{}[]%"');
  });

  it('playerName.character 가 존재하지 않는 이름이면 기능이 꺼진 것과 완전히 같은 출력이다', () => {
    const off = projectWith([scene({ lines: LINES })], { characters: CHARACTERS });
    const missing = projectWith([scene({ lines: LINES })], {
      characters: CHARACTERS,
      playerName: { character: '없는캐릭터' },
    });
    const filesOff = generateRenpyFiles(off).files;
    const filesMissing = generateRenpyFiles(missing).files;
    expect(JSON.stringify(filesMissing)).toBe(JSON.stringify(filesOff));
  });

  it('ESC 이미지 GUI on/off 양쪽에서 설정 화면에 이름 변경 UI가 나온다', () => {
    const build = (esc: boolean) =>
      projectWith([scene({ lines: LINES })], {
        characters: CHARACTERS,
        playerName: { character: '주인공' },
        ...(esc ? { escMenuUi: { images: { bg: 'bgAsset' } } } : {}),
      });
    for (const esc of [false, true]) {
      const { files } = generateRenpyFiles(build(esc));
      const screens = contentOf(files, 'game/screens.rpy');
      expect(screens).toContain('change_player_name');
      expect(screens).toContain('player_display_name()');
      expect(screens).toContain('_("주인공 이름")');
    }
  });
});
