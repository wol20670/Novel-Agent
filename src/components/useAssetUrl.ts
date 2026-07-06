import { useEffect, useState } from 'react';
import { ensureAsset } from '../collab';

/**
 * assetId → object URL. id 변경/언마운트 시 자동 revoke.
 * 로컬(IndexedDB)에 없으면 협업이 켜져 있을 때 Storage 에서 지연 다운로드+캐싱한다
 * (ensureAsset 이 local-first 폴백까지 처리 — collab 꺼져 있으면 그냥 로컬 조회와 동일).
 */
export function useAssetUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let revoked = false;
    let current: string | undefined;
    if (!id) {
      setUrl(undefined);
      return;
    }
    ensureAsset(id).then((blob) => {
      if (revoked || !blob) {
        if (!blob) setUrl(undefined);
        return;
      }
      current = URL.createObjectURL(blob);
      setUrl(current);
    });
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [id]);
  return url;
}
