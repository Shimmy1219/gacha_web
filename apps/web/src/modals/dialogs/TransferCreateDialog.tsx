import { ArrowPathIcon, ArrowPathRoundedSquareIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { useCallback, useMemo, useState } from 'react';
import { put } from '@vercel/blob/client';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useAppPersistence } from '../../features/storage/AppPersistenceProvider';
import { buildBackupShimmyBlob } from '../../features/storage/backupService';
import { encryptShimmyBlobForTransfer, TransferCryptoError, validateTransferPin } from '../../features/transfer/transferCrypto';
import { TransferApiError, useTransferApi } from '../../features/transfer/useTransferApi';
import { useHaptics } from '../../features/haptics/HapticsProvider';

interface TransferCreateDialogPayload {
  onIssued?: (args: { code: string; expiresAt?: string }) => void;
}

function formatIsoAsJp(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function TransferCreateDialog({
  payload,
  close
}: ModalComponentProps<TransferCreateDialogPayload>): JSX.Element {
  const persistence = useAppPersistence();
  const { createTransfer, completeTransfer } = useTransferApi();
  const { triggerConfirmation, triggerError } = useHaptics();

  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issuedExpiresAt, setIssuedExpiresAt] = useState<string | undefined>(undefined);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const expiresAtLabel = useMemo(() => formatIsoAsJp(issuedExpiresAt) ?? issuedExpiresAt, [issuedExpiresAt]);

  const canIssue = useMemo(() => {
    if (pending) return false;
    if (issuedCode) return false;
    if (!pin || !pinConfirm) return false;
    if (pin !== pinConfirm) return false;
    return /^[0-9]{4}$/.test(pin);
  }, [issuedCode, pending, pin, pinConfirm]);

  const copyCode = useCallback(async () => {
    if (!issuedCode) return;
    setCopied(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(issuedCode);
        setCopied(true);
      }
    } catch {
      // noop
    }
  }, [issuedCode]);

  const handleIssue = useCallback(async () => {
    setErrorBanner(null);
    setCopied(false);

    try {
      validateTransferPin(pin);
      validateTransferPin(pinConfirm);
    } catch (error) {
      const message = error instanceof Error ? error.message : '暗証番号の入力が不正です';
      setErrorBanner(message);
      triggerError();
      return;
    }

    if (pin !== pinConfirm) {
      setErrorBanner('暗証番号が一致しません');
      triggerError();
      return;
    }

    setPending(true);
    try {
      const { blob: plainShimmy } = await buildBackupShimmyBlob(persistence);
      const encrypted = await encryptShimmyBlobForTransfer(plainShimmy, pin);

      const slot = await createTransfer({ pin });

      const uploadResult = await put(slot.pathname, encrypted, {
        access: 'public',
        multipart: true,
        contentType: 'application/octet-stream',
        token: slot.token
      });

      const url = uploadResult.url;
      const downloadUrl = uploadResult.downloadUrl ?? uploadResult.url;
      const pathname = uploadResult.pathname ?? slot.pathname;

      await completeTransfer({
        code: slot.code,
        pathname,
        url,
        downloadUrl
      });

      setIssuedCode(slot.code);
      setIssuedExpiresAt(slot.expiresAt);
      triggerConfirmation();
      payload?.onIssued?.({ code: slot.code, expiresAt: slot.expiresAt });
    } catch (error) {
      console.error('引継ぎコードの発行に失敗しました', error);
      const message =
        error instanceof TransferCryptoError || error instanceof TransferApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : '不明なエラーが発生しました';
      setErrorBanner(`引継ぎコードの発行に失敗しました: ${message}`);
      triggerError();
    } finally {
      setPending(false);
    }
  }, [completeTransfer, createTransfer, payload, pin, pinConfirm, persistence, triggerConfirmation, triggerError]);

  return (
    <>
      <ModalBody className="transfer-create-dialog__body space-y-6 text-sm leading-relaxed">
        {errorBanner ? (
          <div className="transfer-create-dialog__error rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
            {errorBanner}
          </div>
        ) : null}

        {issuedCode ? (
          <section className="transfer-create-dialog__issued space-y-4 rounded-3xl border border-border/60 bg-surface/60 p-5">
            <div className="transfer-create-dialog__issued-header flex items-start justify-between gap-4">
              <div className="transfer-create-dialog__issued-title-wrap space-y-1">
                <h3 className="transfer-create-dialog__issued-title text-base font-semibold text-surface-foreground">
                  引継ぎコードを発行しました
                </h3>
                <p className="transfer-create-dialog__issued-subtitle text-xs text-muted-foreground">
                  発行後は引き継ぎ先の端末で、「ガチャを登録」から「引継ぎコード入力」でデータを移行することが出来ます。
                </p>
              </div>
              <span className="transfer-create-dialog__issued-icon inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-surface text-accent">
                <ArrowPathRoundedSquareIcon className="h-6 w-6" aria-hidden="true" />
              </span>
            </div>

            <div className="transfer-create-dialog__code-panel flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-surface/30 px-4 py-3">
              <div className="transfer-create-dialog__code-wrap space-y-1">
                <span className="transfer-create-dialog__code-label text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  5桁の引継ぎコード
                </span>
                <div className="transfer-create-dialog__code text-2xl font-semibold tracking-[0.35em] text-surface-foreground">
                  {issuedCode}
                </div>
              </div>
              <button
                type="button"
                className="transfer-create-dialog__copy btn btn-muted inline-flex items-center gap-2"
                onClick={() => void copyCode()}
              >
                <ClipboardIcon className="h-5 w-5" aria-hidden="true" />
                {copied ? 'コピーしました' : 'コピー'}
              </button>
            </div>

            <div className="transfer-create-dialog__notes space-y-2 text-xs text-muted-foreground">
              <p className="transfer-create-dialog__note">
                暗証番号（4桁）は復元に必要です。忘れると復元できません。
              </p>
              {expiresAtLabel ? (
                <p className="transfer-create-dialog__note transfer-create-dialog__note--expires">
                  有効期限: {expiresAtLabel}
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="transfer-create-dialog__form space-y-4 rounded-3xl border border-border/60 bg-surface/60 p-5">
            <div className="transfer-create-dialog__form-header grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="transfer-create-dialog__form-title-wrap space-y-1">
                <h3 className="transfer-create-dialog__form-title text-base font-semibold text-surface-foreground">
                  暗証番号を設定してコードを発行
                </h3>
                <p className="transfer-create-dialog__form-subtitle text-xs text-muted-foreground">
                  暗証番号（4桁）でバックアップを暗号化し、クラウドへ一時保存します。
                </p>
              </div>
              <button
                type="button"
                className="transfer-create-dialog__issue btn btn-primary inline-flex items-center gap-2 whitespace-nowrap sm:ml-2 sm:shrink-0"
                onClick={() => void handleIssue()}
                disabled={!canIssue}
                aria-busy={pending}
              >
                {pending ? (
                  <ArrowPathIcon className="transfer-create-dialog__issue-icon h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowPathRoundedSquareIcon className="transfer-create-dialog__issue-icon h-5 w-5" aria-hidden="true" />
                )}
                <span className="transfer-create-dialog__issue-label">{pending ? '発行中...' : '引継ぎコードを発行'}</span>
              </button>
            </div>

            <div className="transfer-create-dialog__inputs grid gap-3 sm:grid-cols-2">
              <label className="transfer-create-dialog__input-block flex flex-col gap-2">
                <span className="transfer-create-dialog__input-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  暗証番号（4桁）
                </span>
                <input
                  id="transfer-create-pin-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="one-time-code"
                  className="transfer-create-dialog__input w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="例: 1234"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                />
              </label>
              <label className="transfer-create-dialog__input-block flex flex-col gap-2">
                <span className="transfer-create-dialog__input-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  暗証番号（確認）
                </span>
                <input
                  id="transfer-create-pin-confirm-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="one-time-code"
                  className="transfer-create-dialog__input w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="もう一度入力"
                  value={pinConfirm}
                  onChange={(event) => setPinConfirm(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                />
              </label>
            </div>

            <p className="transfer-create-dialog__hint text-xs text-muted-foreground">
              発行後は引き継ぎ先の端末で、「ガチャを登録」から「引継ぎコード入力」でデータを移行することが出来ます。
            </p>
          </section>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="transfer-create-dialog__close btn btn-muted" onClick={close} disabled={pending}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
