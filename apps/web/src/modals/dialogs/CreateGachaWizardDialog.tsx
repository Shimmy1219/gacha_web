import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';

import {
  type GachaAppStateV3,
  type GachaCatalogItemV4,
  type GachaCatalogStateV4,
  type GachaRarityEntityV3,
  type GachaRarityStateV3,
  type PtSettingV3
} from '@domain/app-persistence';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';
import { generateGachaId, generateItemId, generateRarityId } from '@domain/idGenerators';

import { ModalBody, ModalFooter, type ModalComponentProps, useModal } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { PtControlsPanel } from '../../pages/gacha/components/rarity/PtControlsPanel';
import { RarityTable, type RarityTableRow } from '../../pages/gacha/components/rarity/RarityTable';
import { DEFAULT_PALETTE } from '../../pages/gacha/components/rarity/color-picker/palette';
import { formatRarityRate } from '../../features/rarity/utils/rarityRate';
import {
  FALLBACK_RARITY_COLOR,
  generateRandomRarityColor,
  generateRandomRarityEmitRate,
  generateRandomRarityLabel
} from '../../features/rarity/utils/raritySeed';
import {
  RATE_TOLERANCE,
  getAutoAdjustRarityId,
  sortRarityRows,
  type RarityRateRow
} from '../../logic/rarityTable';
import { useRarityTableController } from '../../features/rarity/hooks/useRarityTableController';
import {
  SingleSelectDropdown,
  type SingleSelectOption
} from '../../pages/gacha/components/select/SingleSelectDropdown';
import { ItemPreview } from '../../components/ItemPreviewThumbnail';
import { RarityFileUploadControls } from '../../components/RarityFileUploadControls';
import { RarityRateErrorDialog } from './RarityRateErrorDialog';
import { PtBundleGuaranteeGuideDialog } from './PtBundleGuaranteeGuideDialog';
import { useNotification } from '../../features/notification';
import { validateGachaThumbnailFile } from '../../features/gacha/gachaThumbnail';

type WizardStep = 'basic' | 'assets' | 'pt';

interface DraftRarity extends RarityRateRow {
  label: string;
  color: string;
}

interface DraftItemAsset {
  assetId: string;
  thumbnailAssetId: string | null;
  previewUrl: string;
  originalFilename: string | null;
}

interface DraftItem {
  id: string;
  assets: DraftItemAsset[];
  name: string;
  originalFilename: string | null;
  isRiagu: boolean;
  isCompleteTarget: boolean;
  rarityId: string | null;
}

type SavedAsset = Awaited<ReturnType<typeof saveAsset>>;

const INITIAL_RARITY_PRESETS = [
  { label: 'はずれ', emitRate: 0.8 },
  { label: 'N', emitRate: 0.1 },
  { label: 'R', emitRate: 0.06 },
  { label: 'SR', emitRate: 0.03 },
  { label: 'UR', emitRate: 0.01 }
] as const;

type InitialRarityLabel = (typeof INITIAL_RARITY_PRESETS)[number]['label'];

const INITIAL_RARITY_COLORS: Record<InitialRarityLabel, string> = {
  UR: '#ef4444',
  SR: '#ec4899',
  R: '#f97316',
  N: '#14b8a6',
  はずれ: '#3b82f6'
};

