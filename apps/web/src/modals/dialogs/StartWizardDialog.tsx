import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { useCallback, useId, useMemo, useRef } from 'react';

import {
  ModalBody,
  ModalFooter,
  type ModalComponentProps
} from '..';
import { GuideInfoDialog } from './GuideInfoDialog';

export interface StartWizardDialogPayload {
  onPickTxt?: (file: File) => void;
  onCreateNew?: () => void;
  onImportBackup?: (file: File) => void;
  onEnterTransferCode?: () => void;
  onOpenGuide?: () => void;
}

type StartWizardTileKey = 'backup' | 'transfer' | 'txt' | 'new';

interface StartWizardTileConfig {
  key: StartWizardTileKey;
  title: string;
  description: string;
  onSelect: () => void;
}

export function StartWizardDialog({ payload, close, push }: ModalComponentProps<StartWizardDialogPayload>): JSX.Element {
  const txtInputId = useId();
  const backupInputId = useId();
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

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
        key: 'backup',
        title: 'バックアップから読み込む',
        description: 'エクスポートしたバックアップファイル（.shimmy）を取り込み、現在の環境へ復元します。',
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
      },
      {
        key: 'new',
        title: '新しくガチャを始める',
        description: 'レアリティ・景品・ユーザーの初期設定をゼロから作成します。',
        onSelect: handleCreateNew
      }
    ],
    [handleImportBackup, handleEnterTransferCode, handlePickTxt, handleCreateNew]
  );

  const renderTile = (tile: StartWizardTileConfig) => {
    return (
      <button
        key={tile.key}
        type="button"
        onClick={tile.onSelect}
        className="start-wizard__tile group flex h-full flex-col gap-4 rounded-3xl border border-border/60 bg-surface/80 p-6 text-left transition hover:border-accent/40 hover:bg-surface/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="start-wizard__tile-content space-y-3">
          <h3 className="start-wizard__tile-title text-lg font-semibold text-surface-foreground">
            {tile.title}
          </h3>
          <p className="start-wizard__tile-description text-sm leading-relaxed text-muted-foreground">
            {tile.description}
          </p>
        </div>
        <span className="start-wizard__tile-cta mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent transition">
          進む
        </span>
      </button>
    );
  };

  return (
    <>
      <ModalBody className="start-wizard__body space-y-6 text-sm leading-relaxed">
        <section className="start-wizard__tiles-wrapper overflow-hidden rounded-3xl bg-surface/80 p-6 backdrop-blur">
          <div className="start-wizard__grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((tile) => renderTile(tile))}
          </div>
        </section>
        <div className="start-wizard__guide-note flex items-start gap-3 rounded-3xl border border-accent/20 bg-gradient-to-r from-accent/15 via-surface/60 to-surface/80 px-5 py-4 text-sm text-muted-foreground">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
          <div className="space-y-2">
            <p className="text-[13px] leading-relaxed">
              手動入力で結果を貼り付ける場合は、画面上部の「手動入力」ボタンから専用モーダルを開いてください。
            </p>
            <button
              type="button"
              className="start-wizard__guide-button inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/60 hover:bg-accent hover:text-white"
              onClick={() => {
                if (payload?.onOpenGuide) {
                  payload.onOpenGuide();
                  return;
                }
                push(GuideInfoDialog, {
                  id: 'guide-info',
                  title: '次のステップ',
                  size: 'sm',
                  payload: {
                    message:
                      'ガチャ結果は画面上部の「手動入力」ボタンを押してペーストしてください。',
                    confirmLabel: '分かった'
                  }
                });
              }}
            >
              ガイドを確認する
            </button>
          </div>
        </div>
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
          accept=".shimmy,application/x-shimmy"
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
