import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useDiscordSession } from './useDiscordSession';
import { DISCORD_BOT_INVITE_URL } from './discordInviteConfig';
import { initializeDiscordInfoStore, onDiscordInfoStoreDecryptFailure } from './discordInfoStore';
import { useModal } from '../../modals/ModalProvider';
import { DiscordBotInviteDialog, DiscordStorageRecoveryDialog, WarningDialog } from '../../modals/dialogs';

function DiscordInfoStoreFailureHandler({ children }: PropsWithChildren): JSX.Element {
  const { push } = useModal();
  const { data } = useDiscordSession();
  const openedRef = useRef(false);
  const userId = data?.user?.id ?? null;
  const userName = data?.user?.name ?? null;

  const openBotInviteModal = useCallback(() => {
    if (!userId) {
      return;
    }

    push(DiscordBotInviteDialog, {
      id: 'discord-storage-recovery',
      title: 'お渡し鯖の設定',
      size: 'lg',
      payload: {
        userId,
        userName: userName ?? undefined,
        inviteUrl: DISCORD_BOT_INVITE_URL,
        onGuildSelected: () => {}
      }
    });
  }, [push, userId, userName]);

  useEffect(() => {
    const unsubscribe = onDiscordInfoStoreDecryptFailure(() => {
      if (openedRef.current) {
        return;
      }
      openedRef.current = true;

      if (!userId) {
        push(WarningDialog, {
          id: 'discord-storage-recovery-warning',
          title: 'Discord連携情報を再取得してください',
          payload: {
            message: 'Discord連携情報を再取得するには、Discordログインが必要です。'
          }
        });
        return;
      }

      push(DiscordStorageRecoveryDialog, {
        id: 'discord-storage-recovery-dialog',
        title: 'Discord連携情報の再取得',
        payload: {
          onRetry: openBotInviteModal
        }
      });
    });

    return unsubscribe;
  }, [openBotInviteModal, push, userId]);

  return <>{children}</>;
}

export function DiscordInfoStoreGate({ children }: PropsWithChildren): JSX.Element | null {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void initializeDiscordInfoStore()
      .catch((error) => {
        console.warn('DiscordInfoStore initialization failed; continuing without persistence', error);
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return null;
  }

  return <DiscordInfoStoreFailureHandler>{children}</DiscordInfoStoreFailureHandler>;
}
