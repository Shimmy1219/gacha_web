import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export function UsersSection(): JSX.Element {
  const MAX_VISIBLE_USERS = 20;
  const WINDOW_STEP = 10;
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [windowStart, setWindowStart] = useState(0);
  const [itemHeight, setItemHeight] = useState<number | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const { push } = useModal();
  const { status, data } = useGachaLocalStorage();
  const { users, showCounts } = useFilteredUsers(status === 'ready' ? data : null);

  const visibleUsers = useMemo(
    () => users.slice(windowStart, windowStart + MAX_VISIBLE_USERS),
    [users, windowStart]
  );

  const paddingTop = useMemo(() => {
    if (itemHeight === null) return 0;
    return windowStart * itemHeight;
  }, [itemHeight, windowStart]);

  const paddingBottom = useMemo(() => {
    if (itemHeight === null) return 0;
    const remaining = Math.max(users.length - (windowStart + visibleUsers.length), 0);
    return remaining * itemHeight;
  }, [itemHeight, users.length, visibleUsers.length, windowStart]);

  useEffect(() => {
    setWindowStart(0);
  }, [users.length]);

  useEffect(() => {
    const topSentinel = topSentinelRef.current;
    const bottomSentinel = bottomSentinelRef.current;
    if (!topSentinel || !bottomSentinel) return undefined;

    const maxStart = Math.max(0, users.length - MAX_VISIBLE_USERS);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (entry.target === bottomSentinel) {
            setWindowStart((current) => Math.min(current + WINDOW_STEP, maxStart));
          } else if (entry.target === topSentinel) {
            setWindowStart((current) => Math.max(current - WINDOW_STEP, 0));
          }
        });
      },
      {
        root: null,
        rootMargin: '200px 0px'
      }
    );

    observer.observe(bottomSentinel);
    observer.observe(topSentinel);

    return () => {
      observer.disconnect();
    };
  }, [MAX_VISIBLE_USERS, WINDOW_STEP, users.length]);

  const handleMeasureItem = useCallback((node: HTMLDivElement | null) => {
    if (node && itemHeight === null) {
      const rect = node.getBoundingClientRect();
      if (rect.height > 0) {
        setItemHeight(rect.height);
      }
    }
  }, [itemHeight]);

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
        <div className="users-section__list space-y-3" style={{ paddingTop, paddingBottom }}>
          <div ref={topSentinelRef} aria-hidden />
          {visibleUsers.map((user, index) => (
            <div key={user.userId} ref={index === 0 ? handleMeasureItem : undefined}>
              <UserCard
                {...user}
                onExport={handleOpenSaveOptions}
                showCounts={showCounts}
                catalogItemsByGacha={catalogItemsByGacha}
                rarityOptionsByGacha={rarityOptionsByGacha}
              />
            </div>
          ))}
          <div ref={bottomSentinelRef} aria-hidden />
        </div>
      ) : null}
    </SectionContainer>
  );
}
