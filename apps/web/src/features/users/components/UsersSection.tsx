import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useState } from 'react';

import { UserCard, type UserCardProps } from '../../../components/cards/UserCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { UserFilterPanel } from './UserFilterPanel';

const RARITY_META = {
  SSR: { rarityId: 'rar-ssr', label: 'SSR', color: '#ff8ab2' },
  SR: { rarityId: 'rar-sr', label: 'SR', color: '#ff4f89' },
  R: { rarityId: 'rar-r', label: 'R', color: '#c438ff' },
  N: { rarityId: 'rar-n', label: 'N', color: '#4d6bff' }
} satisfies Record<string, UserCardProps['inventories'][number]['pulls'][number]['rarity']>;

type SampleUser = Omit<UserCardProps, 'onExport'>;

const SAMPLE_USERS: SampleUser[] = [
  {
    userId: 'usr-0001',
    userName: '如月 朱音',
    totalSummary: '12回',
    memo: '常連 / VIP対応',
    expandedByDefault: true,
    inventories: [
      {
        inventoryId: 'inv-usr-0001-main',
        gachaId: 'gch-main',
        gachaName: 'スターブライト',
        pulls: [
          { itemId: 'itm-000001', itemName: '煌めく星屑ブレスレット', rarity: RARITY_META.SSR, count: 1 },
          { itemId: 'itm-000005', itemName: '薄紅のカードケース', rarity: RARITY_META.R, count: 2 },
          { itemId: 'itm-000006', itemName: 'メモリアルチケット', rarity: RARITY_META.R, count: 3 }
        ]
      }
    ]
  },
  {
    userId: 'usr-0002',
    userName: '蒼井 リツ',
    totalSummary: '8回',
    memo: 'ZIP共有済み',
    inventories: [
      {
        inventoryId: 'inv-usr-0002-main',
        gachaId: 'gch-main',
        gachaName: 'スターブライト',
        pulls: [
          { itemId: 'itm-000002', itemName: '漆黒のオーブ', rarity: RARITY_META.SR, count: 1 },
          { itemId: 'itm-000004', itemName: 'スチールギア', rarity: RARITY_META.R, count: 2 },
          { itemId: 'itm-000006', itemName: 'メモリアルチケット', rarity: RARITY_META.N, count: 2 }
        ]
      }
    ]
  },
  {
    userId: 'usr-0003',
    userName: '七海 ましろ',
    totalSummary: '4回',
    memo: '初参加 / Discord連携',
    inventories: [
      {
        inventoryId: 'inv-usr-0003-main',
        gachaId: 'gch-main',
        gachaName: 'スターブライト',
        pulls: [
          { itemId: 'itm-000003', itemName: '幸運のメダル', rarity: RARITY_META.SR, count: 1 },
          { itemId: 'itm-000006', itemName: 'メモリアルチケット', rarity: RARITY_META.N, count: 1 }
        ]
      }
    ]
  }
];

export function UsersSection(): JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(true);

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
          <UserFilterPanel id="users-filter-panel" open={filtersOpen} />
        </div>
      </div>
      <div className="users-section__list space-y-3">
        {SAMPLE_USERS.map((user) => (
          <UserCard
            key={user.userId}
            {...user}
            onExport={(userId) => console.info('ZIP保存処理は未実装です', userId)}
          />
        ))}
      </div>
    </SectionContainer>
  );
}
