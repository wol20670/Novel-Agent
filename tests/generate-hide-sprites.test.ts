// 인물 숨김(hideSprites) — 차량 내부처럼 인물이 서 있는 구도가 어색한 장면에서, 배경은 그대로 두고
// 스프라이트만 숨긴다(#CG 와 달리 되돌릴 수 있음). 판정 단일 소스는 spriteHiddenFlags(types.ts),
// generate.ts 는 그 결과를 cgActive 와 OR 로 합쳐 hide/show 를 낸다 — 이 파일은 그 emit 결과를 검증.

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, charIdMap } from '../src/renpy/generate';
import type { Character } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

function charWithSprite(name: string): Character {
  return { name, color: '#ffffff', expressions: { 기본: `${name}-asset` } };
}

describe('generateRenpyFiles: 인물 숨김(hideSprites)', () => {
  it('① 장면 hideSprites 면 show 가 하나도 없고 대사·이름표는 그대로 나간다', () => {
    const A = charWithSprite('A');
    const project = projectWith([scene({ hideSprites: true, lines: [dialogue('A', '대사1')] })], {
      characters: [A],
    });
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');
    expect(s).not.toContain(`show ${ids.get('A')}`);
    expect(s).toContain(`${ids.get('A')} "대사1"`); // 이름표(화자 id)·대사는 그대로
  });

  it('② 중간에 숨기면 그때까지 서 있던 인물 수만큼 hide 가 나가고, 이후엔 등장 처리가 없다', () => {
    const A = charWithSprite('A');
    const B = charWithSprite('B');
    const sc = scene({
      lines: [dialogue('A', '줄0'), dialogue('B', '줄1'), dialogue('A', '줄2', { hideSprites: true })],
    });
    const project = projectWith([sc], { characters: [A, B] });
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');

    const hideLines = s.split('\n').filter((line) => line.trim().startsWith('hide '));
    expect(hideLines.length).toBe(2); // 그때까지 서 있던 A·B 두 명
    expect(s).toContain(`hide ${ids.get('A')}`);
    expect(s).toContain(`hide ${ids.get('B')}`);

    const firstHideIdx = s.indexOf('hide ');
    expect(s.indexOf('show ', firstHideIdx)).toBe(-1); // 숨긴 뒤엔 show 자체가 없다
    expect(s).toContain('"줄2"'); // 대사는 계속
  });

  it('③ 다시 표시하면 숨기기 직전과 같은 좌표·같은 속성으로 show 가 복원된다', () => {
    const A = charWithSprite('A');
    const B = charWithSprite('B');
    const sc = scene({
      lines: [
        dialogue('A', '줄0'),
        dialogue('B', '줄1'),
        { kind: 'narration', text: '숨김', hideSprites: true },
        { kind: 'narration', text: '다시 표시', hideSprites: false },
      ],
    });
    const project = projectWith([sc], { characters: [A, B] });
    const ids = charIdMap(project);
    const aId = ids.get('A')!;
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');

    const firstHideIdx = s.indexOf('hide ');
    const lastHideIdx = s.lastIndexOf('hide ');
    expect(firstHideIdx).toBeGreaterThan(-1);
    const beforeHideText = s.slice(0, firstHideIdx);

    // 숨기기 직전 A 의 실제 좌표 — B 가 등장하며 재배치될 때는 속성 없는 `show <id> at vn_char(x)`
    // 만 나가므로(Ren'Py 가 마지막 속성을 유지) 좌표는 그 형태까지 포함해 "가장 마지막 값"을 잡는다.
    const posRe = new RegExp(`show ${aId}[^\\n]*? at vn_char\\(([\\d.]+)\\)`, 'g');
    let lastPos: string | undefined;
    let pm: RegExpExecArray | null;
    while ((pm = posRe.exec(beforeHideText))) lastPos = pm[1];
    expect(lastPos).toBeDefined();

    // 숨기기 직전 A 의 마지막 "명시" 속성(outfitAttr·표정) — 재배치 show 엔 속성이 없으므로 4-토큰
    // 형태(show id outfitAttr attr at vn_char)만 대상으로 삼는다.
    const attrRe = new RegExp(`show ${aId} (\\S+) (\\S+) at vn_char`, 'g');
    let lastAttrs: [string, string] | undefined;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(beforeHideText))) lastAttrs = [am[1], am[2]];
    expect(lastAttrs).toBeDefined();

    // 복원 구간(마지막 hide 이후)에서 같은 속성·좌표로 다시 show 되는지.
    const restoreRe = new RegExp(`show ${aId} (\\S+) (\\S+) at vn_char\\(([\\d.]+)\\)`);
    const restoreMatch = s.slice(lastHideIdx).match(restoreRe);
    expect(restoreMatch).not.toBeNull();
    expect(restoreMatch![1]).toBe(lastAttrs![0]); // outfitAttr
    expect(restoreMatch![2]).toBe(lastAttrs![1]); // attr(표정)
    expect(restoreMatch![3]).toBe(lastPos); // 좌표
  });

  it('④ 숨김 구간에서 처음 말한 캐릭터는 표시 전환 시 나오지 않는다(다음에 말할 때만 등장)', () => {
    const A = charWithSprite('A');
    const C = charWithSprite('C');
    const sc = scene({
      lines: [
        dialogue('A', '줄0'),
        { kind: 'narration', text: '숨김', hideSprites: true },
        dialogue('C', '숨김 중 처음 등장'),
        { kind: 'narration', text: '다시 표시', hideSprites: false },
      ],
    });
    const project = projectWith([sc], { characters: [A, C] });
    const ids = charIdMap(project);
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');
    // C 는 숨김 중에만 말했으므로 복원 구간에도 없다 — 유령처럼 튀어나오지 않는다.
    expect(s).not.toContain(`show ${ids.get('C')}`);
  });

  it('⑤ CG 활성화 중엔 인물 숨김 태그가 있어도 hide/복원을 내지 않는다', () => {
    const A = charWithSprite('A');
    const sc = scene({
      cg: ['컷'],
      lines: [
        dialogue('A', '줄0'),
        { kind: 'cg', desc: '컷' },
        { kind: 'narration', text: '숨김', hideSprites: true },
        { kind: 'narration', text: '표시', hideSprites: false },
      ],
    });
    const project = projectWith([sc], { characters: [A] });
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');
    const cgIdx = s.indexOf('scene cg_1_scene with dissolve');
    expect(cgIdx).toBeGreaterThan(-1);
    expect(s.indexOf('hide ', cgIdx)).toBe(-1); // scene 문이 이미 다 지웠으니 또 hide 할 필요 없음
    expect(s.indexOf('show ', cgIdx)).toBe(-1); // 복원도 없음(장면 끝까지 인물 없음)
  });

  it('⑥ 필드를 하나도 안 쓰면 기존 출력과 완전히 동일하다(회귀 0 — hide 자체가 안 나간다)', () => {
    const A = charWithSprite('A');
    const B = charWithSprite('B');
    const sc = scene({ lines: [dialogue('A', '줄0'), dialogue('B', '줄1')] });
    const project = projectWith([sc], { characters: [A, B] });
    const { files } = generateRenpyFiles(project);
    const s = contentOf(files, 'game/script.rpy');
    expect(s).not.toContain('hide c_');
  });
});
