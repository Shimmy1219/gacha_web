import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type PtSettingV3 } from '@domain/app-persistence';

import { useStoreValue } from '@domain/stores';

import { SectionContainer } from '../layout/SectionContainer';
import { useModal } from '../../../../modals';
import { useTabMotion } from '../../../../hooks/useTabMotion';
import { useDomainStores } from '../../../../features/storage/AppPersistenceProvider';
import { RarityTable, type RarityTableRow } from './RarityTable';
import { GachaTabs, type GachaTabOption } from '../common/GachaTabs';
import { useGachaDeletion } from '../../../../features/gacha/hooks/useGachaDeletion';
import { PtControlsPanel } from './PtControlsPanel';
import { RarityInUseDialog } from '../../../../modals/dialogs/RarityInUseDialog';
import { RarityRateErrorDialog } from '../../../../modals/dialogs/RarityRateErrorDialog';
import { RaritySimulationDialog } from '../../../../modals/dialogs/RaritySimulationDialog';
import { formatRarityRate } from '../../../../features/rarity/utils/rarityRate';
import { getAutoAdjustRarityId, sortRarityRows, type RarityRateRow } from '../../../../logic/rarityTable';
import {
  FALLBACK_RARITY_COLOR,
  generateRandomRarityColor,
  generateRandomRarityEmitRate,
  generateRandomRarityLabel
} from '../../../../features/rarity/utils/raritySeed';
import { useRarityTableController } from '../../../../features/rarity/hooks/useRarityTableController';

interface RarityRow extends RarityRateRow {
  id: string;
  label: string;
  color: string;
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
    const availableIds = (appState?.order ?? []).filter((id) => appState?.meta?.[id]?.isArchived !== true);
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

    const ordered = (appState.order ?? []).filter((gachaId) => appState.meta?.[gachaId]?.isArchived !== true);
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

  const guaranteeItemOptions = useMemo(() => {
    if (!catalogState || !activeGachaId) {
      return new Map<string, { value: string; label: string }[]>();
    }

    const snapshot = catalogState.byGacha?.[activeGachaId];
    if (!snapshot) {
      return new Map<string, { value: string; label: string }[]>();
    }

    const orderIndex = new Map<string, number>();
    (snapshot.order ?? []).forEach((itemId, index) => {
      orderIndex.set(itemId, index);
    });

    const map = new Map<string, { value: string; label: string }[]>();

    Object.values(snapshot.items ?? {}).forEach((item) => {
      if (!item) {
        return;
      }
      const rarityId = item.rarityId?.trim();
      if (!rarityId) {
        return;
      }
      const entryLabel = item.name?.trim() || item.itemId;
      const list = map.get(rarityId) ?? [];
      list.push({ value: item.itemId, label: entryLabel });
      map.set(rarityId, list);
    });

    map.forEach((list) => {
      list.sort((a, b) => {
        const orderA = orderIndex.get(a.value) ?? Number.POSITIVE_INFINITY;
        const orderB = orderIndex.get(b.value) ?? Number.POSITIVE_INFINITY;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.label.localeCompare(b.label, 'ja');
      });
    });

    return map;
  }, [activeGachaId, catalogState]);

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

  const handleOpenSimulation = useCallback(() => {
    if (!activeGachaId) {
      return;
    }

    push(RaritySimulationDialog, {
      id: `rarity-simulation-${activeGachaId}`,
      title: '実質排出率のシミュレーション',
      description: '現在の排出率から、指定連数での実質排出率をシミュレートします。',
      size: 'md',
      payload: {
        rarities: sortedRarityRows.map((rarity) => ({
          id: rarity.id,
          label: rarity.label,
          color: rarity.color,
          emitRate: rarity.emitRate
        })),
        defaultDrawCount: 10,
        defaultTargetCount: 1
      }
    });
  }, [activeGachaId, push, sortedRarityRows]);

  const { emitRateInputs, handleEmitRateInputChange, handleEmitRateInputCommit } =
    useRarityTableController({
      rows: rarityRows,
      autoAdjustRarityId,
      onApplyRateUpdates: (updates) => {
        updates.forEach(({ rarityId: targetId, emitRate: nextEmitRate }) => {
          rarityStore.setRarityEmitRate(targetId, nextEmitRate);
        });
      },
      onAutoAdjustRate: (rarityId, rate) => {
        rarityStore.setRarityEmitRate(rarityId, rate);
      },
      onPrecisionExceeded: ({ fractionDigits, input }) => {
        push(RarityRateErrorDialog, {
          id: 'rarity-rate-error',
          size: 'sm',
          intent: 'warning',
          payload: {
            reason: 'precision-exceeded',
            detail: `入力値「${input}」は小数点以下が${fractionDigits}桁あります。`
          }
        });
      },
      onTotalExceedsLimit: (error) => {
        const detail = `他のレアリティの合計が${formatRarityRate(error.total)}%になっています。`;
        push(RarityRateErrorDialog, {
          id: 'rarity-rate-error',
          title: '排出率エラー',
          size: 'sm',
          intent: 'warning',
          payload: { detail }
        });
      }
    });

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
          intent: 'warning',
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
      description="排出率は10^-10%まで対応しています。"
      contentClassName="rarity-section__content"
    >
      <GachaTabs
        tabs={gachaTabs}
        activeId={activeGachaId}
        onSelect={(gachaId) => setActiveGachaId(gachaId)}
        onDelete={(tab) => confirmDeleteGacha(tab)}
        className="rarity-section__gacha-tabs"
      />

      <div className="rarity-section__scroll section-scroll flex-1 tab-panel-viewport">
        <div
          key={activeGachaId ?? 'rarity-empty'}
          className={clsx('rarity-section__scroll-content space-y-4', panelAnimationClass)}
        >
          <PtControlsPanel
            settings={ptSettings}
            rarityOptions={rarityOptions.length > 0 ? rarityOptions : [{ value: '', label: 'レアリティ未設定' }]}
            itemOptionsByRarity={guaranteeItemOptions}
            onSettingsChange={handlePtSettingsChange}
          />

          {status !== 'ready' ? (
            <p className="text-sm text-muted-foreground">ローカルストレージからレアリティ情報を読み込み中です…</p>
          ) : null}
          {status === 'ready' && activeGachaId && rarityRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">選択中のガチャにレアリティが登録されていません。</p>
          ) : null}
          {shouldRenderTable ? (
            <RarityTable
              rows={tableRows}
              onLabelChange={handleLabelChange}
              onColorChange={handleColorChange}
              onEmitRateChange={handleEmitRateInputChange}
              onEmitRateCommit={handleEmitRateInputCommit}
              onDelete={handleDeleteRarity}
              onAdd={handleAddRarity}
              onSimulation={handleOpenSimulation}
            />
          ) : null}
        </div>
      </div>
    </SectionContainer>
  );
}
