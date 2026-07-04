import { describe, it, expect } from 'vitest';
import { parseTranslateResponse } from '../src/generators/translate';
import { collectUntranslated } from '../src/generators/translate/collect';
import { emptyProject, type Project } from '../src/types';

describe('parseTranslateResponse', () => {
  it('코드펜스를 걷어내고 인덱스로 매핑하며 값을 trim 한다', () => {
    const raw = '```json\n[{"i":0,"en":"Hi","ja":"やあ"},{"i":2,"en":"Bye","ja":" さよなら "}]\n```';
    expect(parseTranslateResponse(raw, ['en', 'ja'])).toEqual({
      0: { en: 'Hi', ja: 'やあ' },
      2: { en: 'Bye', ja: 'さよなら' },
    });
  });

  it('JSON 배열이 없으면 예외를 던진다(호출측 폴백 유도)', () => {
    expect(() => parseTranslateResponse('죄송합니다 번역 불가', ['en'])).toThrow();
  });
});

describe('collectUntranslated', () => {
  it('빈 칸(번역 없는 로케일)이 있는 대사·지문만 모은다', () => {
    const p: Project = {
      ...emptyProject(),
      scenes: [
        {
          id: 's1',
          title: 's',
          direction: [],
          cg: [],
          choices: [],
          status: 'review',
          lines: [
            { kind: 'dialogue', speaker: '민주', text: '안녕', i18n: { en: 'Hi' } }, // ja 비어있음 → 포함
            { kind: 'dialogue', speaker: '민주', text: '반가워', i18n: { en: 'Hi', ja: 'やあ' } }, // 완역 → 제외
            { kind: 'narration', text: '비가 내렸다' }, // 둘 다 비어있음 → 포함
            { kind: 'item', name: '편지' }, // 아이템 → 대상 아님
          ],
        },
      ],
    };
    const batches = collectUntranslated(p, ['en', 'ja']);
    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((i) => i.i)).toEqual([0, 2]);
    expect(batches[0].items[1].narration).toBe(true);
  });
});
