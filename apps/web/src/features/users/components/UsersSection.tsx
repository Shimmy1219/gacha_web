import { ClipboardDocumentIcon, CloudArrowDownIcon, FolderArrowDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

import { SectionContainer } from '../../../components/layout/SectionContainer';

const SAMPLE_USERS = [
  {
    id: 'usr-0001',
    name: '如月 朱音',
    total: '12回',
    memo: '常連 / VIP対応',
    pulls: [
      { rarity: 'SSR', item: '煌めく星屑ブレスレット', count: 1 },
      { rarity: 'SR', item: '薄紅のカードケース', count: 2 },
      { rarity: 'R', item: 'メモリアルチケット', count: 3 }
    ]
  },
  {
    id: 'usr-0002',
    name: '蒼井 リツ',
    total: '8回',
    memo: 'ZIP共有済み',
    pulls: [
      { rarity: 'SR', item: '漆黒のオーブ', count: 1 },
      { rarity: 'R', item: 'スチールギア', count: 2 },
      { rarity: 'N', item: 'メモリアルチケット', count: 2 }
    ]
  },
  {
    id: 'usr-0003',
    name: '七海 ましろ',
    total: '4回',
    memo: '初参加 / Discord連携',
    pulls: [
      { rarity: 'SR', item: '幸運のメダル', count: 1 },
      { rarity: 'N', item: 'メモリアルチケット', count: 1 }
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
          <article
            key={user.id}
            className="space-y-4 rounded-2xl border border-white/5 bg-surface/25 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          >
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-surface-foreground">{user.name}</h3>
                <p className="text-xs text-muted-foreground">{user.total} / {user.memo}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="chip"
                  onClick={() => console.info('リアルタイムカウントは未実装です')}
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  カウントをコピー
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => console.info('ZIP保存処理は未実装です')}
                >
                  <FolderArrowDownIcon className="h-4 w-4" />
                  個別ZIP
                </button>
              </div>
            </header>
            <div className="space-y-2">
              {user.pulls.map((pull) => (
                <div
                  key={`${user.id}-${pull.item}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-[#11111a] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="badge" style={{ color: pull.rarity === 'SSR' ? '#ff8ab2' : pull.rarity === 'SR' ? '#ff4f89' : pull.rarity === 'R' ? '#c438ff' : '#4d6bff' }}>
                      {pull.rarity}
                    </span>
                    <span className="text-sm text-surface-foreground">{pull.item}</span>
                  </div>
                  <span className="chip">×{pull.count}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </SectionContainer>
  );
}
