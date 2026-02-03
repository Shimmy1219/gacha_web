import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { buildGachaPools, buildItemInventoryCountMap, normalizePtSetting } from '../../logic/gacha';
import {
  calculateExpectedCostPerDraw,
  calculateProfitAmount,
  calculateRevenuePerDraw
} from '../../logic/riaguProfit';
import { DEFAULT_GACHA_OWNER_SHARE_RATE } from '@domain/stores/uiPreferencesStore';
import { formatRarityRate } from '../../features/rarity/utils/rarityRate';
import { REAL_GOODS_TYPE_SUGGESTIONS } from './riaguTypeSuggestions';

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
const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });
const KANJI_REPLACEMENTS: Array<[string, string]> = [
  ['下敷き', 'したじき'],
  ['巾着', 'きんちゃく'],
  ['帽子', 'ぼうし'],
  ['靴下', 'くつした'],
  ['抱き枕', 'だきまくら'],
  ['箸', 'はし'],
  ['食器', 'しょっき'],
  ['色紙', 'しきし'],
  ['缶', 'かん']
];

const normalizeSuggestionText = (value: string) => {
  const lowered = value.trim().toLowerCase();
  const replaced = KANJI_REPLACEMENTS.reduce((accumulator, [target, replacement]) => {
    if (!accumulator.includes(target)) {
      return accumulator;
    }
    return accumulator.replaceAll(target, replacement);
  }, lowered);
  const kanaConverted = replaced.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
  return kanaConverted.replace(/[\s/／・]/g, '').replace(/[-‐‑–—]/g, '');
};

