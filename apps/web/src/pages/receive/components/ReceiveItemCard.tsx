import { useMemo } from 'react';
import { ArrowDownTrayIcon, MusicalNoteIcon, PhotoIcon, PlayCircleIcon } from '@heroicons/react/24/outline';

import { useObjectUrl } from '../hooks/useObjectUrl';
import type { ReceiveMediaItem } from '../types';

interface ReceiveItemCardProps {
  item: ReceiveMediaItem;
  onDownload: (item: ReceiveMediaItem) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '---';
  }
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
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

export function ReceiveItemCard({ item, onDownload }: ReceiveItemCardProps): JSX.Element {
  const objectUrl = useObjectUrl(item.blob);
  const previewNode = useMemo(() => {
    if (!objectUrl) {
      return (
        <div className="receive-item-card-preview-loading flex h-full items-center justify-center text-xs text-muted-foreground">
          <span className="receive-item-card-preview-loading-text">プレビューを準備中…</span>
        </div>
      );
    }

    switch (item.kind) {
      case 'image':
        return <img src={objectUrl} alt={item.filename} className="receive-item-card-image-preview h-full w-full rounded-xl object-contain" />;
      case 'video':
        return <video src={objectUrl} controls className="receive-item-card-video-preview h-full w-full rounded-xl bg-black object-contain" preload="metadata" />;
      case 'audio':
        return (
          <div className="receive-item-card-audio-wrapper flex h-full w-full items-center justify-center rounded-xl bg-black/60 p-4">
            <audio controls src={objectUrl} className="receive-item-card-audio-player w-full" preload="metadata" />
          </div>
        );
      case 'text':
        return (
          <iframe
            src={objectUrl}
            className="receive-item-card-text-preview h-full w-full rounded-xl border border-white/10 bg-black/50"
            title={item.filename}
          />
        );
      default:
        return (
          <div className="receive-item-card-preview-unsupported flex h-full items-center justify-center rounded-xl bg-black/40 text-xs text-muted-foreground">
            <span className="receive-item-card-preview-unsupported-text">プレビュー未対応</span>
          </div>
        );
    }
  }, [item.kind, item.filename, objectUrl]);

  return (
    <div className="receive-item-card-root group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="receive-item-card-preview-container relative aspect-video w-full bg-black/60">{previewNode}</div>
      <div className="receive-item-card-body flex flex-1 flex-col gap-3 p-4">
        <div className="receive-item-card-metadata space-y-1">
          <p className="receive-item-card-filename line-clamp-2 text-base font-semibold text-white">{item.filename}</p>
          <p className="receive-item-card-fileinfo text-sm text-muted-foreground">
            {formatBytes(item.size)}
            {item.mimeType ? ` ・ ${item.mimeType}` : null}
          </p>
        </div>
        <div className="receive-item-card-footer mt-auto flex items-center justify-between">
          <div className="receive-item-card-kind-chip flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-pink-200">
            {resolveKindIcon(item.kind)}
            <span className="receive-item-card-kind-text">{item.kind.toUpperCase()}</span>
          </div>
          <button
            type="button"
            onClick={() => onDownload(item)}
            className="receive-item-card-download-button inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          >
            <ArrowDownTrayIcon className="receive-item-card-download-icon h-5 w-5" aria-hidden="true" />
            <span className="receive-item-card-download-text">保存</span>
          </button>
        </div>
      </div>
    </div>
  );
}
