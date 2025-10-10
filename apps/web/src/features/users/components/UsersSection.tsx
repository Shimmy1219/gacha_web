import { CloudArrowDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

import { UserCard, type UserCardProps } from '../../../components/cards/UserCard';
import { SectionContainer } from '../../../components/layout/SectionContainer';

const RARITY_META = {
  SSR: { rarityId: 'rar-ssr', label: 'SSR', color: '#ff8ab2' },
  SR: { rarityId: 'rar-sr', label: 'SR', color: '#ff4f89' },
  R: { rarityId: 'rar-r', label: 'R', color: '#c438ff' },
  N: { rarityId: 'rar-n', label: 'N', color: '#4d6bff' }
} satisfies Record<string, UserCardProps['inventories'][number]['pulls'][number]['rarity']>;

type SampleUser = Omit<UserCardProps, 'onCopyCounts' | 'onExport' | 'onOpenProfile'>;

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
  return (
    <SectionContainer
      id="users"
      title="ユーザーごとの獲得内訳"
      description="フィルタやZIP出力でユーザー別の集計を操作します。"
      accentLabel="User Inventory"
      actions={
        <button
          type="button"
          className="chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('保存オプションモーダルは未実装です')}
        >
          <CloudArrowDownIcon className="h-4 w-4" />
          ZIPを保存
        </button>
      }
      footer="ユーザーカードの折りたたみ・フィルタ同期はUserPanelFilterと同一のフックを利用します。"
    >
      <div className="grid gap-3 rounded-2xl border border-white/5 bg-surface/20 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)] md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border border-border/60 bg-[#11111a] px-4 py-3 text-xs text-muted-foreground">
          <MagnifyingGlassIcon className="h-4 w-4" />
          <input
            type="search"
            placeholder="ユーザー名・メモを検索"
            className="w-full bg-transparent text-sm text-surface-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="chip">SSRのみ</span>
          <span className="chip">リアグ対象</span>
          <span className="chip">ZIP共有済み</span>
          <span className="chip">未受け取り</span>
        </div>
      </div>
      <div className="space-y-3">
        {SAMPLE_USERS.map((user) => (
          <UserCard
            key={user.userId}
            {...user}
            onCopyCounts={(userId) => console.info('リアルタイムカウントは未実装です', userId)}
            onExport={(userId) => console.info('ZIP保存処理は未実装です', userId)}
            onOpenProfile={(userId) => console.info('プロフィール表示は未実装です', userId)}
          />
        ))}
      </div>
    </SectionContainer>
  );
}
