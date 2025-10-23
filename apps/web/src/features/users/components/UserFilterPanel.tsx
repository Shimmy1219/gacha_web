import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useMemo } from 'react';

import {
  type UserFilterOption,
  useUserFilterController,
  useUserFilterOptions
} from '../logic/userFilters';

import { MultiSelectDropdown } from '@components/form/MultiSelectDropdown';

interface MultiSelectFilterProps {
  id: string;
  label: string;
  options: UserFilterOption[];
  value: '*' | string[];
  onChange: (value: '*' | string[]) => void;
}

function MultiSelectFilter({ id, label, options, value, onChange }: MultiSelectFilterProps): JSX.Element {
  const allValues = useMemo(() => options.map((option) => option.value), [options]);
  const resolvedValues = useMemo(() => (value === '*' ? allValues : value), [allValues, value]);
  const selectedSet = useMemo(() => new Set(resolvedValues), [resolvedValues]);
  const isAllSelected = value === '*' || selectedSet.size === allValues.length;

  const handleValuesChange = (nextValues: string[]): void => {
    if (nextValues.length === 0 || nextValues.length === allValues.length) {
      onChange('*');
      return;
    }
    onChange(nextValues);
  };

  return (
    <div className="user-filter-panel__multi-select grid gap-2 sm:grid-cols-[minmax(8rem,auto),1fr] sm:items-center">
      <span className="user-filter-panel__label text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
      <MultiSelectDropdown
        values={resolvedValues}
        options={options}
        onChange={handleValuesChange}
        onSelectAll={() => onChange('*')}
        onClear={() => onChange([])}
        isAllSelected={isAllSelected}
        placeholder="未選択"
        classNames={{
          root: 'user-filter-panel__select-wrapper',
          button:
            'user-filter-panel__select-button inline-flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-panel-muted px-4 py-2 text-sm text-surface-foreground transition',
          buttonOpen: 'border-accent text-accent',
          buttonClosed: 'hover:border-accent/70',
          icon: 'user-filter-panel__select-icon h-4 w-4 transition-transform',
          iconOpen: 'rotate-180',
          menu:
            'user-filter-panel__options absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-xl border border-border/60 bg-panel/95 p-2 text-xs',
          menuContent: 'space-y-1',
          selectAllButton:
            'user-filter-panel__options-all flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-white/5',
          selectAllLabel: '',
          divider: 'user-filter-panel__options-divider h-px bg-gradient-to-r from-transparent via-white/10 to-transparent',
          option:
            'user-filter-panel__option flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
          optionActive: 'bg-accent/10 text-surface-foreground',
          optionInactive: 'text-muted-foreground hover:bg-white/5',
          optionContent: 'flex flex-col gap-0.5',
          optionLabel: '',
          optionDescription: 'user-filter-panel__option-description text-[10px] text-muted-foreground/80',
          checkIcon: 'user-filter-panel__option-check h-4 w-4 transition text-accent'
        }}
        renderButtonLabel={({ selectedValues }) => {
          if (value === '*' || selectedValues.size === allValues.length) {
            return 'すべて';
          }
          if (selectedValues.size === 0) {
            return '未選択';
          }
          if (selectedValues.size === 1) {
            const [single] = Array.from(selectedValues);
            return options.find((option) => option.value === single)?.label ?? '1項目';
          }
          return `${selectedValues.size}項目`;
        }}
        renderOptionLabel={({ option }) => <span>{option.label}</span>}
        renderOptionDescription={({ option }) => option.description ?? null}
      />
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  helperText?: string;
}

function ToggleRow({ label, value, onChange, helperText }: ToggleRowProps): JSX.Element {
  const toggle = (): void => onChange(!value);

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
            'user-filter-panel__toggle-button relative inline-flex h-6 w-11 items-center rounded-full border border-border/60 bg-panel-muted transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep',
            value && 'border-accent bg-accent/30'
          )}
          aria-pressed={value}
        >
          <span
            className={clsx(
              'user-filter-panel__toggle-indicator inline-block h-4 w-4 rounded-full bg-white transition-all',
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
  const { gachaOptions, rarityOptions } = useUserFilterOptions();
  const { state, setSelectedGachaIds, setSelectedRarityIds, setHideMiss, setShowCounts, setShowSkipOnly, setKeyword, reset } =
    useUserFilterController();

  return (
    <section
      id={id}
      aria-hidden={!open}
      data-state={open ? 'open' : 'closed'}
      className={clsx(
        'user-filter-panel space-y-6 rounded-2xl border border-white/5 bg-surface/20 p-5 transition-opacity duration-300 ease-linear',
        'data-[state=open]:opacity-100',
        'data-[state=closed]:pointer-events-none data-[state=closed]:select-none data-[state=closed]:opacity-0'
      )}
    >
      <div className="user-filter-panel__controls grid gap-5">
        <MultiSelectFilter
          id="user-filter-gacha"
          label="ガチャ絞り込み"
          options={gachaOptions}
          value={state.selectedGachaIds}
          onChange={setSelectedGachaIds}
        />
        <MultiSelectFilter
          id="user-filter-rarity"
          label="レア度"
          options={rarityOptions}
          value={state.selectedRarityIds}
          onChange={setSelectedRarityIds}
        />
        <ToggleRow label="はずれを隠す" value={state.hideMiss} onChange={setHideMiss} />
        <ToggleRow label="獲得数を表示" value={state.showCounts} onChange={setShowCounts} />
        <ToggleRow label="リアグのみを表示" value={state.showSkipOnly} onChange={setShowSkipOnly} />
        <div className="user-filter-panel__search-row grid gap-2 sm:grid-cols-[minmax(8rem,auto),1fr] sm:items-center">
          <span className="user-filter-panel__label text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            ユーザー検索
          </span>
          <label className="user-filter-panel__search-input flex items-center gap-3 rounded-xl border border-border/60 bg-panel-muted px-3 py-2 text-sm text-muted-foreground">
            <MagnifyingGlassIcon className="h-4 w-4" />
            <input
              type="search"
              placeholder="名前で検索"
              value={state.keyword}
              onChange={(event) => setKeyword(event.currentTarget.value)}
              className="user-filter-panel__search-field w-full bg-transparent text-sm text-surface-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </div>
      </div>
      <div className="user-filter-panel__footer flex justify-end">
        <button
          type="button"
          onClick={reset}
          className="user-filter-panel__reset-button inline-flex items-center rounded-xl border border-border/60 bg-panel-muted px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
        >
          フィルタをリセット
        </button>
      </div>
    </section>
  );
}

