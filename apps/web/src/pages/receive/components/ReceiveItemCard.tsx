import { useMemo, type CSSProperties } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, MusicalNoteIcon, PhotoIcon, PlayCircleIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

import { getRarityTextPresentation } from '../../../features/rarity/utils/rarityColorPresentation';
import {
  GOLD_HEX,
  RAINBOW_VALUE,
  SILVER_HEX
} from '../../../pages/gacha/components/rarity/color-picker/palette';
import { useObjectUrl } from '../hooks/useObjectUrl';
import type { ReceiveMediaItem } from '../types';

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
  const rarityPresentation = useMemo(
    () => getRarityTextPresentation(item.metadata?.rarityColor),
    [item.metadata?.rarityColor]
  );
  const rarityBadgeStyle = useMemo(
    () => buildRarityBadgeStyle(item.metadata?.rarityColor),
    [item.metadata?.rarityColor]
  );
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
            className="receive-item-card-video-preview h-full w-full rounded-xl bg-black object-contain md:rounded-2xl"
            preload="metadata"
          />
        );
      case 'audio':
        return (
          <div className="receive-item-card-audio-wrapper flex h-full w-full items-center justify-center rounded-xl bg-black/60 p-4 md:rounded-2xl">
            <audio controls src={objectUrl} className="receive-item-card-audio-player w-full" preload="metadata" />
          </div>
        );
      case 'text':
        return (
          <iframe
            src={objectUrl}
            className="receive-item-card-text-preview h-full w-full rounded-xl border border-white/10 bg-black/50 md:rounded-2xl"
            title={item.filename}
          />
        );
      default:
        return (
          <div className="receive-item-card-preview-unsupported flex h-full items-center justify-center rounded-xl bg-black/40 text-xs text-muted-foreground md:rounded-2xl">
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

  return (
    <div className="receive-item-card-root group flex h-full flex-col overflow-visible rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="receive-item-card-content flex w-full gap-4 md:flex-col md:gap-6">
        <div className="receive-item-card-preview-column flex w-24 flex-shrink-0 flex-col gap-3 md:w-full md:flex-shrink">
          <div className="receive-item-card-preview-container relative flex aspect-square h-24 w-full items-center justify-center overflow-visible rounded-xl border border-white/10 bg-black/60 md:aspect-video md:h-auto md:rounded-2xl md:border-transparent">
            {item.metadata?.rarity ? (
              <span
                className={clsx(
                  'receive-item-card-rarity-badge absolute left-[-25px] top-[-25px] rounded-full border border-white/15 px-4 py-1.5 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-black/30',
                  rarityPresentation.className
                )}
                style={{ ...rarityBadgeStyle, ...rarityPresentation.style }}
              >
                {item.metadata.rarity}
              </span>
            ) : null}
            {previewNode}
          </div>
          <div className="receive-item-card-kind-chip-mobile-container md:hidden">
            <div className="receive-item-card-kind-chip flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-pink-200">
              {kindChipInner}
            </div>
          </div>
        </div>
        <div className="receive-item-card-body flex min-w-0 flex-1 flex-col gap-3 md:gap-4">
          <div className="receive-item-card-metadata space-y-2">
            <div className="receive-item-card-title-group space-y-1">
              <p className="receive-item-card-item-name line-clamp-2 text-base font-semibold text-white">
                {item.metadata?.itemName ?? item.filename}
              </p>
              {item.metadata?.gachaName ? (
                <p className="receive-item-card-gacha-name text-sm text-pink-200/80">
                  {item.metadata.gachaName}
                </p>
              ) : null}
            </div>
            <div className="receive-item-card-attribute-group flex flex-wrap gap-2 text-xs text-muted-foreground">
              {typeof item.metadata?.obtainedCount === 'number' ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-count rounded-full border border-white/10 bg-white/10 px-2 py-1 font-medium text-blue-100/80">
                  獲得数: {item.metadata.obtainedCount}
                </span>
              ) : null}
              {item.metadata?.isRiagu ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-riagu rounded-full border border-amber-400/60 bg-amber-500/20 px-2 py-1 font-medium text-amber-100">
                  リアルグッズ
                </span>
              ) : null}
              {item.metadata?.isNewForUser ? (
                <span className="receive-item-card-attribute receive-item-card-attribute-new rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-1 font-semibold text-emerald-100">
                  NEW
                </span>
              ) : null}
            </div>
          </div>
          <div className="receive-item-card-footer mt-auto flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="receive-item-card-kind-chip-desktop-container hidden md:flex">
              <div className="receive-item-card-kind-chip-desktop flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-pink-200">
                {kindChipInner}
              </div>
            </div>
            <div className="receive-item-card-action-group flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => onSave(item)}
                className="receive-item-card-save-button inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <ArrowUpTrayIcon className="receive-item-card-save-icon h-5 w-5" aria-hidden="true" />
                <span className="receive-item-card-save-text">保存</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
