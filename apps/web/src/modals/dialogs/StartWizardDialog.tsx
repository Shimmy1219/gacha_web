import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useCallback, useId, useMemo, useRef, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

const BACKUP_FILE_ACCEPT = '.shimmy,.zip,application/x-shimmy,application/zip';

export interface StartWizardDialogPayload {
  onPickTxt?: (file: File) => void;
  onCreateNew?: () => void;
  onImportBackup?: (file: File) => void;
  onEnterTransferCode?: () => void;
}

type StartWizardTileKey = 'backup' | 'transfer' | 'txt' | 'new';

interface StartWizardTileConfig {
  key: StartWizardTileKey;
  title: string;
  description: string;
  onSelect: () => void;
}

export function StartWizardDialog({ payload, close }: ModalComponentProps<StartWizardDialogPayload>): JSX.Element {
  const txtInputId = useId();
  const backupInputId = useId();
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const additionalOptionsId = useId();
  const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);

  const handlePickTxt = useCallback(() => {
    txtInputRef.current?.click();
  }, []);

  const handleImportBackup = useCallback(() => {
    backupInputRef.current?.click();
  }, []);

  const handleCreateNew = useCallback(() => {
    if (payload?.onCreateNew) {
      payload.onCreateNew();
    } else {
      console.info('新規ガチャ作成は未接続です');
    }
    close();
  }, [close, payload?.onCreateNew]);

  const handleEnterTransferCode = useCallback(() => {
    if (payload?.onEnterTransferCode) {
      payload.onEnterTransferCode();
    } else {
      console.info('引継ぎコード入力処理は未接続です');
    }
    close();
  }, [close, payload?.onEnterTransferCode]);

  const tiles = useMemo<StartWizardTileConfig[]>(
    () => [
      {
        key: 'new',
        title: 'ガチャの新規作成',
        description: 'レアリティ・景品・ユーザーの初期設定をゼロから作成します。',
        onSelect: handleCreateNew
      },
      {
        key: 'backup',
        title: 'バックアップから読み込む',
        description:
          'エクスポートしたバックアップファイル（.shimmy または .shimmy.zip）を取り込み、現在の環境へ復元します。',
        onSelect: handleImportBackup
      },
      {
        key: 'transfer',
        title: '引継ぎコード入力',
        description: '別環境で発行した引継ぎコードを入力し、最新のガチャ情報を同期します。',
        onSelect: handleEnterTransferCode
      },
      {
        key: 'txt',
        title: '外部ガチャサイトと連携',
        description: '外部サイトでエクスポートしたTXTから排出設定と履歴を取り込みます。',
        onSelect: handlePickTxt
      }
    ],
    [handleCreateNew, handleImportBackup, handleEnterTransferCode, handlePickTxt]
  );

  const primaryTile = tiles[0];
  const secondaryTiles = tiles.slice(1);

  const renderTile = (tile: StartWizardTileConfig, options?: { variant?: 'primary' | 'default' }) => {
    const isPrimary = options?.variant === 'primary';
    return (
      <button
        key={tile.key}
        type="button"
        onClick={tile.onSelect}
        className={`start-wizard__tile group flex h-full flex-col gap-4 rounded-3xl border border-border/60 bg-surface/80 p-6 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          isPrimary
            ? 'border-accent/70 shadow-lg shadow-accent/15 ring-1 ring-inset ring-accent/40 hover:border-accent/80 hover:ring-accent/50'
            : 'hover:border-accent/40 hover:bg-surface/90'
        }`}
      >
        <div className="start-wizard__tile-content space-y-3">
          <h3 className="start-wizard__tile-title text-lg font-semibold text-surface-foreground">
            {tile.title}
          </h3>
          <p className="start-wizard__tile-description text-sm leading-relaxed text-muted-foreground">
            {tile.description}
          </p>
        </div>
      </button>
    );
  };

  return (
    <>
      <ModalBody className="start-wizard__body space-y-6 text-sm leading-relaxed">
        <section className="start-wizard__tiles-wrapper space-y-5 overflow-hidden rounded-3xl bg-surface/80 p-6 backdrop-blur">
          <div className="space-y-5 sm:hidden">
            {primaryTile ? <div>{renderTile(primaryTile, { variant: 'primary' })}</div> : null}
            <div>
              <button
                type="button"
                className="start-wizard__toggle flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface px-4 py-3 text-left text-sm font-semibold text-surface-foreground transition hover:border-accent/40 hover:bg-surface/90"
                onClick={() => setShowAdditionalOptions((prev) => !prev)}
                aria-expanded={showAdditionalOptions}
                aria-controls={additionalOptionsId}
              >
                その他の方法で始める
                <ChevronDownIcon
                  className={`h-5 w-5 transition-transform ${showAdditionalOptions ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <div id={additionalOptionsId} className={`mt-4 space-y-4 ${showAdditionalOptions ? 'block' : 'hidden'}`}>
                {secondaryTiles.map((tile) => renderTile(tile))}
              </div>
            </div>
          </div>
          <div className="start-wizard__grid hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((tile) =>
              renderTile(tile, { variant: tile.key === primaryTile?.key ? 'primary' : 'default' })
            )}
          </div>
        </section>
        <input
          ref={txtInputRef}
          id={txtInputId}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              payload?.onPickTxt?.(file);
              close();
            }
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={backupInputRef}
          id={backupInputId}
          type="file"
          accept={BACKUP_FILE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              if (payload?.onImportBackup) {
                payload.onImportBackup(file);
              } else {
                console.info('バックアップ読み込み処理は未接続です', file);
              }
              close();
            }
            event.currentTarget.value = '';
          }}
        />
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
