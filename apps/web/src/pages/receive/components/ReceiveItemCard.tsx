import { useMemo, type CSSProperties } from 'react';
import { ArrowDownTrayIcon, MusicalNoteIcon, PhotoIcon, PlayCircleIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

import { getRarityTextPresentation } from '../../../features/rarity/utils/rarityColorPresentation';
import {
  GOLD_HEX,
  RAINBOW_VALUE,
  SILVER_HEX
} from '../../../pages/gacha/components/rarity/color-picker/palette';
import { useObjectUrl } from '../hooks/useObjectUrl';
import type { ReceiveMediaItem } from '../types';
import { ReceiveSaveButton } from './ReceiveSaveButtons';
import { IconRingWearDialog, useModal } from '../../../modals';
import { getDigitalItemTypeLabel } from '@domain/digital-items/digitalItemTypes';

interface ReceiveItemCardProps {
  item: ReceiveMediaItem;
  onSave: (item: ReceiveMediaItem) => void | Promise<void>;
}

function resolveKindIcon(kind: ReceiveMediaItem['kind']): JSX.Element {
  switch (kind) {
    case 'image':
      return <PhotoIcon className="receive-item-card-kind-icon receive-item-card-kind-icon-image h-5 w-5" aria-hidden="true" />;
    case 'video':
      return <PlayCircleIcon className="receive-item-card-kind-icon receive-item-card-kind-icon-video h-5 w-5" aria-hidden="true" />;
    case 'audio':
      return <MusicalNoteIcon className="receive-item-card-kind-icon receive-item-card-kind-icon-audio h-5 w-5" aria-hidden="true" />;
    default:
      return <ArrowDownTrayIcon className="receive-item-card-kind-icon receive-item-card-kind-icon-other h-5 w-5" aria-hidden="true" />;
  }
}

function buildRarityBadgeStyle(rarityColor?: string | null): CSSProperties | undefined {
  if (!rarityColor) {
    return undefined;
  }

  const trimmed = rarityColor.trim();
  const normalized = trimmed.toLowerCase();

  if (normalized === RAINBOW_VALUE || normalized === 'rainbow') {
    return {
      backgroundImage:
        'linear-gradient(120deg, #ff6b6b 0%, #fbbf24 25%, #34d399 50%, #60a5fa 70%, #a78bfa 85%, #f472b6 100%)',
      backgroundClip: 'border-box',
      WebkitBackgroundClip: 'border-box',
      borderColor: '#ffffff26',
      color: '#fff',
      WebkitTextFillColor: '#fff',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)'
    };
  }

  if (normalized === GOLD_HEX || normalized === 'gold') {
    return {
      backgroundImage:
        'linear-gradient(135deg, #7a5c13 0%, #ffd56a 30%, #a67c00 50%, #ffe69a 70%, #7a5c13 100%)',
      backgroundClip: 'border-box',
      WebkitBackgroundClip: 'border-box',
      borderColor: '#facc1540',
      color: '#fff',
      WebkitTextFillColor: '#fff',
      boxShadow: '0 10px 25px #facc1540'
    };
  }

  if (normalized === SILVER_HEX || normalized === 'silver') {
    return {
      backgroundImage:
        'linear-gradient(135deg, #6b7280 0%, #e5e7eb 35%, #9ca3af 55%, #f3f4f6 75%, #6b7280 100%)',
      backgroundClip: 'border-box',
      WebkitBackgroundClip: 'border-box',
      borderColor: '#e5e7eb40',
      color: '#fff',
      WebkitTextFillColor: '#fff',
      boxShadow: '0 10px 25px #e5e7eb40'
    };
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return {
      backgroundColor: trimmed,
      borderColor: trimmed,
      color: '#fff',
      boxShadow: `0 10px 25px ${trimmed}40`
    };
  }

  return undefined;
}

