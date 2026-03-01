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
import { GachaTabs, type GachaTabOption } from '../common/GachaTabs';
import { useModal } from '../../../../modals';
import { SaveTargetDialog } from '../../../../modals/dialogs/SaveTargetDialog';
import { useGachaLocalStorage } from '../../../../features/storage/useGachaLocalStorage';
import { UserFilterPanel } from './UserFilterPanel';
import {
  buildUserFilterGachaOptions,
  useFilteredUsers
} from '../../../../features/users/logic/userFilters';
import { useTabMotion } from '../../../../hooks/useTabMotion';
import { useResponsiveDashboard } from '../dashboard/useResponsiveDashboard';

const USERS_FILTER_AUTO_CLOSE_SCROLL_DELTA_THRESHOLD = 8;
const USERS_FILTER_CLOSE_WHEEL_DELTA_THRESHOLD = 12;
const USERS_FILTER_CLOSE_TOUCH_DELTA_THRESHOLD = 24;
const USERS_FILTER_REOPEN_WHEEL_DELTA_THRESHOLD = 12;
const USERS_FILTER_REOPEN_TOUCH_DELTA_THRESHOLD = 24;
const USERS_FILTER_SCROLL_TOP_TOLERANCE = 1;
const USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS = 180;
const USERS_FILTER_CLOSE_ANIMATION_MS = 300;
const USERS_ALL_TAB_ID = 'users-all';

interface UsersGachaTab {
  id: string;
  label: string;
  gachaId: string | null;
}

/**
 * ユーザーごとの獲得内訳を表示し、フィルタ・ガチャタブ・保存操作を提供するセクション。
 *
 * @returns ユーザー集計セクション
 */
