import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  candidateKey,
  collectEmotionTargets,
  parseEmotionResponse,
  selectEmotionsBatch,
  type EmotionItem,
} from '../src/generators/emotion/aiSelect';
import { outfitFlags, type Character, type Expression } from '../src/types';
import { scene, projectWith, dialogue } from './fixtures';

function char(name: string, patch: Partial<Character> = {}): Character {
  return { name, color: '#ffffff', expressions: {}, ...patch };
}

/**
 * aiSelect.ts 의 기본 지시문 사본. 줄 단위 의상 전환도 표정 설명도 없는 프로젝트는 프롬프트가
 * 예전과 한 바이트도 달라지면 안 되므로(입력이 같아야 temperature 0 의 재현성이 유지된다 — 모델
 * 쪽 비결정성까지 없애진 못하니 "결과 동일"까지는 아니다) 여기에 못을 박는다.
 * 조건부 문장(의상 구분 안내·설명 안내)이 실수로 무조건 붙게 되면 이 사본과 어긋나 즉시 드러난다.
 */
const BASE_SYSTEM_PROMPT =
  'You are a visual-novel director choosing character facial expressions from scene context. ' +
  "For each dialogue line, pick exactly ONE expression from that speaker's candidate list — " +
  'copy a candidate string exactly as given, never invent a new label or translate it. ' +
  'Only change the expression when the emotion actually shifts; if it is unchanged from the ' +
  'previous line, repeat the same expression (avoid flickering between lines). ' +
  'Output STRICT JSON only, no markdown, no commentary: {"results":[{"i":0,"expr":"..."}]}. ' +
  "The \"i\" MUST equal the input item's \"i\". Do not add or drop items.";

/**
 * 같은 장면·**같은 청크**에서 민주가 교복 → 수영복 → 파티복으로 두 번 갈아입는 F1 공용 fixture.
 * ⚠️ 전용 표정을 base expressions 에 두면 안 된다 — spriteAssetId 가 기본 의상으로 폴백하므로
 * 세 의상의 후보가 전부 같아져 테스트가 아무것도 증명하지 못한다. 의상 맵에만 둔다.
 */
function abcProject() {
  const sc = scene({
    outfits: { 민주: '교복' },
    lines: [
      dialogue('민주', 'A 줄'),
      dialogue('민주', 'B 줄', { outfits: { 민주: '수영복' } }),
      dialogue('민주', 'C 줄', { outfits: { 민주: '파티복' } }),
    ],
  });
  const project = projectWith([sc], {
    expressions: ['기본', '교복전용', '수영복전용', '파티복전용'],
    characters: [
      char('민주', {
        expressions: { 기본: 'a0' }, // 전 의상 공통(폴백)
        outfits: [
          { name: '교복', expressions: { 교복전용: 'a1' } },
          { name: '수영복', expressions: { 수영복전용: 'a2' } },
          { name: '파티복', expressions: { 파티복전용: 'a3' } },
        ],
      }),
    ],
  });
  return { sc, project };
}

/** A→B→C 줄과 후보 맵의 손수 버전 — collect 를 거치지 않고 파서·페이로드만 직접 검증할 때. */
const abcItems: EmotionItem[] = [
  { i: 0, speaker: '민주', outfit: '교복', text: 'A 줄' },
  { i: 1, speaker: '민주', outfit: '수영복', text: 'B 줄' },
  { i: 2, speaker: '민주', outfit: '파티복', text: 'C 줄' },
];
const abcCandidates = new Map<string, Expression[]>([
  [candidateKey('민주', '교복'), ['기본', '교복전용']],
  [candidateKey('민주', '수영복'), ['기본', '수영복전용']],
  [candidateKey('민주', '파티복'), ['기본', '파티복전용']],
]);

/** 요청 페이로드(user 메시지)의 모양 — 조건부 필드(outfit/expressionNotes)는 optional. */
interface CapturedUser {
  scene: string;
  synopsis?: string;
  candidates: { speaker: string; outfit?: string; candidates: string[] }[];
  expressionNotes?: Record<string, string>;
  prevContext?: string[];
  items: { i: number; speaker: string; outfit?: string; text: string }[];
}

/** fetch 를 가로채 system/user 메시지를 캡처한다(반환 객체는 호출 뒤에 채워진다). */
function captureRequest(responseContent = '{"results":[]}') {
  const captured: { system?: string; user?: CapturedUser } = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
      captured.system = body.messages[0].content;
      captured.user = JSON.parse(body.messages[1].content) as CapturedUser;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: responseContent } }] }),
      } as Response;
    }),
  );
  return captured;
}

