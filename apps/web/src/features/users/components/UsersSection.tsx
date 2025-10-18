import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import { UserCard, type UserCardProps, type UserInventoryEntryItem } from '../../../components/cards/UserCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../components/modal';
import { SaveOptionsDialog } from '../dialogs/SaveOptionsDialog';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';
import { UserFilterPanel } from './UserFilterPanel';

const FALLBACK_RARITY_COLOR = '#a1a1aa';

type DerivedUser = Omit<UserCardProps, 'onExport'>;

function formatExpiresAt(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function UsersSection(): JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const { push } = useModal();
  const { status, data } = useGachaLocalStorage();

  const users = useMemo<DerivedUser[]>(() => {
    if (!data?.userProfiles || !data?.userInventories) {
      return [];
    }

    const results: DerivedUser[] = [];
    const profiles = data.userProfiles.users ?? {};

    Object.values(profiles).forEach((profile) => {
      const userId = profile.id;
      const inventoriesByGacha = data.userInventories?.inventories?.[userId] ?? {};
      const inventories = Object.values(inventoriesByGacha)
        .map((inventory) => {
          const gachaMeta = data.appState?.meta?.[inventory.gachaId];
          const gachaName = gachaMeta?.displayName ?? inventory.gachaId;
          const itemsByRarity = inventory.items ?? {};
          const countsByRarity = inventory.counts ?? {};
          const pulls: UserInventoryEntryItem[] = [];

          Object.entries(itemsByRarity).forEach(([rarityId, itemIds]) => {
            itemIds.forEach((itemId) => {
              const count = countsByRarity[rarityId]?.[itemId] ?? 0;
              if (count <= 0) {
                return;
              }
              const catalogItem = data.catalogState?.byGacha?.[inventory.gachaId]?.items?.[itemId];
              const rarityEntity = data.rarityState?.entities?.[rarityId];
              pulls.push({
                itemId,
                itemName: catalogItem?.name ?? itemId,
                rarity: {
                  rarityId,
                  label: rarityEntity?.label ?? rarityId,
                  color: rarityEntity?.color ?? FALLBACK_RARITY_COLOR
                },
                count
              });
            });
          });

          if (pulls.length === 0) {
            return null;
          }

          return {
            inventoryId: inventory.inventoryId,
            gachaId: inventory.gachaId,
            gachaName,
            pulls
          } satisfies UserCardProps['inventories'][number];
        })
        .filter(Boolean) as UserCardProps['inventories'];

      if (inventories.length === 0) {
        return;
      }

      const totalPulls = inventories.reduce(
        (total, inventory) => total + inventory.pulls.reduce((sum, item) => sum + item.count, 0),
        0
      );

      results.push({
        userId,
        userName: profile.displayName,
        totalSummary: `${totalPulls}連`,
        memo: [profile.team, profile.role].filter(Boolean).join(' / ') || undefined,
        inventories,
        expandedByDefault: results.length === 0
      });
    });

    return results;
  }, [data]);

  const gachaFilterOptions = useMemo(() => {
    if (!data?.appState) {
      return [] as Array<{ value: string; label: string; description?: string }>;
    }

    return (data.appState.order ?? []).map((gachaId) => ({
      value: gachaId,
      label: data.appState?.meta?.[gachaId]?.displayName ?? gachaId,
      description: gachaId
    }));
  }, [data?.appState]);

  const rarityFilterOptions = useMemo(() => {
    if (!data?.rarityState) {
      return [] as Array<{ value: string; label: string }>;
    }

    return Object.values(data.rarityState.entities ?? {}).map((entity) => ({
      value: entity.id,
      label: entity.label
    }));
  }, [data?.rarityState]);

  const handleOpenSaveOptions = useCallback(
    (userId: string) => {
      const saved = data?.saveOptions?.[userId];
      const url = saved?.shareUrl ?? saved?.downloadUrl;

      push(SaveOptionsDialog, {
        id: `save-options-${userId}`,
        title: '保存オプション',
        description: 'ZIP保存・アップロード・共有リンクの各オプションを選択できます。',
        size: 'lg',
        payload: {
          uploadResult: url
            ? {
                url,
                label: saved?.shareUrl ?? url,
                expiresAt: formatExpiresAt(saved?.expiresAt)
              }
            : undefined,
          onSaveToDevice: () => {
            console.info('デバイス保存処理は未接続です', userId);
          },
          onUploadToService: () => {
            console.info('ZIPアップロード処理は未接続です', userId);
          },
          onShareToDiscord: () => {
            console.info('Discord共有処理は未接続です', userId);
          },
          onCopyUrl: (copyUrl) => {
            console.info('共有URLをコピー（ダミー）', { userId, url: copyUrl });
          }
        }
      });
    },
    [data?.saveOptions, push]
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
              ? 'border-accent/70 bg-accent/20 text-accent shadow-[0_18px_42px_rgba(225,29,72,0.2)]'
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
      footer="ユーザーカードの折りたたみ・フィルタ同期はUserPanelFilterと同一のフックを利用します。"
    >
      <div
        className={clsx(
          'users-section__filters grid transition-[grid-template-rows] duration-300 ease-linear',
          filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className={clsx('overflow-hidden transition-opacity duration-300 ease-linear', filtersOpen ? 'opacity-100' : 'opacity-0')}>
          <UserFilterPanel id="users-filter-panel" open={filtersOpen} gachaOptions={gachaFilterOptions} rarityOptions={rarityFilterOptions} />
        </div>
      </div>

      {status !== 'ready' ? (
        <p className="text-sm text-muted-foreground">ローカルストレージからユーザーデータを読み込み中です…</p>
      ) : null}
      {status === 'ready' && users.length === 0 ? (
        <p className="text-sm text-muted-foreground">表示できるユーザーがいません。仮データを投入してから再度開いてください。</p>
      ) : null}

      {users.length > 0 ? (
        <div className="users-section__list space-y-3">
          {users.map((user) => (
            <UserCard key={user.userId} {...user} onExport={handleOpenSaveOptions} />
          ))}
        </div>
      ) : null}
    </SectionContainer>
  );
}
