import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { clearDiscordAuthLogs, useDiscordAuthLogs } from './discordAuthDebugLogStore';

function formatTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(timestamp);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to format timestamp for Discord auth log', error);
    return new Date(timestamp).toLocaleTimeString();
  }
}

function formatDetails(details?: unknown): string | undefined {
  if (details === undefined || details === null) {
    return undefined;
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch (error) {
    return String(details);
  }
}

interface DiscordAuthDebugOverlayProps {
  className?: string;
}

export function DiscordAuthDebugOverlay({ className }: DiscordAuthDebugOverlayProps): JSX.Element | null {
  const logs = useDiscordAuthLogs();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const enhancedLogs = useMemo(
    () =>
      logs.map((entry) => ({
        entry,
        formattedTimestamp: formatTimestamp(entry.timestamp),
        formattedDetails: formatDetails(entry.details)
      })),
    [logs]
  );

  const logsForCopy = useMemo(
    () =>
      enhancedLogs
        .map(({ entry, formattedTimestamp, formattedDetails }) => {
          const lines = [
            `[${formattedTimestamp}] [${entry.level === 'error' ? 'ERROR' : 'INFO'}] ${entry.message}`
          ];

          if (formattedDetails) {
            lines.push(formattedDetails);
          }

          return lines.join('\n');
        })
        .join('\n\n'),
    [enhancedLogs]
  );

  useEffect(() => {
    setCopyStatus('idle');
  }, [logsForCopy]);

  if (enhancedLogs.length === 0) {
    return null;
  }

  const handleToggle = () => {
    setIsCollapsed((prev) => !prev);
  };

  const handleClear = () => {
    clearDiscordAuthLogs();
  };

  const handleCopy = async () => {
    if (!logsForCopy) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(logsForCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = logsForCopy;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopyStatus('copied');
    } catch (error) {
      setCopyStatus('failed');
      // eslint-disable-next-line no-console
      console.error('Failed to copy Discord auth logs', error);
    }
  };

  return (
    <div
      className={clsx(
        'discord-auth-debug-overlay pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0)+1rem)]',
        className
      )}
    >
      <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-slate-900/90 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
          <span>Discordログインログ</span>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest">
              {logs.length}件
            </span>
            {!isCollapsed ? (
              <button
                type="button"
                onClick={handleCopy}
                className={clsx(
                  'rounded-full border px-3 py-1 text-[11px] font-semibold tracking-widest text-white transition',
                  copyStatus === 'failed'
                    ? 'border-red-500/60 bg-red-500/20 hover:border-red-500/70 hover:bg-red-500/30'
                    : 'border-white/20 bg-white/10 hover:border-white/30 hover:bg-white/20'
                )}
              >
                {copyStatus === 'copied' ? 'コピー済み' : copyStatus === 'failed' ? 'コピー失敗' : 'コピー'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleToggle}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-widest text-white transition hover:border-white/30 hover:bg-white/20"
            >
              {isCollapsed ? '展開する' : '折りたたむ'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-widest text-white transition hover:border-white/30 hover:bg-white/15"
            >
              クリア
            </button>
          </div>
        </div>
        {!isCollapsed ? (
          <div className="max-h-64 space-y-3 overflow-y-auto px-4 py-3 text-xs leading-relaxed">
            {enhancedLogs.map(({ entry, formattedTimestamp, formattedDetails }) => (
              <div
                key={entry.id}
                className={clsx(
                  'rounded-xl border px-3 py-2',
                  entry.level === 'error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-100'
                    : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                )}
              >
                <div className="flex items-start justify-between gap-3 text-[10px] uppercase tracking-[0.2em]">
                  <span>{formattedTimestamp}</span>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 font-semibold',
                      entry.level === 'error' ? 'bg-red-500/40 text-red-100' : 'bg-emerald-500/40 text-emerald-100'
                    )}
                  >
                    {entry.level === 'error' ? 'エラー' : '情報'}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] font-semibold leading-snug text-white">
                  {entry.message}
                </p>
                {formattedDetails ? (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-snug text-white/80">
                    {formattedDetails}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
