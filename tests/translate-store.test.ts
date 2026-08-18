// autoTranslateAll 의 실행 전 가드 순서 — 0건 확인이 OpenAI 키 확인보다 **앞**이어야 한다.
// 예전엔 키 검사가 먼저라, 번역이 이미 다 찬 프로젝트에서 키만 없는 사용자에게 "OpenAI 키가
// 필요합니다"가 떴다(실제로는 할 일이 없어 키도 필요 없는 상태). 버튼 이름을 "누락 번역 채우기"로
// 바꾸면서 0건 안내가 정확해야 해서 순서를 교정했고, 이 파일이 그 회귀 가드다.
//
// tests/outfit-store.test.ts 와 같은 관용구: 실제 store 를 그대로 import 해 localStorage/fetch 만
// 최소 stub 한다(범용 zustand 하네스를 만들지 않는다).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { emptyProject } from '../src/types';
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

/** 번역이 전부 채워진 대본(누락 0). */
const filled = () =>
  projectWith([scene({ lines: [dialogue('민주', '안녕', { i18n: { en: 'Hi', ja: 'やあ' } })] })], {
    translateMode: 'fast',
  });

/** ja 가 비어 있는 대본(누락 1줄). */
const missing = () =>
  projectWith([scene({ lines: [dialogue('민주', '안녕', { i18n: { en: 'Hi' } })] })], {
    translateMode: 'fast',
  });

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', {});
  useStore.setState({
    project: emptyProject(),
    openaiKey: '',
    busy: {},
    translateProgress: null,
    toast: null,
  });
});

describe('autoTranslateAll — 실행 전 가드 순서', () => {
  it('누락 0건이면 키가 없어도 "빈 칸 없음"으로 안내하고 API 를 부르지 않는다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useStore.setState({ project: filled(), openaiKey: '' });

    await useStore.getState().autoTranslateAll();

    expect(useStore.getState().toast).toContain('빈 칸이 없습니다');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().busy['batch:translate']).toBeFalsy();
    expect(useStore.getState().translateProgress).toBeNull();
  });

  it('실제 누락이 있는데 키가 없으면 기존대로 키 오류를 낸다(API 호출은 여전히 0)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useStore.setState({ project: missing(), openaiKey: '' });

    await useStore.getState().autoTranslateAll();

    expect(useStore.getState().toast).toContain('OpenAI 키가 필요합니다');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().busy['batch:translate']).toBeFalsy();
  });
});
