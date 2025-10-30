import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import JSZip from 'jszip';

import { ProgressBar } from './components/ProgressBar';
import { ReceiveItemCard } from './components/ReceiveItemCard';
import type { ReceiveMediaItem, ReceiveMediaKind } from './types';
import { AppHeaderShell } from '../gacha/components/app-shell/AppHeaderShell';

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
  } catch (error) {
    throw new ReceiveResolveError('受け取りリンクの確認に失敗しました (ネットワークエラー)', { status: 0 });
  }

  let payload: ResolveResponsePayload | null = null;
  try {
    payload = (await response.json()) as ResolveResponsePayload;
  } catch (error) {
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

async function extractMediaItems(
  blob: Blob,
  onProgress?: (processed: number, total: number) => void
): Promise<ReceiveMediaItem[]> {
  const zip = await JSZip.loadAsync(blob);
  const entries = Object.entries(zip.files).filter(([, file]) => !file.dir);
  const mediaItems: ReceiveMediaItem[] = [];
  const total = entries.length;
  let processed = 0;

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
  } catch (error) {
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
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
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const resolveAbortRef = useRef<AbortController | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

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
    setTokenInput(activeToken);
    if (!activeToken) {
      setResolved(null);
      setResolveStatus('idle');
      setResolveError(null);
      setDownloadPhase('waiting');
      setMediaItems([]);
      setZipBlob(null);
      return;
    }

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;

    setResolveStatus('loading');
    setResolveError(null);
    setDownloadPhase('waiting');
    setMediaItems([]);
    setZipBlob(null);
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

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = parseInputValue(tokenInput);
      if (!parsed) {
        setResolveStatus('error');
        setResolveError('受け取りIDを入力してください。');
        return;
      }
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

    try {
      const blob = await downloadZipWithProgress(resolved.url, {
        signal: controller.signal,
        onProgress: (loaded, total) => {
          setDownloadProgress({ loaded, total });
        }
      });
      setZipBlob(blob);
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
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'ダウンロードに失敗しました。';
      setDownloadError(message);
      setDownloadPhase('waiting');
    }
  }, [resolved?.url]);

  const handleDownloadItem = useCallback((item: ReceiveMediaItem) => {
    const url = URL.createObjectURL(item.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadZip = useCallback(() => {
    if (!zipBlob) {
      return;
    }
    const fileName = resolved?.name ?? 'receive.zip';
    const url = URL.createObjectURL(zipBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [resolved?.name, zipBlob]);

  const totalSize = useMemo(() => mediaItems.reduce((sum, item) => sum + item.size, 0), [mediaItems]);
  const expiration = useMemo(() => normalizeExpiration(resolved?.exp), [resolved?.exp]);

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
    } catch (error) {
      setCopyState('error');
      window.prompt('このURLをコピーしてください', url);
      setTimeout(() => setCopyState('idle'), 1600);
    }
  }, []);

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
            リンク確認済み
          </span>
          {resolved.name ? <span className="receive-page-resolve-status-success-name">ファイル名: {resolved.name}</span> : null}
          {expiryText ? <span className="receive-page-resolve-status-success-expiry">期限: {expiryText}</span> : null}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="receive-page-root relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="receive-page-background pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.18),_transparent_55%)]" aria-hidden="true" />
      <div className="receive-page-header-wrapper relative z-20">
        <AppHeaderShell
          title="景品受け取り"
          tagline="共有リンクから景品を受け取る"
          showDrawGachaButton={false}
          showRegisterGachaButton={false}
          showRealtimeButton={false}
          showExportButton={false}
        />
      </div>
      <main className="receive-page-content relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 lg:px-10">
        <div className="receive-page-hero-card rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="receive-page-hero-header flex flex-wrap items-start justify-between gap-4">
            <div className="receive-page-hero-info space-y-2">
              <span className="receive-page-hero-label inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pink-200">
                景品受け取り
              </span>
              <h1 className="receive-page-hero-title text-3xl font-bold tracking-tight">共有リンクから景品を受け取る</h1>
              <p className="receive-page-hero-description max-w-2xl text-sm text-muted-foreground">
                配信者から共有された受け取りIDまたはリンクを入力すると、その場でZIPファイルをダウンロードして中身を確認できます。
              </p>
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

        <div className="receive-page-steps-card rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="receive-page-steps-content flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="receive-page-steps-description">
              <h2 className="receive-page-steps-title text-2xl font-semibold">手順</h2>
              <ol className="receive-page-steps-list mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li className="receive-page-step-item">「受け取る」ボタンを押すとブラウザ上でZIPのダウンロードが始まります（端末には自動保存されません）。</li>
                <li className="receive-page-step-item">ダウンロード完了後に自動で解凍し、画像・動画・音声などの項目を一覧表示します。</li>
                <li className="receive-page-step-item">各項目の「保存」ボタンで、端末に個別保存できます。元のZIPを保存することも可能です。</li>
              </ol>
            </div>
            <div className="receive-page-steps-actions flex flex-col gap-3">
              <button
                type="button"
                onClick={handleStartDownload}
                disabled={resolveStatus !== 'success' || downloadPhase === 'downloading' || downloadPhase === 'unpacking'}
                className="receive-page-start-download-button inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-8 py-3 text-lg font-semibold text-white shadow-xl shadow-rose-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <span className="receive-page-start-download-button-text">受け取る</span>
              </button>
              {!isShareLinkMode ? (
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={!zipBlob}
                  className="receive-page-save-zip-button inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-8 py-2 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                >
                  <span className="receive-page-save-zip-button-text">ZIPを保存</span>
                </button>
              ) : null}
              {downloadError ? (
                <div className="receive-page-download-error-banner rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{downloadError}</div>
              ) : null}
            </div>
          </div>

          {(downloadPhase === 'downloading' || downloadPhase === 'unpacking') && (
            <div className="receive-page-progress-section mt-6 space-y-4">
              <ProgressBar
                label="ダウンロード"
                value={
                  downloadProgress.total
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
              <span className="receive-page-completion-summary-status text-xs uppercase tracking-wide text-pink-200">受け取り完了</span>
            </div>
          ) : null}
        </div>

        {mediaItems.length > 0 ? (
          <div className="receive-page-media-grid grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {mediaItems.map((item) => (
              <ReceiveItemCard key={item.id} item={item} onDownload={handleDownloadItem} />
            ))}
          </div>
        ) : resolveStatus === 'success' && downloadPhase === 'waiting' ? (
          <div className="receive-page-download-prompt rounded-3xl border border-dashed border-white/10 bg-black/30 p-10 text-center text-sm text-muted-foreground">
            <span className="receive-page-download-prompt-text">受け取りボタンを押すとファイルのダウンロードが始まります。</span>
          </div>
        ) : null}
      </main>
    </div>
  );
}

