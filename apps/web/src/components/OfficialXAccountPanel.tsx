import { useCallback, useState } from 'react';
import { clsx } from 'clsx';

import { XLogoIcon } from './icons/XLogoIcon';

export const OFFICIAL_X_ACCOUNT_ID = '@shiyuragacha';
export const OFFICIAL_X_ACCOUNT_URL = 'https://x.com/shiyuragacha';
export const OFFICIAL_X_ACCOUNT_NAME = '四遊楽ガチャツール';
export const OFFICIAL_X_CONTACT_GUIDE_MESSAGE =
  'バグや不具合、エラー、改善項目、新機能提案がありましたら、公式XアカウントのDMまでお願いします。';

function buildPublicIconPath(fileName: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}icons/${fileName}`;
}

const OFFICIAL_X_ACCOUNT_TOOL_ICON_PRIMARY_URL = buildPublicIconPath('icon-192.png');
const OFFICIAL_X_ACCOUNT_TOOL_ICON_FALLBACK_URL = buildPublicIconPath('icon-512.png');

interface OfficialXAccountPanelProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export function OfficialXAccountPanel({
  className,
  variant = 'default'
}: OfficialXAccountPanelProps): JSX.Element {
  const isCompact = variant === 'compact';
  const [toolIconSrc, setToolIconSrc] = useState<string>(OFFICIAL_X_ACCOUNT_TOOL_ICON_PRIMARY_URL);
  const handleToolIconError = useCallback(() => {
    setToolIconSrc((currentSrc) => {
      if (currentSrc === OFFICIAL_X_ACCOUNT_TOOL_ICON_PRIMARY_URL) {
        return OFFICIAL_X_ACCOUNT_TOOL_ICON_FALLBACK_URL;
      }
      return '';
    });
  }, []);

  return (
    <section
      className={clsx(
        'official-x-account-panel rounded-2xl border border-border/60 bg-panel/70 p-4 text-left',
        isCompact ? 'official-x-account-panel--compact p-3' : 'official-x-account-panel--default',
        className
      )}
      aria-label="公式Xアカウントへの案内"
    >
      <div className="official-x-account-panel__header flex items-center gap-3">
        <span
          className={clsx(
            'official-x-account-panel__tool-icon-wrap inline-flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-surface/70',
            isCompact ? 'h-9 w-9' : undefined
          )}
          aria-hidden="true"
        >
          {toolIconSrc ? (
            <img
              src={toolIconSrc}
              alt=""
              className="official-x-account-panel__tool-icon h-full w-full object-cover"
              loading="eager"
              decoding="async"
              onError={handleToolIconError}
            />
          ) : (
            <span className="official-x-account-panel__tool-icon-fallback text-xs font-semibold text-muted-foreground">
              四
            </span>
          )}
        </span>
        <div className="official-x-account-panel__header-text">
          <p
            className={clsx(
              'official-x-account-panel__account-label text-xs font-semibold text-muted-foreground',
              isCompact ? 'text-[11px]' : undefined
            )}
          >
            公式アカウントが出来ました！
          </p>
          <p
            className={clsx(
              'official-x-account-panel__account-name mt-0.5 text-sm font-semibold text-surface-foreground',
              isCompact ? 'text-xs' : undefined
            )}
          >
            {OFFICIAL_X_ACCOUNT_NAME}
          </p>
          <p
            className={clsx(
              'official-x-account-panel__account-id mt-0.5 text-xs font-semibold text-muted-foreground',
              isCompact ? 'text-[11px]' : undefined
            )}
          >
            ID: {OFFICIAL_X_ACCOUNT_ID}
          </p>
        </div>
      </div>
      <p
        className={clsx(
          'official-x-account-panel__message mt-2 text-xs leading-relaxed text-muted-foreground',
          isCompact ? 'text-[11px]' : undefined
        )}
      >
        {OFFICIAL_X_CONTACT_GUIDE_MESSAGE}
      </p>
      <a
        href={OFFICIAL_X_ACCOUNT_URL}
        target="_blank"
        rel="noreferrer noopener"
        className={clsx(
          'official-x-account-panel__action-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black bg-black px-3 py-2 text-sm font-semibold text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/50',
          isCompact ? 'text-xs' : undefined
        )}
      >
        <XLogoIcon aria-hidden className="official-x-account-panel__action-icon h-4 w-4 rounded-[4px]" />
        <span className="official-x-account-panel__action-label">公式Xアカウントへ移動する</span>
      </a>
    </section>
  );
}
