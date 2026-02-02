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
const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });
const TWO_DECIMAL_FORMATTER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
const REAL_GOODS_TYPE_SUGGESTIONS = [
  {
    label: '缶バッチ',
    searchKeys: ['缶バッチ', '缶バッジ', 'かんばっち', 'かんばっじ']
  },
  {
    label: 'アクリルキーホルダー',
    searchKeys: ['アクリルキーホルダー', 'アクキー', 'あくりるきーほるだー', 'あくきー']
  },
  {
    label: 'アクリルパネル',
    searchKeys: ['アクリルパネル', 'あくりるぱねる']
  }
];

const normalizeSuggestionText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

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
  const [showProfitDetails, setShowProfitDetails] = useState(false);
  const normalizedTypeInput = useMemo(() => normalizeSuggestionText(type), [type]);
  const typeSuggestions = useMemo(() => {
    if (!normalizedTypeInput) {
      return REAL_GOODS_TYPE_SUGGESTIONS;
    }
    return REAL_GOODS_TYPE_SUGGESTIONS.filter((suggestion) =>
      suggestion.searchKeys.some((key) => normalizeSuggestionText(key).includes(normalizedTypeInput))
    );
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
  const revenuePerDraw = useMemo(() => {
    if (perPullPrice == null || perPullPrice <= 0 || gachaOwnerShareRate <= 0) {
      return null;
    }
    const value = perPullPrice * gachaOwnerShareRate;
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [gachaOwnerShareRate, perPullPrice]);
  const expectedCostPerDraw = useMemo(() => {
    if (isOutOfStock) {
      return null;
    }
    if (parsedPrice == null || itemMetrics.itemRate == null) {
      return null;
    }
    const value = itemMetrics.itemRate * parsedPrice;
    return Number.isFinite(value) ? value : null;
  }, [isOutOfStock, itemMetrics.itemRate, parsedPrice]);
  const profitEvaluation = useMemo(() => {
    if (isOutOfStock) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: true };
    }

    if (revenuePerDraw == null || expectedCostPerDraw == null) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const margin = (revenuePerDraw - expectedCostPerDraw) / revenuePerDraw;
    if (!Number.isFinite(margin)) {
      return { status: 'unavailable' as const, percent: null, isOutOfStock: false };
    }

    const rawPercent = Math.round(margin * 1000) / 10;
    const percent = Object.is(rawPercent, -0) ? 0 : rawPercent;
    const status = percent < 0 ? 'loss' : percent > 0 ? 'profit' : 'even';
    return { status, percent, isOutOfStock: false };
  }, [expectedCostPerDraw, isOutOfStock, revenuePerDraw]);
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
  const perPullLabel = perPullPrice != null ? `${ONE_DECIMAL_FORMATTER.format(perPullPrice)}pt` : '—';
  const shareRateLabel =
    gachaOwnerShareRate != null && Number.isFinite(gachaOwnerShareRate)
      ? `${(Math.round(gachaOwnerShareRate * 1000) / 10).toFixed(1).replace(/\.0$/, '')}%`
      : '—';
  const itemRateLabel = useMemo(() => {
    if (itemMetrics.itemRate == null || !Number.isFinite(itemMetrics.itemRate)) {
      return '—';
    }
    const percent = itemMetrics.itemRate * 100;
    return `${TWO_DECIMAL_FORMATTER.format(percent)}%`;
  }, [itemMetrics.itemRate]);
  const orderPriceLabel = parsedPrice != null ? `${ONE_DECIMAL_FORMATTER.format(parsedPrice)}円` : '—';
  const revenuePerDrawLabel = revenuePerDraw != null ? `${ONE_DECIMAL_FORMATTER.format(revenuePerDraw)}円` : '—';
  const expectedCostPerDrawLabel =
    expectedCostPerDraw != null ? `${ONE_DECIMAL_FORMATTER.format(expectedCostPerDraw)}円` : '—';
  const profitPerDrawLabel =
    revenuePerDraw != null && expectedCostPerDraw != null
      ? `${ONE_DECIMAL_FORMATTER.format(revenuePerDraw - expectedCostPerDraw)}円`
      : '算出不可';

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
          {!showProfitDetails ? (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-accent transition hover:text-accent/80"
              onClick={() => setShowProfitDetails(true)}
            >
              詳細を表示
            </button>
          ) : (
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-accent transition hover:text-accent/80"
              onClick={() => setShowProfitDetails(false)}
            >
              詳細を閉じる
            </button>
          )}
          {showProfitDetails ? (
            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              <div>1回の消費pt: {perPullLabel}</div>
              <div>配信アプリからの還元率: {shareRateLabel}</div>
              <div className="my-1 h-px bg-border/60" />
              <div>ガチャ1回当たりの還元額: {revenuePerDrawLabel}</div>
              <div>排出率: {itemRateLabel}</div>
              <div>発注価格: {orderPriceLabel}</div>
              <div className="my-1 h-px bg-border/60" />
              <div>ガチャ1回当たりの期待原価: {expectedCostPerDrawLabel}</div>
              <div>以上よりガチャ1回当たりの利益: {profitPerDrawLabel}</div>
              <div className="my-1 h-px bg-border/60" />
              <div>利益率: ガチャ1回当たりの利益 / ガチャ1回当たりの還元額: {profitValueLabel}</div>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">
            ※これは黒字・赤字を確約するものではありません。黒字表示でも、税金や送料、手数料によっては赤字になる場合があります。
          </p>
          <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            <p>※「期待原価」「利益」「利益率」は当該アイテム分のみです。ガチャ全体の利益率ではありません。</p>
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
          {typeSuggestions.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">候補</p>
              <div className="flex flex-wrap gap-2">
                {typeSuggestions.map((suggestion) => {
                  const isSelected = normalizedTypeInput === normalizeSuggestionText(suggestion.label);
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
                })}
              </div>
            </div>
          ) : normalizedTypeInput ? (
            <p className="text-xs text-muted-foreground">一致する候補はありません。</p>
          ) : null}
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
