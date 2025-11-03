import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type GachaAppStateV3,
  type GachaCatalogItemV3,
  type GachaCatalogStateV3,
  type GachaRarityEntityV3,
  type GachaRarityStateV3,
  type PtSettingV3
} from '@domain/app-persistence';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';
import { generateGachaId, generateItemId, generateRarityId } from '@domain/idGenerators';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { PtControlsPanel } from '../../pages/gacha/components/rarity/PtControlsPanel';
import { RarityTable, type RarityTableRow } from '../../pages/gacha/components/rarity/RarityTable';
import { DEFAULT_PALETTE } from '../../pages/gacha/components/rarity/color-picker/palette';
import { formatRarityRate, parseRarityRateInput } from '../../features/rarity/utils/rarityRate';
import {
  FALLBACK_RARITY_COLOR,
  generateRandomRarityColor,
  generateRandomRarityEmitRate,
  generateRandomRarityLabel
} from '../../features/rarity/utils/raritySeed';
import {
  SingleSelectDropdown,
  type SingleSelectOption
} from '../../pages/gacha/components/select/SingleSelectDropdown';

type WizardStep = 'basic' | 'assets' | 'pt';

interface DraftRarity {
  id: string;
  label: string;
  color: string;
  emitRateInput: string;
}

interface DraftItem {
  assetId: string;
  name: string;
  previewUrl: string;
  isRiagu: boolean;
  isCompleteTarget: boolean;
  rarityId: string | null;
}

const INITIAL_RARITY_PRESETS = [
  { label: 'はずれ', emitRate: 0.8 },
  { label: 'N', emitRate: 0.1 },
  { label: 'R', emitRate: 0.06 },
  { label: 'SR', emitRate: 0.03 },
  { label: 'UR', emitRate: 0.01 }
] as const;

