import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { clsx } from 'clsx';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

import { ItemPreview, ItemPreviewButton } from '../../components/ItemPreviewThumbnail';
import {
  getRarityTextPresentation,
  getWhiteRarityTextOutlineStyle,
  isWhiteRarityColor
} from '../../features/rarity/utils/rarityColorPresentation';
import { MultiSelectDropdown, type MultiSelectOption } from '../gacha/components/select/MultiSelectDropdown';
import { ReceiveBulkSaveButton, ReceiveSaveButton } from './components/ReceiveSaveButtons';
import { saveReceiveItem, saveReceiveItems } from './receiveSave';
import {
  loadReceiveZipInventory,
  loadReceiveZipSelectionInfo,
  updateReceiveZipDigitalItemType
} from './receiveZip';
import {
  createHistoryThumbnailKey,
  isHistoryStorageAvailable,
  loadHistoryFile,
  loadHistoryThumbnailBlobMap,
  loadHistoryMetadata,
  persistHistoryMetadata,
  saveHistoryFile
} from './historyStorage';
import type { ReceiveMediaItem, ReceiveMediaKind } from './types';
import { useObjectUrl } from './hooks/useObjectUrl';
import { DIGITAL_ITEM_TYPE_OPTIONS, type DigitalItemTypeKey, getDigitalItemTypeLabel } from '@domain/digital-items/digitalItemTypes';
import { DigitalItemTypeDialog, IconRingWearDialog, ReceiveMediaPreviewDialog, useModal } from '../../modals';
import { ensureReceiveHistoryThumbnailsForEntry, resolveReceiveMediaAssetId } from './receiveThumbnails';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';
import { resolveGachaThumbnailFromBlob } from '../../features/gacha/thumbnailBlobApi';

interface ReceiveInventoryItem {
  key: string;
  baseKey: string;
  gachaName: string;
  gachaId: string | null;
  itemName: string;
  itemId: string | null;
  rarity: string | null;
  rarityColor: string | null;
  isRiagu: boolean;
  obtainedCount: number;
  kind: ReceiveMediaKind;
  digitalItemType: DigitalItemTypeKey | null;
  metadataIds: string[];
  sourceItems: ReceiveMediaItem[];
  previewThumbnailBlob: Blob | null;
  previewCacheKey: string | null;
  isOwned: boolean;
}

interface ReceiveGachaGroup {
  gachaName: string;
  gachaId: string | null;
  ownerNames: string[];
  ownerIds: string[];
  items: ReceiveInventoryItem[];
  ownedKinds: number;
  totalKinds: number;
  ownedCount: number;
  sourceItems: ReceiveMediaItem[];
  entryIds: string[];
  mediaLoaded: boolean;
}

type PreviewKind = 'image' | 'video' | 'audio' | 'unknown';
const MOBILE_PREVIEW_VISIBILITY_MARGIN_PX = 280;
const DESKTOP_PREVIEW_VISIBILITY_MARGIN_PX = 720;
const MOBILE_PREVIEW_RELEASE_DELAY_MS = 3000;
const DESKTOP_PREVIEW_RELEASE_DELAY_MS = 10000;
const MOBILE_PREVIEW_CACHE_MAX_ENTRIES = 90;
const DESKTOP_PREVIEW_CACHE_MAX_ENTRIES = 220;
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';
type VisibilityListener = (isIntersecting: boolean) => void;
type SharedVisibilityObserver = {
  observer: IntersectionObserver;
  listeners: Map<Element, VisibilityListener>;
};
interface SharedPreviewUrlCacheEntry {
  cacheKey: string;
  blob: Blob;
  url: string;
  retainCount: number;
  lastUsedAt: number;
  releaseTimerId: number | null;
}

const sharedVisibilityObserverMap = new Map<string, SharedVisibilityObserver>();
const sharedPreviewUrlCacheMap = new Map<string, SharedPreviewUrlCacheEntry>();

function resolveVisibilityObserverKey(rootMarginPx: number): string {
  return `root:null|threshold:0|margin:${rootMarginPx}px`;
}

function getSharedVisibilityObserver(rootMarginPx: number): SharedVisibilityObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver !== 'function') {
    return null;
  }

  const key = resolveVisibilityObserverKey(rootMarginPx);
  const existing = sharedVisibilityObserverMap.get(key);
  if (existing) {
    return existing;
  }

  const listeners = new Map<Element, VisibilityListener>();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        listeners.get(entry.target)?.(entry.isIntersecting);
      });
    },
    {
      root: null,
      rootMargin: `${rootMarginPx}px 0px`,
      threshold: 0
    }
  );
  const created = { observer, listeners };
  sharedVisibilityObserverMap.set(key, created);
  return created;
}

function releaseSharedVisibilityObserverTarget({
  rootMarginPx,
  target
}: {
  rootMarginPx: number;
  target: Element;
}): void {
  const key = resolveVisibilityObserverKey(rootMarginPx);
  const entry = sharedVisibilityObserverMap.get(key);
  if (!entry) {
    return;
  }
  entry.listeners.delete(target);
  entry.observer.unobserve(target);
  if (entry.listeners.size === 0) {
    entry.observer.disconnect();
    sharedVisibilityObserverMap.delete(key);
  }
}

function useCardViewportVisibility(targetRef: RefObject<HTMLElement>, rootMarginPx: number): boolean {
  const [isInViewport, setIsInViewport] = useState<boolean>(() => typeof window === 'undefined');

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInViewport(true);
      return;
    }
    const target = targetRef.current;
    if (!target) {
      return;
    }

    const evaluateVisibility = () => {
      const rect = target.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const intersectsViewport =
        rect.bottom >= -rootMarginPx &&
        rect.top <= viewportHeight + rootMarginPx &&
        rect.right >= 0 &&
        rect.left <= viewportWidth;
      setIsInViewport((previous) => (previous === intersectsViewport ? previous : intersectsViewport));
    };

    // Initial fallback in case IntersectionObserver callback is delayed.
    evaluateVisibility();

    const sharedObserver = getSharedVisibilityObserver(rootMarginPx);
    if (!sharedObserver) {
      return;
    }

    const listener: VisibilityListener = (isIntersecting) => {
      setIsInViewport((previous) => (previous === isIntersecting ? previous : isIntersecting));
    };
    sharedObserver.listeners.set(target, listener);
    sharedObserver.observer.observe(target);

    return () => {
      releaseSharedVisibilityObserverTarget({ rootMarginPx, target });
    };
  }, [rootMarginPx, targetRef]);

  return isInViewport;
}

function canUseObjectUrlApi(): boolean {
  return (
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'
  );
}

function clearSharedPreviewReleaseTimer(entry: SharedPreviewUrlCacheEntry): void {
  if (entry.releaseTimerId === null || typeof window === 'undefined') {
    return;
  }
  window.clearTimeout(entry.releaseTimerId);
  entry.releaseTimerId = null;
}

function revokeSharedPreviewEntry(entry: SharedPreviewUrlCacheEntry): void {
  clearSharedPreviewReleaseTimer(entry);
  try {
    URL.revokeObjectURL(entry.url);
  } catch (error) {
    console.warn('Failed to revoke shared preview object URL', { cacheKey: entry.cacheKey, error });
  }
}

function dropSharedPreviewCacheEntry(cacheKey: string): void {
  const entry = sharedPreviewUrlCacheMap.get(cacheKey);
  if (!entry) {
    return;
  }
  revokeSharedPreviewEntry(entry);
  sharedPreviewUrlCacheMap.delete(cacheKey);
}

function pruneSharedPreviewUrlCache(maxEntries: number): void {
  if (sharedPreviewUrlCacheMap.size <= maxEntries) {
    return;
  }

  const evictable = Array.from(sharedPreviewUrlCacheMap.values())
    .filter((entry) => entry.retainCount === 0)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  while (sharedPreviewUrlCacheMap.size > maxEntries && evictable.length > 0) {
    const oldest = evictable.shift();
    if (!oldest) {
      break;
    }
    dropSharedPreviewCacheEntry(oldest.cacheKey);
  }
}

function retainSharedPreviewUrl({
  cacheKey,
  blob,
  maxEntries
}: {
  cacheKey: string;
  blob: Blob;
  maxEntries: number;
}): string | null {
  if (!canUseObjectUrlApi()) {
    return null;
  }
  const timestamp = Date.now();
  const existing = sharedPreviewUrlCacheMap.get(cacheKey);
  if (existing) {
    clearSharedPreviewReleaseTimer(existing);
    if (existing.blob === blob) {
      existing.retainCount += 1;
      existing.lastUsedAt = timestamp;
      return existing.url;
    }
    dropSharedPreviewCacheEntry(cacheKey);
  }

  const nextEntry: SharedPreviewUrlCacheEntry = {
    cacheKey,
    blob,
    url: URL.createObjectURL(blob),
    retainCount: 1,
    lastUsedAt: timestamp,
    releaseTimerId: null
  };
  sharedPreviewUrlCacheMap.set(cacheKey, nextEntry);
  pruneSharedPreviewUrlCache(maxEntries);
  return nextEntry.url;
}

