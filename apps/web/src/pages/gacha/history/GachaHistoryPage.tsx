import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { type PullHistoryEntryV1 } from '@domain/app-persistence';
import { useStoreValue } from '@domain/stores';
import { useDomainStores } from '../../../features/storage/AppPersistenceProvider';
import { useShareHandler } from '../../../hooks/useShare';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { HistoryEntriesList } from '../../../modals/dialogs/history/HistoryEntriesList';
import {
  DEFAULT_HISTORY_USER_ID,
  buildItemMetadataMap,
  normalizeHistoryUserId
} from '../../../modals/dialogs/history/historyUtils';
import { DESKTOP_GRID_MAIN_HEIGHT_CSS } from '../components/dashboard/DashboardDesktopGrid';
import {
  DashboardMobileTabBar,
  type DashboardMobileTabSection
} from '../components/dashboard/DashboardMobileTabBar';
import { useResponsiveDashboard } from '../components/dashboard/useResponsiveDashboard';
import { GachaTabs, type GachaTabOption } from '../components/common/GachaTabs';
import { SectionContainer } from '../components/layout/SectionContainer';

const ALL_HISTORY_SECTION_ID = 'all_history';
const ALL_HISTORY_TAB_ID = 'all_history';
const GACHA_HISTORY_MOBILE_SECTIONS: readonly DashboardMobileTabSection[] = [
  { id: 'rarity', label: 'レアリティ' },
  { id: 'items', label: 'アイテム' },
  { id: 'users', label: 'ユーザー' },
  { id: 'riagu', label: 'リアグ' }
];

interface TimelineHistoryCard {
  entry: PullHistoryEntryV1;
  orderIndex: number;
  userName: string;
  gachaName: string;
  itemMetadata: ReturnType<typeof buildItemMetadataMap>;
}

interface HistoryUserProfilesState {
  users?: Record<string, { displayName?: string } | undefined>;
}

interface HistoryFilterTab {
  id: string;
  label: string;
  gachaId: string | null;
}

interface GachaHistoryPageProps {
  onDrawGacha?: () => void;
}

function resolveExecutedAtMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }
  return ms;
}

function resolveHistoryUserName(
  userId: string | undefined,
  userProfiles: HistoryUserProfilesState | undefined
): string {
  const normalizedUserId = normalizeHistoryUserId(userId);
  const profileName = userProfiles?.users?.[normalizedUserId]?.displayName?.trim();
  if (profileName) {
    return profileName;
  }
  if (normalizedUserId === DEFAULT_HISTORY_USER_ID) {
    return 'デフォルトユーザー';
  }
  return normalizedUserId;
}

function compareTimelineCards(a: TimelineHistoryCard, b: TimelineHistoryCard): number {
  const aExecutedAtMs = resolveExecutedAtMs(a.entry.executedAt);
  const bExecutedAtMs = resolveExecutedAtMs(b.entry.executedAt);

  if (aExecutedAtMs !== null && bExecutedAtMs !== null && aExecutedAtMs !== bExecutedAtMs) {
    return bExecutedAtMs - aExecutedAtMs;
  }
  if (aExecutedAtMs !== null && bExecutedAtMs === null) {
    return -1;
  }
  if (aExecutedAtMs === null && bExecutedAtMs !== null) {
    return 1;
  }
  return b.orderIndex - a.orderIndex;
}

function resolveHistoryTabs(cards: TimelineHistoryCard[], appOrder: string[] | undefined): HistoryFilterTab[] {
  if (cards.length === 0) {
    return [
      {
        id: ALL_HISTORY_TAB_ID,
        label: '全て',
        gachaId: null
      }
    ];
  }

  const gachaNameById = new Map<string, string>();
  cards.forEach((card) => {
    if (!gachaNameById.has(card.entry.gachaId)) {
      gachaNameById.set(card.entry.gachaId, card.gachaName);
    }
  });

  const orderedGachaIds: string[] = [];
  const known = new Set<string>();

  (appOrder ?? []).forEach((gachaId) => {
    if (!gachaNameById.has(gachaId) || known.has(gachaId)) {
      return;
    }
    known.add(gachaId);
    orderedGachaIds.push(gachaId);
  });

  Array.from(gachaNameById.keys())
    .filter((gachaId) => !known.has(gachaId))
    .sort((a, b) => {
      const nameA = gachaNameById.get(a) ?? a;
      const nameB = gachaNameById.get(b) ?? b;
      return nameA.localeCompare(nameB, 'ja');
    })
    .forEach((gachaId) => {
      known.add(gachaId);
      orderedGachaIds.push(gachaId);
    });

  return [
    {
      id: ALL_HISTORY_TAB_ID,
      label: '全て',
      gachaId: null
    },
    ...orderedGachaIds.map((gachaId) => ({
      id: `all_history-gacha-${gachaId}`,
      label: gachaNameById.get(gachaId) ?? gachaId,
      gachaId
    }))
  ];
}

