// 미리보기 ↔ Ren'Py 출력의 **스프라이트 폴백 비대칭**(Phase 8 · I19) — 선행 동작 기록용.
//
// ⚠️ 이 테스트가 뜻하는 것과 뜻하지 않는 것
//   · 뜻하는 것 : "지금 두 경로의 폴백 규칙이 이렇게 다르다"는 **현재 사실**을 고정한다. Phase 8 은
//                 이 차이를 의도적으로 바꾸지 않으므로, 누가 한쪽만 손대면 여기서 걸린다.
//   · 뜻하지 않는 것 : 이 차이가 "정답"이라거나 영구히 유지해야 할 계약이라는 뜻이 **아니다.**
//                 후속 Phase 가 의도적으로 두 폴백을 통합하기로 하면 **이 테스트를 함께 바꾸는 것이 정상**이다.
//
// 비대칭의 실체(둘 다 오늘의 production 코드다):
//   · 미리보기 = spriteAssetId(types/project.ts) — 그 의상에 그 표정이 없으면 **기본 의상의 같은 표정**
//   · 출력     = pickSpriteAttrs(renpy/generate.ts) — 그 의상에 스프라이트가 하나라도 있으면
//                **그 의상을 유지하고 표정만** neutral/pool[0] 로 내린다
// 즉 같은 줄에서 미리보기는 "옷이 틀린 맞는 표정", 게임은 "옷이 맞는 틀린 표정"을 보여준다.
// AI 가 만든 문제가 아니다 — 작가 태그·수동 선택도 똑같이 겪는다(조용한 degrade, 크래시 아님).

import { describe, it, expect } from 'vitest';
import { generateRenpyFiles, outfitAttrFor } from '../src/renpy/generate';
import { spriteAssetId, type Character, type Project } from '../src/types';
import { dialogue, contentOf, projectWith, scene } from './fixtures';

/** '사복' 에는 기본 표정만 있고, '기쁨' 스프라이트는 **기본 의상에만** 있다. */
function heroine(): Character {
  return {
    name: '민주',
    color: '#f88',
    expressions: { 기본: 'a-base', 기쁨: 'a-joy' },
    outfits: [{ name: '사복', expressions: { 기본: 'b-base' } }],
  };
}

/** 민주가 '사복' 을 입은 채 '기쁨' 표정으로 말하는 장면(작가가 태그로 직접 지정). */
function project(): Project {
  return projectWith(
    [
      scene({
        id: 's1',
        outfits: { 민주: '사복' },
        lines: [dialogue('민주', '다녀왔어!', { emotion: '기쁨' })],
      }),
    ],
    { characters: [heroine()] },
  );
}

describe('I19 — 미리보기와 출력의 스프라이트 폴백이 서로 다르다(현재 동작 기록)', () => {
  it('미리보기는 의상을 포기하고 표정을 지킨다 — 기본 의상의 기쁨 이미지', () => {
    const c = heroine();
    // ScenePlayer 의 PreviewSprite 가 그대로 쓰는 판정.
    expect(spriteAssetId(c, '사복', '기쁨')).toBe('a-joy'); // ← 기본 의상 에셋
    expect(spriteAssetId(c, '사복', '기본')).toBe('b-base'); // 그 의상에 있으면 당연히 그걸 쓴다
  });

  it('출력은 표정을 포기하고 의상을 지킨다 — 사복 + neutral', () => {
    const { files } = generateRenpyFiles(project());
    const script = contentOf(files, 'game/script.rpy');
    const showLine = script.split('\n').find((l) => l.trim().startsWith('show '));
    expect(showLine).toBeDefined();

    const sabok = outfitAttrFor('사복');
    expect(showLine).toContain(sabok); // ← 의상은 유지되고
    expect(showLine).toContain('neutral'); // ← 표정이 neutral 로 내려간다
    expect(showLine).not.toContain('base '); // 기본 의상으로 폴백하지 **않는다**(미리보기와 반대)
  });

  it('두 경로가 실제로 다른 그림을 고른다(이 줄이 이 파일의 존재 이유다)', () => {
    const c = heroine();
    const previewAsset = spriteAssetId(c, '사복', '기쁨'); // 'a-joy' = 기본 의상 · 기쁨
    const { files } = generateRenpyFiles(project());
    const assets = contentOf(files, 'game/assets.rpy');

    // 출력이 실제로 참조하는 이미지는 사복 의상 스프라이트(b-base)에서 나온 파일이다.
    const sabok = outfitAttrFor('사복');
    const sabokImage = assets.split('\n').find((l) => l.includes(`${sabok} neutral`));
    expect(sabokImage).toBeDefined();
    // 미리보기 쪽 에셋 id 와 출력 쪽 이미지가 서로 다른 스프라이트에서 왔다는 것 자체가 비대칭이다.
    expect(previewAsset).toBe('a-joy');
    expect(sabokImage).not.toContain('base neutral');
  });
});
