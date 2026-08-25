// post-v1 대본 한 줄 삭제 UX Phase 1 — deleteLine 의 store 계약 회귀 가드.
//
// tests/outfit-store.test.ts · tests/translate-qa-store.test.ts 와 같은 관용구: 실제 store 를 그대로
// import 해 localStorage/window 만 최소 stub 한다(범용 zustand 하네스나 UI 테스트 인프라를 만들지 않는다).
//
// 여기서 고정하는 계약 6가지:
//   ① Scene.lines 에서 그 객체 하나만 빠지고 뒤 줄은 배열 semantics 그대로 당겨진다
//   ② Line-local 값은 객체와 함께 소멸하고, 당겨진 이웃 줄의 값은 그대로다(필드별 cleanup 없음)
//   ③ 유효 삭제는 **기존** invalidateOutfitSuggestions 정책을 그대로 탄다(새 무효화 경로 없음)
//   ④ translationQa 캐시를 **직접 건드리지 않고**, 밀린 결과는 기존 activeQaIssues 판정이 거른다
//   ⑤ rawInput 은 문자 단위로 불변이다(= 같은 원본을 재분석하면 부활 가능 · 기존 계약 승계)
//   ⑥ 무효 요청(범위 밖·item·cg·bgm·없는 장면)은 **의상 제안까지 포함해** 완전 no-op 이다
//      — 즉 guard 가 invalidateOutfitSuggestions 보다 **먼저** 실행된다

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { activeQaIssues, type TranslationQaResult } from '../src/generators/translate/qa';
import { outfitLineKey, type OutfitSuggestion } from '../src/generators/outfit';
import { emptyProject, type Line, type Scene } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const S1 = 's1';
/** 원본 대본 — deleteLine 이 이걸 건드리지 않는다는 것이 Case 6 의 계약이다. */
const RAW = '#S 장면1\n민주: A\n민주: B\n민주: C\n';

/** 가운데(B)·마지막(C) 줄에 Line-local 값을 골고루 얹은 3줄짜리 장면. */
function baseLines(): Line[] {
  return [
    dialogue('민주', 'A'),
    dialogue('민주', 'B', {
      i18n: { en: 'B-en' },
      emotionAuto: '기쁨',
      voiceAssetIds: { ko: 'voice-b' },
      outfits: { 민주: '사복' },
      hideSprites: true,
    }),
    dialogue('민주', 'C', {
      i18n: { en: 'C-en' },
      emotionAuto: '슬픔',
      voiceAssetIds: { ko: 'voice-c' },
      outfits: { 민주: '교복' },
      hideSprites: false,
    }),
  ];
}

function seed(lines: Line[] = baseLines()): void {
  useStore.setState({
    project: projectWith([scene({ id: S1, lines })], { rawInput: RAW }),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    translationQa: {},
  });
}

function sug(sc: Scene, lineIndex: number): OutfitSuggestion {
  return {
    sceneId: sc.id,
    lineIndex,
    character: '민주',
    outfit: '사복',
    lineKey: outfitLineKey(sc.lines[lineIndex]),
  };
}

const scenesRef = () => useStore.getState().project.scenes;
const lines = () => scenesRef()[0].lines;
const texts = () => lines().map((l) => (l.kind === 'dialogue' || l.kind === 'narration' ? l.text : l.kind));
const dlg = (i: number) => lines()[i] as Extract<Line, { kind: 'dialogue' }>;
const suggestions = () => useStore.getState().outfitSuggestions;
const revision = () => useStore.getState().outfitSuggestionRevision;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { confirm: () => true });
  useStore.setState({
    project: emptyProject(),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    translationQa: {},
    busy: {},
  });
});

describe('Case 1 — 가운데 대사 삭제', () => {
  it('그 줄만 빠지고 뒤 줄이 index -1 로 당겨진다', () => {
    seed();
    useStore.getState().deleteLine(S1, 1);

    expect(lines()).toHaveLength(2);
    expect(texts()).toEqual(['A', 'C']);
  });

  it('지문(narration)도 같은 규칙으로 삭제된다', () => {
    seed([dialogue('민주', 'A'), { kind: 'narration', text: '바람이 분다' }, dialogue('민주', 'C')]);
    useStore.getState().deleteLine(S1, 1);

    expect(texts()).toEqual(['A', 'C']);
  });
});

describe('Case 2 — Line-local 데이터 동반 제거 / 이웃 보존', () => {
  it('삭제 줄의 값은 함께 사라지고, 당겨진 이웃 줄의 값은 하나도 바뀌지 않는다', () => {
    seed();
    useStore.getState().deleteLine(S1, 1);

    // 삭제된 객체(B)는 배열 어디에도 없다 — 필드만 비우는 게 아니라 객체째 빠진다.
    expect(lines().some((l) => l.kind === 'dialogue' && l.text === 'B')).toBe(false);

    // 뒤에서 당겨진 C 는 모든 Line-local 값을 그대로 갖는다(index 만 2 → 1 로 이동).
    const moved = dlg(1);
    expect(moved.text).toBe('C');
    expect(moved.i18n).toEqual({ en: 'C-en' });
    expect(moved.emotionAuto).toBe('슬픔');
    expect(moved.voiceAssetIds).toEqual({ ko: 'voice-c' });
    expect(moved.outfits).toEqual({ 민주: '교복' });
    expect(moved.hideSprites).toBe(false);
  });
});

