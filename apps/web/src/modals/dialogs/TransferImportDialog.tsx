import { useCallback, useMemo, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { BackupImportConflictDialog } from './BackupImportConflictDialog';
import { useAppPersistence, useDomainStores } from '../../features/storage/AppPersistenceProvider';
import {
  importBackupFromFile,
  type BackupDuplicateEntry,
  type BackupDuplicateResolution
} from '../../features/storage/backupService';
import {
  decryptTransferBlobToShimmy,
  normalizeTransferCode,
  TransferCryptoError,
  validateTransferPin
} from '../../features/transfer/transferCrypto';
import { TransferApiError, useTransferApi } from '../../features/transfer/useTransferApi';
import { useHaptics } from '../../features/haptics/HapticsProvider';

interface TransferImportDialogPayload {
  onImported?: () => void;
}

function formatIsoAsJp(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function TransferImportDialog({
  payload,
  push,
  close
}: ModalComponentProps<TransferImportDialogPayload>): JSX.Element {
  const persistence = useAppPersistence();
  const stores = useDomainStores();
  const { resolveTransfer, consumeTransfer } = useTransferApi();
  const { triggerConfirmation, triggerError } = useHaptics();

  const [codeInput, setCodeInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pending, setPending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resolvedExpiresAt, setResolvedExpiresAt] = useState<string | undefined>(undefined);

  const expiresAtLabel = useMemo(
    () => formatIsoAsJp(resolvedExpiresAt) ?? resolvedExpiresAt,
    [resolvedExpiresAt]
  );

  const resolveBackupDuplicate = useCallback(
    (entry: BackupDuplicateEntry) =>
      new Promise<BackupDuplicateResolution>((resolve) => {
        let settled = false;
        const finalize = (decision: BackupDuplicateResolution) => {
          if (!settled) {
            settled = true;
            resolve(decision);
          }
        };

        push(BackupImportConflictDialog, {
          id: 'backup-import-conflict',
          title: 'バックアップの復元',
          size: 'sm',
          payload: {
            entry,
            onResolve: (decision) => {
              finalize(decision);
            }
          },
          onClose: () => {
            finalize('skip');
          }
        });
      }),
    [push]
  );

  const canImport = useMemo(() => {
    if (pending) return false;
    if (successMessage) return false;
    if (!codeInput.trim() || !pinInput.trim()) return false;
    return true;
  }, [codeInput, pending, pinInput, successMessage]);

  const handleImport = useCallback(async () => {
    setErrorBanner(null);
    setSuccessMessage(null);
    setResolvedExpiresAt(undefined);

    let code: string;
    try {
      code = normalizeTransferCode(codeInput);
      validateTransferPin(pinInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : '入力内容が不正です';
      setErrorBanner(message);
      triggerError();
      return;
    }

    setPending(true);
    try {
      const resolved = await resolveTransfer({ code, pin: pinInput });
      setResolvedExpiresAt(resolved.expiresAt);

      const downloadResponse = await fetch(resolved.downloadUrl, { cache: 'no-store' });
      if (!downloadResponse.ok) {
        throw new Error(`引継ぎデータのダウンロードに失敗しました (status ${downloadResponse.status})`);
      }
      const encryptedBlob = await downloadResponse.blob();

      const shimmyBlob = await decryptTransferBlobToShimmy(encryptedBlob, pinInput);
      const file = new File([shimmyBlob], `transfer-${code}.shimmy`, { type: 'application/x-shimmy' });

      const result = await importBackupFromFile(file, {
        persistence,
        stores,
        resolveDuplicate: resolveBackupDuplicate
      });

      try {
        await consumeTransfer({ code });
      } catch (error) {
        console.warn('引継ぎデータの削除に失敗しました（復元は完了しています）', error);
      }

      const importedList =
        result.importedGachaNames.length > 0
          ? `追加したガチャ: ${result.importedGachaNames.join(', ')}`
          : result.importedGachaIds.length > 0
            ? `追加したガチャID: ${result.importedGachaIds.join(', ')}`
            : '追加できるガチャが見つかりませんでした。';
      const assetsLine = result.importedAssetCount > 0 ? `\n復元したアセット数: ${result.importedAssetCount}` : '';
      const skippedList =
        result.skippedGacha.length > 0
          ? `\nスキップされたガチャ: ${result.skippedGacha
              .map((entry) => entry.name ?? entry.id)
              .filter(Boolean)
              .join(', ')}`
          : '';

      setSuccessMessage(`引継ぎが完了しました。\n${importedList}${assetsLine}${skippedList}`);
      triggerConfirmation();
      payload?.onImported?.();
    } catch (error) {
      console.error('引継ぎに失敗しました', error);
      const message =
        error instanceof TransferCryptoError || error instanceof TransferApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : '不明なエラーが発生しました';
      setErrorBanner(`引継ぎに失敗しました: ${message}`);
      triggerError();
    } finally {
      setPending(false);
    }
  }, [
    codeInput,
    consumeTransfer,
    payload,
    persistence,
    pinInput,
    resolveBackupDuplicate,
    resolveTransfer,
    stores,
    triggerConfirmation,
    triggerError
  ]);

  return (
    <>
      <ModalBody className="transfer-import-dialog__body space-y-6 text-sm leading-relaxed">
        {errorBanner ? (
          <div className="transfer-import-dialog__error rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
            {errorBanner}
          </div>
        ) : null}

        {successMessage ? (
          <section className="transfer-import-dialog__success space-y-3 rounded-3xl border border-border/60 bg-surface/60 p-5">
            <h3 className="transfer-import-dialog__success-title text-base font-semibold text-surface-foreground">
              復元結果
            </h3>
            <pre className="transfer-import-dialog__success-message whitespace-pre-wrap rounded-2xl border border-border/60 bg-surface/30 p-4 text-xs text-muted-foreground">
              {successMessage}
            </pre>
          </section>
        ) : (
          <section className="transfer-import-dialog__form space-y-4 rounded-3xl border border-border/60 bg-surface/60 p-5">
            <div className="transfer-import-dialog__form-header flex items-start justify-between gap-4">
              <div className="transfer-import-dialog__form-title-wrap space-y-1">
                <h3 className="transfer-import-dialog__form-title text-base font-semibold text-surface-foreground">
                  引継ぎコードで復元
                </h3>
                <p className="transfer-import-dialog__form-subtitle text-xs text-muted-foreground">
                  5桁の引継ぎコードと、発行時に設定した4桁の暗証番号を入力してください。
                </p>
              </div>
            </div>

            <div className="transfer-import-dialog__inputs grid gap-3 sm:grid-cols-2">
              <label className="transfer-import-dialog__input-block flex flex-col gap-2">
                <span className="transfer-import-dialog__input-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  引継ぎコード（5桁）
                </span>
                <input
                  id="transfer-import-code-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={5}
                  autoComplete="one-time-code"
                  className="transfer-import-dialog__input w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="例: 01234"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                />
              </label>
              <label className="transfer-import-dialog__input-block flex flex-col gap-2">
                <span className="transfer-import-dialog__input-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  暗証番号（4桁）
                </span>
                <div className="transfer-import-dialog__pin-row flex items-center gap-2">
                  <input
                    id="transfer-import-pin-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="one-time-code"
                    className="transfer-import-dialog__input w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30"
                    placeholder="例: 1234"
                    value={pinInput}
                    onChange={(event) => setPinInput(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  />
                </div>
              </label>
            </div>

            {expiresAtLabel ? (
              <p className="transfer-import-dialog__expires text-xs text-muted-foreground">
                有効期限: {expiresAtLabel}
              </p>
            ) : null}

            <div className="transfer-import-dialog__actions flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="transfer-import-dialog__hint text-xs text-muted-foreground">
                復元完了後、引継ぎデータは削除されます。
              </p>
              <button
                type="button"
                className="transfer-import-dialog__import btn btn-primary"
                onClick={() => void handleImport()}
                disabled={!canImport}
                aria-busy={pending}
              >
                {pending ? '復元中...' : '復元する'}
              </button>
            </div>
          </section>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="transfer-import-dialog__close btn btn-muted" onClick={close} disabled={pending}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
