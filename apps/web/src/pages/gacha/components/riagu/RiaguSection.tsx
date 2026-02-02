import { Disclosure } from '@headlessui/react';
import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SectionContainer } from '../layout/SectionContainer';
import { useTabMotion } from '../../../../hooks/useTabMotion';
import { useGachaLocalStorage } from '../../../../features/storage/useGachaLocalStorage';
import { RarityLabel } from '../../../../components/RarityLabel';
import { GachaTabs, type GachaTabOption } from '../common/GachaTabs';
import { useGachaDeletion } from '../../../../features/gacha/hooks/useGachaDeletion';
import { ItemPreview } from '../../../../components/ItemPreviewThumbnail';
import { useModal, RiaguConfigDialog } from '../../../../modals';
import { buildGachaPools, buildItemInventoryCountMap, normalizePtSetting } from '../../../../logic/gacha';
import {
  calculateExpectedCostPerDraw,
  calculateProfitAmount,
  calculateRevenuePerDraw,
  evaluateProfitMargin,
  type RiaguProfitStatus
} from '../../../../logic/riaguProfit';
import { useDomainStores } from '../../../../features/storage/AppPersistenceProvider';
import { DEFAULT_GACHA_OWNER_SHARE_RATE } from '@domain/stores/uiPreferencesStore';
import { useStoreValue } from '@domain/stores';
import type { PullHistoryEntryV1 } from '@domain/app-persistence';

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

interface RiaguSummaryMetrics {
  estimatedMarginPercent: number | null;
  estimatedRevenuePerDraw: number | null;
  estimatedExpectedCostPerDraw: number | null;
  estimatedProfitPerDraw: number | null;
  estimatedStatus: RiaguProfitStatus;
  actualMarginPercent: number | null;
  actualRevenueAmount: number | null;
  actualProfitAmount: number | null;
  actualStatus: RiaguProfitStatus;
  totalEarnedPt: number;
  totalOrderCost: number;
  missingCurrencyHistoryCount: number;
  missingUnitCostCount: number;
  outOfStockCount: number;
  missingRateCount: number;
}

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0
});

const numberFormatter = new Intl.NumberFormat('ja-JP');

const RIAGU_PANEL_CLOSE_DELAY_MS = 300;

function formatMarginPercent(value: number | null): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '算出不可';
  }
  return `${value.toFixed(1)}%`;
}

function formatCurrencyAmount(
  value: number | null | undefined,
  fallback = '算出不可',
  maximumFractionDigits = 0
): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits
  }).format(value);
}

function formatShareRate(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—';
  }
  return `${(Math.round(value * 1000) / 10).toFixed(1).replace(/\.0$/, '')}%`;
}

function formatPoints(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0pt';
  }
  return `${numberFormatter.format(value)}pt`;
}

