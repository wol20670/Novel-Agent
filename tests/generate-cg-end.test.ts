// post-v1 `#CG끝` — CG 종료가 **그 줄 하나로** 일반 장면 복귀를 완료한다.
//
// ⚠️ 이 파일의 핵심 계약: 복원 `show` 가 **다음 대사에 미뤄지지 않는다.** 미루면 post-CG 대사가
// 없는 경우(장면 끝·선택지)에 배경만 돌아오고 인물이 사라진 채로 남는다.
// 시작 마커 쪽 기존 계약은 generate-cg.test.ts 가 계속 지킨다(그쪽은 무수정).

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, outfitAttrFor } from '../src/renpy/generate';
import type { Project, Line } from '../src/types';
import { contentOf, scene, dialogue, projectWith } from './fixtures';

function projectWithChar(scenes: Parameters<typeof projectWith>[0]): Project {
  return projectWith(scenes, {
    characters: [{ name: '민주', color: '#e91e63', expressions: { 기본: 'stub' } }],
  });
}

const cgEnd = (): Line => ({ kind: 'cg', desc: '', end: true });

/** 장면의 일반 배경 태그(슬러그는 배경 이름/제목에서 나오므로 하드코딩하지 않는다). */
function bgTagOf(script: string): string {
  const m = /scene (bg_\S+) at vn_bg with dissolve/.exec(script);
  if (!m) throw new Error('배경 scene 문을 찾지 못함');
  return m[1];
}

/** `#CG끝` 이 낸 배경 복귀 문의 위치(없으면 -1). CG 시작 뒤부터 찾는다 — 장면 시작의 같은 문과 구별. */
function cgEndAt(script: string): number {
  const cgIdx = script.indexOf('scene cg_1_scene with dissolve');
  if (cgIdx < 0) return -1;
  return script.indexOf('scene ' + bgTagOf(script) + ' at vn_bg with dissolve', cgIdx);
}

