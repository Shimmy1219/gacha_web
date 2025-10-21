import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface DiscordUserProfile {
  id: string;
  name?: string;
  avatar?: string;
}

export interface DiscordSessionData {
  ok: boolean;
  loggedIn?: boolean;
  user?: DiscordUserProfile;
}

export interface UseDiscordSessionResult {
  data?: DiscordSessionData;
  isLoading: boolean;
  isError: boolean;
  login(): void;
  logout(): Promise<void>;
  refetch(): Promise<DiscordSessionData | undefined>;
}

async function fetchSession(): Promise<DiscordSessionData> {
  const response = await fetch('/api/discord/me?soft=1', {
    headers: {
      Accept: 'application/json'
    },
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch discord session');
  }

  return (await response.json()) as DiscordSessionData;
}

export function useDiscordSession(): UseDiscordSessionResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['discord', 'session'],
    queryFn: fetchSession
  });

  const login = useCallback(() => {
    const loginUrl = '/api/auth/discord/start';

    try {
      window.location.assign(loginUrl);
    } catch (assignError) {
      console.error('window.location.assign によるDiscordログイン遷移に失敗しました', assignError);

      try {
        const popup = window.open(loginUrl, '_self');
        if (!popup) {
          throw new Error('Failed to open login window');
        }
      } catch (openError) {
        console.error('window.open によるDiscordログイン遷移にも失敗しました', openError);
        throw openError instanceof Error ? openError : new Error('Failed to initiate Discord login redirect');
      }
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    await queryClient.invalidateQueries({ queryKey: ['discord', 'session'] });
  }, [queryClient]);

  const refetch = useCallback(async () => {
    const result = await query.refetch();
    return result.data;
  }, [query]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    login,
    logout,
    refetch
  };
}
