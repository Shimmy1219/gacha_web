import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import JSZip, { JSZipObject } from 'jszip';

import { ProgressBar } from './components/ProgressBar';
import { ReceiveItemCard } from './components/ReceiveItemCard';
import type { ReceiveItemMetadata, ReceiveMediaItem, ReceiveMediaKind } from './types';
import {
  generateHistoryId,
  isHistoryStorageAvailable,
  loadHistoryFile,
  loadHistoryMetadata,
  persistHistoryMetadata,
  saveHistoryFile,
  type ReceiveHistoryEntryMetadata
} from './historyStorage';
interface ResolveSuccessPayload {
  url: string;
  name?: string;
  purpose?: string;
  exp?: number | string;
}

interface ResolveResponsePayload {
  ok?: boolean;
  url?: string;
  name?: string;
  purpose?: string;
  exp?: number | string;
  error?: string;
  code?: string;
}

class ReceiveResolveError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = 'ReceiveResolveError';
    this.status = options?.status;
    this.code = options?.code;
  }
}

function normalizeExpiration(exp?: number | string): Date | undefined {
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    const date = new Date(exp);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof exp === 'string') {
    const parsed = Date.parse(exp);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return undefined;
}

function describeResolveError(status: number, payload?: ResolveResponsePayload | null): string {
  const code = payload?.code;
  if (code === 'EXPIRED' || status === 410) {
    return 'この受け取りリンクの有効期限が切れています。配信者に再発行を依頼してください。';
  }
  if (code === 'TOKEN_NOT_FOUND' || status === 404) {
    return '受け取りリンクが見つかりませんでした。入力内容を確認してください。';
  }
  if (code === 'INVALID_FORMAT' || code === 'INVALID_PAYLOAD' || status === 400) {
    return '受け取りIDの形式が正しくありません。もう一度確認してください。';
  }
  if (code === 'HOST_NOT_ALLOWED' || status === 403) {
    return 'このリンクの保存先が許可されていないためダウンロードできません。';
  }
  return payload?.error ?? '受け取りリンクの確認に失敗しました。しばらく待って再度お試しください。';
}

