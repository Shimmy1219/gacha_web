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
      <div className={clsx('h-10 w-40 animate-pulse rounded-lg bg-muted/60', className)} aria-hidden />
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={login}
        data-placement={placement}
        className={clsx(
          'inline-flex h-10 items-center gap-2 rounded-lg bg-discord-primary px-4 text-sm font-semibold text-white shadow-lg shadow-discord-primary/40 transition hover:bg-discord-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
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
    <Menu as="div" className={clsx('relative inline-flex text-left', className)} data-placement={placement}>
      <Menu.Button
        className="inline-flex h-10 items-center gap-3 rounded-lg bg-discord-primary px-4 text-sm font-semibold text-white shadow-lg shadow-discord-primary/40 transition hover:bg-discord-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
          <span className="text-xs text-white/70">ログイン中</span>
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
        <Menu.Items className="absolute right-0 z-20 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-border/60 bg-panel shadow-xl shadow-black/40">
          <div className="p-2 text-xs text-muted-foreground">
            Discord セッション操作
            {isError ? (
              <span className="ml-2 text-red-400">同期失敗</span>
            ) : null}
          </div>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={handleOpenPageSettings}
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-2 text-sm text-surface-foreground transition',
                  active ? 'bg-muted/60' : undefined
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
                  'flex w-full items-center gap-3 px-4 py-2 text-sm text-surface-foreground transition',
                  active ? 'bg-muted/60' : undefined
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
                  'flex w-full items-center gap-3 px-4 py-2 text-sm text-surface-foreground transition',
                  active ? 'bg-muted/60' : undefined
                )}
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                ログアウト
              </button>
            )}
          </Menu.Item>
          <div className="border-t border-border/60" />
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-2 text-sm text-surface-foreground transition',
                  active ? 'bg-muted/60' : undefined
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
