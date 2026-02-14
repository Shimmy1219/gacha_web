import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

import { ItemPreview } from '../../components/ItemPreviewThumbnail';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { MultiSelectDropdown, type MultiSelectOption } from '../gacha/components/select/MultiSelectDropdown';
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
  persistHistoryMetadata,
  saveHistoryFile
} from './historyStorage';
import type { ReceiveMediaItem, ReceiveMediaKind } from './types';
import { DIGITAL_ITEM_TYPE_OPTIONS, type DigitalItemTypeKey, getDigitalItemTypeLabel } from '@domain/digital-items/digitalItemTypes';
import { IconRingWearDialog, useModal } from '../../modals';

interface ReceiveInventoryItem {
  key: string;
  baseKey: string;
  gachaName: string;
  gachaId: string | null;
  itemName: string;
  itemId: string | null;
  rarity: string | null;
  rarityColor: string | null;
  isRiagu: boolean;
  obtainedCount: number;
  kind: ReceiveMediaKind;
  digitalItemType: DigitalItemTypeKey | null;
  previewUrl: string | null;
  sourceItems: ReceiveMediaItem[];
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

function resolveItemKey(gachaKey: string, itemId: string | null, itemName: string, assetId?: string | null): string {
  if (itemId && itemId.trim()) {
    return assetId && assetId.trim() ? `${gachaKey}:${itemId.trim()}:${assetId.trim()}` : `${gachaKey}:${itemId.trim()}`;
  }
  return assetId && assetId.trim() ? `${gachaKey}:${itemName}:${assetId.trim()}` : `${gachaKey}:${itemName}`;
}

function createGroupDomId(key: string): string {
  return `receive-group-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
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
  const { push } = useModal();
  const rarityPresentation = useMemo(
    () => getRarityTextPresentation(item.rarityColor ?? undefined),
    [item.rarityColor]
  );
  const previewKind = resolvePreviewKind(item.kind);
  const hasSource = item.sourceItems.length > 0;
  const ringSourceItem = useMemo(
    () => item.sourceItems.find((sourceItem) => sourceItem.kind === 'image') ?? item.sourceItems[0] ?? null,
    [item.sourceItems]
  );
  const canWearIconRing = item.isOwned && item.kind === 'image' && item.digitalItemType === 'icon-ring' && Boolean(ringSourceItem);

  return (
    <div
      className={clsx(
        'receive-list-item-card__root rounded-2xl border border-border/60 bg-panel-muted/70 p-4',
        !item.isOwned && 'opacity-60 grayscale'
      )}
    >
      <p className="receive-list-item-card__item-name line-clamp-2 text-sm font-semibold text-surface-foreground">{item.itemName}</p>
      <div className="receive-list-item-card__content-row mt-3 flex items-start gap-3">
        <ItemPreview
          previewUrl={item.previewUrl ?? null}
          alt={item.itemName}
          kindHint={previewKind}
          imageFit="contain"
          className="receive-list-item-card__preview h-16 w-16 flex-shrink-0 bg-surface-deep"
          iconClassName="h-6 w-6"
          emptyLabel="noImage"
        />
        <div className="receive-list-item-card__details-column flex min-w-0 flex-1 flex-col gap-2">
          <div className="receive-list-item-card__meta-row flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.rarity ? (
              <span
                className={clsx('receive-list-item-card__rarity text-[11px] font-semibold', rarityPresentation.className)}
                style={rarityPresentation.style}
              >
                {item.rarity}
              </span>
            ) : null}
            <span className="receive-list-item-card__count chip">x{item.obtainedCount}</span>
          </div>
          <div className="receive-list-item-card__type-row flex flex-wrap items-center gap-2">
            {item.digitalItemType ? (
              <span className="receive-list-item-card__digital-type chip">{getDigitalItemTypeLabel(item.digitalItemType)}</span>
            ) : null}
            {item.isRiagu ? (
              <span className="receive-list-item-card__riagu chip border-amber-500/40 bg-amber-500/10 text-amber-600">リアルグッズ</span>
            ) : null}
          </div>
          {item.isOwned ? (
            <div className="receive-list-item-card__action-row mt-1 flex items-center gap-2">
              {canWearIconRing ? (
                <button
                  type="button"
                  className="receive-list-item-card__wear-button btn btn-muted h-8 px-3 text-xs"
                  disabled={!ringSourceItem}
                  onClick={() => {
                    if (!ringSourceItem) {
                      return;
                    }
                    push(IconRingWearDialog, {
                      id: `icon-ring-wear-list-${item.key}`,
                      title: 'アイコンリングを装着',
                      size: 'lg',
                      payload: { ringItem: ringSourceItem }
                    });
                  }}
                >
                  装着
                </button>
              ) : null}
              <ReceiveSaveButton
                onClick={onSave}
                disabled={isSaving || !hasSource}
                className="receive-list-item-card__save-button h-8 px-3 text-xs"
              />
            </div>
          ) : (
            <div className="receive-list-item-card__ownership-note text-[11px] text-muted-foreground">未所持</div>
          )}
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [digitalItemTypeFilter, setDigitalItemTypeFilter] = useState<DigitalItemTypeKey[] | '*'>('*');

  const digitalItemTypeOptions = useMemo<MultiSelectOption<DigitalItemTypeKey>[]>(
    () =>
      DIGITAL_ITEM_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label
      })),
    []
  );

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
            baseKeySet: Set<string>;
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

          const { metadataEntries, mediaItems, catalog, migratedBlob } = await loadReceiveZipInventory(blob, {
            migrateDigitalItemTypes: true
          });
          if (migratedBlob) {
            try {
              await saveHistoryFile(entry.id, migratedBlob);
            } catch (persistError) {
              console.warn('Failed to persist migrated receive history zip from /receive/list', {
                entryId: entry.id,
                error: persistError
              });
            }
          }
          const ownerLabel = ownerName?.trim() || entry.ownerName?.trim() || 'オーナー不明';
          const hasOverlap = pullIds.some((pullId) => seenPullIds.has(pullId));
          pullIds.forEach((pullId) => seenPullIds.add(pullId));
          const shouldCountInventory = !hasOverlap;

          if (shouldCountInventory) {
            const assetTotalCounts = new Map<string, number>();
            const assetIndexMap = new Map<string, number>();
            const assetKeyMap = new Map<string, string>();
            const fallbackTotalCounts = new Map<string, number>();
            const fallbackIndexMap = new Map<string, number>();

            if (metadataEntries.length > 0) {
              for (const metadata of metadataEntries) {
                const gachaName = metadata.gachaName?.trim() || '不明なガチャ';
                const gachaId = metadata.gachaId?.trim() || null;
                const gachaKey = gachaId || gachaName;
                const itemName = metadata.itemName?.trim() || '名称未設定';
                const itemId = metadata.itemId?.trim() || null;
                const baseKey = `${gachaKey}:${itemId ?? itemName}`;
                assetTotalCounts.set(baseKey, (assetTotalCounts.get(baseKey) ?? 0) + 1);
              }
            } else {
              for (const item of mediaItems) {
                const gachaName = item.metadata?.gachaName?.trim() || '不明なガチャ';
                const gachaId = item.metadata?.gachaId?.trim() || null;
                const gachaKey = gachaId || gachaName;
                const itemName = (item.metadata?.itemName ?? item.filename).trim() || '名称未設定';
                const itemId = item.metadata?.itemId?.trim() || null;
                const baseKey = `${gachaKey}:${itemId ?? itemName}`;
                fallbackTotalCounts.set(baseKey, (fallbackTotalCounts.get(baseKey) ?? 0) + 1);
              }
            }

            for (const metadata of metadataEntries) {
              const gachaName = metadata.gachaName?.trim() || '不明なガチャ';
              const gachaId = metadata.gachaId?.trim() || null;
              const gachaKey = gachaId || gachaName;
              const itemName = metadata.itemName?.trim() || '名称未設定';
              const itemId = metadata.itemId?.trim() || null;
              const baseKey = `${gachaKey}:${itemId ?? itemName}`;
              const totalCount = assetTotalCounts.get(baseKey) ?? 1;
              const nextIndex = (assetIndexMap.get(baseKey) ?? 0) + 1;
              assetIndexMap.set(baseKey, nextIndex);
              const itemDisplayName = totalCount > 1 ? `${itemName}（${nextIndex}）` : itemName;
              const itemKey = resolveItemKey(gachaKey, itemId, itemDisplayName, metadata.id);
              assetKeyMap.set(metadata.id, itemKey);

              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: [],
                  baseKeySet: new Set<string>()
                };
              existingGroup.ownerNames.add(ownerLabel);
              existingGroup.baseKeySet.add(baseKey);

              const itemMap = existingGroup.itemMap;
              const existing = itemMap.get(itemKey);
              const obtained = typeof metadata.obtainedCount === 'number' && Number.isFinite(metadata.obtainedCount)
                ? Math.max(0, metadata.obtainedCount)
                : 1;

              if (existing) {
                existing.obtainedCount += obtained;
                existing.isOwned = true;
              } else {
                itemMap.set(itemKey, {
                  key: itemKey,
                  baseKey,
                  gachaName,
                  gachaId,
                  itemName: itemDisplayName,
                  itemId,
                  rarity: metadata.rarity ?? null,
                  rarityColor: metadata.rarityColor ?? null,
                  isRiagu: Boolean(metadata.isRiagu),
                  obtainedCount: obtained,
                  kind: 'unknown',
                  digitalItemType: metadata.isRiagu ? null : metadata.digitalItemType ?? 'other',
                  previewUrl: null,
                  sourceItems: [],
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
              const baseKey = `${gachaKey}:${itemId ?? itemName}`;
              const assetId = item.metadata?.id ?? item.id;
              const mappedKey = assetKeyMap.get(assetId);
              const itemKey = mappedKey ?? resolveItemKey(gachaKey, itemId, itemName, assetId);

              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: [],
                  baseKeySet: new Set<string>()
                };
              existingGroup.ownerNames.add(ownerLabel);
              existingGroup.baseKeySet.add(baseKey);

              const itemMap = existingGroup.itemMap;
              const existing = itemMap.get(itemKey);
              if (existing) {
                existing.kind = item.kind;
                if (item.metadata?.isRiagu) {
                  existing.digitalItemType = null;
                } else if (item.metadata?.digitalItemType) {
                  existing.digitalItemType = item.metadata.digitalItemType;
                }
                if (!existing.previewUrl && item.kind === 'image') {
                  const url = URL.createObjectURL(item.blob);
                  objectUrls.push(url);
                  existing.previewUrl = url;
                }
                existing.sourceItems.push(item);
              } else {
                const totalCount = fallbackTotalCounts.get(baseKey) ?? 1;
                const nextIndex = (fallbackIndexMap.get(baseKey) ?? 0) + 1;
                fallbackIndexMap.set(baseKey, nextIndex);
                const itemDisplayName = totalCount > 1 ? `${itemName}（${nextIndex}）` : itemName;
                const previewUrl = item.kind === 'image' ? URL.createObjectURL(item.blob) : null;
                if (previewUrl) {
                  objectUrls.push(previewUrl);
                }
                const obtained = typeof item.metadata?.obtainedCount === 'number' && Number.isFinite(item.metadata.obtainedCount)
                  ? Math.max(0, item.metadata.obtainedCount)
                  : 1;
                itemMap.set(itemKey, {
                  key: itemKey,
                  baseKey,
                  gachaName,
                  gachaId,
                  itemName: itemDisplayName,
                  itemId,
                  rarity: item.metadata?.rarity ?? null,
                  rarityColor: item.metadata?.rarityColor ?? null,
                  isRiagu: Boolean(item.metadata?.isRiagu),
                  obtainedCount: obtained,
                  kind: item.kind,
                  digitalItemType: item.metadata?.isRiagu ? null : item.metadata?.digitalItemType ?? 'other',
                  previewUrl,
                  sourceItems: [item],
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
                sourceItems: [],
                baseKeySet: new Set<string>()
              };
              existingGroup.ownerNames.add(ownerLabel);

              const itemMap = existingGroup.itemMap;
              for (const item of gacha.items) {
                const itemName = item.itemName?.trim() || '名称未設定';
                const itemId = item.itemId?.trim() || null;
                const baseKey = `${gachaKey}:${itemId ?? itemName}`;
                if (existingGroup.baseKeySet.has(baseKey)) {
                  continue;
                }
                const itemKey = resolveItemKey(gachaKey, itemId, itemName);
                const existing = itemMap.get(itemKey);

                if (existing) {
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
                  if (existing.isRiagu) {
                    existing.digitalItemType = null;
                  }
                } else {
                  itemMap.set(itemKey, {
                    key: itemKey,
                    baseKey,
                    gachaName,
                    gachaId,
                    itemName,
                    itemId,
                    rarity: item.rarityLabel ?? null,
                    rarityColor: item.rarityColor ?? null,
                    isRiagu: Boolean(item.isRiagu),
                    obtainedCount: 0,
                    kind: 'unknown',
                    digitalItemType: item.isRiagu ? null : 'other',
                    previewUrl: null,
                    sourceItems: [],
                    isOwned: false
                  });
                  existingGroup.baseKeySet.add(baseKey);
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
          const ownedCountMap = new Map<string, number>();
          const totalKindSet = new Set<string>();
          items.forEach((item) => {
            totalKindSet.add(item.baseKey);
            if (item.isOwned) {
              const existing = ownedCountMap.get(item.baseKey) ?? 0;
              ownedCountMap.set(item.baseKey, Math.max(existing, item.obtainedCount));
            }
          });
          const ownedKinds = ownedCountMap.size;
          const totalKinds = totalKindSet.size;
          const ownedCount = Array.from(ownedCountMap.values()).reduce((sum, value) => sum + value, 0);
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

  const displayGroups = useMemo<ReceiveGachaGroup[]>(() => {
    if (digitalItemTypeFilter === '*') {
      return groups;
    }

    const selected = new Set(digitalItemTypeFilter);
    if (selected.size === 0) {
      return [];
    }

    return groups
      .map((group) => {
        const filteredItems = group.items.filter((item) => item.digitalItemType && selected.has(item.digitalItemType));
        if (filteredItems.length === 0) {
          return null;
        }

        const ownedCountMap = new Map<string, number>();
        const totalKindSet = new Set<string>();
        const sourceItems: ReceiveMediaItem[] = [];
        const seenSourceIds = new Set<string>();

        filteredItems.forEach((item) => {
          totalKindSet.add(item.baseKey);
          if (item.isOwned) {
            const existing = ownedCountMap.get(item.baseKey) ?? 0;
            ownedCountMap.set(item.baseKey, Math.max(existing, item.obtainedCount));
          }
          item.sourceItems.forEach((source) => {
            if (seenSourceIds.has(source.id)) {
              return;
            }
            seenSourceIds.add(source.id);
            sourceItems.push(source);
          });
        });

        const ownedKinds = ownedCountMap.size;
        const totalKinds = totalKindSet.size;
        const ownedCount = Array.from(ownedCountMap.values()).reduce((sum, value) => sum + value, 0);

        return {
          ...group,
          items: filteredItems,
          ownedKinds,
          totalKinds,
          ownedCount,
          sourceItems
        };
      })
      .filter((group): group is ReceiveGachaGroup => Boolean(group));
  }, [digitalItemTypeFilter, groups]);

  const isBaseEmpty = status === 'ready' && groups.length === 0;
  const isFilteredEmpty = status === 'ready' && groups.length > 0 && displayGroups.length === 0;
  const totalOwnedKinds = useMemo(() => displayGroups.reduce((sum, group) => sum + group.ownedKinds, 0), [displayGroups]);
  const totalKinds = useMemo(() => displayGroups.reduce((sum, group) => sum + group.totalKinds, 0), [displayGroups]);
  const totalOwnedCount = useMemo(() => displayGroups.reduce((sum, group) => sum + group.ownedCount, 0), [displayGroups]);
  const hasSaving = Boolean(savingGroupKey || savingItemKey);

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  }, []);

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
          {status === 'ready' && groups.length > 0 ? (
            <div className="receive-list-page__filter-row mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="receive-list-page__filter-label text-xs font-semibold text-muted-foreground">フィルタ</p>
              <div className="receive-list-page__filter-control w-full sm:w-[320px]">
                <MultiSelectDropdown<DigitalItemTypeKey>
                  value={digitalItemTypeFilter}
                  options={digitalItemTypeOptions}
                  onChange={setDigitalItemTypeFilter}
                  labels={{
                    all: 'すべて',
                    none: '未選択',
                    multiple: (count) => `${count}種類`
                  }}
                  renderButtonLabel={({ allSelected, selectedValues }) => {
                    if (allSelected) {
                      return 'タイプ: すべて';
                    }
                    if (selectedValues.size === 0) {
                      return 'タイプ: 未選択';
                    }
                    if (selectedValues.size === 1) {
                      const [single] = Array.from(selectedValues);
                      return `タイプ: ${getDigitalItemTypeLabel(single)}`;
                    }
                    return `タイプ: ${selectedValues.size}種類`;
                  }}
                  classNames={{
                    root: 'w-full',
                    button:
                      'w-full justify-between rounded-xl border border-border/60 bg-surface/40 px-4 py-2 text-sm font-semibold text-surface-foreground',
                    menu:
                      'w-full space-y-1 rounded-xl border border-border/60 bg-panel/95 p-2 backdrop-blur-sm'
                  }}
                />
              </div>
            </div>
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

        {isBaseEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            まだ所持アイテムがありません。/receive で受け取ると一覧に表示されます。
          </div>
        ) : null}

        {isFilteredEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            フィルタに一致するアイテムがありません。
          </div>
        ) : null}

        {displayGroups.length > 0 ? (
          <section className="flex flex-col gap-6">
            {displayGroups.map((group) => {
              const groupKey = group.gachaId ?? group.gachaName;
              const isCollapsed = Boolean(collapsedGroups[groupKey]);
              const contentId = createGroupDomId(groupKey);

              return (
                <div
                  key={groupKey}
                  className="rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKey)}
                      aria-expanded={!isCollapsed}
                      aria-controls={contentId}
                      className="group flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-surface-foreground">{group.gachaName}</h2>
                        <ChevronDownIcon
                          className={clsx(
                            'h-4 w-4 text-muted-foreground transition-transform',
                            isCollapsed ? '' : 'rotate-180'
                          )}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        所持 {group.ownedKinds} 種類 / 全 {group.totalKinds} 種類 ・ 合計 {group.ownedCount} 個
                      </p>
                      <p className="text-xs text-muted-foreground">
                        オーナー: {formatOwnerNames(group.ownerNames)}
                      </p>
                    </button>
                    <ReceiveBulkSaveButton
                      onClick={() => handleSaveGroup(group)}
                      isLoading={savingGroupKey === groupKey}
                      disabled={hasSaving || group.sourceItems.length === 0}
                      className="h-9 px-4 text-xs"
                    />
                  </div>
                  {!isCollapsed ? (
                    <div id={contentId} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((item) => (
                        <ReceiveInventoryItemCard
                          key={item.key}
                          item={item}
                          onSave={() => handleSaveItem(item)}
                          isSaving={savingItemKey === item.key || Boolean(savingGroupKey)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
      </main>
    </div>
  );
}
