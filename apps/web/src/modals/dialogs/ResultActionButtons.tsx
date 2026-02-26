import {
  ArrowPathIcon,
  ChevronDownIcon,
  ClipboardIcon,
  PaperAirplaneIcon,
  ShareIcon
} from '@heroicons/react/24/outline';
import { Menu } from '@headlessui/react';
import { clsx } from 'clsx';

import { XLogoIcon } from '../../components/icons/XLogoIcon';

export type ResultActionQuickSendModeId = 'discord' | 'share_url';

export interface ResultActionButtonsQuickSendModeOption {
  id: ResultActionQuickSendModeId;
  label: string;
}

export interface ResultActionButtonsQuickSendProps {
  onClick: () => void;
  disabled?: boolean;
  inProgress?: boolean;
  label: string;
  minWidth?: string;
  modeOptions?: readonly ResultActionButtonsQuickSendModeOption[];
  selectedModeId?: ResultActionQuickSendModeId;
  onSelectMode?: (modeId: ResultActionQuickSendModeId) => void;
}

export interface ResultActionButtonsProps {
  onShare: () => void;
  onCopy: () => void;
  tweetUrl: string | null;
  quickSend?: ResultActionButtonsQuickSendProps;
  className?: string;
}

/**
 * 抽選結果カードで利用するアクションボタン群を描画する。
 * クイック送信・共有・X投稿・コピーを同一UIとして再利用するための共通コンポーネント。
 *
 * @param onShare Web Share API 経由で共有する処理
 * @param onCopy 共有テキストをクリップボードへコピーする処理
 * @param tweetUrl X投稿用URL。null時はXボタンを非活性表示する
 * @param quickSend Discordお渡し部屋へのクイック送信設定（省略時はボタン非表示）
 * @param className ルートコンテナに追加するクラス名
 * @returns アクションボタン群要素
 */
export function ResultActionButtons({
  onShare,
  onCopy,
  tweetUrl,
  quickSend,
  className
}: ResultActionButtonsProps): JSX.Element {
  const shouldShowQuickSendModeSelector = Boolean(
    quickSend?.modeOptions &&
      quickSend.modeOptions.length > 1 &&
      quickSend.selectedModeId &&
      quickSend.onSelectMode
  );

  return (
    <div
      className={clsx(
        'result-action-buttons flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap',
        className
      )}
    >
      {quickSend ? (
        <div
          className={clsx(
            'result-action-buttons__quick-send-group flex w-full items-stretch sm:w-auto',
            shouldShowQuickSendModeSelector ? 'gap-0' : 'gap-2'
          )}
          style={quickSend.minWidth ? { minWidth: quickSend.minWidth } : undefined}
        >
          {shouldShowQuickSendModeSelector ? (
            <Menu as="div" className="result-action-buttons__quick-send-mode relative">
              <Menu.Button
                type="button"
                className="result-action-buttons__quick-send-mode-trigger btn flex h-full items-center justify-center rounded-r-none border-r border-white/20 bg-discord-primary px-2 py-1.5 text-white transition hover:bg-discord-hover focus-visible:ring-2 focus-visible:ring-accent/70"
                aria-label="クイックアクションのモードを切り替え"
              >
                <ChevronDownIcon className="result-action-buttons__quick-send-mode-trigger-icon h-3.5 w-3.5" aria-hidden="true" />
              </Menu.Button>
              <Menu.Items className="result-action-buttons__quick-send-mode-menu absolute bottom-full left-0 z-50 mb-2 min-w-[10rem] rounded-xl border border-border/70 bg-panel p-1 text-xs text-surface-foreground shadow-lg outline-none">
                {quickSend.modeOptions?.map((modeOption) => (
                  <Menu.Item key={modeOption.id}>
                    {({ active }) => (
                      <button
                        type="button"
                        className={clsx(
                          'result-action-buttons__quick-send-mode-option w-full rounded-lg px-3 py-2 text-left transition',
                          active && 'bg-surface-alt',
                          quickSend.selectedModeId === modeOption.id && 'text-accent'
                        )}
                        onClick={() => quickSend.onSelectMode?.(modeOption.id)}
                      >
                        {modeOption.label}
                      </button>
                    )}
                  </Menu.Item>
                ))}
              </Menu.Items>
            </Menu>
          ) : null}

          <button
            type="button"
            className={clsx(
              'result-action-buttons__quick-send btn flex w-full items-center justify-center gap-1 text-center !min-h-0 bg-discord-primary px-3 py-1.5 text-xs text-white transition hover:bg-discord-hover focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto',
              shouldShowQuickSendModeSelector && 'rounded-l-none'
            )}
            onClick={quickSend.onClick}
            disabled={quickSend.disabled}
          >
            {quickSend.inProgress ? (
              <ArrowPathIcon className="result-action-buttons__quick-send-icon h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PaperAirplaneIcon className="result-action-buttons__quick-send-icon h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="result-action-buttons__quick-send-label">{quickSend.label}</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="result-action-buttons__share btn btn-muted aspect-square h-8 w-8 p-1.5 !min-h-0"
        onClick={onShare}
        title="結果を共有"
        aria-label="結果を共有"
      >
        <ShareIcon className="result-action-buttons__share-icon h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">結果を共有</span>
      </button>
      {tweetUrl ? (
        <a
          href={tweetUrl}
          className="result-action-buttons__tweet btn aspect-square h-8 w-8 border-none bg-[#000000] p-1.5 text-white transition hover:bg-[#111111] focus-visible:ring-2 focus-visible:ring-white/70 !min-h-0"
          target="_blank"
          rel="noopener noreferrer"
          title="Xで共有"
          aria-label="Xで共有"
        >
          <XLogoIcon aria-hidden className="result-action-buttons__tweet-icon h-3.5 w-3.5" />
          <span className="sr-only">Xで共有</span>
        </a>
      ) : (
        <span
          className="result-action-buttons__tweet-disabled btn aspect-square h-8 w-8 border-none bg-[#000000]/60 p-1.5 text-white/70 !min-h-0"
          aria-disabled="true"
          title="Xで共有"
        >
          <XLogoIcon aria-hidden className="result-action-buttons__tweet-icon h-3.5 w-3.5" />
          <span className="sr-only">Xで共有</span>
        </span>
      )}
      <button
        type="button"
        className="result-action-buttons__copy btn btn-muted aspect-square h-8 w-8 p-1.5 !min-h-0"
        onClick={onCopy}
        title="結果をコピー"
        aria-label="結果をコピー"
      >
        <ClipboardIcon className="result-action-buttons__copy-icon h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">結果をコピー</span>
      </button>
    </div>
  );
}
