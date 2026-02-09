import { ArrowPathRoundedSquareIcon, ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface BackupTransferDialogPayload {
  onSelectBackup?: () => void | Promise<void>;
  onSelectTransfer?: () => void | Promise<void>;
}

type SelectionKind = 'backup' | 'transfer';

type SelectionHandler = () => void | Promise<void>;

export function BackupTransferDialog({ payload, close }: ModalComponentProps<BackupTransferDialogPayload>): JSX.Element {
  const [pending, setPending] = useState<SelectionKind | null>(null);

  const handleSelection = async (kind: SelectionKind, handler: SelectionHandler | undefined) => {
    if (pending !== null) {
      return;
    }

    if (!handler) {
      console.info(kind === 'backup' ? 'バックアップ処理は未接続です' : '引継ぎ処理は未接続です');
      close();
      return;
    }

    try {
      const result = handler();
      if (result instanceof Promise) {
        setPending(kind);
        await result;
      }
      close();
    } catch (error) {
      console.error(kind === 'backup' ? 'バックアップ処理に失敗しました' : '引継ぎ処理に失敗しました', error);
    } finally {
      setPending(null);
    }
  };

  const isBackupPending = pending === 'backup';
  const isTransferPending = pending === 'transfer';

  return (
    <>
      <ModalBody className="backup-transfer-dialog__body space-y-6 text-sm leading-relaxed">
        <div className="backup-transfer-dialog__notes space-y-3">
          <p className="backup-transfer-dialog__note text-muted-foreground">
            バックアップを読み込む時は「ガチャを登録」ボタンから読み込んでください。
          </p>
          <p className="backup-transfer-dialog__note text-muted-foreground">
            引継ぐ際に4桁の暗証番号の設定が必要です。引継ぎコードと、暗証番号は引き継ぎ先で必要になります。
          </p>
          <p className="backup-transfer-dialog__note text-muted-foreground">
            引き継ぎは24時間以内に完了させてください。24時間経過後は引継ぎコードが無効になります。
          </p>
        </div>
        <div className="backup-transfer-dialog__grid grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="backup-transfer-dialog__card backup-transfer-dialog__card--backup flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface/80 p-5 text-left transition hover:border-accent/40 hover:bg-surface/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => handleSelection('backup', payload?.onSelectBackup)}
            disabled={isBackupPending}
            aria-busy={isBackupPending}
          >
            <span className="backup-transfer-dialog__card-icon inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface text-accent">
              <ArchiveBoxArrowDownIcon className="backup-transfer-dialog__card-icon-svg h-6 w-6" />
            </span>
            <span className="backup-transfer-dialog__card-title text-base font-semibold text-surface-foreground">
              バックアップを作成
            </span>
            <span className="backup-transfer-dialog__card-description text-xs text-muted-foreground">
              端末に現在のデータを保存します。バックアップを読み込む時は「ガチャを登録」ボタンから読み込んでください。
            </span>
          </button>
          <button
            type="button"
            className="backup-transfer-dialog__card backup-transfer-dialog__card--transfer flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface/80 p-5 text-left transition hover:border-accent/40 hover:bg-surface/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => handleSelection('transfer', payload?.onSelectTransfer)}
            disabled={isTransferPending}
            aria-busy={isTransferPending}
          >
            <span className="backup-transfer-dialog__card-icon inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface text-accent">
              <ArrowPathRoundedSquareIcon className="backup-transfer-dialog__card-icon-svg h-6 w-6" />
            </span>
            <span className="backup-transfer-dialog__card-title text-base font-semibold text-surface-foreground">
              クラウド経由でデータ移行
            </span>
            <span className="backup-transfer-dialog__card-description text-xs text-muted-foreground">
              shimmy.comのストレージ経由で、データを安全に他の端末へ移行出来ます。
            </span>
          </button>
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="backup-transfer-dialog__close btn btn-muted"
          onClick={close}
          disabled={pending !== null}
        >
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
