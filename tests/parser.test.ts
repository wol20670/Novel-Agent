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

describe('parser: #BGM 위치 마커 (#CG 와 같은 패턴)', () => {
  it('장면 맨 앞 #BGM 은 위치 마커를 남기지 않는다(장면 시작 재생 폴백, 회귀)', () => {
    const text = ['#S 카페', '#BGM busy_city', '민주: 안녕'].join('\n');
    const { scenes } = parseText(text);
    expect(scenes[0].bgm).toBe('busy_city');
    expect(scenes[0].lines.map((l) => l.kind)).toEqual(['dialogue']); // bgm 마커 없음
  });

  it('대사 뒤 #BGM 은 Scene.bgm 을 설정하면서 그 위치에 kind:bgm 마커를 남긴다', () => {
    const text = ['#S 카페', '민주: 안녕', '#BGM busy_city', '민주: 잘 가'].join('\n');
    const { scenes } = parseText(text);
    expect(scenes[0].bgm).toBe('busy_city');
    // 마커가 대사 사이 "그 위치"에 그대로 꽂혀야 한다 — 순서까지 확인.
    expect(scenes[0].lines).toEqual([
      { kind: 'dialogue', speaker: '민주', text: '안녕', emotion: undefined, i18n: undefined },
      { kind: 'bgm', name: 'busy_city' },
      { kind: 'dialogue', speaker: '민주', text: '잘 가', emotion: undefined, i18n: undefined },
    ]);
  });

  it('장면 도중 곡이 다른 곡으로 바뀌면 지금처럼 장면이 분할된다(splitBeat 유지, 회귀)', () => {
    const text = [
      '#S 카페',
      '민주: 안녕',
      '#BGM morning',
      '민주: 그리고',
      '#BGM busy_city',
      '민주: 끝',
    ].join('\n');
    const { scenes } = parseText(text);
    expect(scenes).toHaveLength(2);
    // 첫 비트: 첫 BGM 지정은 대사 뒤라 마커가 남는다.
    expect(scenes[0].bgm).toBe('morning');
    expect(scenes[0].lines.map((l) => l.kind)).toEqual(['dialogue', 'bgm', 'dialogue']);
    // 분할된 둘째 비트: 새 장면 맨 앞에서 곡이 바로 지정되므로 마커 없음(장면 시작 재생 폴백과 동일 취급).
    expect(scenes[1].bgm).toBe('busy_city');
    expect(scenes[1].lines.map((l) => l.kind)).toEqual(['dialogue']);
    expect(scenes[1].title).toContain('busy_city');
  });
});
