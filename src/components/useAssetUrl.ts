import { useEffect, useState } from 'react';
import { getAsset } from '../storage/assetStore';

/** assetId → object URL. id 변경/언마운트 시 자동 revoke. */
export function useAssetUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let revoked = false;
    let current: string | undefined;
    if (!id) {
      setUrl(undefined);
      return;
    }
    getAsset(id).then((blob) => {
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
