import { type ReactNode, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

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

interface PtControlsPanelProps {
  settings?: {
    perPull?: {
      price: number;
      pulls: number;
    };
    complete?: {
      price: number;
    };
    bundles?: Array<{ id: string; price: number; pulls: number }>;
    guarantees?: Array<{ id: string; rarityId: string; threshold: number }>;
  };
  rarityOptions: Array<{ value: string; label: string }>;
}

function createBundleRow(seed: number | string, overrides?: Partial<PtBundleRowState>): PtBundleRowState {
  const id = typeof seed === 'number' ? `bundle-${seed}` : seed;
  return {
    id,
    price: overrides?.price ?? '',
    pulls: overrides?.pulls ?? ''
  };
}

function createGuaranteeRow(seed: number | string, overrides?: Partial<PtGuaranteeRowState>): PtGuaranteeRowState {
  const id = typeof seed === 'number' ? `guarantee-${seed}` : seed;
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
        'pt-controls-panel__row grid gap-2 rounded-2xl px-1 py-1 shadow-panel',
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
        'pt-controls-panel__number-field h-9 min-w-[6ch] rounded-lg border border-border/60 bg-surface/70 px-3 text-sm font-semibold text-surface-foreground shadow-inner transition focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none',
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
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <select
      className="pt-controls-panel__select h-9 rounded-lg border border-border/60 bg-surface/70 px-3 text-sm font-semibold text-surface-foreground shadow-inner transition focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function AddButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pt-controls-panel__add-button inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold leading-none text-accent-foreground shadow-[0_10px_24px_rgba(225,29,72,0.45)] transition hover:brightness-110"
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
      className="pt-controls-panel__remove-button inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-surface/70 text-sm font-bold leading-none text-muted-foreground shadow-inner transition hover:border-accent/70 hover:text-surface-foreground"
      aria-label="行を削除"
    >
      －
    </button>
  );
}

export function PtControlsPanel({ settings, rarityOptions }: PtControlsPanelProps): JSX.Element {
  const [perPull, setPerPull] = useState('');
  const [complete, setComplete] = useState('');
  const [bundles, setBundles] = useState<PtBundleRowState[]>([createBundleRow(0)]);
  const [guarantees, setGuarantees] = useState<PtGuaranteeRowState[]>([createGuaranteeRow(0)]);
  const nextBundleId = useRef(1);
  const nextGuaranteeId = useRef(1);

  useEffect(() => {
    setPerPull(settings?.perPull?.price != null ? String(settings.perPull.price) : '');
    setComplete(settings?.complete?.price != null ? String(settings.complete.price) : '');

    if (settings?.bundles && settings.bundles.length > 0) {
      setBundles(
        settings.bundles.map((bundle) =>
          createBundleRow(bundle.id, {
            price: String(bundle.price),
            pulls: String(bundle.pulls)
          })
        )
      );
      nextBundleId.current = settings.bundles.length + 1;
    } else {
      setBundles([createBundleRow(0)]);
      nextBundleId.current = 1;
    }

    if (settings?.guarantees && settings.guarantees.length > 0) {
      setGuarantees(
        settings.guarantees.map((guarantee) =>
          createGuaranteeRow(guarantee.id, {
            minPulls: String(guarantee.threshold),
            minRarity: guarantee.rarityId
          })
        )
      );
      nextGuaranteeId.current = settings.guarantees.length + 1;
    } else {
      setGuarantees([createGuaranteeRow(0)]);
      nextGuaranteeId.current = 1;
    }
  }, [settings]);

  const ensureBundleExists = (next: PtBundleRowState[]): PtBundleRowState[] =>
    next.length === 0 ? [createBundleRow(Date.now())] : next;

  const ensureGuaranteeExists = (next: PtGuaranteeRowState[]): PtGuaranteeRowState[] =>
    next.length === 0 ? [createGuaranteeRow(Date.now())] : next;

  return (
    <div className="pt-controls-panel flex flex-col gap-2 rounded-2xl p-3 shadow-panel">
      <ControlsRow label="1回の消費pt">
        <InlineNumberField
          value={perPull}
          onChange={setPerPull}
          placeholder="10"
          className="ml-auto w-[12ch]"
        />
      </ControlsRow>

      <ControlsRow label="コンプpt">
        <InlineNumberField
          value={complete}
          onChange={setComplete}
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
                const id = nextBundleId.current;
                nextBundleId.current += 1;
                return [...prev, createBundleRow(id)];
              })
            }
          />
        }
      >
        <div className="flex flex-col gap-2">
          {bundles.map((bundle, index) => (
            <div key={bundle.id} className="flex items-center gap-2">
              <InlineNumberField
                value={bundle.price}
                onChange={(value) =>
                  setBundles((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], price: value };
                    return ensureBundleExists(next);
                  })
                }
                placeholder="3000"
                className="w-[10ch]"
              />
              <span className="text-xs text-muted-foreground">pt</span>
              <InlineNumberField
                value={bundle.pulls}
                onChange={(value) =>
                  setBundles((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], pulls: value };
                    return ensureBundleExists(next);
                  })
                }
                placeholder="10"
                className="w-[8ch]"
              />
              <span className="text-xs text-muted-foreground">連</span>
              <RemoveButton
                onClick={() =>
                  setBundles((prev) => ensureBundleExists(prev.filter((entry) => entry.id !== bundle.id)))
                }
              />
            </div>
          ))}
        </div>
      </ControlsRow>

      <ControlsRow
        label="天井保証"
        alignTop
        action={
          <AddButton
            onClick={() =>
              setGuarantees((prev) => {
                const id = nextGuaranteeId.current;
                nextGuaranteeId.current += 1;
                return [...prev, createGuaranteeRow(id)];
              })
            }
          />
        }
      >
        <div className="flex flex-col gap-2">
          {guarantees.map((guarantee, index) => (
            <div key={guarantee.id} className="flex items-center gap-2">
              <InlineNumberField
                value={guarantee.minPulls}
                onChange={(value) =>
                  setGuarantees((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], minPulls: value };
                    return ensureGuaranteeExists(next);
                  })
                }
                placeholder="30"
                className="w-[8ch]"
              />
              <span className="text-xs text-muted-foreground">連以内で</span>
              <InlineSelectField
                value={guarantee.minRarity || (rarityOptions[0]?.value ?? '')}
                onChange={(value) =>
                  setGuarantees((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], minRarity: value };
                    return ensureGuaranteeExists(next);
                  })
                }
                options={rarityOptions}
              />
              <span className="text-xs text-muted-foreground">保証</span>
              <RemoveButton
                onClick={() =>
                  setGuarantees((prev) =>
                    ensureGuaranteeExists(prev.filter((entry) => entry.id !== guarantee.id))
                  )
                }
              />
            </div>
          ))}
        </div>
      </ControlsRow>
    </div>
  );
}
