import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { SectionContainer } from '../../../components/layout/SectionContainer';

const SAMPLE_GACHAS = ['スタンダード', 'プレミア', 'イベント', '限定'];

const SAMPLE_RARITIES = [
  { code: 'SSR', label: 'スーパースペシャル', color: '#ff8ab2', rate: '5.0%', count: '2枠' },
  { code: 'SR', label: 'スーパーレア', color: '#ff4f89', rate: '15.0%', count: '6枠' },
  { code: 'R', label: 'レア', color: '#c438ff', rate: '30.0%', count: '12枠' },
  { code: 'N', label: 'ノーマル', color: '#5a5aff', rate: '50.0%', count: '20枠' }
];

export function RaritySection(): JSX.Element {
  return (
    <SectionContainer
      id="rarity"
      title="レアリティ設定"
      description="排出率・カラー・順序を編集し、RarityStoreと同期します。"
      accentLabel="Rarity Sync"
      actions={
        <button
          type="button"
          className="chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('レアリティ追加のモーダルは未実装です')}
        >
          <PlusCircleIcon className="h-4 w-4" />
          レアリティを追加
        </button>
      }
      footer="AppStateStoreとRarityStoreの正規化ルールに従い、保存時に排出率合計が100%になるよう調整します。"
    >
      <div className="flex flex-wrap gap-2">
        {SAMPLE_GACHAS.map((gacha, index) => (
          <button
            key={gacha}
            type="button"
            className={clsx(
              'tab-pill rounded-full border px-4 py-1.5',
              index === 0
                ? 'border-accent/80 bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(255,47,93,0.45)]'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
          >
            {gacha}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => console.info('ガチャ登録のモーダルは未実装です')}
        >
          <PlusCircleIcon className="h-4 w-4" />
          ガチャを登録
        </button>
      </div>
      <div className="grid gap-3">
        {SAMPLE_RARITIES.map((rarity) => (
          <div
            key={rarity.code}
            className="grid grid-cols-1 gap-4 rounded-2xl border border-white/5 bg-surface/30 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)] sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,0.8fr)_minmax(6rem,0.6fr)_auto] sm:items-center"
          >
            <div className="flex items-center gap-4">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
                style={{
                  background: `linear-gradient(135deg, ${rarity.color}, rgba(5,4,10,0.9))`
                }}
              >
                {rarity.code}
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-surface-foreground">{rarity.label}</p>
                <p className="text-xs text-muted-foreground">{rarity.count}</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">排出率</label>
              <input
                type="text"
                defaultValue={rarity.rate}
                className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">カラー</label>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground transition hover:border-accent/60"
                onClick={() => console.info('カラーピッカーは未実装です')}
              >
                <span>{rarity.color}</span>
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: rarity.color }}
                />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="chip"
                onClick={() => console.info('リアリティ削除は未実装です')}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent">
        <span>合計排出率 100%</span>
        <button
          type="button"
          className="chip border-transparent bg-accent text-accent-foreground"
          onClick={() => console.info('排出率の正規化は未実装です')}
        >
          正規化する
        </button>
      </div>
    </SectionContainer>
  );
}
