import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import {
  type PullHistoryEntrySourceV1,
  type PullHistoryEntryV1
} from '@domain/app-persistence';
import { useStoreValue } from '@domain/stores';
import { type ShareHandler } from '../../../hooks/useShare';
import { useAppPersistence, useDomainStores } from '../../../features/storage/AppPersistenceProvider';
import { buildAndUploadSelectionZip } from '../../../features/save/buildAndUploadSelectionZip';
import {
  extractBlobUploadCsrfFailureReason,
  isBlobUploadCsrfTokenMismatchError,
  useBlobUpload
} from '../../../features/save/useBlobUpload';
import { useDiscordSession } from '../../../features/discord/useDiscordSession';
import {
  DiscordGuildSelectionMissingError,
  requireDiscordGuildSelection
} from '../../../features/discord/discordGuildSelectionStorage';
import { sendDiscordShareToMember } from '../../../features/discord/sendDiscordShareToMember';
import {
  buildDiscordShareComment,
  formatDiscordShareExpiresAt
} from '../../../features/discord/shareMessage';
import { linkDiscordProfileToStore } from '../../../features/discord/linkDiscordProfileToStore';
import { resolveThumbnailOwnerId } from '../../../features/gacha/thumbnailOwnerId';
import { useNotification } from '../../../features/notification';
import { getPullHistoryStatusLabel } from '@domain/pullHistoryStatusLabels';
import { RarityLabel } from '../../../components/RarityLabel';
import { resolveSafeUrl } from '../../../utils/safeUrl';
import { ConfirmDialog } from '../../ConfirmDialog';
import { useModal } from '../../ModalProvider';
import { QuickSendConfirmDialog } from '../QuickSendConfirmDialog';
import { PageSettingsDialog } from '../PageSettingsDialog';
import { buildPageSettingsDialogProps } from '../pageSettingsDialogConfig';
import { ResultActionButtons } from '../ResultActionButtons';
import { WarningDialog } from '../WarningDialog';
import { pushCsrfTokenMismatchWarning } from '../_lib/discordApiErrorHandling';
import { type HistoryItemMetadata, normalizeHistoryUserId } from './historyUtils';

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

type HistoryDiscordDeliveryStage = 'idle' | 'building-zip' | 'uploading' | 'sending';

interface HistoryDiscordDeliveryProgress {
  entryKey: string;
  stage: HistoryDiscordDeliveryStage;
}

interface QuickSendDecision {
  sendNewOnly: boolean;
  rememberChoice: boolean;
}

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

function resolveTrimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveQuickSendButtonLabel(params: {
  activeDelivery: HistoryDiscordDeliveryProgress | null;
  completedEntryKey: string | null;
  entryKey: string;
}): string {
  const { activeDelivery, completedEntryKey, entryKey } = params;

  if (activeDelivery?.entryKey === entryKey) {
    switch (activeDelivery.stage) {
      case 'building-zip':
        return 'ZIPファイル作成中...';
      case 'uploading':
        return 'ファイルアップロード中...';
      case 'sending':
        return '送信中...';
      default:
        return 'お渡し部屋に景品を送信';
    }
  }

  if (completedEntryKey === entryKey) {
    return '送信済み';
  }

  return 'お渡し部屋に景品を送信';
}

interface ItemEntryViewModel {
  itemId: string;
  itemLabel: string;
  count: number;
  rarityLabel?: string;
  rarityColor?: string | null;
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
  showEntryId?: boolean;
}

function formatOriginalPrizeWarningMessage(item: ItemEntryViewModel): string {
  if (item.missingOriginalPrizeCount > 1) {
    return `オリジナル景品「${item.itemLabel}」のうち${item.missingOriginalPrizeCount}件分にファイルが割り当てられていません。ユーザーごとの「オリジナル景品設定」からファイルを割り当ててください。`;
  }
  return `オリジナル景品「${item.itemLabel}」にファイルが割り当てられていません。ユーザーごとの「オリジナル景品設定」からファイルを割り当ててください。`;
}

