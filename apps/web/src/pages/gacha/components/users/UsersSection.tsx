import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { VariableSizeList, type VariableSizeList as VariableSizeListType } from 'react-window';

import {
  UserCard,
  type InventoryCatalogItemOption,
  type InventoryRarityOption
} from '../cards/UserCard';
import { SectionContainer } from '../layout/SectionContainer';
import { useModal } from '../../../../modals';
import { SaveTargetDialog } from '../../../../modals/dialogs/SaveTargetDialog';
import { useGachaLocalStorage } from '../../../../features/storage/useGachaLocalStorage';
import { UserFilterPanel } from './UserFilterPanel';
import { useFilteredUsers } from '../../../../features/users/logic/userFilters';

const ITEM_GAP_PX = 12;
const LIST_MIN_HEIGHT = 480;
const USER_CARD_BASE_HEIGHT = 320;
type FilteredUser = ReturnType<typeof useFilteredUsers>['users'][number];

export function UsersSection(): JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const { push } = useModal();
  const { status, data } = useGachaLocalStorage();
  const { users, showCounts } = useFilteredUsers(status === 'ready' ? data : null);
  const listRef = useRef<VariableSizeListType | null>(null);
  const usersDigest = useMemo(() => users.map((user) => user.userId).join(','), [users]);
  const sizeMap = useRef<Record<number, number>>({});

  const setRowHeight = useCallback((index: number, size: number) => {
    if (sizeMap.current[index] === size) return;
    sizeMap.current[index] = size;
    listRef.current?.resetAfterIndex(index, false);
  }, []);

  const getRowHeight = useCallback(
    (index: number) => sizeMap.current[index] ?? USER_CARD_BASE_HEIGHT + ITEM_GAP_PX,
    []
  );

  useEffect(() => {
    sizeMap.current = {};
    listRef.current?.resetAfterIndex(0, true);
    listRef.current?.scrollToItem(0, 'start');
  }, [listRef, usersDigest]);

  const catalogItemsByGacha = useMemo<Record<string, InventoryCatalogItemOption[]>>(() => {
    const catalogState = data?.catalogState;
    if (!catalogState?.byGacha) {
      return {};
    }

    return Object.entries(catalogState.byGacha).reduce<Record<string, InventoryCatalogItemOption[]>>(
      (acc, [gachaId, snapshot]) => {
        const entries: InventoryCatalogItemOption[] = [];
        snapshot.order.forEach((itemId) => {
          const item = snapshot.items[itemId];
          if (!item) {
            return;
          }
          entries.push({
            itemId: item.itemId,
            name: item.name,
            rarityId: item.rarityId
          });
        });
        acc[gachaId] = entries;
        return acc;
      },
      {}
    );
  }, [data?.catalogState]);

  const rarityOptionsByGacha = useMemo<Record<string, InventoryRarityOption[]>>(() => {
    const rarityState = data?.rarityState;
    if (!rarityState?.byGacha) {
      return {};
    }

    return Object.entries(rarityState.byGacha).reduce<Record<string, InventoryRarityOption[]>>(
      (acc, [gachaId, rarityIds]) => {
        acc[gachaId] = rarityIds.map((rarityId) => {
          const entity = rarityState.entities?.[rarityId];
          return {
            rarityId,
            label: entity?.label ?? rarityId,
            color: entity?.color
          } satisfies InventoryRarityOption;
        });
        return acc;
      },
      {}
    );
  }, [data?.rarityState]);

  const handleOpenSaveOptions = useCallback(
    (userId: string) => {
      push(SaveTargetDialog, {
        id: `save-target-${userId}`,
        title: '保存対象を選択',
        description: 'まずは保存したい範囲（全件・ガチャ単位・履歴単位）を選んでください。',
        size: 'lg',
        payload: {
          userId,
          userName: data?.userProfiles?.users?.[userId]?.displayName ?? userId
        }
      });
    },
    [data?.userProfiles?.users, push]
  );

  const rowProps = useMemo(
    () => ({
      users,
      onExport: handleOpenSaveOptions,
      showCounts,
      catalogItemsByGacha,
      rarityOptionsByGacha,
      setRowHeight
    }),
    [
      catalogItemsByGacha,
      handleOpenSaveOptions,
      rarityOptionsByGacha,
      setRowHeight,
      showCounts,
      users
    ]
  );

  return (
    <SectionContainer
      id="users"
      title="ユーザーごとの獲得内訳"
      description="フィルタやZIP出力でユーザー別の集計を操作します。"
      filterButton={
        <button
          type="button"
          className={clsx(
            'users-section__filter-toggle items-section__filter-button chip border-accent/40 bg-accent/10 text-accent transition-all duration-300 ease-linear',
            filtersOpen
              ? 'border-accent/70 bg-accent/20 text-accent'
              : 'hover:border-accent/60 hover:bg-accent/15'
          )}
          onClick={() => setFiltersOpen((open) => !open)}
          aria-pressed={filtersOpen}
          aria-expanded={filtersOpen}
          aria-controls="users-filter-panel"
        >
          <AdjustmentsHorizontalIcon
            className={clsx(
              'h-4 w-4 transition-transform duration-300 ease-linear',
              filtersOpen ? 'rotate-90 text-accent' : 'text-muted-foreground'
            )}
          />
          フィルタ
        </button>
      }
      contentClassName="users-section__content"
    >
      <div
        className={clsx(
          'users-section__filters grid transition-[grid-template-rows] duration-300 ease-linear',
          filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div
          className={clsx(
            'transition-opacity duration-300 ease-linear',
            filtersOpen ? 'opacity-100 overflow-visible' : 'opacity-0 overflow-hidden'
          )}
        >
          <UserFilterPanel id="users-filter-panel" open={filtersOpen} />
        </div>
      </div>

      {status !== 'ready' ? (
        <p className="text-sm text-muted-foreground">ローカルストレージからユーザーデータを読み込み中です…</p>
      ) : null}
      {status === 'ready' && users.length === 0 ? (
        <p className="text-sm text-muted-foreground">表示できるユーザーがいません。ガチャの履歴や在庫を確認してください。</p>
      ) : null}

      {users.length > 0 ? (
        <div
          className="users-section__list relative"
          style={{ height: '70vh', minHeight: LIST_MIN_HEIGHT }}
        >
          <AutoSizer>
            {({ height, width }) => (
              <VariableSizeList<VirtualizedUserRowData>
                className="users-section__virtual-list"
                style={{ height: Math.max(height, LIST_MIN_HEIGHT), width }}
                itemCount={users.length}
                itemSize={getRowHeight}
                overscanCount={6}
                itemData={rowProps}
                ref={listRef}
              >
                {VirtualizedUserRow}
              </VariableSizeList>
            )}
          </AutoSizer>
        </div>
      ) : null}
    </SectionContainer>
  );
}

interface VirtualizedUserRowData {
  users: FilteredUser[];
  onExport: (userId: string) => void;
  showCounts: boolean | undefined;
  catalogItemsByGacha: Record<string, InventoryCatalogItemOption[]>;
  rarityOptionsByGacha: Record<string, InventoryRarityOption[]>;
  setRowHeight: (index: number, size: number) => void;
}

function VirtualizedUserRow({
  index,
  style,
  data
}: {
  index: number;
  style: CSSProperties;
  data: VirtualizedUserRowData;
}): JSX.Element {
  const { users, onExport, showCounts, catalogItemsByGacha, rarityOptionsByGacha, setRowHeight } = data;
  const user = users[index];
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setRowHeight(index, entry.contentRect.height + ITEM_GAP_PX);
    });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [setRowHeight, index]);

  return (
    <div style={{ ...style, left: 0, right: 0, width: '100%' }}>
      <div ref={cardRef} className="pb-3">
        <UserCard
          {...user}
          onExport={onExport}
          showCounts={showCounts}
          catalogItemsByGacha={catalogItemsByGacha}
          rarityOptionsByGacha={rarityOptionsByGacha}
        />
      </div>
    </div>
  );
}
