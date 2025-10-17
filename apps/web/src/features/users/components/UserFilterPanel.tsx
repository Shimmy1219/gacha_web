import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectFilterProps {
  id: string;
  label: string;
  options: MultiSelectOption[];
  value: '*' | string[];
  onChange: Dispatch<SetStateAction<'*' | string[]>>;
}

function MultiSelectFilter({ id, label, options, value, onChange }: MultiSelectFilterProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const allValues = useMemo(() => options.map((option) => option.value), [options]);
  const selectedSet = useMemo(() => {
    if (value === '*') {
      return new Set(allValues);
    }
    return new Set(value);
  }, [allValues, value]);

  const buttonLabel = useMemo(() => {
    if (value === '*' || selectedSet.size === allValues.length) {
      return 'すべて';
    }
    if (selectedSet.size === 0) {
      return '未選択';
    }
    if (selectedSet.size === 1) {
      const [single] = Array.from(selectedSet);
      return options.find((option) => option.value === single)?.label ?? '1項目';
    }
    return `${selectedSet.size}項目`;
  }, [allValues.length, options, selectedSet, value]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const toggleAll = (): void => {
    onChange((prev) => {
      if (prev === '*') {
        return [];
      }
      return '*';
    });
  };

  const toggleValue = (nextValue: string): void => {
    onChange((prev) => {
      const baseSet = prev === '*' ? new Set(allValues) : new Set(prev);
      if (baseSet.has(nextValue)) {
        baseSet.delete(nextValue);
      } else {
        baseSet.add(nextValue);
      }

      if (baseSet.size === 0 || baseSet.size === allValues.length) {
        return '*';
      }
      return Array.from(baseSet);
    });
  };

  return (
    <div
      className="user-filter-panel__multi-select grid gap-2 sm:grid-cols-[minmax(8rem,auto),1fr] sm:items-center"
      ref={containerRef}
    >
      <span className="user-filter-panel__label text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
      <div className="user-filter-panel__select-wrapper relative">
        <button
          id={id}
          type="button"
          className={clsx(
            'user-filter-panel__select-button inline-flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-[#1b1b22] px-4 py-2 text-sm text-surface-foreground shadow-[0_10px_32px_rgba(0,0,0,0.45)] transition',
            open ? 'border-accent text-accent' : 'hover:border-accent/70'
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>{buttonLabel}</span>
          <ChevronDownIcon className={clsx('user-filter-panel__select-icon h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
        {open ? (
          <div
            role="listbox"
            aria-multiselectable
            className="user-filter-panel__options absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 space-y-1 rounded-xl border border-border/60 bg-[#15151b]/95 p-2 shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
          >
            <button
              type="button"
              className="user-filter-panel__options-all flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-white/5"
              onClick={toggleAll}
            >
              <span>すべて</span>
              <CheckIcon
                className={clsx(
                  'user-filter-panel__option-check h-4 w-4',
                  selectedSet.size === allValues.length ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
            <div className="user-filter-panel__options-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            {options.map((option) => {
              const active = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={clsx(
                    'user-filter-panel__option flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
                    active ? 'bg-accent/10 text-surface-foreground' : 'text-muted-foreground hover:bg-white/5'
                  )}
                  onClick={() => toggleValue(option.value)}
                >
                  <span className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description ? (
                      <span className="user-filter-panel__option-description text-[10px] text-muted-foreground/80">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <CheckIcon
                    className={clsx(
                      'user-filter-panel__option-check h-4 w-4 transition',
                      active ? 'opacity-100 text-accent' : 'opacity-0'
                    )}
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: Dispatch<SetStateAction<boolean>>;
  helperText?: string;
}

function ToggleRow({ label, value, onChange, helperText }: ToggleRowProps): JSX.Element {
  const toggle = (): void => onChange((prev) => !prev);

  return (
    <div className="user-filter-panel__toggle-row grid gap-2 sm:grid-cols-[minmax(8rem,auto),1fr] sm:items-center">
      <span className="user-filter-panel__label text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
      <div className="user-filter-panel__toggle-controls flex items-center gap-3">
        {helperText ? <span className="user-filter-panel__toggle-helper text-[11px] text-muted-foreground/80">{helperText}</span> : null}
        <button
          type="button"
          onClick={toggle}
          className={clsx(
            'user-filter-panel__toggle-button relative inline-flex h-6 w-11 items-center rounded-full border border-border/60 bg-[#1b1b22] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1016]',
            value && 'border-accent bg-accent/30'
          )}
          aria-pressed={value}
        >
          <span
            className={clsx(
              'user-filter-panel__toggle-indicator inline-block h-4 w-4 rounded-full bg-white shadow transition-all',
              value ? 'translate-x-[22px]' : 'translate-x-[6px]'
            )}
          />
        </button>
      </div>
    </div>
  );
}

interface UserFilterPanelProps {
  id?: string;
  open?: boolean;
}

export function UserFilterPanel(props?: UserFilterPanelProps): JSX.Element {
  const { id, open = true } = props ?? {};
  const [selectedGachas, setSelectedGachas] = useState<'*' | string[]>('*');
  const [selectedRarities, setSelectedRarities] = useState<'*' | string[]>('*');
  const [hideMiss, setHideMiss] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const [showSkipOnly, setShowSkipOnly] = useState(false);
  const [keyword, setKeyword] = useState('');

  const handleReset = (): void => {
    setSelectedGachas('*');
    setSelectedRarities('*');
    setHideMiss(false);
    setShowCounts(false);
    setShowSkipOnly(false);
    setKeyword('');
  };

  return (
    <section
      id={id}
      aria-hidden={!open}
      data-state={open ? 'open' : 'closed'}
      className={clsx(
        'user-filter-panel space-y-6 rounded-2xl border border-white/5 bg-surface/20 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition-opacity duration-300 ease-linear',
        'data-[state=open]:opacity-100',
        'data-[state=closed]:pointer-events-none data-[state=closed]:select-none data-[state=closed]:opacity-0'
      )}
    >
      <div className="user-filter-panel__controls grid gap-5">
        <MultiSelectFilter
          id="user-filter-gacha"
          label="ガチャ絞り込み"
          options={[
            { value: 'gch-main', label: 'スターブライト', description: 'メインキャンペーン' },
            { value: 'gch-riagu', label: 'リアグガチャ', description: 'リアグ対象のみ' },
            { value: 'gch-dark', label: '闇ガチャ', description: '闇属性キャラクター' }
          ]}
          value={selectedGachas}
          onChange={setSelectedGachas}
        />
        <MultiSelectFilter
          id="user-filter-rarity"
          label="レア度"
          options={[
            { value: 'rar-ssr', label: 'SSR' },
            { value: 'rar-sr', label: 'SR' },
            { value: 'rar-r', label: 'R' },
            { value: 'rar-n', label: 'N' },
            { value: 'rar-miss', label: 'はずれ' }
          ]}
          value={selectedRarities}
          onChange={setSelectedRarities}
        />
        <ToggleRow label="はずれを隠す" value={hideMiss} onChange={setHideMiss} />
        <ToggleRow label="獲得数を表示" value={showCounts} onChange={setShowCounts} />
        <ToggleRow label="リアグのみを表示" value={showSkipOnly} onChange={setShowSkipOnly} />
        <div className="user-filter-panel__search-row grid gap-2 sm:grid-cols-[minmax(8rem,auto),1fr] sm:items-center">
          <span className="user-filter-panel__label text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            ユーザー検索
          </span>
          <label className="user-filter-panel__search-input flex items-center gap-3 rounded-xl border border-border/60 bg-[#1b1b22] px-3 py-2 text-sm text-muted-foreground">
            <MagnifyingGlassIcon className="h-4 w-4" />
            <input
              type="search"
              placeholder="名前で検索"
              value={keyword}
              onChange={(event) => setKeyword(event.currentTarget.value)}
              className="user-filter-panel__search-field w-full bg-transparent text-sm text-surface-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </div>
      </div>
      <div className="user-filter-panel__footer flex justify-end">
        <button
          type="button"
          onClick={handleReset}
          className="user-filter-panel__reset-button inline-flex items-center rounded-xl border border-border/60 bg-[#1b1b22] px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
        >
          フィルタをリセット
        </button>
      </div>
    </section>
  );
}