function formatDecimal(value: number, maximumFractionDigits: number): string {
  const formatted = new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
  return formatted.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

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
  const riaguState = useStoreValue(riaguStore);
  const userInventoriesState = useStoreValue(userInventoriesStore);
  const uiPreferencesState = useStoreValue(uiPreferencesStore);
  const [price, setPrice] = useState<string>(
    payload?.defaultPrice !== undefined && payload?.defaultPrice !== null ? String(payload.defaultPrice) : ''
  );
  const [type, setType] = useState<string>(payload?.defaultType ?? '');
  const [showCostDetails, setShowCostDetails] = useState(false);
  const normalizedTypeInput = useMemo(() => normalizeSuggestionText(type), [type]);
  const typeSuggestions = useMemo(() => {
    if (!normalizedTypeInput) {
      return REAL_GOODS_TYPE_SUGGESTIONS;
    }
    return REAL_GOODS_TYPE_SUGGESTIONS.filter((suggestion) => {
      const keys = [suggestion.label, ...(suggestion.aliases ?? [])];
      return keys.some((key) => normalizeSuggestionText(key).includes(normalizedTypeInput));
    });
  }, [normalizedTypeInput]);
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
  const isOutOfStock = itemMetrics.remainingStock === 0;
  const revenuePerDraw = useMemo(
    () => calculateRevenuePerDraw(perPullPrice, gachaOwnerShareRate),
    [gachaOwnerShareRate, perPullPrice]
  );
  const expectedCostPerDraw = useMemo(() => {
    return calculateExpectedCostPerDraw({
      itemRate: itemMetrics.itemRate,
      unitCost: parsedPrice,
      isOutOfStock
    });
  }, [isOutOfStock, itemMetrics.itemRate, parsedPrice]);
  const riaguRateSummary = useMemo(() => {
    const gachaId = payload?.gachaId;
    const itemId = payload?.itemId;
    if (!gachaId || !itemId) {
      return { selectedItemRate: null, totalRiaguRate: null };
    }
    const inventoryCounts = buildItemInventoryCountMap(userInventoriesState?.byItemId);
    const { itemsById } = buildGachaPools({
      catalogState,
      rarityState,
      inventoryCountsByItemId: inventoryCounts,
      includeOutOfStockItems: true
    });
    const selectedItem = itemsById.get(itemId);
    const selectedItemRate =
      typeof selectedItem?.itemRate === 'number' && Number.isFinite(selectedItem.itemRate) ? selectedItem.itemRate : null;
    const cards = Object.values(riaguState?.riaguCards ?? {});
    let totalRiaguRate = 0;
    cards.forEach((card) => {
      if (card?.gachaId !== gachaId) {
        return;
      }
      const item = itemsById.get(card.itemId);
      if (!item || typeof item.itemRate !== 'number' || !Number.isFinite(item.itemRate) || item.itemRate <= 0) {
        return;
      }
      totalRiaguRate += item.itemRate;
    });
    return {
      selectedItemRate,
      totalRiaguRate: totalRiaguRate > 0 ? totalRiaguRate : null
    };
  }, [catalogState, payload?.gachaId, payload?.itemId, rarityState, riaguState?.riaguCards, userInventoriesState?.byItemId]);
  const perPullLabel = perPullPrice != null ? `${ONE_DECIMAL_FORMATTER.format(perPullPrice)}pt` : '—';
  const shareRateLabel =
    gachaOwnerShareRate != null && Number.isFinite(gachaOwnerShareRate)
      ? `${(Math.round(gachaOwnerShareRate * 1000) / 10).toFixed(1).replace(/\.0$/, '')}%`
      : '—';
  const itemRateLabel = useMemo(() => {
    if (itemMetrics.itemRate == null || !Number.isFinite(itemMetrics.itemRate)) {
      return '—';
    }
    const formattedRate = formatRarityRate(itemMetrics.itemRate);
    return formattedRate ? `${formattedRate}%` : '—';
  }, [itemMetrics.itemRate]);
  const orderPriceLabel = parsedPrice != null ? `${formatDecimal(parsedPrice, 12)}円` : '—';
  const revenuePerDrawLabel = revenuePerDraw != null ? `${formatDecimal(revenuePerDraw, 12)}円` : '—';
  const expectedCostPerDrawLabel =
    expectedCostPerDraw != null ? `${formatDecimal(expectedCostPerDraw, 12)}円` : '—';
  const profitPerDraw = useMemo(
    () => calculateProfitAmount(revenuePerDraw, expectedCostPerDraw),
    [expectedCostPerDraw, revenuePerDraw]
  );
  const profitPerDrawLabel =
    profitPerDraw != null ? `${formatDecimal(profitPerDraw, 12)}円` : '算出不可';
  const breakEvenUnitCost = useMemo(() => {
    if (isOutOfStock || revenuePerDraw == null || riaguRateSummary.totalRiaguRate == null || riaguRateSummary.totalRiaguRate <= 0) {
      return null;
    }
    const value = revenuePerDraw / riaguRateSummary.totalRiaguRate;
    return Number.isFinite(value) ? value : null;
  }, [isOutOfStock, revenuePerDraw, riaguRateSummary.totalRiaguRate]);
  const breakEvenUnitCostLabel = breakEvenUnitCost != null ? `${formatDecimal(breakEvenUnitCost, 12)}円` : '算出不可';
  const breakEvenStatus = useMemo(() => {
    if (parsedPrice == null || breakEvenUnitCost == null) {
      return { label: '算出不可', toneClass: 'text-muted-foreground' };
    }
    if (parsedPrice < breakEvenUnitCost) {
      return { label: '適正価格', toneClass: 'text-emerald-400' };
    }
    return { label: '赤字', toneClass: 'text-rose-400' };
  }, [breakEvenUnitCost, parsedPrice]);
  const unitCostHeadroom = useMemo(() => {
    if (breakEvenUnitCost == null || parsedPrice == null) {
      return null;
    }
    const value = breakEvenUnitCost - parsedPrice;
    return Number.isFinite(value) ? value : null;
  }, [breakEvenUnitCost, parsedPrice]);
  const unitCostHeadroomLabel = unitCostHeadroom != null ? `${formatDecimal(unitCostHeadroom, 12)}円` : '算出不可';
  const unitCostHeadroomToneClass =
    unitCostHeadroom == null ? 'text-muted-foreground' : unitCostHeadroom >= 0 ? 'text-emerald-400' : 'text-rose-400';

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
            <span className="text-xs font-semibold text-muted-foreground">適正価格判定</span>
            <span className={clsx('text-sm font-semibold', breakEvenStatus.toneClass)}>{breakEvenStatus.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">適正価格未満: 適正価格 / 適正価格以上: 赤字</span>
            {isOutOfStock ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                在庫切れ
              </span>
            ) : null}
          </div>
          {!showCostDetails ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-accent transition hover:text-accent/80"
              onClick={() => setShowCostDetails(true)}
            >
              詳細を表示
            </button>
          ) : (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-accent transition hover:text-accent/80"
              onClick={() => setShowCostDetails(false)}
            >
              詳細を閉じる
            </button>
          )}
          {showCostDetails ? (
            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              <div>1回の消費pt: {perPullLabel}</div>
              <div>配信アプリからの還元率: {shareRateLabel}</div>
              <div className="my-1 h-px bg-border/60" />
              <div>ガチャ1回当たりの還元額: {revenuePerDrawLabel}</div>
              <div>排出率: {itemRateLabel}</div>
              <div>発注価格: {orderPriceLabel}</div>
              <div className="my-1 h-px bg-border/60" />
              <div>ガチャ1回当たりの期待原価: {expectedCostPerDrawLabel}</div>
              <div>
                リアグ全体排出率に対する対象アイテム排出率: {riaguRateSummary.selectedItemRate != null && riaguRateSummary.totalRiaguRate != null
                  ? `${formatDecimal((riaguRateSummary.selectedItemRate / riaguRateSummary.totalRiaguRate) * 100, 10)}%`
                  : '算出不可'}
              </div>
              <div className="my-1 h-px bg-border/60" />
              <div>損益分岐単価（リアグ全体排出率で配分）: {breakEvenUnitCostLabel}</div>
              <div className={clsx(unitCostHeadroomToneClass)}>単価余力（損益分岐単価 - 発注価格）: {unitCostHeadroomLabel}</div>
              <div className="my-1 h-px bg-border/60" />
              <div>参考: ガチャ1回当たりの推定利益: {profitPerDrawLabel}</div>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">
            ※これは収支を確約するものではありません。税金や送料、手数料などの追加コストは反映していません。
          </p>
          <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            <p>※「期待原価」「原価寄与率」「損益分岐単価」は当該アイテム分のみです。</p>
            <p>※お得バンドル/コンプガチャ/天井保証による実質単価・期待原価は反映していません。</p>
          </div>
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
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">候補</p>
            <div className="flex max-h-[64px] min-h-[64px] flex-wrap content-start gap-2 overflow-hidden">
              {typeSuggestions.length > 0 ? (
                typeSuggestions.map((suggestion) => {
                  const normalizedKeys = [suggestion.label, ...(suggestion.aliases ?? [])].map(normalizeSuggestionText);
                  const isSelected = normalizedKeys.includes(normalizedTypeInput);
                  return (
                    <button
                      key={suggestion.label}
                      type="button"
                      onClick={() => setType(suggestion.label)}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border/60 text-muted-foreground hover:border-accent hover:text-accent'
                      }`}
                    >
                      {suggestion.label}
                    </button>
                  );
                })
              ) : normalizedTypeInput ? (
                <p className="text-xs text-muted-foreground">一致する候補はありません。</p>
              ) : null}
            </div>
          </div>
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
