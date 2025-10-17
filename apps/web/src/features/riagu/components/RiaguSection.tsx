import { Cog8ToothIcon, GiftIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

import { SectionContainer } from '../../../components/layout/SectionContainer';

const SAMPLE_RIAGU = [
  {
    id: 'rg-001',
    item: '煌めく星屑ブレスレット',
    rarity: 'SSR',
    cost: '¥12,000',
    status: '発注済み',
    winners: [
      { name: '如月 朱音', count: 1 },
      { name: '蒼井 リツ', count: 1 }
    ]
  },
  {
    id: 'rg-002',
    item: '薄紅のカードケース',
    rarity: 'SR',
    cost: '¥6,500',
    status: '在庫確保',
    winners: [
      { name: '七海 ましろ', count: 1 },
      { name: '如月 朱音', count: 1 }
    ]
  }
];

export function RiaguSection(): JSX.Element {
  return (
    <SectionContainer
      id="riagu"
      title="リアグ設定"
      description="リアルグッズの在庫と当選者を同期します。"
      accentLabel="Riagu Control"
      actions={
        <button
          type="button"
          className="riagu-section__settings-button chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('リアグ設定モーダルは未実装です')}
        >
          <Cog8ToothIcon className="h-4 w-4" />
          設定を編集
        </button>
      }
      footer="RiaguStoreのマーク/解除とAppStateStore.saveDebounced()を連携予定です。"
    >
      <div className="riagu-section__tabs flex flex-wrap gap-2">
        {['全て', '優先', '発送待ち'].map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={`tab-pill rounded-full border px-4 py-1.5 ${
              index === 0
                ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(225,29,72,0.45)]'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="riagu-section__list space-y-3">
        {SAMPLE_RIAGU.map((entry) => (
          <article
            key={entry.id}
            className="riagu-card space-y-4 rounded-2xl border border-white/5 bg-surface/25 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          >
            <header className="riagu-card__header flex items-start justify-between gap-3">
              <div className="riagu-card__meta space-y-1">
                <span className="riagu-card__rarity badge text-[#ff8ab2]">{entry.rarity}</span>
                <h3 className="riagu-card__title text-base font-semibold text-surface-foreground">{entry.item}</h3>
                <p className="riagu-card__status text-xs text-muted-foreground">コスト {entry.cost} / ステータス {entry.status}</p>
              </div>
              <div className="riagu-card__actions flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="riagu-card__detail-button chip"
                  onClick={() => console.info('リアグ詳細モーダルは未実装です')}
                >
                  <GiftIcon className="h-4 w-4" />
                  詳細
                </button>
                <button
                  type="button"
                  className="riagu-card__share-button chip"
                  onClick={() => console.info('共有リンク生成は未実装です')}
                >
                  <GlobeAltIcon className="h-4 w-4" />
                  共有
                </button>
              </div>
            </header>
            <div className="riagu-card__winners space-y-2">
              {entry.winners.map((winner) => (
                <div
                  key={`${entry.id}-${winner.name}`}
                  className="riagu-card__winner flex items-center justify-between rounded-xl border border-border/60 bg-[#15151b] px-4 py-3 text-sm text-surface-foreground"
                >
                  <span>{winner.name}</span>
                  <span className="riagu-card__winner-count chip">×{winner.count}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </SectionContainer>
  );
}
