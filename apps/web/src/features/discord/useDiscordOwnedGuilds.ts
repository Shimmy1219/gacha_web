import { useQuery } from '@tanstack/react-query';

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
  const csrfResponse = await fetch('/api/discord/csrf', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!csrfResponse.ok) {
    throw new Error(`Failed to issue CSRF token: ${csrfResponse.status}`);
  }

  const csrfPayload = (await csrfResponse.json()) as { ok: boolean; token?: string };
  if (!csrfPayload.ok || !csrfPayload.token) {
    throw new Error('Invalid CSRF payload received');
  }

  const response = await fetch('/api/discord/bot-guilds', {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-CSRF-Token': csrfPayload.token,
    },
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
