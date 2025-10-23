import {
  ArrowUpTrayIcon,
  BoltIcon,
  DocumentDuplicateIcon,
  FolderArrowDownIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface SaveOptionsUploadResult {
  url: string;
  label?: string;
  expiresAt?: string;
}

export interface SaveOptionsDialogPayload {
  onSaveToDevice?: () => void;
  onUploadToService?: () => void;
  onShareToDiscord?: () => void;
  onCopyUrl?: (url: string) => void;
  uploadResult?: SaveOptionsUploadResult | null;
  isUploading?: boolean;
}

export function SaveOptionsDialog({ payload, close }: ModalComponentProps<SaveOptionsDialogPayload>): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        payload?.onCopyUrl?.(url);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (error) {
      console.warn('クリップボードへのコピーに失敗しました', error);
    }
    payload?.onCopyUrl?.(url);
  };

  const result = payload?.uploadResult;

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <SaveOptionCard
            title="自分で保存して共有"
            description="端末にZIPを保存し、後からお好みのサービスにアップロードして共有します。"
            actionLabel="デバイスに保存"
            icon={<FolderArrowDownIcon className="h-6 w-6" />}
            onClick={() => {
              if (payload?.onSaveToDevice) {
                payload.onSaveToDevice();
              } else {
                console.info('ZIP保存処理は未接続です');
              }
            }}
          />
          <SaveOptionCard
            title="shimmy3.comへアップロード"
            description="ZIPをアップロードして受け取り用の共有リンクを発行します。期限管理も自動で行われます。"
            actionLabel={payload?.isUploading ? 'アップロード中…' : 'ZIPをアップロード'}
            disabled={payload?.isUploading}
            icon={<ArrowUpTrayIcon className="h-6 w-6" />}
            onClick={() => {
              if (payload?.onUploadToService) {
                payload.onUploadToService();
              } else {
                console.info('アップロード処理は未接続です');
              }
            }}
          />
          <SaveOptionCard
            title="Discordで共有"
            description="保存したZIPリンクをDiscordの共有チャンネルへ送信します。Bot連携で受け取り通知も実施予定です。"
            actionLabel="Discordへ送信"
            icon={<PaperAirplaneIcon className="h-6 w-6" />}
            onClick={() => {
              if (payload?.onShareToDiscord) {
                payload.onShareToDiscord();
              } else {
                console.info('Discord送信は未接続です');
              }
            }}
          />
        </div>

        {result ? (
          <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-surface-foreground">
              <DocumentDuplicateIcon className="h-5 w-5 text-accent" />
              受け取り用URL
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto] sm:items-center">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-xl border border-border/60 bg-[#15151b] px-3 py-2 font-mono text-xs text-surface-foreground"
              >
                {result.label ?? result.url}
              </a>
              <button
                type="button"
                className="btn btn-muted"
                onClick={() => handleCopyUrl(result.url)}
              >
                {copied ? 'コピーしました' : 'URLをコピー'}
              </button>
            </div>
            {result.expiresAt ? (
              <p className="text-[11px] text-muted-foreground">
                有効期限: {result.expiresAt}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/5 bg-surface/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              アップロードすると、共有用URLがここに表示されます。Discord送信を選んだ場合は最新のURLが自動で添付されます。
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-accent">
          <BoltIcon className="h-4 w-4" />
          保存オプションは今後AppStateStoreと連携し、Zip生成・Blobアップロードを統合予定です。
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
    <div className="save-options__card flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-surface/30 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
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