function releaseSharedPreviewUrl({
  cacheKey,
  delayMs
}: {
  cacheKey: string;
  delayMs: number;
}): void {
  const entry = sharedPreviewUrlCacheMap.get(cacheKey);
  if (!entry) {
    return;
  }
  clearSharedPreviewReleaseTimer(entry);
  entry.retainCount = Math.max(0, entry.retainCount - 1);
  entry.lastUsedAt = Date.now();
  if (entry.retainCount > 0) {
    return;
  }

  if (!canUseObjectUrlApi() || delayMs <= 0 || typeof window === 'undefined') {
    dropSharedPreviewCacheEntry(cacheKey);
    return;
  }

  entry.releaseTimerId = window.setTimeout(() => {
    const latest = sharedPreviewUrlCacheMap.get(cacheKey);
    if (!latest) {
      return;
    }
    latest.releaseTimerId = null;
    if (latest.retainCount > 0) {
      return;
    }
    dropSharedPreviewCacheEntry(cacheKey);
  }, Math.max(0, delayMs));
}

function clearSharedPreviewUrlCache(): void {
  for (const entry of sharedPreviewUrlCacheMap.values()) {
    revokeSharedPreviewEntry(entry);
  }
  sharedPreviewUrlCacheMap.clear();
}

function useDesktopViewport(): boolean {
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopViewport(event.matches);
    };
    setIsDesktopViewport(mediaQueryList.matches);
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => {
        mediaQueryList.removeEventListener('change', handleChange);
      };
    }
    mediaQueryList.onchange = handleChange;
    return () => {
      mediaQueryList.onchange = null;
    };
  }, []);

  return isDesktopViewport;
}

function useViewportPreviewUrl(
  previewBlob: Blob | null,
  previewCacheKey: string | null,
  isInViewport: boolean,
  releaseDelayMs: number,
  cacheMaxEntries: number
): string | null {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const retainedCacheKeyRef = useRef<string | null>(null);
  const retainedBlobRef = useRef<Blob | null>(null);

  const releaseRetainedPreviewUrl = useCallback((delayMs: number) => {
    const retainedCacheKey = retainedCacheKeyRef.current;
    if (!retainedCacheKey) {
      return;
    }
    releaseSharedPreviewUrl({ cacheKey: retainedCacheKey, delayMs });
    retainedCacheKeyRef.current = null;
    retainedBlobRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      releaseRetainedPreviewUrl(0);
    };
  }, [releaseRetainedPreviewUrl]);

  useEffect(() => {
    if (!canUseObjectUrlApi() || !previewBlob || !previewCacheKey || !isInViewport) {
      releaseRetainedPreviewUrl(releaseDelayMs);
      setPreviewUrl(null);
      return;
    }

    const isRetainingSameKey =
      retainedCacheKeyRef.current === previewCacheKey &&
      retainedBlobRef.current === previewBlob;
    if (isRetainingSameKey) {
      const cached = sharedPreviewUrlCacheMap.get(previewCacheKey);
      if (cached) {
        cached.lastUsedAt = Date.now();
        setPreviewUrl((previous) => (previous === cached.url ? previous : cached.url));
        return;
      }
    }

    releaseRetainedPreviewUrl(releaseDelayMs);

    const nextPreviewUrl = retainSharedPreviewUrl({
      cacheKey: previewCacheKey,
      blob: previewBlob,
      maxEntries: cacheMaxEntries
    });
    if (!nextPreviewUrl) {
      setPreviewUrl(null);
      return;
    }
    retainedCacheKeyRef.current = previewCacheKey;
    retainedBlobRef.current = previewBlob;
    setPreviewUrl(nextPreviewUrl);
  }, [cacheMaxEntries, isInViewport, previewBlob, previewCacheKey, releaseDelayMs, releaseRetainedPreviewUrl]);

  return previewUrl;
}

function resolveGroupKey(gachaId: string | null | undefined, gachaName: string | null | undefined): string {
  const normalizedName = typeof gachaName === 'string' && gachaName.trim().length > 0 ? gachaName.trim() : '不明なガチャ';
  const normalizedId = typeof gachaId === 'string' && gachaId.trim().length > 0 ? gachaId.trim() : null;
  return normalizedId ?? normalizedName;
}

function summarizeGroupItems(items: ReceiveInventoryItem[]): {
  ownedKinds: number;
  totalKinds: number;
  ownedCount: number;
} {
  const ownedCountMap = new Map<string, number>();
  const totalKindSet = new Set<string>();
  items.forEach((item) => {
    totalKindSet.add(item.baseKey);
    if (item.isOwned) {
      const existing = ownedCountMap.get(item.baseKey) ?? 0;
      ownedCountMap.set(item.baseKey, Math.max(existing, item.obtainedCount));
    }
  });
  const ownedKinds = ownedCountMap.size;
  const totalKinds = totalKindSet.size;
  const ownedCount = Array.from(ownedCountMap.values()).reduce((sum, value) => sum + value, 0);
  return { ownedKinds, totalKinds, ownedCount };
}

function sortInventoryItems(items: ReceiveInventoryItem[]): ReceiveInventoryItem[] {
  return [...items].sort((a, b) => {
    if (a.isOwned !== b.isOwned) {
      return a.isOwned ? -1 : 1;
    }
    return a.itemName.localeCompare(b.itemName, 'ja');
  });
}

function resolvePreviewKind(kind: ReceiveMediaKind): PreviewKind {
  if (kind === 'image') {
    return 'image';
  }
  if (kind === 'video') {
    return 'video';
  }
  if (kind === 'audio') {
    return 'audio';
  }
  return 'unknown';
}

function isLikelyImageSource(sourceItem: ReceiveMediaItem): boolean {
  if (sourceItem.kind === 'image') {
    return true;
  }
  if (sourceItem.mimeType?.startsWith('image/')) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i.test(sourceItem.filename);
}

function isLikelyAudioSource(sourceItem: ReceiveMediaItem): boolean {
  if (sourceItem.kind === 'audio') {
    return true;
  }
  if (sourceItem.mimeType?.startsWith('audio/')) {
    return true;
  }
  return /\.(mp3|wav|m4a|aac|ogg)$/i.test(sourceItem.filename);
}

function resolveItemKey(gachaKey: string, itemId: string | null, itemName: string, assetId?: string | null): string {
  if (itemId && itemId.trim()) {
    return assetId && assetId.trim() ? `${gachaKey}:${itemId.trim()}:${assetId.trim()}` : `${gachaKey}:${itemId.trim()}`;
  }
  return assetId && assetId.trim() ? `${gachaKey}:${itemName}:${assetId.trim()}` : `${gachaKey}:${itemName}`;
}

