import { useQuery } from '@tanstack/react-query';

import { fetchDiscordApi } from './fetchDiscordApi';
import { getCsrfMismatchGuideMessageJa, inspectCsrfFailurePayload } from '../csrf/csrfGuards';

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
  errorCode?: string;
  csrfReason?: string;
}

async function fetchDiscordGuilds(): Promise<DiscordGuildSummary[]> {
  const response = await fetchDiscordApi('/api/discord/bot-guilds', {
    method: 'GET',
  });

  const payload = (await response.json().catch(() => null)) as DiscordGuildsResponse | null;

  if (!response.ok) {
    const csrfFailure = inspectCsrfFailurePayload(payload);
    if (csrfFailure.isMismatch) {
      throw new Error(`Discordギルド一覧の取得に失敗しました。\n\n${getCsrfMismatchGuideMessageJa(csrfFailure.reason)}`);
    }
    const message = payload?.error ?? `Failed to fetch discord guilds: ${response.status}`;
    throw new Error(message);
  }

  if (!payload?.ok || !Array.isArray(payload.guilds)) {
    throw new Error(payload?.error ?? 'Discord guilds payload is invalid');
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
