import { useEffect, useMemo, useRef } from 'react';

import { useDomainStores } from './AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { loadAsset, loadAssetPreview } from '@domain/assets/assetStorage';
import {
  type DigitalItemTypeKey,
  inferDigitalItemTypeFromBlob,
  normalizeDigitalItemType
} from '@domain/digital-items/digitalItemTypes';
import type { GachaCatalogStateV4 } from '@domain/app-persistence';

const TARGET_CATALOG_VERSION = 5;
const INFER_CONCURRENCY = 4;

function resolveLikelyPreviewId(assetId: string, thumbnailAssetId?: string | null): string {
  const trimmed = typeof thumbnailAssetId === 'string' ? thumbnailAssetId.trim() : '';
  if (trimmed) {
    return trimmed;
  }
  return `${assetId}:preview`;
}

function inferFromMimeType(mimeType: string | null | undefined): DigitalItemTypeKey | null {
  const normalized = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  if (normalized.startsWith('audio/')) {
    return 'audio';
  }
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  return null;
}

async function inferDigitalItemTypeForAsset(params: {
  assetId: string;
  thumbnailAssetId?: string | null;
}): Promise<DigitalItemTypeKey> {
  const { assetId, thumbnailAssetId } = params;
  if (!assetId) {
    return 'other';
  }

  const previewId = resolveLikelyPreviewId(assetId, thumbnailAssetId);
  const preview = await loadAssetPreview({ assetId, previewId });
  const previewMimeType = preview?.type ?? null;
  const shortcut = inferFromMimeType(previewMimeType);
  if (shortcut) {
    return shortcut;
  }

  if (preview?.previewBlob instanceof Blob) {
    return await inferDigitalItemTypeFromBlob({ blob: preview.previewBlob, mimeType: previewMimeType, kindHint: 'image' });
  }

  const full = await loadAsset(assetId);
  const fullMimeType = full?.type ?? full?.blob?.type ?? previewMimeType ?? null;
  const fullShortcut = inferFromMimeType(fullMimeType);
  if (fullShortcut) {
    return fullShortcut;
  }

  const blob = (full?.previewBlob instanceof Blob ? full.previewBlob : null) ?? (full?.blob instanceof Blob ? full.blob : null);
  if (!blob) {
    return 'other';
  }

  return await inferDigitalItemTypeFromBlob({ blob, mimeType: fullMimeType, kindHint: 'image' });
}