export function ReceiveItemCard({ item, onSave }: ReceiveItemCardProps): JSX.Element {
  const objectUrl = useObjectUrl(item.blob);
  const { push } = useModal();
  const rarityPresentation = useMemo(
    () => getRarityTextPresentation(item.metadata?.rarityColor),
    [item.metadata?.rarityColor]
  );
  const rarityBadgeStyle = useMemo(() => {
    const badgeStyle = buildRarityBadgeStyle(item.metadata?.rarityColor);
    const textStyle = rarityPresentation.style;

    if (!badgeStyle && !textStyle) {
      return undefined;
    }

    return {
      ...badgeStyle,
      ...textStyle,
      color: '#fff',
      WebkitTextFillColor: '#fff'
    };
  }, [item.metadata?.rarityColor, rarityPresentation.style]);
  const previewNode = useMemo(() => {
    if (!objectUrl) {
      return (
        <div className="receive-item-card-preview-loading flex h-full items-center justify-center rounded-xl text-xs text-muted-foreground md:rounded-2xl">
          <span className="receive-item-card-preview-loading-text">プレビューを準備中…</span>
        </div>
      );
    }

    switch (item.kind) {
      case 'image':
        return (
          <img
            src={objectUrl}
            alt={item.filename}
            className="receive-item-card-image-preview h-full w-full rounded-xl object-contain md:rounded-2xl"
          />
        );
      case 'video':
        return (
          <video
            src={objectUrl}
            controls
            className="receive-item-card-video-preview h-full w-full rounded-xl bg-surface-deep object-contain md:rounded-2xl"
            preload="metadata"
          />
        );
      case 'audio':
        return (
          <div className="receive-item-card-audio-wrapper flex h-full w-full items-center justify-center rounded-xl bg-surface-deep/80 p-4 md:rounded-2xl">
            <audio controls src={objectUrl} className="receive-item-card-audio-player w-full" preload="metadata" />
          </div>
        );
      case 'text':
        return (
          <iframe
            src={objectUrl}
            className="receive-item-card-text-preview h-full w-full rounded-xl border border-border/60 bg-surface/70 md:rounded-2xl"
            title={item.filename}
            sandbox=""
          />
        );
      default:
        return (
          <div className="receive-item-card-preview-unsupported flex h-full items-center justify-center rounded-xl bg-panel/60 text-xs text-muted-foreground md:rounded-2xl">
            <span className="receive-item-card-preview-unsupported-text">プレビュー未対応</span>
          </div>
        );
    }
  }, [item.kind, item.filename, objectUrl]);

  const kindChipInner = (
    <>
      {resolveKindIcon(item.kind)}
      <span className="receive-item-card-kind-text">{item.kind.toUpperCase()}</span>
    </>
  );

  const canWearIconRing = item.kind === 'image' && item.metadata?.digitalItemType === 'icon-ring';

  return (
    <div className="receive-item-card-root group flex h-full flex-col overflow-visible rounded-2xl border border-border/60 bg-panel/85 p-4 shadow-lg shadow-black/10 backdrop-blur">
      <div className="receive-item-card-content flex w-full gap-4 md:flex-col md:gap-6">
        <div className="receive-item-card-preview-column flex w-24 flex-shrink-0 flex-col gap-3 md:w-full md:flex-shrink md:aspect-[2/1]">
          <div className="receive-item-card-preview-container relative flex aspect-square h-24 w-full items-center justify-center overflow-visible rounded-xl border border-border/60 bg-panel-muted/70 md:h-full md:aspect-auto md:rounded-2xl">
            {item.metadata?.rarity ? (
              <span
                className={clsx(
                  'receive-item-card-rarity-badge absolute left-[-25px] top-[-25px] rounded-full border border-border/60 px-4 py-1.5 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-black/20'
                )}
                style={rarityBadgeStyle}
              >
                {item.metadata.rarity}
              </span>
            ) : null}
            {previewNode}
          </div>
          <div className="receive-item-card-kind-chip-mobile-container md:hidden">
            <div className="receive-item-card-kind-chip flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {kindChipInner}
            </div>
          </div>
        </div>
        <div className="receive-item-card-body flex min-w-0 flex-1 flex-col gap-3 md:gap-4">
          <div className="receive-item-card-metadata space-y-2">
            <div className="receive-item-card-title-group space-y-1">
              <p className="receive-item-card-item-name line-clamp-2 text-base font-semibold text-surface-foreground">
                {item.metadata?.itemName ?? item.filename}
              </p>
              {item.metadata?.gachaName ? (
                <p className="receive-item-card-gacha-name text-sm text-muted-foreground">
                  {item.metadata.gachaName}
                </p>
              ) : null}
            </div>
            <div className="receive-item-card-attribute-group flex flex-wrap gap-2 text-xs text-muted-foreground">
              {typeof item.metadata?.obtainedCount === 'number' ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-count rounded-full border border-border/60 bg-surface/40 px-2 py-1 font-medium text-muted-foreground">
                  獲得数: {item.metadata.obtainedCount}
                </span>
              ) : null}
              {item.metadata?.digitalItemType ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-digital-type rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600">
                  {getDigitalItemTypeLabel(item.metadata.digitalItemType)}
                </span>
              ) : null}
              {item.metadata?.isRiagu ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-riagu rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-1 font-medium text-amber-600">
                  リアルグッズ
                </span>
              ) : null}
              {item.metadata?.isNewForUser ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-new rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-600">
                  NEW
                </span>
              ) : null}
            </div>
          </div>
          <div className="receive-item-card-footer mt-auto flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="receive-item-card-kind-chip-desktop-container hidden md:flex">
              <div className="receive-item-card-kind-chip-desktop flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kindChipInner}
              </div>
            </div>
            <div className="receive-item-card-action-group flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              {canWearIconRing ? (
                <button
                  type="button"
                  className="receive-item-card-wear-button btn btn-muted"
                  onClick={() =>
                    push(IconRingWearDialog, {
                      id: `icon-ring-wear-${item.id}`,
                      title: 'アイコンリングを装着',
                      size: 'lg',
                      payload: { ringItem: item }
                    })
                  }
                >
                  装着
                </button>
              ) : null}
              <ReceiveSaveButton
                onClick={() => onSave(item)}
                className="receive-item-card-save-button"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
