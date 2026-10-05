// 바이너리 에셋(이미지·BGM) 동기화. 수 MB 파일이라 실시간 방송 대신:
//  - 업로드 시점에만 Supabase Storage 로 올리고(pushAsset)
//  - 상대방은 실제로 그 에셋이 필요한 렌더 시점에만 지연 다운로드+로컬 캐싱한다(ensureAsset).
// 참조(어떤 assetId 를 쓰는지)는 Project JSON 안에 이미 들어있어 별도 매핑 테이블이 필요 없다
// (에셋 id 를 Storage 오브젝트 키로 그대로 사용).
//
// ── S1-B(Auth) continuation barrier ──
// 클라이언트는 getCollabClient() 로만 얻고, 요청 await 가 끝난 뒤 로그아웃됐다면 **후속 부수효과를
// 만들지 않는다**(뱃지 복귀·원격 blob 의 로컬 캐싱). 이미 나간 요청 자체를 취소하는 시스템은
// 만들지 않는다 — AbortController/global write barrier 는 이 Phase 범위 밖이다.

import { getAsset, putAsset } from '../storage/assetStore';
import { getCollabClient, isCollabActive } from './supabaseClient';
import { currentSyncLifecycle, isInitialSyncBlocked, type PushStatusHandler } from './sync';

const BUCKET = 'assets';

// 실패해도 console.warn 만 하고 collabStatus 는 계속 'online'으로 보였던 문제 수정(sync.ts 와 동일
// 콜백 패턴). index.ts 가 startCollab/stopCollab 시점에 sync.ts 것과 같은 핸들러를 등록/해제한다.
let pushStatusHandler: PushStatusHandler | null = null;

/** startCollab/stopCollab 이 push 성공·실패를 collabStatus 에 반영할 콜백을 등록/해제한다. */
export function setAssetPushStatusHandler(handler: PushStatusHandler | null): void {
  pushStatusHandler = handler;
}

/**
 * 로컬 업로드 직후 Storage 에도 올린다. collab 미활성이면 조용히 no-op(로컬 동작엔 영향 없음).
 *
 * ── S1-D1 F-8 ──
 * · B′-4: initial sync 를 신뢰할 수 없는 동안(sync.ts latch)엔 같은 id 의 원격 오브젝트를 upsert 로 덮지 않는다 → 'error'.
 * · B′-7: expectedLifecycle = 이 업로드를 만든 producer 가 **시작할 때** 잡은 sync lifecycle 번호(importProject 루프).
 *   그 사이 협업이 OFF→ON 으로 새 lifecycle 이 됐다면 옛 producer 다 → **조용히** 버린다(새 lifecycle 의 status 를
 *   error/online 으로 덮지 않는다). boolean active 는 OFF→ON 뒤 다시 true 라 이 번호로만 가릴 수 있다.
 *   일반 업로드(uploadAsset)는 lifecycle 번호를 넘기지 않는다(번호 검사 없음) — B′-4 latch 는 똑같이 걸린다.
 */
export async function pushAsset(id: string, blob: Blob, expectedLifecycle?: number): Promise<void> {
  const stale = () => expectedLifecycle !== undefined && expectedLifecycle !== currentSyncLifecycle();
  if (stale()) return;
  if (isInitialSyncBlocked()) {
    // 로그아웃 직후(handler 해제 전 한 tick)엔 'off' 를 'error' 로 되살리지 않는다(S1-B continuation barrier).
    if (isCollabActive()) pushStatusHandler?.('error');
    return;
  }
  const supabase = await getCollabClient();
  // client await 중 OFF→ON 이 끼면 active 는 다시 true 일 수 있다 — destructive upload 직전에 번호표를 다시 본다.
  if (stale()) return;
  if (!supabase) return;
  if (isInitialSyncBlocked()) {
    pushStatusHandler?.('error');
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).upload(id, blob, {
    upsert: true,
    contentType: blob.type || undefined,
  });
  // 업로드가 끝난 뒤 로그아웃됐다면 뱃지를 되살리지 않는다('off' 유지).
  if (!isCollabActive()) return;
  // 이미 나간 업로드의 결과로 새 lifecycle 의 뱃지를 덮지 않는다(요청 자체는 취소하지 않는다).
  if (stale()) return;
  if (error) {
    console.warn('[collab] 에셋 업로드 실패:', error.message);
    pushStatusHandler?.('error');
    return;
  }
  pushStatusHandler?.('online');
}

// 동시에 같은 에셋을 여러 번 렌더 요청해도 다운로드는 1회만 나가도록 dedupe.
const inFlight = new Map<string, Promise<Blob | undefined>>();

/**
 * 로컬(IndexedDB)에 있으면 그걸 반환. 없고 collab 이 활성이면 Storage 에서 받아와
 * 로컬에 캐싱한 뒤 반환한다. 실패하거나 collab 이 꺼져 있으면 undefined(호출 측이 Canvas
 * 플레이스홀더 등으로 폴백).
 */
export async function ensureAsset(id: string): Promise<Blob | undefined> {
  const local = await getAsset(id);
  if (local) return local;
  const supabase = await getCollabClient();
  if (!supabase) return undefined;
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(id);
      if (error || !data) return undefined;
      // 다운로드가 끝난 시점에 로그아웃됐다면 **원격 blob 을 로컬에 새로 캐싱하지 않는다** —
      // signed-out 이후에 원격 데이터가 IndexedDB 로 새로 들어오는 경로를 만들지 않는다.
      if (!isCollabActive()) return undefined;
      await putAsset(id, data);
      return data;
    } catch {
      return undefined;
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, p);
  return p;
}
