import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  isHistoryStorageAvailable,
  loadHistoryFile,
  loadHistoryMetadata,
  persistHistoryMetadata,
  type ReceiveHistoryEntryMetadata
} from './historyStorage';
import { loadReceiveZipSummary } from './receiveZip';
import { formatReceiveBytes, formatReceiveDateTime } from './receiveFormatters';

function resolveDisplayUser(entry: ReceiveHistoryEntryMetadata): string {
  if (entry.ownerName && entry.ownerName.trim()) {
    return entry.ownerName.trim();
  }
  if (entry.userName && entry.userName.trim()) {
    return entry.userName.trim();
  }
  if (entry.name && entry.name.trim()) {
    return entry.name.replace(/\.zip$/i, '').trim();
  }
  return '不明なユーザー';
}

function resolveItemNames(entry: ReceiveHistoryEntryMetadata): string[] {
  if (entry.itemNames && entry.itemNames.length > 0) {
    return entry.itemNames;
  }
  if (entry.previewItems.length > 0) {
    return entry.previewItems.map((item) => item.name);
  }
  return [];
}

export function ReceiveHistoryPage(): JSX.Element {
  const [entries, setEntries] = useState<ReceiveHistoryEntryMetadata[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHistoryStorageAvailable()) {
      setError('ブラウザのローカルストレージ・IndexedDBが利用できないため、履歴を表示できません。');
      setStatus('error');
      return;
    }
    try {
      const stored = loadHistoryMetadata();
      setEntries(stored);
      setStatus('ready');
    } catch (loadError) {
      console.error('Failed to load receive history metadata', loadError);
      setError('履歴の読み込みに失敗しました。ブラウザの設定をご確認ください。');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (status !== 'ready' || entries.length === 0) {
      return;
    }

    let active = true;

    const enrichEntries = async () => {
      let changed = false;
      const nextEntries = [...entries];

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const hasUserName = Boolean(entry.userName && entry.userName.trim());
        const hasGachaNames = Boolean(entry.gachaNames && entry.gachaNames.length > 0);
        const hasItemNames = Boolean(entry.itemNames && entry.itemNames.length > 0);
        const hasPullCount = typeof entry.pullCount === 'number' && Number.isFinite(entry.pullCount);
        const hasPullIds = Boolean(entry.pullIds && entry.pullIds.length > 0);
        const hasOwnerName = Boolean(entry.ownerName && entry.ownerName.trim());
        const maybeFileCountBased =
          hasPullCount &&
          typeof entry.itemCount === 'number' &&
          Number.isFinite(entry.itemCount) &&
          entry.pullCount === entry.itemCount;

        if (
          hasUserName &&
          hasGachaNames &&
          hasItemNames &&
          hasPullCount &&
          hasPullIds &&
          hasOwnerName &&
          !maybeFileCountBased
        ) {
          continue;
        }

        const blob = await loadHistoryFile(entry.id);
        if (!blob) {
          continue;
        }

        const summary = await loadReceiveZipSummary(blob);
        if (!summary) {
          continue;
        }

        const merged: ReceiveHistoryEntryMetadata = {
          ...entry,
          userName: hasUserName ? entry.userName : summary.userName ?? entry.userName,
          ownerName: hasOwnerName ? entry.ownerName : summary.ownerName ?? entry.ownerName,
          gachaNames: hasGachaNames ? entry.gachaNames : summary.gachaNames.length > 0 ? summary.gachaNames : entry.gachaNames,
          itemNames: hasItemNames ? entry.itemNames : summary.itemNames.length > 0 ? summary.itemNames : entry.itemNames,
          pullCount:
            summary.pullCount ?? (hasPullCount ? entry.pullCount : undefined),
          pullIds: hasPullIds ? entry.pullIds : summary.pullIds.length > 0 ? summary.pullIds : entry.pullIds
        };

        nextEntries[index] = merged;
        changed = true;
      }

      if (active && changed) {
        setEntries(nextEntries);
        persistHistoryMetadata(nextEntries);
      }
    };

    void enrichEntries();

    return () => {
      active = false;
    };
  }, [entries, status]);

  const hasEntries = entries.length > 0;

  const cards = useMemo(() =>
    entries.map((entry) => {
      const gachaLabel = entry.gachaNames?.length ? entry.gachaNames.join(' / ') : '不明なガチャ';
      const displayUser = resolveDisplayUser(entry);
      const allItemNames = resolveItemNames(entry);
      const itemNames = allItemNames.slice(0, 20);
      const pullCount = typeof entry.pullCount === 'number' && Number.isFinite(entry.pullCount)
        ? entry.pullCount
        : null;

      return {
        entry,
        gachaLabel,
        displayUser,
        itemNames,
        pullCount
      };
    }),
    [entries]
  );

  return (
    <div className="receive-history-page min-h-screen text-surface-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 lg:px-8">
        <header className="rounded-3xl border border-border/60 bg-panel/85 p-6 shadow-lg shadow-black/10 backdrop-blur">
          <span className="badge">履歴</span>
          <h1 className="mt-3 text-3xl font-bold">受け取り履歴</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ブラウザに保存されている受け取り履歴を一覧で確認できます。
          </p>
        </header>

        {status === 'error' && error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
            {error}
          </div>
        ) : null}

        {status === 'ready' && !hasEntries ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-sm text-muted-foreground">
            まだ受け取り履歴がありません。/receive で受け取ると自動で保存されます。
          </div>
        ) : null}

        {hasEntries ? (
          <section className="flex flex-col gap-4">
            {cards.map(({ entry, gachaLabel, displayUser, itemNames, pullCount }) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-border/60 bg-panel/85 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-surface-foreground">{displayUser}</h2>
                    <p className="text-sm text-muted-foreground">{gachaLabel}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatReceiveDateTime(entry.downloadedAt)}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {pullCount !== null ? <span className="chip">{pullCount}連</span> : null}
                  <span className="chip">ファイル数 {entry.itemCount} 件</span>
                  <span className="chip">{formatReceiveBytes(entry.totalBytes)}</span>
                  {entry.token ? <span className="chip">ID: {entry.token}</span> : null}
                </div>

                {itemNames.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {itemNames.map((name) => (
                      <span key={`${entry.id}-${name}`} className="chip">{name}</span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/receive?history=${encodeURIComponent(entry.id)}`} className="btn btn-muted rounded-full">
                    受け取り画面で開く
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
