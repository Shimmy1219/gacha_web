import { Disclosure } from '@headlessui/react';
import {
  ChevronRightIcon,
  ClipboardDocumentIcon,
  FolderArrowDownIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

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
  onCopyCounts?: (userId: UserId) => void;
  onExport?: (userId: UserId) => void;
  onOpenProfile?: (userId: UserId) => void;
}

export function UserCard({
  userId,
  userName,
  totalSummary,
  memo,
  inventories,
  expandedByDefault,
  onCopyCounts,
  onExport,
  onOpenProfile
}: UserCardProps): JSX.Element {
  return (
    <Disclosure defaultOpen={expandedByDefault}>
      {({ open }) => (
        <article className="space-y-4 rounded-2xl border border-white/5 bg-surface/25 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Disclosure.Button
              type="button"
              className="flex w-full items-start gap-2 text-left"
            >
              <ChevronRightIcon
                className={clsx(
                  'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-90 text-accent'
                )}
              />
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-surface-foreground">{userName}</h3>
                <p className="text-xs text-muted-foreground">
                  {totalSummary}
                  {memo ? ` / ${memo}` : ''}
                </p>
              </div>
            </Disclosure.Button>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                className="chip"
                onClick={() => onOpenProfile?.(userId)}
              >
                <UserCircleIcon className="h-4 w-4" />
                プロフィール
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => onCopyCounts?.(userId)}
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                カウントをコピー
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => onExport?.(userId)}
              >
                <FolderArrowDownIcon className="h-4 w-4" />
                個別ZIP
              </button>
            </div>
          </header>
          <Disclosure.Panel className="space-y-4">
            {inventories.map((inventory) => (
              <section
                key={inventory.inventoryId}
                className="space-y-3 rounded-xl border border-border/60 bg-[#11111a] p-4"
              >
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-surface-foreground">{inventory.gachaName}</h4>
                    <p className="text-[11px] text-muted-foreground">{inventory.inventoryId}</p>
                  </div>
                  <span className="chip border-border/50 text-[11px] text-muted-foreground">
                    {inventory.pulls.reduce((total, pull) => total + pull.count, 0)} 個
                  </span>
                </header>
                <div className="space-y-2">
                  {inventory.pulls.map((pull) => (
                    <div
                      key={`${inventory.inventoryId}-${pull.itemId}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-black/40 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="badge" style={{ color: pull.rarity.color }}>
                          {pull.rarity.label}
                        </span>
                        <span className="text-sm text-surface-foreground">{pull.itemName}</span>
                      </div>
                      <span className="chip">×{pull.count}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </Disclosure.Panel>
        </article>
      )}
    </Disclosure>
  );
}
