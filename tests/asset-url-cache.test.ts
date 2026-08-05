// useAssetUrl 의 공유 objectURL 캐시(ref-count) 단위 테스트. React 훅 자체(useEffect 타이밍)는
// 여기서 검증하지 않고, 훅이 실제로 호출하는 순수 함수(acquireAssetUrl/releaseAssetUrl/
// invalidateAssetUrl/invalidateAllAssetUrls)만 직접 구동한다 — 훅의 effect cleanup→재실행이
// release→acquire 순서로 이 함수들을 부르므로 그 시나리오를 그대로 흉내낸다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireAssetUrl,
  releaseAssetUrl,
  invalidateAssetUrl,
  invalidateAllAssetUrls,
} from '../src/components/useAssetUrl';

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let createSpy: ReturnType<typeof vi.spyOn>;
let revokeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  let n = 0;
  createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:mock-${++n}`);
  revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  createSpy.mockRestore();
  revokeSpy.mockRestore();
});

const blobA = new Blob(['a']);
const blobB = new Blob(['b']);

describe('acquireAssetUrl / releaseAssetUrl', () => {
  it('동시에 여러 번 acquire 해도 loader 는 1회만 호출되고 같은 URL을 공유한다(in-flight dedupe)', async () => {
    const id = 'concurrent-1';
    const loader = vi.fn(async () => blobA);
    const [u1, u2, u3] = await Promise.all([
      acquireAssetUrl(id, loader),
      acquireAssetUrl(id, loader),
      acquireAssetUrl(id, loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(u1).toBe(u2);
    expect(u2).toBe(u3);
    expect(createSpy).toHaveBeenCalledTimes(1);

    // 정리
    releaseAssetUrl(id);
    releaseAssetUrl(id);
    releaseAssetUrl(id);
    await tick();
    expect(revokeSpy).toHaveBeenCalledWith(u1);
  });

  it('refCount 가 남아있는 동안은 revoke하지 않고, 0이 되어야 revoke한다', async () => {
    const id = 'refcount-1';
    const loader = vi.fn(async () => blobA);
    const url1 = await acquireAssetUrl(id, loader);
    const url2 = await acquireAssetUrl(id, loader); // 두 번째 "마운트"
    expect(loader).toHaveBeenCalledTimes(1); // 캐시 히트라 재호출 안 됨
    expect(url1).toBe(url2);

    releaseAssetUrl(id); // 아직 1명 더 참조 중
    await tick();
    expect(revokeSpy).not.toHaveBeenCalled();

    releaseAssetUrl(id); // 마지막 참조 반납
    await tick();
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith(url1);
  });

  it('release 직후 즉시 재acquire하면(StrictMode 이중 마운트) revoke가 취소되고 URL을 재사용한다', async () => {
    const id = 'strictmode-1';
    const loader = vi.fn(async () => blobA);
    const url1 = await acquireAssetUrl(id, loader);
    releaseAssetUrl(id); // refCount 0 → revoke 예약(다음 틱)
    const url2 = await acquireAssetUrl(id, loader); // 같은 틱 안에 바로 재마운트 — 타이머 취소돼야 함

    expect(url2).toBe(url1);
    expect(loader).toHaveBeenCalledTimes(1); // 재호출 없이 캐시 재사용

    await tick(); // 취소됐으면 이 시점에도 revoke 안 됨
    expect(revokeSpy).not.toHaveBeenCalled();

    releaseAssetUrl(id);
    await tick();
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it('loader 가 undefined(실패)를 반환하면 캐시에 남기지 않아 다음 acquire 가 재시도한다', async () => {
    const id = 'fail-1';
    const loader = vi.fn<[string], Promise<Blob | undefined>>();
    loader.mockResolvedValueOnce(undefined).mockResolvedValueOnce(blobA);

    const first = await acquireAssetUrl(id, loader);
    expect(first).toBeUndefined();
    releaseAssetUrl(id);

    const second = await acquireAssetUrl(id, loader);
    expect(second).toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2); // 실패 후 재시도됨(캐시에 안 남았다는 증거)
    releaseAssetUrl(id);
  });

  it('loader 완료 전에 refCount 가 0이 되면(빠른 마운트→언마운트) 완료 즉시 revoke 예약된다', async () => {
    const id = 'fast-unmount-1';
    let resolveLoader!: (b: Blob) => void;
    const loader = vi.fn(() => new Promise<Blob | undefined>((resolve) => (resolveLoader = resolve)));

    const p = acquireAssetUrl(id, loader);
    releaseAssetUrl(id); // 로딩 완료 전에 이미 아무도 안 씀
    resolveLoader(blobA);
    const url = await p;
    expect(url).toBeDefined();

    await tick(); // 완료 콜백이 refCount<=0 을 보고 예약한 revoke 가 실행될 시간
    expect(revokeSpy).toHaveBeenCalledWith(url);
  });
});

describe('invalidateAssetUrl / invalidateAllAssetUrls', () => {
  it('무효화하면 캐시된 URL을 즉시 revoke하고, 다음 acquire 는 loader 를 다시 호출한다', async () => {
    const id = 'invalidate-1';
    let calls = 0;
    const loader = vi.fn(async () => {
      calls++;
      return calls === 1 ? blobA : blobB;
    });

    const url1 = await acquireAssetUrl(id, loader); // 훅 마운트, refCount 1
    invalidateAssetUrl(id); // 삭제됨 — 캐시 즉시 정리
    expect(revokeSpy).toHaveBeenCalledWith(url1);

    // 훅의 effect cleanup→재실행 순서를 그대로 흉내(release 후 재-acquire).
    releaseAssetUrl(id); // 이미 지워진 뒤라 no-op(에러 없이 넘어가야 함)
    const url2 = await acquireAssetUrl(id, loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(url2).not.toBe(url1);

    releaseAssetUrl(id);
    await tick();
    expect(revokeSpy).toHaveBeenCalledWith(url2);
  });

  it('invalidateAllAssetUrls 는 캐시된 모든 항목을 revoke 한다', async () => {
    const loaderA = vi.fn(async () => blobA);
    const loaderB = vi.fn(async () => blobB);
    const urlA = await acquireAssetUrl('clear-a', loaderA);
    const urlB = await acquireAssetUrl('clear-b', loaderB);

    invalidateAllAssetUrls();

    expect(revokeSpy).toHaveBeenCalledWith(urlA);
    expect(revokeSpy).toHaveBeenCalledWith(urlB);

    // 정리(참조 카운트가 남아있지 않도록) — 이미 캐시가 비어 있으므로 no-op.
    releaseAssetUrl('clear-a');
    releaseAssetUrl('clear-b');
  });

  it('무효화되지 않은 다른 id 의 캐시는 그대로 유지된다', async () => {
    const loader = vi.fn(async () => blobA);
    const url = await acquireAssetUrl('untouched-1', loader);
    invalidateAssetUrl('some-other-id');

    // 같은 id 로 다시 acquire 해도 loader 재호출 없이 캐시가 재사용돼야 한다.
    const url2 = await acquireAssetUrl('untouched-1', loader);
    expect(url2).toBe(url);
    expect(loader).toHaveBeenCalledTimes(1);

    releaseAssetUrl('untouched-1');
    releaseAssetUrl('untouched-1');
    await tick();
  });
});
