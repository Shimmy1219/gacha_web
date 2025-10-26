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

interface PtGuaranteeRowState {
  id: string;
  minPulls: string;
  minRarity: string;
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

interface PtControlsPanelProps {
  settings?: PtSettingV3;
  rarityOptions: RarityOption[];
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
    minRarity: overrides?.minRarity ?? ''
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
        'pt-controls-panel__number-field h-9 min-w-[6ch] rounded-lg border border-border/60 bg-panel-contrast px-3 text-sm font-semibold text-surface-foreground transition focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none',
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

function cloneSettingWithoutUpdatedAt(setting: PtSettingV3 | undefined): PtSettingV3 | undefined {
  if (!setting) {
    return undefined;
  }
  return {
    ...(setting.perPull ? { perPull: { ...setting.perPull } } : {}),
    ...(setting.complete ? { complete: { ...setting.complete } } : {}),
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

  const previousGuarantees = previous?.guarantees ?? [];
  const guarantees = snapshot.guarantees
    .map((guarantee): PtGuaranteeV3 | null => {
      const threshold = parsePositiveInteger(guarantee.minPulls);
      const rarityId = guarantee.minRarity.trim();
      if (!rarityId || threshold == null) {
        return null;
      }
      const previousEntry = previousGuarantees.find((entry) => entry.id === guarantee.id);
      const base: PtGuaranteeV3 = {
        id: guarantee.id,
        rarityId,
        threshold
      };
      if (previousEntry?.pityStep != null) {
        base.pityStep = previousEntry.pityStep;
      }
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

export function PtControlsPanel({ settings, rarityOptions, onSettingsChange }: PtControlsPanelProps): JSX.Element {
  const [perPull, setPerPull] = useState('');
  const [complete, setComplete] = useState('');
  const [bundles, setBundles] = useState<PtBundleRowState[]>([]);
  const [guarantees, setGuarantees] = useState<PtGuaranteeRowState[]>([]);

  const initialComparableSettings = cloneSettingWithoutUpdatedAt(settings);
  const lastEmittedRef = useRef<string>(
    initialComparableSettings ? JSON.stringify(initialComparableSettings) : ''
  );

  useEffect(() => {
    setPerPull(settings?.perPull?.price != null ? String(settings.perPull.price) : '');
    setComplete(settings?.complete?.price != null ? String(settings.complete.price) : '');

    const nextBundles = settings?.bundles
      ? settings.bundles.map((bundle) =>
          createBundleRow(bundle.id, {
            price: String(bundle.price),
            pulls: String(bundle.pulls)
          })
        )
      : [];
    setBundles(nextBundles);

    const nextGuarantees = settings?.guarantees
      ? settings.guarantees.map((guarantee) =>
          createGuaranteeRow(guarantee.id, {
            minPulls: String(guarantee.threshold),
            minRarity: guarantee.rarityId
          })
        )
      : [];
    setGuarantees(nextGuarantees);

    const comparable = cloneSettingWithoutUpdatedAt(settings);
    lastEmittedRef.current = comparable ? JSON.stringify(comparable) : '';
  }, [settings]);

  const emitSettingsChange = useCallback(
    (snapshot: PanelSnapshot) => {
      if (!onSettingsChange) {
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
    emitSettingsChange({
      perPull,
      complete,
      bundles,
      guarantees
    });
  }, [perPull, complete, bundles, guarantees, emitSettingsChange]);

  return (
    <div className="pt-controls-panel flex flex-col gap-2 rounded-2xl border border-border/60 bg-panel p-3 shadow-sm">
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

      <div className="pt-controls-panel__bundle-items space-y-1.5 rounded-2xl border border-border/40 bg-panel-muted/60 px-2 py-2">
        {bundles.map((bundle, index) => (
          <div
            key={bundle.id}
            className="pt-controls-panel__bundle-row grid grid-cols-[minmax(0,1fr),auto] items-center gap-2 rounded-xl border border-border/50 bg-panel-contrast px-3 py-2 shadow-inner"
          >
            <div className="pt-controls-panel__bundle-fields flex flex-nowrap items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
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
                className="w-[10ch]"
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
                className="w-[8ch]"
              />
              <span className="text-xs leading-none text-muted-foreground">連</span>
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
        ))}
      </div>

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

      <div className="pt-controls-panel__guarantee-items space-y-1.5 rounded-2xl border border-border/40 bg-panel-muted/60 px-2 py-2">
        {guarantees.map((guarantee, index) => (
          <div
            key={guarantee.id}
            className="pt-controls-panel__guarantee-row grid grid-cols-[minmax(0,1fr),auto] items-center gap-2 rounded-xl border border-border/50 bg-panel-contrast px-3 py-2 shadow-inner"
          >
            <div className="pt-controls-panel__guarantee-fields flex flex-nowrap items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
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
              <span className="text-xs leading-none text-muted-foreground">連で</span>
              <InlineSelectField
                value={guarantee.minRarity || (rarityOptions[0]?.value ?? '')}
                onChange={(value) =>
                  setGuarantees((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], minRarity: value };
                    return next;
                  })
                }
                options={rarityOptions}
              />
              <span className="text-xs leading-none text-muted-foreground">確定</span>
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
    </div>
  );
}
