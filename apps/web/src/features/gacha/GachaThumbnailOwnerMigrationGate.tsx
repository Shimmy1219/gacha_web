import { useEffect, useRef } from 'react';

import { useDomainStores } from '../storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { loadAsset } from '@domain/assets/assetStorage';
import { useDiscordSession } from '../discord/useDiscordSession';
import {
  deleteGachaThumbnailFromBlob,
  uploadGachaThumbnailToBlob
} from './thumbnailBlobApi';

interface PendingMigrationEntry {
  gachaId: string;
  thumbnailAssetId: string;
  previousOwnerId: string;
  displayName: string;
}

function toMigrationTarget(
  gachaId: string,
  meta: {
    thumbnailAssetId?: string | null;
    thumbnailOwnerId?: string | null;
    displayName?: string;
  } | null | undefined
): PendingMigrationEntry | null {
  const assetId = typeof meta?.thumbnailAssetId === 'string' ? meta.thumbnailAssetId.trim() : '';
  const ownerId = typeof meta?.thumbnailOwnerId === 'string' ? meta.thumbnailOwnerId.trim() : '';
  if (!assetId || !ownerId.startsWith('anon-')) {
    return null;
  }
  return {
    gachaId,
    thumbnailAssetId: assetId,
    previousOwnerId: ownerId,
    displayName: typeof meta?.displayName === 'string' && meta.displayName.trim() ? meta.displayName : gachaId
  };
}

/**
 * 未ログイン状態で作成された配信サムネイル（anon owner）を、
 * Discordログイン後に ownerId へ移行する Gate コンポーネント。
 */
export function GachaThumbnailOwnerMigrationGate(): null {
  const { appState: appStateStore } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const { data: discordSession } = useDiscordSession();
  const migratedForUserIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const discordUserId = discordSession?.user?.id?.trim() ?? '';
    if (!discordUserId || runningRef.current) {
      return;
    }
    if (migratedForUserIdRef.current === discordUserId) {
      return;
    }

    const metaEntries = Object.entries(appState?.meta ?? {});
    if (metaEntries.length === 0) {
      migratedForUserIdRef.current = discordUserId;
      return;
    }

    const targets = metaEntries
      .map(([gachaId, meta]) => toMigrationTarget(gachaId, meta))
      .filter((entry): entry is PendingMigrationEntry => Boolean(entry));
    if (targets.length === 0) {
      migratedForUserIdRef.current = discordUserId;
      return;
    }

    runningRef.current = true;

    // ログイン後の初回のみ、anon owner のサムネイルを新ownerへ再登録する。
    void (async () => {
      const patchMap = new Map<
        string,
        {
          thumbnailBlobUrl: string | null;
          thumbnailOwnerId: string;
          thumbnailUpdatedAt: string | null;
        }
      >();

      for (const target of targets) {
        try {
          const asset = await loadAsset(target.thumbnailAssetId);
          if (!asset?.blob) {
            continue;
          }
          const file = new File([asset.blob], asset.name || `${target.gachaId}.png`, {
            type: asset.type || asset.blob.type || 'image/png'
          });
          const uploaded = await uploadGachaThumbnailToBlob({
            gachaId: target.gachaId,
            file,
            ownerName: discordSession?.user?.name ?? target.displayName,
            discordUserId
          });
          patchMap.set(target.gachaId, {
            thumbnailBlobUrl: uploaded.url,
            thumbnailOwnerId: uploaded.ownerId,
            thumbnailUpdatedAt: uploaded.updatedAt
          });

          // 新ownerへの同期成功後に旧anon側を掃除する。
          await deleteGachaThumbnailFromBlob({
            gachaId: target.gachaId,
            ownerId: target.previousOwnerId,
            discordUserId
          });
        } catch (error) {
          console.warn('Failed to migrate anon gacha thumbnail owner', {
            gachaId: target.gachaId,
            error
          });
        }
      }

      if (patchMap.size > 0) {
        const timestamp = new Date().toISOString();
        appStateStore.update(
          (previous) => {
            if (!previous) {
              return previous;
            }
            const nextMeta = { ...(previous.meta ?? {}) };
            patchMap.forEach((patch, gachaId) => {
              const current = nextMeta[gachaId];
              if (!current) {
                return;
              }
              nextMeta[gachaId] = {
                ...current,
                thumbnailBlobUrl: patch.thumbnailBlobUrl,
                thumbnailOwnerId: patch.thumbnailOwnerId,
                thumbnailUpdatedAt: patch.thumbnailUpdatedAt ?? timestamp,
                updatedAt: timestamp
              };
            });

            return {
              ...previous,
              meta: nextMeta,
              updatedAt: timestamp
            };
          },
          { persist: 'immediate' }
        );
      }

      migratedForUserIdRef.current = discordUserId;
      runningRef.current = false;
    })();
  }, [
    appState?.meta,
    appStateStore,
    discordSession?.user?.id,
    discordSession?.user?.name
  ]);

  return null;
}
