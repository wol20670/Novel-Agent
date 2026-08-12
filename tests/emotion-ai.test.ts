import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  candidateKey,
  collectEmotionTargets,
  parseEmotionResponse,
  planEmotionChunks,
  selectEmotionsBatch,
  type EmotionItem,
} from '../src/generators/emotion/aiSelect';
import { outfitFlags, type Character, type Expression, type Line } from '../src/types';
import { scene, projectWith, dialogue } from './fixtures';

function char(name: string, patch: Partial<Character> = {}): Character {
  return { name, color: '#ffffff', expressions: {}, ...patch };
}

/** 지문 한 줄 — 문맥 전용(절대 target 이 아니다). */
function narration(text: string): Line {
  return { kind: 'narration', text };
}

/** 스프라이트가 올라간 평범한 히로인(= AI target 이 될 수 있는 화자). */
function heroine(name = '민주'): Character {
  return char(name, { expressions: { 기본: 'a1', 기쁨: 'a2', 슬픔: 'a3' } });
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

/** 요청 페이로드(user 메시지)의 모양 — 조건부 필드(outfit/expressionNotes/context)는 optional. */
interface CapturedUser {
  scene: string;
  synopsis?: string;
  candidates: { speaker: string; outfit?: string; candidates: string[] }[];
  expressionNotes?: Record<string, string>;
  context?: { i: number; speaker?: string; text: string; expr?: string }[];
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

  it('넘긴 items 만 그대로 요청 items 로 직렬화되고(청크 경계 보존), contextLines 도 함께 실린다', async () => {
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
        contextLines: [{ i: 2, speaker: '민주', text: '직전 줄' }],
      },
      'sk-test',
    );

    expect(result).toEqual({ 3: '기쁨' });
    // 청크 경계 보존 — 넘긴 두 항목의 i 가 정확히 그대로, 더도 덜도 아니게 실린다.
    expect(captured.user!.items.map((it) => it.i)).toEqual([3, 4]);
    // 문맥은 items 와 같은 i 좌표계를 쓰는 객체로 나간다(모델이 시간순으로 합칠 수 있어야 한다).
    expect(captured.user!.context).toEqual([{ i: 2, speaker: '민주', text: '직전 줄' }]);
    expect(captured.system).toContain('NEVER output a result for a "context" index');
  });

  it('contextLines 가 없으면 context 키도 안내 문장도 페이로드에서 빠진다', async () => {
    const captured = captureRequest();

    await selectEmotionsBatch(
      [{ i: 0, speaker: '민주', outfit: '기본', text: '첫 줄' }],
      { ...baseCtx, synopsis: '', candidatesByKey: new Map([[candidateKey('민주', '기본'), ['기본']]]) },
      'sk-test',
    );

    expect(captured.user!.context).toBeUndefined();
    expect(captured.system).toBe(BASE_SYSTEM_PROMPT);
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

/**
 * F2/F3 — target 과 "읽기 전용 문맥"의 분리. 이 블록의 계약 한 줄:
 * **target 여부는 그 줄이 문맥 source 에 있는지를 결정하지 않는다.** 예전엔 collectEmotionTargets 의
 * return 하나가 "AI 결과 대상 아님"과 "프롬프트에서 삭제"를 동시에 결정해, 주인공 대사·지문·이미
 * 배정된 줄이 LLM 입력에서 통째로 사라졌다.
 */
describe('collectEmotionTargets(F2/F3): 문맥 source 는 target gate 와 독립이다', () => {
  const ctxIdx = (p: ReturnType<typeof collectEmotionTargets>[number]) => [...p.scriptLinesByIndex.keys()];

  it('T1 — 주인공 대사는 target 이 아니지만 문맥에는 남는다', () => {
    const sc = scene({
      lines: [dialogue('주인공', '그 사람은 이제 돌아오지 않아.'), dialogue('민주', '...그렇구나.')],
    });
    const p = projectWith([sc], {
      characters: [char('주인공', { isProtagonist: true }), heroine()],
    });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.i)).toEqual([1]); // 민주만 target
    expect(ctxIdx(batch)).toEqual([0, 1]); // 주인공 줄도 source 에 있다
    expect(batch.scriptLinesByIndex.get(0)).toEqual({
      i: 0,
      speaker: '주인공',
      text: '그 사람은 이제 돌아오지 않아.',
      expr: undefined,
    });
  });

  it('T2 — 지문은 문맥에 들어가고(화자 없음) item/cg/bgm 줄은 문맥에도 안 들어간다', () => {
    const sc = scene({
      lines: [
        narration('그녀는 억지로 웃었지만 손끝은 떨리고 있었다.'),
        { kind: 'item', name: '열쇠' },
        { kind: 'cg', desc: '노을' },
        { kind: 'bgm', name: '테마' },
        dialogue('민주', '괜찮아.'),
      ],
    });
    const p = projectWith([sc], { characters: [heroine()] });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.i)).toEqual([4]);
    expect(ctxIdx(batch)).toEqual([0, 4]); // 아이템·CG·BGM 줄은 대사 텍스트가 아니라 제외
    expect(batch.scriptLinesByIndex.get(0)!.speaker).toBeUndefined();
  });

  it('T3 — 작가가 표정을 적은 줄은 target 이 아니지만 그 표정이 문맥 metadata 로 나간다', () => {
    const sc = scene({
      lines: [dialogue('민주', '됐어.', { emotion: '슬픔' }), dialogue('민주', '이제 가자.')],
    });
    const p = projectWith([sc], { characters: [heroine()] });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.i)).toEqual([1]);
    expect(batch.scriptLinesByIndex.get(0)).toEqual({ i: 0, speaker: '민주', text: '됐어.', expr: '슬픔' });
  });

  it('T4 — 이미 AI 가 배정한 줄도 target 에서만 빠지고 문맥에는 기존 값과 함께 남는다', () => {
    const sc = scene({
      lines: [dialogue('민주', '아까 그 말.', { emotionAuto: '기쁨' }), dialogue('민주', '지금은?')],
    });
    const p = projectWith([sc], { characters: [heroine()] });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.i)).toEqual([1]);
    expect(batch.scriptLinesByIndex.get(0)!.expr).toBe('기쁨');
  });

  it('T5 — 합동 대사는 target 이 아니지만 묶음 라벨 그대로 문맥에 남는다', () => {
    const sc = scene({
      lines: [
        dialogue('한지수 & 강민주', '같이 말함', { members: ['한지수', '강민주'] }),
        dialogue('민주', '너희 뭐야.'),
      ],
    });
    const p = projectWith([sc], {
      characters: [char('한지수', { expressions: { 기본: 'a1' } }), char('강민주', { expressions: { 기본: 'a2' } }), heroine()],
    });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.i)).toEqual([1]);
    expect(batch.scriptLinesByIndex.get(0)!.speaker).toBe('한지수 & 강민주');
    // members 배열은 문맥에 싣지 않는다(후보 키와 무관한 이름이 페이로드에 늘어날 뿐).
    expect(batch.scriptLinesByIndex.get(0)).not.toHaveProperty('members');
  });

  it('T6 — 그 줄 의상에 후보가 없어 빠진 줄, 미등록 화자의 줄도 문맥에는 남는다', () => {
    const sc = scene({
      lines: [
        dialogue('그림없음', '난 아직 스프라이트가 없어'),
        dialogue('행인A', '난 등록도 안 됐어'),
        dialogue('민주', '그래도 대화는 이어진다.'),
      ],
    });
    const p = projectWith([sc], {
      characters: [char('그림없음', { expressions: {} }), heroine()],
    });

    const [batch] = collectEmotionTargets(p);
    expect(batch.items.map((it) => it.i)).toEqual([2]);
    expect(ctxIdx(batch)).toEqual([0, 1, 2]);
  });

  it('T14 — 빈 텍스트 줄은 문맥에서만 빠진다(target 자격은 기존 그대로 유지)', () => {
    const sc = scene({
      lines: [dialogue('민주', ''), dialogue('민주', '   '), dialogue('민주', '진짜 대사')],
    });
    const p = projectWith([sc], { characters: [heroine()] });

    const [batch] = collectEmotionTargets(p);
    // 기존 collectEmotionTargets 에는 텍스트 검사가 없었다 — 여기에 끼우면 조용한 target 축소(회귀)다.
    expect(batch.items.map((it) => it.i)).toEqual([0, 1, 2]);
    expect(ctxIdx(batch)).toEqual([2]); // 빈 줄은 토큰만 먹으므로 문맥에서만 제외
  });
});

