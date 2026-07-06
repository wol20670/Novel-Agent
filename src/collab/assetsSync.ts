// 바이너리 에셋(이미지·BGM) 동기화. 수 MB 파일이라 실시간 방송 대신:
//  - 업로드 시점에만 Supabase Storage 로 올리고(pushAsset)
//  - 상대방은 실제로 그 에셋이 필요한 렌더 시점에만 지연 다운로드+로컬 캐싱한다(ensureAsset).
// 참조(어떤 assetId 를 쓰는지)는 Project JSON 안에 이미 들어있어 별도 매핑 테이블이 필요 없다
// (에셋 id 를 Storage 오브젝트 키로 그대로 사용).

import { getAsset, putAsset } from '../storage/assetStore';
import { getSupabaseClient } from './supabaseClient';

const BUCKET = 'assets';

/** 로컬 업로드 직후 Storage 에도 올린다. collab 미준비면 조용히 no-op(로컬 동작엔 영향 없음). */
export async function pushAsset(id: string, blob: Blob): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).upload(id, blob, {
    upsert: true,
    contentType: blob.type || undefined,
  });
  if (error) console.warn('[collab] 에셋 업로드 실패:', error.message);
}

// 동시에 같은 에셋을 여러 번 렌더 요청해도 다운로드는 1회만 나가도록 dedupe.
const inFlight = new Map<string, Promise<Blob | undefined>>();

/**
 * 로컬(IndexedDB)에 있으면 그걸 반환. 없고 collab 이 켜져 있으면 Storage 에서 받아와
 * 로컬에 캐싱한 뒤 반환한다. 실패하거나 collab 이 꺼져 있으면 undefined(호출 측이 Canvas
 * 플레이스홀더 등으로 폴백).
 */
export async function ensureAsset(id: string): Promise<Blob | undefined> {
  const local = await getAsset(id);
  if (local) return local;
  const supabase = getSupabaseClient();
  if (!supabase) return undefined;
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(id);
      if (error || !data) return undefined;
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
