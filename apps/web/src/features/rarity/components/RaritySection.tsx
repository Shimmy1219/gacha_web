import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type PtSettingV3 } from '@domain/app-persistence';

import { useStoreValue } from '@domain/stores';

import { SectionContainer } from '../../../components/layout/SectionContainer';
import { useModal } from '../../../modals';
import { useTabMotion } from '../../../hooks/useTabMotion';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { RarityTable, type RarityTableRow } from './RarityTable';
import { GachaTabs, type GachaTabOption } from '../../gacha/components/GachaTabs';
import { useGachaDeletion } from '../../gacha/hooks/useGachaDeletion';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityInUseDialog } from '../../../modals/dialogs/RarityInUseDialog';
import { RarityRateErrorDialog } from '../../../modals/dialogs/RarityRateErrorDialog';
import { formatRarityRate, parseRarityRateInput } from '../utils/rarityRate';
import {
  RATE_TOLERANCE,
  buildEmitRateUpdates,
  computeAutoAdjustRate,
  getAutoAdjustRarityId,
  sortRarityRows,
  type RarityRateRow
} from '../../../logic/rarityTable';
import {
  FALLBACK_RARITY_COLOR,
  generateRandomRarityColor,
  generateRandomRarityEmitRate,
  generateRandomRarityLabel
} from '../utils/raritySeed';

interface RarityRow extends RarityRateRow {
  id: string;
  label: string;
  color: string;
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
  const confirmDeleteGacha = useGachaDeletion();

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

