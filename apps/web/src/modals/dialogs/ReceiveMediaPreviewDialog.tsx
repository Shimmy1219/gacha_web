import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlayCircleIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { getRarityTextPresentation } from '../../features/rarity/utils/rarityColorPresentation';
import { useObjectUrl } from '../../pages/receive/hooks/useObjectUrl';
import type { ReceiveMediaItem } from '../../pages/receive/types';

export interface ReceiveMediaPreviewDialogPayload {
  itemName: string;
  gachaName?: string | null;
  rarityLabel?: string | null;
  rarityColor?: string | null;
  mediaItems: ReceiveMediaItem[];
  initialMediaItemId?: string | null;
}

function normalizeMediaItems(items: ReceiveMediaItem[] | null | undefined): ReceiveMediaItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: ReceiveMediaItem[] = [];
  items.forEach((item) => {
    if (!item?.id || seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    normalized.push(item);
  });
  return normalized;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

function resolveTypeLabel(kind: ReceiveMediaItem['kind'] | null | undefined): string {
  if (kind === 'image') {
    return '画像';
  }
  if (kind === 'video') {
    return '動画';
  }
  if (kind === 'audio') {
    return '音声';
  }
  if (kind === 'text') {
    return 'テキスト';
  }
  return '不明な形式';
}

export function ReceiveMediaPreviewDialog({
  payload,
  close
}: ModalComponentProps<ReceiveMediaPreviewDialogPayload>): JSX.Element {
  const resolvedPayload: ReceiveMediaPreviewDialogPayload = payload ?? {
    itemName: '',
    gachaName: null,
    rarityLabel: null,
    rarityColor: null,
    mediaItems: [],
    initialMediaItemId: null
  };
  const mediaItems = useMemo(() => normalizeMediaItems(resolvedPayload.mediaItems), [resolvedPayload.mediaItems]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (mediaItems.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (resolvedPayload.initialMediaItemId) {
      const initialIndex = mediaItems.findIndex((item) => item.id === resolvedPayload.initialMediaItemId);
      if (initialIndex >= 0) {
        setActiveIndex(clampIndex(initialIndex, mediaItems.length));
        return;
      }
    }
    setActiveIndex((current) => clampIndex(current, mediaItems.length));
  }, [mediaItems, resolvedPayload.initialMediaItemId]);

  const activeItem = mediaItems[activeIndex] ?? null;
  const activeObjectUrl = useObjectUrl(activeItem?.blob ?? null);
  const canNavigate = mediaItems.length > 1;
  const typeLabel = resolveTypeLabel(activeItem?.kind);
  const pageLabel = canNavigate ? `${activeIndex + 1} / ${mediaItems.length}` : null;
  const activeName = activeItem?.metadata?.itemName?.trim() || activeItem?.filename || resolvedPayload.itemName;
  const { className: rarityClassName, style: rarityStyle } = getRarityTextPresentation(resolvedPayload.rarityColor ?? undefined);

  if (!payload) {
    return (
      <>
        <ModalBody className="receive-media-preview-dialog__body">
          <p className="receive-media-preview-dialog__fallback-text text-sm text-muted-foreground">
            プレビュー情報を読み込めませんでした。
          </p>
        </ModalBody>
        <ModalFooter className="receive-media-preview-dialog__footer">
          <button
            type="button"
            className="receive-media-preview-dialog__close-button btn btn-primary"
            onClick={close}
          >
            閉じる
          </button>
        </ModalFooter>
      </>
    );
  }

  const goPrevious = () => {
    if (!canNavigate) {
      return;
    }
    setActiveIndex((current) => (current <= 0 ? mediaItems.length - 1 : current - 1));
  };

  const goNext = () => {
    if (!canNavigate) {
      return;
    }
    setActiveIndex((current) => (current + 1) % mediaItems.length);
  };

  const previewNode = (() => {
    if (!activeItem) {
      return (
        <div className="receive-media-preview-dialog__empty-state flex flex-col items-center gap-4 text-muted-foreground">
          <PhotoIcon className="receive-media-preview-dialog__empty-icon h-16 w-16" />
          <p className="receive-media-preview-dialog__empty-text text-sm">プレビューを表示できません。</p>
        </div>
      );
    }

    if (!activeObjectUrl) {
      return (
        <div className="receive-media-preview-dialog__loading-state flex flex-col items-center gap-3 text-muted-foreground">
          <span className="receive-media-preview-dialog__loading-text text-sm">プレビューを準備中…</span>
        </div>
      );
    }

    if (activeItem.kind === 'image') {
      return (
        <img
          src={activeObjectUrl}
          alt={activeName}
          className="receive-media-preview-dialog__image max-h-full w-auto max-w-full object-contain"
        />
      );
    }

    if (activeItem.kind === 'video') {
      return (
        <video
          controls
          src={activeObjectUrl}
          className="receive-media-preview-dialog__video max-h-full w-full max-w-full rounded-xl bg-black object-contain"
          preload="metadata"
        />
      );
    }

    if (activeItem.kind === 'audio') {
      return (
        <div className="receive-media-preview-dialog__audio-wrap flex w-full max-w-2xl flex-col items-center gap-4">
          <MusicalNoteIcon className="receive-media-preview-dialog__audio-icon h-16 w-16 text-muted-foreground" />
          <audio controls src={activeObjectUrl} className="receive-media-preview-dialog__audio-player w-full" preload="metadata" />
        </div>
      );
    }

    if (activeItem.kind === 'text') {
      return (
        <iframe
          src={activeObjectUrl}
          className="receive-media-preview-dialog__text-frame h-full w-full rounded-xl border border-border/60 bg-surface/70"
          title={activeName}
          sandbox=""
        />
      );
    }

    return (
      <div className="receive-media-preview-dialog__unsupported-state flex flex-col items-center gap-4 text-muted-foreground">
        <PlayCircleIcon className="receive-media-preview-dialog__unsupported-icon h-16 w-16" />
        <p className="receive-media-preview-dialog__unsupported-text text-sm">プレビュー未対応の形式です。</p>
      </div>
    );
  })();

  return (
    <>
      <ModalBody className="receive-media-preview-dialog__body flex flex-1 flex-col gap-6 space-y-0 overflow-y-auto">
        <div className="receive-media-preview-dialog__meta-row flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="receive-media-preview-dialog__type-chip rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {typeLabel}
          </span>
          {pageLabel ? (
            <span className="receive-media-preview-dialog__page-chip rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {pageLabel}
            </span>
          ) : null}
          {resolvedPayload.rarityLabel ? (
            <span
              className={clsx(
                'receive-media-preview-dialog__rarity-chip rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold',
                rarityClassName
              )}
              style={rarityStyle}
            >
              {resolvedPayload.rarityLabel}
            </span>
          ) : null}
          {resolvedPayload.gachaName ? (
            <span className="receive-media-preview-dialog__gacha-chip rounded-full border border-white/10 bg-white/5 px-3 py-1 normal-case">
              {resolvedPayload.gachaName}
            </span>
          ) : null}
        </div>
        <p className="receive-media-preview-dialog__asset-name text-sm text-muted-foreground">{activeName}</p>

        <div className="receive-media-preview-dialog__stage-wrapper relative flex h-[min(70vh,720px)] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-surface-deep p-4">
          {canNavigate ? (
            <>
              <button
                type="button"
                className="receive-media-preview-dialog__nav-button receive-media-preview-dialog__nav-button--prev absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                onClick={goPrevious}
                aria-label="前のプレビューを表示"
              >
                <ChevronLeftIcon className="receive-media-preview-dialog__nav-icon h-5 w-5" />
              </button>
              <button
                type="button"
                className="receive-media-preview-dialog__nav-button receive-media-preview-dialog__nav-button--next absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                onClick={goNext}
                aria-label="次のプレビューを表示"
              >
                <ChevronRightIcon className="receive-media-preview-dialog__nav-icon h-5 w-5" />
              </button>
            </>
          ) : null}
          {previewNode}
        </div>

        {canNavigate ? (
          <div className="receive-media-preview-dialog__dot-row flex items-center justify-center gap-2">
            {mediaItems.map((mediaItem, index) => (
              <button
                key={mediaItem.id}
                type="button"
                className={clsx(
                  'receive-media-preview-dialog__dot h-2.5 w-2.5 rounded-full border border-surface-foreground/30 transition',
                  index === activeIndex
                    ? 'receive-media-preview-dialog__dot--active bg-surface-foreground/80'
                    : 'receive-media-preview-dialog__dot--inactive bg-surface-foreground/20 hover:bg-surface-foreground/40'
                )}
                aria-label={`${index + 1}枚目を表示`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter className="receive-media-preview-dialog__footer">
        <button
          type="button"
          className="receive-media-preview-dialog__close-button btn btn-primary"
          onClick={close}
        >
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