const ITEM_NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function safeRevokeObjectURL(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

function getSequentialItemName(index: number): string {
  const alphabetLength = ITEM_NAME_ALPHABET.length;
  if (alphabetLength === 0) {
    return String(index + 1);
  }

  let current = index;
  let label = '';

  while (current >= 0) {
    const remainder = current % alphabetLength;
    label = ITEM_NAME_ALPHABET[remainder] + label;
    current = Math.floor(current / alphabetLength) - 1;
  }

  return label;
}

function createInitialRarities(): DraftRarity[] {
  const usedColors = new Set<string>();
  return INITIAL_RARITY_PRESETS.map((preset, index) => {
    const paletteColor = DEFAULT_PALETTE[index]?.value;
    const color = paletteColor ?? generateRandomRarityColor(usedColors);
    usedColors.add(color);
    return {
      id: generateRarityId(),
      label: preset.label,
      color,
      emitRateInput: formatRarityRate(preset.emitRate)
    } satisfies DraftRarity;
  });
}

export interface CreateGachaWizardDialogPayload {}

export function CreateGachaWizardDialog({ close }: ModalComponentProps<CreateGachaWizardDialogPayload>): JSX.Element {
  const {
    appState: appStateStore,
    rarities: rarityStore,
    catalog: catalogStore,
    ptControls: ptControlsStore,
    riagu: riaguStore
  } = useDomainStores();

  const [step, setStep] = useState<WizardStep>('basic');
  const [gachaName, setGachaName] = useState('');
  const [rarities, setRarities] = useState<DraftRarity[]>(() => createInitialRarities());
  const [items, setItems] = useState<DraftItem[]>([]);
  const [ptSettings, setPtSettings] = useState<PtSettingV3 | undefined>(undefined);
  const [isProcessingAssets, setIsProcessingAssets] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNameError, setShowNameError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createdAssetIdsRef = useRef<Set<string>>(new Set());
  const previewUrlMapRef = useRef<Map<string, string>>(new Map());
  const committedRef = useRef(false);

  useEffect(() => {
    return () => {
      previewUrlMapRef.current.forEach((url) => {
        safeRevokeObjectURL(url);
      });
      previewUrlMapRef.current.clear();

      if (committedRef.current) {
        return;
      }
      const ids = Array.from(createdAssetIdsRef.current);
      if (ids.length > 0) {
        void Promise.allSettled(ids.map((assetId) => deleteAsset(assetId))).finally(() => {
          createdAssetIdsRef.current.clear();
        });
      }
    };
  }, []);

  useEffect(() => {
    if (step !== 'assets') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [step]);

  const rarityTableRows = useMemo<RarityTableRow[]>(
    () =>
      rarities.map((rarity) => ({
        id: rarity.id,
        label: rarity.label,
        color: rarity.color,
        emitRateInput: rarity.emitRateInput,
        placeholder: rarity.label || 'レアリティ名'
      })),
    [rarities]
  );

  type RaritySelectOption = SingleSelectOption & { color?: string };

  const rarityOptions = useMemo<RaritySelectOption[]>(
    () =>
      rarities.length > 0
        ? rarities.map((rarity) => ({
            value: rarity.id,
            label: rarity.label || rarity.id,
            color: rarity.color
          }))
        : [{ value: '', label: 'レアリティ未設定' }],
    [rarities]
  );

  const stepIndex = step === 'basic' ? 1 : step === 'assets' ? 2 : 3;
  const totalSteps = 3;
  const canProceedToAssets = rarities.length > 0;
  const canProceedToPt = !isProcessingAssets;
  const highestRarity = rarities[rarities.length - 1] ?? rarities[0] ?? null;

  const rarityCount = rarities.length;

  const canDeleteRarityRow = useCallback(
    (_rarityId: string) => rarityCount > 1,
    [rarityCount]
  );

  const handleAddRarity = useCallback(() => {
    setRarities((previous) => {
      const existingLabels = new Set(previous.map((rarity) => rarity.label).filter((label): label is string => Boolean(label)));
      const existingColors = new Set(previous.map((rarity) => rarity.color).filter((color): color is string => Boolean(color)));
      const label = generateRandomRarityLabel(existingLabels);
      const color = generateRandomRarityColor(existingColors);
      return [
        ...previous,
        {
          id: generateRarityId(),
          label,
          color,
          emitRateInput: formatRarityRate(generateRandomRarityEmitRate())
        }
      ];
    });
  }, []);

  const handleRemoveRarity = useCallback((rarityId: string) => {
    setRarities((previous) => {
      if (previous.length <= 1) {
        return previous;
      }
      return previous.filter((rarity) => rarity.id !== rarityId);
    });
  }, []);

  const handleLabelChange = useCallback((rarityId: string, value: string) => {
    setRarities((previous) =>
      previous.map((rarity) => (rarity.id === rarityId ? { ...rarity, label: value } : rarity))
    );
  }, []);

  const handleColorChange = useCallback((rarityId: string, color: string) => {
    setRarities((previous) =>
      previous.map((rarity) => (rarity.id === rarityId ? { ...rarity, color } : rarity))
    );
  }, []);

  const handleEmitRateChange = useCallback((rarityId: string, value: string) => {
    setRarities((previous) =>
      previous.map((rarity) => (rarity.id === rarityId ? { ...rarity, emitRateInput: value } : rarity))
    );
  }, []);

  const handleSelectFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
      setAssetError('この環境では画像を保存できません。');
      return;
    }

    setIsProcessingAssets(true);
    setAssetError(null);

    try {
      const records = await Promise.all(
        Array.from(fileList, async (file) => await saveAsset(file))
      );

      const defaultRarityId = rarities[rarities.length - 1]?.id ?? rarities[0]?.id ?? null;

      setItems((previous) => {
        const nextItems = [...previous];

        records.forEach((record) => {
          let previewUrl = '';
          if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            previewUrl = URL.createObjectURL(record.blob);
            previewUrlMapRef.current.set(record.id, previewUrl);
          }

          nextItems.push({
            assetId: record.id,
            name: '',
            previewUrl,
            isRiagu: false,
            isCompleteTarget: true,
            rarityId: defaultRarityId
          });
        });

        return nextItems.map((item, index) => ({
          ...item,
          name: getSequentialItemName(index)
        }));
      });

      records.forEach((record) => {
        createdAssetIdsRef.current.add(record.id);
      });
    } catch (error) {
      console.error('画像の保存に失敗しました', error);
      setAssetError('画像の保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsProcessingAssets(false);
    }
  }, [rarities]);

  const handleRemoveItem = useCallback((assetId: string) => {
    setItems((previous) => {
      const removedItem = previous.find((item) => item.assetId === assetId);
      if (removedItem?.previewUrl) {
        safeRevokeObjectURL(removedItem.previewUrl);
        previewUrlMapRef.current.delete(assetId);
      }

      return previous
        .filter((item) => item.assetId !== assetId)
        .map((item, index) => ({
          ...item,
          name: getSequentialItemName(index)
        }));
    });
    if (createdAssetIdsRef.current.has(assetId)) {
      createdAssetIdsRef.current.delete(assetId);
      void deleteAsset(assetId);
    }
  }, []);

  type ItemFlagKey = 'isRiagu' | 'isCompleteTarget';

  const handleToggleItemFlag = useCallback((assetId: string, key: ItemFlagKey, checked: boolean) => {
    setItems((previous) =>
      previous.map((item) => (item.assetId === assetId ? { ...item, [key]: checked } : item))
    );
  }, []);

  const handleChangeItemRarity = useCallback((assetId: string, rarityId: string) => {
    setItems((previous) =>
      previous.map((item) => (item.assetId === assetId ? { ...item, rarityId } : item))
    );
  }, []);

  useEffect(() => {
    const availableRarityIds = new Set(rarities.map((rarity) => rarity.id));
    const fallbackRarityId = rarities[rarities.length - 1]?.id ?? rarities[0]?.id ?? null;

    if (!fallbackRarityId) {
      return;
    }

    setItems((previous) =>
      previous.map((item) => {
        if (item.rarityId && availableRarityIds.has(item.rarityId)) {
          return item;
        }
        return { ...item, rarityId: fallbackRarityId };
      })
    );
  }, [rarities]);

  const handleProceedFromBasicStep = useCallback(() => {
    const trimmedName = gachaName.trim();
    if (!trimmedName) {
      setShowNameError(true);
      return;
    }
    setShowNameError(false);
    setStep('assets');
  }, [gachaName]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedName = gachaName.trim();
    if (!trimmedName) {
      setStep('basic');
      setShowNameError(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const gachaId = generateGachaId();
      const timestamp = new Date().toISOString();

      appStateStore.update(
        (previous) => {
          const previousOrder = previous?.order ?? [];
          const nextOrder = [...previousOrder, gachaId];
          const nextMeta = {
            ...(previous?.meta ?? {}),
            [gachaId]: {
              id: gachaId,
              displayName: trimmedName,
              createdAt: timestamp,
              updatedAt: timestamp
            }
          };

          return {
            version: typeof previous?.version === 'number' ? previous.version : 3,
            updatedAt: timestamp,
            meta: nextMeta,
            order: nextOrder,
            selectedGachaId: gachaId
          } satisfies GachaAppStateV3;
        },
        { persist: 'immediate' }
      );

      const rarityState = rarityStore.getState();
      const nextRarityEntities: Record<string, GachaRarityEntityV3> = {
        ...(rarityState?.entities ?? {})
      };
      const nextRarityByGacha: Record<string, string[]> = {
        ...(rarityState?.byGacha ?? {})
      };
      let nextIndexByName = rarityState?.indexByName ? { ...rarityState.indexByName } : undefined;
      const newGachaIndex: Record<string, string> = {};
      const rarityOrder: string[] = [];

      rarities.forEach((rarity, index) => {
        const label = rarity.label.trim();
        const color = rarity.color?.trim() || FALLBACK_RARITY_COLOR;
        const emitRate = rarity.emitRateInput.trim()
          ? parseRarityRateInput(rarity.emitRateInput.trim()) ?? undefined
          : undefined;

        const entity: GachaRarityEntityV3 = {
          id: rarity.id,
          gachaId,
          label,
          color,
          ...(typeof emitRate === 'number' ? { emitRate } : {}),
          sortOrder: index,
          updatedAt: timestamp
        };

        rarityOrder.push(entity.id);
        nextRarityEntities[entity.id] = entity;

        if (label) {
          newGachaIndex[label] = entity.id;
        }
      });

      nextRarityByGacha[gachaId] = rarityOrder;

      if (Object.keys(newGachaIndex).length > 0) {
        nextIndexByName = {
          ...(nextIndexByName ?? {}),
          [gachaId]: newGachaIndex
        };
      }

      if (nextIndexByName && Object.keys(nextIndexByName).length === 0) {
        nextIndexByName = undefined;
      }

      const nextRarityState: GachaRarityStateV3 = {
        version: typeof rarityState?.version === 'number' ? rarityState.version : 3,
        updatedAt: timestamp,
        byGacha: nextRarityByGacha,
        entities: nextRarityEntities,
        ...(nextIndexByName ? { indexByName: nextIndexByName } : {})
      };

      rarityStore.setState(nextRarityState, { persist: 'immediate' });

      const catalogState = catalogStore.getState();
      const nextCatalogByGacha: GachaCatalogStateV3['byGacha'] = {
        ...(catalogState?.byGacha ?? {})
      };

      const highestRarityId = rarityOrder[rarityOrder.length - 1] ?? rarityOrder[0] ?? null;
      const catalogItems: Record<string, GachaCatalogItemV3> = {};
      const catalogOrder: string[] = [];
      const fallbackRarityId = highestRarityId ?? null;
      const availableRarityIds = new Set(rarityOrder);

      if (!fallbackRarityId) {
        throw new Error('No rarity is available for catalog items.');
      }

      const riaguCardInputs: Array<{ itemId: string }> = [];

      items.forEach((item, index) => {
        const resolvedRarityId = item.rarityId && availableRarityIds.has(item.rarityId) ? item.rarityId : fallbackRarityId;
        const itemId = generateItemId();
        catalogOrder.push(itemId);
        catalogItems[itemId] = {
          itemId,
          name: item.name || `景品${index + 1}`,
          rarityId: resolvedRarityId,
          order: index,
          imageAssetId: item.assetId,
          ...(item.isRiagu ? { riagu: true } : {}),
          ...(item.isCompleteTarget ? { completeTarget: true } : {}),
          updatedAt: timestamp
        } satisfies GachaCatalogItemV3;

        if (item.isRiagu) {
          riaguCardInputs.push({ itemId });
        }
      });

      nextCatalogByGacha[gachaId] = {
        order: catalogOrder,
        items: catalogItems
      };

      const nextCatalogState: GachaCatalogStateV3 = {
        version: typeof catalogState?.version === 'number' ? catalogState.version : 3,
        updatedAt: timestamp,
        byGacha: nextCatalogByGacha
      };

      catalogStore.setState(nextCatalogState, { persist: 'immediate' });

      riaguCardInputs.forEach(({ itemId }) => {
        riaguStore.upsertCard({ itemId, gachaId }, { persist: 'immediate' });
      });

      ptControlsStore.setGachaSettings(gachaId, ptSettings, { persist: 'immediate' });

      committedRef.current = true;
      createdAssetIdsRef.current.clear();
      close();
    } catch (error) {
      console.error('新規ガチャの登録に失敗しました', error);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('新規ガチャの登録に失敗しました。もう一度お試しください。');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    appStateStore,
    catalogStore,
    close,
    gachaName,
    isSubmitting,
    items,
    ptControlsStore,
    ptSettings,
    rarities,
    rarityStore,
    riaguStore
  ]);

  const renderBasicStep = () => {
    const gachaNameInputId = 'create-gacha-wizard-name';
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label
              htmlFor={gachaNameInputId}
              className="block text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground"
            >
              ガチャ名（必須）
            </label>
            {showNameError ? (
              <span className="text-xs font-semibold text-red-400">この項目は必須です。</span>
            ) : null}
          </div>
          <input
            type="text"
            id={gachaNameInputId}
            value={gachaName}
            onChange={(event) => {
              const nextValue = event.target.value;
              setGachaName(nextValue);
              if (showNameError && nextValue.trim().length > 0) {
                setShowNameError(false);
              }
            }}
            className="w-full rounded-2xl border border-border/60 bg-surface-alt px-4 py-3 text-sm text-surface-foreground transition focus:border-accent focus:outline-none"
            placeholder="例：リアルグッズガチャ"
          />
          <p className="text-xs text-muted-foreground">ダッシュボードでの表示名として利用されます。</p>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">レアリティ設定</h3>
          <div className="sm:max-h-[45vh] sm:overflow-y-auto sm:pr-1">
            <RarityTable
              rows={rarityTableRows}
              onLabelChange={handleLabelChange}
              onColorChange={handleColorChange}
              onEmitRateChange={handleEmitRateChange}
              onDelete={handleRemoveRarity}
              onAdd={handleAddRarity}
              canDeleteRow={canDeleteRarityRow}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderAssetStep = () => {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-dashed border-accent/40 bg-surface/40 p-5 text-sm text-muted-foreground">
          <p className="leading-relaxed">
            景品画像やリアルグッズの画像を登録してください。選択した画像は最も高いレアリティ
            「{highestRarity?.label || highestRarity?.id || '未設定'}」として追加されます。
          </p>
          <p className="mt-2 text-xs text-muted-foreground">複数のファイルを一度に選択できます。</p>
        </div>
        {assetError ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {assetError}
          </div>
        ) : null}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">選択済みの画像</h3>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground disabled:opacity-60"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingAssets}
            >
              {isProcessingAssets ? '処理中…' : '画像を追加する'}
            </button>
          </div>
          <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/50 p-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ画像が登録されていません。</p>
            ) : (
              <ul className="space-y-2 sm:max-h-[45vh] sm:overflow-y-auto sm:pr-1">
                {items.map((item) => (
                  <li
                    key={item.assetId}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-panel px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex w-full items-start gap-3 sm:w-auto">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-surface-deep">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={`${item.name}のプレビュー`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            画像なし
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="truncate text-sm font-semibold text-surface-foreground">{item.name}</p>
                        <div className="w-full max-w-full sm:max-w-[12rem]">
                          <SingleSelectDropdown
                            value={item.rarityId ?? undefined}
                            options={rarityOptions}
                            onChange={(value) => handleChangeItemRarity(item.assetId, value)}
                            placeholder="レアリティ未設定"
                            fallbackToFirstOption={false}
                            classNames={{
                              root: 'pt-controls-panel__select-wrapper relative inline-block w-full',
                              button:
                                'pt-controls-panel__select-button inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-panel-contrast px-3 py-1.5 text-xs font-semibold text-surface-foreground transition hover:bg-panel-contrast/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep',
                              buttonOpen: 'border-accent text-accent',
                              buttonClosed: 'hover:border-accent/70',
                              icon: 'pt-controls-panel__select-icon h-3.5 w-3.5 text-muted-foreground transition-transform',
                              iconOpen: 'rotate-180 text-accent',
                              menu:
                                'pt-controls-panel__select-options absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-panel/95 p-2 text-xs shadow-[0_18px_44px_rgba(0,0,0,0.6)] backdrop-blur-sm',
                              option:
                                'pt-controls-panel__select-option flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition',
                              optionActive: 'bg-accent/10 text-surface-foreground',
                              optionInactive: 'text-muted-foreground hover:bg-panel-muted/80',
                              optionLabel: 'pt-controls-panel__select-option-label flex-1 text-left',
                              checkIcon: 'pt-controls-panel__select-check h-3.5 w-3.5 text-accent transition'
                            }}
                            renderButtonLabel={({ selectedOption }) => {
                              const option = selectedOption as RaritySelectOption | undefined;
                              const label = option?.label ?? 'レアリティ未設定';
                              const color = option?.color;
                              return (
                                <span className="flex w-full items-center truncate">
                                  <span className="truncate" style={color ? { color } : undefined}>
                                    {label}
                                  </span>
                                </span>
                              );
                            }}
                            renderOptionContent={(option) => {
                              const rarityOption = option as RaritySelectOption;
                              return (
                                <span className="flex w-full items-center truncate">
                                  <span className="flex-1 truncate" style={rarityOption.color ? { color: rarityOption.color } : undefined}>
                                    {rarityOption.label}
                                  </span>
                                </span>
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 text-xs text-muted-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border/60 bg-transparent text-accent focus:ring-accent"
                          checked={item.isRiagu}
                          onChange={(event) => handleToggleItemFlag(item.assetId, 'isRiagu', event.target.checked)}
                        />
                        <span>リアグとして登録</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border/60 bg-transparent text-accent focus:ring-accent"
                          checked={item.isCompleteTarget}
                          onChange={(event) =>
                            handleToggleItemFlag(item.assetId, 'isCompleteTarget', event.target.checked)
                          }
                        />
                        <span>コンプ対象</span>
                      </label>
                    </div>
                    <div className="flex shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-red-500/60 hover:text-red-200 sm:w-auto"
                        onClick={() => handleRemoveItem(item.assetId)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPtStep = () => {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          ピックアップ保証や天井などのポイント設定を入力できます。必要に応じて後から変更することも可能です。
        </p>
        <div className="rounded-2xl border border-border/60 bg-surface/50 p-4 sm:max-h-[45vh] sm:overflow-y-auto sm:pr-1">
          <PtControlsPanel settings={ptSettings} rarityOptions={rarityOptions} onSettingsChange={setPtSettings} />
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold text-surface-foreground">新規ガチャを作成</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              ステップ{stepIndex} / {totalSteps}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            基本情報の入力から景品画像、ポイント設定まで順番に登録できます。
          </p>
        </div>
        {step === 'basic' ? renderBasicStep() : step === 'assets' ? renderAssetStep() : renderPtStep()}
      </ModalBody>
      <ModalFooter>
        {step === 'basic' ? (
          <button type="button" className="btn btn-muted" onClick={close} disabled={isSubmitting || isProcessingAssets}>
            キャンセル
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-muted"
            onClick={() => setStep(step === 'assets' ? 'basic' : 'assets')}
            disabled={isSubmitting || isProcessingAssets}
          >
            戻る
          </button>
        )}
        {step === 'pt' ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '登録中…' : '登録する'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (step === 'basic') {
                handleProceedFromBasicStep();
              } else {
                setStep('pt');
              }
            }}
            disabled={step === 'basic' ? !canProceedToAssets || isSubmitting || isProcessingAssets : !canProceedToPt}
          >
            次へ
          </button>
        )}
      </ModalFooter>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          void handleSelectFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
    </>
  );
}
