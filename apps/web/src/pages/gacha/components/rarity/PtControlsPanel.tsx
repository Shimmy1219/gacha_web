import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';

import { type PtBundleV3, type PtGuaranteeV3, type PtSettingV3 } from '@domain/app-persistence';
import { generatePtBundleId, generatePtGuaranteeId } from '@domain/idGenerators';

import { getRarityTextPresentation } from '../../../../features/rarity/utils/rarityColorPresentation';
import { SingleSelectDropdown } from '../select/SingleSelectDropdown';

interface PtBundleRowState {
  id: string;
  price: string;
  pulls: string;
}

type GuaranteeTargetType = 'rarity' | 'item';

interface PtGuaranteeRowState {
  id: string;
  minPulls: string;
  rarityId: string;
  targetType: GuaranteeTargetType;
  itemId: string;
  quantity: string;
}

function areBundleRowsEqual(a: PtBundleRowState[], b: PtBundleRowState[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!right || left.id !== right.id || left.price !== right.price || left.pulls !== right.pulls) {
      return false;
    }
  }
  return true;
}

function areGuaranteeRowsEqual(a: PtGuaranteeRowState[], b: PtGuaranteeRowState[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      !right ||
      left.id !== right.id ||
      left.minPulls !== right.minPulls ||
      left.rarityId !== right.rarityId ||
      left.targetType !== right.targetType ||
      left.itemId !== right.itemId ||
      left.quantity !== right.quantity
    ) {
      return false;
    }
  }
  return true;
}

type PanelSnapshot = {
  perPull: string;
  complete: string;
  bundles: PtBundleRowState[];
  guarantees: PtGuaranteeRowState[];
};

interface RarityOption {
  value: string;
  label: string;
  color?: string | null;
}

interface GuaranteeItemOption {
  value: string;
  label: string;
}

type GuaranteeItemOptionsByRarity = Map<string, GuaranteeItemOption[]>;

interface PtControlsPanelProps {
  settings?: PtSettingV3;
  rarityOptions: RarityOption[];
  itemOptionsByRarity?: GuaranteeItemOptionsByRarity;
  onSettingsChange?: (next: PtSettingV3 | undefined) => void;
}

function createBundleRow(seed?: string, overrides?: Partial<PtBundleRowState>): PtBundleRowState {
  const id = seed ?? generatePtBundleId();
  return {
    id,
    price: overrides?.price ?? '',
    pulls: overrides?.pulls ?? ''
  };
}

function createGuaranteeRow(seed?: string, overrides?: Partial<PtGuaranteeRowState>): PtGuaranteeRowState {
  const id = seed ?? generatePtGuaranteeId();
  return {
    id,
    minPulls: overrides?.minPulls ?? '',
    rarityId: overrides?.rarityId ?? '',
    targetType: overrides?.targetType ?? 'rarity',
    itemId: overrides?.itemId ?? '',
    quantity: overrides?.quantity ?? '1'
  };
}

function ControlsRow({
  label,
  children,
  action,
  alignTop = false
}: {
  label: string;
  children?: ReactNode;
  action?: ReactNode;
  alignTop?: boolean;
}): JSX.Element {
  return (
    <div
      className={clsx(
        'pt-controls-panel__row grid gap-2 rounded-xl border border-border/50 bg-panel-muted/80 px-3 py-2',
        action
          ? 'grid-cols-[auto,minmax(0,1fr),auto]'
          : 'grid-cols-[auto,minmax(0,1fr)]',
        alignTop ? 'items-start' : 'items-center'
      )}
    >
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div
        className={clsx(
          'pt-controls-panel__row-fields flex flex-nowrap gap-2 whitespace-nowrap text-xs text-muted-foreground',
          alignTop ? 'items-start' : 'items-center'
        )}
      >
        {children}
      </div>
      {action ? <div className="pt-controls-panel__row-action flex justify-end">{action}</div> : null}
    </div>
  );
}

