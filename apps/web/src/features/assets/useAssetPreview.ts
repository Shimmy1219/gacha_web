import { useEffect, useState } from 'react';

import {
  loadAsset,
  loadAssetPreview,
  type StoredAssetPreviewRecord,
  type StoredAssetRecord
} from '@domain/assets/assetStorage';

export interface AssetPreviewState {
  url: string | null;
  type: string | null;
  previewType: string | null;
  name: string | null;
}

const INITIAL_STATE: AssetPreviewState = {
  url: null,
  type: null,
  previewType: null,
  name: null
};

export interface UseAssetPreviewOptions {
  loadOriginal?: boolean;
  previewAssetId?: string | null;
}

export function useAssetPreview(
  assetId: string | null | undefined,
  options: UseAssetPreviewOptions = {}
): AssetPreviewState {
  const [state, setState] = useState<AssetPreviewState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const resolvedAssetId = assetId ?? null;
    const resolvedPreviewId = options.previewAssetId ?? resolvedAssetId;

    if (!resolvedAssetId && !resolvedPreviewId) {
      setState(INITIAL_STATE);
      return () => {};
    }

    const fetch = async () => {
      const asset = options.loadOriginal
        ? (resolvedAssetId ? await loadAsset(resolvedAssetId) : null)
        : await loadAssetPreview({ assetId: resolvedAssetId, previewId: resolvedPreviewId });
      if (!active) {
        return;
      }

      if (!asset) {
        setState(INITIAL_STATE);
        return;
      }

      const blob = options.loadOriginal
        ? (asset as StoredAssetRecord).blob
        : (asset as StoredAssetPreviewRecord).previewBlob;

      if (blob) {
        objectUrl = URL.createObjectURL(blob);
      }

      setState({
        url: blob ? objectUrl : null,
        type: asset.type ?? null,
        previewType: blob?.type ?? null,
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
  }, [assetId, options.loadOriginal, options.previewAssetId]);

  return state;
}
