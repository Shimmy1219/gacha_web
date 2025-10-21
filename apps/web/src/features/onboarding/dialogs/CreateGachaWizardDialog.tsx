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

import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  type ModalComponentProps
} from '../../../components/modal';
import { useDomainStores } from '../../storage/AppPersistenceProvider';
import { PtControlsPanel } from '../../rarity/components/PtControlsPanel';
import { RarityTable, type RarityTableRow } from '../../rarity/components/RarityTable';
import { DEFAULT_PALETTE } from '../../rarity/components/color-picker/palette';
import { formatRarityRate, parseRarityRateInput } from '../../rarity/utils/rarityRate';
import {
  FALLBACK_RARITY_COLOR,
  generateRandomRarityColor,
  generateRandomRarityEmitRate,
  generateRandomRarityLabel
} from '../../rarity/utils/raritySeed';

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
}

const INITIAL_RARITY_LABELS = ['はずれ', 'N', 'R', 'SR', 'UR'];

function createInitialRarities(): DraftRarity[] {
  const usedColors = new Set<string>();
  return INITIAL_RARITY_LABELS.map((label, index) => {
    const paletteColor = DEFAULT_PALETTE[index]?.value;
    const color = paletteColor ?? generateRandomRarityColor(usedColors);
    usedColors.add(color);
    return {
      id: generateRarityId(),
      label,
      color,
      emitRateInput: ''
    } satisfies DraftRarity;
  });
}

export interface CreateGachaWizardDialogPayload {}

export function CreateGachaWizardDialog({ close }: ModalComponentProps<CreateGachaWizardDialogPayload>): JSX.Element {
  const { appState: appStateStore, rarities: rarityStore, catalog: catalogStore, ptControls: ptControlsStore } =
    useDomainStores();

  const [step, setStep] = useState<WizardStep>('basic');
  const [gachaName, setGachaName] = useState('');
  const [rarities, setRarities] = useState<DraftRarity[]>(() => createInitialRarities());
  const [items, setItems] = useState<DraftItem[]>([]);
  const [ptSettings, setPtSettings] = useState<PtSettingV3 | undefined>(undefined);
  const [isProcessingAssets, setIsProcessingAssets] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createdAssetIdsRef = useRef<Set<string>>(new Set());
  const committedRef = useRef(false);

  useEffect(() => {
    return () => {
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

  const rarityOptions = useMemo(
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
  const canProceedToAssets = gachaName.trim().length > 0 && rarities.length > 0;
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

      setItems((previous) => [
        ...previous,
        ...records.map((record) => ({
          assetId: record.id,
          name: record.name || '無題の景品'
        }))
      ]);

      records.forEach((record) => {
        createdAssetIdsRef.current.add(record.id);
      });
    } catch (error) {
      console.error('画像の保存に失敗しました', error);
      setAssetError('画像の保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsProcessingAssets(false);
    }
  }, []);

  const handleRemoveItem = useCallback((assetId: string) => {
    setItems((previous) => previous.filter((item) => item.assetId !== assetId));
    if (createdAssetIdsRef.current.has(assetId)) {
      createdAssetIdsRef.current.delete(assetId);
      void deleteAsset(assetId);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedName = gachaName.trim();
    if (!trimmedName) {
      setStep('basic');
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

      if (highestRarityId) {
        items.forEach((item, index) => {
          const itemId = generateItemId();
          catalogOrder.push(itemId);
          catalogItems[itemId] = {
            itemId,
            name: item.name || `景品${index + 1}`,
            rarityId: highestRarityId,
            order: index,
            imageAssetId: item.assetId,
            updatedAt: timestamp
          } satisfies GachaCatalogItemV3;
        });
      }

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
    rarityStore
  ]);

  const renderBasicStep = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">ガチャ名</label>
          <input
            type="text"
            value={gachaName}
            onChange={(event) => setGachaName(event.target.value)}
            className="w-full rounded-2xl border border-border/60 bg-[#15151b] px-4 py-3 text-sm text-surface-foreground shadow-inner transition focus:border-accent focus:outline-none"
            placeholder="例：リアルグッズガチャ"
          />
          <p className="text-xs text-muted-foreground">ダッシュボードでの表示名として利用されます。</p>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">レアリティ設定</h3>
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
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.assetId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-[#13131a] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-surface-foreground">{item.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.assetId}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-red-500/60 hover:text-red-200"
                      onClick={() => handleRemoveItem(item.assetId)}
                    >
                      削除
                    </button>
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
        <div className="rounded-2xl border border-border/60 bg-surface/50 p-4">
          <PtControlsPanel settings={ptSettings} rarityOptions={rarityOptions} onSettingsChange={setPtSettings} />
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalHeader title="新規ガチャを作成" description={`ステップ${stepIndex} / ${totalSteps}`} />
      <ModalBody className="space-y-6">
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
            onClick={() => setStep(step === 'basic' ? 'assets' : 'pt')}
            disabled={step === 'basic' ? !canProceedToAssets : !canProceedToPt}
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
