import { MusicalNoteIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';

import { useAssetPreview } from '../features/assets/useAssetPreview';

type ItemPreviewKind = 'image' | 'video' | 'audio' | 'unknown';

interface ItemPreviewState {
  url: string | null;
  kind: ItemPreviewKind;
  hasImage: boolean;
}

interface ItemPreviewBaseProps {
  assetId?: string | null;
  fallbackUrl?: string | null;
  previewUrl?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  iconClassName?: string;
  emptyLabel?: string;
  kindHint?: ItemPreviewKind;
}

function resolveKind(type: string | null | undefined, hint?: ItemPreviewKind): ItemPreviewKind {
  if (type?.startsWith('image/')) {
    return 'image';
  }
  if (type?.startsWith('video/')) {
    return 'video';
  }
  if (type?.startsWith('audio/')) {
    return 'audio';
  }
  return hint ?? 'unknown';
}

function useResolvedPreview({
  assetId,
  fallbackUrl,
  previewUrl,
  kindHint
}: Pick<ItemPreviewBaseProps, 'assetId' | 'fallbackUrl' | 'previewUrl' | 'kindHint'>): ItemPreviewState {
  const preview = useAssetPreview(assetId ?? null);

  const url = previewUrl || preview.url || fallbackUrl || null;
  const kind = resolveKind(preview.type, kindHint ?? (fallbackUrl ? 'image' : undefined));
  const hasImage = kind === 'image' && Boolean(url);

  return {
    url,
    kind,
    hasImage
  };
}

interface ItemPreviewVisualProps extends ItemPreviewBaseProps, ItemPreviewState {}

function ItemPreviewVisual({
  alt,
  url,
  kind,
  hasImage,
  imageClassName,
  iconClassName,
  emptyLabel
}: ItemPreviewVisualProps): JSX.Element {
  if (kind === 'image' && hasImage && url) {
    return <img src={url} alt={alt} className={clsx('h-full w-full object-contain', imageClassName)} />;
  }

  if (kind === 'video') {
    return <VideoCameraIcon className={clsx('h-10 w-10', iconClassName)} aria-hidden="true" />;
  }

  if (kind === 'audio') {
    return <MusicalNoteIcon className={clsx('h-10 w-10', iconClassName)} aria-hidden="true" />;
  }

  if (url) {
    return <img src={url} alt={alt} className={clsx('h-full w-full object-contain', imageClassName)} />;
  }

  if (emptyLabel) {
    return <span className="text-xs font-medium text-muted-foreground">{emptyLabel}</span>;
  }

  return <PhotoIcon className={clsx('h-10 w-10', iconClassName)} aria-hidden="true" />;
}

export interface ItemPreviewButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>,
    ItemPreviewBaseProps {
  canPreview?: boolean;
}

export const ItemPreviewButton = forwardRef<HTMLButtonElement, ItemPreviewButtonProps>(
  (
    {
      assetId = null,
      fallbackUrl = null,
      previewUrl = null,
      alt,
      className,
      imageClassName,
      iconClassName,
      emptyLabel,
      kindHint,
      canPreview = true,
      disabled,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const state = useResolvedPreview({ assetId, fallbackUrl, previewUrl, kindHint });
    const resolvedDisabled = disabled ?? !canPreview;
    const isInteractive = canPreview && !resolvedDisabled;

    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        data-preview-button="true"
        disabled={resolvedDisabled}
        className={clsx(
          'flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-panel-muted text-muted-foreground transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-deep disabled:cursor-default disabled:opacity-90',
          state.hasImage && 'border-transparent',
          isInteractive && 'cursor-zoom-in group-hover/item:bg-panel-contrast',
          className
        )}
      >
        <ItemPreviewVisual
          assetId={assetId}
          fallbackUrl={fallbackUrl}
          previewUrl={previewUrl}
          alt={alt}
          imageClassName={imageClassName}
          iconClassName={iconClassName}
          emptyLabel={emptyLabel}
          kindHint={kindHint}
          {...state}
        />
      </button>
    );
  }
);

ItemPreviewButton.displayName = 'ItemPreviewButton';

export interface ItemPreviewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>,
    ItemPreviewBaseProps {}

export const ItemPreview = forwardRef<HTMLDivElement, ItemPreviewProps>(
  (
    {
      assetId = null,
      fallbackUrl = null,
      previewUrl = null,
      alt,
      className,
      imageClassName,
      iconClassName,
      emptyLabel,
      kindHint,
      ...rest
    },
    ref
  ) => {
    const state = useResolvedPreview({ assetId, fallbackUrl, previewUrl, kindHint });

    return (
      <div
        {...rest}
        ref={ref}
        className={clsx(
          'flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-panel-muted text-muted-foreground',
          state.hasImage && 'border-transparent',
          className
        )}
      >
        <ItemPreviewVisual
          assetId={assetId}
          fallbackUrl={fallbackUrl}
          previewUrl={previewUrl}
          alt={alt}
          imageClassName={imageClassName}
          iconClassName={iconClassName}
          emptyLabel={emptyLabel}
          kindHint={kindHint}
          {...state}
        />
      </div>
    );
  }
);

ItemPreview.displayName = 'ItemPreview';
