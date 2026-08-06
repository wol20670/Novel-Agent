// 원격(Supabase Storage) 고아 에셋 정리 — pushAsset(assetsSync.ts)은 업로드마다 upsert 로 올리지만
// 로컬 삭제(27곳, 전부 IndexedDB 만 건드림)는 원격 오브젝트를 절대 지우지 않는다. 그래서 버킷은
// 방을 나가거나 로컬에서 지운 뒤에도 영원히 커진다 — 이 모듈이 그 스윕을 담당한다.
// findOrphanAssets/deleteOrphanAssets(store.ts, IndexedDB 대상)와 이름이 비슷하지만 대상이 다르다:
// 여긴 "다른 방 포함 전체 Storage 버킷 vs 모든 방의 프로젝트 JSON 이 참조하는 id" 를 비교한다.

import { getSupabaseClient } from './supabaseClient';
import { collectReferencedAssetIds, type RemoteAsset } from '../assetRefs';
import type { Project } from '../types';

export type { RemoteAsset };

const BUCKET = 'assets';
// storage.list() 는 기본 100개/페이지 — 이 값보다 크게 줘도 서버가 상한을 두는 SDK 버전이 있어
// 1000 으로 고정하고 짧은 페이지가 올 때까지 루프. 이걸 빠뜨리면 100개 이후는 그냥 조용히 안 보여서
// "스윕이 됐는데 왜 버킷이 안 줄지" 처럼 보이는 게 제일 무섭다(에러가 안 남).
const LIST_PAGE_SIZE = 1000;
// storage.remove() 는 배열을 받지만 한 번에 너무 많이 넣으면 실패할 수 있어 안전하게 청크.
const REMOVE_CHUNK_SIZE = 100;

/**
 * 조회 결과 + 실패 여부. **실패를 빈 결과로 뭉개면 안 된다** — 목록 조회가 죽었는데 빈 배열을
 * 돌려주면 "정리할 게 없습니다"라는 거짓 성공으로 보이고(정책 미적용 403 을 놓친다), 참조 조회가
 * 죽었는데 빈 집합을 돌려주면 **모든 원격 파일이 고아로 보여** 남의 방 에셋까지 지우게 된다.
 * 그래서 호출부가 반드시 failed 를 보고 중단할 수 있도록 분리해 돌려준다(fail-closed).
 */
export interface RemoteScan {
  assets: RemoteAsset[];
  failed: boolean;
}

/** 버킷 전체 목록. collab 미준비면 빈 결과(호출부가 매번 isCollabReady 를 따로 확인할 필요 없게). */
export async function listRemoteAssets(): Promise<RemoteScan> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { assets: [], failed: false };

  const out: RemoteAsset[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      console.warn('[collab] 원격 에셋 목록 조회 실패:', error.message);
      return { assets: out, failed: true };
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!row.name) continue; // 폴더 placeholder(.emptyFolderPlaceholder) 등 방어
      const size = (row.metadata as { size?: number } | null)?.size ?? 0;
      const parsed = row.created_at ? Date.parse(row.created_at) : NaN;
      out.push({ id: row.name, size, createdAt: Number.isNaN(parsed) ? undefined : parsed });
    }
    if (data.length < LIST_PAGE_SIZE) break; // 짧은 페이지 = 마지막 페이지
    offset += LIST_PAGE_SIZE;
  }
  return { assets: out, failed: false };
}

/** 참조 집합 + 실패 여부. failed 면 호출부는 **반드시 스윕을 중단**해야 한다(RemoteScan 주석 참고). */
export interface RemoteRefScan {
  ids: Set<string>;
  failed: boolean;
}

/**
 * 모든 방의 프로젝트가 참조하는 에셋 id 합집합. 방 필터 없이 projects 테이블 전체를 훑는다 —
 * anon SELECT 가 열려 있어(supabase/setup.sql) 전 방 조회가 가능하고, 이 스윕은 "어느 방이든
 * 쓰고 있으면 지우면 안 된다"가 목적이라 필터링하면 오히려 위험하다.
 */
export async function collectRemoteReferencedIds(): Promise<RemoteRefScan> {
  const ids = new Set<string>();
  const supabase = await getSupabaseClient();
  if (!supabase) return { ids, failed: false };

  const { data, error } = await supabase.from('projects').select('data');
  if (error) {
    // 여기서 빈 집합을 성공인 척 돌려주면 모든 원격 파일이 고아로 판정된다 — 가장 위험한 실패 모드.
    console.warn('[collab] 원격 프로젝트 목록 조회 실패:', error.message);
    return { ids, failed: true };
  }
  let rowFailed = false;
  for (const row of data ?? []) {
    try {
      const project = (row as { data: Project }).data;
      for (const id of collectReferencedAssetIds(project, { includeVoice: true })) {
        ids.add(id);
      }
    } catch (e) {
      // 행 하나가 깨져 있으면(스키마 어긋남 등) 그 행만 건너뛰되, 그 방이 쓰는 에셋을 못 세었다는
      // 뜻이므로 failed 로 올려 스윕 자체를 막는다 — 부분 참조 집합으로 판정하면 그 방 파일을 지운다.
      console.warn('[collab] 프로젝트 행 파싱 실패(건너뜀):', e);
      rowFailed = true;
    }
  }
  return { ids, failed: rowFailed };
}

/** 배치 삭제. 실패분 id 를 돌려준다(throw 하지 않음 — 부분 성공을 호출부가 그대로 보고할 수 있게). */
export async function removeRemoteAssets(ids: string[]): Promise<{ removed: number; failed: string[] }> {
  const supabase = await getSupabaseClient();
  if (!supabase || ids.length === 0) return { removed: 0, failed: ids.length === 0 ? [] : [...ids] };

  let removed = 0;
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i += REMOVE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + REMOVE_CHUNK_SIZE);
    const { data, error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) {
      console.warn('[collab] 원격 에셋 삭제 실패:', error.message);
      failed.push(...chunk);
      continue;
    }
    const okNames = new Set((data ?? []).map((d) => d.name));
    for (const id of chunk) {
      if (okNames.has(id)) removed += 1;
      else failed.push(id);
    }
  }
  return { removed, failed };
}
