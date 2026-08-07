import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  collectEmotionTargets,
  parseEmotionResponse,
  selectEmotionsBatch,
  type EmotionItem,
} from '../src/generators/emotion/aiSelect';
import type { Character } from '../src/types';
import { scene, projectWith, dialogue } from './fixtures';

function char(name: string, patch: Partial<Character> = {}): Character {
  return { name, color: '#ffffff', expressions: {}, ...patch };
}

describe('collectEmotionTargets: "AI 표정 배정이 필요한 대사"만 장면별로 모은다', () => {
  it('이미 emotion 또는 emotionAuto 가 있는 줄은 건너뛴다(증분 재실행이 공짜여야 함)', () => {
    const sc = scene({
      lines: [
        dialogue('민주', '이미 수동 지정됨', { emotion: '기쁨' }),
        dialogue('민주', '이미 AI 배정됨', { emotionAuto: '슬픔' }),
        dialogue('민주', '아직 안 채워짐'),
      ],
    });
    const p = projectWith([sc], { characters: [char('민주', { expressions: { 기본: 'a1', 기쁨: 'a2' } })] });
    const batches = collectEmotionTargets(p);
    expect(batches).toHaveLength(1);
    expect(batches[0].items.map((i) => i.text)).toEqual(['아직 안 채워짐']);
  });

  it('주인공(isProtagonist)의 대사는 대상에서 제외된다', () => {
    const sc = scene({ lines: [dialogue('주인공', '오늘도 화이팅')] });
    const p = projectWith([sc], {
      characters: [char('주인공', { isProtagonist: true, expressions: { 기본: 'a1', 기쁨: 'a2' } })],
    });
    expect(collectEmotionTargets(p)).toEqual([]);
  });

  it('합동 대사(members)는 단일 스프라이트가 없어 대상에서 제외된다', () => {
    const sc = scene({
      lines: [dialogue('한지수 & 강민주', '같이 말함', { members: ['한지수', '강민주'] })],
    });
    const p = projectWith([sc], {
      characters: [
        char('한지수', { expressions: { 기본: 'a1' } }),
        char('강민주', { expressions: { 기본: 'a2' } }),
      ],
    });
    expect(collectEmotionTargets(p)).toEqual([]);
  });

  it('화자가 스프라이트를 하나도 안 올렸으면(availableExpressions 빈 집합) 대상에서 제외된다', () => {
    const sc = scene({ lines: [dialogue('민주', '표정 후보가 없음')] });
    const p = projectWith([sc], { characters: [char('민주', { expressions: {} })] });
    expect(collectEmotionTargets(p)).toEqual([]);
  });

  it('후보 목록은 project.expressions 선언 순서를 따르고, 업로드 안 된 표정은 제외된다', () => {
    const sc = scene({ lines: [dialogue('민주', '표정 골라줘')] });
    const p = projectWith([sc], {
      expressions: ['기본', '슬픔', '기쁨', '화남'], // 선언 순서(계열/강도)
      characters: [char('민주', { expressions: { 기본: 'a1', 화남: 'a2' } })], // 슬픔·기쁨은 미업로드
    });
    const batches = collectEmotionTargets(p);
    expect(batches[0].candidatesBySpeaker.get('민주')).toEqual(['기본', '화남']); // 선언 순서 유지
  });

  it('장면별 의상(#복장)에 따라 후보가 달라진다(resolveOutfit 반영)', () => {
    const sc = scene({ lines: [dialogue('민주', '수영복 표정')], outfits: { 민주: '수영복' } });
    const p = projectWith([sc], {
      expressions: ['기본', '화남'],
      characters: [
        char('민주', {
          expressions: { 기본: 'a1' },
          outfits: [{ name: '수영복', expressions: { 화남: 'a2' } }],
        }),
      ],
    });
    const batches = collectEmotionTargets(p);
    expect(batches[0].candidatesBySpeaker.get('민주')).toEqual(['기본', '화남']);
  });
});

