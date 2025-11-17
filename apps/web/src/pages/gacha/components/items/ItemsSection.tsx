import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties
} from 'react';

import {
  ItemCard,
  type ItemCardModel,
  type ItemCardPreviewPayload,
  type RarityMeta
} from '../cards/ItemCard';
import { SectionContainer } from '../layout/SectionContainer';
import { useTabMotion } from '../../../../hooks/useTabMotion';
import { useModal } from '../../../../modals';
import { ItemDeleteConfirmDialog } from '../../../../modals/dialogs/ItemDeleteConfirmDialog';
import { PrizeSettingsDialog } from '../../../../modals/dialogs/PrizeSettingsDialog';
import { ItemAssetPreviewDialog } from '../../../../modals/dialogs/ItemAssetPreviewDialog';
import { useGachaLocalStorage } from '../../../../features/storage/useGachaLocalStorage';
import { useDomainStores } from '../../../../features/storage/AppPersistenceProvider';
import { type GachaCatalogItemV3, type RiaguCardModelV3 } from '@domain/app-persistence';
import { saveAsset, deleteAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';
import { generateItemId } from '@domain/idGenerators';
import { GachaTabs, type GachaTabOption } from '../common/GachaTabs';
import { useGachaDeletion } from '../../../../features/gacha/hooks/useGachaDeletion';
import { useResponsiveDashboard } from '../dashboard/useResponsiveDashboard';
import { ItemContextMenu } from './ItemContextMenu';
import {
  buildGachaPools,
  formatItemRateWithPrecision,
  inferRarityFractionDigits
} from '../../../../logic/gacha';

const FALLBACK_RARITY_COLOR = '#a1a1aa';
const PLACEHOLDER_CREATED_AT = '2024-01-01T00:00:00.000Z';

type ItemEntry = {
  model: ItemCardModel;
  rarity: RarityMeta;
  riaguCard?: RiaguCardModelV3;
  itemRate?: number;
  itemRateDisplay?: string;
};
type ItemsByGacha = Record<string, ItemEntry[]>;
type RarityOptionEntry = { id: string; label: string; color?: string | null };
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type ContextMenuState = { anchor: { x: number; y: number }; targetIds: string[]; anchorId: string };

function getSequentialItemName(position: number): string {
  if (Number.isNaN(position) || !Number.isFinite(position)) {
    return 'A';
  }

  let index = Math.max(0, Math.floor(position));
  let name = '';

  while (index >= 0) {
    name = `${ALPHABET[index % ALPHABET.length]}${name}`;
    index = Math.floor(index / ALPHABET.length) - 1;
  }

  return name || 'A';
}

export function ItemsSection(): JSX.Element {
  const { catalog: catalogStore, pullHistory: pullHistoryStore, riagu: riaguStore } = useDomainStores();
  const { status, data } = useGachaLocalStorage();
  const { push } = useModal();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const confirmDeleteGacha = useGachaDeletion();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(null);
  const sectionWrapperRef = useRef<HTMLDivElement | null>(null);
  const [forceMobileSection, setForceMobileSection] = useState(false);
  const { isMobile } = useResponsiveDashboard();
  const [gridTemplateColumns, setGridTemplateColumns] = useState(
    'repeat(auto-fit,minmax(100px,181px))'
  );
  const computeGridTemplateColumns = useCallback((width: number) => {
    const gap = 16; // gap-4 => 1rem
    const minWidth = 100;
    const maxWidth = 200;
    const idealWidth = 181;

    if (!Number.isFinite(width) || width <= 0) {
      return `repeat(auto-fit,minmax(${minWidth}px,${idealWidth}px))`;
    }

    const calculateCardWidth = (columns: number) => {
      if (columns <= 0) {
        return idealWidth;
      }

      const totalGap = gap * Math.max(0, columns - 1);
      return (width - totalGap) / columns;
    };

    const clampWidth = (value: number) => Math.max(minWidth, Math.min(maxWidth, value));

    let columns = Math.max(1, Math.round((width + gap) / (idealWidth + gap)));
    let cardWidth = calculateCardWidth(columns);

    while (columns > 1 && cardWidth < minWidth) {
      columns -= 1;
      cardWidth = calculateCardWidth(columns);
    }

    let safety = 0;
    while (cardWidth > maxWidth && safety < 50) {
      columns += 1;
      cardWidth = calculateCardWidth(columns);
      safety += 1;
    }

    const finalWidth = clampWidth(cardWidth);
    const roundedWidth = Math.round(finalWidth * 100) / 100;

    return `repeat(${columns}, minmax(${minWidth}px, ${roundedWidth}px))`;
  }, []);

  const rarityOptionsByGacha = useMemo(() => {
    if (!data?.rarityState) {
      return {} as Record<string, RarityOptionEntry[]>;
    }

    return Object.entries(data.rarityState.byGacha ?? {}).reduce<Record<string, RarityOptionEntry[]>>(
      (acc, [gachaId, rarityIds]) => {
        acc[gachaId] = rarityIds.map((rarityId) => {
          const entity = data.rarityState?.entities?.[rarityId];
          return { id: rarityId, label: entity?.label ?? rarityId, color: entity?.color ?? null };
        });
        return acc;
      },
      {}
    );
  }, [data?.rarityState]);

  const gachaTabs = useMemo<GachaTabOption[]>(() => {
    if (!data?.appState || !data?.catalogState) {
      return [];
    }

    const catalogByGacha = data.catalogState.byGacha ?? {};
    const ordered = data.appState.order ?? Object.keys(catalogByGacha);

    const knownGachaIds = ordered.filter((gachaId) => catalogByGacha[gachaId]);
    const rest = Object.keys(catalogByGacha).filter((gachaId) => !knownGachaIds.includes(gachaId));
    const activeOrder = [...knownGachaIds, ...rest].filter((gachaId) => {
      const meta = data.appState?.meta?.[gachaId];
      return meta?.isArchived !== true;
    });

    return activeOrder.map((gachaId) => ({
      id: gachaId,
      label: data.appState?.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [data?.appState, data?.catalogState]);

  const gachaTabIds = useMemo(() => gachaTabs.map((tab) => tab.id), [gachaTabs]);

  const rarityFractionDigits = useMemo(
    () => inferRarityFractionDigits(data?.rarityState),
    [data?.rarityState]
  );

  const { poolsByGachaId, itemsById } = useMemo(
    () =>
      buildGachaPools({
        catalogState: data?.catalogState,
        rarityState: data?.rarityState,
        rarityFractionDigits
      }),
    [data?.catalogState, data?.rarityState, rarityFractionDigits]
  );

  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const { itemsByGacha, flatItems } = useMemo(() => {
    if (!data?.catalogState) {
      return { itemsByGacha: {} as ItemsByGacha, flatItems: [] as ItemEntry[] };
    }

    const catalogByGacha = data.catalogState.byGacha ?? {};
    const riaguCards = data.riaguState?.riaguCards ?? {};
    const riaguIndex = data.riaguState?.indexByItemId ?? {};
    const rarityEntities = data.rarityState?.entities ?? {};
    const entries: ItemsByGacha = {};
    const flat: ItemEntry[] = [];

    Object.keys(catalogByGacha).forEach((gachaId) => {
      const catalog = catalogByGacha[gachaId];
      if (!catalog?.order?.length) {
        return;
      }

      const pool = poolsByGachaId.get(gachaId);
      if (!pool) {
        return;
      }

      const gachaMeta = data.appState?.meta?.[gachaId];
      const results: ItemEntry[] = [];

      catalog.order.forEach((itemId) => {
        const snapshot = catalog.items[itemId];
        if (!snapshot) {
          return;
        }

        const poolItem = itemsById.get(snapshot.itemId);
        const rarityEntity = rarityEntities[snapshot.rarityId];
        const rarityGroup = pool.rarityGroups.get(snapshot.rarityId);

        const emitRate = poolItem?.rarityEmitRate ?? rarityEntity?.emitRate;
        const baseWeight = poolItem?.drawWeight ?? (snapshot.pickupTarget ? 2 : 1);
        const computedItemRate =
          poolItem?.itemRate ??
          (rarityGroup?.emitRate && rarityGroup?.totalWeight
            ? (rarityGroup.emitRate * baseWeight) / rarityGroup.totalWeight
            : undefined);
        const ratePrecision = rarityFractionDigits.get(snapshot.rarityId);
        const baseDisplay = poolItem?.itemRateDisplay
          ? poolItem.itemRateDisplay.replace(/%$/, '')
          : '';
        const formattedRate = baseDisplay
          ? baseDisplay
          : formatItemRateWithPrecision(computedItemRate, ratePrecision);
        const itemRateDisplay = formattedRate ? `${formattedRate}%` : '';

        const rarity: RarityMeta = {
          rarityId: snapshot.rarityId,
          label: poolItem?.rarityLabel ?? rarityEntity?.label ?? snapshot.rarityId,
          color: poolItem?.rarityColor ?? rarityEntity?.color ?? FALLBACK_RARITY_COLOR,
          emitRate,
          rarityNum: rarityEntity?.rarityNum,
          itemRate: computedItemRate,
          itemRateDisplay
        };

        const riaguId = riaguIndex[snapshot.itemId];
        const riaguCard = riaguId ? riaguCards[riaguId] : undefined;

        const imageAssetId = snapshot.imageAssetId ?? null;
        const thumbnailAssetId = snapshot.thumbnailAssetId ?? null;
        const hasImage = Boolean(thumbnailAssetId || imageAssetId);

        const model: ItemCardModel = {
          itemId: snapshot.itemId,
          gachaId,
          gachaDisplayName: gachaMeta?.displayName ?? gachaId,
          rarityId: snapshot.rarityId,
          name: snapshot.name,
          imageAsset: {
            thumbnailUrl: null,
            thumbnailAssetId,
            assetHash: imageAssetId,
            hasImage
          },
          isRiagu: Boolean(snapshot.riagu || riaguCard),
          completeTarget: Boolean(snapshot.completeTarget),
          pickupTarget: Boolean(snapshot.pickupTarget),
          order: snapshot.order ?? 0,
          createdAt: gachaMeta?.createdAt ?? snapshot.updatedAt ?? PLACEHOLDER_CREATED_AT,
          updatedAt: snapshot.updatedAt ?? PLACEHOLDER_CREATED_AT
        };

        const entry: ItemEntry = {
          model,
          rarity,
          riaguCard,
          itemRate: computedItemRate,
          itemRateDisplay
        };
        results.push(entry);
        flat.push(entry);
      });

      entries[gachaId] = results;
    });

    return { itemsByGacha: entries, flatItems: flat };
  }, [data?.appState, data?.catalogState, data?.rarityState, itemsById, poolsByGachaId, rarityFractionDigits]);

  const itemEntryById = useMemo(() => {
    const map = new Map<string, ItemEntry>();
    flatItems.forEach((entry) => {
      map.set(entry.model.itemId, entry);
    });
    return map;
  }, [flatItems]);

  useEffect(() => {
    if (!gachaTabs.length) {
      setActiveGachaId(null);
      return;
    }

    setActiveGachaId((current) => {
      if (current && gachaTabs.some((tab) => tab.id === current)) {
        return current;
      }

      const preferred = data?.appState?.selectedGachaId;
      if (preferred && gachaTabs.some((tab) => tab.id === preferred)) {
        return preferred;
      }

      return gachaTabs[0].id;
    });
  }, [data?.appState?.selectedGachaId, gachaTabs]);

  const items = activeGachaId ? itemsByGacha[activeGachaId] ?? [] : [];

  const visibleIdSet = useMemo(() => new Set(items.map((entry) => entry.model.itemId)), [items]);

  useEffect(() => {
    setSelectedItemIds((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const next = previous.filter((id) => visibleIdSet.has(id));
      if (next.length !== previous.length) {
        return next;
      }

      for (let index = 0; index < next.length; index += 1) {
        if (next[index] !== previous[index]) {
          return next;
        }
      }

      return previous;
    });
  }, [visibleIdSet]);

  useEffect(() => {
    setSelectedItemIds([]);
    setContextMenuState(null);
  }, [activeGachaId]);

  useEffect(() => {
    const element = sectionWrapperRef.current;
    if (!element) {
      return;
    }

    const updateLayout = (width: number) => {
      setForceMobileSection(width <= 300);
      setGridTemplateColumns(computeGridTemplateColumns(width));
    };

    updateLayout(element.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry ? entry.contentRect.width : element.getBoundingClientRect().width;
      updateLayout(width);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [computeGridTemplateColumns]);

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  const selectedIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const selectedEntries = useMemo(
    () => items.filter((entry) => selectedIdSet.has(entry.model.itemId)),
    [items, selectedIdSet]
  );

  const rarityOptionsForActiveGacha = useMemo(
    () => (activeGachaId ? rarityOptionsByGacha[activeGachaId] ?? [] : []),
    [activeGachaId, rarityOptionsByGacha]
  );

  const selectionSummary = useMemo(() => {
    if (selectedEntries.length === 0) {
      return {
        allPickup: false,
        anyPickup: false,
        allComplete: false,
        anyComplete: false,
        allRiagu: false,
        anyRiagu: false,
        currentRarityId: null as string | null
      };
    }

    const allPickup = selectedEntries.every((entry) => entry.model.pickupTarget);
    const anyPickup = selectedEntries.some((entry) => entry.model.pickupTarget);
    const allComplete = selectedEntries.every((entry) => entry.model.completeTarget);
    const anyComplete = selectedEntries.some((entry) => entry.model.completeTarget);
    const allRiagu = selectedEntries.every((entry) => entry.model.isRiagu);
    const anyRiagu = selectedEntries.some((entry) => entry.model.isRiagu);
    const uniqueRarity = new Set(selectedEntries.map((entry) => entry.model.rarityId));

    return {
      allPickup,
      anyPickup,
      allComplete,
      anyComplete,
      allRiagu,
      anyRiagu,
      currentRarityId: uniqueRarity.size === 1 ? selectedEntries[0].model.rarityId : null
    };
  }, [selectedEntries]);

  const handleSurfaceMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest('[data-item-id]')) {
          return;
        }
        if (target.closest('[data-add-item-card]')) {
          return;
        }
      }

      closeContextMenu();
      if (!event.ctrlKey && !event.metaKey) {
        setSelectedItemIds([]);
      }
    },
    [closeContextMenu]
  );

  const handleCardMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, itemId: string) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const clickedButton = target?.closest('button');
      const isMulti = event.ctrlKey || event.metaKey;

      if (clickedButton) {
        const isPreviewButton = clickedButton.matches('[data-preview-button="true"]');
        if (!isMulti || !isPreviewButton) {
          return;
        }
      }

      event.preventDefault();
      closeContextMenu();

      setSelectedItemIds((previous) => {
        const next = new Set(previous);
        if (isMulti) {
          if (next.has(itemId)) {
            next.delete(itemId);
          } else {
            next.add(itemId);
          }
          return Array.from(next);
        }
        return [itemId];
      });
    },
    [closeContextMenu]
  );

  const handleCardContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, itemId: string) => {
      event.preventDefault();

      const isMulti = event.ctrlKey || event.metaKey;
      const previousSet = new Set(selectedItemIds);
      let nextSet = new Set(previousSet);

      if (!previousSet.has(itemId)) {
        nextSet = isMulti ? new Set([...previousSet, itemId]) : new Set([itemId]);
      } else if (isMulti) {
        if (nextSet.size > 1) {
          nextSet.delete(itemId);
        }
      }

      if (!nextSet.has(itemId)) {
        nextSet.add(itemId);
      }

      const nextIds = Array.from(nextSet);
      setSelectedItemIds(nextIds);
      setContextMenuState({
        anchor: { x: event.clientX, y: event.clientY },
        targetIds: nextIds,
        anchorId: itemId
      });
    },
    [selectedItemIds]
  );

  const applyRarityToItems = useCallback(
    (targetIds: string[], rarityId: string) => {
      if (!rarityId) {
        return;
      }

      const timestamp = new Date().toISOString();

      targetIds.forEach((itemId) => {
        const entry = itemEntryById.get(itemId);
        if (!entry || entry.model.rarityId === rarityId) {
          return;
        }

        const patch: Partial<GachaCatalogItemV3> = { rarityId };
        catalogStore.updateItem({
          gachaId: entry.model.gachaId,
          itemId: entry.model.itemId,
          patch,
          updatedAt: timestamp
        });
      });
    },
    [catalogStore, itemEntryById]
  );

  const applyFlagToItems = useCallback(
    (targetIds: string[], field: 'pickupTarget' | 'completeTarget', nextValue: boolean) => {
      const timestamp = new Date().toISOString();

      targetIds.forEach((itemId) => {
        const entry = itemEntryById.get(itemId);
        if (!entry) {
          return;
        }

        const currentValue = field === 'pickupTarget' ? entry.model.pickupTarget : entry.model.completeTarget;
        if (currentValue === nextValue) {
          return;
        }

        const patch: Partial<GachaCatalogItemV3> =
          field === 'pickupTarget' ? { pickupTarget: nextValue } : { completeTarget: nextValue };

        catalogStore.updateItem({
          gachaId: entry.model.gachaId,
          itemId: entry.model.itemId,
          patch,
          updatedAt: timestamp
        });
      });
    },
    [catalogStore, itemEntryById]
  );

  const applyRiaguToItems = useCallback(
    (targetIds: string[], nextValue: boolean) => {
      const timestamp = new Date().toISOString();

      targetIds.forEach((itemId) => {
        const entry = itemEntryById.get(itemId);
        if (!entry || entry.model.isRiagu === nextValue) {
          return;
        }

        const patch: Partial<GachaCatalogItemV3> = { riagu: nextValue };
        catalogStore.updateItem({
          gachaId: entry.model.gachaId,
          itemId: entry.model.itemId,
          patch,
          updatedAt: timestamp
        });

        if (nextValue) {
          riaguStore.upsertCard({ itemId, gachaId: entry.model.gachaId }, { persist: 'debounced' });
        } else {
          riaguStore.removeByItemId(itemId, { persist: 'debounced' });
        }
      });
    },
    [catalogStore, itemEntryById, riaguStore]
  );

  const deleteItems = useCallback(
    (targetIds: string[]) => {
      if (targetIds.length === 0) {
        return;
      }

      const timestamp = new Date().toISOString();

      targetIds.forEach((itemId) => {
        const entry = itemEntryById.get(itemId);
        if (!entry) {
          return;
        }

        catalogStore.removeItem({ gachaId: entry.model.gachaId, itemId, updatedAt: timestamp });
        pullHistoryStore.deleteManualEntriesForItem({
          gachaId: entry.model.gachaId,
          itemId
        });
        riaguStore.removeByItemId(itemId, { persist: 'immediate' });
      });

      setSelectedItemIds([]);
      closeContextMenu();
    },
    [catalogStore, closeContextMenu, itemEntryById, pullHistoryStore, riaguStore]
  );

  const handleDeleteRequest = useCallback(
    (targetIds: string[]) => {
      if (targetIds.length === 0) {
        return;
      }

      const baseEntries = targetIds
        .map((itemId) => itemEntryById.get(itemId))
        .filter((entry): entry is ItemEntry => Boolean(entry));

      if (baseEntries.length === 0) {
        return;
      }

      const itemNames = baseEntries.map((entry) => entry.model.name).filter(Boolean);
      const uniqueGachaNames = new Set(
        baseEntries
          .map((entry) => entry.model.gachaDisplayName?.trim())
          .filter((name): name is string => Boolean(name))
      );

      const assignmentRecords = targetIds
        .flatMap((itemId) => data?.userInventories?.byItemId?.[itemId] ?? [])
        .filter((record) => Boolean(record?.userId));

      const userProfiles = data?.userProfiles?.users ?? {};
      const winnerMap = new Map<string, string>();
      assignmentRecords.forEach((record) => {
        if (!record?.userId || winnerMap.has(record.userId)) {
          return;
        }

        const profile = userProfiles[record.userId];
        const displayName = profile?.displayName?.trim() || profile?.handle?.trim() || record.userId;
        winnerMap.set(record.userId, displayName);
      });

      const winnerNames = Array.from(winnerMap.values());
      const hasUserReferences = winnerNames.length > 0;

      const displayItemName =
        targetIds.length === 1 && itemNames[0]
          ? itemNames[0]
          : `選択した${targetIds.length}件のアイテム`;

      push(ItemDeleteConfirmDialog, {
        id: `items-delete-${targetIds[0]}`,
        title: 'アイテムを削除',
        payload: {
          itemId: targetIds[0],
          itemName: displayItemName,
          gachaName:
            uniqueGachaNames.size === 1
              ? Array.from(uniqueGachaNames)[0]
              : targetIds.length === 1
              ? baseEntries[0].model.gachaDisplayName
              : undefined,
          hasUserReferences,
          winnerNames,
          onConfirm: () => {
            deleteItems(targetIds);
          }
        }
      });
    },
    [
      data?.userInventories?.byItemId,
      data?.userProfiles?.users,
      deleteItems,
      itemEntryById,
      push
    ]
  );

  const canAddItems = useMemo(() => {
    if (status !== 'ready' || !activeGachaId) {
      return false;
    }

    const gachaCatalog = data?.catalogState?.byGacha?.[activeGachaId];
    const rarityIds = data?.rarityState?.byGacha?.[activeGachaId] ?? [];
    return Boolean(gachaCatalog && rarityIds.length > 0);
  }, [activeGachaId, data?.catalogState, data?.rarityState, status]);

  const showAddCard = status === 'ready' && Boolean(activeGachaId);

  const getDefaultRarityId = useCallback(
    (gachaId: string): string | null => {
      const rarityState = data?.rarityState;
      if (!rarityState) {
        return null;
      }

      const rarityIds = rarityState.byGacha?.[gachaId] ?? [];
      if (rarityIds.length === 0) {
        return null;
      }

      let selectedId: string | null = null;
      let minEmitRate = Number.POSITIVE_INFINITY;

      rarityIds.forEach((rarityId) => {
        const entity = rarityState.entities?.[rarityId];
        const emitRate = entity?.emitRate;
        if (typeof emitRate === 'number' && Number.isFinite(emitRate) && emitRate < minEmitRate) {
          minEmitRate = emitRate;
          selectedId = rarityId;
        }
      });

      return selectedId ?? rarityIds[0] ?? null;
    },
    [data?.rarityState]
  );

  const handleAddCardClick = useCallback(() => {
    if (!showAddCard || !canAddItems) {
      return;
    }

    const input = fileInputRef.current;
    if (input) {
      input.click();
    }
  }, [canAddItems, showAddCard]);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const files = input.files ? Array.from(input.files) : [];
      input.value = '';

      if (files.length === 0) {
        return;
      }

      if (!activeGachaId) {
        console.warn('ファイル選択時に有効なガチャが見つかりませんでした');
        return;
      }

      const catalogState = data?.catalogState;
      const gachaCatalog = catalogState?.byGacha?.[activeGachaId];
      if (!gachaCatalog) {
        console.warn(`ガチャ ${activeGachaId} のカタログが見つかりませんでした`);
        return;
      }

      const rarityId = getDefaultRarityId(activeGachaId);
      if (!rarityId) {
        console.warn('追加可能なレアリティが見つかりませんでした');
        return;
      }

      let assetRecords: StoredAssetRecord[] = [];

      try {
        const storedRecords = await Promise.all(
          Array.from(files, async (file) => await saveAsset(file))
        );
        assetRecords = storedRecords;

        const baseOrder = gachaCatalog.order?.length ?? 0;
        const timestamp = new Date().toISOString();

        const itemsToAdd: GachaCatalogItemV3[] = assetRecords.map((asset, index) => {
          const position = baseOrder + index;
          return {
            itemId: generateItemId(),
            name: getSequentialItemName(position),
            rarityId,
            order: position + 1,
            pickupTarget: false,
            completeTarget: false,
            imageAssetId: asset.id,
            thumbnailAssetId: asset.previewId ?? null,
            riagu: false,
            updatedAt: timestamp
          } satisfies GachaCatalogItemV3;
        });

        catalogStore.addItems({ gachaId: activeGachaId, items: itemsToAdd, updatedAt: timestamp });
      } catch (error) {
        console.error('景品の追加に失敗しました', error);
        if (assetRecords.length > 0) {
          void Promise.allSettled(assetRecords.map((record) => deleteAsset(record.id)));
        }
      }
    },
    [activeGachaId, catalogStore, data?.catalogState, getDefaultRarityId]
  );

  const gridClassName = useMemo(
    () =>
      clsx(
        'items-section__grid gap-4',
        isMobile ? 'flex flex-col px-4' : 'grid pl-4 pr-2'
      ),
    [isMobile]
  );

  const gridStyle = useMemo<CSSProperties | undefined>(
    () => (isMobile ? undefined : { gridTemplateColumns }),
    [isMobile, gridTemplateColumns]
  );

  const handleEditImage = useCallback(
    (itemId: string) => {
      const target = flatItems.find((entry) => entry.model.itemId === itemId);
      if (!target) {
        return;
      }

      const { model, rarity, riaguCard } = target;
      const assignmentRecords = data?.userInventories?.byItemId?.[model.itemId] ?? [];
      const userProfiles = data?.userProfiles?.users ?? {};
      const assignmentUsersMap = new Map<string, { userId: string; displayName: string }>();
      assignmentRecords.forEach((record) => {
        if (!record?.userId || assignmentUsersMap.has(record.userId)) {
          return;
        }

        const profile = userProfiles[record.userId];
        const displayName = profile?.displayName?.trim() || record.userId;
        assignmentUsersMap.set(record.userId, { userId: record.userId, displayName });
      });
      const assignmentUsers = Array.from(assignmentUsersMap.values());
      const riaguAssignmentCount = assignmentRecords.reduce((total, record) => total + Math.max(0, record.count ?? 0), 0);
      const rarityOptions = rarityOptionsByGacha[model.gachaId] ?? [rarity].map((entry) => ({
        id: entry.rarityId,
        label: entry.label,
        color: entry.color
      }));

      push(PrizeSettingsDialog, {
        id: `prize-settings-${model.itemId}`,
        title: 'アイテムの詳細設定',
        description: 'プレビュー・レアリティ・リアグ設定をまとめて更新します。',
        size: 'lg',
        payload: {
          gachaId: model.gachaId,
          itemId: model.itemId,
          itemName: model.name,
          gachaName: model.gachaDisplayName,
          rarityId: model.rarityId,
          rarityLabel: rarity.label,
          rarityOptions,
          pickupTarget: model.pickupTarget,
          completeTarget: model.completeTarget,
          isRiagu: model.isRiagu,
          hasRiaguCard: Boolean(riaguCard),
          riaguAssignmentCount,
          thumbnailAssetId: model.imageAsset.thumbnailAssetId,
          thumbnailUrl: model.imageAsset.thumbnailUrl,
          rarityColor: rarity.color,
          riaguPrice: riaguCard?.unitCost,
          riaguType: riaguCard?.typeLabel,
          imageAssetId: model.imageAsset.assetHash,
          assignmentUsers,
          onSave: (payload) => {
            try {
              const timestamp = new Date().toISOString();
              const patch: Partial<GachaCatalogItemV3> = {
                name: payload.name,
                rarityId: payload.rarityId,
                pickupTarget: payload.pickupTarget,
                completeTarget: payload.completeTarget,
                riagu: payload.riagu,
                imageAssetId: typeof payload.imageAssetId === 'string' ? payload.imageAssetId : null,
                thumbnailAssetId:
                  typeof payload.thumbnailAssetId === 'string' ? payload.thumbnailAssetId : null
              };
              catalogStore.updateItem({
                gachaId: model.gachaId,
                itemId: model.itemId,
                patch,
                updatedAt: timestamp
              });

              if (payload.riagu) {
                if (!riaguCard) {
                  riaguStore.upsertCard(
                    {
                      itemId: model.itemId,
                      gachaId: model.gachaId
                    },
                    { persist: 'debounced' }
                  );
                }
              } else {
                riaguStore.removeByItemId(model.itemId, { persist: 'debounced' });
              }

            } catch (error) {
              console.error('景品設定の保存に失敗しました', error);
            }
          },
          onDelete: ({ itemId, gachaId }) => {
            try {
              const timestamp = new Date().toISOString();
              catalogStore.removeItem({ gachaId, itemId, updatedAt: timestamp });
              pullHistoryStore.deleteManualEntriesForItem({
                gachaId,
                itemId
              });
              riaguStore.removeByItemId(itemId, { persist: 'immediate' });
            } catch (error) {
              console.error('景品の削除に失敗しました', error);
            }
          }
        }
      });
    },
    [
      catalogStore,
      data?.userInventories?.byItemId,
      data?.userProfiles?.users,
      flatItems,
      push,
      rarityOptionsByGacha,
      riaguStore,
      pullHistoryStore
    ]
  );

  const handlePreviewAsset = useCallback(
    (payload: ItemCardPreviewPayload) => {
      const target = flatItems.find((entry) => entry.model.itemId === payload.itemId);
      if (!target) {
        return;
      }

      push(ItemAssetPreviewDialog, {
        id: `item-preview-${payload.itemId}`,
        title: payload.itemName,
        description: payload.gachaDisplayName,
        size: 'full',
        payload: {
          itemId: payload.itemId,
          itemName: payload.itemName,
          gachaName: payload.gachaDisplayName,
          rarityLabel: target.rarity.label,
          rarityColor: target.rarity.color,
          assetHash: payload.assetHash,
          thumbnailAssetId: payload.thumbnailAssetId,
          thumbnailUrl: payload.thumbnailUrl
        }
      });
    },
    [flatItems, push]
  );

  const pickupActionLabel = selectionSummary.allPickup ? 'ピックアップを解除' : 'ピックアップに設定';
  const completeActionLabel = selectionSummary.allComplete ? 'コンプ対象から除外' : 'コンプ対象に設定';
  const riaguActionLabel = selectionSummary.allRiagu ? 'リアグを解除' : 'リアグに設定';

  return (
      <div ref={sectionWrapperRef} className="h-full">
        <SectionContainer
          id="items"
          title="アイテム設定"
          description="カタログ内のアイテムを整理し、画像・リアグ状態を管理します。"
          actions={
            <button
              type="button"
              className="items-section__filter-button chip border-accent/40 bg-accent/10 text-accent"
              onClick={() => console.info('フィルタモーダルは未実装です')}
            >
              <AdjustmentsHorizontalIcon className="h-4 w-4" />
              フィルタ
            </button>
          }
          contentClassName="items-section__content"
          forceMobile={forceMobileSection}
        >
          <GachaTabs
            tabs={gachaTabs}
            activeId={activeGachaId}
            onSelect={(gachaId) => setActiveGachaId(gachaId)}
            onDelete={(tab) => confirmDeleteGacha(tab)}
            className="items-section__tabs"
          />

          <div className="items-section__scroll section-scroll flex-1">
            <div className="items-section__scroll-content space-y-4">
              {gachaTabs.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">表示できるガチャがありません。</p>
              ) : null}

              <div className="tab-panel-viewport">
                <div
                  key={activeGachaId ?? 'items-empty'}
                  className={panelAnimationClass}
                >
                  {status !== 'ready' ? (
                    <p className="text-sm text-muted-foreground">ローカルストレージからデータを読み込み中です…</p>
                  ) : null}
                  {status === 'ready' && activeGachaId && items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">このガチャには表示できるアイテムがありません。</p>
                  ) : null}

                  {showAddCard || items.length > 0 ? (
                    <div onMouseDown={handleSurfaceMouseDown}>
                      <div className={gridClassName} style={gridStyle}>
                        {showAddCard ? (
                          <AddItemCard onClick={handleAddCardClick} disabled={!canAddItems} />
                        ) : null}
                        {items.map(({ model, rarity, itemRateDisplay }) => (
                          <ItemCard
                            key={model.itemId}
                            model={model}
                            rarity={rarity}
                            rarityRateLabel={itemRateDisplay}
                            onEditImage={handleEditImage}
                            onPreviewAsset={handlePreviewAsset}
                            isSelected={selectedIdSet.has(model.itemId)}
                            onCardMouseDown={(event) => handleCardMouseDown(event, model.itemId)}
                            onCardContextMenu={(event) => handleCardContextMenu(event, model.itemId)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.m4a,audio/mp4"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          {contextMenuState ? (
            <ItemContextMenu
              anchor={contextMenuState.anchor}
              selectedCount={contextMenuState.targetIds.length}
              rarityOptions={rarityOptionsForActiveGacha}
              currentRarityId={selectionSummary.currentRarityId}
              pickupLabel={pickupActionLabel}
              completeLabel={completeActionLabel}
              riaguLabel={riaguActionLabel}
              onSelectRarity={(rarityId) => applyRarityToItems(contextMenuState.targetIds, rarityId)}
              onEditImage={() => handleEditImage(contextMenuState.anchorId)}
              onTogglePickup={() =>
                applyFlagToItems(contextMenuState.targetIds, 'pickupTarget', !selectionSummary.allPickup)
              }
              onToggleComplete={() =>
                applyFlagToItems(contextMenuState.targetIds, 'completeTarget', !selectionSummary.allComplete)
              }
              onToggleRiagu={() => applyRiaguToItems(contextMenuState.targetIds, !selectionSummary.allRiagu)}
              onDelete={() => handleDeleteRequest(contextMenuState.targetIds)}
              onClose={closeContextMenu}
              disableEditImage={contextMenuState.targetIds.length !== 1}
            />
          ) : null}
        </SectionContainer>
    </div>
  );
}

interface AddItemCardProps {
  onClick: () => void;
  disabled?: boolean;
}

function AddItemCard({ onClick, disabled }: AddItemCardProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();

  return (
    <button
      type="button"
      aria-label="景品を追加"
      data-add-item-card="true"
      className={clsx(
        'item-card item-card--add relative flex h-full overflow-visible rounded-2xl border border-dashed border-accent/40 bg-surface/20 p-[10px] text-left transition focus:outline-none',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-accent/70 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-accent/50'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <div className={clsx('flex w-full gap-3', isMobile ? 'flex-row items-start' : 'flex-col')}>
        <div
          className={clsx(
            'flex items-center justify-center rounded-xl border border-dashed border-accent/40 bg-panel-muted text-5xl font-semibold text-accent',
            isMobile ? 'h-24 w-24 flex-shrink-0' : 'aspect-square w-full'
          )}
        >
          +
        </div>
        <div className={clsx('flex flex-1 flex-col', isMobile ? 'gap-2' : 'gap-1')}>
          <h3 className="text-sm font-semibold text-surface-foreground">景品を追加</h3>
          <p className="text-xs text-muted-foreground">画像・動画・音声ファイルを登録</p>
        </div>
      </div>
    </button>
  );
}
