import { describe, it, expect } from 'vitest';
import { parseText } from '../src/parser';
import type { Line } from '../src/types';

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

describe('parser: #인물숨김 / #인물표시 (setBgm 과 같은 위치 마커 규칙)', () => {
  it('장면 맨 앞이면 scene.hideSprites 로 바로 반영되고 라인엔 아무 흔적도 안 남는다', () => {
    const { scenes } = parseText(['#S 차 안', '#인물숨김', '민주: 어디 가?'].join('\n'));
    expect(scenes[0].hideSprites).toBe(true);
    expect(scenes[0].lines).toEqual([
      { kind: 'dialogue', speaker: '민주', text: '어디 가?', emotion: undefined, i18n: undefined, hideSprites: undefined },
    ]);
  });

  it('도중에 나오면 다음 대사/지문 줄의 hideSprites 로 얹힌다(그 사이 줄은 영향 없음)', () => {
    const text = ['#S 차 안', '민주: 출발!', '#인물숨김', '민주: 계속 가자', '#인물표시', '민주: 도착'].join('\n');
    const { scenes } = parseText(text);
    expect(scenes[0].hideSprites).toBeUndefined(); // 장면 시작엔 태그가 없었다
    const lines = scenes[0].lines as Extract<(typeof scenes)[0]['lines'][number], { kind: 'dialogue' }>[];
    expect(lines.map((l) => l.hideSprites)).toEqual([undefined, true, false]);
  });

  it('#인물등장 은 #인물표시 의 별칭이다', () => {
    const text = ['#S 차 안', '민주: 하나', '#인물숨김', '민주: 둘', '#인물등장', '민주: 셋'].join('\n');
    const { scenes } = parseText(text);
    const lines = scenes[0].lines as Extract<(typeof scenes)[0]['lines'][number], { kind: 'dialogue' }>[];
    expect(lines.map((l) => l.hideSprites)).toEqual([undefined, true, false]);
  });

  it('태그 이후 장면이 그대로 끝나면(다음 줄 없음) pendingHide 는 조용히 버려진다', () => {
    // 두 번째 장면에서 hideSprites 가 실수로 새어나오지 않는지가 핵심 — startScene 이 pendingHide 를 비워야 한다.
    const text = ['#S 장면1', '민주: 안녕', '#인물숨김', '#S 장면2', '민주: 반가워'].join('\n');
    const { scenes } = parseText(text);
    expect(scenes).toHaveLength(2);
    expect(scenes[1].hideSprites).toBeUndefined();
    const line2 = scenes[1].lines[0] as Extract<(typeof scenes)[0]['lines'][number], { kind: 'dialogue' }>;
    expect(line2.hideSprites).toBeUndefined();
  });
});