function InlineNumberField({
  value,
  onChange,
  placeholder,
  min = 0,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  className?: string;
}): JSX.Element {
  return (
    <input
      type="number"
      min={min}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={clsx(
        'pt-controls-panel__number-field h-9 min-w-[6ch] rounded-lg border border-border/60 bg-panel-contrast px-2 text-sm font-semibold text-surface-foreground transition focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none',
        className
      )}
    />
  );
}

function InlineSelectField({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: RarityOption[];
}): JSX.Element {
  const formattedOptions = useMemo(
    () =>
      options.map((option) => {
        const presentation = getRarityTextPresentation(option.color);
        return {
          value: option.value,
          label: (
            <span
              className={clsx('pt-controls-panel__select-option-label', presentation.className)}
              style={presentation.style}
            >
              {option.label}
            </span>
          )
        };
      }),
    [options]
  );

  return (
    <SingleSelectDropdown
      value={value}
      onChange={onChange}
      options={formattedOptions}
      placeholder="未選択"
      classNames={{
        root: 'pt-controls-panel__select-wrapper relative',
        button:
          'pt-controls-panel__select-button inline-flex min-w-[8rem] items-center justify-between gap-2 rounded-xl border border-border/60 bg-panel-contrast px-3 py-2 text-xs font-semibold text-surface-foreground transition hover:bg-panel-contrast/90',
        buttonOpen: 'border-accent text-accent',
        buttonClosed: 'hover:border-accent/70',
        icon: 'pt-controls-panel__select-icon h-4 w-4 transition-transform',
        iconOpen: 'rotate-180',
        menu:
          'pt-controls-panel__select-options absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 space-y-1 rounded-xl border border-border/60 bg-panel/95 p-2 text-xs shadow-[0_18px_44px_rgba(0,0,0,0.6)] backdrop-blur-sm',
        option:
          'pt-controls-panel__select-option flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition',
        optionActive: 'bg-accent/10 text-surface-foreground',
        optionInactive: 'text-muted-foreground hover:bg-panel-muted/80',
        optionLabel: 'pt-controls-panel__select-option-label flex-1 text-left',
        checkIcon: 'pt-controls-panel__select-check h-4 w-4 transition text-accent'
      }}
      renderButtonLabel={({ selectedOption }) => selectedOption?.label ?? '未選択'}
    />
  );
}

function AddButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pt-controls-panel__add-button inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold leading-none text-accent-foreground transition hover:brightness-110"
      aria-label="行を追加"
    >
      ＋
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pt-controls-panel__remove-button inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-panel-contrast text-sm font-bold leading-none text-muted-foreground transition hover:border-accent/70 hover:bg-panel-contrast/90 hover:text-surface-foreground"
      aria-label="行を削除"
    >
      －
    </button>
  );
}

function parseNonNegativeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function formatPercentage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getBundleDiscountPercent(
  perPullPrice: number | null,
  bundlePrice: number | null,
  pulls: number | null
): number | null {
  if (perPullPrice == null || bundlePrice == null || pulls == null) {
    return null;
  }
  if (perPullPrice <= 0 || pulls <= 0) {
    return null;
  }
  const normalTotal = perPullPrice * pulls;
  if (!Number.isFinite(normalTotal) || normalTotal <= 0) {
    return null;
  }
  return ((normalTotal - bundlePrice) / normalTotal) * 100;
}

