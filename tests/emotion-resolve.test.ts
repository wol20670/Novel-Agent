import { describe, it, expect } from 'vitest';
import { resolveEmotion, resolveEmotionDetailed, availableExpressions } from '../src/generators/emotion/resolve';
import type { Character, Line } from '../src/types';
import { scene, projectWith, dialogue } from './fixtures';

function char(name: string, patch: Partial<Character> = {}): Character {
  return { name, color: '#ffffff', expressions: {}, ...patch };
}

describe('resolveEmotionDetailed: 4단계 우선순위(작가 > AI > 휴리스틱 > 기본)', () => {
  const sc = scene({ lines: [] });

  it('emotion(작가 수동)이 있으면 그게 최우선(source=author)', () => {
    const line = dialogue('민주', '정말 화나 죽겠어', { emotion: '기쁨', emotionAuto: '슬픔' });
    const p = projectWith([sc]);
    expect(resolveEmotionDetailed(line, sc, p)).toEqual({ expr: '기쁨', source: 'author' });
  });

  it('emotion 이 없으면 emotionAuto(AI 배정)를 쓴다(source=ai)', () => {
    const line = dialogue('민주', '정말 화나 죽겠어', { emotionAuto: '슬픔' });
    const p = projectWith([sc]);
    expect(resolveEmotionDetailed(line, sc, p)).toEqual({ expr: '슬픔', source: 'ai' });
  });

  it('emotion·emotionAuto 둘 다 없으면 오프라인 휴리스틱으로 추론(source=heuristic)', () => {
    const line = dialogue('민주', '정말 화나 죽겠어'); // '화남' 신호
    const p = projectWith([sc]);
    expect(resolveEmotionDetailed(line, sc, p)).toEqual({ expr: '화남', source: 'heuristic' });
  });

  it('아무 신호도 없으면 휴리스틱이 기본을 고른다(source=heuristic — inferEmotion 은 무신호여도 항상 "기본"을 반환하고, "기본"은 항상 선언 목록에 있어 검증을 통과한다)', () => {
    const line = dialogue('민주', '오늘은 그냥 평범한 하루였다');
    const p = projectWith([sc]);
    expect(resolveEmotionDetailed(line, sc, p)).toEqual({ expr: '기본', source: 'heuristic' });
  });

  it('narration/item/cg 라인은 항상 기본(source=fallback)', () => {
    const p = projectWith([sc]);
    expect(resolveEmotionDetailed({ kind: 'narration', text: '비가 내렸다' }, sc, p)).toEqual({
      expr: '기본',
      source: 'fallback',
    });
  });
});

describe('resolveEmotionDetailed: 유령 표정 차단 — 선언된 목록(effectiveExpressions)에 없으면 그 단계를 건너뛴다', () => {
  const sc = scene({ lines: [] });
  // 커스텀 표정 세트: 기본 6종을 전혀 안 쓰고 '당황'만 선언.
  const customProject = projectWith([sc], { expressions: ['기본', '당황'] });

  // ⚠️ 작가가 쓴 emotion 은 검증 대상이 아니다 — 파서가 `이름(당황):` 태그를 "작가 신뢰"로 자유
  // 문자열 그대로 채택하므로(parser/sceneBuilder.ts), 여기서 선언 목록으로 걸러버리면 대본에 적어둔
  // 표정이 조용히 무시되고 "표정 편집기에 미리 등록해야만 태그가 먹는" 숨은 규칙이 생긴다.
  it('선언 목록 밖이어도 작가 태그(emotion)는 그대로 채택한다 — 파서의 작가 신뢰 계약 유지', () => {
    const line = dialogue('민주', '아무 신호 없는 문장', { emotion: '슬픔', emotionAuto: '당황' });
    expect(resolveEmotionDetailed(line, sc, customProject)).toEqual({ expr: '슬픔', source: 'author' });
  });

  it('작가 태그가 없으면 emotionAuto 를 검증한다 — 목록 밖이면 건너뛰고 휴리스틱, 그것도 밖이면 기본', () => {
    // '화나' → 휴리스틱은 '화남'을 추론하지만 customProject 엔 '화남'이 없다 → 기본.
    const line = dialogue('민주', '정말 화나 죽겠어', { emotionAuto: '기쁨' });
    expect(resolveEmotionDetailed(line, sc, customProject)).toEqual({ expr: '기본', source: 'fallback' });
  });

  it('작가 태그가 없고 emotionAuto 가 선언 목록 안이면 그걸 쓴다', () => {
    const line = dialogue('민주', '아무 신호 없는 문장', { emotionAuto: '당황' });
    expect(resolveEmotionDetailed(line, sc, customProject)).toEqual({ expr: '당황', source: 'ai' });
  });

  it('emotion 이 선언 목록 안이면(커스텀 이름이어도) 그대로 통과한다', () => {
    const line = dialogue('민주', '아무 신호 없는 문장', { emotion: '당황' });
    expect(resolveEmotionDetailed(line, sc, customProject)).toEqual({ expr: '당황', source: 'author' });
  });
});

describe('resolveEmotion: 선언은 됐지만 아직 업로드 안 한 표정도 통과한다(Canvas 플레이스홀더 워크플로 유지)', () => {
  it('스프라이트를 하나도 안 올린 캐릭터의 대사에도 emotion 값이 그대로 나온다', () => {
    const sc = scene({ lines: [] });
    // expressions 선언만 있고, 캐릭터에 업로드된 스프라이트는 전혀 없음(characters 자체를 안 넣어도
    // resolveEmotion 은 project.expressions 만 보고 판정한다 — 업로드 여부는 별개 관심사).
    const p = projectWith([sc], { expressions: ['기본', '당황'], characters: [char('민주')] });
    const line = dialogue('민주', '아무 신호 없는 문장', { emotion: '당황' });
    expect(resolveEmotion(line, sc, p)).toBe('당황');
  });
});

describe('availableExpressions: 실제로 스프라이트가 올라간 표정만(선언 여부와 무관) — outfit 을 존중한다', () => {
  it('outfit 미지정이면 기본 의상(c.expressions)만 본다 — 추가 의상 전용 표정은 빠진다', () => {
    const c = char('민주', {
      expressions: { 기본: 'a1', 기쁨: 'a2' },
      outfits: [{ name: '교복', expressions: { 화남: 'a3' } }],
    });
    expect(availableExpressions(c)).toEqual(new Set(['기본', '기쁨']));
  });

  it('outfit 을 주면 그 의상 전용 표정도 포함되고, 그 의상에 없는 표정은 기본 의상으로 폴백한다', () => {
    const c = char('민주', {
      expressions: { 기본: 'a1', 기쁨: 'a2' },
      outfits: [{ name: '교복', expressions: { 화남: 'a3' } }],
    });
    expect(availableExpressions(c, '교복')).toEqual(new Set(['기본', '기쁨', '화남']));
  });

  it('스프라이트가 전혀 없는 표정 키(빈 문자열/undefined)는 후보에서 제외된다', () => {
    const c = char('민주', { expressions: { 기본: 'a1', 슬픔: undefined } });
    expect(availableExpressions(c)).toEqual(new Set(['기본']));
  });
});
