import { useCallback } from 'react';

import { deleteAsset } from '@domain/assets/assetStorage';

import { useModal } from '../../../modals';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { GachaDeleteConfirmDialog } from '../../../modals/dialogs/GachaDeleteConfirmDialog';
import type { GachaTabOption } from '../../../pages/gacha/components/common/GachaTabs';

interface DeleteTarget {
  id: string;
  name?: string;
}

interface UseGachaDeletionOptions {
  mode?: 'archive' | 'delete';
}

export function useGachaDeletion(options: UseGachaDeletionOptions = {}): (target: DeleteTarget | GachaTabOption) => void {
  const mode = options.mode ?? 'archive';
  const { appState, catalog, rarities, riagu, ptControls, pullHistory, userInventories } = useDomainStores();
  const { push } = useModal();

  const performDeletion = useCallback(
    (gachaId: string) => {
      if (!gachaId) {
        return;
      }

      if (mode === 'archive') {
        appState.archiveGacha(gachaId);
        return;
      }

      const catalogState = catalog.getState();
      const snapshot = catalogState?.byGacha?.[gachaId];
      const thumbnailAssetId = appState.getState()?.meta?.[gachaId]?.thumbnailAssetId ?? null;
      const assetIds = Array.from(
        new Set([
          ...(snapshot
            ? Object.values(snapshot.items ?? {}).flatMap((item) => {
                const assets = Array.isArray(item?.assets) ? item.assets : [];
                if (assets.length > 0) {
                  return assets
                    .map((asset) => asset?.assetId)
                    .filter((value): value is string => typeof value === 'string' && value.length > 0);
                }

                const legacyAssetId = (item as { imageAssetId?: unknown }).imageAssetId;
                if (typeof legacyAssetId === 'string' && legacyAssetId.length > 0) {
                  return [legacyAssetId];
                }

                return [];
              })
            : []),
          ...(typeof thumbnailAssetId === 'string' && thumbnailAssetId.length > 0 ? [thumbnailAssetId] : [])
        ])
      );

      appState.purgeGacha(gachaId);
      catalog.removeGacha(gachaId);
      rarities.removeGacha(gachaId);
      riagu.removeGacha(gachaId);
      ptControls.removeGacha(gachaId);
      userInventories.removeGacha(gachaId);
      pullHistory.deletePullsForInventory({ gachaId });

      if (assetIds.length > 0) {
        void Promise.allSettled(assetIds.map((assetId) => deleteAsset(assetId)));
      }
    },
    [appState, catalog, mode, ptControls, pullHistory, rarities, riagu, userInventories]
  );

  return useCallback(
    (target: DeleteTarget | GachaTabOption) => {
      const gachaId = target?.id;
      if (!gachaId) {
        return;
      }

      const gachaName = target?.name ?? (target as GachaTabOption)?.label ?? gachaId;

      push(GachaDeleteConfirmDialog, {
        id: `gacha-delete-${gachaId}`,
        intent: 'warning',
        payload: {
          gachaId,
          gachaName,
          mode,
          onConfirm: (confirmedId) => {
            performDeletion(confirmedId);
          }
        }
      });
    },
    [mode, performDeletion, push]
  );
}
