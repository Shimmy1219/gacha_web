import { clsx } from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type PtSettingV3 } from '@domain/app-persistence';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';

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
import { ItemPreview } from '../../../../components/ItemPreviewThumbnail';
import { validateGachaThumbnailFile } from '../../../../features/gacha/gachaThumbnail';
import { useDiscordSession } from '../../../../features/discord/useDiscordSession';
import {
  deleteGachaThumbnailFromBlob,
  uploadGachaThumbnailToBlob
} from '../../../../features/gacha/thumbnailBlobApi';

interface RarityRow extends RarityRateRow {
  id: string;
  label: string;
  color: string;
}

interface RaritySectionProps {
  onRegisterGacha?: () => void;
}

export function RaritySection({ onRegisterGacha }: RaritySectionProps): JSX.Element {
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
  const { data: discordSession } = useDiscordSession();

  const status = appStateStore.isHydrated() && rarityStore.isHydrated() ? 'ready' : 'loading';

  const [activeGachaId, setActiveGachaId] = useState<string | null>(null);
  const [isUpdatingThumbnail, setIsUpdatingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const gachaThumbnailInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    setThumbnailError(null);
  }, [activeGachaId]);

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

  const activeGachaMeta = activeGachaId ? appState?.meta?.[activeGachaId] : undefined;
  const activeGachaName = activeGachaMeta?.displayName ?? activeGachaId ?? 'ガチャ未選択';
  const activeGachaThumbnailAssetId = activeGachaMeta?.thumbnailAssetId ?? null;
  const activeGachaThumbnailBlobUrl = activeGachaMeta?.thumbnailBlobUrl ?? null;
  const hasActiveGachaThumbnail = Boolean(activeGachaThumbnailAssetId || activeGachaThumbnailBlobUrl);

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

  const handleRequestGachaThumbnailSelection = useCallback(() => {
    if (!activeGachaId || isUpdatingThumbnail) {
      return;
    }
    gachaThumbnailInputRef.current?.click();
  }, [activeGachaId, isUpdatingThumbnail]);

  const handleSelectGachaThumbnail = useCallback(
    async (fileList: FileList | null) => {
      const targetGachaId = activeGachaId;
      const file = fileList?.[0];
      if (!targetGachaId || !file) {
        return;
      }

      if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
        setThumbnailError('この環境では画像を保存できません。');
        return;
      }

      setIsUpdatingThumbnail(true);
      setThumbnailError(null);
      let createdAssetId: string | null = null;
      let uploadedThumbnail: {
        ownerId: string;
        url: string;
        updatedAt: string | null;
      } | null = null;

      try {
        // 受け取り画面・設定画面との見た目統一のため、形式を先に厳密チェックする。
        const validation = await validateGachaThumbnailFile(file);
        if (!validation.ok) {
          setThumbnailError(validation.message ?? '配信サムネイルの検証に失敗しました。');
          return;
        }

        const previousMeta = appStateStore.getState()?.meta?.[targetGachaId];
        const previousAssetId = previousMeta?.thumbnailAssetId ?? null;
        const previousOwnerId =
          typeof previousMeta?.thumbnailOwnerId === 'string' && previousMeta.thumbnailOwnerId.length > 0
            ? previousMeta.thumbnailOwnerId
            : null;
        const saved = await saveAsset(file);
        createdAssetId = saved.id;
        uploadedThumbnail = await uploadGachaThumbnailToBlob({
          gachaId: targetGachaId,
          file,
          ownerName: activeGachaName,
          discordUserId: discordSession?.user?.id ?? null
        });
        const timestamp = new Date().toISOString();
        let updated = false;

        appStateStore.update(
          (previous) => {
            if (!previous?.meta?.[targetGachaId]) {
              return previous;
            }

            updated = true;
            const nextMeta = {
              ...(previous.meta ?? {}),
              [targetGachaId]: {
                ...previous.meta[targetGachaId],
                id: previous.meta[targetGachaId]?.id ?? targetGachaId,
                displayName: previous.meta[targetGachaId]?.displayName ?? targetGachaId,
                thumbnailAssetId: saved.id,
                thumbnailBlobUrl: uploadedThumbnail.url,
                thumbnailOwnerId: uploadedThumbnail.ownerId,
                thumbnailUpdatedAt: uploadedThumbnail.updatedAt ?? timestamp,
                updatedAt: timestamp
              }
            };

            return {
              ...previous,
              updatedAt: timestamp,
              meta: nextMeta
            };
          },
          { persist: 'immediate' }
        );

        if (!updated) {
          throw new Error(`ガチャ ${targetGachaId} が見つからないためサムネイルを更新できませんでした。`);
        }

        if (
          typeof previousAssetId === 'string' &&
          previousAssetId.length > 0 &&
          previousAssetId !== saved.id
        ) {
          // 置き換え完了後に旧アセットを削除し、不要データの蓄積を防ぐ。
          void deleteAsset(previousAssetId);
        }
        if (previousOwnerId && previousOwnerId !== uploadedThumbnail.ownerId) {
          try {
            await deleteGachaThumbnailFromBlob({
              gachaId: targetGachaId,
              ownerId: previousOwnerId,
              discordUserId: discordSession?.user?.id ?? null
            });
          } catch (cleanupError) {
            // メイン更新は完了しているため、旧owner側の掃除失敗は警告ログに留める。
            console.warn('Failed to cleanup old gacha thumbnail owner record', {
              gachaId: targetGachaId,
              previousOwnerId,
              cleanupError
            });
          }
        }

        createdAssetId = null;
      } catch (error) {
        console.error('ガチャサムネイルの更新に失敗しました', { gachaId: targetGachaId, error });
        setThumbnailError('ガチャサムネイルの更新に失敗しました。もう一度お試しください。');
        if (createdAssetId) {
          void deleteAsset(createdAssetId);
        }
        if (uploadedThumbnail?.ownerId) {
          try {
            await deleteGachaThumbnailFromBlob({
              gachaId: targetGachaId,
              ownerId: uploadedThumbnail.ownerId,
              discordUserId: discordSession?.user?.id ?? null
            });
          } catch (cleanupError) {
            console.warn('Failed to rollback uploaded gacha thumbnail after update error', {
              gachaId: targetGachaId,
              cleanupError
            });
          }
        }
      } finally {
        setIsUpdatingThumbnail(false);
      }
    },
    [activeGachaId, activeGachaName, appStateStore, discordSession?.user?.id]
  );

  const handleRemoveGachaThumbnail = useCallback(async () => {
    const targetGachaId = activeGachaId;
    if (!targetGachaId || isUpdatingThumbnail) {
      return;
    }

    const previousMeta = appStateStore.getState()?.meta?.[targetGachaId];
    const previousAssetId = previousMeta?.thumbnailAssetId ?? null;
    const previousOwnerId =
      typeof previousMeta?.thumbnailOwnerId === 'string' && previousMeta.thumbnailOwnerId.length > 0
        ? previousMeta.thumbnailOwnerId
        : null;
    if (!previousAssetId && !previousOwnerId) {
      return;
    }

    setIsUpdatingThumbnail(true);
    setThumbnailError(null);

    try {
      if (previousOwnerId) {
        await deleteGachaThumbnailFromBlob({
          gachaId: targetGachaId,
          ownerId: previousOwnerId,
          discordUserId: discordSession?.user?.id ?? null
        });
      }
      const timestamp = new Date().toISOString();
      let updated = false;
      appStateStore.update(
        (previous) => {
          if (!previous?.meta?.[targetGachaId]) {
            return previous;
          }

          updated = true;
          const nextMeta = {
            ...(previous.meta ?? {}),
            [targetGachaId]: {
              ...previous.meta[targetGachaId],
              id: previous.meta[targetGachaId]?.id ?? targetGachaId,
              displayName: previous.meta[targetGachaId]?.displayName ?? targetGachaId,
              thumbnailAssetId: null,
              thumbnailBlobUrl: null,
              thumbnailOwnerId: null,
              thumbnailUpdatedAt: null,
              updatedAt: timestamp
            }
          };

          return {
            ...previous,
            updatedAt: timestamp,
            meta: nextMeta
          };
        },
        { persist: 'immediate' }
      );
      if (!updated) {
        throw new Error(`ガチャ ${targetGachaId} が見つからないためサムネイルを削除できませんでした。`);
      }

      if (previousAssetId) {
        await deleteAsset(previousAssetId);
      }
    } catch (error) {
      console.error('ガチャサムネイルの削除に失敗しました', { gachaId: targetGachaId, error });
      setThumbnailError('ガチャサムネイルの削除に失敗しました。もう一度お試しください。');
    } finally {
      setIsUpdatingThumbnail(false);
    }
  }, [activeGachaId, appStateStore, discordSession?.user?.id, isUpdatingThumbnail]);

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
        onAddGacha={onRegisterGacha}
        className="rarity-section__gacha-tabs"
      />

      <div className="rarity-section__scroll section-scroll flex-1 tab-panel-viewport">
        <div
          key={activeGachaId ?? 'rarity-empty'}
          className={clsx('rarity-section__scroll-content space-y-4', panelAnimationClass)}
        >
          <div className="rarity-section__thumbnail-panel space-y-3">
            <div className="rarity-section__thumbnail-header">
              <div className="rarity-section__thumbnail-title-group">
                <p className="rarity-section__thumbnail-title text-sm font-semibold text-surface-foreground">配信サムネイル</p>
              </div>
            </div>
            <div className="rarity-section__thumbnail-content flex items-center gap-4">
              <ItemPreview
                assetId={activeGachaThumbnailAssetId}
                fallbackUrl={activeGachaThumbnailBlobUrl}
                alt={`${activeGachaName}の配信サムネイル`}
                kindHint="image"
                imageFit="cover"
                emptyLabel="noImage"
                className="rarity-section__thumbnail-preview h-20 w-20 bg-surface-deep"
              />
              <div className="rarity-section__thumbnail-actions-wrapper flex min-w-0 flex-1 flex-col gap-2">
                <p className="rarity-section__thumbnail-help text-xs text-muted-foreground">
                  正方形のPNG/JPGを設定できます。ここで変更した画像は受け取り画面や設定一覧にも反映されます。
                </p>
                <div className="rarity-section__thumbnail-actions flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rarity-section__thumbnail-change-button btn btn-muted !min-h-0 h-8 px-3 text-xs"
                    onClick={handleRequestGachaThumbnailSelection}
                    disabled={!activeGachaId || isUpdatingThumbnail}
                  >
                    {isUpdatingThumbnail ? '更新中…' : hasActiveGachaThumbnail ? '画像を変更' : '画像を設定'}
                  </button>
                  {hasActiveGachaThumbnail ? (
                    <button
                      type="button"
                      className="rarity-section__thumbnail-remove-button inline-flex items-center justify-center rounded-xl border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        void handleRemoveGachaThumbnail();
                      }}
                      disabled={isUpdatingThumbnail}
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {thumbnailError ? (
              <div className="rarity-section__thumbnail-error rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {thumbnailError}
              </div>
            ) : null}
          </div>
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
      <input
        ref={gachaThumbnailInputRef}
        id="rarity-gacha-thumbnail-input"
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        className="sr-only"
        onChange={(event) => {
          void handleSelectGachaThumbnail(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
    </SectionContainer>
  );
}
