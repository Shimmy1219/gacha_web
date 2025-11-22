import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { type PullHistoryEntryV1 } from '@domain/app-persistence';
import { HistoryEntriesList } from './history/HistoryEntriesList';
import { buildItemMetadataMap, normalizeHistoryUserId } from './history/historyUtils';
import { useShareHandler } from '../../hooks/useShare';

interface UserHistoryDialogPayload {
  userId: string;
  userName: string;
}

interface HistorySection {
  gachaId: string;
  gachaName: string;
  entries: PullHistoryEntryV1[];
  itemMetadata: ReturnType<typeof buildItemMetadataMap>;
}

export function UserHistoryDialog({
  payload,
  close
}: ModalComponentProps<UserHistoryDialogPayload>): JSX.Element {
  const { userId, userName } = payload;
  const {
    pullHistory: pullHistoryStore,
    catalog: catalogStore,
    rarities: rarityStore,
    appState: appStateStore
  } = useDomainStores();

  const pullHistoryState = useStoreValue(pullHistoryStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);
  const appState = useStoreValue(appStateStore);

  const executedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);

  const normalizedUserId = useMemo(() => normalizeHistoryUserId(userId), [userId]);

  const sections = useMemo(() => {
    const grouped = new Map<string, PullHistoryEntryV1[]>();

    if (!pullHistoryState?.order?.length) {
      return grouped;
    }

    pullHistoryState.order.forEach((entryId) => {
      if (!entryId) {
        return;
      }
      const entry = pullHistoryState.pulls?.[entryId];
      if (!entry) {
        return;
      }
      if (normalizeHistoryUserId(entry.userId) !== normalizedUserId) {
        return;
      }
      if (!entry.gachaId) {
        return;
      }
      const bucket = grouped.get(entry.gachaId);
      if (bucket) {
        bucket.push(entry);
      } else {
        grouped.set(entry.gachaId, [entry]);
      }
    });

    return grouped;
  }, [normalizedUserId, pullHistoryState]);

  const orderIndex = useMemo(() => {
    const map = new Map<string, number>();
    (appState?.order ?? []).forEach((gachaId, index) => {
      map.set(gachaId, index);
    });
    return map;
  }, [appState?.order]);

  const historySections = useMemo(() => {
    return Array.from(sections.entries())
      .map(([gachaId, entries]) => {
        const gachaName = appState?.meta?.[gachaId]?.displayName ?? gachaId;
        const itemMetadata = buildItemMetadataMap(catalogState, rarityState, gachaId);
        return { gachaId, gachaName, entries, itemMetadata } satisfies HistorySection;
      })
      .filter((section) => section.entries.length > 0)
      .sort((a, b) => {
        const orderA = orderIndex.get(a.gachaId);
        const orderB = orderIndex.get(b.gachaId);
        if (orderA !== undefined || orderB !== undefined) {
          const indexA = orderA ?? Number.POSITIVE_INFINITY;
          const indexB = orderB ?? Number.POSITIVE_INFINITY;
          if (indexA !== indexB) {
            return indexA - indexB;
          }
        }
        return a.gachaName.localeCompare(b.gachaName, 'ja');
      });
  }, [appState?.meta, catalogState, orderIndex, rarityState, sections]);

  const shareHandlers = useShareHandler();

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-surface-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">ユーザーの全ガチャ履歴</p>
        </div>
        {historySections.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-surface-alt px-4 py-6 text-sm text-muted-foreground">
            このユーザーには履歴がありません。
          </p>
        ) : (
          <div className="space-y-6 max-h-[65vh] overflow-y-auto">
            {historySections.map((section) => (
              <section key={section.gachaId} className="space-y-3">
                <header className="space-y-0.5">
                  <p className="text-sm font-semibold text-surface-foreground">{section.gachaName}</p>
                  <p className="text-xs text-muted-foreground">ガチャID: {section.gachaId}</p>
                </header>
                <HistoryEntriesList
                  entries={section.entries}
                  userName={userName}
                  gachaName={section.gachaName}
                  executedAtFormatter={executedAtFormatter}
                  numberFormatter={numberFormatter}
                  itemMetadata={section.itemMetadata}
                  shareHandlers={shareHandlers}
                />
              </section>
            ))}
          </div>
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