/** 요청 하나가 무엇을 배정하고(items) 무엇을 읽기만 하는지(context) 정하는 planEmotionChunks. */
describe('planEmotionChunks: 실제 장면 흐름 기반 bounded 문맥 window', () => {
  const idxOf = (lines: { i: number }[]) => lines.map((l) => l.i);
  const charsOf = (lines: { text: string }[]) => lines.reduce((s, l) => s + l.text.length, 0);

  /** 40 target 청크 경계를 실제로 넘기면서 경계 부근에 문맥 전용 줄 3종을 끼운 장면. */
  function crossChunkProject() {
    const lines: Line[] = [];
    for (let n = 0; n < 38; n += 1) lines.push(dialogue('민주', `앞대사${n}`)); // 0..37 target
    lines.push(dialogue('주인공', '내가 말한다')); // 38 문맥
    lines.push(narration('바람이 불었다')); // 39 문맥
    lines.push(dialogue('민주', '이미 정함', { emotion: '슬픔' })); // 40 문맥(표정 보유)
    for (let n = 0; n < 7; n += 1) lines.push(dialogue('민주', `뒷대사${n}`)); // 41..47 target
    const p = projectWith([scene({ lines })], {
      characters: [char('주인공', { isProtagonist: true }), heroine()],
    });
    return collectEmotionTargets(p)[0];
  }

  it('T7 — 두 번째 요청의 문맥이 "직전 target 3개"가 아니라 실제 장면 window 다', () => {
    const plans = planEmotionChunks(crossChunkProject());

    expect(plans).toHaveLength(2);
    expect(idxOf(plans[0].items)).toHaveLength(40); // 청크 경계는 기존 40줄 상한 그대로
    expect(idxOf(plans[1].items)).toEqual([43, 44, 45, 46, 47]);

    const ctx2 = plans[1].context;
    // ① 직전 청크에서 **평범한 target 이었던** 대사도 이제 읽기 전용 문맥으로 보인다
    expect(idxOf(ctx2)).toContain(37);
    expect(idxOf(ctx2)).toContain(42);
    // ② 주인공 ③ 지문 ④ 이미 표정이 있는 줄 — 전부 같은 시간축에
    expect(ctx2.find((c) => c.i === 38)!.speaker).toBe('주인공');
    expect(ctx2.find((c) => c.i === 39)!.speaker).toBeUndefined();
    expect(ctx2.find((c) => c.i === 40)!.expr).toBe('슬픔');
    // 시간순 + 이번 요청의 target 은 문맥에 중복되지 않는다
    expect(idxOf(ctx2)).toEqual([...idxOf(ctx2)].sort((a, b) => a - b));
    expect(idxOf(ctx2).some((i) => idxOf(plans[1].items).includes(i))).toBe(false);
    expect(Math.max(...idxOf(ctx2))).toBeLessThanOrEqual(Math.max(...idxOf(plans[1].items)));

    // 첫 요청도 자기 구간 안에 낀 문맥 전용 줄을 본다(예전엔 청크 안의 줄도 사라졌다)
    expect(idxOf(plans[0].context)).toEqual([38, 39, 40]);

    // target 은 하나도 누락되지 않는다
    expect(plans.flatMap((p) => idxOf(p.items))).toHaveLength(45);
  });

  it('T7b — 문맥 전용 줄이 하나도 없는 장면에서도 두 번째 요청의 문맥이 비지 않는다(옛 prevContext 회귀 방지)', () => {
    const lines = Array.from({ length: 45 }, (_, n) => dialogue('민주', `대사${n}`));
    const p = projectWith([scene({ lines })], { characters: [heroine()] });
    const plans = planEmotionChunks(collectEmotionTargets(p)[0]);

    expect(plans).toHaveLength(2);
    // 첫 요청: 앞선 textual 줄이 전부 자기 target 이라 문맥이 비는 게 정상
    expect(plans[0].context).toEqual([]);
    // 두 번째 요청: **비면 안 된다.** 직전 청크의 실제 대사들이 읽기 전용으로 들어온다.
    expect(plans[1].context.length).toBeGreaterThan(0);
    expect(idxOf(plans[1].context)).toEqual(Array.from({ length: 40 }, (_, n) => n));
    expect(idxOf(plans[1].items)).toEqual([40, 41, 42, 43, 44]);
    expect(idxOf(plans[1].context).some((i) => idxOf(plans[1].items).includes(i))).toBe(false);
  });

  it('T11 — 긴 장면에서 문맥이 상한 안에 머물고, 잘리는 쪽은 언제나 오래된 앞부분이다', () => {
    const text = '가'.repeat(30);
    const lines: Line[] = Array.from({ length: 200 }, (_, n) =>
      n % 10 === 9 ? narration(text) : dialogue('민주', text),
    );
    const p = projectWith([scene({ lines })], { characters: [heroine()] });
    const plans = planEmotionChunks(collectEmotionTargets(p)[0]);

    const textualIdx = lines.map((_, i) => i).filter((i) => lines[i].kind === 'dialogue' || lines[i].kind === 'narration');
    for (const plan of plans) {
      const lastI = plan.items[plan.items.length - 1].i;
      const targets = new Set(idxOf(plan.items));
      // 기대값 = "lastTarget 까지의 모든 대본 줄 − 이번 요청의 target" 의 **뒤에서** 60줄
      // (줄당 30자라 60줄 = 1800자로 글자 상한 2000 안 — 줄 상한이 먼저 물린다).
      const pool = textualIdx.filter((i) => i <= lastI && !targets.has(i));
      expect(idxOf(plan.context)).toEqual(pool.slice(Math.max(0, pool.length - 60)));
      expect(plan.context.length).toBeLessThanOrEqual(60);
      expect(charsOf(plan.context)).toBeLessThanOrEqual(2000);
    }
    expect(plans.some((pl) => pl.context.length === 60)).toBe(true); // 상한이 실제로 물렸다
    // 어느 요청에서도 미래 줄을 미리 읽지 않는다 + target 누락 0
    for (const plan of plans) {
      expect(Math.max(...idxOf(plan.context))).toBeLessThan(plan.items[plan.items.length - 1].i);
    }
    expect(plans.flatMap((pl) => idxOf(pl.items))).toHaveLength(180);
  });

  it('줄 수는 적어도 글자 수가 크면 글자 상한이 문맥을 자른다', () => {
    const long = '나'.repeat(600);
    const lines: Line[] = [
      narration(long), // 0 — 잘려나갈 오래된 문맥
      narration(long), // 1
      narration(long), // 2
      narration(long), // 3
      dialogue('민주', '마지막 한 줄'), // 4 target
    ];
    const p = projectWith([scene({ lines })], { characters: [heroine()] });
    const [plan] = planEmotionChunks(collectEmotionTargets(p)[0]);

    // 4줄 × 600자 = 2400자 > 2000 → 가장 오래된 한 줄만 버려 1800자로 맞춘다.
    expect(idxOf(plan.context)).toEqual([1, 2, 3]);
    expect(charsOf(plan.context)).toBeLessThanOrEqual(2000);
  });
});

