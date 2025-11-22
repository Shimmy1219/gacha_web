import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { type PullHistoryEntryV1 } from '@domain/app-persistence';
import { useShareHandler } from '../../hooks/useShare';
import { HistoryEntriesList } from './history/HistoryEntriesList';
import { buildItemMetadataMap, normalizeHistoryUserId } from './history/historyUtils';

interface InventoryHistoryDialogPayload {
  userId: string;
  userName: string;
  gachaId: string;
  gachaName: string;
}

export function InventoryHistoryDialog({
  payload,
  close
}: ModalComponentProps<InventoryHistoryDialogPayload>): JSX.Element {
  const { userId, userName, gachaId, gachaName } = payload;
  const { pullHistory: pullHistoryStore, catalog: catalogStore, rarities: rarityStore } =
    useDomainStores();
  const pullHistoryState = useStoreValue(pullHistoryStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);

  const executedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);

  const itemMetadata = useMemo(
    () => buildItemMetadataMap(catalogState, rarityState, gachaId),
    [catalogState, gachaId, rarityState]
  );

  const normalizedTargetUserId = useMemo(() => normalizeHistoryUserId(userId), [userId]);

  const historyEntries = useMemo(() => {
    const state = pullHistoryState;
    if (!state?.order?.length || !gachaId) {
      return [] as PullHistoryEntryV1[];
    }

    const entries: PullHistoryEntryV1[] = [];
    state.order.forEach((entryId) => {
      if (!entryId) {
        return;
      }
      const entry = state.pulls?.[entryId];
      if (!entry) {
        return;
      }
      if (normalizeHistoryUserId(entry.userId) !== normalizedTargetUserId) {
        return;
      }
      if (entry.gachaId !== gachaId) {
        return;
      }
      entries.push(entry);
    });
    return entries;
  }, [gachaId, normalizedTargetUserId, pullHistoryState]);

  const shareHandlers = useShareHandler();

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-surface-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">「{gachaName}」の獲得履歴</p>
        </div>
        {historyEntries.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-surface-alt px-4 py-6 text-sm text-muted-foreground">
            このインベントリには履歴がありません。
          </p>
        ) : (
          <HistoryEntriesList
            entries={historyEntries}
            userName={userName}
            gachaName={gachaName}
            executedAtFormatter={executedAtFormatter}
            numberFormatter={numberFormatter}
            itemMetadata={itemMetadata}
            shareHandlers={shareHandlers}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
