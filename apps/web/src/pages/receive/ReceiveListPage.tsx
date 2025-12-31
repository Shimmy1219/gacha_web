import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { ItemPreview } from '../../components/ItemPreviewThumbnail';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { ReceiveBulkSaveButton, ReceiveSaveButton } from './components/ReceiveSaveButtons';
import { saveReceiveItem, saveReceiveItems } from './receiveSave';
import {
  loadReceiveZipInventory,
  loadReceiveZipSelectionInfo
} from './receiveZip';
import {
  isHistoryStorageAvailable,
  loadHistoryFile,
  loadHistoryMetadata,
  persistHistoryMetadata
} from './historyStorage';
import type { ReceiveMediaItem, ReceiveMediaKind } from './types';

interface ReceiveInventoryItem {
  key: string;
  gachaName: string;
  gachaId: string | null;
  itemName: string;
  itemId: string | null;
  rarity: string | null;
  rarityColor: string | null;
  isRiagu: boolean;
  obtainedCount: number;
  kind: ReceiveMediaKind;
  previewUrl: string | null;
  sourceItems: ReceiveMediaItem[];
  assetCount: number | null;
  isOwned: boolean;
}

interface ReceiveGachaGroup {
  gachaName: string;
  gachaId: string | null;
  ownerNames: string[];
  items: ReceiveInventoryItem[];
  ownedKinds: number;
  totalKinds: number;
  ownedCount: number;
  sourceItems: ReceiveMediaItem[];
}

type PreviewKind = 'image' | 'video' | 'audio' | 'unknown';

function resolvePreviewKind(kind: ReceiveMediaKind): PreviewKind {
  if (kind === 'image') {
    return 'image';
  }
  if (kind === 'video') {
    return 'video';
  }
  if (kind === 'audio') {
    return 'audio';
  }
  return 'unknown';
}

function resolveItemKey(gachaKey: string, itemId: string | null, itemName: string): string {
  if (itemId && itemId.trim()) {
    return `${gachaKey}:${itemId.trim()}`;
  }
  return `${gachaKey}:${itemName}`;
}

function formatOwnerNames(names: string[]): string {
  const normalized = Array.from(
    new Set(
      names
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    )
  );
  if (normalized.length === 0) {
    return 'オーナー不明';
  }
  const hasKnownOwner = normalized.some((name) => name !== 'オーナー不明');
  const filtered = hasKnownOwner ? normalized.filter((name) => name !== 'オーナー不明') : normalized;
  if (filtered.length <= 2) {
    return filtered.join(' / ');
  }
  return `${filtered[0]} ほか${filtered.length - 1}名`;
}

