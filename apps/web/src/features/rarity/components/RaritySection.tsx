import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { RarityColorChip } from './RarityColorChip';

const SAMPLE_GACHAS = ['リワグガチャ', '闇ガチャ'];

const SAMPLE_RARITIES = [
  { code: 'SSR', color: '#fde68a', rate: 5 },
  { code: 'SR', color: '#a78bfa', rate: 15 },
  { code: 'R', color: '#93c5fd', rate: 30 },
  { code: 'N', color: '#a7f3d0', rate: 50 }
];

export function RaritySection(): JSX.Element {
  const totalRate = SAMPLE_RARITIES.reduce((sum, rarity) => sum + rarity.rate, 0);

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
      <div className="flex flex-wrap items-center gap-2">
        {SAMPLE_GACHAS.map((gacha, index) => (
          <button
            key={gacha}
            type="button"
            className={clsx(
              'tab-pill rounded-full border px-4 py-1.5',
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
          className="chip"
          onClick={() => console.info('ガチャ登録のモーダルは未実装です')}
        >
          <PlusCircleIcon className="h-4 w-4" />
          ガチャを登録
        </button>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/60 bg-surface/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">1回の消費pt</span>
            <input
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">コンプpt</span>
            <input
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">お得バンドル（n ptで m 連）</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder="n"
                className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">ptで</span>
              <input
                type="number"
                min={0}
                placeholder="m"
                className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">連</span>
            </div>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">保証（n連以上で ○○ 以上確定）</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder="n"
                className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">連以上で</span>
              <input
                type="text"
                placeholder="SSR"
                className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">以上確定</span>
            </div>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="min-w-full divide-y divide-border/60 text-left">
          <thead className="bg-[#0a0a12] text-xs uppercase tracking-[0.3em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">レアリティ</th>
              <th className="px-4 py-3 font-semibold">カラー</th>
              <th className="px-4 py-3 font-semibold">排出率</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 bg-surface/60">
            {SAMPLE_RARITIES.map((rarity) => (
              <tr key={rarity.code} className="text-sm text-surface-foreground">
                <td className="px-4 py-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-[#11111a] text-xs font-bold uppercase tracking-[0.24em]">
                    {rarity.code}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RarityColorChip
                    value={rarity.color}
                    ariaLabel={`${rarity.code} のカラー`}
                    onClick={() => console.info('カラーピッカーは未実装です')}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex max-w-[9rem] items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={rarity.rate}
                      className="w-full rounded-xl border border-border/60 bg-[#11111a] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="chip"
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

      <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent">
        <span>合計排出率 {totalRate}%</span>
        <button
          type="button"
          className="chip border-transparent bg-accent text-accent-foreground"
          onClick={() => console.info('排出率の正規化は未実装です')}
        >
          正規化する
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="chip border-accent/40 bg-accent/10 text-accent"
          onClick={() => console.info('レアリティ追加のモーダルは未実装です')}
        >
          <PlusCircleIcon className="h-4 w-4" />
          レアリティを追加
        </button>
      </div>
    </SectionContainer>
  );
}
