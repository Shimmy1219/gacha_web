import { clsx } from 'clsx';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { type PtSettingV3 } from '@domain/app-persistence';

import { useStoreValue } from '@domain/stores';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../components/modal';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityColorPicker } from './color-picker/RarityColorPicker';
import { DEFAULT_PALETTE } from './color-picker/palette';
import { getRarityTextPresentation } from '../utils/rarityColorPresentation';
import { RarityInUseDialog } from '../dialogs/RarityInUseDialog';

interface RarityRow {
  id: string;
  label: string;
  color: string;
  emitRate?: number;
}

const FALLBACK_RARITY_COLOR = '#3f3f46';

const RARITY_LABEL_OPTIONS = ['SR', 'UR', 'SSR', 'N', 'AR', 'NR', 'USR', 'SSSR', 'HR', 'はずれ'];

function generateFallbackLabel(existing: Set<string>): string {
  let counter = existing.size + 1;
  let fallback = `レアリティ${counter}`;
  while (existing.has(fallback)) {
    counter += 1;
    fallback = `レアリティ${counter}`;
  }
  return fallback;
}

function generateRandomLabel(existing: Set<string>): string {
  const trimmedExisting = new Set(
    Array.from(existing)
      .map((label) => label.trim())
      .filter((label): label is string => label.length > 0)
  );
  const unused = RARITY_LABEL_OPTIONS.filter((label) => !trimmedExisting.has(label));
  if (unused.length > 0) {
    const index = Math.floor(Math.random() * unused.length);
    return unused[index] ?? generateFallbackLabel(trimmedExisting);
  }

  return generateFallbackLabel(trimmedExisting);
}

function generateRandomPaletteColor(existingColors: Set<string>): string {
  const normalizedExisting = new Set(
    Array.from(existingColors)
      .map((color) => color.trim().toLowerCase())
      .filter((value): value is string => value.length > 0)
  );

  const unused = DEFAULT_PALETTE.filter(
    (option) => !normalizedExisting.has(option.value.trim().toLowerCase())
  );

  const pool = unused.length > 0 ? unused : DEFAULT_PALETTE;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected?.value ?? FALLBACK_RARITY_COLOR;
}

function generateRandomEmitRate(): number {
  const minPercent = 0.5;
  const maxPercent = 5;
  const percent = Math.random() * (maxPercent - minPercent) + minPercent;
  const rounded = Math.round(percent * 100) / 100;
  return rounded / 100;
}

function formatRate(rate?: number): string {
  if (rate == null || Number.isNaN(rate)) {
    return '';
  }

  const percent = rate * 100;
  if (!Number.isFinite(percent)) {
    return '';
  }

  if (percent === 0) {
    return '0';
  }

  const absPercent = Math.abs(percent);
  let maximumFractionDigits = 2;
  if (absPercent < 0.0001) {
    maximumFractionDigits = 8;
  } else if (absPercent < 0.01) {
    maximumFractionDigits = 6;
  } else if (absPercent < 1) {
    maximumFractionDigits = 6;
  } else if (absPercent < 10) {
    maximumFractionDigits = 4;
  } else if (absPercent < 100) {
    maximumFractionDigits = 2;
  } else {
    maximumFractionDigits = 0;
  }

  return new Intl.NumberFormat('ja-JP', {
    useGrouping: false,
    maximumFractionDigits
  }).format(percent);
}

function parseRateInput(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return null;
  }

  const clamped = Math.min(Math.max(parsed, 0), 100);
  return clamped / 100;
}

