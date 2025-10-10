import { AdjustmentsHorizontalIcon, PhotoIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { SectionContainer } from '../../../components/layout/SectionContainer';

const SAMPLE_ITEMS = [
  { code: 'itm-000001', name: '煌めく星屑ブレスレット', rarity: 'SSR', hasImage: true, riagu: true },
  { code: 'itm-000002', name: '漆黒のオーブ', rarity: 'SR', hasImage: true, riagu: false },
  { code: 'itm-000003', name: '幸運のメダル', rarity: 'SR', hasImage: false, riagu: false },
  { code: 'itm-000004', name: 'スチールギア', rarity: 'R', hasImage: false, riagu: false },
  { code: 'itm-000005', name: '薄紅のカードケース', rarity: 'R', hasImage: true, riagu: false },
  { code: 'itm-000006', name: 'メモリアルチケット', rarity: 'N', hasImage: false, riagu: false }
];

const RARITY_COLORS: Record<string, string> = {
  SSR: '#ff8ab2',
  SR: '#ff4f89',
  R: '#c438ff',
  N: '#4d6bff'
};

export function ItemsSection(): JSX.Element {
  return (
    <SectionContainer
      id="items"
      title="アイテム画像の設定"
      description="カタログ内のアイテムを整理し、画像・リアグ状態を管理します。"
      actions={
        <button
          type="button"
          className="chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('フィルタモーダルは未実装です')}
        >
          <AdjustmentsHorizontalIcon className="h-4 w-4" />
          フィルタ
        </button>
      }
      footer="ガチャタブ切替とItemCatalogToolbarの操作が追加される予定です。画像設定はAssetStoreと連携します。"
    >
      <div className="flex flex-wrap gap-2">
        {['最新', 'おすすめ', 'リアグ対象', '未設定'].map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={clsx(
              'tab-pill rounded-full border px-4 py-1.5',
              index === 0
                ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(255,47,93,0.45)]'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SAMPLE_ITEMS.map((item) => {
          const color = RARITY_COLORS[item.rarity] ?? '#ffffff';
          return (
            <article
              key={item.code}
              data-riagu={item.riagu}
              className={clsx(
                'relative overflow-hidden rounded-2xl border border-white/5 bg-surface/20 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition hover:border-accent/60',
                item.riagu && 'ring-1 ring-inset ring-accent/60'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="badge" style={{ color }}>{item.rarity}</span>
                {item.riagu ? (
                  <span className="chip border-accent/40 bg-accent/10 text-accent">
                    <SparklesIcon className="h-4 w-4" />
                    リアグ
                  </span>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                <div
                  className={clsx(
                    'flex aspect-video items-center justify-center rounded-xl border border-border/60 bg-[#11111a] text-muted-foreground',
                    item.hasImage && 'border-transparent'
                  )}
                  style={
                    item.hasImage
                      ? {
                          backgroundImage:
                            'linear-gradient(135deg, rgba(255,47,93,0.55), rgba(12,12,20,0.9)), url(https://images.unsplash.com/photo-1521579971123-1192931a1452?auto=format&fit=crop&w=400&q=80)',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }
                      : undefined
                  }
                >
                  {!item.hasImage ? <PhotoIcon className="h-10 w-10" /> : null}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-foreground">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">{item.code}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => console.info('画像設定モーダルは未実装です')}
                  >
                    画像を設定
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => console.info('リアグ設定ダイアログは未実装です')}
                  >
                    リアグを設定
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => console.info('アイテム削除確認は未実装です')}
                  >
                    削除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </SectionContainer>
  );
}