describe('parseEmotionResponse(F2/F3): 문맥 줄 인덱스는 쓰기 대상이 아니다', () => {
  it('T8 — 모델이 context 의 i 로 결과를 돌려줘도 저장되지 않고, 같은 응답의 target 결과는 그대로 채택된다', () => {
    const sc = scene({
      lines: [
        dialogue('주인공', '주인공 대사'), // 0 — 문맥 전용
        narration('지문'), // 1 — 문맥 전용
        dialogue('민주', '진짜 target'), // 2
      ],
    });
    const p = projectWith([sc], { characters: [char('주인공', { isProtagonist: true }), heroine()] });
    const batch = collectEmotionTargets(p)[0];
    const [plan] = planEmotionChunks(batch);

    // 문맥 줄 인덱스에 **유효한 후보 이름**을 실어 보낸다 — 후보 검증만으로는 못 거른다.
    const raw = '{"results":[{"i":0,"expr":"기쁨"},{"i":1,"expr":"슬픔"},{"i":2,"expr":"슬픔"}]}';
    expect(parseEmotionResponse(raw, plan.items, batch.candidatesByKey)).toEqual({ 2: '슬픔' });
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

/** collect → plan → 요청 페이로드까지 실제 경로를 한 번에 태워 "선 위의 모양"을 고정한다. */
describe('문맥 파이프라인 end-to-end: 대본 → 계획 → 요청 페이로드', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const send = async (p: ReturnType<typeof projectWith>) => {
    const batch = collectEmotionTargets(p)[0];
    const [plan] = planEmotionChunks(batch);
    const captured = captureRequest();
    await selectEmotionsBatch(
      plan.items,
      {
        sceneTitle: '장면1',
        direction: [],
        cg: [],
        synopsis: '',
        candidatesByKey: batch.candidatesByKey,
        expressionNotes: p.expressionNotes,
        contextLines: plan.context,
      },
      'sk-test',
    );
    return captured;
  };

  it('지문의 speaker 는 선 위에서 키째로 사라지고, 표정 있는 줄만 expr 을 달고 나간다', async () => {
    const sc = scene({
      lines: [
        dialogue('주인공', '주인공 대사'),
        narration('지문 한 줄'),
        dialogue('민주', '이미 정함', { emotion: '슬픔' }),
        dialogue('민주', '진짜 target'),
      ],
    });
    const captured = await send(
      projectWith([sc], { characters: [char('주인공', { isProtagonist: true }), heroine()] }),
    );

    expect(captured.user!.items.map((it) => it.i)).toEqual([3]);
    expect(captured.user!.context).toEqual([
      { i: 0, speaker: '주인공', text: '주인공 대사' },
      { i: 1, text: '지문 한 줄' }, // speaker 키 자체가 없다
      { i: 2, speaker: '민주', text: '이미 정함', expr: '슬픔' },
    ]);
    expect(Object.keys(captured.user!.context![1])).not.toContain('speaker');
    expect(captured.system).toContain('NEVER output a result for a "context" index');
  });

  it('후보가 없어 target 에서 빠진 화자의 후보 그룹은 문맥에 남아도 페이로드에 실리지 않는다(F1 후보 확대 금지)', async () => {
    const sc = scene({
      lines: [dialogue('그림없음', '난 스프라이트가 없어'), dialogue('민주', '그래도 이어진다')],
    });
    const captured = await send(
      projectWith([sc], { characters: [char('그림없음', { expressions: {} }), heroine()] }),
    );

    expect(captured.user!.candidates.map((c) => c.speaker)).toEqual(['민주']);
    expect(captured.user!.context!.map((c) => c.speaker)).toEqual(['그림없음']);
  });

  it('T13 — 문맥이 붙을 게 없는 baseline(단일 청크·의상 전환 없음·설명 없음)은 예전 요청과 완전히 같다', async () => {
    // 조건부 규칙 3개가 전부 꺼진 구성이어야 이 동치 비교가 의미를 가진다:
    // 선행 문맥 줄 없음(모든 줄이 자기 target) · 한 화자 한 벌 · expressionNotes 없음.
    const sc = scene({
      lines: [dialogue('민주', '첫 줄'), dialogue('민주', '둘째 줄'), dialogue('민주', '셋째 줄')],
    });
    const captured = await send(projectWith([sc], { characters: [heroine()] }));

    expect(captured.user!.context).toBeUndefined();
    expect(captured.user!.items.map((it) => it.i)).toEqual([0, 1, 2]);
    expect(JSON.stringify(captured.user)).not.toContain('context');
    expect(captured.system).toBe(BASE_SYSTEM_PROMPT);
  });
});