/**
 * ガチャ履歴のエントリー一覧を描画する。
 * 履歴カード内では、共有・X投稿・コピー・クイック送信アクションを共通UIで提供する。
 *
 * @param entries 表示対象の履歴エントリー配列
 * @param userName 履歴表示上のユーザー名
 * @param gachaName 履歴表示上のガチャ名
 * @param executedAtFormatter 実行日時フォーマッター
 * @param numberFormatter 数値フォーマッター
 * @param itemMetadata アイテム表示メタデータ
 * @param shareHandlers 共有/コピー処理ハンドラー
 * @param showEntryId 履歴カード右上の ID 表示有無
 * @returns 履歴一覧要素
 */
export function HistoryEntriesList({
  entries,
  userName,
  gachaName,
  executedAtFormatter,
  numberFormatter,
  itemMetadata,
  shareHandlers,
  showEntryId = true
}: HistoryEntriesListProps): JSX.Element {
  const { push } = useModal();
  const { notify } = useNotification();
  const {
    pullHistory: pullHistoryStore,
    userProfiles: userProfilesStore,
    uiPreferences: uiPreferencesStore
  } = useDomainStores();
  const userProfilesState = useStoreValue(userProfilesStore);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const { uploadZip } = useBlobUpload();
  const { data: discordSession } = useDiscordSession();
  const persistence = useAppPersistence();

  const [activeDelivery, setActiveDelivery] = useState<HistoryDiscordDeliveryProgress | null>(null);
  const [completedDeliveryEntryKey, setCompletedDeliveryEntryKey] = useState<string | null>(null);

  const quickSendNewOnlyPreference = useMemo(
    () => uiPreferencesStore.getQuickSendNewOnlyPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const excludeRiaguImagesPreference = useMemo(
    () => uiPreferencesStore.getExcludeRiaguImagesPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const excludeRiaguImages = excludeRiaguImagesPreference ?? false;

  const isDiscordLoggedIn = discordSession?.loggedIn === true;
  const staffDiscordId = discordSession?.user?.id ?? null;
  const staffDiscordName = discordSession?.user?.name ?? null;

  const resolveOwnerName = useCallback(() => {
    const prefs = persistence.loadSnapshot().receivePrefs;
    return prefs?.ownerName?.trim() ?? '';
  }, [persistence]);

  const ensureOwnerName = useCallback(() => {
    const ownerName = resolveOwnerName();
    if (ownerName) {
      return ownerName;
    }
    push(ConfirmDialog, {
      id: 'owner-name-warning-history-entry',
      title: 'オーナー名の設定',
      size: 'sm',
      payload: {
        message: 'オーナー名が未設定です。共有リンクを作成する前にサイト設定でオーナー名を設定してください。',
        confirmLabel: '設定を開く',
        cancelLabel: '閉じる',
        onConfirm: () => {
          push(
            PageSettingsDialog,
            buildPageSettingsDialogProps({
              payload: {
                focusTarget: 'misc-owner-name',
                highlightMode: 'pulse',
                highlightDurationMs: 7000,
                origin: 'history-entry-owner-name-warning'
              }
            })
          );
        }
      }
    });
    return null;
  }, [push, resolveOwnerName]);

  const requestQuickSendPreference = useCallback(() => {
    return new Promise<QuickSendDecision | null>((resolve) => {
      let settled = false;
      const finalize = (value: QuickSendDecision | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      push(QuickSendConfirmDialog, {
        id: 'quick-send-confirm-history-entry',
        title: '送信対象の確認',
        size: 'sm',
        panelClassName: 'overflow-hidden',
        payload: {
          onConfirm: (result) => finalize(result)
        },
        onClose: () => finalize(null)
      });
    });
  }, [push]);

  const resolveQuickSendNewOnly = useCallback(async () => {
    if (quickSendNewOnlyPreference !== null) {
      return quickSendNewOnlyPreference;
    }
    const decision = await requestQuickSendPreference();
    if (!decision) {
      return null;
    }
    if (decision.rememberChoice) {
      uiPreferencesStore.setQuickSendNewOnlyPreference(decision.sendNewOnly, {
        persist: 'immediate'
      });
    }
    return decision.sendNewOnly;
  }, [quickSendNewOnlyPreference, requestQuickSendPreference, uiPreferencesStore]);

  const handleQuickSend = useCallback(
    async ({
      entry,
      entryKey,
      newItemIds,
      positiveItemIds
    }: {
      entry: PullHistoryEntryV1;
      entryKey: string;
      newItemIds: string[];
      positiveItemIds: string[];
    }) => {
      if (activeDelivery) {
        return;
      }

      const pullId = resolveTrimmedOrNull(entry.id);
      if (!pullId) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: '共有する履歴が見つかりませんでした。'
        });
        return;
      }
      if (positiveItemIds.length === 0) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: '共有できるガチャ結果がありません。'
        });
        return;
      }

      if (!isDiscordLoggedIn) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: 'Discordにログインしてから共有してください。'
        });
        return;
      }
      if (!staffDiscordId) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: 'Discordアカウントの情報を取得できませんでした。再度ログインしてください。'
        });
        return;
      }

      const quickSendNewOnly = await resolveQuickSendNewOnly();
      if (quickSendNewOnly === null) {
        return;
      }

      if (quickSendNewOnly && newItemIds.length === 0) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: '新規取得した景品がありません。'
        });
        return;
      }

      const normalizedTargetUserId = normalizeHistoryUserId(entry.userId);
      const profile = userProfilesState?.users?.[normalizedTargetUserId];
      const linkedDiscordUserId = resolveTrimmedOrNull(profile?.discordUserId);

      if (!linkedDiscordUserId) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: 'ユーザーのDiscord連携情報が見つかりません。ユーザーカードからDiscord連携を設定してください。'
        });
        return;
      }

      const ownerName = ensureOwnerName();
      if (!ownerName) {
        return;
      }

      const resolvedOwnerId = resolveThumbnailOwnerId(staffDiscordId);
      if (!resolvedOwnerId) {
        notify({
          variant: 'error',
          title: 'エラー',
          message: '配信サムネイルownerIdを解決できませんでした。'
        });
        return;
      }

      let guildSelection;
      try {
        guildSelection = requireDiscordGuildSelection(staffDiscordId);
      } catch (error) {
        const message =
          error instanceof DiscordGuildSelectionMissingError
            ? error.message
            : 'お渡しチャンネルのカテゴリが設定されていません。Discord共有設定を確認してください。';
        notify({
          variant: 'error',
          title: 'エラー',
          message
        });
        return;
      }

      const filteredItemIds = quickSendNewOnly ? new Set(newItemIds) : undefined;
      const profileDisplayName = resolveTrimmedOrNull(profile?.displayName);
      const receiverDisplayName = profileDisplayName ?? resolveTrimmedOrNull(userName) ?? normalizedTargetUserId;

      setActiveDelivery({ entryKey, stage: 'building-zip' });
      setCompletedDeliveryEntryKey(null);

      try {
        const snapshot = persistence.loadSnapshot();

        let hasShownSlowBlobCheckNotice = false;
        const { zip, uploadResponse } = await buildAndUploadSelectionZip({
          snapshot,
          selection: { mode: 'history', pullIds: [pullId] },
          userId: normalizedTargetUserId,
          userName: receiverDisplayName,
          ownerName,
          ownerId: resolvedOwnerId,
          itemIdFilter: filteredItemIds,
          uploadZip,
          ownerDiscordId: staffDiscordId,
          ownerDiscordName: staffDiscordName ?? undefined,
          onBlobReuploadRetry: () => {
            // Blob実在確認の再試行に入った時だけ、待機案内を一度だけ出す。
            if (hasShownSlowBlobCheckNotice) {
              return;
            }
            hasShownSlowBlobCheckNotice = true;
            notify({
              variant: 'warning',
              message: '想定よりも時間がかかっています。そのままでお待ちください'
            });
          },
          excludeRiaguImages,
          onZipBuilt: () => {
            setActiveDelivery({ entryKey, stage: 'uploading' });
          }
        });

        if (!uploadResponse?.shareUrl) {
          throw new Error('Discord共有に必要なURLを取得できませんでした。');
        }

        if (zip.pullIds.length > 0) {
          pullHistoryStore.markPullStatus(zip.pullIds, 'uploaded');
          pullHistoryStore.markPullOriginalPrizeMissing(zip.pullIds, zip.originalPrizeMissingPullIds);
        }

        const shareUrl = uploadResponse.shareUrl;
        const shareLabelCandidate = shareUrl ?? null;
        const shareTitle = `${receiverDisplayName}のお渡しリンクです`;
        const shareComment = buildDiscordShareComment({
          shareUrl,
          shareLabel: shareLabelCandidate,
          expiresAtText: formatDiscordShareExpiresAt(uploadResponse.expiresAt)
        });

        setActiveDelivery({ entryKey, stage: 'sending' });

        const { channelId, channelName, channelParentId } = await sendDiscordShareToMember({
          push,
          discordUserId: staffDiscordId,
          guildSelection,
          memberId: linkedDiscordUserId,
          channelId: profile?.discordLastShareChannelId,
          channelName: profile?.discordLastShareChannelName,
          channelParentId: profile?.discordLastShareChannelParentId,
          displayNameForChannel:
            resolveTrimmedOrNull(profile?.discordDisplayName) ?? receiverDisplayName,
          shareUrl,
          shareTitle,
          shareComment,
          createChannelIfMissing: true,
          categoryDialogTitle: 'お渡しカテゴリの設定'
        });

        if (zip.pullIds.length > 0) {
          pullHistoryStore.markPullStatus(zip.pullIds, 'discord_shared');
          pullHistoryStore.markPullOriginalPrizeMissing(zip.pullIds, zip.originalPrizeMissingPullIds);
        }

        const sharedAt = new Date().toISOString();
        const resolvedShareUrl = resolveTrimmedOrNull(shareUrl);
        const resolvedShareLabel = resolveTrimmedOrNull(shareLabelCandidate);

        const shareInfo = resolvedShareUrl
          ? {
              channelId,
              channelName: channelName ?? null,
              channelParentId: channelParentId ?? null,
              shareUrl: resolvedShareUrl,
              shareLabel: resolvedShareLabel,
              shareTitle,
              shareComment: shareComment ?? null,
              sharedAt
            }
          : undefined;

        void linkDiscordProfileToStore({
          store: userProfilesStore,
          profileId: normalizedTargetUserId,
          discordUserId: linkedDiscordUserId,
          discordDisplayName: resolveTrimmedOrNull(profile?.discordDisplayName) ?? receiverDisplayName,
          discordUserName: resolveTrimmedOrNull(profile?.discordUserName),
          avatarUrl: resolveTrimmedOrNull(profile?.discordAvatarUrl) ?? undefined,
          share: shareInfo
        });

        setCompletedDeliveryEntryKey(entryKey);
        notify({
          variant: 'success',
          title: '成功',
          message: `${receiverDisplayName}さんに景品を送信しました`
        });
      } catch (error) {
        if (isBlobUploadCsrfTokenMismatchError(error)) {
          pushCsrfTokenMismatchWarning(
            push,
            error instanceof Error ? error.message : undefined,
            extractBlobUploadCsrfFailureReason(error)
          );
        }

        const message =
          error instanceof DiscordGuildSelectionMissingError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);

        notify({
          variant: 'error',
          title: 'エラー',
          message: `Discord共有の送信に失敗しました: ${message}`
        });
      } finally {
        setActiveDelivery(null);
      }
    },
    [
      activeDelivery,
      ensureOwnerName,
      excludeRiaguImages,
      isDiscordLoggedIn,
      notify,
      persistence,
      pullHistoryStore,
      push,
      quickSendNewOnlyPreference,
      resolveQuickSendNewOnly,
      staffDiscordId,
      staffDiscordName,
      uploadZip,
      userName,
      userProfilesState,
      userProfilesStore
    ]
  );

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const entryKey = entry.id ?? `${entry.executedAt ?? 'unknown'}-${index}`;
        const executedAtLabel = formatExecutedAt(executedAtFormatter, entry.executedAt);
        const sourceLabel = SOURCE_LABELS[entry.source] ?? '不明なソース';
        const statusLabel = getPullHistoryStatusLabel(entry.status, {
          hasOriginalPrizeMissing: entry.hasOriginalPrizeMissing
        });
        const sourceClassName =
          SOURCE_CLASSNAMES[entry.source] ??
          'border-border/60 bg-panel-muted text-muted-foreground';
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
        Object.entries(entry.originalPrizeAssignments ?? {}).forEach(
          ([itemId, assignments]) => {
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
          }
        );

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
            const missingOriginalPrizeCount = isOriginalPrize
              ? Math.max(0, count - assignedCount)
              : 0;

            return {
              itemId,
              count,
              itemLabel: metadata?.name ?? itemId,
              rarityLabel,
              rarityColor: typeof rarityColor === 'string' ? rarityColor : null,
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

        const positiveItemEntries = itemEntries.filter((item) => item.count > 0);
        const positiveItemLines = positiveItemEntries.map((item) => {
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
        const safeTweetUrl = resolveSafeUrl(tweetUrl, {
          allowedProtocols: ['https:']
        });

        const currentFeedback =
          shareHandlers.feedback?.entryKey === entryKey
            ? shareHandlers.feedback.status
            : null;

        const isEntryDeliveryInProgress = activeDelivery?.entryKey === entryKey;
        const isAnyEntryDeliveryInProgress = activeDelivery !== null;
        const quickSendDisabled = isAnyEntryDeliveryInProgress;

        const quickSendButtonLabel = resolveQuickSendButtonLabel({
          activeDelivery,
          completedEntryKey: completedDeliveryEntryKey,
          entryKey
        });

        const positiveItemIds = positiveItemEntries.map((item) => item.itemId);
        const newItemIds = positiveItemEntries
          .filter((item) => item.isNew)
          .map((item) => item.itemId);

        return (
          <article
            key={entryKey}
            className="space-y-3 rounded-2xl border border-border/60 bg-panel-contrast p-4"
          >
            <header className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-surface-foreground">{executedAtLabel}</span>
                  {statusLabel ? (
                    <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
                  ) : null}
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
                {showEntryId && entry.id ? (
                  <span className="font-mono text-[11px] text-muted-foreground/80">
                    ID: {entry.id}
                  </span>
                ) : null}
              </div>
            </header>
            {itemEntries.length > 0 ? (
              <div className="space-y-2">
                {itemEntries.map((item) => (
                  <div
                    key={item.itemId}
                    className="flex items-center gap-3 text-sm text-surface-foreground"
                  >
                    {item.rarityLabel ? (
                      <span className="inline-flex min-w-[3rem] items-center text-[11px] font-medium text-surface-foreground">
                        <RarityLabel label={item.rarityLabel} color={item.rarityColor} />
                      </span>
                    ) : null}
                    <span className="flex-1 min-w-0 overflow-hidden font-medium">
                      <span className="inline-flex w-full min-w-0 items-center gap-2">
                        <span className="block min-w-0 flex-1 truncate">{item.itemLabel}</span>
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
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-amber-500 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
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
              <div
                className={clsx(
                  'flex w-full flex-wrap items-center gap-2',
                  currencyUsedLabel ? 'justify-between' : 'justify-end'
                )}
              >
                {currencyUsedLabel ? <span>消費リソース: {currencyUsedLabel}</span> : null}
                <ResultActionButtons
                  className="history-entries-list__actions"
                  onShare={() => {
                    void shareHandlers.share(entryKey, shareText);
                  }}
                  onCopy={() => {
                    void shareHandlers.copy(entryKey, shareText);
                  }}
                  tweetUrl={safeTweetUrl}
                  quickSend={
                    isDiscordLoggedIn
                      ? {
                          onClick: () => {
                            void handleQuickSend({
                              entry,
                              entryKey,
                              positiveItemIds,
                              newItemIds
                            });
                          },
                          disabled: quickSendDisabled,
                          inProgress: isEntryDeliveryInProgress,
                          label: quickSendButtonLabel,
                          minWidth: '14.5rem'
                        }
                      : undefined
                  }
                />
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
