import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import {
  ItemCard,
  type ItemCardModel,
  type ItemCardPreviewPayload,
  type RarityMeta
} from '../../../components/cards/ItemCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useModal } from '../../../components/modal';
import { PrizeSettingsDialog } from '../dialogs/PrizeSettingsDialog';
import { ItemAssetPreviewDialog } from '../dialogs/ItemAssetPreviewDialog';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { type GachaCatalogItemV3, type RiaguCardModelV3 } from '@domain/app-persistence';
import { saveAsset, deleteAsset, type StoredAssetRecord } from '@domain/assets/assetStorage';
import { generateItemId } from '@domain/idGenerators';

const FALLBACK_RARITY_COLOR = '#a1a1aa';
const PLACEHOLDER_CREATED_AT = '2024-01-01T00:00:00.000Z';

type ItemEntry = { model: ItemCardModel; rarity: RarityMeta; riaguCard?: RiaguCardModelV3 };
type ItemsByGacha = Record<string, ItemEntry[]>;
type GachaTab = { id: string; label: string };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
  const { catalog: catalogStore, userInventories: userInventoryStore, riagu: riaguStore } = useDomainStores();
  const { status, data } = useGachaLocalStorage();
  const { push } = useModal();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const defaultGridWidthRef = useRef<number | null>(null);
  const [isCondensedGrid, setIsCondensedGrid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rarityOptionsByGacha = useMemo(() => {
    if (!data?.rarityState) {
      return {} as Record<string, Array<{ id: string; label: string }>>;
    }

    return Object.entries(data.rarityState.byGacha ?? {}).reduce<Record<string, Array<{ id: string; label: string }>>>(
      (acc, [gachaId, rarityIds]) => {
        acc[gachaId] = rarityIds.map((rarityId) => {
          const entity = data.rarityState?.entities?.[rarityId];
          return { id: rarityId, label: entity?.label ?? rarityId };
        });
        return acc;
      },
      {}
    );
  }, [data?.rarityState]);

  const gachaTabs = useMemo<GachaTab[]>(() => {
    if (!data?.appState || !data?.catalogState) {
      return [];
    }

    const catalogByGacha = data.catalogState.byGacha ?? {};
    const ordered = data.appState.order ?? Object.keys(catalogByGacha);

    const knownGachaIds = ordered.filter((gachaId) => catalogByGacha[gachaId]);
    const rest = Object.keys(catalogByGacha).filter((gachaId) => !knownGachaIds.includes(gachaId));
    const finalOrder = [...knownGachaIds, ...rest];

    return finalOrder.map((gachaId) => ({
      id: gachaId,
      label: data.appState?.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [data?.appState, data?.catalogState]);

  const gachaTabIds = useMemo(() => gachaTabs.map((tab) => tab.id), [gachaTabs]);

  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const { itemsByGacha, flatItems } = useMemo(() => {
    if (!data?.appState || !data?.catalogState || !data?.rarityState) {
      return { itemsByGacha: {} as ItemsByGacha, flatItems: [] as ItemEntry[] };
    }

    const catalogByGacha = data.catalogState.byGacha ?? {};
    const riaguCards = data.riaguState?.riaguCards ?? {};
    const riaguIndex = data.riaguState?.indexByItemId ?? {};
    const entries: ItemsByGacha = {};
    const flat: ItemEntry[] = [];

    Object.keys(catalogByGacha).forEach((gachaId) => {
      const gachaMeta = data.appState?.meta?.[gachaId];
      const catalog = catalogByGacha[gachaId];
      const results: ItemEntry[] = [];

      catalog.order.forEach((itemId) => {
        const snapshot = catalog.items[itemId];
        if (!snapshot) {
          return;
        }

        const rarityEntity = data.rarityState?.entities?.[snapshot.rarityId];
        const rarity: RarityMeta = {
          rarityId: snapshot.rarityId,
          label: rarityEntity?.label ?? snapshot.rarityId,
          color: rarityEntity?.color ?? FALLBACK_RARITY_COLOR
        };

        const riaguId = riaguIndex[snapshot.itemId];
        const riaguCard = riaguId ? riaguCards[riaguId] : undefined;

        const model: ItemCardModel = {
          itemId: snapshot.itemId,
          gachaId,
          gachaDisplayName: gachaMeta?.displayName ?? gachaId,
          rarityId: snapshot.rarityId,
          name: snapshot.name,
          imageAsset: {
            thumbnailUrl:
              snapshot.imageAssetId
                ? `https://picsum.photos/seed/${encodeURIComponent(snapshot.imageAssetId)}/400/400`
                : null,
            assetHash: snapshot.imageAssetId ?? null,
            hasImage: Boolean(snapshot.imageAssetId)
          },
          isRiagu: Boolean(snapshot.riagu || riaguCard),
          completeTarget: Boolean(snapshot.completeTarget),
          pickupTarget: Boolean(snapshot.pickupTarget),
          order: snapshot.order ?? 0,
          createdAt: gachaMeta?.createdAt ?? snapshot.updatedAt ?? PLACEHOLDER_CREATED_AT,
          updatedAt: snapshot.updatedAt ?? PLACEHOLDER_CREATED_AT
        };

        const entry = { model, rarity, riaguCard };
        results.push(entry);
        flat.push(entry);
      });

      entries[gachaId] = results;
    });

    return { itemsByGacha: entries, flatItems: flat };
  }, [data]);

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

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const element = gridRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const width = entry.contentRect.width;
      if (width <= 0) {
        return;
      }

      if (defaultGridWidthRef.current === null || width > defaultGridWidthRef.current) {
        defaultGridWidthRef.current = width;
      }

      const threshold = (defaultGridWidthRef.current ?? width) * (2 / 3);
      setIsCondensedGrid((previous) => {
        const next = width <= threshold + 0.5;
        return previous === next ? previous : next;
      });
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [activeGachaId, items.length]);

  useEffect(() => {
    if (items.length === 0) {
      setIsCondensedGrid(false);
    }
  }, [items.length]);

  const gridClassName = useMemo(
    () =>
      clsx(
        'items-section__grid grid grid-cols-1 gap-3 md:grid-cols-2',
        isCondensedGrid ? 'xl:grid-cols-2' : 'xl:grid-cols-3'
      ),
    [isCondensedGrid]
  );

  const handleEditImage = useCallback(
    (itemId: string) => {
      const target = flatItems.find((entry) => entry.model.itemId === itemId);
      if (!target) {
        return;
      }

      const { model, rarity, riaguCard } = target;
      const assignmentRecords = data?.userInventories?.byItemId?.[model.itemId] ?? [];
      const riaguAssignmentCount = assignmentRecords.reduce((total, record) => total + Math.max(0, record.count ?? 0), 0);
      const rarityOptions = rarityOptionsByGacha[model.gachaId] ?? [rarity].map((entry) => ({
        id: entry.rarityId,
        label: entry.label
      }));

      push(PrizeSettingsDialog, {
        id: `prize-settings-${model.itemId}`,
        title: '景品画像を設定',
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
          thumbnailUrl: model.imageAsset.thumbnailUrl,
          rarityColor: rarity.color,
          riaguPrice: riaguCard?.unitCost,
          riaguType: riaguCard?.typeLabel,
          imageAssetId: model.imageAsset.assetHash,
          onSave: (payload) => {
            try {
              const timestamp = new Date().toISOString();
              const patch: Partial<GachaCatalogItemV3> = {
                name: payload.name,
                rarityId: payload.rarityId,
                pickupTarget: payload.pickupTarget,
                completeTarget: payload.completeTarget,
                riagu: payload.riagu,
                imageAssetId: typeof payload.imageAssetId === 'string' ? payload.imageAssetId : null
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

              if (model.rarityId !== payload.rarityId) {
                userInventoryStore.updateItemRarity({
                  gachaId: model.gachaId,
                  itemId: model.itemId,
                  previousRarityId: model.rarityId,
                  nextRarityId: payload.rarityId,
                  updatedAt: timestamp
                });
              }
            } catch (error) {
              console.error('景品設定の保存に失敗しました', error);
            }
          }
        }
      });
    },
    [catalogStore, data?.userInventories?.byItemId, flatItems, push, rarityOptionsByGacha, riaguStore, userInventoryStore]
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
          thumbnailUrl: payload.thumbnailUrl
        }
      });
    },
    [flatItems, push]
  );

  return (
    <SectionContainer
      id="items"
      title="アイテム画像の設定"
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
      footer="ガチャタブ切替とItemCatalogToolbarの操作が追加される予定です。画像設定はAssetStoreと連携します。"
      contentClassName="items-section__content"
    >
      <div className="items-section__tabs tab-scroll-area">
        {gachaTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={clsx(
              'items-section__tab tab-pill shrink-0 rounded-full border px-4 py-1.5 transition',
              tab.id === activeGachaId
                ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(225,29,72,0.25)]'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
            onClick={() => setActiveGachaId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
                <div ref={gridRef} className={gridClassName}>
                  {showAddCard ? (
                    <AddItemCard onClick={handleAddCardClick} disabled={!canAddItems} />
                  ) : null}
                  {items.map(({ model, rarity }) => (
                    <ItemCard
                      key={model.itemId}
                      model={model}
                      rarity={rarity}
                      onEditImage={handleEditImage}
                      onPreviewAsset={handlePreviewAsset}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </SectionContainer>
  );
}

interface AddItemCardProps {
  onClick: () => void;
  disabled?: boolean;
}

function AddItemCard({ onClick, disabled }: AddItemCardProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label="景品を追加"
      className={clsx(
        'item-card item-card--add relative flex h-full flex-col overflow-visible rounded-2xl border border-dashed border-accent/40 bg-surface/20 p-[10px] text-left shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition focus:outline-none',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-accent/70 hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-accent/50'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
    >
      <div className="flex flex-1 flex-col space-y-3">
        <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-accent/40 bg-[#1b1b22] text-5xl font-semibold text-accent">
          +
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-surface-foreground">景品を追加</h3>
          <p className="text-xs text-muted-foreground">画像・動画・音声ファイルを登録</p>
        </div>
      </div>
    </button>
  );
}