describe('candidateKey: (화자, 의상) 후보 맵 키의 단일 소스', () => {
  it('제어문자 없이 직렬화하고, 구분자처럼 보이는 문자가 이름에 들어와도 키가 겹치지 않는다', () => {
    expect(candidateKey('민주', '교복')).toBe('["민주","교복"]');
    expect([...candidateKey('민주', '교복')].every((ch) => ch.charCodeAt(0) >= 0x20)).toBe(true);
    // 구분자 한 글자를 쓰면 아래 각 쌍이 같은 키가 된다(예: "a|b|c") — JSON 직렬화는 그럴 일이 없다.
    expect(candidateKey('a', 'b|c')).not.toBe(candidateKey('a|b', 'c'));
    expect(candidateKey('a', 'b"c')).not.toBe(candidateKey('a"b', 'c'));
  });
});

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
    expect(batches[0].candidatesByKey.size).toBe(1); // 전환이 없으면 화자당 후보 집합 하나
    expect(batches[0].candidatesByKey.get(candidateKey('민주', '기본'))).toEqual(['기본', '화남']); // 선언 순서 유지
  });

  it('장면별 의상(#복장)에 따라 후보가 달라진다(장면 단위 판정 회귀)', () => {
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
    expect(batches[0].items[0].outfit).toBe('수영복');
    expect(batches[0].candidatesByKey.size).toBe(1);
    expect(batches[0].candidatesByKey.get(candidateKey('민주', '수영복'))).toEqual(['기본', '화남']);
  });
});

describe('collectEmotionTargets(F1): 같은 장면·같은 청크에서 A→B→C 로 갈아입는 화자', () => {
  it('줄마다의 effective outfit 이 outfitFlags(판정 단일 소스)와 정확히 일치한다', () => {
    const { sc, project } = abcProject();
    const [batch] = collectEmotionTargets(project);
    const flags = outfitFlags(sc, project.outfitRules, '민주');

    expect(batch.items.map((it) => it.outfit)).toEqual(['교복', '수영복', '파티복']);
    expect(batch.items.map((it) => it.outfit)).toEqual(batch.items.map((it) => flags[it.i]));
  });

  it('줄마다의 후보가 그 줄 의상 기준이다 — 다른 의상 전용 표정은 후보에서 빠진다', () => {
    const { project } = abcProject();
    const [batch] = collectEmotionTargets(project);
    const candOf = (it: EmotionItem) => batch.candidatesByKey.get(candidateKey(it.speaker, it.outfit))!;

    // A(교복): 교복전용 포함 · 나머지 전용 제외
    expect(candOf(batch.items[0])).toEqual(['기본', '교복전용']);
    expect(candOf(batch.items[0])).not.toContain('수영복전용');
    expect(candOf(batch.items[0])).not.toContain('파티복전용');
    // B(수영복): 새 의상 전용이 들어오고 이전 의상 전용은 빠진다
    expect(candOf(batch.items[1])).toEqual(['기본', '수영복전용']);
    expect(candOf(batch.items[1])).not.toContain('교복전용');
    expect(candOf(batch.items[1])).not.toContain('파티복전용');
    // C(파티복): 앞선 두 의상 전용이 모두 빠진다
    expect(candOf(batch.items[2])).toEqual(['기본', '파티복전용']);
    expect(candOf(batch.items[2])).not.toContain('교복전용');
    expect(candOf(batch.items[2])).not.toContain('수영복전용');
  });

  it('후보 집합이 화자 하나가 아니라 (화자, 의상) 3개로 잡힌다', () => {
    const { project } = abcProject();
    const [batch] = collectEmotionTargets(project);

    expect(batch.candidatesByKey.size).toBe(3);
    expect([...batch.candidatesByKey.keys()]).toEqual([
      candidateKey('민주', '교복'),
      candidateKey('민주', '수영복'),
      candidateKey('민주', '파티복'),
    ]);
  });

  it('그 줄 의상에 올라간 스프라이트가 하나도 없으면 그 줄만 빠진다(화자의 장면 전체가 아니라)', () => {
    const sc = scene({
      outfits: { 민주: '교복' },
      lines: [
        dialogue('민주', '교복 줄'),
        dialogue('민주', '그림 없는 의상 줄', { outfits: { 민주: '아직없는옷' } }),
      ],
    });
    const p = projectWith([sc], {
      expressions: ['교복전용'],
      // 기본 의상엔 그림이 없다 — '아직없는옷' 일 때는 폴백할 곳이 없어 후보가 빈다.
      characters: [
        char('민주', { expressions: {}, outfits: [{ name: '교복', expressions: { 교복전용: 'a1' } }] }),
      ],
    });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.text)).toEqual(['교복 줄']);
    expect(batch.items[0].outfit).toBe('교복');
  });
});