function buildBundleEvaluations(
  perPullPrice: number | null,
  bundles: PtBundleRowState[]
): Map<string, { discountPercent: number | null; isLoss: boolean; warnNotIncreasing: boolean }> {
  const evaluations = new Map<
    string,
    {
      discountPercent: number | null;
      isLoss: boolean;
      warnNotIncreasing: boolean;
      warnDuplicatePrice: boolean;
    }
  >();
  const entries = bundles.map((bundle) => {
    const price = parseNonNegativeNumber(bundle.price);
    const pulls = parsePositiveInteger(bundle.pulls);
    const discountPercent = getBundleDiscountPercent(perPullPrice, price, pulls);
    return { id: bundle.id, price, discountPercent };
  });

  const sorted = entries
    .filter((entry) => entry.price != null && entry.discountPercent != null)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

  let maxDiscount = -Infinity;
  const warnSet = new Set<string>();
  sorted.forEach((entry) => {
    if (entry.discountPercent != null) {
      if (entry.discountPercent <= maxDiscount) {
        warnSet.add(entry.id);
      } else {
        maxDiscount = entry.discountPercent;
      }
    }
  });

  const priceCounts = new Map<number, number>();
  entries.forEach((entry) => {
    if (entry.price == null) {
      return;
    }
    priceCounts.set(entry.price, (priceCounts.get(entry.price) ?? 0) + 1);
  });

  entries.forEach((entry) => {
    const discountPercent = entry.discountPercent ?? null;
    const warnDuplicatePrice =
      entry.price != null ? (priceCounts.get(entry.price) ?? 0) > 1 : false;
    evaluations.set(entry.id, {
      discountPercent,
      isLoss: discountPercent != null && discountPercent < 0,
      warnNotIncreasing: warnSet.has(entry.id),
      warnDuplicatePrice
    });
  });

  return evaluations;
}

function cloneSettingWithoutUpdatedAt(setting: PtSettingV3 | undefined): PtSettingV3 | undefined {
  if (!setting) {
    return undefined;
  }
  return {
    ...(setting.perPull ? { perPull: { ...setting.perPull } } : {}),
    ...(setting.complete ? { complete: { price: setting.complete.price } } : {}),
    ...(setting.bundles ? { bundles: setting.bundles.map((bundle) => ({ ...bundle })) } : {}),
    ...(setting.guarantees ? { guarantees: setting.guarantees.map((guarantee) => ({ ...guarantee })) } : {})
  };
}

function buildSettingsFromSnapshot(
  snapshot: PanelSnapshot,
  previous: PtSettingV3 | undefined
): PtSettingV3 | undefined {
  const next: PtSettingV3 = {};

  const perPullPrice = parseNonNegativeNumber(snapshot.perPull);
  if (perPullPrice != null) {
    const pulls = previous?.perPull?.pulls ?? 1;
    next.perPull = {
      price: perPullPrice,
      pulls
    };
  }

  const completePrice = parseNonNegativeNumber(snapshot.complete);
  if (completePrice != null) {
    next.complete = { price: completePrice };
  }

  const bundles = snapshot.bundles
    .map((bundle): PtBundleV3 | null => {
      const price = parseNonNegativeNumber(bundle.price);
      const pulls = parsePositiveInteger(bundle.pulls);
      if (price == null || pulls == null) {
        return null;
      }
      return {
        id: bundle.id,
        price,
        pulls
      };
    })
    .filter((bundle): bundle is PtBundleV3 => bundle !== null);

  if (bundles.length > 0) {
    next.bundles = bundles;
  }

  const guarantees = snapshot.guarantees
    .map((guarantee): PtGuaranteeV3 | null => {
      const threshold = parsePositiveInteger(guarantee.minPulls);
      const rarityId = guarantee.rarityId.trim();
      if (!rarityId || threshold == null) {
        return null;
      }
      const quantity = parsePositiveInteger(guarantee.quantity) ?? 1;
      const trimmedItemId = guarantee.itemId.trim();
      const targetType: GuaranteeTargetType =
        guarantee.targetType === 'item' && trimmedItemId !== '' ? 'item' : 'rarity';
      const itemId = targetType === 'item' ? trimmedItemId : '';
      const base: PtGuaranteeV3 = {
        id: guarantee.id,
        rarityId,
        threshold,
        quantity,
        target: targetType === 'item' ? { type: 'item', itemId } : { type: 'rarity' }
      };
      return base;
    })
    .filter((guarantee): guarantee is PtGuaranteeV3 => guarantee !== null);

  if (guarantees.length > 0) {
    next.guarantees = guarantees;
  }

  if (!next.perPull && !next.complete && !next.bundles && !next.guarantees) {
    return undefined;
  }

  return next;
}

