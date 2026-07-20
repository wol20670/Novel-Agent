// 공용 재시도 헬퍼 — 일시적 오류(레이트리밋/타임아웃/5xx)를 지수 백오프로 재시도한다.
// 현재는 번역 경로(src/generators/translate)에서만 사용. store.ts 의 보이스 일괄생성
// (runCharacterVoiceBatch)은 이미 실전 검증된 자체 인라인 재시도 로직을 갖고 있어
// 이번 리팩터 범위에서 제외 — 손대지 않는다(회귀 위험).

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 일시적 오류(레이트리밋/타임아웃/5xx)면 2s→4s→8s 지수 백오프로 최대 maxRetries회 재시도. */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  isTransient: (e: unknown) => boolean,
  opts: { maxRetries?: number; baseMs?: number } = {},
): Promise<T> {
  const { maxRetries = 3, baseMs = 2000 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === maxRetries) throw e;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
