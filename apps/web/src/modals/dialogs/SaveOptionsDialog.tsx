import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  FolderArrowDownIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GachaLocalStorageSnapshot, PullHistoryEntryV1 } from '@domain/app-persistence';
import { getPullHistoryStatusLabel } from '@domain/pullHistoryStatusLabels';
import { RarityLabel } from '../../components/RarityLabel';

import { useStoreValue } from '@domain/stores';
import {
  buildZipSelectionPlan,
  buildUserZipFromSelection,
  findOriginalPrizeMissingItems,
  type OriginalPrizeMissingItem,
  type ZipSelectedAsset
} from '../../features/save/buildUserZip';
import {
  extractBlobUploadCsrfFailureReason,
  isBlobUploadCsrfTokenMismatchError,
  useBlobUpload
} from '../../features/save/useBlobUpload';
import type { SaveTargetSelection } from '../../features/save/types';
import { useDiscordSession } from '../../features/discord/useDiscordSession';
import {
  DiscordGuildSelectionMissingError,
  requireDiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';
import { sendDiscordShareToMember } from '../../features/discord/sendDiscordShareToMember';
import { buildDiscordShareComment, formatDiscordShareExpiresAt } from '../../features/discord/shareMessage';
import { useAppPersistence, useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useNotification } from '../../features/notification';
import { ConfirmDialog, ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { PageSettingsDialog } from './PageSettingsDialog';
import { buildPageSettingsDialogProps } from './pageSettingsDialogConfig';
import { openDiscordShareDialog } from '../../features/discord/openDiscordShareDialog';
import { linkDiscordProfileToStore } from '../../features/discord/linkDiscordProfileToStore';
import { pushCsrfTokenMismatchWarning } from './_lib/discordApiErrorHandling';
import { resolveSafeUrl } from '../../utils/safeUrl';
import { issueShareUrlByUpload } from '../../features/save/issueShareUrlByUpload';
import {
  applyLegacyAssetsToInstances,
  alignOriginalPrizeInstances,
  buildOriginalPrizeInstanceMap
} from '@domain/originalPrize';
import { OriginalPrizeSettingsDialog, type OriginalPrizeSettingsDialogPayload } from './OriginalPrizeSettingsDialog';

export interface SaveOptionsUploadResult {
  url: string;
  label?: string;
  expiresAt?: string;
}

export interface SaveOptionsDialogPayload {
  userId: string;
  userName: string;
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
}

interface LastDownloadState {
  fileName: string;
  fileCount: number;
  warnings: string[];
  savedAt: string;
}

function formatExpiresAt(value?: string): string | undefined {
  const formatted = formatDiscordShareExpiresAt(value);
  return formatted ?? undefined;
}

function formatHistoryEntry(entry: PullHistoryEntryV1 | undefined, gachaName: string): string {
  if (!entry) {
    return `${gachaName}: 履歴情報なし`;
  }
  const executedAt = formatExpiresAt(entry.executedAt) ?? '日時不明';
  const pullCount = Number.isFinite(entry.pullCount) ? `${entry.pullCount}連` : '回数不明';
  const statusLabel = getPullHistoryStatusLabel(entry.status, {
    hasOriginalPrizeMissing: entry.hasOriginalPrizeMissing
  });
  return `${executedAt} / ${gachaName} (${pullCount})${statusLabel ? ` / ${statusLabel}` : ''}`;
}

function formatMissingOriginalPrizeMessage(items: OriginalPrizeMissingItem[]): string {
  const uniqueNames = Array.from(new Set(items.map((item) => item.itemName || item.itemId)));
  const itemCount = uniqueNames.length;
  const previewNames = uniqueNames.slice(0, 3).map((name) => `「${name}」`).join('、');
  const suffix = uniqueNames.length > 3 ? `など${uniqueNames.length}件` : '';
  const countLabel = itemCount === 1 ? '1つの景品' : `${itemCount}つの景品`;
  const previewLabel = previewNames ? `対象: ${previewNames}${suffix}。` : '';
  return `オリジナル景品のうち${countLabel}にファイルが割り当てられていません。${previewLabel}後で設定するか、今設定をしてください。`;
}

export function SaveOptionsDialog({ payload, close, push }: ModalComponentProps<SaveOptionsDialogPayload>): JSX.Element {
  const { userId, userName, snapshot, selection } = payload;
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDiscordSharing, setIsDiscordSharing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<LastDownloadState | null>(null);
  const { notify } = useNotification();

  const { uploadZip } = useBlobUpload();
  const persistence = useAppPersistence();
  const {
    userProfiles: userProfilesStore,
    pullHistory: pullHistoryStore,
    uiPreferences: uiPreferencesStore,
    userInventories: userInventoriesStore
  } = useDomainStores();
  const userProfilesState = useStoreValue(userProfilesStore);
  const userInventoriesState = useStoreValue(userInventoriesStore);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const excludeRiaguImagesPreference = useMemo(
    () => uiPreferencesStore.getExcludeRiaguImagesPreference(),
    [uiPreferencesState, uiPreferencesStore]
  );
  const excludeRiaguImages = excludeRiaguImagesPreference ?? false;
  const { data: discordSession } = useDiscordSession();
  const discordUserId = discordSession?.user?.id;

  const resolvePullIdsForStatus = useCallback(
    (zipPullIds: string[]): string[] => {
      if (selection.mode !== 'history') {
        return zipPullIds;
      }
      const merged = new Set<string>(selection.pullIds);
      zipPullIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    },
    [selection]
  );

  const receiverDisplayName = useMemo(() => {
    const profileName = snapshot.userProfiles?.users?.[userId]?.displayName;
    const candidates = [profileName, userName, userId];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return userId;
  }, [snapshot.userProfiles?.users, userId, userName]);

  const buildOriginalPrizeSettingsPayload = useCallback(
    (gachaId: string | undefined): OriginalPrizeSettingsDialogPayload | null => {
      if (!gachaId) {
        return null;
      }
      const inventoriesForUser = snapshot.userInventories?.inventories?.[userId];
      if (!inventoriesForUser) {
        return null;
      }
      const inventory = Object.values(inventoriesForUser).find((entry) => entry?.gachaId === gachaId);
      if (!inventory) {
        return null;
      }

      const catalogSnapshot = snapshot.catalogState?.byGacha?.[gachaId];
      const rarityEntities = snapshot.rarityState?.entities ?? {};
      const itemsByRarity = inventory.items ?? {};
      const countsByRarity = inventory.counts ?? {};
      const legacyAssetsByItem = inventory.originalPrizeAssets ?? {};

      const originalItemIds = new Set<string>();
      const itemCounts = new Map<string, { count: number; rarityId: string }>();

      Object.entries(itemsByRarity).forEach(([rarityId, itemIds]) => {
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
          return;
        }

        const fallbackCounts = new Map<string, number>();
        itemIds.forEach((itemId) => {
          fallbackCounts.set(itemId, (fallbackCounts.get(itemId) ?? 0) + 1);
        });

        Array.from(fallbackCounts.keys()).forEach((itemId) => {
          const catalogItem = catalogSnapshot?.items?.[itemId];
          if (!catalogItem?.originalPrize) {
            return;
          }
          const explicitCount = countsByRarity[rarityId]?.[itemId];
          const totalCount = typeof explicitCount === 'number' && explicitCount > 0
            ? explicitCount
            : fallbackCounts.get(itemId) ?? 0;
          if (totalCount <= 0) {
            return;
          }
          originalItemIds.add(itemId);
          itemCounts.set(itemId, { count: totalCount, rarityId });
        });
      });

      if (originalItemIds.size === 0) {
        return null;
      }

      const instanceMap = buildOriginalPrizeInstanceMap({
        pullHistory: pullHistoryStore.getState() ?? snapshot.pullHistory,
        userId,
        gachaId,
        targetItemIds: originalItemIds
      });

      const items: OriginalPrizeSettingsDialogPayload['items'] = [];
      originalItemIds.forEach((itemId) => {
        const meta = itemCounts.get(itemId);
        if (!meta) {
          return;
        }
        const catalogItem = catalogSnapshot?.items?.[itemId];
        const totalCount = meta.count;
        const baseInstances = instanceMap[itemId] ?? [];
        const alignedInstances = alignOriginalPrizeInstances(baseInstances, totalCount, itemId);
        const instances = applyLegacyAssetsToInstances(alignedInstances, legacyAssetsByItem[itemId]);

        items.push({
          itemId,
          itemName: catalogItem?.name ?? itemId,
          rarityLabel: rarityEntities[meta.rarityId]?.label ?? meta.rarityId ?? '未分類',
          count: totalCount,
          instances
        });
      });

      items.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ja'));

      return {
        userId,
        userName: receiverDisplayName,
        inventoryId: inventory.inventoryId,
        gachaId,
        gachaName: snapshot.appState?.meta?.[gachaId]?.displayName ?? gachaId,
        items
      };
    },
    [pullHistoryStore, receiverDisplayName, snapshot, userId]
  );

  const resolveZipSnapshot = useCallback(() => {
    const latestPullHistory = pullHistoryStore.getState();
    const latestUserInventories = userInventoriesStore.getState();
    if (latestPullHistory || latestUserInventories) {
      return {
        ...snapshot,
        ...(latestPullHistory ? { pullHistory: latestPullHistory } : {}),
        ...(latestUserInventories ? { userInventories: latestUserInventories } : {})
      };
    }
    return snapshot;
  }, [pullHistoryStore, snapshot, userInventoriesStore]);

  const openOriginalPrizeSettings = useCallback(
    (items: OriginalPrizeMissingItem[]) => {
      const target = items[0];
      if (!target) {
        return;
      }
      const payload = buildOriginalPrizeSettingsPayload(target.gachaId);
      if (!payload) {
        return;
      }
      push(OriginalPrizeSettingsDialog, {
        id: `original-prize-settings-${payload.inventoryId}`,
        title: 'オリジナル景品設定',
        description: 'ユーザーごとのオリジナル景品ファイルを割り当てます。',
        size: 'lg',
        payload
      });
    },
    [buildOriginalPrizeSettingsPayload, push]
  );

  const maybeWarnMissingOriginalPrize = useCallback(
    (onProceed: () => void) => {
      const missingItems = findOriginalPrizeMissingItems({
        snapshot: resolveZipSnapshot(),
        selection,
        userId
      });
      if (missingItems.length === 0) {
        onProceed();
        return;
      }

      push(ConfirmDialog, {
        id: `original-prize-warning-${userId}`,
        title: 'オリジナル景品の警告',
        payload: {
          message: formatMissingOriginalPrizeMessage(missingItems),
          confirmLabel: '今すぐ設定する',
          cancelLabel: '後で設定する',
          onConfirm: () => openOriginalPrizeSettings(missingItems),
          onCancel: onProceed
        }
      });
    },
    [openOriginalPrizeSettings, push, resolveZipSnapshot, selection, userId]
  );

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
      id: 'owner-name-warning',
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
                origin: 'save-options-owner-name-warning'
              }
            })
          );
        }
      }
    });
    return null;
  }, [push, resolveOwnerName]);
  const linkDiscordProfile = useCallback(
    (params: {
      discordUserId: string;
      discordDisplayName?: string | null;
      discordUserName?: string | null;
      avatarUrl?: string | null;
      share?: {
        channelId?: string;
        channelName?: string | null;
        channelParentId?: string | null;
        shareUrl?: string;
        shareLabel?: string | null;
        shareTitle?: string | null;
        shareComment?: string | null;
        sharedAt?: string;
      };
    }) =>
      linkDiscordProfileToStore({
        store: userProfilesStore,
        profileId: userId,
        discordUserId: params.discordUserId,
        discordDisplayName: params.discordDisplayName ?? receiverDisplayName,
        discordUserName: params.discordUserName,
        avatarUrl: params.avatarUrl,
        share: params.share
      }),
    [receiverDisplayName, userId, userProfilesStore]
  );

  const storedUpload: SaveOptionsUploadResult | null = useMemo(() => {
    const saved = snapshot.saveOptions?.[userId];
    if (!saved) {
      return null;
    }
    const url = saved.shareUrl ?? saved.downloadUrl;
    if (!url) {
      return null;
    }
    return {
      url,
      label: saved.shareUrl ?? url,
      expiresAt: formatExpiresAt(saved.expiresAt)
    };
  }, [snapshot.saveOptions, userId]);

  const [uploadResult, setUploadResult] = useState<SaveOptionsUploadResult | null>(storedUpload);

  useEffect(() => {
    setUploadResult(storedUpload);
  }, [storedUpload]);

  useEffect(() => {
    setCopied(false);
  }, [uploadResult?.url]);

  const safeUploadUrl = useMemo(
    () => resolveSafeUrl(uploadResult?.url, { allowedProtocols: ['http:', 'https:'] }),
    [uploadResult?.url]
  );

  const gachaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(snapshot.appState?.meta ?? {}).forEach(([gachaId, meta]) => {
      if (gachaId) {
        map.set(gachaId, meta.displayName ?? gachaId);
      }
    });
    return map;
  }, [snapshot.appState?.meta]);

  const selectionSummary = useMemo(() => {
    const buildSections = (assets: ZipSelectedAsset[]) => {
      const sections = new Map<
        string,
        {
          gachaId: string;
          gachaName: string;
          items: Map<
            string,
            {
              count: number;
              rarityLabel: string;
              rarityColor: string | null;
              itemName: string;
              flagsLabel: string;
            }
          >;
        }
      >();

      assets.forEach((asset) => {
        const gachaId = asset.gachaId ?? 'unknown';
        const gachaName = gachaNameMap.get(gachaId) ?? asset.gachaName ?? gachaId;
        const catalogItem = snapshot.catalogState?.byGacha?.[gachaId]?.items?.[asset.itemId];
        const rarityId = catalogItem?.rarityId ?? asset.rarityId ?? '未分類';
        const rarityEntity = snapshot.rarityState?.entities?.[rarityId];
        const rarityLabel = rarityEntity?.label ?? rarityId;
        const rarityColor = rarityEntity?.color ?? null;
        const itemName = catalogItem?.name ?? asset.itemName ?? asset.itemId;

        const flags: string[] = [];
        if (catalogItem?.riagu) {
          flags.push('リアグ');
        }
        if (catalogItem?.originalPrize) {
          flags.push('オリジナル景品');
        }

        const flagsLabel = flags.length > 0 ? `（${flags.join('・')}）` : '';

        const section = sections.get(gachaId) ?? {
          gachaId,
          gachaName,
          items: new Map<string, { count: number; line: string }>()
        };

        const itemKey = `${rarityLabel}:${itemName}:${flagsLabel}`;
        const existing = section.items.get(itemKey);
        if (existing) {
          existing.count += 1;
        } else {
          section.items.set(itemKey, { count: 1, rarityLabel, rarityColor, itemName, flagsLabel });
        }

        sections.set(gachaId, section);
      });

      return Array.from(sections.values())
        .sort((a, b) => a.gachaName.localeCompare(b.gachaName, 'ja'))
        .map((section) => {
        const items = Array.from(section.items.values()).sort((a, b) => {
          if (a.rarityLabel !== b.rarityLabel) {
            return a.rarityLabel.localeCompare(b.rarityLabel, 'ja');
          }
          return a.itemName.localeCompare(b.itemName, 'ja');
        });
        return { gachaName: section.gachaName, items };
      });
    };

    if (selection.mode === 'all' || selection.mode === 'gacha') {
      const plan = buildZipSelectionPlan({
        snapshot: resolveZipSnapshot(),
        selection,
        userId,
        userName: receiverDisplayName,
        includeMetadata: true,
        excludeRiaguImages
      });

      return {
        sections: buildSections(plan.assets),
        details: []
      };
    }
    const history = snapshot.pullHistory?.pulls ?? {};
    const details = selection.pullIds.map((pullId) => {
      const entry = history[pullId];
      const gachaName = entry?.gachaId ? gachaNameMap.get(entry.gachaId) ?? entry.gachaId : 'ガチャ不明';
      return formatHistoryEntry(entry, gachaName);
    });
    return {
      description: `選択した履歴 ${selection.pullIds.length} 件に含まれる景品を保存します。`,
      sections: [],
      details
    };
  }, [
    excludeRiaguImages,
    gachaNameMap,
    receiverDisplayName,
    resolveZipSnapshot,
    selection,
    snapshot.catalogState?.byGacha,
    snapshot.pullHistory?.pulls,
    snapshot.rarityState?.entities,
    userId,
    userInventoriesState
  ]);

  const handleCopyUrl = async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (error) {
      console.warn('クリップボードへのコピーに失敗しました', error);
    }
  };

  const runSaveToDevice = async () => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const result = await buildUserZipFromSelection({
        snapshot: resolveZipSnapshot(),
        selection,
        userId,
        userName: receiverDisplayName,
        includeMetadata: false,
        excludeRiaguImages
      });

      const pullIdsForStatus = resolvePullIdsForStatus(result.pullIds);
      if (pullIdsForStatus.length > 0) {
        pullHistoryStore.markPullStatus(pullIdsForStatus, 'ziped');
        pullHistoryStore.markPullOriginalPrizeMissing(
          pullIdsForStatus,
          result.originalPrizeMissingPullIds
        );
      }

      const blobUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(blobUrl);

      setLastDownload({
        fileName: result.fileName,
        fileCount: result.fileCount,
        warnings: result.warnings,
        savedAt: new Date().toISOString()
      });
      if (result.warnings.length > 0) {
        notify({
          variant: 'warning',
          title: '保存は完了しました',
          message: `端末への保存は完了しましたが、警告が${result.warnings.length}件あります。`
        });
      } else {
        notify({
          variant: 'success',
          message: '端末への保存が完了しました'
        });
      }
    } catch (error) {
      console.error('ZIPの作成に失敗しました', error);
      const message = error instanceof Error ? error.message : String(error);
      setErrorBanner(`ZIPの作成に失敗しました: ${message}`);
      notify({
        variant: 'error',
        title: '保存に失敗しました',
        message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToDevice = () => {
    if (isProcessing) {
      return;
    }
    maybeWarnMissingOriginalPrize(() => {
      void runSaveToDevice();
    });
  };

  const runZipUpload = useCallback(async (ownerName: string) => {
    let hasShownSlowBlobCheckNotice = false;
    const { zip, shareLink } = await issueShareUrlByUpload({
      persistence,
      snapshot: resolveZipSnapshot(),
      selection,
      userId,
      userName: receiverDisplayName,
      ownerName,
      ownerDiscordId: discordSession?.user?.id,
      ownerDiscordName: discordSession?.user?.name,
      uploadZip,
      onBlobReuploadRetry: () => {
        // Blob存在確認に失敗して再アップロードへ移る時だけ、待機継続の案内を一度だけ表示する。
        if (hasShownSlowBlobCheckNotice) {
          return;
        }
        hasShownSlowBlobCheckNotice = true;
        notify({
          variant: 'warning',
          message: '想定よりも時間がかかっています。そのままでお待ちください'
        });
      },
      excludeRiaguImages
    });

    const result: SaveOptionsUploadResult = {
      url: shareLink.url,
      label: shareLink.label,
      expiresAt: shareLink.expiresAt
    };

    setUploadResult(result);

    return { result, zip };
  }, [
    discordSession?.user?.id,
    discordSession?.user?.name,
    persistence,
    receiverDisplayName,
    resolveZipSnapshot,
    selection,
    uploadZip,
    userId,
    excludeRiaguImages,
    notify
  ]);

  const runUploadToShimmy = async (ownerName: string) => {
    if (isProcessing || isUploading || isDiscordSharing) {
      return;
    }
    setIsUploading(true);
    setErrorBanner(null);
    setUploadResult(null);
    persistence.savePartial({
      saveOptions: {
        [userId]: null
      }
    });
    try {
      const { zip } = await runZipUpload(ownerName);

      const pullIdsForStatus = resolvePullIdsForStatus(zip.pullIds);
      if (pullIdsForStatus.length > 0) {
        pullHistoryStore.markPullStatus(pullIdsForStatus, 'ziped');
        pullHistoryStore.markPullOriginalPrizeMissing(
          pullIdsForStatus,
          zip.originalPrizeMissingPullIds
        );
        pullHistoryStore.markPullStatus(pullIdsForStatus, 'uploaded');
        pullHistoryStore.markPullOriginalPrizeMissing(
          pullIdsForStatus,
          zip.originalPrizeMissingPullIds
        );
      }
      notify({
        variant: 'success',
        message: 'アップロードが完了しました'
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.info('ZIPアップロードがユーザーによってキャンセルされました');
        return;
      }
      console.error('ZIPアップロード処理に失敗しました', error);
      if (isBlobUploadCsrfTokenMismatchError(error)) {
        pushCsrfTokenMismatchWarning(
          push,
          error instanceof Error ? error.message : undefined,
          extractBlobUploadCsrfFailureReason(error)
        );
        setErrorBanner(null);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setErrorBanner(`アップロードに失敗しました: ${message}`);
      notify({
        variant: 'error',
        title: 'アップロードに失敗しました',
        message
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadToShimmy = () => {
    if (isProcessing || isUploading || isDiscordSharing) {
      return;
    }
    const ownerName = ensureOwnerName();
    if (!ownerName) {
      return;
    }
    maybeWarnMissingOriginalPrize(() => {
      void runUploadToShimmy(ownerName);
    });
  };

  const isDiscordLoggedIn = discordSession?.loggedIn === true;
  const discordHelperText = isDiscordLoggedIn ? 'Discordに共有' : 'ログインが必要';

  const runShareToDiscord = async (ownerName: string) => {
    setErrorBanner(null);
    if (!isDiscordLoggedIn) {
      setErrorBanner('Discordにログインしてから共有してください。');
      return;
    }
    if (!discordUserId) {
      setErrorBanner('Discordアカウントの情報を取得できませんでした。再度ログインしてください。');
      return;
    }
    if (isProcessing || isUploading || isDiscordSharing) {
      return;
    }
    if (!ownerName) {
      return;
    }

    setIsDiscordSharing(true);
    setUploadResult(null);
    persistence.savePartial({
      saveOptions: {
        [userId]: null
      }
    });

    let uploadData: SaveOptionsUploadResult | null = null;
    let pullIdsForStatus: string[] = [];

    let originalPrizeMissingPullIds: string[] = [];
    try {
      const { result, zip } = await runZipUpload(ownerName);
      uploadData = result;
      pullIdsForStatus = resolvePullIdsForStatus(zip.pullIds);
      originalPrizeMissingPullIds = zip.originalPrizeMissingPullIds;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.info('Discord共有用ZIPアップロードがキャンセルされました');
      } else {
        console.error('Discord共有用ZIPの生成またはアップロードに失敗しました', error);
        if (isBlobUploadCsrfTokenMismatchError(error)) {
          pushCsrfTokenMismatchWarning(
            push,
            error instanceof Error ? error.message : undefined,
            extractBlobUploadCsrfFailureReason(error)
          );
          setErrorBanner(null);
          setIsDiscordSharing(false);
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setErrorBanner(`Discord共有の準備に失敗しました: ${message}`);
      }
      setIsDiscordSharing(false);
      return;
    }

    if (!uploadData?.url) {
      setErrorBanner('Discord共有に必要なURLを取得できませんでした。再度お試しください。');
      setIsDiscordSharing(false);
      return;
    }

    const pickProfile = () => {
      const latestStoreProfile = userProfilesState?.users?.[userId];
      if (latestStoreProfile) {
        return latestStoreProfile;
      }
      const snapshotProfile = snapshot.userProfiles?.users?.[userId];
      if (snapshotProfile) {
        return snapshotProfile;
      }
      const persistedSnapshot = persistence.loadSnapshot();
      return persistedSnapshot.userProfiles?.users?.[userId];
    };

    const profile = pickProfile();

    const trimOrNull = (value: string | null | undefined): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const sharedMemberId = trimOrNull(profile?.discordUserId);

    if (sharedMemberId) {
      try {
        const guildSelection = requireDiscordGuildSelection(discordUserId);

        const pickDisplayName = (
          ...candidates: Array<string | null | undefined>
        ): string => {
          for (const candidate of candidates) {
            if (typeof candidate === 'string') {
              const trimmed = candidate.trim();
              if (trimmed) {
                return trimmed;
              }
            }
          }
          return sharedMemberId;
        };

        const memberDisplayName = pickDisplayName(
          profile?.discordDisplayName,
          receiverDisplayName,
          profile?.displayName,
          profile?.discordUserName,
          profile?.id
        );

        const shareUrl = uploadData.url;
        const shareLabelCandidate = uploadData.label ?? shareUrl;
        const shareTitle = `${receiverDisplayName ?? '景品'}のお渡しリンクです`;
        const shareComment = buildDiscordShareComment({
          shareUrl,
          shareLabel: shareLabelCandidate,
          expiresAtText: uploadData.expiresAt ?? null
        });
        const { channelId, channelName, channelParentId } = await sendDiscordShareToMember({
          push,
          discordUserId,
          guildSelection,
          memberId: sharedMemberId,
          channelId: profile?.discordLastShareChannelId,
          channelName: profile?.discordLastShareChannelName,
          channelParentId: profile?.discordLastShareChannelParentId,
          shareUrl,
          shareTitle,
          shareComment,
          categoryDialogTitle: 'お渡しカテゴリの設定'
        });

        const sharedAt = new Date().toISOString();
        const rawShareUrl = shareUrl || '';
        const resolvedShareUrl = rawShareUrl.trim();
        const resolvedShareLabel =
          typeof shareLabelCandidate === 'string' ? shareLabelCandidate.trim() : null;

        const shareInfo = resolvedShareUrl
          ? {
              channelId,
              channelName: channelName ?? null,
              channelParentId: channelParentId ?? null,
              shareUrl: resolvedShareUrl,
              shareLabel: resolvedShareLabel ? resolvedShareLabel : null,
              shareTitle,
              shareComment: shareComment ?? null,
              sharedAt
            }
          : undefined;

        void linkDiscordProfile({
          discordUserId: sharedMemberId,
          discordDisplayName: memberDisplayName,
          discordUserName: profile?.discordUserName,
          avatarUrl: profile?.discordAvatarUrl ?? undefined,
          share: shareInfo
        });
        if (pullIdsForStatus.length > 0) {
          pullHistoryStore.markPullStatus(pullIdsForStatus, 'discord_shared');
          pullHistoryStore.markPullOriginalPrizeMissing(
            pullIdsForStatus,
            originalPrizeMissingPullIds
          );
        }

        setErrorBanner(null);
        notify({
          variant: 'success',
          message: `${memberDisplayName}さんにDiscordで共有しました`
        });
      } catch (error) {
        const message =
          error instanceof DiscordGuildSelectionMissingError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        const displayMessage =
          error instanceof DiscordGuildSelectionMissingError
            ? message
            : `Discord共有の送信に失敗しました: ${message}`;
        setErrorBanner(displayMessage);
        notify({
          variant: 'error',
          title: 'Discord共有に失敗しました',
          message: displayMessage
        });
      }
      setIsDiscordSharing(false);
      return;
    }

    try {
      openDiscordShareDialog({
        push,
        discordUserId,
        shareUrl: uploadData.url,
        shareLabel: uploadData.label,
        receiverName: receiverDisplayName,
        shareComment: buildDiscordShareComment({
          shareUrl: uploadData.url,
          shareLabel: uploadData.label ?? uploadData.url,
          expiresAtText: uploadData.expiresAt ?? null
        }),
        onShared: ({
          memberId: sharedMemberId,
          memberName,
          memberDisplayName,
          memberUsername,
          memberAvatarHash,
          memberAvatarUrl,
          channelId,
          channelName,
          channelParentId,
          shareUrl: sharedUrl,
          shareLabel,
          shareTitle,
          shareComment,
          sharedAt
        }) => {
          setErrorBanner(null);
          const resolvedAvatarUrl = sharedMemberId && memberAvatarHash
            ? `https://cdn.discordapp.com/avatars/${sharedMemberId}/${memberAvatarHash}.png?size=256`
            : memberAvatarUrl ?? null;
          const rawShareUrl = sharedUrl || uploadData?.url || '';
          const resolvedShareUrl = rawShareUrl.trim();
          const resolvedShareLabelRaw =
            shareLabel ?? uploadData?.label ?? (sharedUrl && sharedUrl !== rawShareUrl ? sharedUrl : null);
          const resolvedShareLabel =
            typeof resolvedShareLabelRaw === 'string' ? resolvedShareLabelRaw.trim() : resolvedShareLabelRaw;
          const shareInfo = resolvedShareUrl
            ? {
                channelId,
                channelName: channelName ?? null,
                channelParentId: channelParentId ?? null,
                shareUrl: resolvedShareUrl,
                shareLabel: resolvedShareLabel ? resolvedShareLabel : null,
                shareTitle: shareTitle ?? null,
                shareComment: shareComment ?? null,
                sharedAt: sharedAt ?? new Date().toISOString()
              }
            : undefined;

          void linkDiscordProfile({
            discordUserId: sharedMemberId,
            discordDisplayName: memberDisplayName ?? memberName,
            discordUserName: memberUsername,
            avatarUrl: resolvedAvatarUrl,
            share: shareInfo
          });
          if (pullIdsForStatus.length > 0) {
            pullHistoryStore.markPullStatus(pullIdsForStatus, 'discord_shared');
            pullHistoryStore.markPullOriginalPrizeMissing(
              pullIdsForStatus,
              originalPrizeMissingPullIds
            );
          }
          notify({
            variant: 'success',
            message: `${memberName}さんにDiscordで共有しました`
          });
        },
        onShareFailed: (message) => {
          setErrorBanner(message);
          notify({
            variant: 'error',
            title: 'Discord共有に失敗しました',
            message
          });
        }
      });
    } catch (error) {
      const message =
        error instanceof DiscordGuildSelectionMissingError
          ? error.message
          : 'Discordギルドの選択情報を取得できませんでした。Discord共有設定を確認してください。';
      setErrorBanner(message);
      notify({
        variant: 'error',
        title: 'Discord共有に失敗しました',
        message
      });
    } finally {
      setIsDiscordSharing(false);
    }
  };

  const handleShareToDiscord = () => {
    setErrorBanner(null);
    if (!isDiscordLoggedIn) {
      setErrorBanner('Discordにログインしてから共有してください。');
      return;
    }
    if (!discordUserId) {
      setErrorBanner('Discordアカウントの情報を取得できませんでした。再度ログインしてください。');
      return;
    }
    if (isProcessing || isUploading || isDiscordSharing) {
      return;
    }
    const ownerName = ensureOwnerName();
    if (!ownerName) {
      return;
    }
    maybeWarnMissingOriginalPrize(() => {
      void runShareToDiscord(ownerName);
    });
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">保存対象一覧</div>
          {selectionSummary.sections.length > 0 ? (
            <div className="space-y-3 text-xs text-muted-foreground">
              {selectionSummary.sections.map((section, sectionIndex) => (
                <div key={`${section.gachaName}-${sectionIndex}`} className="space-y-1">
                  <div className="text-sm font-semibold text-surface-foreground">{section.gachaName}</div>
                  <div className="space-y-0.5">
                    {section.items.map((line, lineIndex) => (
                      <div key={`${line.itemName}-${lineIndex}`} className="flex flex-wrap items-center gap-2">
                        <RarityLabel
                          label={line.rarityLabel}
                          color={line.rarityColor}
                          className="text-xs font-semibold"
                          truncate={false}
                        />
                        <span className="text-xs text-surface-foreground">{line.itemName}</span>
                        <span className="text-xs text-muted-foreground">：{line.count}枚{line.flagsLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {selectionSummary.sections.length === 0 && selectionSummary.details.length > 0 ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              {selectionSummary.details.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SaveOptionCard
            title="デバイスに保存"
            busyTitle="生成中…"
            description="端末にZIPを保存し、後からお好みのサービスにアップロードして共有します。"
            icon={<FolderArrowDownIcon className="h-6 w-6" />}
            onClick={handleSaveToDevice}
            disabled={isUploading}
            isBusy={isProcessing}
            helperText="デバイスに保存"
          />
          <SaveOptionCard
            title="zipファイルをアップロード"
            busyTitle="アップロード中…"
            description="ZIPをshimmy3.comにアップロードし、受け取り用の共有リンクを発行します。"
            icon={<ArrowUpTrayIcon className="h-6 w-6" />}
            onClick={handleUploadToShimmy}
            disabled={isProcessing}
            isBusy={isUploading}
            helperText="zipファイルをアップロード"
          />
          <SaveOptionCard
            title="Discordで共有"
            description="保存した共有リンクをDiscordのお渡しチャンネルに送信します。先に共有URLを発行してからご利用ください。"
            disabled={isProcessing || isUploading || isDiscordSharing}
            icon={<PaperAirplaneIcon className="h-6 w-6" />}
            onClick={handleShareToDiscord}
            isBusy={isDiscordSharing}
            busyTitle="共有準備中…"
            helperText={isDiscordSharing ? undefined : discordHelperText}
          />
        </div>

        {uploadResult ? (
          <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-surface-foreground">
              <DocumentDuplicateIcon className="h-5 w-5 text-accent" />
              直近の共有リンク
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto] sm:items-center">
              {safeUploadUrl ? (
                <a
                  href={safeUploadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate rounded-xl border border-border/60 bg-surface-alt px-3 py-2 font-mono text-xs text-surface-foreground"
                >
                  {uploadResult.label ?? uploadResult.url}
                </a>
              ) : (
                <span
                  className="truncate rounded-xl border border-border/60 bg-surface-alt px-3 py-2 font-mono text-xs text-muted-foreground/80"
                  aria-disabled="true"
                >
                  {uploadResult.label ?? uploadResult.url}
                </span>
              )}
              <button type="button" className="btn btn-muted" onClick={() => handleCopyUrl(uploadResult.url)}>
                {copied ? 'コピーしました' : 'URLをコピー'}
              </button>
            </div>
            {uploadResult.expiresAt ? (
              <p className="text-[11px] text-muted-foreground">有効期限: {uploadResult.expiresAt}</p>
            ) : null}
          </div>
        ) : null}

        {errorBanner ? (
          <div className="rounded-2xl border border-rose-500/70 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorBanner}
          </div>
        ) : null}

        {lastDownload ? (
          <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-surface-foreground">
            <div className="flex items-center gap-2 text-sm font-semibold text-surface-foreground">
              <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
              端末への保存が完了しました
            </div>
            <p>ファイル名: {lastDownload.fileName}</p>
            <p>収録件数: {lastDownload.fileCount} 件</p>
            <p>保存日時: {formatExpiresAt(lastDownload.savedAt) ?? lastDownload.savedAt}</p>
            {lastDownload.warnings.length > 0 ? (
              <div className="space-y-1">
                <p className="font-semibold">警告:</p>
                <ul className="list-inside list-disc space-y-1">
                  {lastDownload.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}

interface SaveOptionCardProps {
  title: string;
  description: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  isBusy?: boolean;
  busyTitle?: string;
  helperText?: string;
}

function SaveOptionCard({
  title,
  description,
  icon,
  onClick,
  disabled,
  isBusy = false,
  busyTitle,
  helperText
}: SaveOptionCardProps): JSX.Element {
  const isDisabled = Boolean(disabled) || isBusy;
  const displayTitle = isBusy && busyTitle ? busyTitle : title;
  const displayHelperText = isBusy ? undefined : helperText;
  const displayIcon = isBusy ? <ArrowPathIcon className="h-6 w-6 animate-spin" /> : icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={isBusy}
      className={
        `save-options__card flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-surface/30 p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
          isDisabled
            ? 'cursor-not-allowed opacity-60'
            : 'hover:border-accent hover:bg-accent/10'
        }`
      }
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface text-accent">
          {displayIcon}
        </div>
        <h3 className="text-base font-semibold text-surface-foreground">{displayTitle}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      {displayHelperText ? (
        <div className="mt-auto text-sm font-medium text-accent">{displayHelperText}</div>
      ) : null}
    </button>
  );
}
