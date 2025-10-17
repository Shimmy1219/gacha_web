import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { RarityColorChip } from './RarityColorChip';
import { PtControlsPanel } from './PtControlsPanel';

const SAMPLE_GACHAS = ['リワグガチャ', '闇ガチャ'];

const SAMPLE_RARITIES = [
  { code: 'SSR', color: '#fde68a', rate: 5 },
  { code: 'SR', color: '#a78bfa', rate: 15 },
  { code: 'R', color: '#93c5fd', rate: 30 },
  { code: 'N', color: '#a7f3d0', rate: 50 }
];

const RARITY_BADGE_THEMES: Record<string, { background: string; shadow: string }> = {
  SSR: {
    background: 'linear-gradient(135deg, #ff3568 0%, #ff5f8f 45%, #ff9fc2 100%)',
    shadow: '0 10px 24px rgba(255, 95, 143, 0.35)'
  },
  SR: {
    background: 'linear-gradient(135deg, #ff2e57 0%, #ff4f89 45%, #ff7aa8 100%)',
    shadow: '0 10px 22px rgba(255, 79, 137, 0.32)'
  },
  R: {
    background: 'linear-gradient(135deg, #762bff 0%, #a855f7 50%, #c084fc 100%)',
    shadow: '0 10px 24px rgba(118, 43, 255, 0.32)'
  },
  N: {
    background: 'linear-gradient(135deg, #3149ff 0%, #4d6bff 50%, #7a94ff 100%)',
    shadow: '0 10px 22px rgba(77, 107, 255, 0.3)'
  }
};

const DEFAULT_BADGE_THEME = {
  background: 'linear-gradient(135deg, #3f3f46 0%, #52525b 50%, #71717a 100%)',
  shadow: '0 10px 22px rgba(82, 82, 91, 0.35)'
};

export function RaritySection(): JSX.Element {
  return (
    <SectionContainer
      id="rarity"
      title="レアリティ設定"
      description="排出率・カラー・順序を編集し、RarityStoreと同期します。"
    >
      <div className="rarity-section__gacha-tabs flex flex-wrap items-center gap-2">
        {SAMPLE_GACHAS.map((gacha, index) => (
          <button
            key={gacha}
            type="button"
            className={clsx(
              'rarity-section__gacha-tab tab-pill rounded-full border px-4 py-1.5',
              index === 0
                ? 'border-accent/80 bg-accent text-accent-foreground'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
          >
            {gacha}
          </button>
        ))}
        <button
          type="button"
          className="rarity-section__add-gacha chip"
          onClick={() => console.info('ガチャ登録のモーダルは未実装です')}
        >
          <PlusCircleIcon className="h-4 w-4" />
          ガチャを登録
        </button>
      </div>

      <PtControlsPanel />

      <div className="rarity-section__table-wrapper overflow-hidden rounded-2xl border border-border/60">
        <table className="rarity-section__table min-w-full divide-y divide-border/60 text-left">
          <thead className="rarity-section__table-head bg-[#121218] text-xs uppercase tracking-[0.3em] text-muted-foreground">
            <tr>
              <th className="rarity-section__column px-3 py-2.5 font-semibold">レアリティ</th>
              <th className="rarity-section__column px-3 py-2.5 font-semibold">カラー</th>
              <th className="rarity-section__column px-3 py-2.5 font-semibold">排出率</th>
              <th className="rarity-section__column px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="rarity-section__table-body divide-y divide-border/40 bg-surface/60">
            {SAMPLE_RARITIES.map((rarity) => (
              <tr key={rarity.code} className="rarity-section__row text-sm text-surface-foreground">
                <td className="rarity-section__cell px-3 py-2">
                  {(() => {
                    const theme = RARITY_BADGE_THEMES[rarity.code] ?? DEFAULT_BADGE_THEME;

                    return (
                      <span
                        className="rarity-section__rarity-badge inline-flex h-11 w-11 items-center justify-center rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] text-white"
                        style={{
                          background: theme.background,
                          boxShadow: theme.shadow
                        }}
                      >
                        {rarity.code}
                      </span>
                    );
                  })()}
                </td>
                <td className="rarity-section__cell px-3 py-2">
                  <RarityColorChip
                    value={rarity.color}
                    ariaLabel={`${rarity.code} のカラー`}
                    onClick={() => console.info('カラーピッカーは未実装です')}
                  />
                </td>
                <td className="rarity-section__cell px-3 py-2">
                  <div className="rarity-section__rate-control flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={rarity.rate}
                      className="rarity-section__rate-input min-w-[8ch] rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                    />
                    <span className="rarity-section__rate-unit text-xs text-muted-foreground">%</span>
                  </div>
                </td>
                <td className="rarity-section__cell px-3 py-2 text-right">
                  <button
                    type="button"
                    className="rarity-section__delete-button chip"
                    onClick={() => console.info('レアリティ削除は未実装です')}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rarity-section__footer flex justify-end">
        <button
          type="button"
          className="rarity-section__add-rarity chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('レアリティ追加のモーダルは未実装です')}
        >
          <PlusCircleIcon className="h-4 w-4" />
          レアリティを追加
        </button>
      </div>
    </SectionContainer>
  );
}
