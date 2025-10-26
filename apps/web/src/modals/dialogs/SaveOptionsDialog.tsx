import {
  ArrowUpTrayIcon,
  BoltIcon,
  DocumentDuplicateIcon,
  FolderArrowDownIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import type { GachaLocalStorageSnapshot, PullHistoryEntryV1 } from '@domain/app-persistence';

import { buildUserZipFromSelection } from '../../features/save/buildUserZip';
import type { SaveTargetSelection } from '../../features/save/types';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface SaveOptionsUploadResult {
  url: string;
  label?: string;
  expiresAt?: string;
}

export interface SaveOptionsDialogPayload {
  userId: string;
  userName: string;
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
}

interface LastDownloadState {
  fileName: string;
  fileCount: number;
  warnings: string[];
  savedAt: string;
}

function formatExpiresAt(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatHistoryEntry(entry: PullHistoryEntryV1 | undefined, gachaName: string): string {
  if (!entry) {
    return `${gachaName}: 履歴情報なし`;
  }
  const executedAt = formatExpiresAt(entry.executedAt) ?? '日時不明';
  const pullCount = Number.isFinite(entry.pullCount) ? `${entry.pullCount}連` : '回数不明';
  return `${executedAt} / ${gachaName} (${pullCount})`;
}

export function SaveOptionsDialog({ payload, close }: ModalComponentProps<SaveOptionsDialogPayload>): JSX.Element {
  const { userId, userName, snapshot, selection } = payload;
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<LastDownloadState | null>(null);

  const existingUpload: SaveOptionsUploadResult | null = useMemo(() => {
    const saved = snapshot.saveOptions?.[userId];
    if (!saved) {
      return null;
    }
    const url = saved.shareUrl ?? saved.downloadUrl;
    if (!url) {
      return null;
    }
    return {
      url,
      label: saved.shareUrl ?? url,
      expiresAt: formatExpiresAt(saved.expiresAt)
    };
  }, [snapshot.saveOptions, userId]);

  const gachaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(snapshot.appState?.meta ?? {}).forEach(([gachaId, meta]) => {
      if (gachaId) {
        map.set(gachaId, meta.displayName ?? gachaId);
      }
    });
    return map;
  }, [snapshot.appState?.meta]);

  const selectionSummary = useMemo(() => {
    if (selection.mode === 'all') {
      const gachaCount = Object.keys(snapshot.userInventories?.inventories?.[userId] ?? {}).length;
      return {
        description: '全てのガチャ景品をまとめて保存します。',
        details: [`保存対象ガチャ数: ${gachaCount}`]
      };
    }
    if (selection.mode === 'gacha') {
      const names = selection.gachaIds.map((id) => gachaNameMap.get(id) ?? id);
      return {
        description: `選択したガチャ ${selection.gachaIds.length} 件を保存します。`,
        details: names
      };
    }
    const history = snapshot.pullHistory?.pulls ?? {};
    const details = selection.pullIds.map((pullId) => {
      const entry = history[pullId];
      const gachaName = entry?.gachaId ? gachaNameMap.get(entry.gachaId) ?? entry.gachaId : 'ガチャ不明';
      return formatHistoryEntry(entry, gachaName);
    });
    return {
      description: `選択した履歴 ${selection.pullIds.length} 件に含まれる景品を保存します。`,
      details
    };
  }, [selection, snapshot.userInventories?.inventories, snapshot.pullHistory?.pulls, gachaNameMap, userId]);

  const handleCopyUrl = async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (error) {
      console.warn('クリップボードへのコピーに失敗しました', error);
    }
  };

  const handleSaveToDevice = async () => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const result = await buildUserZipFromSelection({
        snapshot,
        selection,
        userId,
        userName
      });

      const blobUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(blobUrl);

      setLastDownload({
        fileName: result.fileName,
        fileCount: result.fileCount,
        warnings: result.warnings,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('ZIPの作成に失敗しました', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">保存対象の概要</div>
          <div className="text-sm text-surface-foreground">{selectionSummary.description}</div>
          {selectionSummary.details.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {selectionSummary.details.map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SaveOptionCard
            title="自分で保存して共有"
            description="端末にZIPを保存し、後からお好みのサービスにアップロードして共有します。"
            actionLabel={isProcessing ? '生成中…' : 'デバイスに保存'}
            icon={<FolderArrowDownIcon className="h-6 w-6" />}
            onClick={handleSaveToDevice}
            disabled={isProcessing}
          />
          <SaveOptionCard
            title="shimmy3.comへアップロード"
            description="ZIPをアップロードして受け取り用の共有リンクを発行します。現在は準備中です。"
            actionLabel="準備中"
            disabled
            icon={<ArrowUpTrayIcon className="h-6 w-6" />}
            onClick={() => {
              console.info('ZIPアップロード処理は後続タスクで実装されます', { userId });
            }}
          />
          <SaveOptionCard
            title="Discordで共有"
            description="保存したZIPリンクをDiscordの共有チャンネルへ送信します。現在は準備中です。"
            actionLabel="準備中"
            disabled
            icon={<PaperAirplaneIcon className="h-6 w-6" />}
            onClick={() => {
              console.info('Discord共有処理は後続タスクで実装されます', { userId });
            }}
          />
        </div>

        {existingUpload ? (
          <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-surface-foreground">
              <DocumentDuplicateIcon className="h-5 w-5 text-accent" />
              直近の共有リンク
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto] sm:items-center">
              <a
                href={existingUpload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-xl border border-border/60 bg-surface-alt px-3 py-2 font-mono text-xs text-surface-foreground"
              >
                {existingUpload.label ?? existingUpload.url}
              </a>
              <button type="button" className="btn btn-muted" onClick={() => handleCopyUrl(existingUpload.url)}>
                {copied ? 'コピーしました' : 'URLをコピー'}
              </button>
            </div>
            {existingUpload.expiresAt ? (
              <p className="text-[11px] text-muted-foreground">有効期限: {existingUpload.expiresAt}</p>
            ) : null}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-500/70 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            ZIPの作成に失敗しました: {errorMessage}
          </div>
        ) : null}

        {lastDownload ? (
          <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-200">
            <p className="text-sm font-semibold text-emerald-100">端末への保存が完了しました</p>
            <p>ファイル名: {lastDownload.fileName}</p>
            <p>収録件数: {lastDownload.fileCount} 件</p>
            <p>保存日時: {formatExpiresAt(lastDownload.savedAt) ?? lastDownload.savedAt}</p>
            {lastDownload.warnings.length > 0 ? (
              <div className="space-y-1">
                <p className="font-semibold text-emerald-100">警告:</p>
                <ul className="list-inside list-disc space-y-1">
                  {lastDownload.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-accent">
          <BoltIcon className="h-4 w-4" />
          ZIP には画像ファイルに加えて catalog-state:v3 と rarity-state:v3 のメタデータが含まれます。
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}

interface SaveOptionCardProps {
  title: string;
  description: string;
  actionLabel: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
}

function SaveOptionCard({ title, description, actionLabel, icon, onClick, disabled }: SaveOptionCardProps): JSX.Element {
  return (
    <div className="save-options__card flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-surface/30 p-5">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface text-accent">
        {icon}
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-surface-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        className="btn btn-primary mt-auto"
        onClick={onClick}
        disabled={disabled}
        aria-busy={disabled}
      >
        {actionLabel}
      </button>
    </div>
  );
}
