// AI 배정 표정 초기화(Phase 8 · C4) — R1~R7.
//
// 이 액션이 존재하는 이유: 표정 AI 는 `emotion`/`emotionAuto` 가 있는 줄을 **영구 스킵**한다
// (collectEmotionTargets 의 증분 gate). 그래서 "표정을 먼저 배정하고 나중에 의상을 바꾼" 순서에서는
// 재실행해도 그 줄이 다시 계산되지 않는다 — 되돌릴 유일한 경로가 이 액션이다.
//
// ⚠️ **automatic invalidation 이 아니다.** 의상이 바뀌어도 표정은 자동으로 안 지운다(수동 의상 편집도
// 똑같은 stale 을 만들기 때문에 AI 경로만 특별 취급하면 비대칭이 된다). 사람이 누를 때만 돈다.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { collectEmotionTargets } from '../src/generators/emotion/aiSelect';
import { emptyProject, type Character, type Line, type Project } from '../src/types';
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

function heroine(): Character {
  return {
    name: '민주',
    color: '#f88',
    expressions: { 기본: 'a-base', 기쁨: 'a-joy' },
    outfits: [{ name: '사복', expressions: { 기본: 'b-base' } }],
  };
}

/** 2개 장면 · AI 배정 3건 · 사람이 정한 표정 1건 · 번역/상태/줄 의상까지 섞인 프로젝트. */
function baseProject(): Project {
  const s1 = scene({
    id: 's1',
    lines: [
      dialogue('민주', 'a', { emotionAuto: '기쁨' }),
      dialogue('민주', 'b', { emotion: '화남', emotionAuto: '기쁨' }), // 사람 값 + AI 값이 공존
      { kind: 'narration', text: '지문', outfits: { 민주: '사복' } },
    ],
  });
  const s2 = scene({
    id: 's2',
    title: '장면2',
    lines: [
      dialogue('민주', 'c', { emotionAuto: '기본', i18n: { en: 'C' } }),
      dialogue('민주', 'd'), // 아무 값도 없는 줄(초기화의 영향을 받지 않아야 한다)
    ],
  });
  return projectWith([s1, s2], { characters: [heroine()] });
}

const lineAt = (sceneIdx: number, i: number) =>
  useStore.getState().project.scenes[sceneIdx].lines[i] as Extract<Line, { kind: 'dialogue' }>;

let confirmCalls = 0;
let confirmAnswer = true;

beforeEach(() => {
  confirmCalls = 0;
  confirmAnswer = true;
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', {
    confirm: () => {
      confirmCalls += 1;
      return confirmAnswer;
    },
  });
  useStore.setState({
    project: baseProject(),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    busy: {},
    toast: null,
  });
});

describe('R1·R2 — emotionAuto 만 지우고 사람이 정한 표정은 유지한다', () => {
  it('AI 값만 있던 줄은 비고, 사람 값이 있던 줄은 emotion 이 남는다', () => {
    useStore.getState().clearEmotionAuto();

    expect(lineAt(0, 0).emotionAuto).toBeUndefined();
    expect(lineAt(0, 1).emotionAuto).toBeUndefined();
    expect(lineAt(0, 1).emotion).toBe('화남'); // ⚠️ 사람이 고른 값은 절대 건드리지 않는다
    expect(lineAt(1, 0).emotionAuto).toBeUndefined();
  });
});

describe('R3 — 한 번의 액션으로 모든 장면을 처리하고 다른 canonical 은 건드리지 않는다', () => {
  it('여러 장면의 emotionAuto 가 전부 사라진다', () => {
    useStore.getState().clearEmotionAuto();
    const anyAuto = useStore
      .getState()
      .project.scenes.some((sc) => sc.lines.some((l) => l.kind === 'dialogue' && l.emotionAuto));
    expect(anyAuto).toBe(false);
  });

  it('의상·번역·텍스트·상태는 그대로다', () => {
    const before = useStore.getState().project;
    useStore.getState().clearEmotionAuto();
    const after = useStore.getState().project;

    expect((after.scenes[0].lines[2] as Extract<Line, { kind: 'narration' }>).outfits).toEqual({
      민주: '사복',
    });
    expect(lineAt(1, 0).i18n?.en).toBe('C');
    expect(lineAt(1, 0).text).toBe('c');
    expect(after.scenes[0].status).toBe(before.scenes[0].status);
    expect(after.characters).toEqual(before.characters);
  });
});

describe('R4 — 초기화하면 그 줄들이 다시 표정 AI 대상이 된다', () => {
  it('collectEmotionTargets 가 초기화 전엔 안 잡던 줄을 잡는다', () => {
    const before = collectEmotionTargets(useStore.getState().project);
    const beforeCount = before.reduce((n, b) => n + b.items.length, 0);

    useStore.getState().clearEmotionAuto();

    const after = collectEmotionTargets(useStore.getState().project);
    const afterCount = after.reduce((n, b) => n + b.items.length, 0);

    // 초기화 전 대상 = 아무 값도 없던 줄 1개('d'), 초기화 후 = 거기에 AI 값이 지워진 줄 3개 중
    // 사람 값이 있는 줄을 뺀 2개가 더해진다(emotion 이 남은 줄은 여전히 대상이 아니다).
    expect(beforeCount).toBe(1);
    expect(afterCount).toBe(3);
    const stillSkipped = after
      .flatMap((b) => b.items)
      .some((it) => it.text === 'b'); // emotion='화남' 인 줄
    expect(stillSkipped).toBe(false);
  });
});

describe('R5 — 의상 제안·revision 은 전혀 건드리지 않는다', () => {
  it('표정은 Outfit AI 의 입력이 아니므로 검수 목록이 살아남는다', () => {
    const suggestion = {
      sceneId: 's1',
      lineIndex: 0,
      character: '민주',
      outfit: '사복',
      lineKey: 'dialogue|민주|a',
    };
    useStore.setState({ outfitSuggestions: { s1: [suggestion] }, outfitSuggestionRevision: 7 });

    useStore.getState().clearEmotionAuto();

    expect(useStore.getState().outfitSuggestions).toEqual({ s1: [suggestion] });
    expect(useStore.getState().outfitSuggestionRevision).toBe(7);
  });
});

describe('R6 — 지울 게 없으면 확인창도 저장도 없다', () => {
  it('emotionAuto 가 0건이면 confirm 을 띄우지 않고 project 참조도 그대로다', () => {
    useStore.getState().clearEmotionAuto(); // 1회차로 전부 비운다
    const cleared = useStore.getState().project;
    confirmCalls = 0;

    useStore.getState().clearEmotionAuto(); // 2회차 — 이제 0건

    expect(confirmCalls).toBe(0); // ⚠️ 빈 상태에서 파괴적 confirm 을 띄우지 않는다
    expect(useStore.getState().project).toBe(cleared); // set 자체가 없었다(참조 동일)
    expect(useStore.getState().toast).toContain('초기화할 AI 배정 표정이 없습니다');
  });
});

describe('R7 — 확인창에서 취소하면 아무것도 바뀌지 않는다', () => {
  it('canonical·저장 모두 무변경', () => {
    const before = useStore.getState().project;
    confirmAnswer = false;

    useStore.getState().clearEmotionAuto();

    expect(confirmCalls).toBe(1);
    expect(useStore.getState().project).toBe(before); // 참조까지 동일 = setScenes 미호출
    expect(lineAt(0, 0).emotionAuto).toBe('기쁨');
  });
});
