import { Disclosure } from '@headlessui/react';
import { ChevronRightIcon, FolderArrowDownIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { useMemo } from 'react';

import type { ItemId, RarityMeta } from './ItemCard';

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

export interface UserCardProps {
  userId: UserId;
  userName: string;
  totalSummary: string;
  memo?: string;
  inventories: UserInventoryEntry[];
  expandedByDefault?: boolean;
  onExport?: (userId: UserId) => void;
}

export function UserCard({
  userId,
  userName,
  inventories,
  expandedByDefault,
  onExport
}: UserCardProps): JSX.Element {
  return (
    <Disclosure defaultOpen={expandedByDefault}>
      {({ open }) => (
        <article className="user-card space-y-4 rounded-2xl border border-white/5 bg-surface/25 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <header className="user-card__header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Disclosure.Button
              type="button"
              className="user-card__toggle flex w-full items-start gap-2 text-left"
            >
              <ChevronRightIcon
                className={clsx(
                  'user-card__chevron h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-90 text-accent'
                )}
              />
              <div className="user-card__summary space-y-1">
                <h3 className="user-card__name text-base font-semibold text-surface-foreground">{userName}</h3>
              </div>
            </Disclosure.Button>
            <div className="user-card__actions flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                className="user-card__export-button chip"
                onClick={() => onExport?.(userId)}
              >
                <FolderArrowDownIcon className="h-4 w-4" />
                保存
              </button>
            </div>
          </header>
          <Disclosure.Panel className="user-card__inventories space-y-4">
            {inventories.map((inventory) => (
              <GachaInventoryCard key={inventory.inventoryId} inventory={inventory} />
            ))}
          </Disclosure.Panel>
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
}

function GachaInventoryCard({ inventory }: GachaInventoryCardProps): JSX.Element {
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

  return (
    <section className="user-card__inventory-card space-y-4 rounded-2xl border border-border/60 bg-[#15151b] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
      <header className="user-card__inventory-header flex flex-wrap items-center justify-between gap-3">
        <div className="user-card__inventory-meta space-y-1">
          <h4 className="user-card__inventory-title text-sm font-semibold text-surface-foreground">{inventory.gachaName}</h4>
          <p className="user-card__inventory-id text-[11px] text-muted-foreground">{inventory.inventoryId}</p>
        </div>
        <span className="user-card__inventory-total chip border-accent/30 bg-accent/10 text-[11px] text-accent">
          {totalPulls}連
        </span>
      </header>
      <div className="user-card__rarity-groups space-y-3">
        {rarityGroups.map((group) => (
          <div
            key={group.rarity.rarityId ?? group.rarity.label}
            className="user-card__rarity-row grid gap-2 sm:grid-cols-[minmax(5rem,auto),1fr] sm:items-start"
          >
            <div className="user-card__rarity-label flex items-center gap-2">
              <span
                className="user-card__rarity-name text-sm font-semibold"
                style={{ color: group.rarity.color }}
              >
                {group.rarity.label}
              </span>
              <span className="user-card__rarity-count text-[11px] text-muted-foreground">
                {group.items.reduce((sum, item) => sum + item.count, 0)}件
              </span>
            </div>
            <div className="user-card__rarity-items flex flex-wrap gap-2">
              {group.items.map((item) => (
                <span
                  key={`${inventory.inventoryId}-${item.itemId}`}
                  className="user-card__item-chip inline-flex items-center gap-2 rounded-full border border-border/60 bg-[#23232b] px-3 py-1 text-xs text-surface-foreground"
                >
                  <span>{item.itemName}</span>
                  {item.count > 1 ? (
                    <span className="user-card__item-quantity text-[10px] text-muted-foreground">×{item.count}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