async function resolveReceiveToken(token: string, signal?: AbortSignal): Promise<ResolveSuccessPayload> {
  let response: Response;
  try {
    response = await fetch(`/api/receive/resolve?t=${encodeURIComponent(token)}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal
    });
  } catch {
    throw new ReceiveResolveError('受け取りリンクの確認に失敗しました (ネットワークエラー)', { status: 0 });
  }

  let payload: ResolveResponsePayload | null = null;
  try {
    payload = (await response.json()) as ResolveResponsePayload;
  } catch {
    throw new ReceiveResolveError('受け取りリンクの確認に失敗しました (無効な応答)', { status: response.status });
  }

  if (!response.ok || !payload?.ok || !payload.url) {
    const message = describeResolveError(response.status, payload);
    throw new ReceiveResolveError(message, { status: response.status, code: payload?.code });
  }

  return {
    url: payload.url,
    name: payload.name,
    purpose: payload.purpose,
    exp: payload.exp
  };
}

function detectMediaKind(filename: string, mimeType?: string): ReceiveMediaKind {
  const lower = filename.toLowerCase();
  if (mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower)) {
    return 'image';
  }
  if (mimeType?.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(lower)) {
    return 'video';
  }
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(lower)) {
    return 'audio';
  }
  if (/\.(txt|json|md)$/i.test(lower)) {
    return 'text';
  }
  return 'other';
}

async function downloadZipWithProgress(
  url: string,
  options: { signal?: AbortSignal; onProgress?: (loaded: number, total?: number) => void }
): Promise<Blob> {
  const { signal, onProgress } = options;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`ダウンロードに失敗しました (status ${response.status})`);
  }
  const total = Number(response.headers.get('content-length') ?? '0');
  if (!response.body) {
    const blob = await response.blob();
    if (onProgress) {
      onProgress(blob.size, blob.size);
    }
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, Number.isFinite(total) && total > 0 ? total : undefined);
    }
  }

  onProgress?.(loaded, Number.isFinite(total) && total > 0 ? total : undefined);
  return new Blob(chunks, { type: 'application/zip' });
}

function normalizeZipPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\//, '');
}

function deriveDownloadFilename(item: ReceiveMediaItem): string {
  if (item.path) {
    const normalizedPath = normalizeZipPath(item.path);
    const withoutItemsPrefix = normalizedPath.startsWith('items/')
      ? normalizedPath.slice('items/'.length)
      : normalizedPath;
    const sanitized = withoutItemsPrefix.replace(/\/+/g, '__').replace(/__+/g, '__');
    if (sanitized.trim().length > 0) {
      return sanitized;
    }
  }
  return item.filename;
}

function findZipObjectByRelativePath(zip: JSZip, relativePath: string): JSZipObject | undefined {
  const normalized = normalizeZipPath(relativePath);
  const direct = zip.file(normalized);
  if (direct) {
    return direct;
  }

  const candidates = Object.values(zip.files).filter((entry) => !entry.dir);
  return candidates.find((entry) => entry.name === normalized || entry.name.endsWith(`/${normalized}`));
}

async function loadItemsMetadata(zip: JSZip): Promise<Record<string, ReceiveItemMetadata>> {
  const metaEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.endsWith('meta/items.json')
  );
  if (!metaEntry) {
    return {};
  }

  try {
    const jsonText = await metaEntry.async('string');
    const parsed = JSON.parse(jsonText) as Record<string, Omit<ReceiveItemMetadata, 'id'>>;
    const mapped: Record<string, ReceiveItemMetadata> = {};
    for (const [id, metadata] of Object.entries(parsed)) {
      mapped[id] = { id, ...metadata, rarityColor: metadata.rarityColor ?? null };
    }
    return mapped;
  } catch (error) {
    console.error('Failed to parse items metadata', error);
    return {};
  }
}

async function extractMediaItems(
  blob: Blob,
  onProgress?: (processed: number, total: number) => void
): Promise<ReceiveMediaItem[]> {
  const zip = await JSZip.loadAsync(blob);
  const metadataMap = await loadItemsMetadata(zip);
  const metadataEntries = Object.values(metadataMap);

  if (metadataEntries.length > 0) {
    const mediaItems: ReceiveMediaItem[] = [];
    const total = metadataEntries.length;
    let processed = 0;

    for (const metadata of metadataEntries) {
      const entry = findZipObjectByRelativePath(zip, metadata.filePath);
      if (!entry) {
        processed += 1;
        onProgress?.(processed, total);
        continue;
      }

      const blobEntry = await entry.async('blob');
      const filename = entry.name.split('/').pop() ?? entry.name;
      const mimeType = blobEntry.type || undefined;
      mediaItems.push({
        id: metadata.id,
        path: entry.name,
        filename,
        size: blobEntry.size,
        blob: blobEntry,
        mimeType,
        kind: detectMediaKind(filename, mimeType),
        metadata
      });
      processed += 1;
      onProgress?.(processed, total);
    }

    return mediaItems;
  }

  const entries = Object.entries(zip.files).filter(([, file]) => !file.dir && /\/items\//.test(file.name));
  const total = entries.length;
  let processed = 0;
  const mediaItems: ReceiveMediaItem[] = [];

  for (const [path, file] of entries) {
    const filename = path.split('/').pop() ?? path;
    const lowerFilename = filename.toLowerCase();

    if (path.startsWith('__MACOSX/') || lowerFilename.endsWith('.json')) {
      processed += 1;
      onProgress?.(processed, total);
      continue;
    }

    const blobEntry = await file.async('blob');
    if (blobEntry.type === 'application/json') {
      processed += 1;
      onProgress?.(processed, total);
      continue;
    }

    const mimeType = blobEntry.type || undefined;
    mediaItems.push({
      id: path,
      path,
      filename,
      size: blobEntry.size,
      blob: blobEntry,
      mimeType,
      kind: detectMediaKind(filename, mimeType)
    });
    processed += 1;
    onProgress?.(processed, total);
  }

  return mediaItems;
}

function parseInputValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const url = new URL(trimmed);
    const key = url.searchParams.get('key') ?? url.searchParams.get('t');
    return key?.trim() ?? trimmed;
  } catch {
    return trimmed;
  }
}

function formatExpiration(date?: Date): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const DEFAULT_SHARE_FILE_TYPE = 'application/octet-stream';
const MAX_WEB_SHARE_FILE_COUNT = 30;
const MAX_WEB_SHARE_TOTAL_BYTES = 200 * 1024 * 1024;
const BULK_SHARE_TITLE = '受け取りファイル';
const BULK_ARCHIVE_FILENAME = 'received_files.zip';

function createShareFile(filename: string, blob: Blob): File | null {
  if (typeof File === 'undefined') {
    return null;
  }
  try {
    return new File([blob], filename, { type: blob.type || DEFAULT_SHARE_FILE_TYPE });
  } catch (error) {
    console.warn('Failed to create share file', error);
    return null;
  }
}

async function shareFilesIfPossible(files: File[], title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || files.length === 0) {
    return false;
  }
  try {
    if (navigator.canShare({ files })) {
      await navigator.share({ files, title });
      return true;
    }
  } catch (error) {
    console.warn('Web Share API failed', error);
  }
  return false;
}

async function saveOneWithShare(filename: string, blob: Blob): Promise<void> {
  const file = createShareFile(filename, blob);
  if (file) {
    const shared = await shareFilesIfPossible([file], filename);
    if (shared) {
      return;
    }
  }
  triggerBlobDownload(blob, filename);
}

async function saveAllWithShare(items: ReceiveMediaItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const canUseWebShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined';
  if (canUseWebShare) {
    const files: File[] = [];
    let totalSize = 0;
    for (const item of items) {
      const filename = deriveDownloadFilename(item);
      const file = createShareFile(filename, item.blob);
      if (!file) {
        files.length = 0;
        break;
      }
      files.push(file);
      totalSize += item.blob.size;
      if (files.length >= MAX_WEB_SHARE_FILE_COUNT || totalSize > MAX_WEB_SHARE_TOTAL_BYTES) {
        break;
      }
    }

    const shared = await shareFilesIfPossible(files, BULK_SHARE_TITLE);
    if (shared) {
      return;
    }
  }

  const zip = new JSZip();
  for (const item of items) {
    const filename = deriveDownloadFilename(item);
    zip.file(filename, item.blob, { binary: true, compression: 'STORE' });
  }
  const archiveBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await saveOneWithShare(BULK_ARCHIVE_FILENAME, archiveBlob);
}

export function ReceivePage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tokenInput, setTokenInput] = useState<string>('');
  const [resolveStatus, setResolveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveSuccessPayload | null>(null);
  const [downloadPhase, setDownloadPhase] = useState<'waiting' | 'downloading' | 'unpacking' | 'complete'>('waiting');
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total?: number }>({ loaded: 0 });
  const [unpackProgress, setUnpackProgress] = useState<number>(0);
  const [mediaItems, setMediaItems] = useState<ReceiveMediaItem[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isBulkDownloading, setIsBulkDownloading] = useState<boolean>(false);
  const [bulkDownloadError, setBulkDownloadError] = useState<string | null>(null);
  const [cleanupStatus, setCleanupStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ReceiveHistoryEntryMetadata[]>([]);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [historySaveError, setHistorySaveError] = useState<string | null>(null);
  const [isSavingHistory, setIsSavingHistory] = useState<boolean>(false);
  const [isRestoringHistory, setIsRestoringHistory] = useState<boolean>(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState<boolean>(() => {
    const tokenParam = searchParams.get('t');
    return Boolean(tokenParam && tokenParam.trim());
  });

  const activeToken = useMemo(() => {
    const keyParam = searchParams.get('key');
    const tokenParam = searchParams.get('t');
    return (keyParam ?? tokenParam ?? '').trim();
  }, [searchParams]);
  const isShareLinkMode = useMemo(() => {
    const tokenParam = searchParams.get('t');
    return Boolean(tokenParam && tokenParam.trim());
  }, [searchParams]);

  useEffect(() => {
    if (isShareLinkMode) {
      setHasAttemptedLoad(true);
      return;
    }
    if (!activeToken) {
      setHasAttemptedLoad(false);
    }
  }, [activeToken, isShareLinkMode]);

  useEffect(() => {
    setTokenInput(activeToken);
    if (!activeToken) {
      setResolved(null);
      setResolveStatus('idle');
      setResolveError(null);
      setDownloadPhase('waiting');
      setMediaItems([]);
      setActiveHistoryId(null);
      return;
    }

    resolveAbortRef.current?.abort();
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;

    setResolveStatus('loading');
    setResolveError(null);
    setDownloadPhase('waiting');
    setMediaItems([]);
    setDownloadError(null);

    resolveReceiveToken(activeToken, controller.signal)
      .then((payload) => {
        setResolved(payload);
        setResolveStatus('success');
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof ReceiveResolveError ? error.message : '受け取りリンクの確認に失敗しました。';
        setResolveStatus('error');
        setResolveError(message);
        setResolved(null);
      });

    return () => {
      controller.abort();
    };
  }, [activeToken]);

  useEffect(() => {
    return () => {
      resolveAbortRef.current?.abort();
      downloadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setCleanupStatus('idle');
    setCleanupError(null);
  }, [activeToken]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const baseTitle = '景品受け取り | ガチャ結果集計';
    if (resolveStatus === 'success' && resolved?.name) {
      document.title = `${resolved.name} | 景品受け取り`;
      return () => {
        document.title = baseTitle;
      };
    }
    document.title = baseTitle;
  }, [resolveStatus, resolved?.name]);

  useEffect(() => {
    if (!isHistoryStorageAvailable()) {
      setHistoryLoadError('ブラウザのローカルストレージ・IndexedDBが利用できないため、履歴を記録できません。');
      return;
    }
    try {
      const stored = loadHistoryMetadata();
      setHistoryEntries(stored);
    } catch (error) {
      console.error('Failed to load receive history metadata', error);
      setHistoryLoadError('履歴の読み込みに失敗しました。ブラウザの設定をご確認ください。');
    }
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = parseInputValue(tokenInput);
      if (!parsed) {
        setResolveStatus('error');
        setResolveError('受け取りIDを入力してください。');
        return;
      }
      setHasAttemptedLoad(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('t', parsed);
      nextParams.delete('key');
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams, tokenInput]
  );

  const handleStartDownload = useCallback(async () => {
    if (!resolved?.url) {
      return;
    }
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    setDownloadPhase('downloading');
    setDownloadProgress({ loaded: 0 });
    setUnpackProgress(0);
    setDownloadError(null);
    setMediaItems([]);
    setBulkDownloadError(null);
    setIsBulkDownloading(false);
    setCleanupStatus('idle');
    setCleanupError(null);
    setActiveHistoryId(null);
    setHistorySaveError(null);

    try {
      const blob = await downloadZipWithProgress(resolved.url, {
        signal: controller.signal,
        onProgress: (loaded, total) => {
          setDownloadProgress({ loaded, total });
        }
      });
      setDownloadPhase('unpacking');
      const items = await extractMediaItems(blob, (processed, total) => {
        if (total === 0) {
          setUnpackProgress(100);
          return;
        }
        setUnpackProgress(Math.round((processed / total) * 100));
      });
      setMediaItems(items);
      setDownloadPhase('complete');
      await persistHistoryEntry(blob, items);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'ダウンロードに失敗しました。';
      setDownloadError(message);
      setDownloadPhase('waiting');
    }
  }, [persistHistoryEntry, resolved?.url]);

  const handleSaveItem = useCallback(
    async (item: ReceiveMediaItem) => {
      setBulkDownloadError(null);
      try {
        const downloadName = deriveDownloadFilename(item);
        await saveOneWithShare(downloadName, item.blob);
      } catch (error) {
        console.error('Failed to save item with Web Share API fallback', error);
        setBulkDownloadError('保存中にエラーが発生しました。もう一度お試しください。');
      }
    },
    []
  );

  const totalSize = useMemo(() => mediaItems.reduce((sum, item) => sum + item.size, 0), [mediaItems]);
  const expiration = useMemo(() => normalizeExpiration(resolved?.exp), [resolved?.exp]);
  const activeHistoryEntry = useMemo(
    () => historyEntries.find((entry) => entry.id === activeHistoryId) ?? null,
    [activeHistoryId, historyEntries]
  );
  const isViewingHistory = useMemo(() => Boolean(activeHistoryId), [activeHistoryId]);
  const shouldShowSteps = isShareLinkMode || hasAttemptedLoad || isViewingHistory;

  const handleDownloadAll = useCallback(async () => {
    if (mediaItems.length === 0) {
      return;
    }
    if (typeof document === 'undefined') {
      setBulkDownloadError('まとめて保存機能はブラウザ環境でのみ利用できます。');
      return;
    }
    setIsBulkDownloading(true);
    setBulkDownloadError(null);
    try {
      await saveAllWithShare(mediaItems);
    } catch (error) {
      console.error('Failed to perform bulk save', error);
      setBulkDownloadError('まとめて保存中にエラーが発生しました。個別保存をお試しください。');
    } finally {
      setIsBulkDownloading(false);
    }
  }, [mediaItems]);

  const handleCopyLink = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = window.location.href;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopyState('copied');
        setTimeout(() => setCopyState('idle'), 1600);
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch {
      setCopyState('error');
      window.prompt('このURLをコピーしてください', url);
      setTimeout(() => setCopyState('idle'), 1600);
    }
  }, []);

  const persistHistoryEntry = useCallback(
    async (zipBlob: Blob, items: ReceiveMediaItem[]) => {
      if (!isHistoryStorageAvailable()) {
        return;
      }
      setIsSavingHistory(true);
      setHistorySaveError(null);

      const entryId = generateHistoryId();
      const timestamp = new Date().toISOString();
      const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
      const entry: ReceiveHistoryEntryMetadata = {
        id: entryId,
        token: activeToken || null,
        name: resolved?.name ?? null,
        purpose: resolved?.purpose ?? null,
        expiresAt: expiration ? expiration.toISOString() : null,
        downloadedAt: timestamp,
        itemCount: items.length,
        totalBytes,
        previewItems: items.slice(0, 4).map((item) => ({
          id: item.id,
          name: item.filename,
          kind: item.kind,
          size: item.size
        }))
      };

      try {
        await saveHistoryFile(entryId, zipBlob);
        const nextEntries = [entry, ...historyEntries.filter((h) => h.id !== entryId)].slice(0, 50);
        setHistoryEntries(nextEntries);
        persistHistoryMetadata(nextEntries);
        setActiveHistoryId(entryId);
      } catch (error) {
        console.error('Failed to persist receive history', error);
        setHistorySaveError('履歴の保存に失敗しました。ブラウザの設定をご確認ください。');
      } finally {
        setIsSavingHistory(false);
      }
    },
    [activeToken, expiration, historyEntries, resolved?.name, resolved?.purpose]
  );

  const handleSelectHistory = useCallback(
    async (entry: ReceiveHistoryEntryMetadata) => {
      resolveAbortRef.current?.abort();
      downloadAbortRef.current?.abort();
      setHasAttemptedLoad(true);
      setActiveHistoryId(entry.id);
      setIsRestoringHistory(true);
      setIsBulkDownloading(false);
      setBulkDownloadError(null);
      setCleanupStatus('idle');
      setCleanupError(null);
      setDownloadError(null);
      setResolveStatus('success');
      setResolved({
        url: '',
        name: entry.name ?? undefined,
        purpose: entry.purpose ?? undefined,
        exp: entry.expiresAt ?? undefined
      });
      setDownloadPhase('unpacking');
      setUnpackProgress(0);
      setMediaItems([]);

      try {
        const blob = await loadHistoryFile(entry.id);
        if (!blob) {
          throw new Error('保存済みのファイルが見つかりませんでした。履歴を削除して再度お試しください。');
        }
        const items = await extractMediaItems(blob, (processed, total) => {
          if (total === 0) {
            setUnpackProgress(100);
            return;
          }
          setUnpackProgress(Math.round((processed / total) * 100));
        });
        setMediaItems(items);
        setDownloadPhase('complete');
      } catch (error) {
        const message = error instanceof Error ? error.message : '履歴の読み込み中にエラーが発生しました。';
        setDownloadError(message);
        setDownloadPhase('waiting');
      } finally {
        setIsRestoringHistory(false);
      }
    },
    []
  );

  const handleCleanupBlob = useCallback(async () => {
    if (cleanupStatus === 'working' || cleanupStatus === 'success') {
      return;
    }
    if (!activeToken) {
      setCleanupStatus('error');
      setCleanupError('受け取りIDが確認できません。もう一度お試しください。');
      return;
    }

    setCleanupStatus('working');
    setCleanupError(null);

    try {
      const response = await fetch('/api/receive/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: activeToken })
      });

      let payload: { ok?: boolean; error?: string } | null = null;
      try {
        payload = (await response.json()) as { ok?: boolean; error?: string };
      } catch {
        // ignore json parse errors
      }

      if (!response.ok || !payload?.ok) {
        const message = payload?.error ?? 'ファイルの削除に失敗しました。時間を置いて再度お試しください。';
        throw new Error(message);
      }

      setCleanupStatus('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ファイルの削除に失敗しました。もう一度お試しください。';
      setCleanupError(message);
      setCleanupStatus('error');
    }
  }, [activeToken, cleanupStatus]);

  const renderResolveStatus = () => {
    if (resolveStatus === 'loading') {
      return (
        <div className="receive-page-resolve-status-loading flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="receive-page-resolve-status-loading-icon h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="receive-page-resolve-status-loading-text">リンクを確認しています…</span>
        </div>
      );
    }
    if (resolveStatus === 'error' && resolveError) {
      return (
        <div className="receive-page-resolve-status-error flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          <ExclamationTriangleIcon className="receive-page-resolve-status-error-icon mt-0.5 h-5 w-5" aria-hidden="true" />
          <span className="receive-page-resolve-status-error-text">{resolveError}</span>
        </div>
      );
    }
    if (resolveStatus === 'success' && resolved) {
      const expiryText = formatExpiration(expiration);
      return (
        <div className="receive-page-resolve-status-success flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="receive-page-resolve-status-success-chip rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pink-200">
            {isViewingHistory ? '履歴を表示中' : 'リンク確認済み'}
          </span>
          {resolved.name ? <span className="receive-page-resolve-status-success-name">ファイル名: {resolved.name}</span> : null}
          {expiryText ? <span className="receive-page-resolve-status-success-expiry">期限: {expiryText}</span> : null}
          {activeHistoryEntry ? (
            <span className="receive-page-resolve-status-success-expiry inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
              <ClockIcon className="h-4 w-4" />
              {formatDateTime(activeHistoryEntry.downloadedAt)} に受け取り
            </span>
          ) : null}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="receive-page-root relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="receive-page-background pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.18),_transparent_55%)]" aria-hidden="true" />
      <main className="receive-page-content relative z-10 mx-auto w-full max-w-6xl px-6 py-16 lg:px-10">
        <div className="grid gap-6 xl:grid-cols-[1.6fr,1fr]">
          <div className="flex flex-col gap-6">
            <div className="receive-page-hero-card rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="receive-page-hero-header flex flex-wrap items-start justify-between gap-4">
                <div className="receive-page-hero-info space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="receive-page-hero-label inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pink-200">
                      <SparklesIcon className="h-4 w-4" />
                      景品受け取り
                    </span>
                    {isViewingHistory ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                        <ClockIcon className="h-4 w-4" />
                        履歴を表示中
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <h1 className="receive-page-hero-title text-3xl font-bold tracking-tight">共有リンクから景品を受け取る</h1>
                    <p className="receive-page-hero-description max-w-2xl text-sm text-muted-foreground">
                      受け取りIDを入力するか、右側の履歴から選択するとすぐにダウンロード・復元できます。履歴はブラウザに自動保存され、リロード後も残ります。
                    </p>
                  </div>
                  <div className="receive-page-hero-status-wrapper">{renderResolveStatus()}</div>
                </div>
                {!isShareLinkMode ? (
                  <div className="receive-page-hero-actions flex flex-col items-end gap-3">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="receive-page-copy-page-url-button inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    >
                      {copyState === 'copied' ? (
                        <CheckIcon className="receive-page-copy-success-icon h-5 w-5" aria-hidden="true" />
                      ) : (
                        <ClipboardDocumentIcon className="receive-page-copy-default-icon h-5 w-5" aria-hidden="true" />
                      )}
                      <span className="receive-page-copy-button-text">{copyState === 'copied' ? 'コピーしました' : 'このページのURLをコピー'}</span>
                    </button>
                  </div>
                ) : null}
              </div>

              {!isShareLinkMode ? (
                <form onSubmit={handleSubmit} className="receive-page-token-form mt-8 grid gap-6 lg:grid-cols-[2fr,auto] lg:items-end">
                  <div className="receive-page-token-field space-y-2">
                    <label htmlFor="receive-token" className="receive-page-token-label text-sm font-medium text-white">
                      受け取りID または 共有リンク
                    </label>
                    <input
                      id="receive-token"
                      type="text"
                      value={tokenInput}
                      onChange={(event) => {
                        setTokenInput(event.target.value);
                        if (resolveStatus === 'error') {
                          setResolveError(null);
                          setResolveStatus('idle');
                        }
                      }}
                      placeholder="例: https://example.com/receive?t=XXXXXXXXXX"
                      className="receive-page-token-input w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-base text-white shadow-inner shadow-black/40 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-400"
                    />
                    <p className="receive-page-token-helper text-xs text-muted-foreground">
                      10 桁の英数字 ID または配信者から共有された URL を貼り付けてください。
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="receive-page-token-submit-button inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 text-lg font-semibold text-white shadow-xl shadow-rose-900/40 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                  >
                    <span className="receive-page-token-submit-button-text">リンクを読み込む</span>
                  </button>
                </form>
              ) : null}
            </div>

            {shouldShowSteps ? (
              <div className="receive-page-steps-card rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl shadow-black/50 backdrop-blur">
                <div className="receive-page-steps-content flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="receive-page-steps-description">
                    <h2 className="receive-page-steps-title text-2xl font-semibold">手順</h2>
                    <ol className="receive-page-steps-list mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                      <li className="receive-page-step-item">「受け取る」ボタンを押すとブラウザ上でZIPのダウンロードが始まります（端末には自動保存されません）。</li>
                      <li className="receive-page-step-item">ダウンロード完了後に自動で解凍し、画像・動画・音声などの項目を一覧表示します。</li>
                      <li className="receive-page-step-item">各項目の「保存」ボタンで、端末に個別保存できます。</li>
                    </ol>
                  </div>
                  <div className="receive-page-steps-actions flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleStartDownload}
                      disabled={resolveStatus !== 'success' || downloadPhase === 'downloading' || downloadPhase === 'unpacking'}
                      className="receive-page-start-download-button inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-8 py-3 text-lg font-semibold text-white shadow-xl shadow-rose-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                    >
                      <span className="receive-page-start-download-button-text">{isViewingHistory ? 'もう一度受け取る' : '受け取る'}</span>
                    </button>
                    {downloadError ? (
                      <div className="receive-page-download-error-banner rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{downloadError}</div>
                    ) : null}
                  </div>
                </div>

                {(downloadPhase === 'downloading' || downloadPhase === 'unpacking') && (
                  <div className="receive-page-progress-section mt-6 space-y-4">
                    <ProgressBar
                      label={isRestoringHistory ? '履歴から復元' : 'ダウンロード'}
                      value={
                        isRestoringHistory
                          ? undefined
                          : downloadProgress.total
                            ? Math.min(100, Math.round((downloadProgress.loaded / downloadProgress.total) * 100))
                            : undefined
                      }
                    />
                    <ProgressBar label="解凍" value={downloadPhase === 'unpacking' ? unpackProgress : 0} />
                  </div>
                )}

                {downloadPhase === 'complete' && mediaItems.length > 0 ? (
                  <div className="receive-page-completion-summary mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-muted-foreground">
                    <span className="receive-page-completion-summary-text">
                      {mediaItems.length} 件 ・ 合計 {formatBytes(totalSize)}
                      {resolved?.purpose ? ` ・ 用途: ${resolved.purpose}` : ''}
                    </span>
                    <div className="receive-page-completion-summary-actions flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleDownloadAll}
                        disabled={isBulkDownloading}
                        className="receive-page-bulk-download-button inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
                      >
                        {isBulkDownloading ? (
                          <ArrowPathIcon className="receive-page-bulk-download-spinner h-5 w-5 animate-spin" aria-hidden="true" />
                        ) : (
                          <ArrowDownTrayIcon className="receive-page-bulk-download-icon h-5 w-5" aria-hidden="true" />
                        )}
                        <span className="receive-page-bulk-download-button-text">まとめて保存</span>
                      </button>
                      <span className="receive-page-completion-summary-status text-xs uppercase tracking-wide text-pink-200">受け取り完了</span>
                    </div>
                  </div>
                ) : null}
                {bulkDownloadError ? (
                  <div className="receive-page-bulk-download-error mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {bulkDownloadError}
                  </div>
                ) : null}
                {historySaveError ? (
                  <div className="receive-page-bulk-download-error mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {historySaveError}
                  </div>
                ) : null}
                {isSavingHistory ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    <span>履歴を保存しています… ブラウザを閉じずにお待ちください。</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {mediaItems.length > 0 ? (
              <div className="receive-page-media-grid grid gap-4 sm:gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
                {mediaItems.map((item) => (
                  <ReceiveItemCard key={item.id} item={item} onSave={handleSaveItem} />
                ))}
              </div>
            ) : resolveStatus === 'success' && downloadPhase === 'waiting' ? (
              <div className="receive-page-download-prompt rounded-3xl border border-dashed border-white/10 bg-black/30 p-10 text-center text-sm text-muted-foreground">
                <span className="receive-page-download-prompt-text">受け取りボタンを押すとファイルのダウンロードが始まります。</span>
              </div>
            ) : null}

            {downloadPhase === 'complete' && mediaItems.length > 0 ? (
              <div className="receive-page-cleanup-callout mt-2 space-y-3 rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-sm text-amber-50">
                <div className="space-y-1">
                  <p className="receive-page-cleanup-title text-base font-semibold text-amber-100">
                    全ての景品を受け取ったらこちらのボタンを押してください
                  </p>
                  <p className="receive-page-cleanup-description text-amber-50/80">
                    サーバーに保存されているファイルを削除します。削除後は同じ受け取りIDで再度ダウンロードすることはできなくなります。<br />ストレージには限りがありますので、ご協力をお願いいたします。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCleanupBlob}
                    disabled={cleanupStatus === 'working' || cleanupStatus === 'success'}
                    className="receive-page-cleanup-button inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 font-semibold text-white shadow-lg shadow-amber-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                  >
                    {cleanupStatus === 'working' ? (
                      <ArrowPathIcon className="receive-page-cleanup-spinner h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckIcon className="receive-page-cleanup-icon h-5 w-5" aria-hidden="true" />
                    )}
                    <span className="receive-page-cleanup-button-text">
                      {cleanupStatus === 'success' ? '削除が完了しました。ご協力ありがとうございました。' : 'アップロード元を削除する'}
                    </span>
                  </button>
                  {cleanupStatus === 'success' ? (
                    <span className="receive-page-cleanup-status text-xs uppercase tracking-wide text-amber-200">削除済み</span>
                  ) : null}
                </div>
                {cleanupError ? (
                  <div className="receive-page-cleanup-error rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-rose-200">
                    {cleanupError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-pink-200">オフライン履歴</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">受け取り履歴</h2>
                  <p className="text-xs text-muted-foreground">ダウンロードしたZIPとメタデータをブラウザに保存します。</p>
                </div>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                  自動保存
                </span>
              </div>
              {historyLoadError ? (
                <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {historyLoadError}
                </div>
              ) : null}
              {!historyLoadError && historyEntries.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
                  まだ履歴がありません。受け取りを行うと自動的にここへ保存されます。
                </div>
              ) : null}
              <div className="mt-4 flex flex-col gap-3">
                {historyEntries.map((entry) => {
                  const isActive = entry.id === activeHistoryId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelectHistory(entry)}
                      disabled={isRestoringHistory}
                      className={`group w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-pink-400/60 bg-pink-500/15 shadow-lg shadow-pink-900/30'
                          : 'border-white/10 bg-black/30 hover:border-pink-400/40 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pink-200">
                            {entry.name || '無題の景品'}
                          </span>
                          {entry.purpose ? (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-200">{entry.purpose}</span>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(entry.downloadedAt)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                          {entry.itemCount} 件 / {formatBytes(entry.totalBytes)}
                        </span>
                        {entry.expiresAt ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">期限 {formatDateTime(entry.expiresAt)}</span>
                        ) : null}
                        {entry.token ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">ID: {entry.token}</span>
                        ) : null}
                      </div>
                      {entry.previewItems.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
                          {entry.previewItems.map((item) => (
                            <span
                              key={item.id}
                              className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-medium group-hover:border-pink-300/50"
                            >
                              {item.name} ({item.kind.toUpperCase()})
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/40 p-5 text-sm text-muted-foreground shadow-xl shadow-black/30 backdrop-blur">
              <h3 className="text-base font-semibold text-white">ヒント</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>履歴はブラウザに保存されます。別の端末では共有されません。</li>
                <li>保存先のブラウザストレージを削除すると履歴も消えます。</li>
                <li>ZIPの復元中はブラウザを閉じずにお待ちください。</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