/**
 * 全ユーザー・全ガチャの履歴を時系列で表示するページ。
 * /gacha のダッシュボードDOM構造へ寄せるため、SectionContainer・GachaTabs・dashboard-* クラスを再利用する。
 *
 * @returns 全履歴ページ要素
 */
export function GachaHistoryPage({ onDrawGacha }: GachaHistoryPageProps): JSX.Element {
  const {
    pullHistory: pullHistoryStore,
    catalog: catalogStore,
    rarities: rarityStore,
    appState: appStateStore,
    userProfiles: userProfilesStore
  } = useDomainStores();
  const { isMobile } = useResponsiveDashboard();
  const navigate = useNavigate();

  const pullHistoryState = useStoreValue(pullHistoryStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);
  const appState = useStoreValue(appStateStore);
  const userProfilesState = useStoreValue(userProfilesStore);

  const executedAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    []
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat('ja-JP'), []);
  const shareHandlers = useShareHandler();

  const timelineCards = useMemo(() => {
    const cards: TimelineHistoryCard[] = [];
    const itemMetadataCacheByGachaId = new Map<string, ReturnType<typeof buildItemMetadataMap>>();

    (pullHistoryState?.order ?? []).forEach((entryId, orderIndex) => {
      if (!entryId) {
        return;
      }

      const entry = pullHistoryState?.pulls?.[entryId];
      if (!entry || !entry.gachaId) {
        return;
      }

      let itemMetadata = itemMetadataCacheByGachaId.get(entry.gachaId);
      if (!itemMetadata) {
        itemMetadata = buildItemMetadataMap(catalogState, rarityState, entry.gachaId);
        itemMetadataCacheByGachaId.set(entry.gachaId, itemMetadata);
      }

      const gachaName = appState?.meta?.[entry.gachaId]?.displayName?.trim() || entry.gachaId;
      const userName = resolveHistoryUserName(entry.userId, userProfilesState);

      cards.push({
        entry,
        orderIndex,
        userName,
        gachaName,
        itemMetadata
      });
    });

    // executedAtを優先し、日時が同値/不正なケースはpullHistoryの登録順で逆順に寄せる。
    return cards.sort(compareTimelineCards);
  }, [appState?.meta, catalogState, pullHistoryState, rarityState, userProfilesState]);

  const historyTabs = useMemo(
    () => resolveHistoryTabs(timelineCards, appState?.order),
    [appState?.order, timelineCards]
  );

  const gachaTabs = useMemo<GachaTabOption[]>(
    () => historyTabs.map((tab) => ({ id: tab.id, label: tab.label })),
    [historyTabs]
  );

  const [activeTabId, setActiveTabId] = useState<string>(ALL_HISTORY_TAB_ID);

  useEffect(() => {
    // タブ構成が変わった時に無効なactiveIdを保持しないため、常に有効な先頭タブへ補正する。
    // 依存にはタブ一覧とactiveIdを含め、履歴更新・選択更新の両方で整合性を担保する。
    if (historyTabs.some((tab) => tab.id === activeTabId)) {
      return;
    }
    setActiveTabId(historyTabs[0]?.id ?? ALL_HISTORY_TAB_ID);
  }, [activeTabId, historyTabs]);

  const tabIds = useMemo(() => historyTabs.map((tab) => tab.id), [historyTabs]);
  const panelMotion = useTabMotion(activeTabId, tabIds);
  const panelAnimationClass = clsx(
    'all-history-section__scroll-content space-y-4',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const activeFilterGachaId = useMemo(() => {
    const activeTab = historyTabs.find((tab) => tab.id === activeTabId);
    return activeTab?.gachaId ?? null;
  }, [activeTabId, historyTabs]);

  const filteredTimelineCards = useMemo(() => {
    if (!activeFilterGachaId) {
      return timelineCards;
    }
    return timelineCards.filter((card) => card.entry.gachaId === activeFilterGachaId);
  }, [activeFilterGachaId, timelineCards]);

  const handleSelectMobileSection = useCallback(
    (sectionId: string) => {
      const searchParams = new URLSearchParams({ view: sectionId });
      navigate(`/gacha?${searchParams.toString()}`);
    },
    [navigate]
  );

  const handleOpenHistory = useCallback(() => {
    navigate('/gacha/history');
  }, [navigate]);

  const historySection = (mobileLayout: boolean): JSX.Element => (
    <SectionContainer
      id={ALL_HISTORY_SECTION_ID}
      title="全履歴"
      description="全ユーザーの履歴を時系列（新しい順）で確認できます。"
      actions={
        mobileLayout ? undefined : (
          <Link
            to="/gacha"
            className="all-history-section__back-button btn btn-muted rounded-full"
          >
            ガチャ画面に戻る
          </Link>
        )
      }
      className={clsx('all-history-section min-h-0', !mobileLayout && 'h-full')}
      contentClassName="all-history-section__content flex min-h-0 flex-col !overflow-visible !pr-0 !space-y-0"
    >
      <GachaTabs
        tabs={gachaTabs}
        activeId={activeTabId}
        onSelect={(tabId) => setActiveTabId(tabId)}
        className="all-history-section__gacha-tabs"
      />

      <div
        className={clsx(
          'all-history-section__scroll tab-panel-viewport',
          mobileLayout ? 'all-history-section__scroll--mobile px-4 py-3' : 'section-scroll flex-1'
        )}
      >
        <div key={activeTabId} className={panelAnimationClass}>
          {timelineCards.length === 0 ? (
            <p className="all-history-section__empty-message rounded-2xl border border-dashed border-border/60 bg-surface/40 px-4 py-6 text-sm text-muted-foreground">
              まだガチャ履歴がありません。
            </p>
          ) : filteredTimelineCards.length === 0 ? (
            <p className="all-history-section__empty-filter-message rounded-2xl border border-dashed border-border/60 bg-surface/40 px-4 py-6 text-sm text-muted-foreground">
              このガチャには履歴がありません。
            </p>
          ) : (
            <section className="all-history-section__timeline-section flex flex-col gap-4">
              {filteredTimelineCards.map((card) => (
                <div
                  key={`${card.entry.id}-${card.orderIndex}`}
                  className="all-history-section__timeline-card rounded-2xl border border-border/40 bg-panel/35 p-4"
                >
                  <div className="all-history-section__timeline-meta mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="all-history-section__timeline-meta-left flex min-w-0 flex-col gap-1">
                      <p className="all-history-section__timeline-user-name text-sm font-semibold text-surface-foreground">
                        {card.userName}
                      </p>
                      <p className="all-history-section__timeline-gacha-name text-xs text-muted-foreground">
                        {card.gachaName}
                      </p>
                    </div>
                    <span className="all-history-section__timeline-entry-id font-mono text-[11px] text-muted-foreground/80">
                      履歴ID: {card.entry.id}
                    </span>
                  </div>
                  <HistoryEntriesList
                    entries={[card.entry]}
                    userName={card.userName}
                    gachaName={card.gachaName}
                    executedAtFormatter={executedAtFormatter}
                    numberFormatter={numberFormatter}
                    itemMetadata={card.itemMetadata}
                    shareHandlers={shareHandlers}
                  />
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </SectionContainer>
  );

  return (
    <div id="gacha-history-page" className="gacha-history-page min-h-0 text-surface-foreground">
      <div className="gacha-history-page__dashboard-shell dashboard-shell relative flex w-full flex-col gap-4 pb-[5.5rem] lg:pb-0">
        {!isMobile ? (
          <div className="gacha-history-page__desktop dashboard-shell__desktop">
            <div className="gacha-history-page__desktop-inner mx-auto w-full max-w-[1280px]">
              <div
                data-view={ALL_HISTORY_SECTION_ID}
                className="gacha-history-page__desktop-item h-full min-h-0"
                style={{ height: DESKTOP_GRID_MAIN_HEIGHT_CSS }}
              >
                <div className="all-history-section__desktop-item-root h-full min-h-0">
                  {historySection(false)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="gacha-history-page__mobile dashboard-shell__mobile">
            <div data-view={ALL_HISTORY_SECTION_ID} className="dashboard-shell__mobile-section">
              {historySection(true)}
            </div>
          </div>
        )}

        {isMobile ? (
          <DashboardMobileTabBar
            sections={GACHA_HISTORY_MOBILE_SECTIONS}
            onSelectSection={handleSelectMobileSection}
            onDrawGacha={onDrawGacha}
            onOpenHistory={handleOpenHistory}
            historyTabActive
            className="all-history-mobile-tabs"
          />
        ) : null}
      </div>
    </div>
  );
}
