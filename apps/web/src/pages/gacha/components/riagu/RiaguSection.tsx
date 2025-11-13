import { clsx } from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { SectionContainer } from '../layout/SectionContainer';
import { useTabMotion } from '../../../../hooks/useTabMotion';
import { useGachaLocalStorage } from '../../../../features/storage/useGachaLocalStorage';
import { getRarityTextPresentation } from '../../../../features/rarity/utils/rarityColorPresentation';
import { GachaTabs, type GachaTabOption } from '../common/GachaTabs';
import { useGachaDeletion } from '../../../../features/gacha/hooks/useGachaDeletion';
import { ItemPreview } from '../../../../components/ItemPreviewThumbnail';
import { useModal, RiaguConfigDialog } from '../../../../modals';

interface RiaguDisplayEntry {
  id: string;
  gachaId: string;
  itemId: string;
  itemName: string;
  typeLabel?: string;
  rarityLabel: string;
  rarityColor: string;
  assetId: string | null;
  thumbnailAssetId: string | null;
  thumbnailUrl: string | null;
  unitCost?: number;
  requiredQuantity: number;
  totalCost?: number;
  winners: Array<{ id: string; name: string; count: number; discordAvatarUrl: string | null }>;
}

type RiaguEntriesByGacha = Record<string, RiaguDisplayEntry[]>;

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0
});

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatCurrency(value: number | undefined): string {
  if (value == null) {
    return '未設定';
  }
  return currencyFormatter.format(value);
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return numberFormatter.format(value);
}