function resolveProfitToneClass(status: RiaguProfitStatus): string {
  if (status === 'profit') {
    return 'text-emerald-400';
  }
  if (status === 'loss') {
    return 'text-rose-400';
  }
  return 'text-muted-foreground';
}

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
  const [isSummaryDetailsOpen, setIsSummaryDetailsOpen] = useState(false);
  const confirmDeleteGacha = useGachaDeletion();
  const { push } = useModal();
  const { uiPreferences } = useDomainStores();
  const uiPreferencesState = useStoreValue(uiPreferences);
  const getDefaultOpenState = useCallback(
    (cardId: string) => uiPreferences.getRiaguCardOpenState(cardId) ?? true,
    [uiPreferences, uiPreferencesState]
  );

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
      const assetEntries = Array.isArray(catalogItem?.assets) ? catalogItem.assets : [];
      const primaryAsset = assetEntries[0] ?? null;
      const assetId = primaryAsset?.assetId ?? null;
      const thumbnailAssetId = primaryAsset?.thumbnailAssetId ?? null;

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

  useEffect(() => {
    setIsSummaryDetailsOpen(false);
  }, [activeGachaId]);

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
  const gachaOwnerShareRate = useMemo(
    () => uiPreferences.getGachaOwnerShareRatePreference() ?? DEFAULT_GACHA_OWNER_SHARE_RATE,
    [uiPreferencesState, uiPreferences]
  );
  const perPullPrice = useMemo(() => {
    const gachaId = activeGachaId;
    if (!gachaId) {
      return null;
    }
    const setting = data?.ptSettings?.byGachaId?.[gachaId];
    const { normalized } = normalizePtSetting(setting);
    return normalized.perPull?.unitPrice ?? null;
  }, [activeGachaId, data?.ptSettings?.byGachaId]);
  const activeItemMetrics = useMemo(() => {
    const gachaId = activeGachaId;
    const itemMetrics = new Map<string, { itemRate: number | null; remainingStock: number | null }>();
    if (!gachaId) {
      return itemMetrics;
    }
    const inventoryCounts = buildItemInventoryCountMap(data?.userInventories?.byItemId);
    const { poolsByGachaId } = buildGachaPools({
      catalogState: data?.catalogState,
      rarityState: data?.rarityState,
      inventoryCountsByItemId: inventoryCounts,
      includeOutOfStockItems: true
    });
    const pool = poolsByGachaId.get(gachaId);
    pool?.items.forEach((item) => {
      itemMetrics.set(item.itemId, {
        itemRate: typeof item.itemRate === 'number' && Number.isFinite(item.itemRate) ? item.itemRate : null,
        remainingStock:
          typeof item.remainingStock === 'number' && Number.isFinite(item.remainingStock) ? item.remainingStock : null
      });
    });
    return itemMetrics;
  }, [activeGachaId, data?.catalogState, data?.rarityState, data?.userInventories?.byItemId]);
  const activePullHistoryEntries = useMemo(() => {
    const gachaId = activeGachaId;
    if (!gachaId) {
      return [] as PullHistoryEntryV1[];
    }
    return Object.values(data?.pullHistory?.pulls ?? {}).filter((entry): entry is PullHistoryEntryV1 => {
      return Boolean(entry?.gachaId && entry.gachaId === gachaId);
    });
  }, [activeGachaId, data?.pullHistory?.pulls]);
  const summaryMetrics = useMemo<RiaguSummaryMetrics>(() => {
    let totalOrderCost = 0;
    let missingUnitCostCount = 0;
    let outOfStockCount = 0;
    let missingRateCount = 0;
    let estimatedExpectedCostPerDrawRaw = 0;
    let estimatedTermCount = 0;

    activeEntries.forEach((entry) => {
      const hasUnitCost = typeof entry.unitCost === 'number' && Number.isFinite(entry.unitCost);
      if (hasUnitCost) {
        const unitCost = entry.unitCost as number;
        const quantity = Number.isFinite(entry.requiredQuantity) ? Math.max(entry.requiredQuantity, 0) : 0;
        totalOrderCost += unitCost * quantity;
      } else {
        missingUnitCostCount += 1;
      }

      const itemMetrics = activeItemMetrics.get(entry.itemId);
      if (itemMetrics?.remainingStock === 0) {
        outOfStockCount += 1;
        return;
      }
      if (!hasUnitCost) {
        return;
      }
      if (itemMetrics?.itemRate == null) {
        missingRateCount += 1;
        return;
      }

      const expectedCostTerm = calculateExpectedCostPerDraw({
        itemRate: itemMetrics.itemRate,
        unitCost: entry.unitCost,
        isOutOfStock: itemMetrics.remainingStock === 0
      });
      if (expectedCostTerm == null) {
        return;
      }
      estimatedExpectedCostPerDrawRaw += expectedCostTerm;
      estimatedTermCount += 1;
    });

    const estimatedRevenuePerDraw = calculateRevenuePerDraw(perPullPrice, gachaOwnerShareRate);
    const estimatedExpectedCostPerDraw = estimatedTermCount > 0 ? estimatedExpectedCostPerDrawRaw : null;
    const estimatedProfitPerDraw = calculateProfitAmount(estimatedRevenuePerDraw, estimatedExpectedCostPerDraw);
    const estimatedEvaluation = evaluateProfitMargin({
      revenueAmount: estimatedRevenuePerDraw,
      costAmount: estimatedExpectedCostPerDraw
    });

    let totalEarnedPt = 0;
    let missingCurrencyHistoryCount = 0;
    activePullHistoryEntries.forEach((entry) => {
      const currencyUsed = entry.currencyUsed;
      if (typeof currencyUsed === 'number' && Number.isFinite(currencyUsed) && currencyUsed >= 0) {
        totalEarnedPt += currencyUsed;
      } else {
        missingCurrencyHistoryCount += 1;
      }
    });

    const actualRevenueAmount = calculateRevenuePerDraw(totalEarnedPt, gachaOwnerShareRate);
    const actualProfitAmount = calculateProfitAmount(actualRevenueAmount, totalOrderCost);
    const actualEvaluation = evaluateProfitMargin({
      revenueAmount: actualRevenueAmount,
      costAmount: totalOrderCost
    });

    return {
      estimatedMarginPercent: estimatedEvaluation.percent,
      estimatedRevenuePerDraw,
      estimatedExpectedCostPerDraw,
      estimatedProfitPerDraw,
      estimatedStatus: estimatedEvaluation.status,
      actualMarginPercent: actualEvaluation.percent,
      actualRevenueAmount,
      actualProfitAmount,
      actualStatus: actualEvaluation.status,
      totalEarnedPt,
      totalOrderCost,
      missingCurrencyHistoryCount,
      missingUnitCostCount,
      outOfStockCount,
      missingRateCount
    };
  }, [activeEntries, activeItemMetrics, activePullHistoryEntries, gachaOwnerShareRate, perPullPrice]);
  const summaryDetailsId = activeGachaId ? `riagu-summary-card-details-${activeGachaId}` : 'riagu-summary-card-details';

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

      <div className="riagu-section__scroll section-scroll flex-1">
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
                  <article className="riagu-summary-card riagu-card rounded-2xl border border-border/60 bg-[var(--color-item-card)] p-3 shadow-sm">
                    <header className="riagu-summary-card__header flex flex-wrap items-start justify-between gap-2">
                      <div className="riagu-summary-card__heading flex min-w-0 flex-col gap-1">
                        <h3 className="riagu-summary-card__title text-sm font-semibold text-surface-foreground">
                          リアグ収支サマリー
                        </h3>
                      </div>
                      <button
                        type="button"
                        className="riagu-summary-card__toggle text-xs font-semibold text-accent transition hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                        onClick={() => setIsSummaryDetailsOpen((current) => !current)}
                        aria-controls={summaryDetailsId}
                        aria-expanded={isSummaryDetailsOpen}
                      >
                        {isSummaryDetailsOpen ? '詳細を閉じる' : '詳細を表示'}
                      </button>
                    </header>
                    <dl className="riagu-summary-card__metrics mt-2 grid grid-cols-2 gap-2 text-[11px] leading-snug text-muted-foreground">
                      <div className="riagu-summary-card__metric space-y-1 rounded-xl border border-border/40 bg-panel/40 p-2">
                        <dt className="riagu-summary-card__metric-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          推定利益率
                        </dt>
                        <dd
                          className={clsx(
                            'riagu-summary-card__metric-value text-sm font-semibold',
                            resolveProfitToneClass(summaryMetrics.estimatedStatus)
                          )}
                        >
                          {formatMarginPercent(summaryMetrics.estimatedMarginPercent)}
                        </dd>
                      </div>
                      <div className="riagu-summary-card__metric space-y-1 rounded-xl border border-border/40 bg-panel/40 p-2">
                        <dt className="riagu-summary-card__metric-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          実質利益率
                        </dt>
                        <dd
                          className={clsx(
                            'riagu-summary-card__metric-value text-sm font-semibold',
                            resolveProfitToneClass(summaryMetrics.actualStatus)
                          )}
                        >
                          {formatMarginPercent(summaryMetrics.actualMarginPercent)}
                        </dd>
                      </div>
                      <div className="riagu-summary-card__metric space-y-1 rounded-xl border border-border/40 bg-panel/40 p-2">
                        <dt className="riagu-summary-card__metric-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          トータル獲得pt
                        </dt>
                        <dd className="riagu-summary-card__metric-value text-sm font-semibold text-surface-foreground">
                          {formatPoints(summaryMetrics.totalEarnedPt)}
                        </dd>
                      </div>
                      <div className="riagu-summary-card__metric space-y-1 rounded-xl border border-border/40 bg-panel/40 p-2">
                        <dt className="riagu-summary-card__metric-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          全リアグ発注合計金額
                        </dt>
                        <dd className="riagu-summary-card__metric-value text-sm font-semibold text-surface-foreground">
                          {formatCurrencyAmount(summaryMetrics.totalOrderCost, '—')}
                        </dd>
                      </div>
                    </dl>
                    <div
                      id={summaryDetailsId}
                      data-state={isSummaryDetailsOpen ? 'open' : 'closed'}
                      className={clsx(
                        'riagu-summary-card__details-wrapper mt-3 grid overflow-hidden transition-[grid-template-rows] duration-300 ease-linear',
                        'data-[state=open]:grid-rows-[1fr]',
                        'data-[state=closed]:grid-rows-[0fr]'
                      )}
                    >
                      <div className="riagu-summary-card__details min-h-0 space-y-2 overflow-hidden rounded-xl border border-border/40 bg-panel/40 p-2 text-[11px] text-muted-foreground">
                        <div className="riagu-summary-card__detail-group grid gap-1">
                          <div className="riagu-summary-card__detail-item">
                            1回あたり還元額: {formatCurrencyAmount(summaryMetrics.estimatedRevenuePerDraw, '算出不可', 12)}
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            1回あたり期待原価(リアグ合算): {formatCurrencyAmount(summaryMetrics.estimatedExpectedCostPerDraw, '算出不可', 12)}
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            1回あたり推定利益: {formatCurrencyAmount(summaryMetrics.estimatedProfitPerDraw, '算出不可', 12)}
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            実質売上(還元後): {formatCurrencyAmount(summaryMetrics.actualRevenueAmount, '算出不可', 12)}
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            実質利益: {formatCurrencyAmount(summaryMetrics.actualProfitAmount, '算出不可', 12)}
                          </div>
                        </div>
                        <div className="riagu-summary-card__separator h-px bg-border/60" />
                        <div className="riagu-summary-card__detail-group grid gap-1">
                          <div className="riagu-summary-card__detail-item">配信アプリからの還元率: {formatShareRate(gachaOwnerShareRate)}</div>
                          <div className="riagu-summary-card__detail-item">
                            pt未記録履歴: {formatQuantity(summaryMetrics.missingCurrencyHistoryCount)}件
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            単価未設定アイテム: {formatQuantity(summaryMetrics.missingUnitCostCount)}件
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            在庫切れアイテム: {formatQuantity(summaryMetrics.outOfStockCount)}件
                          </div>
                          <div className="riagu-summary-card__detail-item">
                            排出率不明アイテム: {formatQuantity(summaryMetrics.missingRateCount)}件
                          </div>
                        </div>
                        <div className="riagu-summary-card__separator h-px bg-border/60" />
                        <div className="riagu-summary-card__notes space-y-1">
                          <p className="riagu-summary-card__note">※推定利益率は現在の排出率・単価設定に基づく期待値です。</p>
                          <p className="riagu-summary-card__note">※実質利益率は履歴の獲得ptを還元率で円換算して算出しています。</p>
                          <p className="riagu-summary-card__note">※税金・送料・手数料・外部コストは含みません。</p>
                        </div>
                      </div>
                    </div>
                  </article>
                  {activeEntries.map((entry) => {
                    const panelId = `riagu-card-panel-${entry.id}`;
                    return (
                      <Disclosure key={entry.id} defaultOpen={getDefaultOpenState(entry.id)}>
                        {({ open }) => {
                          const handleToggle = () => {
                            uiPreferences.setRiaguCardOpenState(entry.id, !open, { persist: 'debounced' });
                          };

                          return (
                            <article
                              className={clsx(
                                'riagu-card rounded-2xl border border-border/60 bg-[var(--color-item-card)] p-3 shadow-sm',
                                open ? 'space-y-4' : 'space-y-0'
                              )}
                            >
                              <header className="riagu-card__header flex flex-col gap-3">
                                <div className="riagu-card__meta flex min-w-0 flex-1 flex-col gap-3 text-left">
                                  <div className="riagu-card__meta-heading flex min-w-0 items-start gap-3">
                                    <Disclosure.Button
                                      type="button"
                                      className="riagu-card__meta-trigger flex shrink-0 items-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                                      aria-label="リアグ当選者の表示を切り替える"
                                      onClick={handleToggle}
                                    >
                                      <ItemPreview
                                        assetId={entry.assetId}
                                        previewAssetId={entry.thumbnailAssetId}
                                        fallbackUrl={entry.thumbnailUrl}
                                        alt={`${entry.itemName}のプレビュー`}
                                        kindHint="image"
                                        className="riagu-card__preview h-14 w-14 shrink-0 bg-surface-deep"
                                        emptyLabel="noImage"
                                      />
                                    </Disclosure.Button>
                                    <div className="riagu-card__meta-text min-w-0 flex-1">
                                      <div className="riagu-card__meta-row flex min-w-0 items-start gap-3">
                                        <Disclosure.Button
                                          type="button"
                                          className="riagu-card__meta-trigger flex min-w-0 flex-1 items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                                          aria-label="リアグ当選者の表示を切り替える"
                                          onClick={handleToggle}
                                        >
                                          <div className="riagu-card__meta-tags flex flex-col items-start gap-1">
                                            <div className="riagu-card__type chip h-5 px-2 py-0 text-[11px] text-muted-foreground">
                                              {entry.typeLabel?.trim() ? entry.typeLabel : 'タイプ未設定'}
                                            </div>
                                            <span className="riagu-card__rarity inline-flex h-5 min-w-[3rem] items-center text-[11px] font-medium text-surface-foreground">
                                              <RarityLabel label={entry.rarityLabel} color={entry.rarityColor} />
                                            </span>
                                          </div>
                                        </Disclosure.Button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            push(RiaguConfigDialog, {
                                              id: `${entry.itemId}-riagu`,
                                              title: 'リアルグッズ設定',
                                              size: 'sm',
                                              payload: {
                                                gachaId: entry.gachaId,
                                                itemId: entry.itemId,
                                                itemName: entry.itemName,
                                                defaultPrice: entry.unitCost,
                                                defaultType: entry.typeLabel
                                              }
                                            })
                                          }
                                          className="riagu-card__action inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent/60 bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                                        >
                                          リアグ設定
                                        </button>
                                      </div>
                                      <Disclosure.Button
                                        type="button"
                                        className="riagu-card__title-trigger w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                                        aria-label="リアグ当選者の表示を切り替える"
                                        onClick={handleToggle}
                                      >
                                        <h3 className="riagu-card__title flex min-w-0 items-center justify-between gap-2 overflow-hidden text-sm font-semibold text-surface-foreground">
                                          <span className="min-w-0 max-w-full truncate">{entry.itemName}</span>
                                        </h3>
                                      </Disclosure.Button>
                                    </div>
                                  </div>
                                  <Disclosure.Button
                                    type="button"
                                    className="riagu-card__summary-trigger text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                                    aria-label="リアグ当選者の表示を切り替える"
                                    onClick={handleToggle}
                                  >
                                    <dl className="riagu-card__summary grid grid-cols-3 gap-2 text-[11px] leading-snug text-muted-foreground">
                                      <div className="riagu-card__summary-item space-y-1">
                                        <dt className="riagu-card__summary-label text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                        発注価格
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
                                  </Disclosure.Button>
                                </div>
                              </header>
                              <div
                                data-state={open ? 'open' : 'closed'}
                                className={clsx(
                                  'riagu-card__collapsible group grid overflow-hidden transition-[grid-template-rows] duration-300 ease-linear',
                                  'data-[state=open]:grid-rows-[1fr]',
                                  'data-[state=closed]:grid-rows-[0fr]'
                                )}
                              >
                                <RiaguCardWinners open={open} panelId={panelId} winners={entry.winners} />
                              </div>
                            </article>
                          );
                        }}
                      </Disclosure>
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

interface RiaguCardWinnersProps {
  open: boolean;
  panelId: string;
  winners: RiaguDisplayEntry['winners'];
}

function RiaguCardWinners({ open, panelId, winners }: RiaguCardWinnersProps): JSX.Element | null {
  const [shouldRender, setShouldRender] = useState(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
    }, RIAGU_PANEL_CLOSE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Disclosure.Panel
      static
      id={panelId}
      className={clsx(
        'overflow-hidden transition-opacity duration-300 ease-linear',
        'group-data-[state=open]:opacity-100',
        'group-data-[state=closed]:opacity-0'
      )}
    >
      <div className="riagu-card__winners space-y-2">
        {winners.map((winner) => (
          <div
            key={`${panelId}-${winner.id}`}
            className="riagu-card__winner flex items-center justify-between rounded-xl border border-border/60 bg-panel-muted px-4 py-3 text-sm text-surface-foreground"
          >
            <span className="riagu-card__winner-name flex items-center gap-2">
              {winner.discordAvatarUrl ? (
                <span className="riagu-card__winner-avatar inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-surface">
                  <img src={winner.discordAvatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                </span>
              ) : null}
              <span className="riagu-card__winner-label">{winner.name}</span>
            </span>
            <span className="riagu-card__winner-count chip">{winner.count > 0 ? `×${winner.count}` : '—'}</span>
          </div>
        ))}
      </div>
    </Disclosure.Panel>
  );
}
