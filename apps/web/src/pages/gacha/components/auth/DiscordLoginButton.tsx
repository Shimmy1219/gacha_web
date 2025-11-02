import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { useDiscordSession } from '../../../../features/discord/useDiscordSession';
import { useModal, DiscordBotInviteDialog } from '../../../../modals';
import {
  loadDiscordGuildSelection,
  type DiscordGuildSelection
} from '../../../../features/discord/discordGuildSelectionStorage';

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

const BOT_INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1421371141666377839&permissions=805317648&redirect_uri=https%3A%2F%2Fstg.shimmy3.com%2Fapi%2Fauth%2Fdiscord%2Fcallback&integration_type=0&scope=bot';

export function DiscordLoginButton({
  placement = 'toolbar',
  onOpenPageSettings,
  className
}: DiscordLoginButtonProps): JSX.Element {
  const { data, isLoading, login, logout } = useDiscordSession();
  const { push } = useModal();
  const user = data?.user;
  const previousUserIdRef = useRef<string | null>(null);
  const openedGuildModalUserRef = useRef<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [guildSelection, setGuildSelection] = useState<DiscordGuildSelection | null>(null);
  const [hasLoadedGuildSelection, setHasLoadedGuildSelection] = useState(false);

  const userId = user?.id;
  const userName = user?.name;

  useEffect(() => {
    if (userId && previousUserIdRef.current !== userId) {
      console.info('Discordログインに成功しました', { userId, userName });
    }
    previousUserIdRef.current = userId ?? null;
  }, [userId, userName]);

  useEffect(() => {
    if (!userId) {
      setGuildSelection(null);
      setHasLoadedGuildSelection(false);
      return;
    }
    const stored = loadDiscordGuildSelection(userId);
    setGuildSelection(stored);
    setHasLoadedGuildSelection(true);
  }, [userId]);

  const openBotInviteModal = useCallback(() => {
    if (!userId) {
      return;
    }

    push(DiscordBotInviteDialog, {
      id: 'discord-bot-invite',
      title: 'お渡し鯖の設定',
      size: 'lg',
      payload: {
        userId,
        userName,
        inviteUrl: BOT_INVITE_URL,
        onGuildSelected: (selection) => {
          setGuildSelection(selection);
        }
      }
    });
  }, [push, userId, userName]);

  useEffect(() => {
    if (!userId) {
      openedGuildModalUserRef.current = null;
      return;
    }

    if (!hasLoadedGuildSelection) {
      return;
    }

    if (openedGuildModalUserRef.current === userId) {
      return;
    }

    if (!guildSelection) {
      openedGuildModalUserRef.current = userId;
      openBotInviteModal();
    }
  }, [guildSelection, hasLoadedGuildSelection, openBotInviteModal, userId]);

  if (isLoading && !data) {
    return (
      <div
        className={clsx('discord-login-button h-11 w-44 animate-pulse rounded-xl bg-surface/40', className)}
        aria-hidden
      />
    );
  }

  const handleOpenPageSettings = () => {
    if (onOpenPageSettings) {
      onOpenPageSettings();
    } else {
      console.info('ページ設定ダイアログは未実装です');
    }
  };

  if (!user) {
    const handleLoginClick = async () => {
      if (isLoggingIn) {
        return;
      }

      setIsLoggingIn(true);
      try {
        await login();
      } catch (error) {
        console.error('Discordログインの開始に失敗しました', error);
        setIsLoggingIn(false);
      }
    };

    return (
      <div className={clsx('discord-login-button__container relative inline-block', className)}>
        <button
          type="button"
          onClick={handleLoginClick}
          data-placement={placement}
          className={clsx(
            'discord-login-button inline-flex h-11 items-center gap-2 rounded-xl bg-discord-primary px-5 text-sm font-semibold text-white transition hover:bg-discord-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-70',
            className
          )}
          aria-label="Discordでログイン"
          disabled={isLoggingIn}
          aria-busy={isLoggingIn}
        >
          <ShieldCheckIcon className="h-5 w-5" />
          Discordでログイン
        </button>
        <button
          type="button"
          onClick={handleOpenPageSettings}
          className="discord-login-button__settings absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/60 bg-panel px-4 py-1.5 text-xs font-medium text-surface-foreground transition hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          設定モーダルを開く
        </button>
      </div>
    );
  }

  const avatarUrl = getAvatarUrl(user.id, user.avatar);
  const displayName = user.name ?? 'Discord ユーザー';

  return (
    <Menu
      as="div"
      className={clsx('discord-login-button relative inline-flex text-left', className)}
      data-placement={placement}
    >
      <Menu.Button
        className="discord-login-button__trigger inline-flex h-11 items-center gap-3 rounded-xl bg-discord-primary px-5 text-sm font-semibold text-white transition hover:bg-discord-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
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
        <Menu.Items className="discord-login-button__menu absolute right-0 top-full z-20 mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-border/70 bg-panel/95">
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={openBotInviteModal}
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-3 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <UserGroupIcon className="h-4 w-4" />
                <span className="flex flex-col text-left">
                  <span>お渡し鯖を設定</span>
                  <span className="text-xs text-muted-foreground">
                    {guildSelection ? `現在: ${guildSelection.guildName}` : 'Bot招待が必要'}
                  </span>
                </span>
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={handleOpenPageSettings}
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-3 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <Cog6ToothIcon className="h-4 w-4" />
                設定
              </button>
            )}
          </Menu.Item>
          <div className="discord-login-button__menu-divider border-t border-border/60" />
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={async () => {
                  await logout();
                }}
                className={clsx(
                  'discord-login-button__menu-item flex w-full items-center gap-3 px-5 py-3 text-sm text-surface-foreground transition',
                  active ? 'bg-surface/40' : undefined
                )}
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                ログアウト
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