function ReceiveInventoryItemCard({
  item,
  onSave,
  isSaving
}: {
  item: ReceiveInventoryItem;
  onSave: () => void;
  isSaving: boolean;
}): JSX.Element {
  const rarityPresentation = useMemo(
    () => getRarityTextPresentation(item.rarityColor ?? undefined),
    [item.rarityColor]
  );
  const previewKind = resolvePreviewKind(item.kind);
  const hasSource = item.sourceItems.length > 0;
  const fileCount = item.assetCount ?? item.sourceItems.length;
  const showFileCount = fileCount > 1;

  return (
    <div
      className={clsx(
        'rounded-2xl border border-border/60 bg-panel-muted/70 p-4',
        !item.isOwned && 'opacity-60 grayscale'
      )}
    >
      <div className="flex items-start gap-3">
        <ItemPreview
          previewUrl={item.previewUrl ?? null}
          alt={item.itemName}
          kindHint={previewKind}
          imageFit="contain"
          className="h-16 w-16 flex-shrink-0 bg-surface-deep"
          iconClassName="h-6 w-6"
          emptyLabel="noImage"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-surface-foreground">{item.itemName}</p>
          <div className="mt-2 flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex min-w-0 flex-col gap-1">
              {item.rarity ? (
                <span
                  className={clsx('text-[11px] font-semibold', rarityPresentation.className)}
                  style={rarityPresentation.style}
                >
                  {item.rarity}
                </span>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">x{item.obtainedCount}</span>
                {showFileCount ? <span className="chip">ファイル {fileCount}</span> : null}
                {item.isRiagu ? (
                  <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-600">リアルグッズ</span>
                ) : null}
              </div>
            </div>
            {item.isOwned ? (
              <ReceiveSaveButton
                onClick={onSave}
                disabled={isSaving || !hasSource}
                className="h-8 px-3 text-xs"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReceiveListPage(): JSX.Element {
  const [groups, setGroups] = useState<ReceiveGachaGroup[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];

    const load = async () => {
      if (!isHistoryStorageAvailable()) {
        setError('ブラウザのローカルストレージ・IndexedDBが利用できないため、所持一覧を表示できません。');
        setStatus('error');
        return;
      }

      const historyEntries = loadHistoryMetadata();
      let metadataChanged = false;
      const updatedHistoryEntries = [...historyEntries];
      const seenPullIds = new Set<string>();
      if (historyEntries.length === 0) {
        setGroups([]);
        setStatus('ready');
        return;
      }

      try {
        const gachaMap = new Map<
          string,
          {
            gachaId: string | null;
            gachaName: string;
            ownerNames: Set<string>;
            itemMap: Map<string, ReceiveInventoryItem>;
            sourceItems: ReceiveMediaItem[];
          }
        >();

        for (const entry of historyEntries) {
          const blob = await loadHistoryFile(entry.id);
          if (!blob) {
            continue;
          }

          const selectionInfo = await loadReceiveZipSelectionInfo(blob);
          const pullIds = selectionInfo.pullIds;
          const ownerName = selectionInfo.ownerName;
          if (pullIds.length > 0 && (!entry.pullIds || entry.pullIds.length === 0)) {
            const index = updatedHistoryEntries.findIndex((candidate) => candidate.id === entry.id);
            if (index >= 0) {
              updatedHistoryEntries[index] = { ...updatedHistoryEntries[index], pullIds };
              metadataChanged = true;
            }
          }
          if (ownerName && (!entry.ownerName || !entry.ownerName.trim())) {
            const index = updatedHistoryEntries.findIndex((candidate) => candidate.id === entry.id);
            if (index >= 0) {
              updatedHistoryEntries[index] = { ...updatedHistoryEntries[index], ownerName };
              metadataChanged = true;
            }
          }

          const { metadataEntries, mediaItems, catalog } = await loadReceiveZipInventory(blob);
          const ownerLabel = ownerName?.trim() || entry.ownerName?.trim() || 'オーナー不明';
          const entryItemKeys = new Set<string>();
          const metadataAssetCounts = new Map<string, number>();
          const hasOverlap = pullIds.some((pullId) => seenPullIds.has(pullId));
          pullIds.forEach((pullId) => seenPullIds.add(pullId));
          const shouldCountInventory = !hasOverlap;

          if (shouldCountInventory) {
            for (const metadata of metadataEntries) {
              const gachaName = metadata.gachaName?.trim() || '不明なガチャ';
              const gachaId = metadata.gachaId?.trim() || null;
              const gachaKey = gachaId || gachaName;
              const itemName = metadata.itemName?.trim() || '名称未設定';
              const itemId = metadata.itemId?.trim() || null;
              const itemKey = resolveItemKey(gachaKey, itemId, itemName);
              const nextAssetCount = (metadataAssetCounts.get(itemKey) ?? 0) + 1;
              metadataAssetCounts.set(itemKey, nextAssetCount);

              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: []
                };
              existingGroup.ownerNames.add(ownerLabel);

              const itemMap = existingGroup.itemMap;
              const existing = itemMap.get(itemKey);
              if (existing) {
                existing.assetCount = Math.max(existing.assetCount ?? 0, nextAssetCount);
                if (!existing.rarity && metadata.rarity) {
                  existing.rarity = metadata.rarity;
                }
                if (!existing.rarityColor && metadata.rarityColor) {
                  existing.rarityColor = metadata.rarityColor;
                }
                if (!existing.itemId && itemId) {
                  existing.itemId = itemId;
                }
              }

              if (entryItemKeys.has(itemKey)) {
                if (!gachaMap.has(gachaKey)) {
                  gachaMap.set(gachaKey, existingGroup);
                }
                continue;
              }
              entryItemKeys.add(itemKey);

              const obtained = typeof metadata.obtainedCount === 'number' && Number.isFinite(metadata.obtainedCount)
                ? Math.max(0, metadata.obtainedCount)
                : 1;

              if (existing) {
                existing.obtainedCount += obtained;
                existing.isOwned = true;
              } else {
                itemMap.set(itemKey, {
                  key: itemKey,
                  gachaName,
                  gachaId,
                  itemName,
                  itemId,
                  rarity: metadata.rarity ?? null,
                  rarityColor: metadata.rarityColor ?? null,
                  isRiagu: Boolean(metadata.isRiagu),
                  obtainedCount: obtained,
                  kind: 'unknown',
                  previewUrl: null,
                  sourceItems: [],
                  assetCount: nextAssetCount,
                  isOwned: true
                });
              }

              if (!gachaMap.has(gachaKey)) {
                gachaMap.set(gachaKey, existingGroup);
              }
            }

            for (const item of mediaItems) {
              const gachaName = item.metadata?.gachaName?.trim() || '不明なガチャ';
              const gachaId = item.metadata?.gachaId?.trim() || null;
              const gachaKey = gachaId || gachaName;
              const itemName = (item.metadata?.itemName ?? item.filename).trim() || '名称未設定';
              const itemId = item.metadata?.itemId?.trim() || null;
              const itemKey = resolveItemKey(gachaKey, itemId, itemName);

              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: []
                };
              existingGroup.ownerNames.add(ownerLabel);

              const itemMap = existingGroup.itemMap;
              const existing = itemMap.get(itemKey);
              if (existing) {
                existing.kind = item.kind;
                if (!existing.previewUrl && item.kind === 'image') {
                  const url = URL.createObjectURL(item.blob);
                  objectUrls.push(url);
                  existing.previewUrl = url;
                }
                existing.sourceItems.push(item);
                existing.assetCount = Math.max(existing.assetCount ?? 0, existing.sourceItems.length);
              } else {
                const previewUrl = item.kind === 'image' ? URL.createObjectURL(item.blob) : null;
                if (previewUrl) {
                  objectUrls.push(previewUrl);
                }
                const obtained = typeof item.metadata?.obtainedCount === 'number' && Number.isFinite(item.metadata.obtainedCount)
                  ? Math.max(0, item.metadata.obtainedCount)
                  : 1;
                itemMap.set(itemKey, {
                  key: itemKey,
                  gachaName,
                  gachaId,
                  itemName,
                  itemId,
                  rarity: item.metadata?.rarity ?? null,
                  rarityColor: item.metadata?.rarityColor ?? null,
                  isRiagu: Boolean(item.metadata?.isRiagu),
                  obtainedCount: obtained,
                  kind: item.kind,
                  previewUrl,
                  sourceItems: [item],
                  assetCount: 1,
                  isOwned: true
                });
              }

              existingGroup.sourceItems.push(item);
              if (!gachaMap.has(gachaKey)) {
                gachaMap.set(gachaKey, existingGroup);
              }
            }
          }

          if (catalog.length > 0) {
            for (const gacha of catalog) {
              const gachaName = gacha.gachaName?.trim() || '不明なガチャ';
              const gachaId = gacha.gachaId?.trim() || null;
              const gachaKey = gachaId || gachaName;
              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: []
                };
              existingGroup.ownerNames.add(ownerLabel);

              const itemMap = existingGroup.itemMap;
              for (const item of gacha.items) {
                const itemName = item.itemName?.trim() || '名称未設定';
                const itemId = item.itemId?.trim() || null;
                const itemKey = resolveItemKey(gachaKey, itemId, itemName);
                const existing = itemMap.get(itemKey);
                const assetCount = Number.isFinite(item.assetCount) ? Math.max(0, item.assetCount) : 0;

                if (existing) {
                  existing.assetCount = Math.max(existing.assetCount ?? 0, assetCount);
                  if (!existing.rarity && item.rarityLabel) {
                    existing.rarity = item.rarityLabel;
                  }
                  if (!existing.rarityColor && item.rarityColor) {
                    existing.rarityColor = item.rarityColor;
                  }
                  if (!existing.itemId && itemId) {
                    existing.itemId = itemId;
                  }
                  existing.isRiagu = existing.isRiagu || Boolean(item.isRiagu);
                } else {
                  itemMap.set(itemKey, {
                    key: itemKey,
                    gachaName,
                    gachaId,
                    itemName,
                    itemId,
                    rarity: item.rarityLabel ?? null,
                    rarityColor: item.rarityColor ?? null,
                    isRiagu: Boolean(item.isRiagu),
                    obtainedCount: 0,
                    kind: 'unknown',
                    previewUrl: null,
                    sourceItems: [],
                    assetCount,
                    isOwned: false
                  });
                }
              }

              if (!gachaMap.has(gachaKey)) {
                gachaMap.set(gachaKey, existingGroup);
              }
            }
          }
        }

        const nextGroups = Array.from(gachaMap.values()).map(({ ownerNames, gachaId, gachaName, itemMap, sourceItems }) => {
          const items = Array.from(itemMap.values()).sort((a, b) => {
            if (a.isOwned !== b.isOwned) {
              return a.isOwned ? -1 : 1;
            }
            return a.itemName.localeCompare(b.itemName, 'ja');
          });
          const ownedItems = items.filter((item) => item.isOwned);
          const ownedKinds = ownedItems.length;
          const totalKinds = items.length;
          const ownedCount = ownedItems.reduce((sum, item) => sum + item.obtainedCount, 0);
          return {
            ownerNames: Array.from(ownerNames).sort((a, b) => a.localeCompare(b)),
            gachaId,
            gachaName,
            items,
            ownedKinds,
            totalKinds,
            ownedCount,
            sourceItems
          };
        });

        nextGroups.sort((a, b) => {
          return a.gachaName.localeCompare(b.gachaName);
        });

        if (metadataChanged) {
          persistHistoryMetadata(updatedHistoryEntries);
        }

        if (active) {
          setGroups(nextGroups);
          setStatus('ready');
        }
      } catch (loadError) {
        console.error('Failed to load receive list', loadError);
        if (active) {
          setError('所持一覧の読み込みに失敗しました。ブラウザの設定をご確認ください。');
          setStatus('error');
        }
      }
    };

    void load();

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const isEmpty = status === 'ready' && groups.length === 0;
  const totalOwnedKinds = useMemo(() => groups.reduce((sum, group) => sum + group.ownedKinds, 0), [groups]);
  const totalKinds = useMemo(() => groups.reduce((sum, group) => sum + group.totalKinds, 0), [groups]);
  const totalOwnedCount = useMemo(() => groups.reduce((sum, group) => sum + group.ownedCount, 0), [groups]);
  const hasSaving = Boolean(savingGroupKey || savingItemKey);

  const handleSaveItem = useCallback(async (item: ReceiveInventoryItem) => {
    const target = item.sourceItems[0];
    if (!target) {
      return;
    }
    if (typeof document === 'undefined') {
      setSaveError('保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setSaveError(null);
    setSavingItemKey(item.key);
    try {
      await saveReceiveItem(target);
    } catch (saveError) {
      console.error('Failed to save receive inventory item', saveError);
      setSaveError('保存中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setSavingItemKey(null);
    }
  }, []);

  const handleSaveGroup = useCallback(async (group: ReceiveGachaGroup) => {
    if (group.sourceItems.length === 0) {
      return;
    }
    if (typeof document === 'undefined') {
      setSaveError('まとめて保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setSaveError(null);
    const groupKey = group.gachaId ?? group.gachaName;
    setSavingGroupKey(groupKey);
    try {
      await saveReceiveItems(group.sourceItems);
    } catch (saveError) {
      console.error('Failed to save receive inventory group', saveError);
      setSaveError('まとめて保存中にエラーが発生しました。個別保存をお試しください。');
    } finally {
      setSavingGroupKey(null);
    }
  }, []);

  return (
    <div className="receive-list-page min-h-screen text-surface-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        <header className="rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
          <h1 className="mt-3 text-3xl font-bold">所持アイテム一覧</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            受け取り済みの景品をガチャ単位で表示します。
          </p>
          {status === 'ready' && groups.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              所持 {totalOwnedKinds} 種類 / 全 {totalKinds} 種類 ・ 合計 {totalOwnedCount} 個
            </p>
          ) : null}
        </header>

        {status === 'loading' ? (
          <div className="rounded-2xl border border-border/60 bg-surface/40 px-4 py-3 text-sm text-muted-foreground">
            所持一覧を読み込んでいます…
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {error}
          </div>
        ) : null}

        {saveError ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {saveError}
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            まだ所持アイテムがありません。/receive で受け取ると一覧に表示されます。
          </div>
        ) : null}

        {groups.length > 0 ? (
          <section className="flex flex-col gap-6">
            {groups.map((group) => (
              <div
                key={group.gachaId ?? group.gachaName}
                className="rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-foreground">{group.gachaName}</h2>
                    <p className="text-xs text-muted-foreground">
                      所持 {group.ownedKinds} 種類 / 全 {group.totalKinds} 種類 ・ 合計 {group.ownedCount} 個
                    </p>
                    <p className="text-xs text-muted-foreground">
                      オーナー: {formatOwnerNames(group.ownerNames)}
                    </p>
                  </div>
                  <ReceiveBulkSaveButton
                    onClick={() => handleSaveGroup(group)}
                    isLoading={savingGroupKey === (group.gachaId ?? group.gachaName)}
                    disabled={hasSaving || group.sourceItems.length === 0}
                    className="h-9 px-4 text-xs"
                  />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <ReceiveInventoryItemCard
                      key={item.key}
                      item={item}
                      onSave={() => handleSaveItem(item)}
                      isSaving={savingItemKey === item.key || Boolean(savingGroupKey)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