export function CatalogDigitalItemTypeMigrationGate(): null {
  const { catalog: catalogStore } = useDomainStores();
  const catalogState = useStoreValue(catalogStore);
  const isRunningRef = useRef(false);

  const shouldRun = useMemo(() => {
    if (!catalogState) {
      return false;
    }
    const version = typeof catalogState.version === 'number' ? catalogState.version : 4;
    return version < TARGET_CATALOG_VERSION;
  }, [catalogState]);

  useEffect(() => {
    if (!shouldRun) {
      return;
    }
    if (isRunningRef.current) {
      return;
    }
    isRunningRef.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        const state = catalogStore.getState();
        if (!state) {
          return;
        }

        const version = typeof state.version === 'number' ? state.version : 4;
        if (version >= TARGET_CATALOG_VERSION) {
          return;
        }

        const targets = new Map<string, string | null>();
        const cached = new Map<string, DigitalItemTypeKey>();

        Object.values(state.byGacha ?? {}).forEach((gacha) => {
          Object.values(gacha?.items ?? {}).forEach((item) => {
            if (Boolean(item?.riagu)) {
              return;
            }
            const assets = Array.isArray(item?.assets) ? item.assets : [];
            assets.forEach((asset) => {
              const assetId = typeof asset?.assetId === 'string' ? asset.assetId.trim() : '';
              if (!assetId) {
                return;
              }
              const existing = normalizeDigitalItemType((asset as { digitalItemType?: unknown }).digitalItemType);
              if (existing) {
                cached.set(assetId, existing);
                return;
              }
              if (cached.has(assetId)) {
                return;
              }
              const thumb = typeof asset.thumbnailAssetId === 'string' ? asset.thumbnailAssetId : null;
              if (!targets.has(assetId)) {
                targets.set(assetId, thumb);
              }
            });
          });
        });

        const entries = Array.from(targets.entries()).map(([assetId, thumb]) => ({ assetId, thumb }));
        if (entries.length === 0) {
          const timestamp = new Date().toISOString();
          catalogStore.update(
            (previous) => {
              if (!previous) {
                return previous;
              }
              const previousVersion = typeof previous.version === 'number' ? previous.version : 4;
              if (previousVersion >= TARGET_CATALOG_VERSION) {
                return previous;
              }
              return {
                ...previous,
                version: TARGET_CATALOG_VERSION,
                updatedAt: timestamp
              } satisfies GachaCatalogStateV4;
            },
            { persist: 'immediate' }
          );
          return;
        }

        let index = 0;

        const workers = Array.from({ length: Math.min(INFER_CONCURRENCY, entries.length) }, async () => {
          while (true) {
            const currentIndex = index;
            index += 1;
            if (currentIndex >= entries.length) {
              break;
            }
            const entry = entries[currentIndex];
            if (!entry) {
              continue;
            }

            const inferred = await inferDigitalItemTypeForAsset({
              assetId: entry.assetId,
              thumbnailAssetId: entry.thumb
            }).catch((error) => {
              console.warn('Failed to infer digital item type for asset; falling back to other', {
                assetId: entry.assetId,
                error
              });
              return 'other' as DigitalItemTypeKey;
            });

            cached.set(entry.assetId, inferred);
          }
        });

        await Promise.all(workers);

        if (cancelled) {
          return;
        }

        const timestamp = new Date().toISOString();
        catalogStore.update(
          (previous) => {
            if (!previous) {
              return previous;
            }

            const previousVersion = typeof previous.version === 'number' ? previous.version : 4;
            if (previousVersion >= TARGET_CATALOG_VERSION) {
              return previous;
            }

            let changed = false;
            const nextByGacha: GachaCatalogStateV4['byGacha'] = {};

            Object.entries(previous.byGacha ?? {}).forEach(([gachaId, snapshot]) => {
              if (!gachaId || !snapshot) {
                return;
              }

              const nextItems: typeof snapshot.items = {};

              Object.entries(snapshot.items ?? {}).forEach(([itemId, item]) => {
                if (!itemId || !item) {
                  return;
                }

                const assets = Array.isArray(item.assets) ? item.assets : [];
                if (assets.length === 0) {
                  nextItems[itemId] = item;
                  return;
                }

                if (Boolean(item.riagu)) {
                  const nextAssets = assets.map((asset) => {
                    const hasDigitalItemTypeKey = Object.prototype.hasOwnProperty.call(asset ?? {}, 'digitalItemType');
                    const existing = normalizeDigitalItemType((asset as { digitalItemType?: unknown }).digitalItemType);
                    if (!hasDigitalItemTypeKey && !existing) {
                      return asset;
                    }
                    changed = true;
                    const { digitalItemType: _removed, ...rest } = asset as {
                      assetId: string;
                      thumbnailAssetId?: string | null;
                      digitalItemType?: unknown;
                    };
                    return rest;
                  });
                  nextItems[itemId] = { ...item, assets: nextAssets };
                  return;
                }

                const nextAssets = assets.map((asset) => {
                  const assetId = typeof asset?.assetId === 'string' ? asset.assetId.trim() : '';
                  if (!assetId) {
                    return asset;
                  }
                  const existing = normalizeDigitalItemType((asset as { digitalItemType?: unknown }).digitalItemType);
                  if (existing) {
                    return { ...asset, digitalItemType: existing };
                  }
                  const inferred = cached.get(assetId) ?? 'other';
                  changed = true;
                  return { ...asset, digitalItemType: inferred };
                });

                nextItems[itemId] = { ...item, assets: nextAssets };
              });

              nextByGacha[gachaId] = {
                ...snapshot,
                items: nextItems
              };
            });

            if (!changed) {
              return {
                ...previous,
                version: TARGET_CATALOG_VERSION,
                updatedAt: timestamp
              } satisfies GachaCatalogStateV4;
            }

            return {
              ...previous,
              version: TARGET_CATALOG_VERSION,
              updatedAt: timestamp,
              byGacha: nextByGacha
            } satisfies GachaCatalogStateV4;
          },
          { persist: 'immediate' }
        );
      } finally {
        isRunningRef.current = false;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [catalogStore, shouldRun]);

  return null;
}
