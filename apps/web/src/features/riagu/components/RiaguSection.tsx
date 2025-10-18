import { Cog8ToothIcon, GiftIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';

interface RiaguDisplayEntry {
  id: string;
  itemName: string;
  gachaName: string;
  rarityLabel: string;
  rarityColor: string;
  costLabel: string;
  status: string;
  winners: Array<{ name: string; count: number }>;
}

function formatCost(cost?: number): string {
  if (cost == null) {
    return '価格未設定';
  }
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(cost);
}

function formatStatus(stock?: number, notes?: string): string {
  const parts: string[] = [];
  if (stock != null) {
    parts.push(`在庫残り${stock}`);
  }
  if (notes) {
    parts.push(notes);
  }
  return parts.join(' / ') || 'メモ未設定';
}

export function RiaguSection(): JSX.Element {
  const { status, data } = useGachaLocalStorage();

  const entries = useMemo<RiaguDisplayEntry[]>(() => {
    if (!data?.riaguState) {
      return [];
    }

    return Object.values(data.riaguState.riaguCards ?? {}).map((card) => {
      const catalogItem = data.catalogState?.byGacha?.[card.gachaId]?.items?.[card.itemId];
      const gachaName = data.appState?.meta?.[card.gachaId]?.displayName ?? card.gachaId;
      const rarityEntity = catalogItem?.rarityId
        ? data.rarityState?.entities?.[catalogItem.rarityId]
        : undefined;
      const itemName = catalogItem?.name ?? card.itemId;
      const rarityLabel = rarityEntity?.label ?? '未分類';
      const rarityColor = rarityEntity?.color ?? '#a855f7';

      const reverseEntries = data.userInventories?.byItemId?.[card.itemId] ?? [];
      const winners = reverseEntries
        .map((record) => ({
          name: data.userProfiles?.users?.[record.userId]?.displayName ?? record.userId,
          count: record.count ?? 0
        }))
        .filter((winner) => winner.count > 0)
        .sort((a, b) => b.count - a.count);

      return {
        id: card.id,
        itemName,
        gachaName,
        rarityLabel,
        rarityColor,
        costLabel: formatCost(card.unitCost),
        status: formatStatus(card.stock, card.notes),
        winners: winners.length > 0 ? winners : [{ name: '当選者なし', count: 0 }]
      } satisfies RiaguDisplayEntry;
    });
  }, [data]);

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
            onClick={() => console.info('タブ切り替えは未実装です', tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {status !== 'ready' ? (
        <p className="text-sm text-muted-foreground">ローカルストレージからリアグ情報を読み込み中です…</p>
      ) : null}
      {status === 'ready' && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">リアグ対象のアイテムがありません。仮データを投入してから再度ご確認ください。</p>
      ) : null}

      {entries.length > 0 ? (
        <div className="riagu-section__list space-y-3">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="riagu-card space-y-4 rounded-2xl border border-white/5 bg-surface/25 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            >
              <header className="riagu-card__header flex items-start justify-between gap-3">
                <div className="riagu-card__meta space-y-1">
                  <span className="riagu-card__rarity badge" style={{ color: entry.rarityColor }}>
                    {entry.rarityLabel}
                  </span>
                  <h3 className="riagu-card__title text-base font-semibold text-surface-foreground">{entry.itemName}</h3>
                  <p className="riagu-card__status text-xs text-muted-foreground">
                    {entry.gachaName} / {entry.costLabel} / {entry.status}
                  </p>
                </div>
                <div className="riagu-card__actions flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="riagu-card__detail-button chip"
                    onClick={() => console.info('リアグ詳細モーダルは未実装です', entry.id)}
                  >
                    <GiftIcon className="h-4 w-4" />
                    詳細
                  </button>
                  <button
                    type="button"
                    className="riagu-card__share-button chip"
                    onClick={() => console.info('共有リンク生成は未実装です', entry.id)}
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
                    <span className="riagu-card__winner-count chip">{winner.count > 0 ? `×${winner.count}` : '—'}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </SectionContainer>
  );
}
