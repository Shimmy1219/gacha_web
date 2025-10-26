import { clsx } from 'clsx';
import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import {
  type PullHistoryEntrySourceV1,
  type PullHistoryEntryV1
} from '@domain/app-persistence';
import { generateDeterministicUserId } from '@domain/idGenerators';

interface InventoryHistoryDialogPayload {
  userId: string;
  userName: string;
  gachaId: string;
  gachaName: string;
}

const DEFAULT_USER_ID = generateDeterministicUserId('default-user');

function normalizeUserId(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_ID;
}

const SOURCE_LABELS: Record<PullHistoryEntrySourceV1, string> = {
  insiteResult: 'ガチャ結果',
  manual: '手動調整',
  realtime: 'リアルタイム同期'
};

const SOURCE_CLASSNAMES: Record<PullHistoryEntrySourceV1, string> = {
  insiteResult: 'border-accent/40 bg-accent/10 text-accent',
  manual: 'border-amber-500/40 bg-amber-500/10 text-amber-600',
  realtime: 'border-sky-500/40 bg-sky-500/10 text-sky-600'
};

function formatExecutedAt(
  formatter: Intl.DateTimeFormat,
  value: string | undefined
): string {
  if (!value) {
    return '日時不明';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '日時不明';
  }
  return formatter.format(date);
}

function formatCount(formatter: Intl.NumberFormat, count: number): string {
  const formatted = formatter.format(Math.abs(count));
  if (count > 0) {
    return `+${formatted}`;
  }
  if (count < 0) {
    return `-${formatted}`;
  }
  return formatted;
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

  const itemMetadata = useMemo(() => {
    const catalogSnapshot = catalogState?.byGacha?.[gachaId];
    if (!catalogSnapshot?.items) {
      return new Map<string, { name: string; rarityId?: string; rarityLabel?: string; rarityColor?: string | null }>();
    }

    const metadata = new Map<
      string,
      { name: string; rarityId?: string; rarityLabel?: string; rarityColor?: string | null }
    >();
    Object.values(catalogSnapshot.items).forEach((item) => {
      if (!item?.itemId) {
        return;
      }
      const rarityId = item.rarityId ?? undefined;
      const rarityEntity = rarityId ? rarityState?.entities?.[rarityId] : undefined;
      metadata.set(item.itemId, {
        name: item.name ?? item.itemId,
        rarityId,
        rarityLabel: rarityEntity?.label ?? rarityId,
        rarityColor: rarityEntity?.color ?? null
      });
    });
    return metadata;
  }, [catalogState?.byGacha, gachaId, rarityState?.entities]);

  const normalizedTargetUserId = useMemo(() => normalizeUserId(userId), [userId]);

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
      if (normalizeUserId(entry.userId) !== normalizedTargetUserId) {
        return;
      }
      if (entry.gachaId !== gachaId) {
        return;
      }
      entries.push(entry);
    });
    return entries;
  }, [gachaId, normalizedTargetUserId, pullHistoryState]);

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
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {historyEntries.map((entry) => {
              const executedAtLabel = formatExecutedAt(executedAtFormatter, entry.executedAt);
              const sourceLabel = SOURCE_LABELS[entry.source] ?? '不明なソース';
              const sourceClassName = SOURCE_CLASSNAMES[entry.source] ?? 'border-border/60 bg-panel-muted text-muted-foreground';
              const itemEntries = Object.entries(entry.itemCounts ?? {}).filter(([, count]) => Number(count) !== 0);

              return (
                <article
                  key={entry.id}
                  className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast p-4"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-surface-foreground">{executedAtLabel}</span>
                      <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', sourceClassName)}>
                        {sourceLabel}
                      </span>
                    </div>
                    {entry.id ? (
                      <span className="font-mono text-[11px] text-muted-foreground/80">ID: {entry.id}</span>
                    ) : null}
                  </header>
                  {itemEntries.length > 0 ? (
                    <div className="space-y-2">
                      {itemEntries.map(([itemId, rawCount]) => {
                        const count = Number(rawCount);
                        const metadata = itemMetadata.get(itemId);
                        const rarityLabel = metadata?.rarityLabel;
                        const rarityColor = metadata?.rarityColor ?? undefined;
                        const itemLabel = metadata?.name ?? itemId;

                        return (
                          <div
                            key={itemId}
                            className="flex items-center gap-3 text-sm text-surface-foreground"
                          >
                            {rarityLabel ? (
                              <span
                                className="inline-flex min-w-[3rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                                style={
                                  rarityColor
                                    ? {
                                        borderColor: `${rarityColor}33`,
                                        backgroundColor: `${rarityColor}1a`,
                                        color: rarityColor
                                      }
                                    : undefined
                                }
                              >
                                {rarityLabel}
                              </span>
                            ) : null}
                            <span className="flex-1 font-medium">{itemLabel}</span>
                            <span
                              className={clsx(
                                'font-mono text-sm',
                                count < 0 ? 'text-red-500' : 'text-surface-foreground'
                              )}
                            >
                              {formatCount(numberFormatter, count)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">アイテムの記録がありません。</p>
                  )}
                  <footer className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                    {entry.pullCount > 0 ? (
                      <span>記録回数: {numberFormatter.format(entry.pullCount)}</span>
                    ) : (
                      <span>記録回数: 0</span>
                    )}
                    {Number.isFinite(entry.currencyUsed) && entry.currencyUsed ? (
                      <span>消費リソース: {numberFormatter.format(entry.currencyUsed)}</span>
                    ) : null}
                  </footer>
                </article>
              );
            })}
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