const ITEM_NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function createDraftItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-item-${Math.random().toString(36).slice(2, 11)}`;
}

function safeRevokeObjectURL(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

async function readFileAsDataUrl(file: File): Promise<string | null> {
  if (typeof FileReader === 'undefined') {
    return null;
  }

  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
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
    const presetColor = INITIAL_RARITY_COLORS[preset.label];
    const paletteColor = DEFAULT_PALETTE[index]?.value;
    const color = presetColor ?? paletteColor ?? generateRandomRarityColor(usedColors);
    usedColors.add(color);
    return {
      id: generateRarityId(),
      label: preset.label,
      color,
      emitRate: preset.emitRate,
      sortOrder: index
    } satisfies DraftRarity;
  });
}

function formatFilenameAsItemName(filename: string | null | undefined): string {
  if (!filename) {
    return '';
  }

  const trimmed = filename.trim();
  if (!trimmed) {
    return '';
  }

  const lastDotIndex = trimmed.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return trimmed;
  }

  return trimmed.slice(0, lastDotIndex);
}

function removeCompleteFromPtSettings(settings: PtSettingV3 | undefined): PtSettingV3 | undefined {
  if (!settings?.complete) {
    return settings;
  }
  const nextSettings: PtSettingV3 = { ...settings };
  delete nextSettings.complete;
  if (!nextSettings.perPull && !nextSettings.bundles && !nextSettings.guarantees && !nextSettings.updatedAt) {
    return undefined;
  }
  return nextSettings;
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
  const { push } = useModal();
  const { notify } = useNotification();

  const [step, setStep] = useState<WizardStep>('basic');
  const [gachaName, setGachaName] = useState('');
  const [rarities, setRarities] = useState<DraftRarity[]>(() => createInitialRarities());
  const [items, setItems] = useState<DraftItem[]>([]);
  const [ptSettings, setPtSettings] = useState<PtSettingV3 | undefined>(undefined);
  const [isCompleteGachaEnabled, setIsCompleteGachaEnabled] = useState(true);
  const [isProcessingAssets, setIsProcessingAssets] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNameError, setShowNameError] = useState(false);
  const [useFilenameAsItemName, setUseFilenameAsItemName] = useState(false);
  const [gachaThumbnailAsset, setGachaThumbnailAsset] = useState<DraftItemAsset | null>(null);
  const [gachaThumbnailError, setGachaThumbnailError] = useState<string | null>(null);
  const itemsRef = useRef<DraftItem[]>([]);

  const sortedRarities = useMemo(() => sortRarityRows(rarities), [rarities]);
  const autoAdjustRarityId = useMemo(
    () => getAutoAdjustRarityId(sortedRarities),
    [sortedRarities]
  );

  const guaranteeItemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    items.forEach((item, index) => {
      const rarityId = item.rarityId ?? '';
      if (!rarityId) {
        return;
      }
      const list = map.get(rarityId) ?? [];
      const label = item.name || `景品${index + 1}`;
      list.push({ value: item.id, label });
      map.set(rarityId, list);
    });
    return map;
  }, [items]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gachaThumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAssetRarityIdRef = useRef<string | null>(null);
  const subAssetInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSubAssetItemIdRef = useRef<string | null>(null);
  const createdAssetIdsRef = useRef<Set<string>>(new Set());
  const previewUrlMapRef = useRef<Map<string, string>>(new Map());
  const committedRef = useRef(false);

  const createDraftAssetEntry = useCallback(
    async (record: SavedAsset, file?: File | null): Promise<DraftItemAsset> => {
      let previewUrl = '';

      if (file && file.type.startsWith('image/')) {
        previewUrl = (await readFileAsDataUrl(file)) ?? '';
      }

      if (!previewUrl) {
        const previewSource = record.previewBlob ?? record.blob;
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && previewSource) {
          previewUrl = URL.createObjectURL(previewSource);
          if (previewUrl.startsWith('blob:')) {
            previewUrlMapRef.current.set(record.id, previewUrl);
          }
        }
      }

      return {
        assetId: record.id,
        thumbnailAssetId: record.previewId ?? null,
        previewUrl,
        originalFilename: file?.name ?? null
      };
    },
    [previewUrlMapRef]
  );

  const disposeDraftAsset = useCallback(
    (asset?: DraftItemAsset | null) => {
      if (!asset) {
        return;
      }
      if (asset.previewUrl && asset.previewUrl.startsWith('blob:')) {
        safeRevokeObjectURL(asset.previewUrl);
      }
      previewUrlMapRef.current.delete(asset.assetId);
      if (createdAssetIdsRef.current.has(asset.assetId)) {
        createdAssetIdsRef.current.delete(asset.assetId);
        void deleteAsset(asset.assetId);
      }
    },
    [createdAssetIdsRef, previewUrlMapRef]
  );

  const computeItemName = useCallback(
    (item: DraftItem, index: number) => {
      if (useFilenameAsItemName) {
        const filenameBasedName = formatFilenameAsItemName(item.originalFilename);
        if (filenameBasedName) {
          return filenameBasedName;
        }
      }

      return getSequentialItemName(index);
    },
    [useFilenameAsItemName]
  );

  const applyItemNamingStrategy = useCallback(
    (draftItems: DraftItem[]) =>
      draftItems.map((item, index) => ({
        ...item,
        name: computeItemName(item, index)
      })),
    [computeItemName]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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

  const applyEmitRateUpdates = useCallback(
    (updates: ReadonlyArray<{ rarityId: string; emitRate: number | undefined }>) => {
      if (updates.length === 0) {
        return;
      }

      setRarities((previous) => {
        if (previous.length === 0) {
          return previous;
        }

        const updateMap = new Map(updates.map((update) => [update.rarityId, update.emitRate] as const));
        let changed = false;

        const next = previous.map((rarity) => {
          if (!updateMap.has(rarity.id)) {
            return rarity;
          }
          const nextEmitRate = updateMap.get(rarity.id);
          const currentEmitRate = rarity.emitRate;
          const noChange =
            (nextEmitRate == null && currentEmitRate == null) ||
            (nextEmitRate != null &&
              currentEmitRate != null &&
              Math.abs(currentEmitRate - nextEmitRate) <= RATE_TOLERANCE);

          if (noChange) {
            return rarity;
          }

          changed = true;
          return { ...rarity, emitRate: nextEmitRate };
        });

        return changed ? next : previous;
      });
    },
    []
  );

  const handleAutoAdjustRate = useCallback((rarityId: string, rate: number) => {
    setRarities((previous) => {
      let changed = false;
      const next = previous.map((rarity) => {
        if (rarity.id !== rarityId) {
          return rarity;
        }
        const currentRate = rarity.emitRate ?? 0;
        if (Math.abs(currentRate - rate) <= RATE_TOLERANCE) {
          return rarity;
        }
        changed = true;
        return { ...rarity, emitRate: rate };
      });
      return changed ? next : previous;
    });
  }, []);

  const { emitRateInputs, handleEmitRateInputChange, handleEmitRateInputCommit } =
    useRarityTableController({
      rows: rarities,
      autoAdjustRarityId,
      onApplyRateUpdates: applyEmitRateUpdates,
      onAutoAdjustRate: handleAutoAdjustRate,
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

  const rarityTableRows = useMemo<RarityTableRow[]>(() => {
    const hasAutoAdjust = autoAdjustRarityId != null && sortedRarities.length > 1;
    return sortedRarities.map((rarity) => {
      const entry = emitRateInputs[rarity.id];
      const emitRateInput = entry?.value ?? formatRarityRate(rarity.emitRate);
      const isAutoAdjust = hasAutoAdjust && rarity.id === autoAdjustRarityId;
      const label = rarity.label;
      const emitRateAriaLabel = `${label || rarity.id} の排出率${isAutoAdjust ? '（自動調整）' : ''}`;

      return {
        id: rarity.id,
        label: rarity.label,
        color: rarity.color,
        emitRateInput,
        placeholder: rarity.label || 'レアリティ名',
        emitRateAriaLabel,
        isEmitRateReadOnly: isAutoAdjust
      } satisfies RarityTableRow;
    });
  }, [autoAdjustRarityId, emitRateInputs, sortedRarities]);

  type RaritySelectOption = SingleSelectOption & { color?: string };

  const rarityOptions = useMemo<RaritySelectOption[]>(
    () =>
      sortedRarities.length > 0
        ? sortedRarities.map((rarity) => ({
            value: rarity.id,
            label: rarity.label || rarity.id,
            color: rarity.color
          }))
        : [{ value: '', label: 'レアリティ未設定' }],
    [sortedRarities]
  );

  const stepIndex = step === 'basic' ? 1 : step === 'assets' ? 2 : 3;
  const totalSteps = 3;
  const canProceedToAssets = rarities.length > 0;
  const canProceedToPt = !isProcessingAssets;
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
          emitRate: generateRandomRarityEmitRate(),
          sortOrder: previous.length
        }
      ];
    });
  }, []);

  const handleRemoveRarity = useCallback(
    (rarityId: string) => {
      if (rarityCount <= 1) {
        return;
      }

      setRarities((previous) => previous.filter((rarity) => rarity.id !== rarityId));
    },
    [rarityCount]
  );

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

  const handleToggleCompleteGacha = useCallback((checked: boolean) => {
    setIsCompleteGachaEnabled(checked);
    if (checked) {
      return;
    }
    setItems((previous) =>
      previous.map((item) =>
        item.isCompleteTarget ? { ...item, isCompleteTarget: false } : item
      )
    );
    setPtSettings((previous) => removeCompleteFromPtSettings(previous));
  }, []);

  const handleRequestAssetSelection = useCallback((rarityId: string | null) => {
    pendingAssetRarityIdRef.current = rarityId;
    fileInputRef.current?.click();
  }, []);

  const handleRequestGachaThumbnailSelection = useCallback(() => {
    gachaThumbnailInputRef.current?.click();
  }, []);

  const handleSelectGachaThumbnail = useCallback(
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) {
        return;
      }

      if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
        setGachaThumbnailError('この環境では画像を保存できません。');
        return;
      }

      setIsProcessingAssets(true);
      setGachaThumbnailError(null);

      try {
        // 配信サムネイルは仕様上「正方形のPNG/JPGのみ」を許可する。
        const validation = await validateGachaThumbnailFile(file);
        if (!validation.ok) {
          setGachaThumbnailError(validation.message ?? '配信サムネイルに使える画像ではありません。');
          return;
        }

        const record = await saveAsset(file);
        createdAssetIdsRef.current.add(record.id);
        const draftAsset = await createDraftAssetEntry(record, file);

        setGachaThumbnailAsset((previous) => {
          // 差し替え時は古いドラフトアセットを必ず破棄してリークを防ぐ。
          if (previous) {
            disposeDraftAsset(previous);
          }
          return draftAsset;
        });
      } catch (error) {
        console.error('配信サムネイルの保存に失敗しました', error);
        setGachaThumbnailError('配信サムネイルの保存に失敗しました。もう一度お試しください。');
      } finally {
        setIsProcessingAssets(false);
      }
    },
    [createDraftAssetEntry, disposeDraftAsset]
  );

  const handleRemoveGachaThumbnail = useCallback(() => {
    setGachaThumbnailAsset((previous) => {
      if (!previous) {
        return null;
      }
      disposeDraftAsset(previous);
      return null;
    });
    setGachaThumbnailError(null);
  }, [disposeDraftAsset]);

  const handleSelectFiles = useCallback(async (fileList: FileList | null, rarityId: string | null) => {
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
      const assetEntries = await Promise.all(
        Array.from(fileList, async (file) => ({
          record: await saveAsset(file),
          file
        }))
      );
      const availableRarityIds = new Set(sortedRarities.map((rarity) => rarity.id));
      const lowestRarityId =
        sortedRarities[sortedRarities.length - 1]?.id ?? sortedRarities[0]?.id ?? null;
      const assignedRarityId =
        rarityId && availableRarityIds.has(rarityId) ? rarityId : lowestRarityId;

      const draftAssets = await Promise.all(
        assetEntries.map(async ({ record, file }) => {
          createdAssetIdsRef.current.add(record.id);
          return await createDraftAssetEntry(record, file);
        })
      );

      setItems((previous) => {
        const nextItems = [...previous];

        draftAssets.forEach((assetEntry, index) => {
          const file = assetEntries[index]?.file;
          nextItems.push({
            id: createDraftItemId(),
            assets: [assetEntry],
            name: '',
            originalFilename: file?.name ?? null,
            isRiagu: false,
            isCompleteTarget: isCompleteGachaEnabled,
            rarityId: assignedRarityId
          });
        });

        return applyItemNamingStrategy(nextItems);
      });
    } catch (error) {
      console.error('画像の保存に失敗しました', error);
      setAssetError('画像の保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsProcessingAssets(false);
    }
  }, [applyItemNamingStrategy, createDraftAssetEntry, createdAssetIdsRef, isCompleteGachaEnabled, sortedRarities]);

  const handleRemoveItem = useCallback(
    (draftItemId: string) => {
      setItems((previous) => {
        const removedItem = previous.find((item) => item.id === draftItemId);
        if (removedItem?.assets?.length) {
          removedItem.assets.forEach((asset) => {
            disposeDraftAsset(asset);
          });
        }

        const filteredItems = previous.filter((item) => item.id !== draftItemId);
        return applyItemNamingStrategy(filteredItems);
      });
    },
    [applyItemNamingStrategy, disposeDraftAsset]
  );

  type ItemFlagKey = 'isRiagu' | 'isCompleteTarget';

  const handleToggleItemFlag = useCallback((draftItemId: string, key: ItemFlagKey, checked: boolean) => {
    setItems((previous) =>
      previous.map((item) => (item.id === draftItemId ? { ...item, [key]: checked } : item))
    );
  }, []);

  const handleChangeItemRarity = useCallback((draftItemId: string, rarityId: string) => {
    setItems((previous) =>
      previous.map((item) => (item.id === draftItemId ? { ...item, rarityId } : item))
    );
  }, []);

  const handleRequestSubAsset = useCallback((draftItemId: string) => {
    pendingSubAssetItemIdRef.current = draftItemId;
    subAssetInputRef.current?.click();
  }, [pendingSubAssetItemIdRef, subAssetInputRef]);

  const handleRemoveAdditionalAssets = useCallback((draftItemId: string) => {
    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== draftItemId) {
          return item;
        }
        if (item.assets.length <= 1) {
          return item;
        }
        const removedAssets = item.assets.slice(1);
        removedAssets.forEach((asset) => disposeDraftAsset(asset));
        return { ...item, assets: [item.assets[0]] };
      })
    );
  }, [disposeDraftAsset]);

  const handleRemoveAdditionalAsset = useCallback(
    (draftItemId: string, assetId: string) => {
      setItems((previous) =>
        previous.map((item) => {
          if (item.id !== draftItemId) {
            return item;
          }
          const assetIndex = item.assets.findIndex((asset, index) => index > 0 && asset.assetId === assetId);
          if (assetIndex === -1) {
            return item;
          }
          const removedAsset = item.assets[assetIndex];
          disposeDraftAsset(removedAsset);
          const nextAssets = [...item.assets];
          nextAssets.splice(assetIndex, 1);
          return { ...item, assets: nextAssets };
        })
      );
    },
    [disposeDraftAsset]
  );

  const handleSelectSubAsset = useCallback(
    async (fileList: FileList | null) => {
      const targetItemId = pendingSubAssetItemIdRef.current;
      pendingSubAssetItemIdRef.current = null;

      if (!targetItemId || !fileList || fileList.length === 0) {
        return;
      }

      if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
        setAssetError('この環境では画像を保存できません。');
        return;
      }

      setIsProcessingAssets(true);
      setAssetError(null);

      try {
        const targetExists = itemsRef.current.some((item) => item.id === targetItemId);
        const assetEntries = await Promise.all(
          Array.from(fileList, async (file) => ({
            record: await saveAsset(file),
            file
          }))
        );
        const draftAssets = await Promise.all(
          assetEntries.map(async ({ record, file }) => {
            createdAssetIdsRef.current.add(record.id);
            return await createDraftAssetEntry(record, file);
          })
        );

        if (!targetExists) {
          draftAssets.forEach((asset) => disposeDraftAsset(asset));
          return;
        }

        setItems((previous) =>
          previous.map((item) =>
            item.id === targetItemId ? { ...item, assets: [...item.assets, ...draftAssets] } : item
          )
        );
      } catch (error) {
        console.error('画像の保存に失敗しました', error);
        setAssetError('画像の保存に失敗しました。もう一度お試しください。');
      } finally {
        setIsProcessingAssets(false);
      }
    },
    [createDraftAssetEntry, createdAssetIdsRef, disposeDraftAsset, pendingSubAssetItemIdRef]
  );

  const handleAddEmptyItem = useCallback(() => {
    const defaultRarityId =
      sortedRarities[sortedRarities.length - 1]?.id ?? sortedRarities[0]?.id ?? null;
    setItems((previous) => {
      const nextItems = [
        ...previous,
        {
          id: createDraftItemId(),
          assets: [],
          name: '',
          originalFilename: null,
          isRiagu: false,
          isCompleteTarget: isCompleteGachaEnabled,
          rarityId: defaultRarityId
        }
      ];
      return applyItemNamingStrategy(nextItems);
    });
  }, [applyItemNamingStrategy, isCompleteGachaEnabled, sortedRarities]);

  useEffect(() => {
    const availableRarityIds = new Set(sortedRarities.map((rarity) => rarity.id));
    const fallbackRarityId =
      sortedRarities[sortedRarities.length - 1]?.id ?? sortedRarities[0]?.id ?? null;

    if (!fallbackRarityId) {
      return;
    }

    setItems((previous) =>
      previous.map((item) => {
        if (item.rarityId == null || item.rarityId === '') {
          return item;
        }
        if (availableRarityIds.has(item.rarityId)) {
          return item;
        }
        return { ...item, rarityId: fallbackRarityId };
      })
    );
  }, [sortedRarities]);

  useEffect(() => {
    setItems((previous) => applyItemNamingStrategy(previous));
  }, [applyItemNamingStrategy]);

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
              thumbnailAssetId: gachaThumbnailAsset?.assetId ?? null,
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

      sortedRarities.forEach((rarity, index) => {
        const label = rarity.label.trim();
        const color = rarity.color?.trim() || FALLBACK_RARITY_COLOR;
        const emitRate = typeof rarity.emitRate === 'number' ? rarity.emitRate : undefined;

        const entity: GachaRarityEntityV3 = {
          id: rarity.id,
          gachaId,
          label,
          color,
          ...(emitRate != null ? { emitRate } : {}),
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
      const nextCatalogByGacha: GachaCatalogStateV4['byGacha'] = {
        ...(catalogState?.byGacha ?? {})
      };

      const highestRarityId = rarityOrder[rarityOrder.length - 1] ?? rarityOrder[0] ?? null;
      const catalogItems: Record<string, GachaCatalogItemV4> = {};
      const catalogOrder: string[] = [];
      const fallbackRarityId = highestRarityId ?? null;
      const availableRarityIds = new Set(rarityOrder);

      if (!fallbackRarityId) {
        throw new Error('No rarity is available for catalog items.');
      }

      const riaguCardInputs: Array<{ itemId: string }> = [];
      const draftIdToItemId = new Map<string, string>();

      items.forEach((item, index) => {
        const resolvedRarityId = item.rarityId && availableRarityIds.has(item.rarityId) ? item.rarityId : fallbackRarityId;
        const itemId = generateItemId();
        catalogOrder.push(itemId);
        const assets = item.assets
          .filter((asset) => Boolean(asset?.assetId))
          .map((asset) => ({
            assetId: asset.assetId,
            thumbnailAssetId: asset.thumbnailAssetId ?? null
          }));

        catalogItems[itemId] = {
          itemId,
          name: item.name || `景品${index + 1}`,
          rarityId: resolvedRarityId,
          order: index,
          ...(assets.length > 0 ? { assets } : {}),
          ...(item.isRiagu ? { riagu: true } : {}),
          ...(isCompleteGachaEnabled && item.isCompleteTarget ? { completeTarget: true } : {}),
          updatedAt: timestamp
        } satisfies GachaCatalogItemV4;

        draftIdToItemId.set(item.id, itemId);

        if (item.isRiagu) {
          riaguCardInputs.push({ itemId });
        }
      });

      nextCatalogByGacha[gachaId] = {
        order: catalogOrder,
        items: catalogItems
      };

      const nextCatalogState: GachaCatalogStateV4 = {
        version: typeof catalogState?.version === 'number' ? catalogState.version : 4,
        updatedAt: timestamp,
        byGacha: nextCatalogByGacha
      };

      catalogStore.setState(nextCatalogState, { persist: 'immediate' });

      riaguCardInputs.forEach(({ itemId }) => {
        riaguStore.upsertCard({ itemId, gachaId }, { persist: 'immediate' });
      });

      const basePtSettings = ptSettings
        ? {
            ...ptSettings,
            guarantees: ptSettings.guarantees
              ? ptSettings.guarantees.map((guarantee) => {
                  if (guarantee.target?.type !== 'item') {
                    return {
                      ...guarantee,
                      target: { ...guarantee.target }
                    };
                  }
                  const mapped = draftIdToItemId.get(guarantee.target.itemId);
                  if (!mapped) {
                    return {
                      ...guarantee,
                      target: { ...guarantee.target }
                    };
                  }
                  return {
                    ...guarantee,
                    target: { type: 'item', itemId: mapped }
                  };
                })
              : undefined
          }
        : undefined;
      const resolvedPtSettings = isCompleteGachaEnabled
        ? basePtSettings
        : removeCompleteFromPtSettings(basePtSettings);

      ptControlsStore.setGachaSettings(gachaId, resolvedPtSettings, { persist: 'immediate' });

      committedRef.current = true;
      createdAssetIdsRef.current.clear();
      close();
    } catch (error) {
      console.error('新規ガチャの登録に失敗しました', error);
      notify({
        variant: 'error',
        title: '新規ガチャの登録に失敗しました',
        message: 'もう一度お試しください。'
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    appStateStore,
    catalogStore,
    close,
    gachaName,
    gachaThumbnailAsset,
    isCompleteGachaEnabled,
    isSubmitting,
    items,
    ptControlsStore,
    ptSettings,
    rarities,
    rarityStore,
    riaguStore,
    notify
  ]);

  const renderBasicStep = () => {
    const gachaNameInputId = 'create-gacha-wizard-name';
    return (
      <div className="create-gacha-wizard__basic-step space-y-6">
        <div className="create-gacha-wizard__name-field space-y-2">
          <div className="create-gacha-wizard__name-field-header flex items-center gap-3">
            <label
              htmlFor={gachaNameInputId}
              className="create-gacha-wizard__name-label block text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground"
            >
              ガチャ名（必須）
            </label>
            {showNameError ? (
              <span className="create-gacha-wizard__name-error text-xs font-semibold text-red-400">この項目は必須です。</span>
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
            className="create-gacha-wizard__name-input w-full rounded-2xl border border-border/60 bg-surface-alt px-4 py-3 text-sm text-surface-foreground transition focus:border-accent focus:outline-none"
            placeholder="例：リアルグッズガチャ"
          />
        </div>
        <div className="create-gacha-wizard__thumbnail-section space-y-2">
          <div className="create-gacha-wizard__thumbnail-header flex items-center justify-between gap-3">
            <h3 className="create-gacha-wizard__thumbnail-title text-sm font-semibold text-muted-foreground">配信サムネイルを設定</h3>
            {gachaThumbnailAsset ? (
              <span className="create-gacha-wizard__thumbnail-status chip border-emerald-500/40 bg-emerald-500/10 text-emerald-600">設定済み</span>
            ) : null}
          </div>
          <div className="create-gacha-wizard__thumbnail-panel flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface/50 p-4 sm:flex-row sm:items-center">
            <ItemPreview
              assetId={gachaThumbnailAsset?.assetId}
              previewAssetId={gachaThumbnailAsset?.thumbnailAssetId ?? null}
              previewUrl={gachaThumbnailAsset?.previewUrl || undefined}
              alt="配信サムネイルのプレビュー"
              kindHint="image"
              className="create-gacha-wizard__thumbnail-preview h-24 w-24 bg-surface-deep"
              imageFit="cover"
              emptyLabel="noImage"
            />
            <div className="create-gacha-wizard__thumbnail-body flex min-w-0 flex-1 flex-col gap-2">
              <p className="create-gacha-wizard__thumbnail-description text-xs text-muted-foreground">
                正方形のPNG/JPGを設定できます。設定した画像はガチャの各画面で共通表示されます。
              </p>
              {gachaThumbnailAsset?.originalFilename ? (
                <p className="create-gacha-wizard__thumbnail-filename truncate text-xs text-muted-foreground">
                  選択中: {gachaThumbnailAsset.originalFilename}
                </p>
              ) : null}
              <div className="create-gacha-wizard__thumbnail-actions flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="create-gacha-wizard__thumbnail-select-button btn btn-muted !min-h-0 h-8 px-3 text-xs"
                  onClick={handleRequestGachaThumbnailSelection}
                  disabled={isProcessingAssets}
                >
                  {gachaThumbnailAsset ? '画像を変更' : '画像を選択'}
                </button>
                {gachaThumbnailAsset ? (
                  <button
                    type="button"
                    className="create-gacha-wizard__thumbnail-remove-button inline-flex items-center justify-center rounded-xl border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleRemoveGachaThumbnail}
                    disabled={isProcessingAssets}
                  >
                    削除
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {gachaThumbnailError ? (
            <div className="create-gacha-wizard__thumbnail-error rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {gachaThumbnailError}
            </div>
          ) : null}
        </div>
        <div className="create-gacha-wizard__rarity-settings space-y-3">
          <h3 className="create-gacha-wizard__rarity-settings-title text-sm font-semibold text-muted-foreground">レアリティ設定</h3>
          <div className="create-gacha-wizard__rarity-table-wrapper sm:max-h-[45vh] sm:overflow-y-auto sm:pr-1">
            <RarityTable
              rows={rarityTableRows}
              onLabelChange={handleLabelChange}
              onColorChange={handleColorChange}
              onEmitRateChange={handleEmitRateInputChange}
              onEmitRateCommit={handleEmitRateInputCommit}
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
      <div className="create-gacha-wizard__asset-step space-y-5">
        <div className="create-gacha-wizard__complete-toggle-row grid grid-cols-[minmax(8rem,auto),1fr] items-center gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 sm:gap-2">
          <span className="create-gacha-wizard__complete-toggle-title text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            コンプガチャを有効にする
          </span>
          <div className="create-gacha-wizard__complete-toggle-controls flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => handleToggleCompleteGacha(!isCompleteGachaEnabled)}
              className={clsx(
                'create-gacha-wizard__complete-toggle-button relative inline-flex h-6 w-11 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep',
                isCompleteGachaEnabled
                  ? 'border-accent bg-[rgb(var(--color-accent)/1)]'
                  : 'border-border/60 bg-panel-muted'
              )}
              aria-pressed={isCompleteGachaEnabled}
            >
              <span
                className={clsx(
                  'create-gacha-wizard__complete-toggle-indicator inline-block h-4 w-4 rounded-full transition-all',
                  isCompleteGachaEnabled
                    ? 'translate-x-[22px] bg-[rgb(var(--color-accent-foreground)/1)]'
                    : 'translate-x-[6px] bg-[rgb(var(--color-surface-foreground)/1)]'
                )}
              />
            </button>
          </div>
        </div>
        {assetError ? (
          <div className="create-gacha-wizard__asset-error rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {assetError}
          </div>
        ) : null}
        <RarityFileUploadControls
          options={sortedRarities.map((rarity) => ({
            id: rarity.id,
            label: rarity.label.trim() || rarity.id,
            color: rarity.color
          }))}
          isProcessing={isProcessingAssets}
          onSelectAll={() => handleRequestAssetSelection(null)}
          onSelectRarity={handleRequestAssetSelection}
        />
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">選択済みの画像</h3>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border/60 bg-transparent text-accent focus:ring-accent"
                  checked={useFilenameAsItemName}
                  onChange={(event) => setUseFilenameAsItemName(event.target.checked)}
                />
                <span>ファイル名をアイテム名として使う</span>
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                onClick={handleAddEmptyItem}
                disabled={isProcessingAssets}
              >
                ファイル無しで追加
              </button>
            </div>
          </div>
          <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/50 p-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ画像が登録されていません。</p>
            ) : (
              <ul className="space-y-2 sm:max-h-[45vh] sm:overflow-y-auto sm:pr-1">
                {items.map((item) => {
                  const primaryAsset = item.assets[0];
                  const hasPrimaryAsset = Boolean(primaryAsset);
                  const additionalAssets = item.assets.slice(1);
                  const hasSecondaryAsset = additionalAssets.length > 0;

                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-panel px-4 py-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex w-full items-start gap-3 sm:w-auto">
                          <ItemPreview
                            assetId={primaryAsset?.assetId}
                            previewAssetId={primaryAsset?.thumbnailAssetId ?? null}
                            previewUrl={primaryAsset?.previewUrl || undefined}
                            alt={`${item.name}のプレビュー`}
                            emptyLabel="noImage"
                            kindHint="image"
                            className="h-16 w-16 shrink-0 bg-surface-deep"
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <p className="truncate text-sm font-semibold text-surface-foreground">{item.name}</p>
                            <div className="w-full max-w-full sm:max-w-[12rem]">
                              <SingleSelectDropdown
                                value={item.rarityId ?? undefined}
                                options={rarityOptions}
                                onChange={(value) => handleChangeItemRarity(item.id, value)}
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
                              onChange={(event) => handleToggleItemFlag(item.id, 'isRiagu', event.target.checked)}
                            />
                            <span>リアグとして登録</span>
                          </label>
                          {isCompleteGachaEnabled ? (
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border/60 bg-transparent text-accent focus:ring-accent"
                                checked={item.isCompleteTarget}
                                onChange={(event) =>
                                  handleToggleItemFlag(item.id, 'isCompleteTarget', event.target.checked)
                                }
                              />
                              <span>コンプ対象</span>
                            </label>
                          ) : null}
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            onClick={() => handleRequestSubAsset(item.id)}
                            disabled={!hasPrimaryAsset || isProcessingAssets}
                          >
                            {hasSecondaryAsset ? '追加画像を追加' : '2枚目を追加'}
                          </button>
                          {hasSecondaryAsset ? (
                            <button
                              type="button"
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-red-500/60 hover:text-red-200 sm:w-auto"
                              onClick={() => handleRemoveAdditionalAssets(item.id)}
                              disabled={isProcessingAssets}
                            >
                              追加画像を削除
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-red-500/60 hover:text-red-200 sm:w-auto"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                      {additionalAssets.length > 0 ? (
                        <div className="flex items-start gap-3 text-muted-foreground">
                          <span className="text-3xl leading-none">└</span>
                          <div className="flex flex-wrap items-center gap-2">
                            {additionalAssets.map((asset, index) => (
                              <div key={asset.assetId} className="relative shrink-0">
                                <ItemPreview
                                  assetId={asset.assetId}
                                  previewAssetId={asset.thumbnailAssetId ?? null}
                                  previewUrl={asset.previewUrl || undefined}
                                  alt={`${item.name}の追加画像${index + 2}`}
                                  kindHint="image"
                                  className="h-10 w-10 bg-surface-deep"
                                />
                                <button
                                  type="button"
                                  className="absolute -right-2 -top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-surface text-[11px] font-semibold text-muted-foreground shadow-sm transition hover:border-red-500/60 hover:text-red-200"
                                  aria-label={`${item.name}の追加画像${index + 2}を削除`}
                                  onClick={() => handleRemoveAdditionalAsset(item.id, asset.assetId)}
                                  disabled={isProcessingAssets}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <p className="create-gacha-wizard__asset-step-description text-sm text-muted-foreground">
          ここで景品の画像を登録してください。後から追加も出来ます。リアルグッズはサムネ画像があれば、それも登録するのをオススメします。（任意）
        </p>
      </div>
    );
  };

  const renderPtStep = () => {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          １回の消費ptやお得バンドル・天井保証を任意で設定出来ます。後から変更も出来ます。
        </p>
        <button
          type="button"
          id="create-gacha-wizard-pt-guide-button"
          className="create-gacha-wizard__pt-guide-button inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
          onClick={() =>
            push(PtBundleGuaranteeGuideDialog, {
              id: 'pt-bundle-guarantee-guide',
              title: '天井保証・お得バンドルについて',
              size: 'md'
            })
          }
        >
          天井保証・お得バンドルについて
        </button>
        <div className="rounded-2xl border border-border/60 bg-surface/50 p-4 sm:max-h-[45vh] sm:overflow-y-auto sm:pr-1">
          <PtControlsPanel
            settings={ptSettings}
            rarityOptions={rarityOptions}
            itemOptionsByRarity={guaranteeItemOptions}
            isCompleteEnabled={isCompleteGachaEnabled}
            showOptionalHints
            onSettingsChange={setPtSettings}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="flex justify-end">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            ステップ{stepIndex} / {totalSteps}
          </span>
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
        ref={gachaThumbnailInputRef}
        id="create-gacha-wizard-thumbnail-input"
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        className="sr-only"
        onChange={(event) => {
          void handleSelectGachaThumbnail(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.m4a,audio/mp4"
        multiple
        className="sr-only"
        onChange={(event) => {
          const selectedRarityId = pendingAssetRarityIdRef.current;
          pendingAssetRarityIdRef.current = null;
          void handleSelectFiles(event.currentTarget.files, selectedRarityId);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={subAssetInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.m4a,audio/mp4"
        multiple
        className="sr-only"
        onChange={(event) => {
          void handleSelectSubAsset(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
    </>
  );
}
