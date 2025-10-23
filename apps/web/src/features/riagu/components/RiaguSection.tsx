import { GiftIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useGachaLocalStorage } from '../../storage/useGachaLocalStorage';
import { getRarityTextPresentation } from '../../rarity/utils/rarityColorPresentation';
import { GachaTabs, type GachaTabOption } from '../../gacha/components/GachaTabs';
import { useGachaDeletion } from '../../gacha/hooks/useGachaDeletion';

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

type RiaguEntriesByGacha = Record<string, RiaguDisplayEntry[]>;

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
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const confirmDeleteGacha = useGachaDeletion();

  const { entriesByGacha, riaguGachaIds, totalEntryCount } = useMemo(() => {
    const grouped: RiaguEntriesByGacha = {};
    const gachaIds = new Set<string>();
    let count = 0;

    const riaguCards = Object.values(data?.riaguState?.riaguCards ?? {});
    const catalogByGacha = data?.catalogState?.byGacha ?? {};
    const userInventoriesByItemId = data?.userInventories?.byItemId ?? {};
    const userProfiles = data?.userProfiles?.users ?? {};

    riaguCards.forEach((card) => {
      const gachaId = card.gachaId;
      gachaIds.add(gachaId);
      count += 1;

      const catalogItem = catalogByGacha[gachaId]?.items?.[card.itemId];
      const gachaName = data?.appState?.meta?.[card.gachaId]?.displayName ?? card.gachaId;
      const rarityEntity = catalogItem?.rarityId ? data?.rarityState?.entities?.[catalogItem.rarityId] : undefined;
      const itemName = catalogItem?.name ?? card.itemId;
      const rarityLabel = rarityEntity?.label ?? '未分類';
      const rarityColor = rarityEntity?.color ?? '#a855f7';

      const reverseEntries = userInventoriesByItemId[card.itemId] ?? [];
      const winners = reverseEntries
        .map((record) => ({
          name: userProfiles[record.userId]?.displayName ?? record.userId,
          count: record.count ?? 0
        }))
        .filter((winner) => winner.count > 0)
        .sort((a, b) => b.count - a.count);

      const entry: RiaguDisplayEntry = {
        id: card.id,
        itemName,
        gachaName,
        rarityLabel,
        rarityColor,
        costLabel: formatCost(card.unitCost),
        status: formatStatus(card.stock, card.notes),
        winners: winners.length > 0 ? winners : [{ name: '当選者なし', count: 0 }]
      };

      if (!grouped[gachaId]) {
        grouped[gachaId] = [];
      }
      grouped[gachaId].push(entry);
    });

    return {
      entriesByGacha: grouped,
      riaguGachaIds: Array.from(gachaIds),
      totalEntryCount: count
    };
  }, [data]);

  const gachaTabs = useMemo<GachaTabOption[]>(() => {
    const catalogByGacha = data?.catalogState?.byGacha ?? {};
    const baseOrder = data?.appState?.order ?? [];
    const orderedIds: string[] = [];
    const seen = new Set<string>();

    const addGachaId = (gachaId?: string) => {
      if (!gachaId || seen.has(gachaId)) {
        return;
      }
      seen.add(gachaId);
      orderedIds.push(gachaId);
    };

    baseOrder.forEach(addGachaId);
    Object.keys(catalogByGacha).forEach(addGachaId);
    riaguGachaIds.forEach(addGachaId);

    return orderedIds.map((gachaId) => ({
      id: gachaId,
      label: data?.appState?.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [data?.appState, data?.catalogState, riaguGachaIds]);

  useEffect(() => {
    if (!gachaTabs.length) {
      setActiveGachaId(null);
      return;
    }

    setActiveGachaId((current) => {
      if (current && gachaTabs.some((tab) => tab.id === current)) {
        return current;
      }

      const preferred = data?.appState?.selectedGachaId;
      if (preferred && gachaTabs.some((tab) => tab.id === preferred)) {
        return preferred;
      }

      return gachaTabs[0].id;
    });
  }, [data?.appState?.selectedGachaId, gachaTabs]);

  const gachaTabIds = useMemo(() => gachaTabs.map((tab) => tab.id), [gachaTabs]);
  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const activeEntries = activeGachaId ? entriesByGacha[activeGachaId] ?? [] : [];
  const hasAnyEntries = totalEntryCount > 0;
  const activeGachaLabel = useMemo(
    () => gachaTabs.find((tab) => tab.id === activeGachaId)?.label ?? activeGachaId ?? '',
    [gachaTabs, activeGachaId]
  );

  return (
    <SectionContainer
      id="riagu"
      title="リアグ設定"
      description="リアルグッズの在庫と当選者を同期します。"
      footer="RiaguStoreのマーク/解除とAppStateStore.saveDebounced()を連携予定です。"
      contentClassName="riagu-section__content"
    >
      <GachaTabs
        tabs={gachaTabs}
        activeId={activeGachaId}
        onSelect={(gachaId) => setActiveGachaId(gachaId)}
        onDelete={(tab) => confirmDeleteGacha(tab)}
        className="riagu-section__tabs"
      />

      <div className="riagu-section__scroll section-scroll flex-1">
        <div className="riagu-section__scroll-content space-y-4">
          <div className="tab-panel-viewport">
            <div key={activeGachaId ?? 'none'} className={panelAnimationClass}>
              {status !== 'ready' ? (
                <p className="text-sm text-muted-foreground">ローカルストレージからリアグ情報を読み込み中です…</p>
              ) : null}
              {status === 'ready' && !hasAnyEntries ? (
                <p className="text-sm text-muted-foreground">リアグ対象のアイテムがありません。仮データを投入してから再度ご確認ください。</p>
              ) : null}
              {status === 'ready' && hasAnyEntries && activeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {activeGachaLabel
                    ? `${activeGachaLabel} にリアグ対象のアイテムがありません。`
                    : '選択中のガチャにリアグ対象のアイテムがありません。'}
                </p>
              ) : null}

              {activeEntries.length > 0 ? (
                <div className="riagu-section__list space-y-3">
                  {activeEntries.map((entry) => {
                    const { className, style } = getRarityTextPresentation(entry.rarityColor);
                    return (
                      <article
                        key={entry.id}
                        className="riagu-card space-y-4 rounded-2xl border border-white/5 bg-surface/25 p-5"
                      >
                        <header className="riagu-card__header flex items-start justify-between gap-3">
                          <div className="riagu-card__meta space-y-1">
                            <span className={clsx('riagu-card__rarity badge', className)} style={style}>
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
                              className="riagu-card__winner flex items-center justify-between rounded-xl border border-border/60 bg-panel px-4 py-3 text-sm text-surface-foreground"
                            >
                              <span>{winner.name}</span>
                              <span className="riagu-card__winner-count chip">{winner.count > 0 ? `×${winner.count}` : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
