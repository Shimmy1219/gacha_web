import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type PtSettingV3 } from '@domain/app-persistence';

import { useStoreValue } from '@domain/stores';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../components/modal';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { RarityTable, type RarityTableRow } from './RarityTable';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityInUseDialog } from '../dialogs/RarityInUseDialog';
import { formatRarityRate, parseRarityRateInput } from '../utils/rarityRate';
import {
  FALLBACK_RARITY_COLOR,
  generateRandomRarityColor,
  generateRandomRarityEmitRate,
  generateRandomRarityLabel
} from '../utils/raritySeed';

interface RarityRow {
  id: string;
  label: string;
  color: string;
  emitRate?: number;
}

interface EmitRateInputStateEntry {
  value: string;
  lastSyncedRate: number | undefined;
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

  const [emitRateInputs, setEmitRateInputs] = useState<Record<string, EmitRateInputStateEntry>>({});

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
    () =>
      rarityRows.map((rarity) => ({
        value: rarity.id,
        label: rarity.label || rarity.id,
        color: rarity.color
      })),
    [rarityRows]
  );

  const tableRows = useMemo<RarityTableRow[]>(
    () =>
      rarityRows.map((rarity) => {
        const entry = emitRateInputs[rarity.id];
        const emitRateInput = entry?.value ?? formatRarityRate(rarity.emitRate);
        return {
          id: rarity.id,
          label: rarity.label,
          color: rarity.color,
          emitRateInput,
          placeholder: rarity.label ? rarity.label : rarity.id
        };
      }),
    [emitRateInputs, rarityRows]
  );

  useEffect(() => {
    setEmitRateInputs((previous) => {
      let changed = false;
      const next: Record<string, EmitRateInputStateEntry> = {};

      rarityRows.forEach((rarity) => {
        const prevEntry = previous[rarity.id];
        const formatted = formatRarityRate(rarity.emitRate);

        if (!prevEntry) {
          next[rarity.id] = { value: formatted, lastSyncedRate: rarity.emitRate };
          changed = true;
          return;
        }

        if (rarity.emitRate !== prevEntry.lastSyncedRate && formatted !== prevEntry.value) {
          next[rarity.id] = { value: formatted, lastSyncedRate: rarity.emitRate };
          changed = true;
          return;
        }

        const shouldUpdateSync = rarity.emitRate !== prevEntry.lastSyncedRate;
        next[rarity.id] = { value: prevEntry.value, lastSyncedRate: rarity.emitRate };
        if (shouldUpdateSync) {
          changed = true;
        }
      });

      if (Object.keys(previous).length !== rarityRows.length) {
        changed = true;
      }

      if (!changed) {
        return previous;
      }

      return next;
    });
  }, [rarityRows]);

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
    (rarityId: string, value: string) => {
      rarityStore.renameRarity(rarityId, value);
    },
    [rarityStore]
  );

  const handleColorChange = useCallback(
    (rarityId: string, next: string) => {
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
    const label = generateRandomRarityLabel(existingLabels);
    const existingColors = new Set(
      rarityRows
        .map((rarity) => rarity.color)
        .filter((color): color is string => Boolean(color))
    );
    const color = generateRandomRarityColor(existingColors);
    const emitRate = generateRandomRarityEmitRate();

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
    (rarityId: string, value: string) => {
      const trimmed = value.trim();
      const parsedRate = parseRarityRateInput(value);

      setEmitRateInputs((previous) => {
        const prevEntry = previous[rarityId];
        let nextSyncedRate = prevEntry?.lastSyncedRate;

        if (trimmed === '') {
          nextSyncedRate = undefined;
        } else if (parsedRate != null) {
          nextSyncedRate = parsedRate;
        }

        return {
          ...previous,
          [rarityId]: {
            value,
            lastSyncedRate: nextSyncedRate
          }
        };
      });

      if (trimmed === '') {
        rarityStore.setRarityEmitRate(rarityId, undefined);
        return;
      }

      if (parsedRate != null) {
        rarityStore.setRarityEmitRate(rarityId, parsedRate);
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
                <RarityTable
                  rows={tableRows}
                  onLabelChange={handleLabelChange}
                  onColorChange={handleColorChange}
                  onEmitRateChange={handleEmitRateChange}
                  onDelete={handleDeleteRarity}
                  onAdd={handleAddRarity}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionContainer>
  );
}
