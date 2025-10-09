import { type ReactNode, useMemo, useRef, useState } from 'react';
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

const RARITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SSR', label: 'SSR' },
  { value: 'SR', label: 'SR' },
  { value: 'R', label: 'R' },
  { value: 'N', label: 'N' }
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
        'grid gap-4 rounded-2xl border border-border/60 bg-panel/70 px-4 py-3 shadow-panel',
        action
          ? 'grid-cols-[minmax(10rem,auto),minmax(0,1fr),auto]'
          : 'grid-cols-[minmax(10rem,auto),minmax(0,1fr)]',
        alignTop ? 'items-start' : 'items-center'
      )}
    >
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div className={clsx('flex flex-wrap gap-3', alignTop ? 'items-start' : 'items-center')}>
        {children}
      </div>
      {action ? <div className="flex justify-end">{action}</div> : null}
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
      className="h-9 min-w-[6ch] rounded-lg border border-border/60 bg-surface/70 px-3 text-sm font-semibold text-surface-foreground shadow-inner transition focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
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
      className="h-9 rounded-lg border border-border/60 bg-surface/70 px-3 text-sm font-semibold text-surface-foreground shadow-inner transition focus:border-accent focus:ring-2 focus:ring-accent/40 focus:outline-none"
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold leading-none text-accent-foreground shadow-[0_10px_24px_rgba(255,47,93,0.45)] transition hover:brightness-110"
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-surface/70 text-base font-bold leading-none text-muted-foreground shadow-inner transition hover:border-accent/70 hover:text-surface-foreground"
      aria-label="行を削除"
    >
      －
    </button>
  );
}

export function PtControlsPanel(): JSX.Element {
  const [perPull, setPerPull] = useState('10');
  const [complete, setComplete] = useState('1000');
  const [bundles, setBundles] = useState<PtBundleRowState[]>([createBundleRow(0)]);
  const [guarantees, setGuarantees] = useState<PtGuaranteeRowState[]>([createGuaranteeRow(0)]);
  const nextBundleId = useRef(1);
  const nextGuaranteeId = useRef(1);

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
    <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-panel/70 p-4 shadow-panel">
      <ControlsRow label="1回の消費pt">
        <InlineNumberField value={perPull} onChange={setPerPull} placeholder="10" />
      </ControlsRow>

      <ControlsRow label="コンプpt">
        <InlineNumberField value={complete} onChange={setComplete} placeholder="1000" />
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
        <span className="text-xs text-muted-foreground">{bundlesTotalLabel}</span>
      </ControlsRow>

      <div className="space-y-2 rounded-2xl border border-dashed border-accent/30 bg-surface/50 px-4 py-3">
        {bundles.map((bundle) => (
          <div
            key={bundle.id}
            className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 rounded-xl border border-border/40 bg-panel/80 px-3 py-2"
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
                min={1}
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

      <ControlsRow
        label="保証（n連以上で ○○ 以上確定）"
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
        <span className="text-xs text-muted-foreground">{guaranteesTotalLabel}</span>
      </ControlsRow>

      <div className="space-y-2 rounded-2xl border border-dashed border-accent/30 bg-surface/50 px-4 py-3">
        {guarantees.map((guarantee) => (
          <div
            key={guarantee.id}
            className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-3 rounded-xl border border-border/40 bg-panel/80 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                min={1}
              />
              <span>連以上で</span>
              <InlineSelectField
                value={guarantee.minRarity}
                onChange={(rarity) =>
                  setGuarantees((prev) =>
                    prev.map((row) =>
                      row.id === guarantee.id ? { ...row, minRarity: rarity } : row
                    )
                  )
                }
                options={RARITY_OPTIONS}
              />
              <span>以上確定</span>
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
    </section>
  );
}
