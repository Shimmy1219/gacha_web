import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  ModalBody,
  ModalFooter,
  type ModalComponentProps
} from '../../../components/modal';
import { GuideInfoDialog } from './GuideInfoDialog';

type StartWizardAutoPick = 'txt' | 'json' | 'new';

export interface StartWizardDialogPayload {
  onPickTxt?: (file: File) => void;
  onPickJson?: (file: File) => void;
  onCreateNew?: () => void;
  onOpenGuide?: () => void;
  autoPick?: StartWizardAutoPick;
}

interface StartWizardTileConfig {
  key: 'txt' | 'json' | 'new';
  title: string;
  description: string;
  accent: string;
  icon: JSX.Element;
  onSelect: () => void;
}

export function StartWizardDialog({ payload, close, push }: ModalComponentProps<StartWizardDialogPayload>): JSX.Element {
  const jsonInputId = useId();
  const txtInputId = useId();
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const [autoPickHandled, setAutoPickHandled] = useState(false);

  const handlePickTxt = useCallback(() => {
    txtInputRef.current?.click();
  }, []);

  const handlePickJson = useCallback(() => {
    jsonInputRef.current?.click();
  }, []);

  const handleCreateNew = useCallback(() => {
    if (payload?.onCreateNew) {
      payload.onCreateNew();
    } else {
      console.info('新規ガチャ作成は未接続です');
    }
    close();
  }, [close, payload?.onCreateNew]);

  const tiles = useMemo<StartWizardTileConfig[]>(
    () => [
      {
        key: 'txt',
        title: '外部ガチャサイトと連携',
        description: '外部サイトでエクスポートしたTXTから排出設定と履歴を取り込みます。',
        accent: 'TXTインポート',
        icon: <ArrowDownTrayIcon className="h-6 w-6" />,
        onSelect: handlePickTxt
      },
      {
        key: 'json',
        title: 'JSONを読み込む',
        description: '本ツール形式のgacha_summary.jsonなどを選択してAppStateへ反映します。',
        accent: 'JSONインポート',
        icon: <DocumentTextIcon className="h-6 w-6" />,
        onSelect: handlePickJson
      },
      {
        key: 'new',
        title: '新しくガチャを始める',
        description: 'レアリティ・景品・ユーザーの初期設定をゼロから作成します。',
        accent: '新規プロジェクト',
        icon: <SparklesIcon className="h-6 w-6" />,
        onSelect: handleCreateNew
      }
    ],
    [handlePickJson, handlePickTxt, handleCreateNew]
  );

  const autoPick = payload?.autoPick;

  useEffect(() => {
    if (autoPickHandled) {
      return;
    }

    if (!autoPick) {
      return;
    }

    const target = tiles.find((tile) => tile.key === autoPick);
    if (!target) {
      return;
    }

    setAutoPickHandled(true);
    target.onSelect();
  }, [autoPick, autoPickHandled, tiles]);

  const renderTile = (tile: StartWizardTileConfig) => {
    return (
      <button
        key={tile.key}
        type="button"
        onClick={tile.onSelect}
        className="start-wizard__tile group flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-surface/40 p-5 text-left transition hover:border-accent/60 hover:bg-surface/60"
      >
        <span className="start-wizard__tile-icon inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface text-accent">
          {tile.icon}
        </span>
        <div className="start-wizard__tile-content space-y-2">
          <div className="start-wizard__tile-accent text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
            {tile.accent}
          </div>
          <h3 className="start-wizard__tile-title text-base font-semibold text-surface-foreground">
            {tile.title}
          </h3>
          <p className="start-wizard__tile-description text-sm leading-relaxed text-muted-foreground">
            {tile.description}
          </p>
        </div>
        <span className="start-wizard__tile-cta mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent transition group-hover:text-white">
          進む
        </span>
      </button>
    );
  };

  return (
    <>
      <ModalBody>
        <div className="start-wizard__grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => renderTile(tile))}
        </div>
        <div className="start-wizard__guide-note flex items-start gap-3 rounded-2xl border border-white/5 bg-surface/40 px-4 py-3 text-sm text-muted-foreground">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
          <div className="space-y-2">
            <p>
              リアルタイムで結果を貼り付ける場合は、上部の「リアルタイム入力」ボタンから専用モーダルを開いてください。
            </p>
            <button
              type="button"
              className="start-wizard__guide-button inline-flex items-center gap-1 text-xs font-semibold text-accent transition hover:text-white"
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
                      'ガチャ結果は画面上部の「リアルタイム入力」ボタンを押してペーストしてください。',
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
          ref={jsonInputRef}
          id={jsonInputId}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              payload?.onPickJson?.(file);
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
