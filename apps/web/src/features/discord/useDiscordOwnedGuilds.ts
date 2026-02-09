import { useQuery } from '@tanstack/react-query';

import { fetchDiscordApi } from './fetchDiscordApi';

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon?: string | null;
  owner: boolean;
  permissions: string | null;
  permissionsNew: string | null;
  features: string[];
  botJoined: boolean;
}

interface DiscordGuildsResponse {
  ok: boolean;
  guilds?: DiscordGuildSummary[];
  error?: string;
}

async function fetchDiscordGuilds(): Promise<DiscordGuildSummary[]> {
  const response = await fetchDiscordApi('/api/discord/bot-guilds', {
    method: 'GET',
  });

  if (!response.ok) {
    const message = `Failed to fetch discord guilds: ${response.status}`;
    throw new Error(message);
  }

  const payload = (await response.json()) as DiscordGuildsResponse;
  if (!payload.ok || !Array.isArray(payload.guilds)) {
    throw new Error(payload.error ?? 'Discord guilds payload is invalid');
  }

  return payload.guilds;
}

export function useDiscordOwnedGuilds(userId?: string | null) {
  return useQuery<DiscordGuildSummary[]>({
    queryKey: ['discord', 'bot-guilds', userId ?? 'anonymous'],
    queryFn: fetchDiscordGuilds,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