export function UsersSection(): JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filtersOverflowVisible, setFiltersOverflowVisible] = useState(true);
  const [isScrollLockedDuringClosing, setIsScrollLockedDuringClosing] = useState(false);
  const [activeUsersTabId, setActiveUsersTabId] = useState<string>(USERS_ALL_TAB_ID);
  const usersContentRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const touchLastYRef = useRef<number | null>(null);
  const touchStartedAtTopRef = useRef(false);
  const reachedTopAfterAutoCloseRef = useRef(false);
  const autoToggleCooldownUntilRef = useRef(0);
  const closeAnimationUnlockTimerRef = useRef<number | null>(null);
  const { isMobile } = useResponsiveDashboard();
  const { push } = useModal();
  const { status, data } = useGachaLocalStorage();
  const { users, showCounts } = useFilteredUsers(status === 'ready' ? data : null);
  const usersGachaTabs = useMemo<UsersGachaTab[]>(() => {
    const gachaOptions = buildUserFilterGachaOptions(data?.appState);
    return [
      {
        id: USERS_ALL_TAB_ID,
        label: '全て',
        gachaId: null
      },
      ...gachaOptions.map((option) => ({
        id: `users-gacha-${option.value}`,
        label: option.label,
        gachaId: option.value
      }))
    ];
  }, [data?.appState]);
  const gachaTabs = useMemo<GachaTabOption[]>(
    () => usersGachaTabs.map((tab) => ({ id: tab.id, label: tab.label })),
    [usersGachaTabs]
  );
  const usersTabIds = useMemo(() => usersGachaTabs.map((tab) => tab.id), [usersGachaTabs]);
  const usersTabMotion = useTabMotion(activeUsersTabId, usersTabIds);
  const usersTabPanelAnimationClass = clsx(
    'users-section__tab-panel-content space-y-3',
    usersTabMotion === 'forward' && 'animate-tab-slide-from-right',
    usersTabMotion === 'backward' && 'animate-tab-slide-from-left'
  );
  const activeTabGachaId = useMemo(() => {
    const activeTab = usersGachaTabs.find((tab) => tab.id === activeUsersTabId);
    return activeTab?.gachaId ?? null;
  }, [activeUsersTabId, usersGachaTabs]);
  const activeTabLabel = useMemo(() => {
    const activeTab = usersGachaTabs.find((tab) => tab.id === activeUsersTabId);
    return activeTab?.label ?? '選択中のガチャ';
  }, [activeUsersTabId, usersGachaTabs]);
  const tabbedUsers = useMemo(() => {
    if (!activeTabGachaId) {
      return users;
    }

    const usersPerGacha = users
      .map((user) => {
        const filteredInventories = user.inventories.filter((inventory) => inventory.gachaId === activeTabGachaId);
        if (filteredInventories.length === 0) {
          return null;
        }
        const totalPullCount = filteredInventories.reduce(
          (sum, inventory) => sum + inventory.pulls.reduce((inventorySum, item) => inventorySum + item.count, 0),
          0
        );
        return {
          ...user,
          inventories: filteredInventories,
          totalSummary: `${totalPullCount}連`
        };
      })
      .filter((user): user is (typeof users)[number] => user !== null);

    // ガチャ絞り込み後も先頭カードを既定展開に寄せ、従来の可読性を維持する。
    return usersPerGacha.map((user, index) => ({
      ...user,
      expandedByDefault: index === 0
    }));
  }, [activeTabGachaId, users]);

  useEffect(() => {
    // タブ一覧が変化した場合に無効タブを保持しないため、常に有効な先頭タブへ補正する。
    // 依存に activeUsersTabId と usersGachaTabs を含め、選択変更と構成変更の両方で整合性を保つ。
    if (usersGachaTabs.some((tab) => tab.id === activeUsersTabId)) {
      return;
    }
    setActiveUsersTabId(usersGachaTabs[0]?.id ?? USERS_ALL_TAB_ID);
  }, [activeUsersTabId, usersGachaTabs]);

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

  const isUsersGestureAtTop = useCallback(
    (element: HTMLDivElement | null): boolean => {
      if (isUsersSectionScrollable(element)) {
        return isUsersSectionAtTop(element);
      }
      if (!isMobile) {
        return true;
      }
      if (typeof window === 'undefined') {
        return true;
      }
      return window.scrollY <= USERS_FILTER_SCROLL_TOP_TOLERANCE;
    },
    [isMobile, isUsersSectionAtTop, isUsersSectionScrollable]
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
    reachedTopAfterAutoCloseRef.current = isUsersGestureAtTop(contentElement);
    autoToggleCooldownUntilRef.current = Date.now() + USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS;
    return true;
  }, [filtersOpen, isUsersGestureAtTop]);

  const tryOpenFiltersByTopOverscroll = useCallback((): boolean => {
    const contentElement = usersContentRef.current;
    if (!contentElement || filtersOpen) {
      return false;
    }
    if (Date.now() < autoToggleCooldownUntilRef.current) {
      return false;
    }

    const isAtTop = isUsersGestureAtTop(contentElement);
    if (!isAtTop || !reachedTopAfterAutoCloseRef.current) {
      return false;
    }

    setFiltersOpen(true);
    reachedTopAfterAutoCloseRef.current = false;
    autoToggleCooldownUntilRef.current = Date.now() + USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS;
    return true;
  }, [filtersOpen, isUsersGestureAtTop]);

  const handleUsersContentScroll = useCallback(
    (event: ReactUIEvent<HTMLDivElement>) => {
      const contentElement = event.currentTarget;
      const currentScrollTop = Math.max(contentElement.scrollTop, 0);
      const delta = currentScrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;

      if (!isUsersSectionScrollable(contentElement)) {
        reachedTopAfterAutoCloseRef.current = isUsersGestureAtTop(contentElement);
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
    [closeFiltersByScrollIntent, filtersOpen, isUsersGestureAtTop, isUsersSectionScrollable]
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
    const touchY = event.touches[0]?.clientY ?? null;
    touchStartYRef.current = touchY;
    touchLastYRef.current = touchY;
    touchStartedAtTopRef.current = isUsersGestureAtTop(usersContentRef.current);
  }, [isUsersGestureAtTop]);

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
      const previousY = touchLastYRef.current;
      touchLastYRef.current = currentY;
      if (previousY == null) {
        return;
      }

      const currentMoveDelta = currentY - previousY;

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
      if (currentMoveDelta <= 0) {
        return;
      }
      if (!touchStartedAtTopRef.current || !isUsersGestureAtTop(contentElement)) {
        return;
      }

      const opened = tryOpenFiltersByTopOverscroll();
      if (opened) {
        touchStartYRef.current = currentY;
        touchLastYRef.current = currentY;
        touchStartedAtTopRef.current = true;
      }
    },
    [
      closeFiltersByScrollIntent,
      filtersOpen,
      isScrollLockedDuringClosing,
      isUsersGestureAtTop,
      tryOpenFiltersByTopOverscroll
    ]
  );

  const handleUsersContentTouchEnd = useCallback(() => {
    touchStartYRef.current = null;
    touchLastYRef.current = null;
    touchStartedAtTopRef.current = false;
  }, []);

  const handleUsersContentTouchCancel = useCallback(() => {
    touchStartYRef.current = null;
    touchLastYRef.current = null;
    touchStartedAtTopRef.current = false;
  }, []);

  const handleFilterToggle = useCallback(() => {
    const contentElement = usersContentRef.current;
    const currentScrollTop = contentElement?.scrollTop ?? 0;

    setFiltersOpen((open) => {
      const nextOpen = !open;
      lastScrollTopRef.current = currentScrollTop;
      reachedTopAfterAutoCloseRef.current = nextOpen
        ? false
        : isUsersGestureAtTop(contentElement ?? null);
      autoToggleCooldownUntilRef.current = Date.now() + USERS_FILTER_AUTO_TOGGLE_COOLDOWN_MS;
      if (!nextOpen) {
        setFiltersOverflowVisible(false);
      }
      return nextOpen;
    });
  }, [isUsersGestureAtTop]);

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
      const defaultSelection = activeTabGachaId
        ? {
            mode: 'gacha' as const,
            gachaIds: [activeTabGachaId]
          }
        : undefined;

      push(SaveTargetDialog, {
        id: `save-target-${userId}`,
        title: '保存対象を選択',
        description: 'まずは保存したい範囲（全件・ガチャ単位・履歴単位）を選んでください。',
        size: 'lg',
        payload: {
          userId,
          userName: data?.userProfiles?.users?.[userId]?.displayName ?? userId,
          ...(defaultSelection ? { defaultSelection } : {})
        }
      });
    },
    [activeTabGachaId, data?.userProfiles?.users, push]
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
      onContentTouchCancel={handleUsersContentTouchCancel}
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

      <GachaTabs
        tabs={gachaTabs}
        activeId={activeUsersTabId}
        onSelect={setActiveUsersTabId}
        className="users-section__gacha-tabs"
      />

      <div className="users-section__tab-panel tab-panel-viewport">
        <div key={activeUsersTabId} className={usersTabPanelAnimationClass}>
          {status !== 'ready' ? (
            <p className="users-section__status-message text-sm text-muted-foreground">ローカルストレージからユーザーデータを読み込み中です…</p>
          ) : null}
          {status === 'ready' && users.length === 0 ? (
            <p className="users-section__empty-message text-sm text-muted-foreground">表示できるユーザーがいません。ガチャの履歴や在庫を確認してください。</p>
          ) : null}
          {status === 'ready' && users.length > 0 && tabbedUsers.length === 0 ? (
            <p className="users-section__empty-tab-message text-sm text-muted-foreground">
              {activeTabLabel} に表示できるユーザーがいません。
            </p>
          ) : null}

          {tabbedUsers.length > 0 ? (
            <div className="users-section__list space-y-3">
              {tabbedUsers.map((user) => (
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
        </div>
      </div>
    </SectionContainer>
  );
}