describe('parseEmotionResponse: 방어적 파싱 — 오답을 추측하지 않고 버린다', () => {
  const items: EmotionItem[] = [
    { i: 0, speaker: '민주', text: '대사0' },
    { i: 1, speaker: '민주', text: '대사1' },
    { i: 2, speaker: '지수', text: '대사2' },
  ];
  const candidatesBySpeaker = new Map([
    ['민주', ['기본', '기쁨', '슬픔']],
    ['지수', ['기본', '화남']],
  ]);

  it('코드펜스를 걷어내고 결과를 인덱스로 매핑한다', () => {
    const raw = '```json\n{"results":[{"i":0,"expr":"기쁨"},{"i":1,"expr":"슬픔"}]}\n```';
    expect(parseEmotionResponse(raw, items, candidatesBySpeaker)).toEqual({ 0: '기쁨', 1: '슬픔' });
  });

  it('후보 밖 라벨은 추측하지 않고 그 줄만 버린다', () => {
    const raw = '{"results":[{"i":0,"expr":"기쁨"},{"i":2,"expr":"슬픔"}]}'; // 슬픔은 지수 후보에 없음
    expect(parseEmotionResponse(raw, items, candidatesBySpeaker)).toEqual({ 0: '기쁨' });
  });

  it('입력에 없던 인덱스(유령 응답)는 버린다', () => {
    const raw = '{"results":[{"i":0,"expr":"기쁨"},{"i":99,"expr":"기쁨"}]}';
    expect(parseEmotionResponse(raw, items, candidatesBySpeaker)).toEqual({ 0: '기쁨' });
  });

  it('일부 인덱스가 응답에서 통째로 빠져도(missing) 나머지는 정상 반영된다', () => {
    const raw = '{"results":[{"i":1,"expr":"슬픔"}]}'; // 0, 2 는 응답에 없음
    expect(parseEmotionResponse(raw, items, candidatesBySpeaker)).toEqual({ 1: '슬픔' });
  });

  it('인덱스 순서가 뒤섞여도(shuffled) 각자 올바른 i 에 매핑된다', () => {
    const raw = '{"results":[{"i":2,"expr":"화남"},{"i":0,"expr":"기쁨"},{"i":1,"expr":"기본"}]}';
    expect(parseEmotionResponse(raw, items, candidatesBySpeaker)).toEqual({ 0: '기쁨', 1: '기본', 2: '화남' });
  });

  it('전각 공백·앞뒤 공백을 정규화한 뒤 후보와 비교한다(값은 후보 원문 그대로 저장)', () => {
    const withSpaceCandidates = new Map([['민주', ['옅은 미소']]]);
    const spacedItems: EmotionItem[] = [{ i: 0, speaker: '민주', text: '대사' }];
    const raw = '{"results":[{"i":0,"expr":" 옅은　미소 "}]}'; // 전각 공백 + 양끝 공백
    expect(parseEmotionResponse(raw, spacedItems, withSpaceCandidates)).toEqual({ 0: '옅은 미소' });
  });

  it('JSON 객체를 찾지 못하면 예외를 던진다(호출측 폴백 유도)', () => {
    expect(() => parseEmotionResponse('죄송합니다, 배정 불가', items, candidatesBySpeaker)).toThrow();
  });
});

describe('selectEmotionsBatch: 청크 경계와 직전 문맥이 그대로 요청 페이로드에 실린다', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('넘긴 items 만 그대로 요청 items 로 직렬화되고(청크 경계 보존), prevContextLines 도 함께 실린다', async () => {
    const chunk: EmotionItem[] = [
      { i: 3, speaker: '민주', text: '세 번째 줄' },
      { i: 4, speaker: '민주', text: '네 번째 줄' },
    ];
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"results":[{"i":3,"expr":"기쁨"}]}' } }],
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await selectEmotionsBatch(
      chunk,
      {
        sceneTitle: '장면1',
        direction: [],
        cg: [],
        synopsis: '요약',
        candidatesBySpeaker: new Map([['민주', ['기본', '기쁨']]]),
        prevContextLines: [{ speaker: '민주', text: '직전 줄' }],
      },
      'sk-test',
    );

    expect(result).toEqual({ 3: '기쁨' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const userMsg = JSON.parse((capturedBody!.messages as { role: string; content: string }[])[1].content);
    // 청크 경계 보존 — 넘긴 두 항목의 i 가 정확히 그대로, 더도 덜도 아니게 실린다.
    expect(userMsg.items.map((it: { i: number }) => it.i)).toEqual([3, 4]);
    expect(userMsg.prevContext).toEqual(['민주: 직전 줄']);
  });

  it('prevContextLines 가 없으면 prevContext 키 자체가 페이로드에서 빠진다', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"results":[]}' } }] }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await selectEmotionsBatch(
      [{ i: 0, speaker: '민주', text: '첫 줄' }],
      { sceneTitle: '장면1', direction: [], cg: [], synopsis: '', candidatesBySpeaker: new Map([['민주', ['기본']]]) },
      'sk-test',
    );

    const userMsg = JSON.parse((capturedBody!.messages as { role: string; content: string }[])[1].content);
    expect(userMsg.prevContext).toBeUndefined();
  });
});