describe('parser: #복장 위치 의미(장면 시작 의상 vs 줄 단위 전환)', () => {
  /** dialogue/narration 줄만 뽑아 (본문, 줄 의상) 쌍으로. */
  function outfitLines(lines: readonly Line[]): [string, Record<string, string> | undefined][] {
    return lines
      .filter((l): l is Extract<Line, { kind: 'dialogue' | 'narration' }> =>
        l.kind === 'dialogue' || l.kind === 'narration',
      )
      .map((l) => [l.text, l.outfits]);
  }

  it('장면 맨 앞의 #복장 은 기존처럼 장면 시작 의상(Scene.outfits)이 된다', () => {
    const { scenes } = parseText(['#S 카페', '#복장 히로인:교복', '히로인: 안녕'].join('\n'));
    expect(scenes[0].outfits).toEqual({ 히로인: '교복' });
    expect(outfitLines(scenes[0].lines)).toEqual([['안녕', undefined]]);
  });

  it('#CG·#아이템 마커가 먼저 있어도 첫 대사/지문 전이면 Scene.outfits 다(기존 동작 보존)', () => {
    const { scenes } = parseText(
      ['#S 카페', '#CG 첫 컷', '#아이템 편지', '#복장 히로인:교복', '히로인: 안녕'].join('\n'),
    );
    expect(scenes[0].outfits).toEqual({ 히로인: '교복' });
    expect(outfitLines(scenes[0].lines)).toEqual([['안녕', undefined]]);
  });

  it('장면 도중의 #복장 은 다음 대사 줄에 얹힌다(그 줄부터 전환)', () => {
    const { scenes } = parseText(
      ['#S 카페', '#복장 히로인:교복', '히로인: 하나', '#복장 히로인:사복', '히로인: 둘', '히로인: 셋'].join('\n'),
    );
    expect(scenes[0].outfits).toEqual({ 히로인: '교복' }); // 맨 앞 것만 장면 시작값
    expect(outfitLines(scenes[0].lines)).toEqual([
      ['하나', undefined],
      ['둘', { 히로인: '사복' }],
      ['셋', undefined],
    ]);
  });

  it('지문 줄도 pending 을 소비한다', () => {
    const { scenes } = parseText(['#S s', '히로인: 하나', '#복장 히로인:사복', '퇴근 시간이었다'].join('\n'));
    expect(outfitLines(scenes[0].lines)).toEqual([
      ['하나', undefined],
      ['퇴근 시간이었다', { 히로인: '사복' }],
    ]);
  });

  it('여러 캐릭터의 #복장 이 다음 줄 전에 나오면 캐릭터별로 누적된다', () => {
    const { scenes } = parseText(
      ['#S s', '히로인: 하나', '#복장 히로인:사복', '#복장 민주:교복', '민주: 둘'].join('\n'),
    );
    expect(outfitLines(scenes[0].lines)[1]).toEqual(['둘', { 히로인: '사복', 민주: '교복' }]);
  });

  it('한 줄에 쉼표로 여러 명을 적어도 같다', () => {
    const { scenes } = parseText(['#S s', '히로인: 하나', '#복장 히로인:사복, 민주:교복', '민주: 둘'].join('\n'));
    expect(outfitLines(scenes[0].lines)[1]).toEqual(['둘', { 히로인: '사복', 민주: '교복' }]);
  });

  it('같은 캐릭터를 다음 줄 전에 다시 지정하면 마지막 값이 이긴다', () => {
    const { scenes } = parseText(
      ['#S s', '히로인: 하나', '#복장 히로인:사복', '#복장 히로인:수영복', '히로인: 둘'].join('\n'),
    );
    expect(outfitLines(scenes[0].lines)[1]).toEqual(['둘', { 히로인: '수영복' }]);
  });

  it('#아이템·#CG·#BGM 마커는 pending 을 소비하지 않는다(다음 대사/지문까지 살아 있다)', () => {
    const { scenes } = parseText(
      ['#S s', '#BGM 첫곡', '히로인: 하나', '#복장 히로인:사복', '#아이템 편지', '#CG 컷', '히로인: 둘'].join('\n'),
    );
    const sc = scenes.find((s) => s.lines.some((l) => l.kind === 'dialogue' && l.text === '둘'))!;
    const pairs = outfitLines(sc.lines);
    expect(pairs[pairs.length - 1]).toEqual(['둘', { 히로인: '사복' }]);
  });

  it('자동 분할(#배경 변경)은 줄 전환 상태를 이어받는다 — 소비분·미소비 예약분 모두', () => {
    const { scenes } = parseText(
      [
        '#S 카페',
        '#배경 카페 안',
        '히로인: 하나',
        '#복장 히로인:사복',
        '히로인: 둘', // 소비 → appliedOutfits
        '#복장 민주:교복', // 미소비 pending
        '#배경 길거리', // 자동 분할
        '히로인: 셋',
      ].join('\n'),
    );
    expect(scenes).toHaveLength(2);
    expect(scenes[1].outfits).toEqual({ 히로인: '사복', 민주: '교복' });
    expect(outfitLines(scenes[1].lines)).toEqual([['셋', undefined]]); // 시작 의상으로 접혔으므로 줄엔 없음
  });

  it('명시 #S 는 줄 전환 상태를 승계하지 않는다(장면 독립성)', () => {
    const { scenes } = parseText(
      ['#S 장면1', '히로인: 하나', '#복장 히로인:사복', '히로인: 둘', '#복장 민주:교복', '#S 장면2', '히로인: 셋'].join(
        '\n',
      ),
    );
    expect(scenes).toHaveLength(2);
    expect(scenes[1].outfits).toBeUndefined();
    expect(outfitLines(scenes[1].lines)).toEqual([['셋', undefined]]);
  });
});
