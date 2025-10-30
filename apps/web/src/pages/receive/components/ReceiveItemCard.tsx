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
      return <PhotoIcon className="h-5 w-5" aria-hidden="true" />;
    case 'video':
      return <PlayCircleIcon className="h-5 w-5" aria-hidden="true" />;
    case 'audio':
      return <MusicalNoteIcon className="h-5 w-5" aria-hidden="true" />;
    default:
      return <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />;
  }
}

export function ReceiveItemCard({ item, onDownload }: ReceiveItemCardProps): JSX.Element {
  const objectUrl = useObjectUrl(item.blob);
  const previewNode = useMemo(() => {
    if (!objectUrl) {
      return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">プレビューを準備中…</div>;
    }

    switch (item.kind) {
      case 'image':
        return <img src={objectUrl} alt={item.filename} className="h-full w-full rounded-xl object-contain" />;
      case 'video':
        return <video src={objectUrl} controls className="h-full w-full rounded-xl bg-black object-contain" preload="metadata" />;
      case 'audio':
        return (
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/60 p-4">
            <audio controls src={objectUrl} className="w-full" preload="metadata" />
          </div>
        );
      case 'text':
        return (
          <iframe
            src={objectUrl}
            className="h-full w-full rounded-xl border border-white/10 bg-black/50"
            title={item.filename}
          />
        );
      default:
        return (
          <div className="flex h-full items-center justify-center rounded-xl bg-black/40 text-xs text-muted-foreground">
            プレビュー未対応
          </div>
        );
    }
  }, [item.kind, item.filename, objectUrl]);

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="relative aspect-video w-full bg-black/60">{previewNode}</div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <p className="line-clamp-2 text-base font-semibold text-white">{item.filename}</p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(item.size)}
            {item.mimeType ? ` ・ ${item.mimeType}` : null}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-pink-200">
            {resolveKindIcon(item.kind)}
            <span>{item.kind.toUpperCase()}</span>
          </div>
          <button
            type="button"
            onClick={() => onDownload(item)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          >
            <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
