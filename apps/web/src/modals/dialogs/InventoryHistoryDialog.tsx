import { clsx } from 'clsx';
import { useMemo } from 'react';
import type { CSSProperties } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
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

interface ItemMetadata {
  name: string;
  rarityId?: string;
  rarityLabel?: string;
  rarityColor?: string | null;
  raritySortOrder?: number | null;
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
      return new Map<string, ItemMetadata>();
    }

    const metadata = new Map<string, ItemMetadata>();
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
        rarityColor: rarityEntity?.color ?? null,
        raritySortOrder: rarityEntity?.sortOrder ?? null
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
          <div className="inventory-history-dialog__scroll space-y-3 max-h-[60vh] overflow-y-auto">
            {historyEntries.map((entry) => {
              const executedAtLabel = formatExecutedAt(executedAtFormatter, entry.executedAt);
              const sourceLabel = SOURCE_LABELS[entry.source] ?? '不明なソース';
              const sourceClassName = SOURCE_CLASSNAMES[entry.source] ?? 'border-border/60 bg-panel-muted text-muted-foreground';
              const pullCountValue =
                typeof entry.pullCount === 'number' && Number.isFinite(entry.pullCount)
                  ? Math.max(0, entry.pullCount)
                  : 0;
              const pullCountLabel = `${numberFormatter.format(pullCountValue)}連`;
              const currencyUsedLabel =
                typeof entry.currencyUsed === 'number' && Number.isFinite(entry.currencyUsed) && entry.currencyUsed
                  ? numberFormatter.format(entry.currencyUsed)
                  : null;
              const itemEntries = Object.entries(entry.itemCounts ?? {})
                .map(([itemId, rawCount]) => {
                  const count = Number(rawCount);
                  if (!Number.isFinite(count) || count === 0) {
                    return null;
                  }
                  const metadata = itemMetadata.get(itemId);
                  const rarityLabel = metadata?.rarityLabel;
                  const rarityColor = metadata?.rarityColor ?? undefined;
                  const raritySortOrder = metadata?.raritySortOrder ?? Number.NEGATIVE_INFINITY;
                  const { className: rarityTextClassName, style: rarityTextStyle } = getRarityTextPresentation(
                    typeof rarityColor === 'string' ? rarityColor : undefined
                  );

                  return {
                    itemId,
                    count,
                    itemLabel: metadata?.name ?? itemId,
                    rarityLabel,
                    rarityTextClassName,
                    rarityTextStyle,
                    raritySortOrder
                  };
                })
                .filter((value): value is {
                  itemId: string;
                  count: number;
                  itemLabel: string;
                  rarityLabel?: string;
                  rarityTextClassName?: string;
                  rarityTextStyle?: CSSProperties;
                  raritySortOrder: number;
                } => value !== null)
                .sort((a, b) => {
                  if (a.raritySortOrder !== b.raritySortOrder) {
                    return b.raritySortOrder - a.raritySortOrder;
                  }
                  return a.itemLabel.localeCompare(b.itemLabel, 'ja');
                });

              return (
                <article
                  key={entry.id}
                  className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast p-4"
                >
                  <header className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-surface-foreground">{executedAtLabel}</span>
                      <span className="text-[11px] text-muted-foreground">{pullCountLabel}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          sourceClassName
                        )}
                      >
                        {sourceLabel}
                      </span>
                      {entry.id ? (
                        <span className="font-mono text-[11px] text-muted-foreground/80">ID: {entry.id}</span>
                      ) : null}
                    </div>
                  </header>
                  {itemEntries.length > 0 ? (
                    <div className="space-y-2">
                      {itemEntries.map((item) => (
                        <div key={item.itemId} className="flex items-center gap-3 text-sm text-surface-foreground">
                          {item.rarityLabel ? (
                            <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full border border-white/80 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-surface-foreground shadow-sm">
                              <span
                                className={clsx('leading-tight', item.rarityTextClassName)}
                                style={item.rarityTextStyle}
                              >
                                {item.rarityLabel}
                              </span>
                            </span>
                          ) : null}
                          <span className="flex-1 font-medium">{item.itemLabel}</span>
                          <span
                            className={clsx(
                              'font-mono text-sm',
                              item.count < 0 ? 'text-red-500' : 'text-surface-foreground'
                            )}
                          >
                            {formatCount(numberFormatter, item.count)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">アイテムの記録がありません。</p>
                  )}
                  {currencyUsedLabel ? (
                    <footer className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                      <span>消費リソース: {currencyUsedLabel}</span>
                    </footer>
                  ) : null}
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
