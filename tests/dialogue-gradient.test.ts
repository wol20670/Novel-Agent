import { describe, it, expect } from 'vitest';
import { generateGuiFiles, resolveTheme, dialogueGradientMetrics, dialogueGradientColor } from '../src/renpy/gui';
import { gradientAlphaAt } from '../src/generators/image/canvasMenu';
import { contentOf as fileOf } from './fixtures';

// small() variant 블록만 잘라서 검사(gui.rpy 다른 곳의 우연한 문자열 매치를 피하기 위함).
const smallBlockOf = (gui: string) => gui.slice(gui.indexOf('def small():'));

describe('대사창 그라데이션: gui.rpy 의 textbox_height/dialogue_ypos/name_ypos', () => {
  it('OFF → 기존 값 그대로(1080p: 270 / gui.scale(50) / gui.scale(0)), small variant 에 240 재정의 있음', () => {
    const theme = resolveTheme('romance');
    const files = generateGuiFiles(theme, 1920, 1080); // opts 생략 = dialogueGradient 미지정(꺼짐)
    const gui = fileOf(files, 'game/gui.rpy');

    expect(gui).toContain('define gui.textbox_height = 270');
    expect(gui).toContain('define gui.dialogue_ypos = gui.scale(50)\n');
    expect(gui).toContain('define gui.name_ypos = gui.scale(0)\n');
    // "+ " 보정이 붙지 않아야 회귀 0(예전 출력과 바이트 동일)이다.
    expect(gui).not.toContain('gui.scale(50) +');
    expect(gui).not.toContain('gui.scale(0) +');
    expect(smallBlockOf(gui)).toContain('gui.textbox_height = gui.scale(240)');
  });

  it('ON(기본값 0.45) → textbox_height 486, ypos 는 delta(216) 만큼 보정, small variant 재정의 없음', () => {
    const theme = resolveTheme('romance');
    const files = generateGuiFiles(theme, 1920, 1080, {
      dialogueGradient: { enabled: true, heightRatio: 0.45 },
    });
    const gui = fileOf(files, 'game/gui.rpy');

    expect(gui).toContain('define gui.textbox_height = 486');
    expect(gui).toContain('define gui.dialogue_ypos = gui.scale(50) + 216');
    expect(gui).toContain('define gui.name_ypos = gui.scale(0) + 216');
    expect(smallBlockOf(gui)).not.toContain('gui.textbox_height');
  });

  it('dialogueGradientHeight: 0.6 → textbox_height 648, delta 378', () => {
    const theme = resolveTheme('romance');
    const files = generateGuiFiles(theme, 1920, 1080, {
      dialogueGradient: { enabled: true, heightRatio: 0.6 },
    });
    const gui = fileOf(files, 'game/gui.rpy');

    expect(gui).toContain('define gui.textbox_height = 648');
    expect(gui).toContain('define gui.dialogue_ypos = gui.scale(50) + 378');
    expect(gui).toContain('define gui.name_ypos = gui.scale(0) + 378');
  });

  it('720p 에서도 비율대로 계산된다(0.45 → 324, delta 144)', () => {
    const theme = resolveTheme('romance');
    const files = generateGuiFiles(theme, 1280, 720, {
      dialogueGradient: { enabled: true, heightRatio: 0.45 },
    });
    const gui = fileOf(files, 'game/gui.rpy');

    expect(gui).toContain('define gui.textbox_height = 324');
    expect(gui).toContain('define gui.dialogue_ypos = gui.scale(50) + 144');
    expect(gui).toContain('define gui.name_ypos = gui.scale(0) + 144');
  });
});

describe('dialogueGradientMetrics: fadeRatio 클램프(0.25~0.65) + delta 는 음수가 되지 않는다', () => {
  it('1080p, 기본(0.45) → boxHeight 486, delta 216', () => {
    expect(dialogueGradientMetrics(1080, 0.45)).toEqual({ boxHeight: 486, delta: 216 });
  });

  it('하한 미만(0.1) → 0.25 로 클램프되어 baseHeight(270)와 같아지고 delta 0', () => {
    expect(dialogueGradientMetrics(1080, 0.1)).toEqual({ boxHeight: 270, delta: 0 });
  });

  it('상한 초과(0.9) → 0.65 로 클램프', () => {
    expect(dialogueGradientMetrics(1080, 0.9)).toEqual({ boxHeight: 702, delta: 432 });
  });

  it('720p 에서도 비율대로(0.45 → 324, delta 144)', () => {
    expect(dialogueGradientMetrics(720, 0.45)).toEqual({ boxHeight: 324, delta: 144 });
  });
});

describe('gradientAlphaAt: 상단 투명 → 하단 14% 평평(smoothstep)', () => {
  const maxAlpha = 0.65;

  it('t=0 → 0(완전 투명)', () => {
    expect(gradientAlphaAt(0, maxAlpha)).toBe(0);
  });

  it('t≥0.86 구간은 정확히 maxAlpha(하단이 평평하게 유지)', () => {
    expect(gradientAlphaAt(0.86, maxAlpha)).toBeCloseTo(maxAlpha, 10);
    expect(gradientAlphaAt(0.95, maxAlpha)).toBeCloseTo(maxAlpha, 10);
    expect(gradientAlphaAt(1, maxAlpha)).toBeCloseTo(maxAlpha, 10);
  });

  it('t=0.1 은 maxAlpha 의 10% 미만(경계선이 거의 안 보임)', () => {
    expect(gradientAlphaAt(0.1, maxAlpha)).toBeLessThan(maxAlpha * 0.1);
  });

  it('0~0.86 구간에서 단조 증가한다', () => {
    const ts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.86];
    let prev = -1;
    for (const t of ts) {
      const a = gradientAlphaAt(t, maxAlpha);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe('dialogueGradientColor: 색 미지정이면 검정이 아니라 테마의 dialogueBox 색(RGB만)', () => {
  it('romance(기본 장르, 흰 배경 테마) → 검정이 아니라 흰색(#ffffff)', () => {
    const theme = resolveTheme('romance');
    // romance 의 dialogueBox 는 '#ffffffe0' — 밝은 배경 위 어두운 글자(dialogueText) 조합이라,
    // 그라데이션도 검정이면 글자가 안 보인다(실기 확인) — 테마색을 기본으로 써야 한다.
    expect(theme.dialogueText).not.toBe('#000000'); // 전제: 이 테마는 어두운 글자다
    expect(dialogueGradientColor(theme)).toBe('#ffffff');
  });

  it('horror(어두운 배경 테마) → 어두운 테마색(#0a0606)', () => {
    const theme = resolveTheme('horror');
    expect(dialogueGradientColor(theme)).toBe('#0a0606');
  });

  it('dialogueBoxColor 를 지정하면 그 값이 테마색보다 우선한다', () => {
    const theme = resolveTheme('romance');
    expect(dialogueGradientColor(theme, '#123456')).toBe('#123456');
  });
});
