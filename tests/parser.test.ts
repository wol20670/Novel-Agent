import { describe, it, expect } from 'vitest';
import { parseText } from '../src/parser';

describe('parser: #아이템 / #아이템끝', () => {
  it('아이템 태그를 인라인 item 라인으로 파싱한다', () => {
    const text = ['#S 도입', '민주: 안녕', '#아이템 편지', '낡은 편지가 떨어져 있었다', '#아이템끝', '민주: 끝'].join(
      '\n',
    );
    const { scenes } = parseText(text);
    const lines = scenes[0].lines;
    const items = lines.filter((l) => l.kind === 'item') as { kind: 'item'; name: string }[];
    expect(items.map((i) => i.name)).toEqual(['편지', '']); // 표시 → 닫기(빈 이름)
    // 아이템은 대사/지문과 별개 라인이며 순서를 유지한다.
    expect(lines.map((l) => l.kind)).toEqual(['dialogue', 'item', 'narration', 'item', 'dialogue']);
  });

  it('#소품 별칭도 동일하게 동작한다', () => {
    const { scenes } = parseText(['#S s', '#소품 반지', '#소품끝'].join('\n'));
    const items = scenes[0].lines.filter((l) => l.kind === 'item') as { kind: 'item'; name: string }[];
    expect(items.map((i) => i.name)).toEqual(['반지', '']);
  });

  it('#아이템 태그는 번역/대사 대상이 아니다(지문·대사와 구분)', () => {
    const { scenes } = parseText(['#S s', '#아이템 사진'].join('\n'));
    const item = scenes[0].lines.find((l) => l.kind === 'item');
    expect(item).toBeTruthy();
    // item 라인엔 text/i18n 필드가 없다.
    expect('text' in (item as object)).toBe(false);
  });
});

describe('parser: 콜론 오인식 방지', () => {
  it('URL 줄("http://...")은 지문으로 처리되고 "http" 캐릭터가 생기지 않는다', () => {
    const { scenes, characters } = parseText(['#S s', 'http://example.com 를 열었다'].join('\n'));
    const lines = scenes[0].lines;
    expect(lines.map((l) => l.kind)).toEqual(['narration']);
    expect(characters.some((c) => c.name === 'http')).toBe(false);
  });

  it('"12:30 정각이었다" 같은 시각 표기는 지문으로 처리된다', () => {
    const { scenes, characters } = parseText(['#S s', '12:30 정각이었다'].join('\n'));
    const lines = scenes[0].lines;
    expect(lines.map((l) => l.kind)).toEqual(['narration']);
    expect(characters.some((c) => c.name === '12')).toBe(false);
  });

  it('"민주: 안녕"은 여전히 대사로 처리된다(회귀 방지)', () => {
    const { scenes, characters } = parseText(['#S s', '민주: 안녕'].join('\n'));
    const lines = scenes[0].lines;
    expect(lines).toEqual([{ kind: 'dialogue', speaker: '민주', text: '안녕', emotion: undefined, i18n: undefined }]);
    expect(characters.some((c) => c.name === '민주')).toBe(true);
  });
});
