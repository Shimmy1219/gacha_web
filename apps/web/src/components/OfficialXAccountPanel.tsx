import { clsx } from 'clsx';

import { XLogoIcon } from './icons/XLogoIcon';

export const OFFICIAL_X_ACCOUNT_ID = '@shiyuragacha';
export const OFFICIAL_X_ACCOUNT_URL = 'https://x.com/shiyuragacha';
export const OFFICIAL_X_CONTACT_GUIDE_MESSAGE =
  'バグや不具合、エラー、改善項目、新機能提案がありましたら、公式XアカウントのDMまでお願いします。';

interface OfficialXAccountPanelProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export function OfficialXAccountPanel({
  className,
  variant = 'default'
}: OfficialXAccountPanelProps): JSX.Element {
  const isCompact = variant === 'compact';

  return (
    <section
      className={clsx(
        'official-x-account-panel rounded-2xl border border-border/60 bg-panel/70 p-4 text-left',
        isCompact ? 'official-x-account-panel--compact p-3' : 'official-x-account-panel--default',
        className
      )}
      aria-label="公式Xアカウントへの案内"
    >
      <p
        className={clsx(
          'official-x-account-panel__account-label text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground',
          isCompact ? 'text-[11px]' : undefined
        )}
      >
        公式Xアカウント
      </p>
      <p
        className={clsx(
          'official-x-account-panel__account-id mt-1 text-sm font-semibold text-surface-foreground',
          isCompact ? 'text-xs' : undefined
        )}
      >
        {OFFICIAL_X_ACCOUNT_ID}
      </p>
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
          'official-x-account-panel__action-button mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface/70 px-3 py-2 text-sm font-semibold text-surface-foreground transition hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          isCompact ? 'text-xs' : undefined
        )}
      >
        <XLogoIcon aria-hidden className="official-x-account-panel__action-icon h-4 w-4 rounded-[4px]" />
        <span className="official-x-account-panel__action-label">公式Xアカウントへ移動する</span>
      </a>
    </section>
  );
}
