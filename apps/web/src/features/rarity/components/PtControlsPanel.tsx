import { type ReactNode, useMemo, useState } from 'react';
import { MinusIcon, PlusIcon } from '@heroicons/react/20/solid';
import { clsx } from 'clsx';

interface PtBundleRowState {
  id: string;
  pt: string;
  pulls: string;
}

interface PtGuaranteeRowState {
  id: string;
  minPulls: string;
  minRarity: string;
}

const RARITY_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'SSR', label: 'SSR', color: '#ffd166' },
  { value: 'SR', label: 'SR', color: '#c084fc' },
  { value: 'R', label: 'R', color: '#60a5fa' },
  { value: 'N', label: 'N', color: '#34d399' }
];

function createBundleRow(seed: number): PtBundleRowState {
  return {
    id: `bundle-${seed}`,
    pt: '0',
    pulls: '10'
  };
}

function createGuaranteeRow(seed: number): PtGuaranteeRowState {
  return {
    id: `guarantee-${seed}`,
    minPulls: '30',
    minRarity: 'SSR'
  };
}

function ControlHeader({
  label,
  action
}: {
  label: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      {action}
    </div>
  );
}

function InlineNumberField({
  value,
  onChange,
  placeholder,
  min = 0
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
}): JSX.Element {
  return (
    <input
      type="number"
      min={min}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[6ch] rounded-xl border border-border/60 bg-panel/70 px-3 py-2 text-sm font-semibold text-surface-foreground shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition focus:border-accent focus:ring-2 focus:ring-accent/60 focus:outline-none"
    />
  );
}

function AddButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-accent to-[#ff5378] text-accent-foreground shadow-[0_14px_36px_rgba(255,47,93,0.45)] transition hover:from-[#ff5378] hover:to-accent"
      aria-label="行を追加"
    >
      <PlusIcon className="h-5 w-5" />
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-surface/60 text-muted-foreground shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:border-accent/70 hover:text-surface-foreground"
      aria-label="行を削除"
    >
      <MinusIcon className="h-5 w-5" />
    </button>
  );
}

function RaritySelector({
  value,
  onChange
}: {
  value: string;
  onChange: (rarity: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {RARITY_OPTIONS.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={clsx(
              'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.25em] transition',
              isActive
                ? 'border-transparent bg-accent text-accent-foreground shadow-[0_14px_32px_rgba(255,47,93,0.45)]'
                : 'border-border/60 bg-surface/60 text-muted-foreground hover:border-accent/60 hover:text-surface-foreground'
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: option.color }}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function PtControlsPanel(): JSX.Element {
  const [perPull, setPerPull] = useState('10');
  const [complete, setComplete] = useState('1000');
  const [bundles, setBundles] = useState<PtBundleRowState[]>([createBundleRow(0)]);
  const [guarantees, setGuarantees] = useState<PtGuaranteeRowState[]>([createGuaranteeRow(0)]);

  const bundlesTotalLabel = useMemo(() => `${bundles.length}件のバンドル`, [bundles.length]);
  const guaranteesTotalLabel = useMemo(
    () => `${guarantees.length}件の保証`,
    [guarantees.length]
  );

  const ensureBundleExists = (next: PtBundleRowState[]): PtBundleRowState[] =>
    next.length === 0 ? [createBundleRow(Date.now())] : next;

  const ensureGuaranteeExists = (next: PtGuaranteeRowState[]): PtGuaranteeRowState[] =>
    next.length === 0 ? [createGuaranteeRow(Date.now())] : next;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-panel/60 p-4 shadow-panel">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">1回の消費pt</span>
          <InlineNumberField value={perPull} onChange={setPerPull} placeholder="10" />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-muted-foreground">コンプpt</span>
          <InlineNumberField value={complete} onChange={setComplete} placeholder="1000" />
        </label>
      </div>

      <div className="space-y-3">
        <ControlHeader
          label={`お得バンドル（n ptで m 連） · ${bundlesTotalLabel}`}
          action={<AddButton onClick={() => setBundles((prev) => [...prev, createBundleRow(prev.length + 1)])} />}
        />
        <div className="space-y-3">
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <InlineNumberField
                  value={bundle.pt}
                  onChange={(value) =>
                    setBundles((prev) =>
                      prev.map((row) => (row.id === bundle.id ? { ...row, pt: value } : row))
                    )
                  }
                  placeholder="60"
                />
                <span>ptで</span>
                <InlineNumberField
                  value={bundle.pulls}
                  onChange={(value) =>
                    setBundles((prev) =>
                      prev.map((row) => (row.id === bundle.id ? { ...row, pulls: value } : row))
                    )
                  }
                  placeholder="10"
                />
                <span>連</span>
              </div>
              <RemoveButton
                onClick={() =>
                  setBundles((prev) =>
                    ensureBundleExists(prev.filter((row) => row.id !== bundle.id))
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <ControlHeader
          label={`保証（n連以上で ○○ 以上確定） · ${guaranteesTotalLabel}`}
          action={
            <AddButton
              onClick={() =>
                setGuarantees((prev) => [...prev, createGuaranteeRow(prev.length + 1)])
              }
            />
          }
        />
        <div className="space-y-3">
          {guarantees.map((guarantee) => (
            <div
              key={guarantee.id}
              className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.35)]"
            >
              <div className="flex flex-col gap-3 text-xs text-muted-foreground lg:flex-row lg:items-center lg:gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <InlineNumberField
                    value={guarantee.minPulls}
                    onChange={(value) =>
                      setGuarantees((prev) =>
                        prev.map((row) =>
                          row.id === guarantee.id ? { ...row, minPulls: value } : row
                        )
                      )
                    }
                    placeholder="30"
                  />
                  <span>連以上で</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RaritySelector
                    value={guarantee.minRarity}
                    onChange={(rarity) =>
                      setGuarantees((prev) =>
                        prev.map((row) =>
                          row.id === guarantee.id ? { ...row, minRarity: rarity } : row
                        )
                      )
                    }
                  />
                  <span>以上確定</span>
                </div>
              </div>
              <RemoveButton
                onClick={() =>
                  setGuarantees((prev) =>
                    ensureGuaranteeExists(prev.filter((row) => row.id !== guarantee.id))
                  )
                }
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
