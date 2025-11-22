import { useEffect, useRef } from 'react';

import { notifyDiscordStorageError, resetDiscordStorageErrorNotification } from './discordStorageErrorHandler';
import { initializeDiscordUserState } from './discordUserStateStorage';
import { useDiscordSession } from './useDiscordSession';

const INIT_RETRY_DELAY_MS = 3000;
const INIT_MAX_ATTEMPTS = 2;

export function DiscordUserStateInitializer(): null {
  const { data } = useDiscordSession();
  const retryTimerRef = useRef<number | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const initializedUserRef = useRef<string | null>(null);

  useEffect(() => {
    const loggedIn = data?.loggedIn === true;
    const discordUserId = data?.user?.id ?? null;

    if (!loggedIn || !discordUserId) {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      inflightRef.current = null;
      initializedUserRef.current = null;
      return;
    }

    if (initializedUserRef.current === discordUserId && inflightRef.current) {
      return;
    }

    initializedUserRef.current = discordUserId;
    let cancelled = false;

    const runInitialization = async (attempt = 0): Promise<void> => {
      try {
        inflightRef.current = initializeDiscordUserState(discordUserId, { maxRetries: 0 });
        await inflightRef.current;
        inflightRef.current = null;
        resetDiscordStorageErrorNotification();
      } catch (error) {
        inflightRef.current = null;
        if (cancelled) {
          return;
        }

        if (attempt + 1 < INIT_MAX_ATTEMPTS) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            void runInitialization(attempt + 1);
          }, INIT_RETRY_DELAY_MS);
          return;
        }

        notifyDiscordStorageError(error);
      }
    };

    runInitialization();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [data?.loggedIn, data?.user?.id]);

  return null;
}