describe('parseEmotionResponse: 방어적 파싱 — 오답을 추측하지 않고 버린다', () => {
  const items: EmotionItem[] = [
    { i: 0, speaker: '민주', outfit: '기본', text: '대사0' },
    { i: 1, speaker: '민주', outfit: '기본', text: '대사1' },
    { i: 2, speaker: '지수', outfit: '기본', text: '대사2' },
  ];
  const candidatesByKey = new Map<string, Expression[]>([
    [candidateKey('민주', '기본'), ['기본', '기쁨', '슬픔']],
    [candidateKey('지수', '기본'), ['기본', '화남']],
  ]);

  it('코드펜스를 걷어내고 결과를 인덱스로 매핑한다', () => {
    const raw = '```json\n{"results":[{"i":0,"expr":"기쁨"},{"i":1,"expr":"슬픔"}]}\n```';
    expect(parseEmotionResponse(raw, items, candidatesByKey)).toEqual({ 0: '기쁨', 1: '슬픔' });
  });

  it('후보 밖 라벨은 추측하지 않고 그 줄만 버린다', () => {
    const raw = '{"results":[{"i":0,"expr":"기쁨"},{"i":2,"expr":"슬픔"}]}'; // 슬픔은 지수 후보에 없음
    expect(parseEmotionResponse(raw, items, candidatesByKey)).toEqual({ 0: '기쁨' });
  });

  it('입력에 없던 인덱스(유령 응답)는 버린다', () => {
    const raw = '{"results":[{"i":0,"expr":"기쁨"},{"i":99,"expr":"기쁨"}]}';
    expect(parseEmotionResponse(raw, items, candidatesByKey)).toEqual({ 0: '기쁨' });
  });

  it('일부 인덱스가 응답에서 통째로 빠져도(missing) 나머지는 정상 반영된다', () => {
    const raw = '{"results":[{"i":1,"expr":"슬픔"}]}'; // 0, 2 는 응답에 없음
    expect(parseEmotionResponse(raw, items, candidatesByKey)).toEqual({ 1: '슬픔' });
  });

  it('인덱스 순서가 뒤섞여도(shuffled) 각자 올바른 i 에 매핑된다', () => {
    const raw = '{"results":[{"i":2,"expr":"화남"},{"i":0,"expr":"기쁨"},{"i":1,"expr":"기본"}]}';
    expect(parseEmotionResponse(raw, items, candidatesByKey)).toEqual({ 0: '기쁨', 1: '기본', 2: '화남' });
  });

  it('전각 공백·앞뒤 공백을 정규화한 뒤 후보와 비교한다(값은 후보 원문 그대로 저장)', () => {
    const withSpaceCandidates = new Map<string, Expression[]>([
      [candidateKey('민주', '기본'), ['옅은 미소']],
    ]);
    const spacedItems: EmotionItem[] = [{ i: 0, speaker: '민주', outfit: '기본', text: '대사' }];
    const raw = '{"results":[{"i":0,"expr":" 옅은　미소 "}]}'; // 전각 공백 + 양끝 공백
    expect(parseEmotionResponse(raw, spacedItems, withSpaceCandidates)).toEqual({ 0: '옅은 미소' });
  });

  it('JSON 객체를 찾지 못하면 예외를 던진다(호출측 폴백 유도)', () => {
    expect(() => parseEmotionResponse('죄송합니다, 배정 불가', items, candidatesByKey)).toThrow();
  });
});

