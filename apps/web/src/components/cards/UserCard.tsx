import { Disclosure } from '@headlessui/react';
import { ChevronRightIcon, EllipsisVerticalIcon, FolderArrowDownIcon, PlusIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { useCallback, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';

import type { ItemId, RarityMeta } from './ItemCard';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { ConfirmDialog, useModal } from '../../modals';
import { ContextMenu, type ContextMenuEntry } from '../menu/ContextMenu';

export type UserId = string;
export type InventoryId = string;
export type GachaId = string;

export interface UserInventoryEntryItem {
  itemId: ItemId;
  itemName: string;
  rarity: RarityMeta;
  count: number;
}

export interface UserInventoryEntry {
  inventoryId: InventoryId;
  gachaId: GachaId;
  gachaName: string;
  pulls: UserInventoryEntryItem[];
}

export interface InventoryCatalogItemOption {
  itemId: string;
  name: string;
  rarityId: string;
}

export interface InventoryRarityOption {
  rarityId: string;
  label: string;
  color?: string;
}

export interface UserCardProps {
  userId: UserId;
  userName: string;
  totalSummary: string;
  memo?: string;
  inventories: UserInventoryEntry[];
  expandedByDefault?: boolean;
  onExport?: (userId: UserId) => void;
  showCounts?: boolean;
  catalogItemsByGacha?: Record<string, InventoryCatalogItemOption[]>;
  rarityOptionsByGacha?: Record<string, InventoryRarityOption[]>;
}

export function UserCard({
  userId,
  userName,
  inventories,
  expandedByDefault,
  onExport,
  totalSummary,
  memo,
  showCounts = true,
  catalogItemsByGacha,
  rarityOptionsByGacha
}: UserCardProps): JSX.Element {
  const catalogItemsMap = catalogItemsByGacha ?? {};
  const rarityOptionsMap = rarityOptionsByGacha ?? {};

  return (
    <Disclosure defaultOpen={expandedByDefault}>
      {({ open }) => (
        <article className="user-card space-y-4 rounded-2xl border border-border/60 bg-panel p-5">
          <header className="user-card__header flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
            <Disclosure.Button
              type="button"
              className="user-card__toggle flex min-w-0 flex-1 items-start gap-2 text-left transition-colors duration-200 ease-linear"
            >
              <ChevronRightIcon
                className={clsx(
                  'user-card__chevron h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-linear',
                  open && 'rotate-90 text-accent'
                )}
              />
              <div className="user-card__summary min-w-0 space-y-1">
                <h3 className="user-card__name text-base font-semibold text-surface-foreground">{userName}</h3>
                {memo ? (
                  <p className="user-card__memo text-xs text-muted-foreground">{memo}</p>
                ) : null}
                {showCounts && totalSummary ? (
                  <p className="user-card__total text-xs text-muted-foreground/80">{totalSummary}</p>
                ) : null}
              </div>
            </Disclosure.Button>
            <div className="user-card__actions flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="user-card__export-button inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent/70 bg-accent px-3 py-1 text-base font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:bg-accent-bright"
                onClick={() => onExport?.(userId)}
              >
                <FolderArrowDownIcon className="h-5 w-5" />
                保存
              </button>
            </div>
          </header>
          <div
            data-state={open ? 'open' : 'closed'}
            className={clsx(
              'user-card__collapsible group grid overflow-hidden transition-[grid-template-rows] duration-300 ease-linear',
              'data-[state=open]:grid-rows-[1fr]',
              'data-[state=closed]:grid-rows-[0fr]'
            )}
          >
            <Disclosure.Panel
              static
              className={clsx(
                'overflow-hidden transition-opacity duration-300 ease-linear',
                'group-data-[state=open]:opacity-100',
                'group-data-[state=closed]:opacity-0'
              )}
            >
              <div className="user-card__inventories space-y-4">
                {inventories.map((inventory) => (
                  <GachaInventoryCard
                    key={inventory.inventoryId}
                    inventory={inventory}
                    showCounts={showCounts}
                    userId={userId}
                    userName={userName}
                    catalogItems={catalogItemsMap[inventory.gachaId] ?? []}
                    rarityOptions={rarityOptionsMap[inventory.gachaId] ?? []}
                  />
                ))}
              </div>
            </Disclosure.Panel>
          </div>
        </article>
      )}
    </Disclosure>
  );
}

const RARITY_ORDER: Record<string, number> = {
  'rar-ssr': 0,
  'rar-sr': 1,
  'rar-r': 2,
  'rar-n': 3,
  'rar-miss': 4
};

interface GachaInventoryCardProps {
  inventory: UserInventoryEntry;
  showCounts: boolean;
  userId: UserId;
  userName: string;
  catalogItems: InventoryCatalogItemOption[];
  rarityOptions: InventoryRarityOption[];
}

type InventoryDraftMode = 'edit' | 'add';

function GachaInventoryCard({
  inventory,
  showCounts,
  userId,
  userName,
  catalogItems,
  rarityOptions: _rarityOptions
}: GachaInventoryCardProps): JSX.Element {
  const { pullHistory: pullHistoryStore } = useDomainStores();
  const { push } = useModal();
  const totalPulls = useMemo(
    () => inventory.pulls.reduce((total, pull) => total + pull.count, 0),
    [inventory.pulls]
  );

  const rarityGroups = useMemo(() => {
    const groups = new Map<string, { rarity: RarityMeta; items: UserInventoryEntryItem[] }>();

    inventory.pulls.forEach((pull) => {
      const key = pull.rarity.rarityId ?? pull.rarity.label;
      const next = groups.get(key);
      if (next) {
        next.items.push(pull);
        return;
      }
      groups.set(key, { rarity: pull.rarity, items: [pull] });
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aKey = a.rarity.rarityId ?? a.rarity.label;
      const bKey = b.rarity.rarityId ?? b.rarity.label;
      const aOrder = RARITY_ORDER[aKey] ?? 99;
      const bOrder = RARITY_ORDER[bKey] ?? 99;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return (a.rarity.rarityNum ?? 0) - (b.rarity.rarityNum ?? 0);
    });
  }, [inventory.pulls]);

  const [isEditing, setIsEditing] = useState(false);
  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<InventoryDraftMode | null>(null);
  const [draftItemId, setDraftItemId] = useState('');
  const [draftCount, setDraftCount] = useState('');
  const [draftRarityId, setDraftRarityId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  const catalogItemMap = useMemo(() => {
    return catalogItems.reduce<Map<string, InventoryCatalogItemOption>>((acc, item) => {
      acc.set(item.itemId, item);
      return acc;
    }, new Map());
  }, [catalogItems]);

  const resetDraft = useCallback(() => {
    setActiveEditor(null);
    setDraftMode(null);
    setDraftItemId('');
    setDraftCount('');
    setDraftRarityId('');
    setErrorMessage(null);
  }, []);

  const handleToggleEditing = useCallback(() => {
    setMenuAnchor(null);
    setIsEditing((previous) => {
      const next = !previous;
      if (!next) {
        resetDraft();
      }
      return next;
    });
  }, [resetDraft]);

  const handleOpenHistory = useCallback(() => {
    console.info('インベントリ履歴の表示は未実装です', {
      userId,
      inventoryId: inventory.inventoryId
    });
  }, [inventory.inventoryId, userId]);

  const handleDeleteInventory = useCallback(() => {
    push(ConfirmDialog, {
      id: `inventory-delete-${inventory.inventoryId}`,
      title: 'インベントリを削除',
      payload: {
        message: `ユーザー「${userName}」の「${inventory.gachaName}」インベントリと関連するガチャ履歴を削除します。この操作は元に戻せません。よろしいですか？`,
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        onConfirm: () => {
          resetDraft();
          setIsEditing(false);
          pullHistoryStore.deletePullsForInventory({ gachaId: inventory.gachaId, userId });
        }
      }
    });
  }, [
    inventory.gachaId,
    inventory.gachaName,
    inventory.inventoryId,
    pullHistoryStore,
    push,
    resetDraft,
    userId,
    userName
  ]);

  const handleOpenMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuAnchor({ x: rect.left, y: rect.bottom + 8 });
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const inventoryMenuItems = useMemo<ContextMenuEntry[]>(
    () => [
      {
        type: 'item',
        id: 'inventory-edit',
        label: '編集',
        onSelect: handleToggleEditing
      },
      {
        type: 'item',
        id: 'inventory-history',
        label: '履歴',
        onSelect: handleOpenHistory
      },
      { type: 'separator', id: 'inventory-menu-separator' },
      {
        type: 'item',
        id: 'inventory-delete',
        label: '削除',
        tone: 'danger',
        onSelect: handleDeleteInventory
      }
    ],
    [handleDeleteInventory, handleOpenHistory, handleToggleEditing]
  );

  const handleStartEdit = useCallback(
    (rarityId: string, itemId: string, currentCount: number) => {
      if (!isEditing) {
        return;
      }
      setActiveEditor(`edit:${rarityId}:${itemId}`);
      setDraftMode('edit');
      setDraftItemId(itemId);
      setDraftCount(String(currentCount));
      setDraftRarityId(rarityId);
      setErrorMessage(null);
    },
    [isEditing]
  );

  const handleStartAdd = useCallback(() => {
    if (!isEditing) {
      return;
    }
    setActiveEditor('add');
    setDraftMode('add');
    setDraftItemId('');
    setDraftCount('1');
    setDraftRarityId('');
    setErrorMessage(null);
  }, [isEditing]);

  const selectedCatalogItem = useMemo(() => {
    if (!draftItemId) {
      return null;
    }
    return catalogItemMap.get(draftItemId) ?? null;
  }, [catalogItemMap, draftItemId]);

  const handleSubmitDraft = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedItemId = draftItemId.trim();
      let rarityId = draftRarityId.trim();
      const normalizedCount = Number.parseInt(draftCount, 10);

      if (!trimmedItemId) {
        setErrorMessage('景品を選択してください');
        return;
      }

      if (draftMode === 'add') {
        const matched = catalogItemMap.get(trimmedItemId);
        if (!matched) {
          setErrorMessage('選択した景品が見つかりませんでした');
          return;
        }
        rarityId = matched.rarityId;
        setDraftRarityId(rarityId);
      }

      if (!rarityId) {
        setErrorMessage('レアリティ情報を取得できませんでした');
        return;
      }

      if (!Number.isFinite(normalizedCount) || Number.isNaN(normalizedCount)) {
        setErrorMessage('個数は整数で入力してください');
        return;
      }

      if (normalizedCount < 0) {
        setErrorMessage('個数は0以上で入力してください');
        return;
      }

      pullHistoryStore.upsertAdjustment(
        {
          userId,
          gachaId: inventory.gachaId,
          itemId: trimmedItemId,
          rarityId,
          count: normalizedCount
        },
        { persist: 'immediate' }
      );

      resetDraft();
    },
    [
      draftMode,
      draftCount,
      draftItemId,
      draftRarityId,
      inventory.gachaId,
      resetDraft,
      userId,
      pullHistoryStore
    ]
  );

  const handleDraftItemIdChange = useCallback(
    (value: string) => {
      setDraftItemId(value);
      if (draftMode === 'add') {
        const matched = catalogItemMap.get(value);
        if (matched) {
          setDraftRarityId(matched.rarityId);
        }
      }
      setErrorMessage(null);
    },
    [catalogItemMap, draftMode]
  );

  return (
    <section className="user-card__inventory-card space-y-4 rounded-2xl border border-border/60 bg-panel-muted p-5">
      <header className="user-card__inventory-header flex flex-wrap items-center justify-between gap-3">
        <div className="user-card__inventory-meta space-y-1">
          <h4 className="user-card__inventory-title text-sm font-semibold text-surface-foreground">{inventory.gachaName}</h4>
          <p className="user-card__inventory-id text-[11px] text-muted-foreground">{inventory.inventoryId}</p>
        </div>
        <div className="flex items-center gap-2">
          {showCounts ? (
            <span className="user-card__inventory-total chip border-accent/30 bg-accent/10 text-[11px] text-accent">
              {totalPulls}連
            </span>
          ) : null}
          {isEditing ? (
            <>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-accent/50 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent transition hover:border-accent/70 hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={handleStartAdd}
              >
                <PlusIcon className="h-4 w-4" />
                追加
              </button>
              <button
                type="button"
                className="rounded-lg border border-border/60 bg-panel-contrast px-3 py-1 text-xs font-semibold text-surface-foreground transition hover:border-accent/60 hover:bg-panel-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={handleToggleEditing}
              >
                編集完了
              </button>
            </>
          ) : (
            <>
              <button
                ref={menuButtonRef}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-panel-contrast text-muted-foreground transition hover:border-accent/60 hover:bg-panel-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label="インベントリメニューを開く"
                onClick={handleOpenMenu}
              >
                <EllipsisVerticalIcon className="h-4 w-4" />
              </button>
              {menuAnchor ? (
                <ContextMenu
                  anchor={menuAnchor}
                  header="インベントリ操作"
                  items={inventoryMenuItems}
                  onClose={handleCloseMenu}
                  width={220}
                />
              ) : null}
            </>
          )}
        </div>
      </header>
      <div className="user-card__rarity-groups space-y-3">
        {rarityGroups.map((group) => {
          const { className, style } = getRarityTextPresentation(group.rarity.color);
          const rarityId = group.rarity.rarityId ?? group.rarity.label;
          return (
            <div
              key={rarityId}
              className="user-card__rarity-row grid gap-2 sm:grid-cols-[minmax(5rem,auto),1fr] sm:items-start"
            >
              <div className="user-card__rarity-label flex items-center gap-2">
                <span className={clsx('user-card__rarity-name text-sm font-semibold', className)} style={style}>
                  {group.rarity.label}
                </span>
                <span className="user-card__rarity-count text-[11px] text-muted-foreground">
                  {group.items.reduce((sum, item) => sum + item.count, 0)}件
                </span>
              </div>
              <div className="user-card__rarity-items flex flex-wrap items-start gap-2">
                {group.items.map((item) => {
                  const editorKey = `edit:${rarityId}:${item.itemId}`;
                  const isActive = activeEditor === editorKey && draftMode === 'edit';
                  if (isEditing && isActive) {
                    return (
                      <form
                        key={`${inventory.inventoryId}-${editorKey}`}
                        className={clsx(
                          'user-card__item-chip flex w-full flex-col gap-2 rounded-lg border border-accent/40 bg-panel-contrast',
                          'px-3 py-2 text-xs text-surface-foreground'
                        )}
                        onSubmit={handleSubmitDraft}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{item.itemName}</span>
                          <input
                            type="number"
                            min={0}
                            className="w-16 rounded-md border border-border/60 bg-panel-contrast px-2 py-1 text-xs text-surface-foreground focus:border-accent focus:outline-none"
                            value={draftCount}
                            onChange={(event) => setDraftCount(event.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:border-border/40 hover:text-surface-foreground"
                            onClick={resetDraft}
                          >
                            キャンセル
                          </button>
                        </div>
                        {errorMessage && isActive ? (
                          <p className="text-[10px] text-red-400">{errorMessage}</p>
                        ) : null}
                      </form>
                    );
                  }

                  return (
                    <button
                      key={`${inventory.inventoryId}-${editorKey}`}
                      type="button"
                      className={clsx(
                        'user-card__item-chip inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted',
                        'px-3 py-1 text-xs text-surface-foreground transition',
                        isEditing && item.rarity.rarityId
                          ? 'hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                          : 'cursor-default'
                      )}
                      onClick={() => item.rarity.rarityId && handleStartEdit(rarityId, item.itemId, item.count)}
                      disabled={!isEditing || !item.rarity.rarityId}
                    >
                      <span>{item.itemName}</span>
                      {item.count > 1 ? (
                        <span className="user-card__item-quantity text-[10px] text-muted-foreground">×{item.count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {isEditing && activeEditor === 'add' && draftMode === 'add' ? (
          <form
            className={clsx(
              'user-card__item-chip mt-1 flex w-full flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-panel-contrast',
              'px-3 py-2 text-xs text-surface-foreground'
            )}
            onSubmit={handleSubmitDraft}
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`${inventory.inventoryId}-add-item`}>
                景品
              </label>
              <select
                id={`${inventory.inventoryId}-add-item`}
                className="w-48 rounded-md border border-border/60 bg-panel-contrast px-2 py-1 text-xs text-surface-foreground focus:border-accent focus:outline-none"
                value={draftItemId}
                onChange={(event) => handleDraftItemIdChange(event.target.value)}
                autoFocus
                disabled={catalogItems.length === 0}
              >
                <option value="" disabled>
                  選択してください
                </option>
                {catalogItems.map((option) => (
                  <option key={`${inventory.inventoryId}-${option.itemId}`} value={option.itemId}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`${inventory.inventoryId}-add-count`}>
                個数
              </label>
              <input
                id={`${inventory.inventoryId}-add-count`}
                type="number"
                min={0}
                className="w-16 rounded-md border border-border/60 bg-panel-contrast px-2 py-1 text-xs text-surface-foreground focus:border-accent focus:outline-none"
                value={draftCount}
                onChange={(event) => setDraftCount(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                保存
              </button>
              <button
                type="button"
                className="rounded-md border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:border-border/40 hover:text-surface-foreground"
                onClick={resetDraft}
              >
                キャンセル
              </button>
            </div>
            {selectedCatalogItem ? (
              <p className="w-full text-xs text-muted-foreground">{selectedCatalogItem.name}</p>
            ) : null}
            {errorMessage && activeEditor === 'add' ? (
              <p className="w-full text-[10px] text-red-400">{errorMessage}</p>
            ) : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}
