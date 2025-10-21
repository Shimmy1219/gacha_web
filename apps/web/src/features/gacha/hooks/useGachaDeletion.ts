import { useCallback } from 'react';

import { deleteAsset } from '@domain/assets/assetStorage';

import { useModal } from '../../../components/modal';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { GachaDeleteConfirmDialog } from '../dialogs/GachaDeleteConfirmDialog';
import type { GachaTabOption } from '../components/GachaTabs';

interface DeleteTarget {
  id: string;
  name?: string;
}

export function useGachaDeletion(): (target: DeleteTarget | GachaTabOption) => void {
  const { appState, catalog, rarities, riagu, userInventories, ptControls } = useDomainStores();
  const { push } = useModal();

  const performDeletion = useCallback(
    (gachaId: string) => {
      if (!gachaId) {
        return;
      }

      const catalogState = catalog.getState();
      const snapshot = catalogState?.byGacha?.[gachaId];
      const assetIds = snapshot
        ? Array.from(
            new Set(
              Object.values(snapshot.items ?? {})
                .map((item) => item?.imageAssetId)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
            )
          )
        : [];

      appState.removeGacha(gachaId);
      catalog.removeGacha(gachaId);
      rarities.removeGacha(gachaId);
      riagu.removeGacha(gachaId);
      ptControls.removeGacha(gachaId);
      userInventories.removeGacha(gachaId);

      if (assetIds.length > 0) {
        void Promise.allSettled(assetIds.map((assetId) => deleteAsset(assetId)));
      }
    },
    [appState, catalog, rarities, riagu, userInventories, ptControls]
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
        payload: {
          gachaId,
          gachaName,
          onConfirm: (confirmedId) => {
            performDeletion(confirmedId);
          }
        }
      });
    },
    [performDeletion, push]
  );
}