describe('parseEmotionResponse(F1): 줄마다 자기 의상의 후보로 검증한다', () => {
  it('A→B→C 세 줄이 각자 자기 의상 전용 표정을 받으면 셋 다 채택된다', () => {
    const raw =
      '{"results":[{"i":0,"expr":"교복전용"},{"i":1,"expr":"수영복전용"},{"i":2,"expr":"파티복전용"}]}';
    expect(parseEmotionResponse(raw, abcItems, abcCandidates)).toEqual({
      0: '교복전용',
      1: '수영복전용',
      2: '파티복전용',
    });
  });

  it('전환 뒤 줄에 이전 의상 전용 표정이 오면 그 줄만 버려진다(다른 줄은 그대로 채택)', () => {
    const raw =
      '{"results":[{"i":0,"expr":"교복전용"},{"i":1,"expr":"수영복전용"},{"i":2,"expr":"교복전용"}]}';
    // i:2 는 파티복 줄 — 교복전용은 그 줄 후보가 아니므로 그림 없는 표정이 저장되면 안 된다.
    expect(parseEmotionResponse(raw, abcItems, abcCandidates)).toEqual({ 0: '교복전용', 1: '수영복전용' });
  });
});

describe('selectEmotionsBatch: 청크 경계·후보 그룹·문맥이 그대로 요청 페이로드에 실린다', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseCtx = { sceneTitle: '장면1', direction: [] as string[], cg: [] as string[], synopsis: '요약' };

  it('넘긴 items 만 그대로 요청 items 로 직렬화되고(청크 경계 보존), prevContextLines 도 함께 실린다', async () => {
    const chunk: EmotionItem[] = [
      { i: 3, speaker: '민주', outfit: '기본', text: '세 번째 줄' },
      { i: 4, speaker: '민주', outfit: '기본', text: '네 번째 줄' },
    ];
    const captured = captureRequest('{"results":[{"i":3,"expr":"기쁨"}]}');

    const result = await selectEmotionsBatch(
      chunk,
      {
        ...baseCtx,
        candidatesByKey: new Map([[candidateKey('민주', '기본'), ['기본', '기쁨']]]),
        prevContextLines: [{ speaker: '민주', text: '직전 줄' }],
      },
      'sk-test',
    );

    expect(result).toEqual({ 3: '기쁨' });
    // 청크 경계 보존 — 넘긴 두 항목의 i 가 정확히 그대로, 더도 덜도 아니게 실린다.
    expect(captured.user!.items.map((it) => it.i)).toEqual([3, 4]);
    expect(captured.user!.prevContext).toEqual(['민주: 직전 줄']);
  });

  it('prevContextLines 가 없으면 prevContext 키 자체가 페이로드에서 빠진다', async () => {
    const captured = captureRequest();

    await selectEmotionsBatch(
      [{ i: 0, speaker: '민주', outfit: '기본', text: '첫 줄' }],
      { ...baseCtx, synopsis: '', candidatesByKey: new Map([[candidateKey('민주', '기본'), ['기본']]]) },
      'sk-test',
    );

    expect(captured.user!.prevContext).toBeUndefined();
  });

  it('후보 맵에서 이 청크에 필요한 그룹만 싣되 순서는 맵의 삽입 순서를 따른다(요청 바이트 보존)', async () => {
    const captured = captureRequest();
    // 맵 삽입 순서(장면 내 최초 등장) = 민주 → 지수, 이 청크의 item 순서는 그 반대.
    const candidatesByKey = new Map<string, Expression[]>([
      [candidateKey('민주', '기본'), ['기본', '기쁨']],
      [candidateKey('지수', '기본'), ['기본', '화남']],
      [candidateKey('유나', '기본'), ['기본', '슬픔']], // 이 청크에 안 나오는 화자 — 실리면 안 된다
    ]);

    await selectEmotionsBatch(
      [
        { i: 5, speaker: '지수', outfit: '기본', text: 'ㄱ' },
        { i: 6, speaker: '민주', outfit: '기본', text: 'ㄴ' },
      ],
      { ...baseCtx, candidatesByKey },
      'sk-test',
    );

    expect(captured.user!.candidates).toEqual([
      { speaker: '민주', candidates: ['기본', '기쁨'] },
      { speaker: '지수', candidates: ['기본', '화남'] },
    ]);
  });

  it('같은 화자가 이 청크에서 A→B→C 로 갈아입으면 후보 그룹 3개와 줄별 의상이 실린다', async () => {
    const captured = captureRequest();

    await selectEmotionsBatch(abcItems, { ...baseCtx, candidatesByKey: abcCandidates }, 'sk-test');

    expect(captured.user!.candidates).toEqual([
      { speaker: '민주', outfit: '교복', candidates: ['기본', '교복전용'] },
      { speaker: '민주', outfit: '수영복', candidates: ['기본', '수영복전용'] },
      { speaker: '민주', outfit: '파티복', candidates: ['기본', '파티복전용'] },
    ]);
    expect(captured.user!.items).toEqual([
      { i: 0, speaker: '민주', outfit: '교복', text: 'A 줄' },
      { i: 1, speaker: '민주', outfit: '수영복', text: 'B 줄' },
      { i: 2, speaker: '민주', outfit: '파티복', text: 'C 줄' },
    ]);
    expect(captured.system).toContain('"speaker" AND "outfit"');
  });

  it('화자마다 의상이 하나씩이면(서로 달라도) outfit 을 노출하지 않고 기본 지시문 그대로다', async () => {
    const captured = captureRequest();

    await selectEmotionsBatch(
      [
        { i: 0, speaker: '민주', outfit: '교복', text: 'ㄱ' },
        { i: 1, speaker: '지수', outfit: '사복', text: 'ㄴ' },
      ],
      {
        ...baseCtx,
        candidatesByKey: new Map([
          [candidateKey('민주', '교복'), ['기본', '기쁨']],
          [candidateKey('지수', '사복'), ['기본', '화남']],
        ]),
      },
      'sk-test',
    );

    expect(captured.user!.candidates).toEqual([
      { speaker: '민주', candidates: ['기본', '기쁨'] },
      { speaker: '지수', candidates: ['기본', '화남'] },
    ]);
    expect(JSON.stringify(captured.user)).not.toContain('outfit');
    expect(captured.system).toBe(BASE_SYSTEM_PROMPT);
  });
});

