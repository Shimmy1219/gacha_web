import { Disclosure } from '@headlessui/react';
import { ChevronRightIcon, EllipsisVerticalIcon, FolderArrowDownIcon, PlusIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react';

import type { ItemId, RarityMeta } from './ItemCard';
import { getRarityTextPresentation } from '../../../../features/rarity/utils/rarityColorPresentation';
import { useDomainStores } from '../../../../features/storage/AppPersistenceProvider';
import {
  ConfirmDialog,
  InventoryHistoryDialog,
  useModal,
  UserDiscordProfileDialog,
  UserHistoryDialog
} from '../../../../modals';
import { ContextMenu, type ContextMenuEntry } from '../menu/ContextMenu';
import { useAssetPreview } from '../../../../features/assets/useAssetPreview';

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
  discordDisplayName?: string | null;
  discordAvatarAssetId?: string | null;
  discordAvatarUrl?: string | null;
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
  rarityOptionsByGacha,
  discordDisplayName,
  discordAvatarAssetId,
  discordAvatarUrl
}: UserCardProps): JSX.Element {
  const { push } = useModal();
  const {
    userProfiles: userProfilesStore,
    userInventories: userInventoriesStore,
    pullHistory: pullHistoryStore
  } = useDomainStores();
  const [userMenuAnchor, setUserMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const toggleButtonRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameFieldId = `user-name-${userId}`;
  const panelId = `user-card-panel-${userId}`;

  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(userName);
    }
  }, [isEditingName, userName]);

  useEffect(() => {
    if (!isEditingName) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isEditingName]);

  const catalogItemsMap = catalogItemsByGacha ?? {};
  const rarityOptionsMap = rarityOptionsByGacha ?? {};
  const normalizedDiscordDisplayName = discordDisplayName?.trim() ?? '';
  const avatarAssetId = discordAvatarAssetId ?? null;
  const avatarPreview = useAssetPreview(avatarAssetId);
  const avatarSrc = avatarPreview.url ?? (discordAvatarUrl ?? null);
  const avatarFallback = useMemo(() => {
    const source = normalizedDiscordDisplayName || userName;
    if (!source) {
      return '';
    }
    const [first] = Array.from(source);
    return first ? first.toUpperCase() : '';
  }, [normalizedDiscordDisplayName, userName]);

  const handleOpenUserMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setUserMenuAnchor({ x: rect.left, y: rect.bottom + 8 });
  }, []);

  const handleCloseUserMenu = useCallback(() => {
    setUserMenuAnchor(null);
  }, []);

  const handleStartEditName = useCallback(() => {
    setUserMenuAnchor(null);
    setIsEditingName(true);
    setNameDraft(userName);
    setNameError(null);
  }, [userName]);

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
    setNameDraft(userName);
    setNameError(null);
  }, [userName]);

  const handleNameSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = nameDraft.trim();
      if (!trimmed) {
        setNameError('ユーザー名を入力してください');
        return;
      }
      if (trimmed === userName) {
        setIsEditingName(false);
        return;
      }
      setNameError(null);
      const renameResult = userProfilesStore.renameProfile(userId, trimmed);
      if (!renameResult.success) {
        if (renameResult.reason === 'duplicate-name') {
          push(ConfirmDialog, {
            id: `duplicate-user-name-${userId}`,
            title: 'ユーザー名が重複しています',
            size: 'sm',
            payload: {
              message: `ユーザー名「${trimmed}」は既に使用されています。別の名前を指定してください。`,
              confirmLabel: '閉じる'
            }
          });
          handleCancelEditName();
          return;
        }

        setNameError('ユーザー名の更新に失敗しました');
        return;
      }

      setIsEditingName(false);
    },
    [
      handleCancelEditName,
      nameDraft,
      push,
      userId,
      userName,
      userProfilesStore
    ]
  );

  const handleNameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancelEditName();
      }
    },
    [handleCancelEditName]
  );

  const handleDiscordInfo = useCallback(() => {
    setUserMenuAnchor(null);
    push(UserDiscordProfileDialog, {
      id: `user-discord-${userId}`,
      title: 'Discord情報',
      size: 'md',
      payload: { userId, userName }
    });
  }, [push, userId, userName]);

  const handleOpenUserHistory = useCallback(() => {
    setUserMenuAnchor(null);
    push(UserHistoryDialog, {
      id: `user-history-${userId}`,
      title: 'ユーザー履歴',
      size: 'xl',
      payload: { userId, userName }
    });
  }, [push, userId, userName]);

  const handleDeleteUser = useCallback(() => {
    setUserMenuAnchor(null);
    push(ConfirmDialog, {
      id: `delete-user-${userId}`,
      title: 'ユーザーを削除',
      payload: {
        message: `ユーザー「${userName}」のプロフィール、獲得履歴、インベントリをすべて削除します。この操作は元に戻せません。よろしいですか？`,
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        onConfirm: () => {
          userProfilesStore.deleteProfile(userId);
          pullHistoryStore.deletePullsForUser(userId);
          userInventoriesStore.deleteUser(userId);
        }
      }
    });
  }, [pullHistoryStore, push, userId, userInventoriesStore, userProfilesStore, userName]);

  const triggerCardToggle = useCallback(() => {
    toggleButtonRef.current?.click();
  }, []);

  const handleCardClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (panelRef.current?.contains(target)) {
        return;
      }

      if (
        target.closest(
          'button, a, input, textarea, select, label, [role="button"], [role="menuitem"], [role="option"], [role="switch"], [role="tab"], [role="checkbox"], [role="radio"], [contenteditable="true"], [data-user-card-ignore-toggle="true"]'
        )
      ) {
        return;
      }

      triggerCardToggle();
    },
    [triggerCardToggle]
  );

  const handleCardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.currentTarget !== event.target) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerCardToggle();
      }
    },
    [triggerCardToggle]
  );

  const userMenuItems = useMemo<ContextMenuEntry[]>(
    () => [
      {
        type: 'item',
        id: 'user-edit-name',
        label: 'ユーザー名の編集',
        onSelect: handleStartEditName
      },
      {
        type: 'item',
        id: 'user-discord-info',
        label: 'Discord情報',
        onSelect: handleDiscordInfo
      },
      {
        type: 'item',
        id: 'user-history',
        label: '履歴',
        onSelect: handleOpenUserHistory
      },
      { type: 'separator', id: 'user-menu-separator' },
      {
        type: 'item',
        id: 'user-delete',
        label: '削除',
        tone: 'danger',
        onSelect: handleDeleteUser
      }
    ],
    [handleDeleteUser, handleDiscordInfo, handleOpenUserHistory, handleStartEditName]
  );

  return (
    <Disclosure defaultOpen={expandedByDefault}>
      {({ open }) => (
        <article
          className="user-card space-y-4 rounded-2xl border border-border/60 bg-[var(--color-user-card)] p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          data-state={open ? 'open' : 'closed'}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={handleCardClick}
          onKeyDown={handleCardKeyDown}
        >
          <Disclosure.Button ref={toggleButtonRef} as="span" className="sr-only" aria-hidden="true">
            ユーザー詳細の表示を切り替える
          </Disclosure.Button>
          <header className="user-card__header flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div
                className={clsx(
                  'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-linear',
                  open && 'text-accent'
                )}
                aria-hidden="true"
              >
                <ChevronRightIcon
                  className={clsx(
                    'user-card__chevron h-5 w-5 transition-transform duration-300 ease-linear',
                    open && 'rotate-90 text-accent'
                  )}
                />
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-1">
                {avatarSrc ? (
                  <div className="user-card__avatar relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/60 bg-surface/60">
                    <img
                      src={avatarSrc}
                      alt={`${userName}のDiscordアイコン`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : normalizedDiscordDisplayName ? (
                  <div className="user-card__avatar-fallback relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-surface/50 text-sm font-semibold text-muted-foreground">
                    <span aria-hidden="true">{avatarFallback}</span>
                  </div>
                ) : null}
                <div className="user-card__summary min-w-0 space-y-1">
                  {isEditingName ? (
                    <form className="flex flex-wrap items-center gap-2" onSubmit={handleNameSubmit}>
                      <label className="sr-only" htmlFor={nameFieldId}>
                        ユーザー名
                      </label>
                      <input
                        ref={nameInputRef}
                        id={nameFieldId}
                        type="text"
                        className="min-w-[10rem] flex-1 rounded-lg border border-border/60 bg-panel-contrast px-3 py-1.5 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                        value={nameDraft}
                        onChange={(event) => {
                          setNameDraft(event.target.value);
                          if (nameError) {
                            setNameError(null);
                          }
                        }}
                        onKeyDown={handleNameKeyDown}
                        aria-invalid={nameError ? 'true' : undefined}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          className="rounded-lg bg-accent px-3 py-1 text-sm font-semibold text-white transition hover:bg-accent-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border/60 px-3 py-1 text-sm text-muted-foreground transition hover:border-border/40 hover:text-surface-foreground"
                          onClick={handleCancelEditName}
                        >
                          キャンセル
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-left">
                      <h3 className="user-card__name text-base font-semibold text-surface-foreground">{userName}</h3>
                      {normalizedDiscordDisplayName ? (
                        <span className="user-card__discord-display text-xs text-muted-foreground">
                          {normalizedDiscordDisplayName}
                        </span>
                      ) : null}
                    </div>
                  )}
                  {isEditingName && normalizedDiscordDisplayName ? (
                    <p className="text-xs text-muted-foreground">Discord表示名: {normalizedDiscordDisplayName}</p>
                  ) : null}
                  {nameError ? <p className="text-xs text-red-500">{nameError}</p> : null}
                  {memo ? (
                    <p className="user-card__memo text-xs text-muted-foreground">{memo}</p>
                  ) : null}
                  {showCounts && totalSummary ? (
                    <p className="user-card__total text-xs text-muted-foreground/80">{totalSummary}</p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="user-card__actions flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="user-card__export-button inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent/70 bg-accent px-3 py-1 text-base font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:bg-accent-bright"
                data-user-card-ignore-toggle="true"
                onClick={() => onExport?.(userId)}
              >
                <FolderArrowDownIcon className="h-5 w-5" />
                保存
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-panel-contrast text-muted-foreground transition hover:border-accent/60 hover:bg-panel-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label="ユーザーメニューを開く"
                data-user-card-ignore-toggle="true"
                onClick={handleOpenUserMenu}
              >
                <EllipsisVerticalIcon className="h-5 w-5" />
              </button>
              {userMenuAnchor ? (
                <ContextMenu
                  anchor={userMenuAnchor}
                  header="ユーザー操作"
                  items={userMenuItems}
                  onClose={handleCloseUserMenu}
                  width={220}
                />
              ) : null}
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
              id={panelId}
              ref={panelRef}
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
  const [draftBaseCount, setDraftBaseCount] = useState(0);
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
    setDraftBaseCount(0);
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
    setMenuAnchor(null);
    push(InventoryHistoryDialog, {
      id: `inventory-history-${inventory.inventoryId}`,
      title: '獲得履歴',
      size: 'lg',
      payload: {
        userId,
        userName,
        gachaId: inventory.gachaId,
        gachaName: inventory.gachaName
      }
    });
  }, [
    inventory.gachaId,
    inventory.gachaName,
    inventory.inventoryId,
    push,
    setMenuAnchor,
    userId,
    userName
  ]);

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
      setDraftBaseCount(currentCount);
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
    setDraftBaseCount(0);
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

      const baseCount = draftBaseCount;
      const delta = normalizedCount - baseCount;
      if (delta === 0) {
        setErrorMessage('変更がありません');
        return;
      }

      pullHistoryStore.recordManualInventoryChange(
        {
          userId,
          gachaId: inventory.gachaId,
          itemId: trimmedItemId,
          delta,
          executedAt: new Date().toISOString(),
          source: 'manual'
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
      draftBaseCount,
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
          const existingCount = inventory.counts?.[matched.rarityId]?.[matched.itemId] ?? 0;
          setDraftBaseCount(existingCount);
        } else {
          setDraftBaseCount(0);
        }
      }
      setErrorMessage(null);
    },
    [catalogItemMap, draftMode, inventory.counts]
  );

  return (
    <section className="user-card__inventory-card space-y-4 rounded-2xl border border-border/60 bg-[var(--color-user-inventory-card)] p-5">
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
              className="user-card__rarity-row grid grid-cols-[minmax(5rem,auto),1fr] items-start gap-2"
            >
              <div className="user-card__rarity-label flex items-center gap-2">
                <span className={clsx('user-card__rarity-name text-sm font-semibold', className)} style={style}>
                  {group.rarity.label}
                </span>
                {showCounts ? (
                  <span className="user-card__rarity-count text-[11px] text-muted-foreground">
                    {group.items.reduce((sum, item) => sum + item.count, 0)}件
                  </span>
                ) : null}
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
                      {showCounts && item.count > 1 ? (
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