function createGroupDomId(key: string): string {
  return `receive-group-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function formatOwnerNames(names: string[]): string {
  const normalized = Array.from(
    new Set(
      names
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    )
  );
  if (normalized.length === 0) {
    return 'オーナー不明';
  }
  const hasKnownOwner = normalized.some((name) => name !== 'オーナー不明');
  const filtered = hasKnownOwner ? normalized.filter((name) => name !== 'オーナー不明') : normalized;
  if (filtered.length <= 2) {
    return filtered.join(' / ');
  }
  return `${filtered[0]} ほか${filtered.length - 1}名`;
}

function ReceiveInventoryItemCard({
  item,
  onSave,
  onDigitalItemTypeChange,
  isSaving,
  isUpdatingDigitalItemType,
  previewVisibilityMarginPx,
  previewReleaseDelayMs,
  previewCacheMaxEntries
}: {
  item: ReceiveInventoryItem;
  onSave: () => void;
  onDigitalItemTypeChange: (digitalItemType: DigitalItemTypeKey) => void | Promise<void>;
  isSaving: boolean;
  isUpdatingDigitalItemType: boolean;
  previewVisibilityMarginPx: number;
  previewReleaseDelayMs: number;
  previewCacheMaxEntries: number;
}): JSX.Element {
  const { push } = useModal();
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const rarityPresentation = useMemo(
    () => getRarityTextPresentation(item.rarityColor ?? undefined),
    [item.rarityColor]
  );
  const rarityTextStyle = useMemo(() => {
    if (!isWhiteRarityColor(item.rarityColor)) {
      return rarityPresentation.style;
    }

    return {
      ...rarityPresentation.style,
      ...getWhiteRarityTextOutlineStyle()
    };
  }, [item.rarityColor, rarityPresentation.style]);
  const previewKind = resolvePreviewKind(item.kind);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isInViewport = useCardViewportVisibility(cardRef, previewVisibilityMarginPx);
  const imageSourceItem = useMemo(
    () => item.sourceItems.find((sourceItem) => isLikelyImageSource(sourceItem)) ?? null,
    [item.sourceItems]
  );
  const audioSourceItem = useMemo(
    () => item.sourceItems.find((sourceItem) => isLikelyAudioSource(sourceItem)) ?? null,
    [item.sourceItems]
  );
  const audioSourceUrl = useObjectUrl(audioSourceItem?.blob ?? null);
  const previewBlob = useMemo(
    () => item.previewThumbnailBlob ?? imageSourceItem?.blob ?? null,
    [imageSourceItem, item.previewThumbnailBlob]
  );
  const previewCacheKey = useMemo(
    () => item.previewCacheKey ?? imageSourceItem?.id ?? item.key,
    [imageSourceItem?.id, item.key, item.previewCacheKey]
  );
  const visiblePreviewUrl = useViewportPreviewUrl(
    previewBlob,
    previewCacheKey,
    isInViewport,
    previewReleaseDelayMs,
    previewCacheMaxEntries
  );
  const hasSource = item.sourceItems.length > 0;
  const previewSourceItem = useMemo(
    () => imageSourceItem ?? item.sourceItems[0] ?? null,
    [imageSourceItem, item.sourceItems]
  );
  const ringSourceItem = useMemo(
    () => previewSourceItem,
    [previewSourceItem]
  );
  const canOpenPreview = item.isOwned && hasSource && Boolean(previewSourceItem);
  const canWearIconRing = item.isOwned && item.kind === 'image' && item.digitalItemType === 'icon-ring' && Boolean(ringSourceItem);
  const canPlayDigitalAudio = item.isOwned && item.digitalItemType === 'audio' && Boolean(audioSourceUrl);
  const hasSecondaryAction = canWearIconRing || canPlayDigitalAudio;

  useEffect(() => {
    return () => {
      const audioPlayer = audioPlayerRef.current;
      if (!audioPlayer) {
        return;
      }
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    };
  }, [item.key, audioSourceUrl]);

  useEffect(() => {
    if (canPlayDigitalAudio) {
      return;
    }
    const audioPlayer = audioPlayerRef.current;
    if (!audioPlayer) {
      return;
    }
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    setIsAudioPlaying(false);
  }, [canPlayDigitalAudio]);

  const handleToggleAudioPlayback = (): void => {
    if (!canPlayDigitalAudio) {
      return;
    }
    const audioPlayer = audioPlayerRef.current;
    if (!audioPlayer) {
      return;
    }
    if (isAudioPlaying) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      return;
    }
    audioPlayer.currentTime = 0;
    void audioPlayer.play().catch((error) => {
      console.warn('Failed to play receive list item audio', { itemKey: item.key, error });
      setIsAudioPlaying(false);
    });
  };

  return (
    <div
      ref={cardRef}
      className={clsx(
        'receive-list-item-card__root rounded-2xl border border-border/60 bg-panel-muted/70 p-4',
        !item.isOwned && 'opacity-60 grayscale'
      )}
    >
      <div className="receive-list-item-card__content-row flex items-start gap-3">
        <div className="receive-list-item-card__preview-column flex w-16 flex-shrink-0 flex-col items-start gap-1">
          {item.rarity ? (
            <span
              className={clsx('receive-list-item-card__rarity self-start text-base font-bold', rarityPresentation.className)}
              style={rarityTextStyle}
            >
              {item.rarity}
            </span>
          ) : null}
          <ItemPreviewButton
            onClick={() => {
              if (!canOpenPreview || !previewSourceItem) {
                return;
              }
              push(ReceiveMediaPreviewDialog, {
                id: `receive-list-item-preview-${item.key}`,
                title: item.itemName,
                description: item.gachaName,
                size: 'full',
                payload: {
                  itemName: item.itemName,
                  gachaName: item.gachaName,
                  rarityLabel: item.rarity,
                  rarityColor: item.rarityColor,
                  mediaItems: item.sourceItems,
                  initialMediaItemId: previewSourceItem.id
                }
              });
            }}
            canPreview={canOpenPreview}
            previewUrl={visiblePreviewUrl}
            alt={item.itemName}
            kindHint={previewKind}
            imageFit="contain"
            className="receive-list-item-card__preview h-16 w-16 flex-shrink-0 bg-surface-deep"
            iconClassName="h-6 w-6"
            emptyLabel="noImage"
            aria-label={canOpenPreview ? `${item.itemName}のプレビューを開く` : undefined}
            title={canOpenPreview ? 'クリックしてプレビューを拡大' : undefined}
          />
        </div>
        <div className="receive-list-item-card__details-column flex min-w-0 flex-1 flex-col gap-2">
          <p className="receive-list-item-card__item-name line-clamp-2 text-base font-bold text-surface-foreground">{item.itemName}</p>
          <div className="receive-list-item-card__meta-row flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="receive-list-item-card__count chip">x{item.obtainedCount}</span>
            {item.digitalItemType ? (
              <button
                type="button"
                className="receive-list-item-card__digital-type receive-list-item-card__digital-type-button chip cursor-pointer transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!item.isOwned || isUpdatingDigitalItemType}
                onClick={() => {
                  if (!item.isOwned || isUpdatingDigitalItemType) {
                    return;
                  }
                  push(DigitalItemTypeDialog, {
                    id: `receive-list-item-digital-type-${item.key}`,
                    title: 'デジタルアイテムタイプ',
                    size: 'sm',
                    payload: {
                      assetId: item.key,
                      assetName: `${item.gachaName} / ${item.itemName}`,
                      currentType: item.digitalItemType,
                      onSave: ({ digitalItemType }) => {
                        void onDigitalItemTypeChange(digitalItemType);
                      }
                    }
                  });
                }}
                aria-label={`${item.itemName}のデジタルアイテムタイプを変更`}
                title={item.isOwned ? 'タップしてデジタルアイテムタイプを変更' : '未所持アイテムは変更できません'}
              >
                <span className="receive-list-item-card__digital-type-label">{getDigitalItemTypeLabel(item.digitalItemType)}</span>
              </button>
            ) : null}
            {item.isRiagu ? (
              <span className="receive-list-item-card__riagu chip border-amber-500/40 bg-amber-500/10 text-amber-600">リアルグッズ</span>
            ) : null}
          </div>
          {item.isOwned ? (
            <div className="receive-list-item-card__action-row mt-1 flex items-center gap-2">
              {canPlayDigitalAudio ? (
                <audio
                  ref={audioPlayerRef}
                  src={audioSourceUrl ?? undefined}
                  className="receive-list-item-card__audio-player hidden"
                  preload="metadata"
                  onPlay={() => setIsAudioPlaying(true)}
                  onPause={() => setIsAudioPlaying(false)}
                  onEnded={() => setIsAudioPlaying(false)}
                />
              ) : null}
              {canWearIconRing ? (
                <button
                  type="button"
                  className="receive-list-item-card__wear-button btn btn-muted !min-h-0 h-7 flex-1 justify-center px-3 text-xs"
                  disabled={!ringSourceItem}
                  onClick={() => {
                    if (!ringSourceItem) {
                      return;
                    }
                    push(IconRingWearDialog, {
                      id: `icon-ring-wear-list-${item.key}`,
                      title: 'アイコンリングを装着',
                      size: 'lg',
                      payload: { ringItem: ringSourceItem }
                    });
                  }}
                >
                  装着
                </button>
              ) : null}
              {canPlayDigitalAudio ? (
                <button
                  type="button"
                  className="receive-list-item-card__audio-toggle-button btn btn-muted !min-h-0 h-7 flex-1 justify-center px-3 text-xs"
                  onClick={handleToggleAudioPlayback}
                  title={isAudioPlaying ? '音声を停止' : '音声を再生'}
                >
                  {isAudioPlaying ? '再生中' : '再生'}
                </button>
              ) : null}
              <ReceiveSaveButton
                onClick={onSave}
                disabled={isSaving || !hasSource}
                className={clsx(
                  'receive-list-item-card__save-button !min-h-0 h-7 justify-center px-3 text-xs',
                  hasSecondaryAction ? 'flex-1' : 'w-full'
                )}
              />
            </div>
          ) : (
            <div className="receive-list-item-card__ownership-note text-[11px] text-muted-foreground">未所持</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReceiveListPage(): JSX.Element {
  const { appState: appStateStore } = useDomainStores();
  const appState = useStoreValue(appStateStore);
  const [groups, setGroups] = useState<ReceiveGachaGroup[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);
  const [updatingDigitalTypeItemKey, setUpdatingDigitalTypeItemKey] = useState<string | null>(null);
  const [loadingGroupKeys, setLoadingGroupKeys] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [resolvedGroupThumbnailUrlByKey, setResolvedGroupThumbnailUrlByKey] = useState<Record<string, string | null>>({});
  const [digitalItemTypeFilter, setDigitalItemTypeFilter] = useState<DigitalItemTypeKey[] | '*'>('*');
  const [showUnownedItems, setShowUnownedItems] = useState<boolean>(true);
  const groupsRef = useRef<ReceiveGachaGroup[]>([]);
  const collapsedGroupsRef = useRef<Record<string, boolean>>({});
  const loadingGroupKeysRef = useRef<Record<string, boolean>>({});
  const isDesktopViewport = useDesktopViewport();
  const previewVisibilityMarginPx = isDesktopViewport
    ? DESKTOP_PREVIEW_VISIBILITY_MARGIN_PX
    : MOBILE_PREVIEW_VISIBILITY_MARGIN_PX;
  const previewReleaseDelayMs = isDesktopViewport
    ? DESKTOP_PREVIEW_RELEASE_DELAY_MS
    : MOBILE_PREVIEW_RELEASE_DELAY_MS;
  const previewCacheMaxEntries = isDesktopViewport
    ? DESKTOP_PREVIEW_CACHE_MAX_ENTRIES
    : MOBILE_PREVIEW_CACHE_MAX_ENTRIES;

  const digitalItemTypeOptions = useMemo<MultiSelectOption<DigitalItemTypeKey>[]>(
    () =>
      DIGITAL_ITEM_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label
      })),
    []
  );

  const gachaThumbnailMetaById = useMemo(() => {
    const map = new Map<string, { assetId: string | null; blobUrl: string | null; ownerId: string | null }>();
    const meta = appState?.meta ?? {};
    Object.entries(meta).forEach(([gachaId, entry]) => {
      if (!gachaId) {
        return;
      }
      const assetId =
        typeof entry?.thumbnailAssetId === 'string' && entry.thumbnailAssetId.length > 0
          ? entry.thumbnailAssetId
          : null;
      const blobUrl =
        typeof entry?.thumbnailBlobUrl === 'string' && entry.thumbnailBlobUrl.length > 0
          ? entry.thumbnailBlobUrl
          : null;
      const ownerId =
        typeof entry?.thumbnailOwnerId === 'string' && entry.thumbnailOwnerId.length > 0
          ? entry.thumbnailOwnerId
          : null;
      map.set(gachaId, { assetId, blobUrl, ownerId });
    });
    return map;
  }, [appState]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    collapsedGroupsRef.current = collapsedGroups;
  }, [collapsedGroups]);

  useEffect(() => {
    loadingGroupKeysRef.current = loadingGroupKeys;
  }, [loadingGroupKeys]);

  useEffect(() => {
    return () => {
      clearSharedPreviewUrlCache();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isHistoryStorageAvailable()) {
        setError('ブラウザのローカルストレージ・IndexedDBが利用できないため、所持一覧を表示できません。');
        setStatus('error');
        return;
      }

      const historyEntries = loadHistoryMetadata();
      let metadataChanged = false;
      const updatedHistoryEntries = [...historyEntries];
      const seenPullIds = new Set<string>();
      if (historyEntries.length === 0) {
        setGroups([]);
        setStatus('ready');
        return;
      }

      try {
        const gachaMap = new Map<
          string,
          {
            gachaId: string | null;
            gachaName: string;
            ownerNames: Set<string>;
            ownerIds: Set<string>;
            itemMap: Map<string, ReceiveInventoryItem>;
            sourceItems: ReceiveMediaItem[];
            baseKeySet: Set<string>;
            entryIds: Set<string>;
          }
        >();

        for (const entry of historyEntries) {
          const blob = await loadHistoryFile(entry.id);
          if (!blob) {
            continue;
          }

          const selectionInfo = await loadReceiveZipSelectionInfo(blob);
          const pullIds = selectionInfo.pullIds;
          const ownerName = selectionInfo.ownerName;
          const ownerId = selectionInfo.ownerId ?? entry.ownerId ?? null;
          if (pullIds.length > 0 && (!entry.pullIds || entry.pullIds.length === 0)) {
            const index = updatedHistoryEntries.findIndex((candidate) => candidate.id === entry.id);
            if (index >= 0) {
              updatedHistoryEntries[index] = { ...updatedHistoryEntries[index], pullIds };
              metadataChanged = true;
            }
          }
          if (ownerName && (!entry.ownerName || !entry.ownerName.trim())) {
            const index = updatedHistoryEntries.findIndex((candidate) => candidate.id === entry.id);
            if (index >= 0) {
              updatedHistoryEntries[index] = { ...updatedHistoryEntries[index], ownerName };
              metadataChanged = true;
            }
          }
          if (ownerId && (!entry.ownerId || !entry.ownerId.trim())) {
            const index = updatedHistoryEntries.findIndex((candidate) => candidate.id === entry.id);
            if (index >= 0) {
              updatedHistoryEntries[index] = { ...updatedHistoryEntries[index], ownerId };
              metadataChanged = true;
            }
          }

          const [inventory, thumbnailBlobByAssetId] = await Promise.all([
            loadReceiveZipInventory(blob, {
              migrateDigitalItemTypes: true,
              includeMedia: false
            }),
            loadHistoryThumbnailBlobMap(entry.id)
          ]);
          const { metadataEntries, mediaItems, catalog, migratedBlob } = inventory;
          if (migratedBlob) {
            try {
              await saveHistoryFile(entry.id, migratedBlob);
            } catch (error) {
              console.warn('Failed to persist migrated receive history zip from receive/list', { entryId: entry.id, error });
            }
          }
          const ownerLabel = ownerName?.trim() || entry.ownerName?.trim() || 'オーナー不明';
          const hasOverlap = pullIds.some((pullId) => seenPullIds.has(pullId));
          pullIds.forEach((pullId) => seenPullIds.add(pullId));
          const shouldCountInventory = !hasOverlap;

          if (shouldCountInventory) {
            const assetTotalCounts = new Map<string, number>();
            const assetIndexMap = new Map<string, number>();
            const assetKeyMap = new Map<string, string>();
            const fallbackTotalCounts = new Map<string, number>();
            const fallbackIndexMap = new Map<string, number>();

            if (metadataEntries.length > 0) {
              for (const metadata of metadataEntries) {
                const gachaName = metadata.gachaName?.trim() || '不明なガチャ';
                const gachaId = metadata.gachaId?.trim() || null;
                const gachaKey = resolveGroupKey(gachaId, gachaName);
                const itemName = metadata.itemName?.trim() || '名称未設定';
                const itemId = metadata.itemId?.trim() || null;
                const baseKey = `${gachaKey}:${itemId ?? itemName}`;
                assetTotalCounts.set(baseKey, (assetTotalCounts.get(baseKey) ?? 0) + 1);
              }
            } else {
              for (const item of mediaItems) {
                const gachaName = item.metadata?.gachaName?.trim() || '不明なガチャ';
                const gachaId = item.metadata?.gachaId?.trim() || null;
                const gachaKey = resolveGroupKey(gachaId, gachaName);
                const itemName = (item.metadata?.itemName ?? item.filename).trim() || '名称未設定';
                const itemId = item.metadata?.itemId?.trim() || null;
                const baseKey = `${gachaKey}:${itemId ?? itemName}`;
                fallbackTotalCounts.set(baseKey, (fallbackTotalCounts.get(baseKey) ?? 0) + 1);
              }
            }

            for (const metadata of metadataEntries) {
              const gachaName = metadata.gachaName?.trim() || '不明なガチャ';
              const gachaId = metadata.gachaId?.trim() || null;
              const gachaKey = resolveGroupKey(gachaId, gachaName);
              const itemName = metadata.itemName?.trim() || '名称未設定';
              const itemId = metadata.itemId?.trim() || null;
              const baseKey = `${gachaKey}:${itemId ?? itemName}`;
              const totalCount = assetTotalCounts.get(baseKey) ?? 1;
              const nextIndex = (assetIndexMap.get(baseKey) ?? 0) + 1;
              assetIndexMap.set(baseKey, nextIndex);
              const itemDisplayName = totalCount > 1 ? `${itemName}（${nextIndex}）` : itemName;
              const itemKey = resolveItemKey(gachaKey, itemId, itemDisplayName, metadata.id);
              assetKeyMap.set(metadata.id, itemKey);

              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  ownerIds: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: [],
                  baseKeySet: new Set<string>(),
                  entryIds: new Set<string>()
                };
              existingGroup.ownerNames.add(ownerLabel);
              if (ownerId) {
                existingGroup.ownerIds.add(ownerId);
              }
              existingGroup.baseKeySet.add(baseKey);
              existingGroup.entryIds.add(entry.id);

              const itemMap = existingGroup.itemMap;
              const existing = itemMap.get(itemKey);
              const obtained = typeof metadata.obtainedCount === 'number' && Number.isFinite(metadata.obtainedCount)
                ? Math.max(0, metadata.obtainedCount)
                : 1;
              const thumbnailBlob = thumbnailBlobByAssetId.get(metadata.id) ?? null;
              const previewCacheKey = createHistoryThumbnailKey(entry.id, metadata.id);

              if (existing) {
                existing.obtainedCount += obtained;
                existing.isOwned = true;
                if (!existing.metadataIds.includes(metadata.id)) {
                  existing.metadataIds.push(metadata.id);
                }
                if (!existing.previewThumbnailBlob && thumbnailBlob) {
                  existing.previewThumbnailBlob = thumbnailBlob;
                }
                if (!existing.previewCacheKey) {
                  existing.previewCacheKey = previewCacheKey;
                }
              } else {
                itemMap.set(itemKey, {
                  key: itemKey,
                  baseKey,
                  gachaName,
                  gachaId,
                  itemName: itemDisplayName,
                  itemId,
                  rarity: metadata.rarity ?? null,
                  rarityColor: metadata.rarityColor ?? null,
                  isRiagu: Boolean(metadata.isRiagu),
                  obtainedCount: obtained,
                  kind: 'unknown',
                  digitalItemType: metadata.isRiagu ? null : metadata.digitalItemType ?? 'other',
                  metadataIds: [metadata.id],
                  sourceItems: [],
                  previewThumbnailBlob: thumbnailBlob,
                  previewCacheKey,
                  isOwned: true
                });
              }

              if (!gachaMap.has(gachaKey)) {
                gachaMap.set(gachaKey, existingGroup);
              }
            }

            for (const item of mediaItems) {
              const gachaName = item.metadata?.gachaName?.trim() || '不明なガチャ';
              const gachaId = item.metadata?.gachaId?.trim() || null;
              const gachaKey = resolveGroupKey(gachaId, gachaName);
              const itemName = (item.metadata?.itemName ?? item.filename).trim() || '名称未設定';
              const itemId = item.metadata?.itemId?.trim() || null;
              const baseKey = `${gachaKey}:${itemId ?? itemName}`;
              const assetId = item.metadata?.id ?? item.id;
              const mappedKey = assetKeyMap.get(assetId);
              const itemKey = mappedKey ?? resolveItemKey(gachaKey, itemId, itemName, assetId);

              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                  gachaId,
                  gachaName,
                  ownerNames: new Set<string>(),
                  ownerIds: new Set<string>(),
                  itemMap: new Map<string, ReceiveInventoryItem>(),
                  sourceItems: [],
                  baseKeySet: new Set<string>(),
                  entryIds: new Set<string>()
                };
              existingGroup.ownerNames.add(ownerLabel);
              if (ownerId) {
                existingGroup.ownerIds.add(ownerId);
              }
              existingGroup.baseKeySet.add(baseKey);
              existingGroup.entryIds.add(entry.id);

              const itemMap = existingGroup.itemMap;
              const existing = itemMap.get(itemKey);
              const previewThumbnailBlob = thumbnailBlobByAssetId.get(assetId) ?? null;
              const previewCacheKey = createHistoryThumbnailKey(entry.id, assetId);
              if (existing) {
                existing.kind = item.kind;
                if (item.metadata?.isRiagu) {
                  existing.digitalItemType = null;
                } else if (item.metadata?.digitalItemType) {
                  existing.digitalItemType = item.metadata.digitalItemType;
                }
                if (!existing.metadataIds.includes(assetId)) {
                  existing.metadataIds.push(assetId);
                }
                existing.sourceItems.push(item);
                if (!existing.previewThumbnailBlob && previewThumbnailBlob && isLikelyImageSource(item)) {
                  existing.previewThumbnailBlob = previewThumbnailBlob;
                }
                if (!existing.previewCacheKey && isLikelyImageSource(item)) {
                  existing.previewCacheKey = previewCacheKey;
                }
              } else {
                const totalCount = fallbackTotalCounts.get(baseKey) ?? 1;
                const nextIndex = (fallbackIndexMap.get(baseKey) ?? 0) + 1;
                fallbackIndexMap.set(baseKey, nextIndex);
                const itemDisplayName = totalCount > 1 ? `${itemName}（${nextIndex}）` : itemName;
                const obtained = typeof item.metadata?.obtainedCount === 'number' && Number.isFinite(item.metadata.obtainedCount)
                  ? Math.max(0, item.metadata.obtainedCount)
                  : 1;
                itemMap.set(itemKey, {
                  key: itemKey,
                  baseKey,
                  gachaName,
                  gachaId,
                  itemName: itemDisplayName,
                  itemId,
                  rarity: item.metadata?.rarity ?? null,
                  rarityColor: item.metadata?.rarityColor ?? null,
                  isRiagu: Boolean(item.metadata?.isRiagu),
                  obtainedCount: obtained,
                  kind: item.kind,
                  digitalItemType: item.metadata?.isRiagu ? null : item.metadata?.digitalItemType ?? 'other',
                  metadataIds: [assetId],
                  sourceItems: [item],
                  previewThumbnailBlob: isLikelyImageSource(item) ? previewThumbnailBlob : null,
                  previewCacheKey: isLikelyImageSource(item) ? previewCacheKey : null,
                  isOwned: true
                });
              }

              existingGroup.sourceItems.push(item);
              if (!gachaMap.has(gachaKey)) {
                gachaMap.set(gachaKey, existingGroup);
              }
            }
          }

          if (catalog.length > 0) {
            for (const gacha of catalog) {
              const gachaName = gacha.gachaName?.trim() || '不明なガチャ';
              const gachaId = gacha.gachaId?.trim() || null;
              const gachaKey = resolveGroupKey(gachaId, gachaName);
              const existingGroup =
                gachaMap.get(gachaKey) ?? {
                gachaId,
                gachaName,
                ownerNames: new Set<string>(),
                ownerIds: new Set<string>(),
                itemMap: new Map<string, ReceiveInventoryItem>(),
                sourceItems: [],
                baseKeySet: new Set<string>(),
                entryIds: new Set<string>()
              };
              existingGroup.ownerNames.add(ownerLabel);
              if (ownerId) {
                existingGroup.ownerIds.add(ownerId);
              }

              const itemMap = existingGroup.itemMap;
              for (const item of gacha.items) {
                const itemName = item.itemName?.trim() || '名称未設定';
                const itemId = item.itemId?.trim() || null;
                const baseKey = `${gachaKey}:${itemId ?? itemName}`;
                if (existingGroup.baseKeySet.has(baseKey)) {
                  continue;
                }
                const itemKey = resolveItemKey(gachaKey, itemId, itemName);
                const existing = itemMap.get(itemKey);

                if (existing) {
                  if (!existing.rarity && item.rarityLabel) {
                    existing.rarity = item.rarityLabel;
                  }
                  if (!existing.rarityColor && item.rarityColor) {
                    existing.rarityColor = item.rarityColor;
                  }
                  if (!existing.itemId && itemId) {
                    existing.itemId = itemId;
                  }
                  existing.isRiagu = existing.isRiagu || Boolean(item.isRiagu);
                  if (existing.isRiagu) {
                    existing.digitalItemType = null;
                  }
                } else {
                  itemMap.set(itemKey, {
                    key: itemKey,
                    baseKey,
                    gachaName,
                    gachaId,
                    itemName,
                    itemId,
                    rarity: item.rarityLabel ?? null,
                    rarityColor: item.rarityColor ?? null,
                    isRiagu: Boolean(item.isRiagu),
                    obtainedCount: 0,
                    kind: 'unknown',
                    digitalItemType: item.isRiagu ? null : 'other',
                    metadataIds: [],
                    sourceItems: [],
                    previewThumbnailBlob: null,
                    previewCacheKey: null,
                    isOwned: false
                  });
                  existingGroup.baseKeySet.add(baseKey);
                }
              }

              if (!gachaMap.has(gachaKey)) {
                gachaMap.set(gachaKey, existingGroup);
              }
            }
          }
        }

        const nextGroups = Array.from(gachaMap.values()).map(({ ownerNames, ownerIds, gachaId, gachaName, itemMap, sourceItems, entryIds }) => {
          const items = sortInventoryItems(Array.from(itemMap.values()));
          const { ownedKinds, totalKinds, ownedCount } = summarizeGroupItems(items);
          return {
            ownerNames: Array.from(ownerNames).sort((a, b) => a.localeCompare(b)),
            ownerIds: Array.from(ownerIds).sort((a, b) => a.localeCompare(b)),
            gachaId,
            gachaName,
            items,
            ownedKinds,
            totalKinds,
            ownedCount,
            sourceItems,
            entryIds: Array.from(entryIds),
            mediaLoaded: sourceItems.length > 0
          };
        });

        nextGroups.sort((a, b) => {
          return a.gachaName.localeCompare(b.gachaName);
        });

        if (metadataChanged) {
          persistHistoryMetadata(updatedHistoryEntries);
        }

        if (active) {
          setGroups(nextGroups);
          setLoadingGroupKeys({});
          setCollapsedGroups((prev) => {
            const initialState: Record<string, boolean> = {};
            nextGroups.forEach((group) => {
              const groupKey = resolveGroupKey(group.gachaId, group.gachaName);
              initialState[groupKey] = Object.prototype.hasOwnProperty.call(prev, groupKey) ? Boolean(prev[groupKey]) : true;
            });
            return initialState;
          });
          setStatus('ready');
        }
      } catch (loadError) {
        console.error('Failed to load receive list', loadError);
        if (active) {
          setError('所持一覧の読み込みに失敗しました。ブラウザの設定をご確認ください。');
          setStatus('error');
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const requestEntries = groups
      .map((group) => {
        const gachaId = group.gachaId?.trim();
        if (!gachaId) {
          return null;
        }
        const groupKey = resolveGroupKey(group.gachaId, group.gachaName);
        if (group.ownerIds.length > 1) {
          return {
            groupKey,
            gachaId,
            ownerId: null,
            isAmbiguousGroup: true
          };
        }
        return {
          groupKey,
          gachaId,
          ownerId: group.ownerIds[0] ?? null,
          isAmbiguousGroup: false
        };
      })
      .filter((entry): entry is { groupKey: string; gachaId: string; ownerId: string | null; isAmbiguousGroup: boolean } => Boolean(entry));

    if (requestEntries.length === 0) {
      setResolvedGroupThumbnailUrlByKey({});
      return;
    }

    const fixedMap: Record<string, string | null> = {};
    const apiTargets = requestEntries.filter((entry) => {
      if (entry.isAmbiguousGroup) {
        fixedMap[entry.groupKey] = null;
        return false;
      }
      return true;
    });
    if (apiTargets.length === 0) {
      setResolvedGroupThumbnailUrlByKey(fixedMap);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const resolved = await resolveGachaThumbnailFromBlob(
          apiTargets.map((entry) => ({
            gachaId: entry.gachaId,
            ownerId: entry.ownerId
          }))
        );
        if (!active) {
          return;
        }
        const nextMap: Record<string, string | null> = { ...fixedMap };
        apiTargets.forEach((entry, index) => {
          const resolvedEntry = resolved[index];
          if (!resolvedEntry || (resolvedEntry.match !== 'owner' && resolvedEntry.match !== 'fallback')) {
            nextMap[entry.groupKey] = null;
            return;
          }
          nextMap[entry.groupKey] =
            typeof resolvedEntry.url === 'string' && resolvedEntry.url.length > 0
              ? resolvedEntry.url
              : null;
        });
        setResolvedGroupThumbnailUrlByKey(nextMap);
      } catch (error) {
        console.warn('Failed to resolve gacha thumbnails for receive list', error);
        if (active) {
          setResolvedGroupThumbnailUrlByKey(fixedMap);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [groups]);

  const displayGroups = useMemo<ReceiveGachaGroup[]>(() => {
    const selectedDigitalTypeSet =
      digitalItemTypeFilter === '*' ? null : new Set(digitalItemTypeFilter);
    if (selectedDigitalTypeSet && selectedDigitalTypeSet.size === 0) {
      return [];
    }

    return groups
      .map((group) => {
        const filteredItems = group.items.filter((item) => {
          if (!showUnownedItems && !item.isOwned) {
            return false;
          }
          if (selectedDigitalTypeSet) {
            return Boolean(item.digitalItemType) && selectedDigitalTypeSet.has(item.digitalItemType);
          }
          return true;
        });
        if (filteredItems.length === 0) {
          return null;
        }

        const ownedCountMap = new Map<string, number>();
        const totalKindSet = new Set<string>();
        const sourceItems: ReceiveMediaItem[] = [];
        const seenSourceIds = new Set<string>();

        filteredItems.forEach((item) => {
          totalKindSet.add(item.baseKey);
          if (item.isOwned) {
            const existing = ownedCountMap.get(item.baseKey) ?? 0;
            ownedCountMap.set(item.baseKey, Math.max(existing, item.obtainedCount));
          }
          item.sourceItems.forEach((source) => {
            if (seenSourceIds.has(source.id)) {
              return;
            }
            seenSourceIds.add(source.id);
            sourceItems.push(source);
          });
        });

        const ownedKinds = ownedCountMap.size;
        const totalKinds = totalKindSet.size;
        const ownedCount = Array.from(ownedCountMap.values()).reduce((sum, value) => sum + value, 0);

        return {
          ...group,
          items: filteredItems,
          ownedKinds,
          totalKinds,
          ownedCount,
          sourceItems
        };
      })
      .filter((group): group is ReceiveGachaGroup => Boolean(group));
  }, [digitalItemTypeFilter, groups, showUnownedItems]);

  const isBaseEmpty = status === 'ready' && groups.length === 0;
  const isFilteredEmpty = status === 'ready' && groups.length > 0 && displayGroups.length === 0;
  const totalOwnedKinds = useMemo(() => displayGroups.reduce((sum, group) => sum + group.ownedKinds, 0), [displayGroups]);
  const totalKinds = useMemo(() => displayGroups.reduce((sum, group) => sum + group.totalKinds, 0), [displayGroups]);
  const totalOwnedCount = useMemo(() => displayGroups.reduce((sum, group) => sum + group.ownedCount, 0), [displayGroups]);
  const hasSaving = Boolean(savingGroupKey || savingItemKey || updatingDigitalTypeItemKey);

  const loadGroupMedia = useCallback(async (groupKey: string) => {
    const targetGroup = groupsRef.current.find((group) => resolveGroupKey(group.gachaId, group.gachaName) === groupKey);
    if (!targetGroup || targetGroup.mediaLoaded) {
      return;
    }
    if (targetGroup.entryIds.length === 0) {
      setGroups((prev) =>
        prev.map((group) => {
          if (resolveGroupKey(group.gachaId, group.gachaName) !== groupKey) {
            return group;
          }
          return { ...group, mediaLoaded: true };
        })
      );
      return;
    }

    if (loadingGroupKeysRef.current[groupKey]) {
      return;
    }
    const nextLoadingGroupKeys = { ...loadingGroupKeysRef.current, [groupKey]: true };
    loadingGroupKeysRef.current = nextLoadingGroupKeys;
    setLoadingGroupKeys(nextLoadingGroupKeys);

    try {
      const itemPatchMap = new Map<
        string,
        {
          item: ReceiveInventoryItem;
          sourceItems: ReceiveMediaItem[];
        }
      >();
      const loadedSourceItems = new Map<string, ReceiveMediaItem>();

      for (const entryId of targetGroup.entryIds) {
        const blob = await loadHistoryFile(entryId);
        if (!blob) {
          continue;
        }

        const { metadataEntries, mediaItems } = await loadReceiveZipInventory(blob, {
          migrateDigitalItemTypes: false,
          includeMedia: true,
          metadataFilter: (metadata) => resolveGroupKey(metadata.gachaId, metadata.gachaName) === groupKey
        });
        const thumbnailBlobByAssetId = await loadHistoryThumbnailBlobMap(entryId);
        const hasMissingThumbnail = mediaItems.some((item) => {
          if (!isLikelyImageSource(item)) {
            return false;
          }
          const assetId = resolveReceiveMediaAssetId(item);
          return Boolean(assetId) && !thumbnailBlobByAssetId.has(assetId);
        });
        if (hasMissingThumbnail) {
          void ensureReceiveHistoryThumbnailsForEntry({
            entryId,
            mediaItems
          }).catch((error) => {
            console.warn('Failed to backfill receive history thumbnails from receive/list', { entryId, error });
          });
        }

        const groupMetadataEntries = metadataEntries.filter(
          (metadata) => resolveGroupKey(metadata.gachaId, metadata.gachaName) === groupKey
        );
        const assetTotalCounts = new Map<string, number>();
        const assetIndexMap = new Map<string, number>();
        const assetKeyMap = new Map<string, string>();

        groupMetadataEntries.forEach((metadata) => {
          const metadataGachaName = metadata.gachaName?.trim() || '不明なガチャ';
          const metadataGachaId = metadata.gachaId?.trim() || null;
          const metadataGroupKey = resolveGroupKey(metadataGachaId, metadataGachaName);
          const metadataItemName = metadata.itemName?.trim() || '名称未設定';
          const metadataItemId = metadata.itemId?.trim() || null;
          const baseKey = `${metadataGroupKey}:${metadataItemId ?? metadataItemName}`;
          assetTotalCounts.set(baseKey, (assetTotalCounts.get(baseKey) ?? 0) + 1);
        });

        groupMetadataEntries.forEach((metadata) => {
          const metadataGachaName = metadata.gachaName?.trim() || '不明なガチャ';
          const metadataGachaId = metadata.gachaId?.trim() || null;
          const metadataGroupKey = resolveGroupKey(metadataGachaId, metadataGachaName);
          const metadataItemName = metadata.itemName?.trim() || '名称未設定';
          const metadataItemId = metadata.itemId?.trim() || null;
          const baseKey = `${metadataGroupKey}:${metadataItemId ?? metadataItemName}`;
          const totalCount = assetTotalCounts.get(baseKey) ?? 1;
          const nextIndex = (assetIndexMap.get(baseKey) ?? 0) + 1;
          assetIndexMap.set(baseKey, nextIndex);
          const itemDisplayName = totalCount > 1 ? `${metadataItemName}（${nextIndex}）` : metadataItemName;
          assetKeyMap.set(metadata.id, resolveItemKey(metadataGroupKey, metadataItemId, itemDisplayName, metadata.id));
        });

        mediaItems.forEach((mediaItem) => {
          const mediaGachaName = mediaItem.metadata?.gachaName?.trim() || '不明なガチャ';
          const mediaGachaId = mediaItem.metadata?.gachaId?.trim() || null;
          const mediaGroupKey = resolveGroupKey(mediaGachaId, mediaGachaName);
          if (mediaGroupKey !== groupKey) {
            return;
          }
          const mediaItemName = (mediaItem.metadata?.itemName ?? mediaItem.filename).trim() || '名称未設定';
          const mediaItemId = mediaItem.metadata?.itemId?.trim() || null;
          const baseKey = `${mediaGroupKey}:${mediaItemId ?? mediaItemName}`;
          const assetId = resolveReceiveMediaAssetId(mediaItem) ?? mediaItem.id;
          const mappedKey = assetKeyMap.get(assetId);
          const itemKey = mappedKey ?? resolveItemKey(mediaGroupKey, mediaItemId, mediaItemName, assetId);
          const previewThumbnailBlob = thumbnailBlobByAssetId.get(assetId) ?? null;
          const previewCacheKey = createHistoryThumbnailKey(entryId, assetId);
          const obtained =
            typeof mediaItem.metadata?.obtainedCount === 'number' && Number.isFinite(mediaItem.metadata.obtainedCount)
              ? Math.max(0, mediaItem.metadata.obtainedCount)
              : 1;

          const existingPatch = itemPatchMap.get(itemKey);
          if (existingPatch) {
            existingPatch.sourceItems.push(mediaItem);
            if (!existingPatch.item.metadataIds.includes(assetId)) {
              existingPatch.item.metadataIds.push(assetId);
            }
            if (existingPatch.item.kind === 'unknown') {
              existingPatch.item.kind = mediaItem.kind;
            }
            if (mediaItem.metadata?.isRiagu) {
              existingPatch.item.isRiagu = true;
              existingPatch.item.digitalItemType = null;
            } else if (!existingPatch.item.digitalItemType && mediaItem.metadata?.digitalItemType) {
              existingPatch.item.digitalItemType = mediaItem.metadata.digitalItemType;
            }
            if (!existingPatch.item.previewThumbnailBlob && previewThumbnailBlob && isLikelyImageSource(mediaItem)) {
              existingPatch.item.previewThumbnailBlob = previewThumbnailBlob;
            }
            if (!existingPatch.item.previewCacheKey && isLikelyImageSource(mediaItem)) {
              existingPatch.item.previewCacheKey = previewCacheKey;
            }
          } else {
            itemPatchMap.set(itemKey, {
              item: {
                key: itemKey,
                baseKey,
                gachaName: mediaGachaName,
                gachaId: mediaGachaId,
                itemName: mediaItemName,
                itemId: mediaItemId,
                rarity: mediaItem.metadata?.rarity ?? null,
                rarityColor: mediaItem.metadata?.rarityColor ?? null,
                isRiagu: Boolean(mediaItem.metadata?.isRiagu),
                obtainedCount: obtained,
                kind: mediaItem.kind,
                digitalItemType: mediaItem.metadata?.isRiagu ? null : mediaItem.metadata?.digitalItemType ?? 'other',
                metadataIds: [assetId],
                sourceItems: [mediaItem],
                previewThumbnailBlob: isLikelyImageSource(mediaItem) ? previewThumbnailBlob : null,
                previewCacheKey: isLikelyImageSource(mediaItem) ? previewCacheKey : null,
                isOwned: true
              },
              sourceItems: [mediaItem]
            });
          }
          loadedSourceItems.set(mediaItem.id, mediaItem);
        });
      }

      setGroups((prev) =>
        prev.map((group) => {
          if (resolveGroupKey(group.gachaId, group.gachaName) !== groupKey) {
            return group;
          }
          if (group.mediaLoaded) {
            return group;
          }

          const existingItemsByKey = new Map(group.items.map((item) => [item.key, item]));
          const mergedItems = group.items.map((item) => {
            const patch = itemPatchMap.get(item.key);
            if (!patch) {
              return item;
            }
            const mergedSourceMap = new Map<string, ReceiveMediaItem>();
            item.sourceItems.forEach((source) => mergedSourceMap.set(source.id, source));
            patch.sourceItems.forEach((source) => mergedSourceMap.set(source.id, source));
            const mergedMetadataIds = Array.from(new Set([...item.metadataIds, ...patch.item.metadataIds]));
            return {
              ...item,
              kind: item.kind === 'unknown' ? patch.item.kind : item.kind,
              digitalItemType: item.isRiagu ? null : item.digitalItemType ?? patch.item.digitalItemType,
              metadataIds: mergedMetadataIds,
              previewThumbnailBlob: item.previewThumbnailBlob ?? patch.item.previewThumbnailBlob,
              previewCacheKey: item.previewCacheKey ?? patch.item.previewCacheKey,
              sourceItems: Array.from(mergedSourceMap.values())
            };
          });

          itemPatchMap.forEach((patch, key) => {
            if (existingItemsByKey.has(key)) {
              return;
            }
            mergedItems.push(patch.item);
          });

          const mergedItemsSorted = sortInventoryItems(mergedItems);
          const { ownedKinds, totalKinds, ownedCount } = summarizeGroupItems(mergedItemsSorted);
          const mergedSourceMap = new Map(group.sourceItems.map((source) => [source.id, source]));
          loadedSourceItems.forEach((source, sourceId) => {
            mergedSourceMap.set(sourceId, source);
          });

          return {
            ...group,
            items: mergedItemsSorted,
            ownedKinds,
            totalKinds,
            ownedCount,
            sourceItems: Array.from(mergedSourceMap.values()),
            mediaLoaded: true
          };
        })
      );
    } catch (loadError) {
      console.error('Failed to lazy-load receive list group media', { groupKey, loadError });
      // Prevent infinite retry loop when a group media load fails.
      setGroups((prev) =>
        prev.map((group) => {
          if (resolveGroupKey(group.gachaId, group.gachaName) !== groupKey) {
            return group;
          }
          if (group.mediaLoaded) {
            return group;
          }
          return { ...group, mediaLoaded: true };
        })
      );
    } finally {
      const next = { ...loadingGroupKeysRef.current };
      delete next[groupKey];
      loadingGroupKeysRef.current = next;
      setLoadingGroupKeys(next);
    }
  }, []);

  const toggleGroup = useCallback((groupKey: string) => {
    const wasCollapsed = Boolean(collapsedGroupsRef.current[groupKey]);
    const nextCollapsed = !wasCollapsed;
    collapsedGroupsRef.current = {
      ...collapsedGroupsRef.current,
      [groupKey]: nextCollapsed
    };
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: nextCollapsed
    }));
    if (wasCollapsed) {
      void loadGroupMedia(groupKey);
    }
  }, [loadGroupMedia]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    displayGroups.forEach((group) => {
      const groupKey = resolveGroupKey(group.gachaId, group.gachaName);
      const isCollapsed = Boolean(collapsedGroups[groupKey]);
      const isLoading = Boolean(loadingGroupKeys[groupKey]);
      if (!isCollapsed && !isLoading && !group.mediaLoaded) {
        void loadGroupMedia(groupKey);
      }
    });
  }, [collapsedGroups, displayGroups, loadGroupMedia, loadingGroupKeys, status]);

  const handleSaveItem = useCallback(async (item: ReceiveInventoryItem) => {
    const target = item.sourceItems[0];
    if (!target) {
      return;
    }
    if (typeof document === 'undefined') {
      setSaveError('保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setSaveError(null);
    setSavingItemKey(item.key);
    try {
      await saveReceiveItem(target);
    } catch (saveError) {
      console.error('Failed to save receive inventory item', saveError);
      setSaveError('保存中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setSavingItemKey(null);
    }
  }, []);

  const handleSaveGroup = useCallback(async (group: ReceiveGachaGroup) => {
    if (group.sourceItems.length === 0) {
      return;
    }
    if (typeof document === 'undefined') {
      setSaveError('まとめて保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setSaveError(null);
    const groupKey = resolveGroupKey(group.gachaId, group.gachaName);
    setSavingGroupKey(groupKey);
    try {
      await saveReceiveItems(group.sourceItems);
    } catch (saveError) {
      console.error('Failed to save receive inventory group', saveError);
      setSaveError('まとめて保存中にエラーが発生しました。個別保存をお試しください。');
    } finally {
      setSavingGroupKey(null);
    }
  }, []);

  const handleUpdateDigitalItemType = useCallback(
    async (group: ReceiveGachaGroup, item: ReceiveInventoryItem, digitalItemType: DigitalItemTypeKey) => {
      if (!item.isOwned || item.isRiagu || item.digitalItemType === digitalItemType) {
        return;
      }

      const metadataIds = Array.from(
        new Set(item.metadataIds.map((metadataId) => metadataId.trim()).filter((metadataId) => metadataId.length > 0))
      );
      if (metadataIds.length === 0) {
        setSaveError('デジタルアイテムタイプを更新できませんでした。対象メタデータが見つかりません。');
        return;
      }
      if (group.entryIds.length === 0) {
        setSaveError('デジタルアイテムタイプを更新できませんでした。対象履歴が見つかりません。');
        return;
      }

      setSaveError(null);
      setUpdatingDigitalTypeItemKey(item.key);
      const persistedMetadataIdSet = new Set<string>();

      try {
        for (const entryId of group.entryIds) {
          const historyBlob = await loadHistoryFile(entryId);
          if (!historyBlob) {
            continue;
          }

          const { updatedBlob, updatedMetadataIds } = await updateReceiveZipDigitalItemType(historyBlob, {
            metadataIds,
            digitalItemType
          });
          updatedMetadataIds.forEach((metadataId) => {
            persistedMetadataIdSet.add(metadataId);
          });
          if (updatedBlob) {
            await saveHistoryFile(entryId, updatedBlob);
          }
        }

        if (persistedMetadataIdSet.size === 0) {
          setSaveError('デジタルアイテムタイプを更新できませんでした。対象メタデータが履歴内に見つかりません。');
          return;
        }

        const groupKey = resolveGroupKey(group.gachaId, group.gachaName);
        const applyDigitalTypeToSourceItem = (sourceItem: ReceiveMediaItem): ReceiveMediaItem => {
          const sourceMetadataId = sourceItem.metadata?.id?.trim();
          if (!sourceMetadataId || !persistedMetadataIdSet.has(sourceMetadataId) || !sourceItem.metadata) {
            return sourceItem;
          }
          if (sourceItem.metadata.isRiagu || sourceItem.metadata.digitalItemType === digitalItemType) {
            return sourceItem;
          }
          return {
            ...sourceItem,
            metadata: {
              ...sourceItem.metadata,
              digitalItemType
            }
          };
        };

        setGroups((previousGroups) =>
          previousGroups.map((currentGroup) => {
            if (resolveGroupKey(currentGroup.gachaId, currentGroup.gachaName) !== groupKey) {
              return currentGroup;
            }

            const nextItems = currentGroup.items.map((currentItem) => {
              if (currentItem.key !== item.key || currentItem.isRiagu) {
                return currentItem;
              }
              const hasPersistedMetadata = currentItem.metadataIds.some((metadataId) =>
                persistedMetadataIdSet.has(metadataId)
              );
              if (!hasPersistedMetadata) {
                return currentItem;
              }
              return {
                ...currentItem,
                digitalItemType,
                sourceItems: currentItem.sourceItems.map(applyDigitalTypeToSourceItem)
              };
            });

            return {
              ...currentGroup,
              items: nextItems,
              sourceItems: currentGroup.sourceItems.map(applyDigitalTypeToSourceItem)
            };
          })
        );
      } catch (updateError) {
        console.error('Failed to update digital item type from receive list', {
          itemKey: item.key,
          updateError
        });
        setSaveError('デジタルアイテムタイプの更新に失敗しました。もう一度お試しください。');
      } finally {
        setUpdatingDigitalTypeItemKey(null);
      }
    },
    []
  );

  return (
    <div className="receive-list-page min-h-screen text-surface-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        <header className="rounded-3xl bg-panel/85 p-6 backdrop-blur">
          <h1 className="mt-3 text-3xl font-bold">所持アイテム一覧</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            受け取り済みの景品をガチャ単位で表示します。
          </p>
          {status === 'ready' && groups.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              所持 {totalOwnedKinds} 種類 / 全 {totalKinds} 種類 ・ 合計 {totalOwnedCount} 個
            </p>
          ) : null}
          {status === 'ready' && groups.length > 0 ? (
            <div className="receive-list-page__visibility-toggle-row mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="receive-list-page__visibility-toggle-label text-xs font-semibold text-muted-foreground">未所持分を表示する</p>
              <div className="receive-list-page__visibility-toggle-controls flex items-center gap-3">
                <button
                  type="button"
                  className={clsx(
                    'receive-list-page__unowned-toggle-button relative inline-flex h-6 w-11 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep',
                    showUnownedItems
                      ? 'border-accent bg-[rgb(var(--color-accent)/1)]'
                      : 'border-border/60 bg-panel-muted'
                  )}
                  aria-pressed={showUnownedItems}
                  data-state={showUnownedItems ? 'visible' : 'hidden'}
                  aria-label="未所持アイテム表示の切り替え"
                  title={showUnownedItems ? '未所持アイテムを非表示にする' : '未所持アイテムを表示する'}
                  onClick={() => {
                    setShowUnownedItems((previous) => !previous);
                  }}
                >
                  <span
                    className={clsx(
                      'receive-list-page__unowned-toggle-indicator inline-block h-4 w-4 rounded-full transition-all',
                      showUnownedItems
                        ? 'translate-x-[22px] bg-[rgb(var(--color-accent-foreground)/1)]'
                        : 'translate-x-[6px] bg-[rgb(var(--color-surface-foreground)/1)]'
                    )}
                  />
                </button>
              </div>
            </div>
          ) : null}
          {status === 'ready' && groups.length > 0 ? (
            <div className="receive-list-page__filter-row mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="receive-list-page__filter-label text-xs font-semibold text-muted-foreground">フィルタ</p>
              <div className="receive-list-page__filter-control w-full sm:w-[320px]">
                <MultiSelectDropdown<DigitalItemTypeKey>
                  value={digitalItemTypeFilter}
                  options={digitalItemTypeOptions}
                  onChange={setDigitalItemTypeFilter}
                  labels={{
                    all: 'すべて',
                    none: '未選択',
                    multiple: (count) => `${count}種類`
                  }}
                  renderButtonLabel={({ allSelected, selectedValues }) => {
                    if (allSelected) {
                      return 'タイプ: すべて';
                    }
                    if (selectedValues.size === 0) {
                      return 'タイプ: 未選択';
                    }
                    if (selectedValues.size === 1) {
                      const [single] = Array.from(selectedValues);
                      return `タイプ: ${getDigitalItemTypeLabel(single)}`;
                    }
                    return `タイプ: ${selectedValues.size}種類`;
                  }}
                  classNames={{
                    root: 'w-full',
                    button:
                      'w-full justify-between rounded-xl border border-border/60 bg-surface/40 px-4 py-2 text-sm font-semibold text-surface-foreground',
                    menu:
                      'w-full space-y-1 rounded-xl border border-border/60 bg-panel/95 p-2 backdrop-blur-sm'
                  }}
                />
              </div>
            </div>
          ) : null}
        </header>

        {status === 'loading' ? (
          <div className="rounded-2xl border border-border/60 bg-surface/40 px-4 py-3 text-sm text-muted-foreground">
            所持一覧を読み込んでいます…
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {error}
          </div>
        ) : null}

        {saveError ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {saveError}
          </div>
        ) : null}

        {isBaseEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            まだ所持アイテムがありません。/receive で受け取ると一覧に表示されます。
          </div>
        ) : null}

        {isFilteredEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            フィルタに一致するアイテムがありません。
          </div>
        ) : null}

        {displayGroups.length > 0 ? (
          <section className="flex flex-col gap-6">
            {displayGroups.map((group) => {
              const groupKey = resolveGroupKey(group.gachaId, group.gachaName);
              const isCollapsed = Boolean(collapsedGroups[groupKey]);
              const isGroupLoading = Boolean(loadingGroupKeys[groupKey]);
              const contentId = createGroupDomId(groupKey);
              const localMeta = group.gachaId ? gachaThumbnailMetaById.get(group.gachaId) ?? null : null;
              const isLocalOwnerMatched =
                Boolean(localMeta?.ownerId) &&
                group.ownerIds.length === 1 &&
                group.ownerIds[0] === localMeta?.ownerId;
              const gachaThumbnailAssetId = isLocalOwnerMatched ? localMeta?.assetId ?? null : null;
              const gachaThumbnailBlobUrl =
                resolvedGroupThumbnailUrlByKey[groupKey] ??
                (isLocalOwnerMatched ? localMeta?.blobUrl ?? null : null);

              return (
                <div
                  key={groupKey}
                  className="receive-list-page__group-card rounded-3xl border border-border/60 bg-panel/85 p-6"
                >
                  <div className="receive-list-page__group-card-header flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKey)}
                      aria-expanded={!isCollapsed}
                      aria-controls={contentId}
                      className="receive-list-page__group-header-button group w-full text-left"
                    >
                      <div className="receive-list-page__group-header-row flex items-stretch gap-3">
                        <ItemPreview
                          assetId={gachaThumbnailAssetId}
                          fallbackUrl={gachaThumbnailBlobUrl}
                          alt={`${group.gachaName}の配信サムネイル`}
                          kindHint="image"
                          imageFit="cover"
                          emptyLabel="noImage"
                          className="receive-list-page__group-thumbnail aspect-square self-stretch flex-none bg-surface-deep"
                        />
                        <div className="receive-list-page__group-title-wrapper min-w-0 flex-1">
                          <div className="receive-list-page__group-title-row flex items-start gap-2">
                            <h3
                              className="receive-list-page__group-title min-w-0 flex-1 truncate text-lg font-semibold text-surface-foreground"
                              title={group.gachaName}
                            >
                              {group.gachaName}
                            </h3>
                            <ChevronDownIcon
                              className={clsx(
                                'receive-list-page__group-chevron mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                                isCollapsed ? '' : 'rotate-180'
                              )}
                              aria-hidden="true"
                            />
                          </div>
                          <p className="receive-list-page__group-stats text-xs text-muted-foreground">
                            所持 {group.ownedKinds} 種類 / 全 {group.totalKinds} 種類 ・ 合計 {group.ownedCount} 個
                          </p>
                          <p className="receive-list-page__group-owner text-xs text-muted-foreground">
                            オーナー: {formatOwnerNames(group.ownerNames)}
                          </p>
                        </div>
                      </div>
                    </button>
                    <div className="receive-list-page__group-save-row flex">
                      <ReceiveBulkSaveButton
                        onClick={() => handleSaveGroup(group)}
                        isLoading={savingGroupKey === groupKey || isGroupLoading}
                        disabled={hasSaving || isGroupLoading || group.sourceItems.length === 0}
                        tone="accent"
                        showIcon={false}
                        className="receive-list-page__group-save-button w-full justify-center px-4 py-2 text-sm sm:w-auto"
                      />
                    </div>
                  </div>
                  {!isCollapsed ? (
                    <div id={contentId} className="mt-4 space-y-3">
                      {isGroupLoading ? (
                        <div className="rounded-2xl border border-border/60 bg-surface/40 px-4 py-3 text-sm text-muted-foreground">
                          アイテムを読み込んでいます…
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map((item) => (
                          <ReceiveInventoryItemCard
                            key={item.key}
                            item={item}
                            onSave={() => handleSaveItem(item)}
                            onDigitalItemTypeChange={(digitalItemType) =>
                              handleUpdateDigitalItemType(group, item, digitalItemType)
                            }
                            isSaving={savingItemKey === item.key || Boolean(savingGroupKey)}
                            isUpdatingDigitalItemType={updatingDigitalTypeItemKey === item.key}
                            previewVisibilityMarginPx={previewVisibilityMarginPx}
                            previewReleaseDelayMs={previewReleaseDelayMs}
                            previewCacheMaxEntries={previewCacheMaxEntries}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
      </main>
    </div>
  );
}