describe('selectEmotionsBatch(F4): 표정 설명은 metadata 일 뿐 후보 identity 가 아니다', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const noteItems: EmotionItem[] = [{ i: 0, speaker: '민주', outfit: '기본', text: '대사' }];
  const noteCandidates = new Map<string, Expression[]>([
    [candidateKey('민주', '기본'), ['기본', '옅은 미소']],
  ]);
  const ctx = (expressionNotes?: Record<string, string>) => ({
    sceneTitle: '장면1',
    direction: [] as string[],
    cg: [] as string[],
    synopsis: '',
    candidatesByKey: noteCandidates,
    expressionNotes,
  });

  it('설명이 있으면 후보는 canonical 원문만 담고 설명은 별도 키로 나간다', async () => {
    const captured = captureRequest();

    // '화남' 은 이 청크 후보가 아니다 — 설명도 실리면 안 된다(프롬프트 비대화 방지).
    await selectEmotionsBatch(noteItems, ctx({ '옅은 미소': '살짝 웃는 표정', 화남: '분노' }), 'sk-test');

    expect(captured.user!.candidates).toEqual([{ speaker: '민주', candidates: ['기본', '옅은 미소'] }]);
    expect(captured.user!.expressionNotes).toEqual({ '옅은 미소': '살짝 웃는 표정' });
    expect(captured.system).toContain('expressionNotes');
  });

  it('프로젝트에 설명이 있어도 이 청크 후보에 없으면 설명 키도 안내 문장도 나가지 않는다', async () => {
    const captured = captureRequest();

    await selectEmotionsBatch(noteItems, ctx({ 화남: '분노' }), 'sk-test');

    expect(captured.user!.expressionNotes).toBeUndefined();
    expect(captured.system).toBe(BASE_SYSTEM_PROMPT);
  });

  it('설명이 아예 없으면 기존 페이로드·지시문 그대로다', async () => {
    const captured = captureRequest();

    await selectEmotionsBatch(noteItems, ctx(), 'sk-test');

    expect(captured.user!.expressionNotes).toBeUndefined();
    expect(captured.system).toBe(BASE_SYSTEM_PROMPT);
  });

  it('canonical 이름으로 답하면 project.expressions 원문 그대로 채택된다', async () => {
    captureRequest('{"results":[{"i":0,"expr":"옅은 미소"}]}');

    const result = await selectEmotionsBatch(noteItems, ctx({ '옅은 미소': '살짝 웃는 표정' }), 'sk-test');

    expect(result).toEqual({ 0: '옅은 미소' });
  });

  it('설명을 괄호로 붙인 표기로 답하면 후보 밖으로 거부된다(추측·괄호 제거 없음)', async () => {
    captureRequest('{"results":[{"i":0,"expr":"옅은 미소(살짝 웃는 표정)"}]}');

    const result = await selectEmotionsBatch(noteItems, ctx({ '옅은 미소': '살짝 웃는 표정' }), 'sk-test');

    expect(result).toEqual({});
  });
});
