import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from '../src/generators/shared/retry';

const isTransient = (e: unknown) => (e as Error)?.message === 'transient';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('일시적 오류가 두 번 나도 세 번째 시도에서 성공하면 그 값을 반환한다', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    });

    const promise = retryWithBackoff(fn, isTransient);
    // 1차 실패 → 2s 대기 → 2차 실패 → 4s 대기 → 3차 성공
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('일시적이지 않은 오류는 재시도 없이 즉시 던진다', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fatal');
    });

    await expect(retryWithBackoff(fn, isTransient)).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('계속 일시적 오류면 maxRetries+1 번 시도한 뒤 던진다', async () => {
    const fn = vi.fn(async () => {
      throw new Error('transient');
    });

    const promise = retryWithBackoff(fn, isTransient, { maxRetries: 3, baseMs: 2000 });
    // rejects 를 미리 붙여 핸들러를 선점(그래야 아래 타이머 진행 중 reject 돼도 unhandled rejection 경고가 안 뜬다)
    const assertion = expect(promise).rejects.toThrow('transient');
    // 재시도 대기: 2s, 4s, 8s
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(4); // 최초 1회 + 재시도 3회
  });
});
