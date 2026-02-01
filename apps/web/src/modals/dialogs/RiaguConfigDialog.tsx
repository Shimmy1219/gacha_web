import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { buildGachaPools, buildItemInventoryCountMap, normalizePtSetting } from '../../logic/gacha';
import { DEFAULT_GACHA_OWNER_SHARE_RATE } from '@domain/stores/uiPreferencesStore';

export interface RiaguConfigDialogPayload {
  gachaId: string;
  itemId: string;
  itemName: string;
  defaultPrice?: number;
  defaultType?: string;
  onSave?: (data: { itemId: string; price: number | null; type: string }) => void;
}

const INPUT_CLASSNAME =
  'w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30';

export function RiaguConfigDialog({ payload, close }: ModalComponentProps<RiaguConfigDialogPayload>): JSX.Element {
  const {
    riagu: riaguStore,
    ptControls: ptControlsStore,
    catalog: catalogStore,
    rarities: rarityStore,
    userInventories: userInventoriesStore,
    uiPreferences: uiPreferencesStore
  } = useDomainStores();
  const ptSettingsState = useStoreValue(ptControlsStore);
  const catalogState = useStoreValue(catalogStore);
  const rarityState = useStoreValue(rarityStore);
  const userInventoriesState = useStoreValue(userInventoriesStore);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const [price, setPrice] = useState<string>(
    payload?.defaultPrice !== undefined && payload?.defaultPrice !== null ? String(payload.defaultPrice) : ''
  );
  const [type, setType] = useState<string>(payload?.defaultType ?? '');
  const gachaOwnerShareRate = useMemo(
    () => uiPreferencesStore.getGachaOwnerShareRatePreference() ?? DEFAULT_GACHA_OWNER_SHARE_RATE,
    [uiPreferencesState, uiPreferencesStore]
  );
  const perPullPrice = useMemo(() => {
    const gachaId = payload?.gachaId;
    if (!gachaId) {
      return null;
    }
    const setting = ptSettingsState?.byGachaId?.[gachaId];
    const { normalized } = normalizePtSetting(setting);
    return normalized.perPull?.unitPrice ?? null;
  }, [payload?.gachaId, ptSettingsState]);
  const itemMetrics = useMemo(() => {
    if (!payload?.itemId) {
      return { itemRate: null, remainingStock: null };
    }
    const inventoryCounts = buildItemInventoryCountMap(userInventoriesState?.byItemId);
    const { itemsById } = buildGachaPools({
      catalogState,
      rarityState,
      inventoryCountsByItemId: inventoryCounts,
      includeOutOfStockItems: true
    });
    const item = itemsById.get(payload.itemId);
    const itemRate = typeof item?.itemRate === 'number' && Number.isFinite(item.itemRate) ? item.itemRate : null;
    const remainingStock =
      typeof item?.remainingStock === 'number' && Number.isFinite(item.remainingStock) ? item.remainingStock : null;
    return { itemRate, remainingStock };
  }, [catalogState, payload?.itemId, rarityState, userInventoriesState?.byItemId]);
  const parsedPrice = useMemo(() => {
    const trimmed = price.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return numeric < 0 ? null : numeric;
  }, [price]);
  const profitEvaluation = useMemo(() => {
    const isOutOfStock = itemMetrics.remainingStock === 0;
    if (isOutOfStock) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: true };
    }

    if (parsedPrice == null || perPullPrice == null || perPullPrice <= 0) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    if (gachaOwnerShareRate <= 0) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const itemRate = itemMetrics.itemRate;
    if (itemRate == null) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const revenuePerDraw = perPullPrice * gachaOwnerShareRate;
    if (!Number.isFinite(revenuePerDraw) || revenuePerDraw <= 0) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const expectedCost = itemRate * parsedPrice;
    if (!Number.isFinite(expectedCost)) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const margin = (revenuePerDraw - expectedCost) / revenuePerDraw;
    if (!Number.isFinite(margin)) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const rawPercent = Math.round(margin * 1000) / 10;
    const percent = Object.is(rawPercent, -0) ? 0 : rawPercent;
    const status = percent < 0 ? 'loss' : percent > 0 ? 'profit' : 'even';
    return { status, percent, isOutOfStock: false };
  }, [gachaOwnerShareRate, itemMetrics, parsedPrice, perPullPrice]);
  const profitValueLabel =
    profitEvaluation.percent == null ? '算出不可' : `${profitEvaluation.percent.toFixed(1)}%`;
  const profitStatusLabel =
    profitEvaluation.status === 'profit'
      ? '黒字'
      : profitEvaluation.status === 'loss'
        ? '赤字'
        : profitEvaluation.status === 'even'
          ? '利益なし'
          : '算出不可';
  const profitToneClass =
    profitEvaluation.status === 'profit'
      ? 'text-emerald-400'
      : profitEvaluation.status === 'loss'
        ? 'text-rose-400'
        : 'text-muted-foreground';
  const perPullLabel = perPullPrice != null ? `${perPullPrice}pt` : '—';
  const shareRateLabel =
    gachaOwnerShareRate != null && Number.isFinite(gachaOwnerShareRate)
      ? `${(Math.round(gachaOwnerShareRate * 1000) / 10).toFixed(1).replace(/\.0$/, '')}%`
      : '—';
  const itemRateLabel = useMemo(() => {
    if (itemMetrics.itemRate == null || !Number.isFinite(itemMetrics.itemRate)) {
      return '—';
    }
    const decimal = Math.round(itemMetrics.itemRate * 1_000_000) / 1_000_000;
    const percent = Math.round(itemMetrics.itemRate * 10_000) / 100;
    const percentLabel = `${percent.toFixed(2).replace(/\.0+$/, '')}%`;
    return `${decimal} (${percentLabel})`;
  }, [itemMetrics.itemRate]);
  const orderPriceLabel = parsedPrice != null ? `${parsedPrice}円` : '—';

  useEffect(() => {
    const itemId = payload?.itemId;
    if (!itemId) {
      setPrice('');
      setType('');
      return;
    }

    const fallbackPrice = (() => {
      const value = payload?.defaultPrice;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    })();
    const fallbackType = payload?.defaultType ?? '';

    const unsubscribe = riaguStore.subscribe((state) => {
      const riaguId = state?.indexByItemId?.[itemId];
      const card = riaguId ? state?.riaguCards?.[riaguId] : undefined;
      const hasCard = Boolean(card);

      const resolvedPrice = hasCard
        ? card && typeof card.unitCost === 'number' && Number.isFinite(card.unitCost)
          ? card.unitCost
          : null
        : fallbackPrice;
      const resolvedType = hasCard ? card?.typeLabel ?? '' : fallbackType;

      const nextPriceValue =
        resolvedPrice !== undefined && resolvedPrice !== null ? String(resolvedPrice) : '';
      const nextTypeValue = resolvedType ?? '';

      setPrice((previous) => (previous === nextPriceValue ? previous : nextPriceValue));
      setType((previous) => (previous === nextTypeValue ? previous : nextTypeValue));
    });

    return () => {
      unsubscribe();
    };
  }, [payload?.itemId, payload?.defaultPrice, payload?.defaultType, riaguStore]);

  const handleSave = () => {
    if (!payload) {
      close();
      return;
    }

    const normalizedPrice = price.trim();
    const parsedNumber = normalizedPrice ? Number(normalizedPrice) : null;
    const parsedPrice = typeof parsedNumber === 'number' && Number.isFinite(parsedNumber) ? parsedNumber : null;
    const normalizedType = type.trim();

    riaguStore.upsertCard(
      {
        itemId: payload.itemId,
        gachaId: payload.gachaId,
        unitCost: parsedPrice,
        typeLabel: normalizedType || null
      },
      { persist: 'debounced' }
    );

    payload.onSave?.({
      itemId: payload.itemId,
      price: parsedPrice,
      type: normalizedType
    });
    close();
  };

  return (
    <>
      <ModalBody className="rounded-2xl bg-surface/20 p-0 md:pr-0">
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="shrink-0">対象アイテム:</span>
          <span className="min-w-0 flex-1 truncate font-medium text-surface-foreground">
            {payload?.itemName ?? '-'}
          </span>
        </p>
        <div className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-foreground">発注価格（円）</span>
            <input
              type="number"
              min={0}
              step={10}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={INPUT_CLASSNAME}
              placeholder="300"
            />
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-border/60 bg-panel/50 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">利益率</span>
            <span className={clsx('text-sm font-semibold', profitToneClass)}>{profitValueLabel}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={clsx('text-xs font-semibold', profitToneClass)}>{profitStatusLabel}</span>
            {profitEvaluation.isOutOfStock ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                在庫切れ
              </span>
            ) : null}
          </div>
          <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
            <div>1回の消費pt (C): {perPullLabel}</div>
            <div>取り分率 (R): {shareRateLabel}</div>
            <div>排出率 (P): {itemRateLabel}</div>
            <div>発注価格 (A): {orderPriceLabel}</div>
            <div>計算式: (C×R - P×A) / (C×R)</div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            これは黒字・赤字を確約するものではありません。黒字表示でも、税金や送料、手数料によっては赤字になる場合があります。
          </p>
        </div>
        <div className="mt-4 space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-foreground">リアルグッズタイプ</span>
            <input
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className={INPUT_CLASSNAME}
              placeholder="アクリルスタンド / 缶バッジ など"
            />
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          保存する
        </button>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