export function RiaguSection(): JSX.Element {
  const { status, data } = useGachaLocalStorage();
  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const confirmDeleteGacha = useGachaDeletion();
  const { push } = useModal();

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
      const rarityEntity = catalogItem?.rarityId ? data?.rarityState?.entities?.[catalogItem.rarityId] : undefined;
      const itemName = catalogItem?.name ?? card.itemId;
      const rarityLabel = rarityEntity?.label ?? '未分類';
      const rarityColor = rarityEntity?.color ?? '#a855f7';
      const typeLabel = card.typeLabel ?? undefined;
      const assetId = catalogItem?.imageAssetId ?? null;
      const thumbnailAssetId = catalogItem?.thumbnailAssetId ?? null;

      const reverseEntries = userInventoriesByItemId[card.itemId] ?? [];
      const sanitizedUnitCost =
        typeof card.unitCost === 'number' && Number.isFinite(card.unitCost) ? card.unitCost : undefined;

      const requiredQuantity = reverseEntries.reduce((sum, record) => sum + Math.max(record.count ?? 0, 0), 0);

      const winners = reverseEntries
        .map((record) => {
          const profile = userProfiles[record.userId];
          const displayName = profile?.displayName?.trim() || record.userId;
          const avatarUrlRaw = profile?.discordAvatarUrl;
          const discordAvatarUrl =
            typeof avatarUrlRaw === 'string' && avatarUrlRaw.trim().length > 0
              ? avatarUrlRaw.trim()
              : null;

          return {
            id: record.userId,
            name: displayName,
            count: record.count ?? 0,
            discordAvatarUrl
          };
        })
        .filter((winner) => winner.count > 0)
        .sort((a, b) => b.count - a.count);

      const entry: RiaguDisplayEntry = {
        id: card.id,
        gachaId,
        itemId: card.itemId,
        itemName,
        typeLabel,
        rarityLabel,
        rarityColor,
        assetId,
        thumbnailAssetId,
        thumbnailUrl: null,
        unitCost: sanitizedUnitCost,
        requiredQuantity,
        totalCost: sanitizedUnitCost != null ? sanitizedUnitCost * requiredQuantity : undefined,
        winners:
          winners.length > 0
            ? winners
            : [{ id: 'none', name: '当選者なし', count: 0, discordAvatarUrl: null }]
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
      const meta = data?.appState?.meta?.[gachaId];
      if (meta?.isArchived) {
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
      contentClassName="riagu-section__content"
    >
      <GachaTabs
        tabs={gachaTabs}
        activeId={activeGachaId}
        onSelect={(gachaId) => setActiveGachaId(gachaId)}
        onDelete={(tab) => confirmDeleteGacha(tab)}
        className="riagu-section__tabs"
      />

      <div className="riagu-section__scroll section-scroll flex-1 px-4">
        <div className="riagu-section__scroll-content space-y-4">
          <div className="tab-panel-viewport">
            <div key={activeGachaId ?? 'none'} className={panelAnimationClass}>
              {status !== 'ready' ? (
                <p className="text-sm text-muted-foreground">ローカルストレージからリアグ情報を読み込み中です…</p>
              ) : null}
              {status === 'ready' && !hasAnyEntries ? (
                <p className="text-sm text-muted-foreground">リアグ対象のアイテムがありません。ガチャの設定と在庫を確認してください。</p>
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
                        className="riagu-card space-y-4 rounded-2xl border border-border/60 bg-[var(--color-item-card)] p-5 shadow-sm"
                      >
                        <header className="riagu-card__header flex items-start justify-between gap-3">
                          <div className="riagu-card__meta flex flex-1 flex-col gap-3">
                            <div className="riagu-card__meta-heading flex items-center gap-3">
                              <ItemPreview
                                assetId={entry.assetId}
                                previewAssetId={entry.thumbnailAssetId}
                                fallbackUrl={entry.thumbnailUrl}
                                alt={`${entry.itemName}のプレビュー`}
                                kindHint="image"
                                className="riagu-card__preview h-14 w-14 shrink-0 bg-surface-deep"
                                emptyLabel="noImage"
                              />
                              <div className="riagu-card__meta-text flex-1 space-y-2">
                                <span className={clsx('riagu-card__rarity badge', className)} style={style}>
                                  {entry.rarityLabel}
                                </span>
                                <h3 className="riagu-card__title text-base font-semibold text-surface-foreground">{entry.itemName}</h3>
                              </div>
                            </div>
                            <dl className="riagu-card__summary grid grid-cols-3 gap-2 text-[11px] leading-snug text-muted-foreground">
                              <div className="riagu-card__summary-item space-y-1">
                                <dt className="riagu-card__summary-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                  原価
                                </dt>
                                <dd className="riagu-card__summary-value text-sm font-medium text-surface-foreground">
                                  {formatCurrency(entry.unitCost)}
                                </dd>
                              </div>
                              <div className="riagu-card__summary-item space-y-1">
                                <dt className="riagu-card__summary-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                  必要個数
                                </dt>
                                <dd className="riagu-card__summary-value text-sm font-medium text-surface-foreground">
                                  {formatQuantity(entry.requiredQuantity)}
                                </dd>
                              </div>
                              <div className="riagu-card__summary-item space-y-1">
                                <dt className="riagu-card__summary-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                  合計金額
                                </dt>
                                <dd className="riagu-card__summary-value text-sm font-medium text-surface-foreground">
                                  {formatCurrency(entry.totalCost)}
                                </dd>
                              </div>
                            </dl>
                          </div>
                          <div className="riagu-card__aside flex flex-col items-end gap-2">
                            <div className="riagu-card__type chip text-xs text-muted-foreground">
                              {entry.typeLabel?.trim() ? entry.typeLabel : 'タイプ未設定'}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                push(RiaguConfigDialog, {
                                  gachaId: entry.gachaId,
                                  itemId: entry.itemId,
                                  itemName: entry.itemName,
                                  defaultPrice: entry.unitCost,
                                  defaultType: entry.typeLabel
                                })
                              }
                              className="riagu-card__action inline-flex items-center gap-2 rounded-xl border border-border/60 bg-panel px-3 py-1.5 text-xs font-medium text-surface-foreground transition hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                            >
                              リアグ設定
                            </button>
                          </div>
                        </header>
                        <div className="riagu-card__winners space-y-2">
                          {entry.winners.map((winner) => (
                            <div
                              key={`${entry.id}-${winner.id}`}
                              className="riagu-card__winner flex items-center justify-between rounded-xl border border-border/60 bg-panel-muted px-4 py-3 text-sm text-surface-foreground"
                            >
                              <span className="riagu-card__winner-name flex items-center gap-2">
                                {winner.discordAvatarUrl ? (
                                  <span className="riagu-card__winner-avatar inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-surface">
                                    <img
                                      src={winner.discordAvatarUrl}
                                      alt=""
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                  </span>
                                ) : null}
                                <span>{winner.name}</span>
                              </span>
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
