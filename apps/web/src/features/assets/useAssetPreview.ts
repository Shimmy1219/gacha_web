import { useEffect, useState } from 'react';

import { loadAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';

export interface AssetPreviewState {
  url: string | null;
  type: string | null;
  name: string | null;
}

const INITIAL_STATE: AssetPreviewState = {
  url: null,
  type: null,
  name: null
};

export function useAssetPreview(assetId: string | null | undefined): AssetPreviewState {
  const [state, setState] = useState<AssetPreviewState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!assetId) {
      setState(INITIAL_STATE);
      return () => {};
    }

    const fetch = async () => {
      const asset: StoredAssetRecord | null = await loadAsset(assetId);
      if (!active) {
        return;
      }

      if (!asset) {
        setState(INITIAL_STATE);
        return;
      }

      objectUrl = URL.createObjectURL(asset.blob);
      setState({
        url: objectUrl,
        type: asset.type ?? null,
        name: asset.name ?? null
      });
    };

    void fetch();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assetId]);

  return state;
}
