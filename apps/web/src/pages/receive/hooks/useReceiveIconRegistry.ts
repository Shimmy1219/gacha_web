import { useCallback, useMemo, useState } from 'react';

import { useAppPersistence } from '../../../features/storage/AppPersistenceProvider';
import { useGachaLocalStorage } from '../../../features/storage/useGachaLocalStorage';
import { deleteAsset, saveAsset } from '@domain/assets/assetStorage';
import type { ReceivePrefsStateV3 } from '@domain/app-persistence';

export const MAX_RECEIVE_ICON_COUNT = 10;

function sanitizeAssetIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  raw.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  });

  return unique.slice(0, MAX_RECEIVE_ICON_COUNT);
}

function buildNextReceivePrefs(current: ReceivePrefsStateV3 | undefined, patch: Partial<ReceivePrefsStateV3>): ReceivePrefsStateV3 {
  return {
    ...current,
    ...patch,
    version: 3,
    intro: current?.intro ?? { skipIntro: false }
  };
}

export function useReceiveIconRegistry(): {
  iconAssetIds: string[];
  remainingSlots: number;
  isProcessing: boolean;
  error: string | null;
  addIcons: (files: FileList | File[] | null) => Promise<void>;
  removeIcon: (assetId: string) => Promise<void>;
  reload: () => void;
} {
  const persistence = useAppPersistence();
  const storage = useGachaLocalStorage();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iconAssetIds = useMemo(() => {
    const prefs = storage.data?.receivePrefs;
    return sanitizeAssetIds(prefs?.iconAssetIds);
  }, [storage.data?.receivePrefs?.iconAssetIds]);

  const remainingSlots = Math.max(0, MAX_RECEIVE_ICON_COUNT - iconAssetIds.length);

  const persistIconAssetIds = useCallback(
    (nextIds: string[]) => {
      const snapshot = persistence.loadSnapshot();
      const current = snapshot.receivePrefs;
      const nextPrefs = buildNextReceivePrefs(current, { iconAssetIds: nextIds });
      persistence.saveReceivePrefs(nextPrefs);
    },
    [persistence]
  );

  const addIcons = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || remainingSlots <= 0) {
        if (remainingSlots <= 0) {
          setError(`登録できるアイコンは最大${MAX_RECEIVE_ICON_COUNT}枚です。`);
        }
        return;
      }

      setError(null);
      setIsProcessing(true);

      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const targets = fileArray.slice(0, remainingSlots);

      const results = await Promise.allSettled(targets.map(async (file) => saveAsset(file)));
      const createdAssetIds: string[] = [];
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          createdAssetIds.push(result.value.id);
        } else {
          failedCount += 1;
        }
      });

      if (createdAssetIds.length === 0) {
        setError('アイコン画像の保存に失敗しました。もう一度お試しください。');
        setIsProcessing(false);
        return;
      }

      const nextIds = sanitizeAssetIds([...iconAssetIds, ...createdAssetIds]);

      try {
        persistIconAssetIds(nextIds);
      } catch (persistError) {
        console.error('Failed to persist receive icon registry', persistError);
        setError('設定の保存に失敗しました。ブラウザの設定をご確認ください。');
        await Promise.allSettled(createdAssetIds.map((assetId) => deleteAsset(assetId)));
      }

      if (failedCount > 0) {
        setError('一部の画像を保存できませんでした。');
      }

      setIsProcessing(false);
    },
    [iconAssetIds, persistIconAssetIds, remainingSlots]
  );

  const removeIcon = useCallback(
    async (assetId: string) => {
      if (!assetId) {
        return;
      }

      setError(null);
      setIsProcessing(true);

      const nextIds = iconAssetIds.filter((id) => id !== assetId);
      try {
        persistIconAssetIds(nextIds);
      } catch (persistError) {
        console.error('Failed to persist receive icon registry', persistError);
        setError('設定の保存に失敗しました。');
        setIsProcessing(false);
        return;
      }

      try {
        await deleteAsset(assetId);
      } catch (deleteError) {
        console.warn('Failed to delete removed icon asset', deleteError);
      } finally {
        setIsProcessing(false);
      }
    },
    [iconAssetIds, persistIconAssetIds]
  );

  const reload = useCallback(() => {
    storage.reload();
  }, [storage]);

  return {
    iconAssetIds,
    remainingSlots,
    isProcessing,
    error,
    addIcons,
    removeIcon,
    reload
  };
}

