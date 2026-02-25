import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { type PullHistoryEntryV1 } from '@domain/app-persistence';
import { useStoreValue } from '@domain/stores';
import { useDomainStores } from '../../../features/storage/AppPersistenceProvider';
import { useShareHandler } from '../../../hooks/useShare';
import { HistoryEntriesList } from '../../../modals/dialogs/history/HistoryEntriesList';
import {
  DEFAULT_HISTORY_USER_ID,
  buildItemMetadataMap,
  normalizeHistoryUserId
} from '../../../modals/dialogs/history/historyUtils';

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

/**
 * 全ユーザー・全ガチャの履歴を時系列（新しい順）で表示するページ。
 * 既存のユーザー履歴モーダルで利用している履歴カード（HistoryEntriesList）を再利用する。
 *
 * @returns 履歴一覧ページ要素
 */
export function GachaHistoryPage(): JSX.Element {
  const {
    pullHistory: pullHistoryStore,
    catalog: catalogStore,
    rarities: rarityStore,
    appState: appStateStore,
    userProfiles: userProfilesStore
  } = useDomainStores();

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

  return (
    <div id="gacha-history-page" className="gacha-history-page min-h-screen text-surface-foreground">
      <main className="gacha-history-page__main mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="gacha-history-page__header rounded-3xl bg-panel/85 p-6 backdrop-blur">
          <div className="gacha-history-page__heading-group space-y-2">
            <h1 className="gacha-history-page__title text-3xl font-bold">全履歴</h1>
            <p className="gacha-history-page__description text-sm text-muted-foreground">
              全ユーザーの履歴を時系列（新しい順）で表示しています。
            </p>
          </div>
          <div className="gacha-history-page__header-actions mt-4">
            <Link to="/gacha" className="gacha-history-page__back-link btn btn-muted rounded-full">
              ガチャ画面に戻る
            </Link>
          </div>
        </header>

        {timelineCards.length === 0 ? (
          <p className="gacha-history-page__empty-message rounded-2xl border border-dashed border-border/60 bg-surface/40 px-4 py-6 text-sm text-muted-foreground">
            まだガチャ履歴がありません。
          </p>
        ) : (
          <section className="gacha-history-page__timeline-section flex flex-col gap-4">
            {timelineCards.map((card) => (
              <div key={`${card.entry.id}-${card.orderIndex}`} className="gacha-history-page__timeline-card rounded-2xl border border-border/40 bg-panel/35 p-4">
                <div className="gacha-history-page__timeline-meta mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="gacha-history-page__timeline-meta-left flex min-w-0 flex-col gap-1">
                    <p className="gacha-history-page__timeline-user-name text-sm font-semibold text-surface-foreground">
                      {card.userName}
                    </p>
                    <p className="gacha-history-page__timeline-gacha-name text-xs text-muted-foreground">
                      {card.gachaName}
                    </p>
                  </div>
                  <span className="gacha-history-page__timeline-entry-id font-mono text-[11px] text-muted-foreground/80">
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
      </main>
    </div>
  );
}