export function PtControlsPanel({
  settings,
  rarityOptions,
  itemOptionsByRarity,
  onSettingsChange
}: PtControlsPanelProps): JSX.Element {
  const [perPull, setPerPull] = useState('');
  const [complete, setComplete] = useState('');
  const [bundles, setBundles] = useState<PtBundleRowState[]>([]);
  const [guarantees, setGuarantees] = useState<PtGuaranteeRowState[]>([]);

  const itemOptionsMap = useMemo(
    () => itemOptionsByRarity ?? new Map<string, GuaranteeItemOption[]>(),
    [itemOptionsByRarity]
  );

  const initialComparableSettings = cloneSettingWithoutUpdatedAt(settings);
  const lastEmittedRef = useRef<string>(
    initialComparableSettings ? JSON.stringify(initialComparableSettings) : ''
  );
  const syncingFromSettingsRef = useRef(false);

  useEffect(() => {
    syncingFromSettingsRef.current = true;

    const comparable = cloneSettingWithoutUpdatedAt(settings);
    const serialized = comparable ? JSON.stringify(comparable) : '';

    const nextPerPull = settings?.perPull?.price != null ? String(settings.perPull.price) : '';
    setPerPull((previous) => (previous === nextPerPull ? previous : nextPerPull));

    const nextComplete = settings?.complete?.price != null ? String(settings.complete.price) : '';
    setComplete((previous) => (previous === nextComplete ? previous : nextComplete));

    setBundles((previous) => {
      if (!settings?.bundles) {
        return [];
      }
      const nextBundles = settings.bundles.map((bundle) =>
        createBundleRow(bundle.id, {
          price: String(bundle.price),
          pulls: String(bundle.pulls)
        })
      );
      return areBundleRowsEqual(previous, nextBundles) ? previous : nextBundles;
    });

    const nextGuarantees = settings?.guarantees
      ? settings.guarantees.map((guarantee) => {
          const rawItemId =
            guarantee.target?.type === 'item' && typeof guarantee.target?.itemId === 'string'
              ? guarantee.target.itemId
              : '';
          const normalizedItemId = rawItemId.trim();
          const targetType: GuaranteeTargetType =
            guarantee.target?.type === 'item' && normalizedItemId !== '' ? 'item' : 'rarity';
          const itemId = targetType === 'item' ? normalizedItemId : '';
          return createGuaranteeRow(guarantee.id, {
            minPulls: String(guarantee.threshold),
            rarityId: guarantee.rarityId,
            targetType,
            itemId,
            quantity: String(guarantee.quantity ?? 1)
          });
        })
      : [];
    setGuarantees((previous) =>
      areGuaranteeRowsEqual(previous, nextGuarantees) ? previous : nextGuarantees
    );
    if (lastEmittedRef.current !== serialized) {
      lastEmittedRef.current = serialized;
    }
  }, [settings]);

  const emitSettingsChange = useCallback(
    (snapshot: PanelSnapshot) => {
      if (!onSettingsChange) {
        return;
      }
      const perPullPriceValue = parseNonNegativeNumber(snapshot.perPull);
      const bundleEvaluations = buildBundleEvaluations(perPullPriceValue, snapshot.bundles);
      const hasWarnings = Array.from(bundleEvaluations.values()).some(
        (entry) => entry.isLoss || entry.warnNotIncreasing || entry.warnDuplicatePrice
      );
      if (hasWarnings) {
        return;
      }
      const nextSetting = buildSettingsFromSnapshot(snapshot, settings);
      const serialized = nextSetting ? JSON.stringify(nextSetting) : '';
      if (lastEmittedRef.current === serialized) {
        return;
      }
      lastEmittedRef.current = serialized;
      onSettingsChange(nextSetting);
    },
    [onSettingsChange, settings]
  );

  useEffect(() => {
    if (syncingFromSettingsRef.current) {
      syncingFromSettingsRef.current = false;
      return;
    }

    emitSettingsChange({
      perPull,
      complete,
      bundles,
      guarantees
    });
  }, [perPull, complete, bundles, guarantees, emitSettingsChange]);

  const perPullPriceValue = useMemo(() => parseNonNegativeNumber(perPull), [perPull]);
  const bundleEvaluations = useMemo(
    () => buildBundleEvaluations(perPullPriceValue, bundles),
    [bundles, perPullPriceValue]
  );

  return (
    <>
      <ControlsRow label="1回の消費pt">
        <InlineNumberField
          value={perPull}
          onChange={(value) => {
            setPerPull(value);
          }}
          placeholder="10"
          className="ml-auto w-[12ch]"
        />
      </ControlsRow>

      <ControlsRow label="コンプpt">
        <InlineNumberField
          value={complete}
          onChange={(value) => {
            setComplete(value);
          }}
          placeholder="1000"
          className="ml-auto w-[12ch]"
        />
      </ControlsRow>

      <ControlsRow
        label="お得バンドル（n ptで m 連）"
        action={
          <AddButton
            onClick={() =>
              setBundles((prev) => {
                const next = [...prev, createBundleRow()];
                return next;
              })
            }
          />
        }
      />

      {bundles.length > 0 ? (
        <div className="pt-controls-panel__bundle-items space-y-1.5 rounded-2xl border border-border/40 bg-panel-muted/60 px-2 py-2">
          {bundles.map((bundle, index) => {
            const evaluation = bundleEvaluations.get(bundle.id) ?? {
              discountPercent: null,
              isLoss: false,
              warnNotIncreasing: false,
              warnDuplicatePrice: false
            };
            const discountPercent = evaluation.discountPercent;
            const isLoss = evaluation.isLoss;
            const percentLabel =
              discountPercent != null ? formatPercentage(Math.abs(discountPercent)) : null;

            const savingsLabel = discountPercent == null
              ? null
              : `${percentLabel}%${isLoss ? '損' : '得'}`;

            return (
              <div
                key={bundle.id}
                className="pt-controls-panel__bundle-row grid grid-cols-[minmax(0,1fr),auto] items-center gap-2 border-b border-border/50 bg-transparent px-1 py-2"
              >
                <div className="pt-controls-panel__bundle-fields flex flex-col gap-1 text-xs text-muted-foreground">
                  <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                    <InlineNumberField
                      value={bundle.price}
                      onChange={(value) =>
                        setBundles((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], price: value };
                          return next;
                        })
                      }
                      placeholder="3000"
                      className={clsx(
                        'w-[10ch]',
                        isLoss && 'border-rose-400 text-rose-500 focus:border-rose-500 focus:ring-rose-400/40'
                      )}
                    />
                    <span className="text-xs leading-none text-muted-foreground">ptで</span>
                    <InlineNumberField
                      value={bundle.pulls}
                      onChange={(value) =>
                        setBundles((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], pulls: value };
                          return next;
                        })
                      }
                      placeholder="10"
                      min={1}
                      className={clsx(
                        'w-[8ch]',
                        isLoss && 'border-rose-400 text-rose-500 focus:border-rose-500 focus:ring-rose-400/40'
                      )}
                    />
                    <span className="text-xs leading-none text-muted-foreground">連</span>
                    {savingsLabel ? (
                      <span
                        className={clsx(
                          'ml-1 text-[11px] font-semibold',
                          isLoss ? 'text-rose-400' : 'text-emerald-400'
                        )}
                      >
                        {savingsLabel}
                      </span>
                    ) : null}
                  </div>
                  {evaluation.warnNotIncreasing ? (
                    <span className="text-[11px] font-semibold text-amber-400">
                      高ptのお得率は低ptのお得率を上回る必要があります
                    </span>
                  ) : null}
                  {evaluation.warnDuplicatePrice ? (
                    <span className="text-[11px] font-semibold text-amber-400">
                      同じptが既に設定されています
                    </span>
                  ) : null}
                  {isLoss ? (
                    <span className="text-[11px] font-semibold text-rose-400">
                      通常時より損になるように設定することは出来ません
                    </span>
                  ) : null}
                </div>
                <RemoveButton
                  onClick={() =>
                    setBundles((prev) => {
                      const next = prev.filter((entry) => entry.id !== bundle.id);
                      return next;
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <ControlsRow
        label="天井保証"
        action={
          <AddButton
            onClick={() =>
              setGuarantees((prev) => {
                const next = [...prev, createGuaranteeRow()];
                return next;
              })
            }
          />
        }
      />

      {guarantees.length > 0 ? (
        <div className="pt-controls-panel__guarantee-items space-y-1.5 rounded-2xl border border-border/40 bg-panel-muted/60 px-2 py-2">
          {guarantees.map((guarantee, index) => (
            <div
              key={guarantee.id}
              className="pt-controls-panel__guarantee-row grid grid-cols-[minmax(0,1fr),auto] items-center gap-2 border-b border-border/50 bg-transparent px-3 py-2"
            >
              <div className="pt-controls-panel__guarantee-fields flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <InlineNumberField
                  value={guarantee.minPulls}
                  onChange={(value) =>
                    setGuarantees((prev) => {
                      const next = [...prev];
                      next[index] = { ...next[index], minPulls: value };
                      return next;
                    })
                  }
                  placeholder="30"
                  min={1}
                  className="w-[8ch]"
                />
                <span className="text-xs leading-none text-muted-foreground">連以上で</span>
                <InlineSelectField
                  value={guarantee.rarityId || (rarityOptions[0]?.value ?? '')}
                  onChange={(value) =>
                    setGuarantees((prev) => {
                      const next = [...prev];
                      const available = itemOptionsMap.get(value) ?? [];
                      const currentItemId = next[index].itemId;
                      const shouldResetItem =
                        next[index].targetType === 'item' &&
                        (currentItemId === '' || !available.some((option) => option.value === currentItemId));
                      next[index] = {
                        ...next[index],
                        rarityId: value,
                        targetType: shouldResetItem ? 'rarity' : next[index].targetType,
                        itemId: shouldResetItem ? '' : currentItemId
                      };
                      return next;
                    })
                  }
                  options={rarityOptions}
                />
                <span className="text-xs leading-none text-muted-foreground">の中から</span>
                <SingleSelectDropdown<string>
                  value={
                    guarantee.targetType === 'item' && guarantee.itemId
                      ? `item:${guarantee.itemId}`
                      : 'rarity'
                  }
                  options={[
                    { value: 'rarity', label: 'ランダム' },
                    ...(itemOptionsMap.get(guarantee.rarityId) ?? []).map((option) => ({
                      value: `item:${option.value}`,
                      label: option.label
                    }))
                  ]}
                  onChange={(value) =>
                    setGuarantees((prev) => {
                      const next = [...prev];
                      const isItem = value.startsWith('item:');
                      const itemId = isItem ? value.slice(5) : '';
                      next[index] = {
                        ...next[index],
                        targetType: isItem ? 'item' : 'rarity',
                        itemId
                      };
                      return next;
                    })
                  }
                  fallbackToFirstOption={false}
                />
                <span className="text-xs leading-none text-muted-foreground">を</span>
                <InlineNumberField
                  value={guarantee.quantity}
                  onChange={(value) =>
                    setGuarantees((prev) => {
                      const next = [...prev];
                      next[index] = { ...next[index], quantity: value };
                      return next;
                    })
                  }
                  placeholder="1"
                  min={1}
                  className="w-[6ch]"
                />
                <span className="text-xs leading-none text-muted-foreground">個確定</span>
              </div>
              <RemoveButton
                onClick={() =>
                  setGuarantees((prev) => {
                    const next = prev.filter((entry) => entry.id !== guarantee.id);
                    return next;
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
