import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowPathIcon,
  CheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

import { ProgressBar } from './components/ProgressBar';
import { ReceiveItemCard } from './components/ReceiveItemCard';
import { ReceiveBulkSaveButton } from './components/ReceiveSaveButtons';
import type { ReceiveMediaItem } from './types';
import {
  generateHistoryId,
  isHistoryStorageAvailable,
  loadHistoryFile,
  loadHistoryMetadata,
  persistHistoryMetadata,
  saveHistoryFile,
  type ReceiveHistoryEntryMetadata
} from './historyStorage';
import { extractReceiveMediaItems } from './receiveZip';
import { formatReceiveBytes, formatReceiveDateTime } from './receiveFormatters';
import { saveReceiveItem, saveReceiveItems } from './receiveSave';
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
    const historyParam = searchParams.get('history');
    return Boolean((tokenParam && tokenParam.trim()) || (historyParam && historyParam.trim()));
  });

  const historyParam = useMemo(() => (searchParams.get('history') ?? '').trim(), [searchParams]);
  const hasHistoryParam = Boolean(historyParam);
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
    if (hasHistoryParam) {
      setHasAttemptedLoad(true);
      return;
    }
    if (isShareLinkMode) {
      setHasAttemptedLoad(true);
      return;
    }
    if (!activeToken) {
      setHasAttemptedLoad(false);
    }
  }, [activeToken, hasHistoryParam, isShareLinkMode]);

  useEffect(() => {
    if (hasHistoryParam) {
      return;
    }
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
  }, [activeToken, hasHistoryParam]);

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

  const totalSize = useMemo(() => mediaItems.reduce((sum, item) => sum + item.size, 0), [mediaItems]);
  const expiration = useMemo(() => normalizeExpiration(resolved?.exp), [resolved?.exp]);
  const activeHistoryEntry = useMemo(
    () => historyEntries.find((entry) => entry.id === activeHistoryId) ?? null,
    [activeHistoryId, historyEntries]
  );
  const isViewingHistory = useMemo(() => Boolean(activeHistoryId), [activeHistoryId]);
  const shouldShowSteps = isShareLinkMode || hasAttemptedLoad || isViewingHistory;

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
      nextParams.delete('history');
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams, tokenInput]
  );

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
      const gachaNames = Array.from(
        new Set(items.map((item) => item.metadata?.gachaName).filter((value): value is string => Boolean(value)))
      );
      const itemNames = Array.from(
        new Set(
          items
            .map((item) => item.metadata?.itemName ?? item.filename)
            .filter((value): value is string => Boolean(value))
        )
      );
      const pullCount = items.reduce((sum, item) => {
        if (typeof item.metadata?.obtainedCount === 'number' && Number.isFinite(item.metadata.obtainedCount)) {
          return sum + Math.max(0, item.metadata.obtainedCount);
        }
        return sum + 1;
      }, 0);
      const entry: ReceiveHistoryEntryMetadata = {
        id: entryId,
        token: activeToken || null,
        name: resolved?.name ?? null,
        purpose: resolved?.purpose ?? null,
        expiresAt: expiration ? expiration.toISOString() : null,
        gachaNames: gachaNames.length > 0 ? gachaNames : undefined,
        itemNames: itemNames.length > 0 ? itemNames.slice(0, 24) : undefined,
        pullCount: pullCount > 0 ? pullCount : undefined,
        downloadedAt: timestamp,
        itemCount: items.length,
        totalBytes,
        previewItems: items.slice(0, 4).map((item) => ({
          id: item.id,
          name: item.metadata?.itemName ?? item.filename,
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
      const items = await extractReceiveMediaItems(blob, (processed, total) => {
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
        await saveReceiveItem(item);
      } catch (error) {
        console.error('Failed to save item with Web Share API fallback', error);
        setBulkDownloadError('保存中にエラーが発生しました。もう一度お試しください。');
      }
    },
    []
  );

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
      await saveReceiveItems(mediaItems);
    } catch (error) {
      console.error('Failed to perform bulk save', error);
      setBulkDownloadError('まとめて保存中にエラーが発生しました。個別保存をお試しください。');
    } finally {
      setIsBulkDownloading(false);
    }
  }, [mediaItems]);

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
        const items = await extractReceiveMediaItems(blob, (processed, total) => {
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

  useEffect(() => {
    if (!historyParam) {
      return;
    }
    if (historyEntries.length === 0) {
      return;
    }
    const entry = historyEntries.find((item) => item.id === historyParam);
    if (!entry) {
      setDownloadPhase('waiting');
      setDownloadError('指定された履歴が見つかりませんでした。');
      setActiveHistoryId(null);
      return;
    }
    if (entry.id !== activeHistoryId) {
      void handleSelectHistory(entry);
    }
  }, [activeHistoryId, handleSelectHistory, historyEntries, historyParam]);

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
        <div className="receive-page-resolve-status-error flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-500">
          <ExclamationTriangleIcon className="receive-page-resolve-status-error-icon mt-0.5 h-5 w-5" aria-hidden="true" />
          <span className="receive-page-resolve-status-error-text">{resolveError}</span>
        </div>
      );
    }
    if (resolveStatus === 'success' && resolved) {
      const expiryText = formatExpiration(expiration);
      return (
        <div className="receive-page-resolve-status-success flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="receive-page-resolve-status-success-chip chip border-border/60 bg-surface/40 text-muted-foreground">
            {isViewingHistory ? '履歴を表示中' : 'リンク確認済み'}
          </span>
          {resolved.name ? <span className="receive-page-resolve-status-success-name">ファイル名: {resolved.name}</span> : null}
          {expiryText ? <span className="receive-page-resolve-status-success-expiry">期限: {expiryText}</span> : null}
          {activeHistoryEntry ? (
            <span className="receive-page-resolve-status-success-expiry chip border-border/60 bg-surface/40 text-muted-foreground">
              <ClockIcon className="h-4 w-4" />
              {formatReceiveDateTime(activeHistoryEntry.downloadedAt)} に受け取り
            </span>
          ) : null}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="receive-page-root min-h-screen text-surface-foreground">
      <main className="receive-page-content mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        <div className="receive-page-hero-card rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
          <div className="receive-page-hero-header flex flex-wrap items-start justify-between gap-4">
            <div className="receive-page-hero-info space-y-3">
              <div className="space-y-1">
                <h1 className="receive-page-hero-title text-3xl font-bold tracking-tight">景品を受け取る</h1>
                <p className="receive-page-hero-description max-w-2xl text-sm text-muted-foreground">
                  受け取りIDを入力するか、履歴ページから選択するとすぐにダウンロード・復元できます。履歴はブラウザに自動保存され、リロード後も残ります。
                </p>
              </div>
              {isViewingHistory ? (
                <span className="badge">
                  <ClockIcon className="h-4 w-4" />
                  履歴を表示中
                </span>
              ) : null}
              <div className="rounded-xl border border-border/60 bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
                DiscordやXのアプリ内ブラウザから来た方は、safariやchromeなどで開きなおすことをオススメします。
              </div>
              <div className="receive-page-hero-status-wrapper">{renderResolveStatus()}</div>
            </div>
          </div>

          {!isShareLinkMode ? (
            <form onSubmit={handleSubmit} className="receive-page-token-form mt-8">
              <div className="receive-page-token-field space-y-2">
                <label htmlFor="receive-token" className="receive-page-token-label text-sm font-medium text-surface-foreground">
                  受け取りID または 共有リンク
                </label>
                <div className="receive-page-token-row flex flex-col gap-3 lg:flex-row lg:items-center">
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
                    className="receive-page-token-input h-[52px] w-full flex-1 rounded-2xl border border-border/60 bg-surface/80 px-4 text-base text-surface-foreground shadow-inner shadow-black/5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    type="submit"
                    className="receive-page-token-submit-button btn btn-primary h-[52px] rounded-2xl px-6 text-base"
                  >
                    <span className="receive-page-token-submit-button-text">リンクを読み込む</span>
                  </button>
                </div>
                <p className="receive-page-token-helper text-xs text-muted-foreground">
                  10 桁の英数字 ID または配信者から共有された URL を貼り付けてください。
                </p>
              </div>
            </form>
          ) : null}
        </div>

        {shouldShowSteps ? (
          <div className="receive-page-steps-card rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
            <div className="receive-page-steps-content flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="receive-page-steps-description">
                <h2 className="receive-page-steps-title text-2xl font-semibold text-surface-foreground">手順</h2>
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
                  className="receive-page-start-download-button btn btn-primary rounded-2xl px-8 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="receive-page-start-download-button-text">{isViewingHistory ? 'もう一度受け取る' : '受け取る'}</span>
                </button>
                {downloadError ? (
                  <div className="receive-page-download-error-banner rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{downloadError}</div>
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
              <div className="receive-page-completion-summary mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
                <span className="receive-page-completion-summary-text">
                  {mediaItems.length} 件 ・ 合計 {formatReceiveBytes(totalSize)}
                </span>
                <div className="receive-page-completion-summary-actions flex flex-wrap items-center gap-3">
                  <ReceiveBulkSaveButton
                    onClick={handleDownloadAll}
                    isLoading={isBulkDownloading}
                    className="receive-page-bulk-download-button"
                  />
                  <span className="receive-page-completion-summary-status text-xs uppercase tracking-wide text-muted-foreground">受け取り完了</span>
                </div>
              </div>
            ) : null}
            {bulkDownloadError ? (
              <div className="receive-page-bulk-download-error mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                {bulkDownloadError}
              </div>
            ) : null}
            {historySaveError ? (
              <div className="receive-page-bulk-download-error mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                {historySaveError}
              </div>
            ) : null}
            {isSavingHistory ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-surface/50 px-3 py-2 text-xs text-muted-foreground">
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
          <div className="receive-page-download-prompt rounded-3xl border border-dashed border-border/60 bg-surface/40 p-10 text-center text-sm text-muted-foreground">
            <span className="receive-page-download-prompt-text">受け取りボタンを押すとファイルのダウンロードが始まります。</span>
          </div>
        ) : null}

        {downloadPhase === 'complete' && mediaItems.length > 0 ? (
          <div className="receive-page-cleanup-callout mt-2 space-y-3 rounded-3xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-500">
            <div className="space-y-1">
              <p className="receive-page-cleanup-title text-base font-semibold text-amber-500">
                全ての景品を受け取ったらこちらのボタンを押してください
              </p>
              <p className="receive-page-cleanup-description text-amber-500/80">
                サーバーに保存されているファイルを削除します。削除後は同じ受け取りIDで再度ダウンロードすることはできなくなります。<br />ストレージには限りがありますので、ご協力をお願いいたします。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCleanupBlob}
                disabled={cleanupStatus === 'working' || cleanupStatus === 'success'}
                className="receive-page-cleanup-button inline-flex items-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
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
                <span className="receive-page-cleanup-status text-xs uppercase tracking-wide text-amber-500">削除済み</span>
              ) : null}
            </div>
            {cleanupError ? (
              <div className="receive-page-cleanup-error rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-rose-500">
                {cleanupError}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-3xl border border-border/60 bg-panel/85 p-5 text-sm text-muted-foreground shadow-lg shadow-black/10 backdrop-blur">
          <h3 className="text-base font-semibold text-surface-foreground">ヒント</h3>
          {historyLoadError ? (
            <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
              {historyLoadError}
            </div>
          ) : null}
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>履歴はブラウザに保存されます。別の端末では共有されません。</li>
            <li>保存先のブラウザストレージを削除すると履歴も消えます。</li>
            <li>ZIPの復元中はブラウザを閉じずにお待ちください。</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/receive/history" className="btn btn-muted rounded-full">履歴を見る</Link>
            <Link to="/receive/list" className="btn btn-muted rounded-full">所持一覧を見る</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
