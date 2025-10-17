import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { useDiscordSession } from '../../features/discord/useDiscordSession';

function getAvatarUrl(id: string, avatar?: string): string | undefined {
  if (!avatar) {
    return undefined;
  }
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64`;
}

interface DiscordLoginButtonProps {
  placement?: 'toolbar' | 'splash' | string;
  onOpenPageSettings?: () => void;
  className?: string;
}

export function DiscordLoginButton({
  placement = 'toolbar',
  onOpenPageSettings,
  className
}: DiscordLoginButtonProps): JSX.Element {
  const { data, isLoading, isError, login, logout, refetch } = useDiscordSession();
  const user = data?.user;

  if (isLoading) {
    return (
      <div
        className={clsx('discord-login-button h-11 w-44 animate-pulse rounded-xl bg-surface/40', className)}
        aria-hidden
      />
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={login}
        data-placement={placement}
        className={clsx(
          'discord-login-button inline-flex h-11 items-center gap-2 rounded-xl bg-discord-primary px-5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(88,101,242,0.45)] transition hover:bg-discord-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70',
          className
        )}
        aria-label="Discordでログイン"
      >
        <ShieldCheckIcon className="h-5 w-5" />
        Discordでログイン
      </button>
    );
  }

  const avatarUrl = getAvatarUrl(user.id, user.avatar);
  const displayName = user.name ?? 'Discord ユーザー';

  const handleOpenPageSettings = () => {
    if (onOpenPageSettings) {
      onOpenPageSettings();
    } else {
      console.info('ページ設定ダイアログは未実装です');
    }
  };

  return (
    <Menu
      as="div"
      className={clsx('discord-login-button relative inline-flex text-left', className)}
      data-placement={placement}
    >
      <Menu.Button
        className="discord-login-button__trigger inline-flex h-11 items-center gap-3 rounded-xl bg-discord-primary px-5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(88,101,242,0.45)] transition hover:bg-discord-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        aria-label={`${displayName} のメニューを開く`}
      >
        <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/20">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Discord avatar" className="h-full w-full object-cover" />
          ) : (
            <span className="text-base font-bold">{displayName.slice(0, 1)}</span>
          )}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">ログイン中</span>
          <span className="text-sm font-semibold text-white">{displayName}</span>
        </span>
        <ChevronDownIcon className="h-4 w-4 text-white/70" />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="discord-login-button__menu absolute right-0 z-20 mt-2 w-60 origin-top-right overflow-hidden rounded-2xl border border-border/70 bg-[#15151b]/95 shadow-[0_24px_72px_rgba(0,0,0,0.65)]">
          <div className="discord-login-button__menu-header p-3 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Discord セッション操作
            {isError ? (
              <span className="discord-login-button__menu-status ml-2 text-[#f87171]">同期失敗</span>
            ) : null}
          </div>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={handleOpenPageSettings}
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-2.5 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <Cog6ToothIcon className="h-4 w-4" />
                ページ設定
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={async () => {
                  await refetch();
                }}
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-2.5 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <ArrowPathIcon className="h-4 w-4" />
                最新情報を取得
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={async () => {
                  await logout();
                }}
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-2.5 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                ログアウト
              </button>
            )}
          </Menu.Item>
          <div className="discord-login-button__menu-divider border-t border-border/60" />
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-2.5 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <XMarkIcon className="h-4 w-4" />
                閉じる
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
