import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  type TouchEvent as ReactTouchEvent,
  type TransitionEvent as ReactTransitionEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

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

const USERS_FILTER_AUTO_CLOSE_SCROLL_DELTA_THRESHOLD = 8;
const USERS_FILTER_CLOSE_WHEEL_DELTA_THRESHOLD = 12;
const USERS_FILTER_CLOSE_TOUCH_DELTA_THRESHOLD = 24;
const USERS_FILTER_REOPEN_WHEEL_DELTA_THRESHOLD = 12;
const USERS_FILTER_REOPEN_TOUCH_DELTA_THRESHOLD = 24;
const USERS_FILTER_SCROLL_TOP_TOLERANCE = 1;
const USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS = 180;
const USERS_FILTER_CLOSE_ANIMATION_MS = 300;

export function UsersSection(): JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filtersOverflowVisible, setFiltersOverflowVisible] = useState(true);
  const [isScrollLockedDuringClosing, setIsScrollLockedDuringClosing] = useState(false);
  const usersContentRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const reachedTopAfterAutoCloseRef = useRef(false);
  const autoToggleCooldownUntilRef = useRef(0);
  const closeAnimationUnlockTimerRef = useRef<number | null>(null);
  const { push } = useModal();
  const { status, data } = useGachaLocalStorage();
  const { users, showCounts } = useFilteredUsers(status === 'ready' ? data : null);

  const isUsersSectionScrollable = useCallback((element: HTMLDivElement | null): boolean => {
    if (!element) {
      return false;
    }
    return element.scrollHeight - element.clientHeight > 1;
  }, []);

  const isUsersSectionAtTop = useCallback(
    (element: HTMLDivElement | null): boolean => {
      if (!element) {
        return true;
      }
      if (!isUsersSectionScrollable(element)) {
        // スクロール領域が無い場合は「常に先頭扱い」にして、ジェスチャーだけで再オープン可能にする。
        return true;
      }
      return element.scrollTop <= USERS_FILTER_SCROLL_TOP_TOLERANCE;
    },
    [isUsersSectionScrollable]
  );

  const closeFiltersByScrollIntent = useCallback((): boolean => {
    if (!filtersOpen) {
      return false;
    }
    if (Date.now() < autoToggleCooldownUntilRef.current) {
      return false;
    }

    const contentElement = usersContentRef.current;
    setFiltersOpen(false);
    setFiltersOverflowVisible(false);
    setIsScrollLockedDuringClosing(true);
    if (closeAnimationUnlockTimerRef.current != null) {
      window.clearTimeout(closeAnimationUnlockTimerRef.current);
    }
    // transitionend が取りこぼされても解除されるよう、durationに合わせた保険タイマーを置く。
    closeAnimationUnlockTimerRef.current = window.setTimeout(() => {
      setIsScrollLockedDuringClosing(false);
      closeAnimationUnlockTimerRef.current = null;
    }, USERS_FILTER_CLOSE_ANIMATION_MS + 80);
    reachedTopAfterAutoCloseRef.current = isUsersSectionAtTop(contentElement);
    autoToggleCooldownUntilRef.current = Date.now() + USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS;
    return true;
  }, [filtersOpen, isUsersSectionAtTop]);

  const tryOpenFiltersByTopOverscroll = useCallback((): boolean => {
    const contentElement = usersContentRef.current;
    if (!contentElement || filtersOpen) {
      return false;
    }
    if (Date.now() < autoToggleCooldownUntilRef.current) {
      return false;
    }

    const isAtTop = isUsersSectionAtTop(contentElement);
    if (!isAtTop || !reachedTopAfterAutoCloseRef.current) {
      return false;
    }

    setFiltersOpen(true);
    reachedTopAfterAutoCloseRef.current = false;
    autoToggleCooldownUntilRef.current = Date.now() + USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS;
    return true;
  }, [filtersOpen, isUsersSectionAtTop]);

  const handleUsersContentScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      const contentElement = event.currentTarget;
      const currentScrollTop = Math.max(contentElement.scrollTop, 0);
      const delta = currentScrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;

      if (!isUsersSectionScrollable(contentElement)) {
        reachedTopAfterAutoCloseRef.current = true;
        return;
      }

      if (!filtersOpen) {
        if (currentScrollTop <= USERS_FILTER_SCROLL_TOP_TOLERANCE) {
          reachedTopAfterAutoCloseRef.current = true;
        } else if (delta > 0) {
          reachedTopAfterAutoCloseRef.current = false;
        }
        return;
      }

      if (currentScrollTop <= USERS_FILTER_SCROLL_TOP_TOLERANCE) {
        return;
      }

      if (
        delta > USERS_FILTER_AUTO_CLOSE_SCROLL_DELTA_THRESHOLD &&
        Date.now() >= autoToggleCooldownUntilRef.current
      ) {
        // 下方向スクロール開始時はまずツールバーを閉じて、コンテンツ閲覧を優先する。
        reachedTopAfterAutoCloseRef.current = false;
        void closeFiltersByScrollIntent();
      }
    },
    [closeFiltersByScrollIntent, filtersOpen, isUsersSectionScrollable]
  );

  const handleUsersContentWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (isScrollLockedDuringClosing) {
        event.preventDefault();
        return;
      }

      const contentElement = usersContentRef.current;

      if (filtersOpen && event.deltaY >= USERS_FILTER_CLOSE_WHEEL_DELTA_THRESHOLD) {
        void closeFiltersByScrollIntent();
        return;
      }

      if (event.deltaY > -USERS_FILTER_REOPEN_WHEEL_DELTA_THRESHOLD) {
        return;
      }

      if (contentElement && !isUsersSectionAtTop(contentElement)) {
        return;
      }

      void tryOpenFiltersByTopOverscroll();
    },
    [
      closeFiltersByScrollIntent,
      filtersOpen,
      isScrollLockedDuringClosing,
      isUsersSectionAtTop,
      tryOpenFiltersByTopOverscroll
    ]
  );

  const handleUsersContentTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleUsersContentTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (isScrollLockedDuringClosing) {
        event.preventDefault();
        return;
      }

      const contentElement = usersContentRef.current;
      if (!contentElement) {
        return;
      }

      const initialY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (initialY == null || currentY == null) {
        return;
      }

      const dragDistance = currentY - initialY;

      if (filtersOpen) {
        // 指が上に動く（内容は下へスクロールされる）ときに自動クローズする。
        if (dragDistance <= -USERS_FILTER_CLOSE_TOUCH_DELTA_THRESHOLD) {
          const closed = closeFiltersByScrollIntent();
          if (closed) {
            touchStartYRef.current = currentY;
          }
        }
        return;
      }

      if (contentElement.scrollTop <= USERS_FILTER_SCROLL_TOP_TOLERANCE) {
        reachedTopAfterAutoCloseRef.current = true;
      }

      if (dragDistance < USERS_FILTER_REOPEN_TOUCH_DELTA_THRESHOLD) {
        return;
      }

      const opened = tryOpenFiltersByTopOverscroll();
      if (opened) {
        touchStartYRef.current = currentY;
      }
    },
    [closeFiltersByScrollIntent, filtersOpen, isScrollLockedDuringClosing, tryOpenFiltersByTopOverscroll]
  );

  const handleUsersContentTouchEnd = useCallback(() => {
    touchStartYRef.current = null;
  }, []);

  const handleFilterToggle = useCallback(() => {
    const contentElement = usersContentRef.current;
    const currentScrollTop = contentElement?.scrollTop ?? 0;

    setFiltersOpen((open) => {
      const nextOpen = !open;
      lastScrollTopRef.current = currentScrollTop;
      reachedTopAfterAutoCloseRef.current = nextOpen
        ? false
        : currentScrollTop <= USERS_FILTER_SCROLL_TOP_TOLERANCE;
      autoToggleCooldownUntilRef.current = Date.now() + USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS;
      if (!nextOpen) {
        setFiltersOverflowVisible(false);
      }
      return nextOpen;
    });
  }, []);

  useEffect(() => {
    if (!filtersOpen) {
      setFiltersOverflowVisible(false);
    }
  }, [filtersOpen]);

  useEffect(() => {
    return () => {
      if (closeAnimationUnlockTimerRef.current != null) {
        window.clearTimeout(closeAnimationUnlockTimerRef.current);
        closeAnimationUnlockTimerRef.current = null;
      }
    };
  }, []);

  const handleFiltersContainerTransitionEnd = useCallback(
    (event: ReactTransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.propertyName !== 'grid-template-rows') {
        return;
      }
      if (filtersOpen) {
        setFiltersOverflowVisible(true);
      } else {
        setIsScrollLockedDuringClosing(false);
        if (closeAnimationUnlockTimerRef.current != null) {
          window.clearTimeout(closeAnimationUnlockTimerRef.current);
          closeAnimationUnlockTimerRef.current = null;
        }
      }
    },
    [filtersOpen]
  );

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
            'users-section__filter-toggle items-section__filter-button chip h-7 py-1 border-accent/40 bg-accent/10 text-accent transition-all duration-300 ease-linear',
            filtersOpen
              ? 'border-accent/70 bg-accent/20 text-accent'
              : 'hover:border-accent/60 hover:bg-accent/15'
          )}
          onClick={handleFilterToggle}
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
      contentClassName={clsx(
        'users-section__content',
        isScrollLockedDuringClosing && 'users-section__content--closing-scroll-lock'
      )}
      contentElementRef={usersContentRef}
      onContentScroll={handleUsersContentScroll}
      onContentWheel={handleUsersContentWheel}
      onContentTouchStart={handleUsersContentTouchStart}
      onContentTouchMove={handleUsersContentTouchMove}
      onContentTouchEnd={handleUsersContentTouchEnd}
    >
      <div
        className={clsx(
          'users-section__filters grid transition-[grid-template-rows] duration-300 ease-linear',
          filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        onTransitionEnd={handleFiltersContainerTransitionEnd}
      >
        <div
          className={clsx(
            'transition-opacity duration-300 ease-linear',
            filtersOpen ? 'opacity-100' : 'opacity-0',
            filtersOverflowVisible ? 'overflow-visible' : 'overflow-hidden'
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
        <div className="users-section__list space-y-3">
          {users.map((user) => (
            <UserCard
              key={user.userId}
              {...user}
              onExport={handleOpenSaveOptions}
              showCounts={showCounts}
              catalogItemsByGacha={catalogItemsByGacha}
              rarityOptionsByGacha={rarityOptionsByGacha}
            />
          ))}
        </div>
      ) : null}
    </SectionContainer>
  );
}