  const gachaTabs = useMemo<GachaTabOption[]>(() => {
    if (!appState) {
      return [];
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
          emitRate: entity.emitRate,
          sortOrder: typeof entity.sortOrder === 'number' ? entity.sortOrder : undefined
        };
      })
      .filter((entry): entry is RarityRow => Boolean(entry));
  }, [activeGachaId, rarityState]);

  const sortedRarityRows = useMemo(() => sortRarityRows(rarityRows), [rarityRows]);

  const autoAdjustRarityId = useMemo(
    () => getAutoAdjustRarityId(sortedRarityRows),
    [sortedRarityRows]
  );

  const rarityOptions = useMemo(
    () =>
      sortedRarityRows.map((rarity) => ({
        value: rarity.id,
        label: rarity.label || rarity.id,
        color: rarity.color
      })),
    [sortedRarityRows]
  );

  const tableRows = useMemo<RarityTableRow[]>(() => {
    const hasAutoAdjust = autoAdjustRarityId != null && sortedRarityRows.length > 1;
    return sortedRarityRows.map((rarity) => {
      const entry = emitRateInputs[rarity.id];
      const emitRateInput = entry?.value ?? formatRarityRate(rarity.emitRate);
      const isAutoAdjust = hasAutoAdjust && rarity.id === autoAdjustRarityId;
      const emitRateAriaLabel = `${rarity.label || rarity.id} の排出率${
        isAutoAdjust ? '（自動調整）' : ''
      }`;

      return {
        id: rarity.id,
        label: rarity.label,
        color: rarity.color,
        emitRateInput,
        placeholder: rarity.label ? rarity.label : rarity.id,
        emitRateAriaLabel,
        isEmitRateReadOnly: isAutoAdjust
      };
    });
  }, [autoAdjustRarityId, emitRateInputs, sortedRarityRows]);

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

  useEffect(() => {
    if (!autoAdjustRarityId) {
      return;
    }

    const computation = computeAutoAdjustRate(rarityRows, autoAdjustRarityId);
    if (!computation) {
      return;
    }

    const autoAdjustRow = rarityRows.find((rarity) => rarity.id === autoAdjustRarityId);
    const currentRate = autoAdjustRow?.emitRate ?? 0;

    if (Math.abs(currentRate - computation.desiredRate) > RATE_TOLERANCE) {
      rarityStore.setRarityEmitRate(autoAdjustRarityId, computation.desiredRate);
    }
  }, [autoAdjustRarityId, rarityRows, rarityStore]);

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

  const revertEmitRateInput = useCallback(
    (rarityId: string) => {
      const previousRow = rarityRows.find((row) => row.id === rarityId);
      const previousRate = previousRow?.emitRate;
      const formatted = formatRarityRate(previousRate);
      setEmitRateInputs((previousInputs) => ({
        ...previousInputs,
        [rarityId]: {
          value: formatted,
          lastSyncedRate: previousRate
        }
      }));
    },
    [rarityRows]
  );

  const handleEmitRateInputChange = useCallback(
    (rarityId: string, value: string) => {
      const previousRow = rarityRows.find((row) => row.id === rarityId);
      const fallbackRate = previousRow?.emitRate;
      setEmitRateInputs((previousInputs) => {
        const prevEntry = previousInputs[rarityId];
        const nextSyncedRate = prevEntry?.lastSyncedRate ?? fallbackRate;
        return {
          ...previousInputs,
          [rarityId]: {
            value,
            lastSyncedRate: nextSyncedRate
          }
        };
      });
    },
    [rarityRows]
  );

  const handleEmitRateInputCommit = useCallback(
    (rarityId: string) => {
      const entry = emitRateInputs[rarityId];
      const value = entry?.value ?? '';
      const trimmed = value.trim();
      const parsedRate = trimmed === '' ? null : parseRarityRateInput(value);

      if (trimmed !== '' && parsedRate == null) {
        revertEmitRateInput(rarityId);
        return;
      }

      const nextRate = trimmed === '' ? undefined : parsedRate ?? undefined;
      const previousRow = rarityRows.find((row) => row.id === rarityId);
      const currentRate = previousRow?.emitRate;
      const sanitizedValue = formatRarityRate(nextRate);

      const noChange =
        (nextRate == null && currentRate == null) ||
        (nextRate != null && currentRate != null && Math.abs(currentRate - nextRate) <= RATE_TOLERANCE);

      if (noChange) {
        setEmitRateInputs((previousInputs) => {
          const prevEntry = previousInputs[rarityId];
          if (prevEntry?.value === sanitizedValue && prevEntry?.lastSyncedRate === nextRate) {
            return previousInputs;
          }
          return {
            ...previousInputs,
            [rarityId]: {
              value: sanitizedValue,
              lastSyncedRate: nextRate
            }
          };
        });
        return;
      }

      const result = buildEmitRateUpdates({
        rarityId,
        nextRate,
        autoAdjustRarityId,
        rows: rarityRows
      });

      if (result.error) {
        revertEmitRateInput(rarityId);
        if (result.error.type === 'total-exceeds-limit') {
          const detail = `他のレアリティの合計が${formatRarityRate(result.error.total)}%になっています。`;
          push(RarityRateErrorDialog, {
            id: 'rarity-rate-error',
            size: 'sm',
            payload: { detail }
          });
        }
        return;
      }

      result.updates.forEach(({ rarityId: targetId, emitRate: nextEmitRate }) => {
        rarityStore.setRarityEmitRate(targetId, nextEmitRate);
      });

      setEmitRateInputs((previousInputs) => ({
        ...previousInputs,
        [rarityId]: {
          value: sanitizedValue,
          lastSyncedRate: nextRate
        }
      }));

      if (result.autoAdjustRate != null && autoAdjustRarityId) {
        setEmitRateInputs((previousInputs) => {
          const prevEntry = previousInputs[autoAdjustRarityId];
          const formatted = formatRarityRate(result.autoAdjustRate);
          if (
            prevEntry &&
            prevEntry.value === formatted &&
            Math.abs((prevEntry.lastSyncedRate ?? 0) - result.autoAdjustRate) <= RATE_TOLERANCE
          ) {
            return previousInputs;
          }

          return {
            ...previousInputs,
            [autoAdjustRarityId]: {
              value: formatted,
              lastSyncedRate: result.autoAdjustRate
            }
          };
        });
      }
    },
    [autoAdjustRarityId, emitRateInputs, push, rarityRows, rarityStore, revertEmitRateInput]
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
      <GachaTabs
        tabs={gachaTabs}
        activeId={activeGachaId}
        onSelect={(gachaId) => setActiveGachaId(gachaId)}
        onDelete={(tab) => confirmDeleteGacha(tab)}
        className="rarity-section__gacha-tabs"
      />

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
                  onEmitRateChange={handleEmitRateInputChange}
                  onEmitRateCommit={handleEmitRateInputCommit}
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