export function RaritySection(): JSX.Element {
  const {
    appState: appStateStore,
    rarities: rarityStore,
    ptControls: ptControlsStore,
    catalog: catalogStore
  } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const rarityState = useStoreValue(rarityStore);
  const ptSettingsState = useStoreValue(ptControlsStore);
  const catalogState = useStoreValue(catalogStore);
  const { push } = useModal();

  const status = appStateStore.isHydrated() && rarityStore.isHydrated() ? 'ready' : 'loading';

  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);

  useEffect(() => {
    const availableIds = appState?.order ?? [];
    if (availableIds.length === 0) {
      setActiveGachaId(null);
      return;
    }

    setActiveGachaId((current) => {
      if (current && availableIds.includes(current)) {
        return current;
      }
      if (appState?.selectedGachaId && availableIds.includes(appState.selectedGachaId)) {
        return appState.selectedGachaId;
      }
      return availableIds[0];
    });
  }, [appState]);

  const gachaTabs = useMemo(() => {
    if (!appState) {
      return [] as Array<{ id: string; label: string }>;
    }

    const ordered = appState.order ?? [];
    return ordered.map((gachaId) => ({
      id: gachaId,
      label: appState.meta?.[gachaId]?.displayName ?? gachaId
    }));
  }, [appState]);

  const gachaTabIds = useMemo(() => gachaTabs.map((gacha) => gacha.id), [gachaTabs]);
  const panelMotion = useTabMotion(activeGachaId, gachaTabIds);
  const panelAnimationClass = clsx(
    'tab-panel-content',
    panelMotion === 'forward' && 'animate-tab-slide-from-right',
    panelMotion === 'backward' && 'animate-tab-slide-from-left'
  );

  const rarityRows = useMemo(() => {
    if (!rarityState || !activeGachaId) {
      return [] as RarityRow[];
    }

    const rarityIds = rarityState.byGacha?.[activeGachaId] ?? [];
    return rarityIds
      .map((rarityId) => {
        const entity = rarityState.entities?.[rarityId];
        if (!entity) {
          return null;
        }
        return {
          id: entity.id,
          label: entity.label ?? '',
          color: entity.color ?? FALLBACK_RARITY_COLOR,
          emitRate: entity.emitRate
        };
      })
      .filter((entry): entry is RarityRow => Boolean(entry));
  }, [activeGachaId, rarityState]);

  const rarityOptions = useMemo(
    () => rarityRows.map((rarity) => ({ value: rarity.id, label: rarity.label || rarity.id })),
    [rarityRows]
  );

  const ptSettings = activeGachaId ? ptSettingsState?.byGachaId?.[activeGachaId] : undefined;

  const handlePtSettingsChange = useCallback(
    (next: PtSettingV3 | undefined) => {
      if (!activeGachaId) {
        return;
      }
      ptControlsStore.setGachaSettings(activeGachaId, next);
    },
    [activeGachaId, ptControlsStore]
  );

  const handleLabelChange = useCallback(
    (rarityId: string) => (event: ChangeEvent<HTMLInputElement>) => {
      rarityStore.renameRarity(rarityId, event.target.value);
    },
    [rarityStore]
  );

  const handleColorChange = useCallback(
    (rarityId: string) => (next: string) => {
      rarityStore.setRarityColor(rarityId, next);
    },
    [rarityStore]
  );

  const handleAddRarity = useCallback(() => {
    if (!activeGachaId) {
      return;
    }

    const existingLabels = new Set(
      rarityRows.map((rarity) => rarity.label).filter((label): label is string => Boolean(label))
    );
    const label = generateRandomLabel(existingLabels);
    const existingColors = new Set(
      rarityRows
        .map((rarity) => rarity.color)
        .filter((color): color is string => Boolean(color))
    );
    const color = generateRandomPaletteColor(existingColors);
    const emitRate = generateRandomEmitRate();

    const createdId = rarityStore.addRarity(activeGachaId, {
      label,
      color,
      emitRate
    });

    if (!createdId) {
      console.warn('レアリティの追加に失敗しました', { gachaId: activeGachaId });
    }
  }, [activeGachaId, rarityRows, rarityStore]);

  const handleEmitRateChange = useCallback(
    (rarityId: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      if (rawValue.trim() === '') {
        rarityStore.setRarityEmitRate(rarityId, undefined);
        return;
      }

      const nextRate = parseRateInput(rawValue);
      if (nextRate != null) {
        rarityStore.setRarityEmitRate(rarityId, nextRate);
      }
    },
    [rarityStore]
  );

  const handleDeleteRarity = useCallback(
    (rarityId: string) => {
      const entity = rarityState?.entities?.[rarityId];

      if (!entity) {
        rarityStore.removeRarity(rarityId);
        return;
      }

      const catalog = catalogState?.byGacha?.[entity.gachaId];
      const itemsUsing = catalog
        ? Object.values(catalog.items ?? {}).filter((item) => item?.rarityId === rarityId)
        : [];

      if (itemsUsing.length > 0) {
        const itemNames = itemsUsing
          .map((item) => item?.name || item?.itemId)
          .filter((value): value is string => Boolean(value));

        push(RarityInUseDialog, {
          id: 'rarity-in-use',
          title: 'レアリティを削除できません',
          size: 'sm',
          payload: {
            rarityLabel: entity.label || entity.id,
            affectedCount: itemsUsing.length,
            itemNames
          }
        });
        return;
      }

      rarityStore.removeRarity(rarityId);
    },
    [catalogState, push, rarityState, rarityStore]
  );

  const shouldRenderTable = Boolean(activeGachaId);

  return (
    <SectionContainer
      id="rarity"
      title="レアリティ設定"
      description="排出率・カラー・順序を編集し、RarityStoreと同期します。"
      contentClassName="rarity-section__content"
    >
      <div className="rarity-section__gacha-tabs tab-scroll-area">
        {gachaTabs.map((gacha) => (
          <button
            key={gacha.id}
            type="button"
            className={clsx(
              'rarity-section__gacha-tab tab-pill shrink-0 rounded-full border px-4 py-1.5',
              gacha.id === activeGachaId
                ? 'border-accent/80 bg-accent text-accent-foreground'
                : 'border-border/40 text-muted-foreground hover:border-accent/60'
            )}
            onClick={() => setActiveGachaId(gacha.id)}
          >
            {gacha.label}
          </button>
        ))}
      </div>

      <div className="rarity-section__scroll section-scroll flex-1">
        <div className="rarity-section__scroll-content space-y-4">
          <PtControlsPanel
            settings={ptSettings}
            rarityOptions={rarityOptions.length > 0 ? rarityOptions : [{ value: '', label: 'レアリティ未設定' }]}
            onSettingsChange={handlePtSettingsChange}
          />

          {status !== 'ready' ? (
            <p className="text-sm text-muted-foreground">ローカルストレージからレアリティ情報を読み込み中です…</p>
          ) : null}
          {status === 'ready' && activeGachaId && rarityRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">選択中のガチャにレアリティが登録されていません。</p>
          ) : null}

          <div className="tab-panel-viewport">
            <div
              key={activeGachaId ?? 'rarity-empty'}
              className={panelAnimationClass}
            >
              {shouldRenderTable ? (
                <div className="rarity-section__table-wrapper overflow-hidden rounded-2xl border border-border/60">
                  <table className="rarity-section__table w-full border-separate border-spacing-0 divide-y divide-border/60 text-left">
                    <colgroup>
                      <col className="rarity-section__col rarity-section__col-label" />
                      <col className="rarity-section__col rarity-section__col-color" />
                      <col className="rarity-section__col rarity-section__col-rate" />
                      <col className="rarity-section__col rarity-section__col-actions" />
                    </colgroup>
                    <thead className="rarity-section__table-head bg-[#121218] text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      <tr>
                        <th className="rarity-section__column rarity-section__column-label px-[3px] py-2.5 font-semibold">
                          レアリティ
                        </th>
                        <th className="rarity-section__column rarity-section__column-color py-2.5 font-semibold">
                          カラー
                        </th>
                        <th className="rarity-section__column rarity-section__column-rate py-2.5 font-semibold">
                          排出率
                        </th>
                        <th className="rarity-section__column rarity-section__column-actions py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="rarity-section__table-body divide-y divide-border/40 bg-surface/60">
                      {rarityRows.map((rarity) => {
                        const presentation = getRarityTextPresentation(rarity.color);
                        return (
                          <tr key={rarity.id} className="rarity-section__row text-sm text-surface-foreground">
                            <td className="rarity-section__cell rarity-section__cell-label px-[3px] py-2">
                              <input
                                type="text"
                                value={rarity.label}
                                onChange={handleLabelChange(rarity.id)}
                                className={clsx(
                                  'rarity-section__label-input w-full rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 text-sm transition focus:border-accent focus:outline-none',
                                  presentation.className ?? 'text-surface-foreground'
                                )}
                                style={presentation.style}
                                aria-label={`${rarity.label || rarity.id} のレアリティ名`}
                                placeholder={rarity.label || rarity.id}
                              />
                            </td>
                            <td className="rarity-section__cell rarity-section__cell-color py-2">
                              <RarityColorPicker
                                value={rarity.color}
                                ariaLabel={`${rarity.label || rarity.id} のカラー`}
                                onChange={handleColorChange(rarity.id)}
                              />
                            </td>
                            <td className="rarity-section__cell rarity-section__cell-rate py-2">
                              <div className="rarity-section__rate-control flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  inputMode="decimal"
                                  step="any"
                                  key={`${rarity.id}-${rarity.emitRate ?? 'unset'}`}
                                  defaultValue={formatRate(rarity.emitRate)}
                                  onChange={handleEmitRateChange(rarity.id)}
                                  className="rarity-section__rate-input flex-1 min-w-[6ch] rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none"
                                />
                                <span className="rarity-section__rate-unit text-xs text-muted-foreground">%</span>
                              </div>
                            </td>
                            <td className="rarity-section__cell rarity-section__cell-actions py-2 text-right">
                              <button
                                type="button"
                                className="rarity-section__delete-button inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                                onClick={() => handleDeleteRarity(rarity.id)}
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="rarity-section__add-row">
                        <td className="rarity-section__cell px-[3px] py-3" colSpan={4}>
                          <button
                            type="button"
                            className="rarity-section__add-button inline-flex w-full items-center justify-center rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-sm text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                            onClick={handleAddRarity}
                          >
                            追加
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
