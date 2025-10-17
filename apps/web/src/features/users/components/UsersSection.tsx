import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';

import { UserCard, type UserCardProps } from '../../../components/cards/UserCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../components/modal';
import { SaveOptionsDialog } from '../dialogs/SaveOptionsDialog';
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
  const { push } = useModal();

  const handleOpenSaveOptions = useCallback(
    (userId: string) => {
      push(SaveOptionsDialog, {
        id: `save-options-${userId}`,
        title: '保存オプション',
        description: 'ZIP保存・アップロード・共有リンクの各オプションを選択できます。',
        size: 'lg',
        payload: {
          uploadResult: {
            url: 'https://shimmy3.com/download/sample-zip',
            label: 'https://shimmy3.com/download/sample-zip',
            expiresAt: '2024-12-31 23:59'
          },
          onSaveToDevice: () => {
            console.info('デバイス保存処理は未接続です', userId);
          },
          onUploadToService: () => {
            console.info('ZIPアップロード処理は未接続です', userId);
          },
          onShareToDiscord: () => {
            console.info('Discord共有処理は未接続です', userId);
          },
          onCopyUrl: (url) => {
            console.info('共有URLをコピー（ダミー）', { userId, url });
          }
        }
      });
    },
    [push]
  );

  return (
    <SectionContainer
      id="users"
      title="ユーザーごとの獲得内訳"
      description="フィルタやZIP出力でユーザー別の集計を操作します。"
      filterButton={
        <button
          type="button"
          className="users-section__filter-toggle items-section__filter-button chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-pressed={filtersOpen}
          aria-expanded={filtersOpen}
          aria-controls="users-filter-panel"
        >
          <AdjustmentsHorizontalIcon className="h-4 w-4" />
          フィルタ
        </button>
      }
      footer="ユーザーカードの折りたたみ・フィルタ同期はUserPanelFilterと同一のフックを利用します。"
    >
      <UserFilterPanel id="users-filter-panel" hidden={!filtersOpen} />
      <div className="users-section__list space-y-3">
        {SAMPLE_USERS.map((user) => (
          <UserCard
            key={user.userId}
            {...user}
            onExport={handleOpenSaveOptions}
          />
        ))}
      </div>
    </SectionContainer>
  );
}
