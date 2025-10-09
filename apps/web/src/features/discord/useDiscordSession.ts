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
    }
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
    window.location.href = '/api/auth/discord/start';
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
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
