import { ClipboardIcon, ExclamationTriangleIcon, ShareIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { type CSSProperties } from 'react';

import { getPullHistoryStatusLabel } from '@domain/pullHistoryStatusLabels';
import { type PullHistoryEntrySourceV1, type PullHistoryEntryV1 } from '@domain/app-persistence';
import { getRarityTextPresentation } from '../../../features/rarity/utils/rarityColorPresentation';
import { XLogoIcon } from '../../../components/icons/XLogoIcon';
import { type ShareHandler } from '../../../hooks/useShare';
import { type HistoryItemMetadata } from './historyUtils';
import { WarningDialog } from '../WarningDialog';
import { useModal } from '../../ModalProvider';

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

function formatExecutedAt(formatter: Intl.DateTimeFormat, value: string | undefined): string {
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

interface ItemEntryViewModel {
  itemId: string;
  itemLabel: string;
  count: number;
  rarityLabel?: string;
  rarityTextClassName?: string;
  rarityTextStyle?: CSSProperties;
  raritySortOrder: number;
  isNew: boolean;
  hasOriginalPrizeMissing: boolean;
  missingOriginalPrizeCount: number;
}

export interface HistoryEntriesListProps {
  entries: PullHistoryEntryV1[];
  userName: string;
  gachaName: string;
  executedAtFormatter: Intl.DateTimeFormat;
  numberFormatter: Intl.NumberFormat;
  itemMetadata: Map<string, HistoryItemMetadata>;
  shareHandlers: ShareHandler;
}

function formatOriginalPrizeWarningMessage(item: ItemEntryViewModel): string {
  if (item.missingOriginalPrizeCount > 1) {
    return `オリジナル景品「${item.itemLabel}」のうち${item.missingOriginalPrizeCount}件分にファイルが割り当てられていません。ユーザーごとの「オリジナル景品設定」からファイルを割り当ててください。`;
  }
  return `オリジナル景品「${item.itemLabel}」にファイルが割り当てられていません。ユーザーごとの「オリジナル景品設定」からファイルを割り当ててください。`;
}

export function HistoryEntriesList({
  entries,
  userName,
  gachaName,
  executedAtFormatter,
  numberFormatter,
  itemMetadata,
  shareHandlers
}: HistoryEntriesListProps): JSX.Element {
  const { push } = useModal();

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const entryKey = entry.id ?? `${entry.executedAt ?? 'unknown'}-${index}`;
        const executedAtLabel = formatExecutedAt(executedAtFormatter, entry.executedAt);
        const sourceLabel = SOURCE_LABELS[entry.source] ?? '不明なソース';
        const statusLabel = getPullHistoryStatusLabel(entry.status, {
          hasOriginalPrizeMissing: entry.hasOriginalPrizeMissing
        });
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

        const newItemSet = new Set(entry.newItems ?? []);

        const assignedCounts = new Map<string, number>();
        Object.entries(entry.originalPrizeAssignments ?? {}).forEach(([itemId, assignments]) => {
          if (!itemId || !Array.isArray(assignments)) {
            return;
          }
          const indices = new Set<number>();
          assignments.forEach((assignment) => {
            if (!assignment?.assetId) {
              return;
            }
            const index = Math.trunc(assignment.index);
            if (index < 0) {
              return;
            }
            indices.add(index);
          });
          if (indices.size > 0) {
            assignedCounts.set(itemId, indices.size);
          }
        });

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
            const isOriginalPrize = metadata?.isOriginalPrize === true;
            const assignedCount = isOriginalPrize ? assignedCounts.get(itemId) ?? 0 : 0;
            const missingOriginalPrizeCount = isOriginalPrize ? Math.max(0, count - assignedCount) : 0;
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
              raritySortOrder,
              isNew: count > 0 && newItemSet.has(itemId),
              hasOriginalPrizeMissing: isOriginalPrize && missingOriginalPrizeCount > 0,
              missingOriginalPrizeCount
            } satisfies ItemEntryViewModel;
          })
          .filter((value): value is ItemEntryViewModel => value !== null)
          .sort((a, b) => {
            if (a.raritySortOrder !== b.raritySortOrder) {
              return b.raritySortOrder - a.raritySortOrder;
            }
            return a.itemLabel.localeCompare(b.itemLabel, 'ja');
          });

        const positiveItemLines = itemEntries
          .filter((item) => item.count > 0)
          .map((item) => {
            const rarityLabel = item.rarityLabel ?? '景品';
            const countLabel = `${numberFormatter.format(item.count)}個`;
            return `【${rarityLabel}】${item.itemLabel}：${countLabel}`;
          });

        const shareLines = [`【${gachaName}結果】`, `${userName} ${pullCountLabel}`, ''];
        if (positiveItemLines.length > 0) {
          shareLines.push(...positiveItemLines, '');
        }
        shareLines.push('#四遊楽ガチャ(β)');
        const shareText = shareLines.join('\n');

        const urlParams = new URLSearchParams();
        urlParams.set('button_hashtag', '四遊楽ガチャ');
        urlParams.set('ref_src', 'twsrc%5Etfw');
        urlParams.set('text', shareText);
        const tweetUrl = `https://twitter.com/intent/tweet?${urlParams.toString()}`;

        const currentFeedback = shareHandlers.feedback?.entryKey === entryKey ? shareHandlers.feedback.status : null;

        return (
          <article key={entryKey} className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast p-4">
            <header className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-surface-foreground">{executedAtLabel}</span>
                  {statusLabel ? <span className="text-[11px] text-muted-foreground">{statusLabel}</span> : null}
                </div>
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
                          className={clsx('inventory-history-dialog__rarity-badge__label', item.rarityTextClassName)}
                          style={item.rarityTextStyle}
                        >
                          {item.rarityLabel}
                        </span>
                      </span>
                    ) : null}
                    <span className="flex-1 font-medium">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{item.itemLabel}</span>
                        {item.isNew ? (
                          <span className="inline-flex h-5 items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-semibold leading-none text-emerald-700">
                            new
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {item.hasOriginalPrizeMissing ? (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-500 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                          onClick={() => {
                            push(WarningDialog, {
                              id: `original-prize-warning-${item.itemId}`,
                              title: 'オリジナル景品の警告',
                              size: 'sm',
                              payload: {
                                message: formatOriginalPrizeWarningMessage(item),
                                confirmLabel: '閉じる'
                              }
                            });
                          }}
                          aria-label={`オリジナル景品「${item.itemLabel}」の警告を表示`}
                          title="オリジナル景品の警告を表示"
                        >
                          <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                      <span
                        className={clsx(
                          'font-mono text-sm',
                          item.count < 0 ? 'text-red-500' : 'text-surface-foreground'
                        )}
                      >
                        {formatCount(numberFormatter, item.count)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">アイテムの記録がありません。</p>
            )}
            <footer className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              <div className={clsx('flex w-full flex-wrap items-center gap-2', currencyUsedLabel ? 'justify-between' : 'justify-end')}>
                {currencyUsedLabel ? <span>消費リソース: {currencyUsedLabel}</span> : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-muted aspect-square h-8 w-8 p-1.5 !min-h-0"
                    onClick={() => {
                      void shareHandlers.share(entryKey, shareText);
                    }}
                    title="結果を共有"
                    aria-label="結果を共有"
                  >
                    <ShareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">結果を共有</span>
                  </button>
                  <a
                    href={tweetUrl}
                    className="btn aspect-square h-8 w-8 border-none bg-[#000000] p-1.5 text-white transition hover:bg-[#111111] focus-visible:ring-2 focus-visible:ring-white/70 !min-h-0"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Xで共有"
                    aria-label="Xで共有"
                  >
                    <XLogoIcon aria-hidden className="h-3.5 w-3.5" />
                    <span className="sr-only">Xで共有</span>
                  </a>
                  <button
                    type="button"
                    className="btn btn-muted aspect-square h-8 w-8 p-1.5 !min-h-0"
                    onClick={() => {
                      void shareHandlers.copy(entryKey, shareText);
                    }}
                    title="結果をコピー"
                    aria-label="結果をコピー"
                  >
                    <ClipboardIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">結果をコピー</span>
                  </button>
                </div>
              </div>
              {currentFeedback === 'shared' ? (
                <span className="text-[11px] text-muted-foreground">共有を開始しました</span>
              ) : null}
              {currentFeedback === 'copied' ? (
                <span className="text-[11px] text-muted-foreground">共有テキストをコピーしました</span>
              ) : null}
              {currentFeedback === 'error' ? (
                <span className="text-[11px] text-red-500">共有に失敗しました</span>
              ) : null}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