describe('Case 3 — Outfit 제안 무효화(기존 helper 재사용)', () => {
  it('유효 삭제는 제안을 전체 clear 하고 revision 을 올린다', () => {
    seed();
    const sc = scenesRef()[0];
    useStore.setState({
      outfitSuggestions: { [S1]: [sug(sc, 0), sug(sc, 2)] },
      outfitSuggestionRevision: 7,
    });

    useStore.getState().deleteLine(S1, 1);

    expect(suggestions()).toEqual({});
    expect(revision()).toBe(8);
  });
});

describe('Case 4 — Translation QA 는 무조치 + 기존 판정이 stale 을 거른다', () => {
  /** 그 줄·그 로케일의 현재 내용에 정확히 들어맞는 review 결과 하나. */
  function qaFor(lineIndex: number, source: string, target: string): TranslationQaResult {
    return {
      anchor: {
        sceneId: S1,
        lineIndex,
        sourceLocale: 'ko',
        targetLocale: 'en',
        source,
        target,
        speaker: '민주',
        narration: false,
      },
      verdict: 'review',
      origin: 'ai',
      category: 'meaning',
    };
  }

  it('캐시 객체를 직접 지우거나 바꾸지 않는다(clearTranslationQa 를 부르지 않는다)', () => {
    seed();
    useStore.setState({ translationQa: { [S1]: [qaFor(2, 'C', 'C-en')] } });
    const before = useStore.getState().translationQa;
    expect(activeQaIssues(before[S1], scenesRef()[0], 'ko')).toHaveLength(1); // 삭제 전엔 유효

    useStore.getState().deleteLine(S1, 1);

    // 참조까지 그대로 — QA 캐시는 이 액션의 쓰기 대상이 아니다.
    expect(useStore.getState().translationQa).toBe(before);
  });

  it('밀린 결과는 표시 판정(activeQaIssues)에서 저절로 빠진다 — 다른 줄로 옮겨 붙지 않는다', () => {
    seed();
    // B(index 1)에 대한 경고를 넣어두고 그 **앞** 줄을 지운다 → index 1 은 이제 C 다.
    useStore.setState({ translationQa: { [S1]: [qaFor(1, 'B', 'B-en')] } });

    useStore.getState().deleteLine(S1, 0);

    expect(texts()).toEqual(['B', 'C']);
    const after = useStore.getState().translationQa[S1];
    // index 1 에는 이제 C 가 있어 source/target 이 어긋난다 → 유효 결과 0(엉뚱한 줄에 경고가 남지 않는다).
    expect(activeQaIssues(after, scenesRef()[0], 'ko')).toHaveLength(0);
  });
});

describe('Case 5 — 경계(첫 줄 / 마지막 줄)', () => {
  it('첫 줄 삭제', () => {
    seed();
    useStore.getState().deleteLine(S1, 0);
    expect(texts()).toEqual(['B', 'C']);
  });

  it('마지막 줄 삭제', () => {
    seed();
    useStore.getState().deleteLine(S1, 2);
    expect(texts()).toEqual(['A', 'B']);
  });

  it('마지막 하나까지 지우면 빈 장면이 된다(기존에도 도달 가능한 상태)', () => {
    seed([dialogue('민주', 'A')]);
    useStore.getState().deleteLine(S1, 0);
    expect(lines()).toEqual([]);
  });
});

describe('Case 6 — rawInput 불변', () => {
  it('삭제는 Scene.lines 만 바꾸고 원본 대본은 문자 단위로 그대로 둔다', () => {
    seed();
    useStore.getState().deleteLine(S1, 1);

    expect(useStore.getState().project.rawInput).toBe(RAW);
  });
});

describe('Case 7 — 무효 요청은 의상 제안까지 완전 no-op(guard 가 invalidate 보다 먼저)', () => {
  const markerLines = (): Line[] => [
    dialogue('민주', 'A'),
    { kind: 'item', name: '열쇠' },
    { kind: 'cg', desc: '첫 키스' },
    { kind: 'bgm', name: '테마' },
  ];

  const cases: [string, number][] = [
    ['범위 밖(음수)', -1],
    ['범위 밖(초과)', 99],
    ['item 마커', 1],
    ['cg 마커', 2],
    ['bgm 마커', 3],
  ];

  it.each(cases)('%s 삭제 요청은 scenes·제안·revision 을 전부 그대로 둔다', (_label, idx) => {
    seed(markerLines());
    const sc = scenesRef()[0];
    useStore.setState({ outfitSuggestions: { [S1]: [sug(sc, 0)] }, outfitSuggestionRevision: 5 });
    const before = scenesRef();

    useStore.getState().deleteLine(S1, idx);

    expect(scenesRef()).toBe(before); // setScenes 자체가 안 불린다(배열 identity 보존)
    expect(suggestions()[S1]).toHaveLength(1); // ⚠️ 무효 요청이 검수 목록을 날리면 안 된다
    expect(revision()).toBe(5);
  });

  it('없는 장면 id 도 같은 기준으로 no-op', () => {
    seed();
    const sc = scenesRef()[0];
    useStore.setState({ outfitSuggestions: { [S1]: [sug(sc, 0)] }, outfitSuggestionRevision: 5 });
    const before = scenesRef();

    useStore.getState().deleteLine('없는장면', 0);

    expect(scenesRef()).toBe(before);
    expect(suggestions()[S1]).toHaveLength(1);
    expect(revision()).toBe(5);
  });
});
