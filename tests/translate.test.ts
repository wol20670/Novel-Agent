import { describe, it, expect } from 'vitest';
import {
  parseTranslateResponse,
  chunkItems,
  isTransientTranslateError,
  isFatalTranslateError,
  type TranslateItem,
} from '../src/generators/translate';
import { collectUntranslated, summarizeUntranslated } from '../src/generators/translate/collect';
import { emptyProject, translateTargetsOf, type Project } from '../src/types';

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

  it('줄마다 "실제로 비어 있는 언어"만 missing 에 담는다 — 이미 있는 번역을 다시 요청·덮어쓰지 않도록', () => {
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
            { kind: 'dialogue', speaker: '민주', text: '안녕', i18n: { en: 'Hi' } }, // ja 만 필요
            { kind: 'dialogue', speaker: '민주', text: '잘가', i18n: { ja: 'またね' } }, // en 만 필요
            { kind: 'narration', text: '비가 내렸다' }, // 둘 다 필요
          ],
        },
      ],
    };
    const items = collectUntranslated(p, ['en', 'ja'])[0].items;
    expect(items.map((it) => it.missing)).toEqual([['ja'], ['en'], ['en', 'ja']]);
  });
});

// 화면(CenterPanel)이 "EN 2 · JA 2 · 대상 3줄"을 실행 전에 보여주는 근거. 대상 판정은 여전히
// collectUntranslated 하나가 정본이고, 여기서 검증하는 건 "그 결과를 세는 방식"뿐이다.
describe('summarizeUntranslated', () => {
  function mixed(): Project {
    return {
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
            { kind: 'dialogue', speaker: '민주', text: 'A', i18n: { ja: 'あ' } }, // EN 없음
            { kind: 'dialogue', speaker: '민주', text: 'B', i18n: { en: 'B' } }, // JA 없음
            { kind: 'narration', text: 'C' }, // 둘 다 없음
            { kind: 'dialogue', speaker: '민주', text: 'D', i18n: { en: 'D', ja: 'デ' } }, // 완역
          ],
        },
      ],
    };
  }

  it('로케일별 빈 칸과 대상 줄 수를 따로 센다 — 둘 다 없는 줄을 2줄로 세지 않는다', () => {
    expect(summarizeUntranslated(mixed(), ['en', 'ja'])).toEqual({
      byLocale: { en: 2, ja: 2 },
      lines: 3,
    });
  });

  it('전부 채워졌으면 0 — 실행 전에 "번역할 게 없다"를 표시할 수 있어야 한다', () => {
    const p = mixed();
    p.scenes[0].lines = [{ kind: 'dialogue', speaker: '민주', text: 'D', i18n: { en: 'D', ja: 'デ' } }];
    expect(summarizeUntranslated(p, ['en', 'ja'])).toEqual({ byLocale: {}, lines: 0 });
  });

  it('원문이 영어인 프로젝트는 JA 만 센다(자동 번역 target 정책과 동일)', () => {
    const p: Project = { ...mixed(), baseLocale: 'en' };
    const targets = translateTargetsOf(p);
    expect(targets).toEqual(['ja']);
    // A(ja 있음)는 대상이 아니고 B·C 만 남는다 — en 은 세지 않는다.
    expect(summarizeUntranslated(p, targets)).toEqual({ byLocale: { ja: 2 }, lines: 2 });
  });
});

function mkItems(n: number, koLen = 3): TranslateItem[] {
  return Array.from({ length: n }, (_, i) => ({ i, ko: 'x'.repeat(koLen) }));
}

// chunkItems 가 제네릭(<T>(items, sizeOf, ...))으로 바뀌어(generators/emotion/aiSelect.ts 도 재사용)
// 모든 호출부가 sizeOf 를 명시해야 한다 — 번역 항목은 항상 ko.length 로 크기를 잰다.
const koLen = (it: TranslateItem) => it.ko.length;

describe('chunkItems', () => {
  it('줄 수가 상한 이하면 청크 1개로 묶는다(회귀 가드)', () => {
    const items = mkItems(40);
    const chunks = chunkItems(items, koLen);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(40);
  });

  it('90개면 40/40/10 으로 나누고 순서·인덱스를 보존한다', () => {
    const items = mkItems(90);
    const chunks = chunkItems(items, koLen);
    expect(chunks.map((c) => c.length)).toEqual([40, 40, 10]);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(40);
    const seen = chunks.flat().map((it) => it.i);
    expect(seen).toEqual(Array.from({ length: 90 }, (_, i) => i)); // 순서 보존 + 정확히 1번씩
  });

  it('글자 수 상한에 걸리면 줄 수 상한 전에 분할한다', () => {
    // 10개 × 500자 = 5000자 > 4000자 캡 → 40줄 캡(=10개 미만이라 안 걸림)보다 먼저 글자 수로 쪼개져야 함
    const items = mkItems(10, 500);
    const chunks = chunkItems(items, koLen);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      const chars = c.reduce((sum, it) => sum + it.ko.length, 0);
      expect(chars).toBeLessThanOrEqual(4000);
    }
    expect(chunks.flat()).toHaveLength(10);
  });

  it('단일 아이템이 maxChars 를 넘어도 누락 없이 단독 청크가 된다', () => {
    const items: TranslateItem[] = [
      { i: 0, ko: 'x'.repeat(50) },
      { i: 1, ko: 'y'.repeat(5) },
    ];
    const chunks = chunkItems(items, koLen, 40, 10); // 작은 maxChars 로 빠르게 테스트
    expect(chunks.flat().map((it) => it.i)).toEqual([0, 1]);
    expect(chunks.some((c) => c.length === 1 && c[0].i === 0)).toBe(true);
  });

  it('빈 입력은 빈 배열을 반환한다', () => {
    expect(chunkItems([] as TranslateItem[], koLen)).toEqual([]);
  });
});

describe('isTransientTranslateError', () => {
  it('레이트리밋/시간초과/5xx 는 일시적 오류로 판단한다', () => {
    expect(isTransientTranslateError(new Error('번역 실패 (HTTP 429): 레이트 리밋'))).toBe(true);
    expect(isTransientTranslateError(new Error('번역 요청 시간 초과(레이트 리밋/네트워크 의심)'))).toBe(true);
    expect(isTransientTranslateError(new Error('번역 실패 (HTTP 503)'))).toBe(true);
  });

  it('4xx(429 제외)나 무관한 오류는 일시적이지 않다고 판단한다', () => {
    expect(isTransientTranslateError(new Error('번역 실패 (HTTP 400)'))).toBe(false);
    expect(isTransientTranslateError(new Error('Incorrect API key'))).toBe(false);
  });
});

describe('isFatalTranslateError', () => {
  it('인증/쿼터 오류는 치명적으로 판단한다', () => {
    expect(isFatalTranslateError(new Error('번역 실패 (HTTP 401)'))).toBe(true);
    expect(isFatalTranslateError(new Error('You exceeded your current quota'))).toBe(true);
  });

  it('레이트리밋은 치명적이지 않다고 판단한다', () => {
    expect(isFatalTranslateError(new Error('번역 실패 (HTTP 429): 레이트 리밋'))).toBe(false);
  });
});