describe('generateRenpyFiles: #CG끝 은 배경 + 스프라이트를 그 자리에서 복원한다', () => {
  it('A. post-CG 대사가 있으면 scene bg → 복원 show → 대사 순서다(show 가 대사보다 뒤면 실패)', () => {
    const lines: Line[] = [
      dialogue('민주', '일반 장면'),
      { kind: 'cg', desc: '교문 앞 재회' },
      dialogue('민주', 'CG 위 대사'),
      cgEnd(),
      dialogue('민주', '복귀 후 대사'),
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['교문 앞 재회'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const back = cgEndAt(s);
    expect(back).toBeGreaterThan(-1); // 배경 복귀
    const restore = s.indexOf('show c_1', back);
    const say = s.indexOf('"복귀 후 대사"', back);
    expect(restore).toBeGreaterThan(back); // 복원 show 는 배경 문 **뒤**(scene 이 레이어를 지우므로)
    expect(say).toBeGreaterThan(restore); // 그리고 첫 post-CG 대사 **앞**
  });

  it('B. post-CG 대사·지문이 하나도 없어도 `#CG끝` 자체에서 복원이 나간다', () => {
    const lines: Line[] = [
      dialogue('민주', '일반 장면'),
      { kind: 'cg', desc: '교문 앞 재회' },
      dialogue('민주', 'CG 위 대사'),
      cgEnd(),
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['교문 앞 재회'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const back = cgEndAt(s);
    expect(back).toBeGreaterThan(-1);
    expect(s.indexOf('show c_1', back)).toBeGreaterThan(back); // 복원이 미뤄지지 않는다
  });

  it('C. 선택지 앞에서도 복원이 끝나 있다(menu 는 줄 루프 밖에서 나간다)', () => {
    const lines: Line[] = [
      dialogue('민주', '일반 장면'),
      { kind: 'cg', desc: '교문 앞 재회' },
      dialogue('민주', 'CG 위 대사'),
      cgEnd(),
    ];
    const { files } = generateRenpyFiles(
      projectWithChar([scene({ cg: ['교문 앞 재회'], lines, choices: [{ text: '고백한다' }] })]),
    );
    const s = contentOf(files, 'game/script.rpy');
    const back = cgEndAt(s);
    const restore = s.indexOf('show c_1', back);
    const menu = s.indexOf('menu:', back);
    expect(menu).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(back);
    expect(menu).toBeGreaterThan(restore); // 선택지 화면 전에 일반 배경 + 인물이 이미 서 있다
  });

  it('D. 종료 시점에 인물 숨김이면 아무도 복원하지 않고, #인물표시 에서 복원된다', () => {
    const lines: Line[] = [
      dialogue('민주', '일반 장면'),
      { kind: 'cg', desc: '교문 앞 재회' },
      dialogue('민주', 'CG 위 대사', { hideSprites: true }), // CG 중 숨김 상태가 됨
      cgEnd(),
      dialogue('민주', '아직 숨김'),
      dialogue('민주', '다시 표시', { hideSprites: false }),
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['교문 앞 재회'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const back = cgEndAt(s);
    const stillHidden = s.indexOf('"아직 숨김"', back);
    expect(stillHidden).toBeGreaterThan(back);
    // 복귀 직후엔 show 가 없다 — 다음 show 는 "아직 숨김" 줄보다 뒤(= #인물표시 줄)에 있다.
    expect(s.indexOf('show c_1', back)).toBeGreaterThan(stillHidden);
    expect(s.indexOf('show c_1', stillHidden)).toBeGreaterThan(-1);
  });

  it('E. CG 구간에서 바뀐 의상이 복원 show 에 반영된다', () => {
    const { files } = generateRenpyFiles(
      projectWith(
        [
          scene({
            cg: ['교문 앞 재회'],
            lines: [
              dialogue('민주', '일반 장면'),
              { kind: 'cg', desc: '교문 앞 재회' },
              dialogue('민주', 'CG 위 대사', { outfits: { 민주: '교복' } }),
              cgEnd(),
              dialogue('민주', '복귀 후 대사'),
            ],
          }),
        ],
        {
          characters: [
            {
              name: '민주',
              color: '#e91e63',
              expressions: { 기본: 'b-base' },
              outfits: [{ name: '교복', expressions: { 기본: 'u-base' } }],
            },
          ],
        },
      ),
    );
    const s = contentOf(files, 'game/script.rpy');
    const back = cgEndAt(s);
    const restore = /show c_1 (\S+) (\S+) at vn_char/.exec(s.slice(back));
    expect(restore).not.toBeNull();
    expect(restore![1]).toBe(outfitAttrFor('교복')); // 기본 의상이 아니라 CG 중 바뀐 의상
  });

  it('F. CG 가 안 켜진 상태의 `#CG끝` 은 완전 no-op 이다(배경 문도 안 낸다)', () => {
    const withEnd = generateRenpyFiles(
      projectWithChar([
        scene({ cg: [], lines: [dialogue('민주', '하나'), cgEnd(), dialogue('민주', '둘')] }),
      ]),
    );
    const without = generateRenpyFiles(
      projectWithChar([scene({ cg: [], lines: [dialogue('민주', '하나'), dialogue('민주', '둘')] })]),
    );
    expect(contentOf(withEnd.files, 'game/script.rpy')).toBe(
      contentOf(without.files, 'game/script.rpy'),
    );
  });

  it('G. 한 장면 안 CG 구간이 둘이면 각각 켜지고 각각 복원된다', () => {
    const lines: Line[] = [
      dialogue('민주', '일반 1'),
      { kind: 'cg', desc: '첫 컷' },
      dialogue('민주', 'CG A'),
      cgEnd(),
      dialogue('민주', '일반 2'),
      { kind: 'cg', desc: '둘째 컷' },
      dialogue('민주', 'CG B'),
      cgEnd(),
      dialogue('민주', '일반 3'),
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['첫 컷', '둘째 컷'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const bg = bgTagOf(s);
    const order = [...s.matchAll(/scene (\S+?)(?:_scene)? (?:at vn_bg )?with dissolve/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual([bg, 'cg_1', bg, 'cg_2', bg]);
  });

  it('H. 레거시 폴백 장면에 `#CG끝` 만 있어도 폴백은 살아 있고 그 줄에서 꺼진다', () => {
    const lines: Line[] = [
      dialogue('민주', 'CG 위 대사'),
      cgEnd(),
      dialogue('민주', '복귀 후 대사'),
    ];
    const { files } = generateRenpyFiles(projectWithChar([scene({ cg: ['교문 앞 재회'], lines })]));
    const s = contentOf(files, 'game/script.rpy');
    const cgIdx = s.indexOf('scene cg_1_scene with dissolve');
    expect(cgIdx).toBeGreaterThan(-1); // 종료 마커를 시작 마커로 세지 않았다 → 폴백 생존
    expect(cgIdx).toBeLessThan(s.indexOf('"CG 위 대사"'));
    const back = s.indexOf('scene ' + bgTagOf(s) + ' at vn_bg with dissolve', cgIdx);
    expect(back).toBeGreaterThan(cgIdx);
    const say = s.indexOf('"복귀 후 대사"');
    expect(back).toBeLessThan(say);
    // 장면이 CG 로 시작해 아무도 서 있던 적이 없으므로 **복원할 대상이 없다** — 종료~첫 대사 사이의
    // show 는 그 대사에서 처음 등장하는 화자 몫 하나뿐이다(복원 show 가 덧붙지 않는다).
    expect(s.slice(back, say).match(/show c_1 /g)).toHaveLength(1);
  });
});
