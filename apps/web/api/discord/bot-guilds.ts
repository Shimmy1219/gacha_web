import { DEFAULT_CSRF_HEADER_NAME } from '../_lib/csrf.js';
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { createEdgeRequestLogger } from '../_lib/edgeLogger.js';

export const config = { runtime: 'edge' };

type BotGuildFetchStatus = 'ok' | 'missing_token' | 'failed';

type RawDiscordGuild = {
  id?: unknown;
  name?: unknown;
  icon?: unknown;
  owner?: unknown;
  permissions?: unknown;
  permissions_new?: unknown;
  features?: unknown;
};

type DiscordGuildSummary = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | null;
  permissionsNew: string | null;
  features: string[];
  botJoined: boolean;
};

type BotGuildFetchResult = {
  status: BotGuildFetchStatus;
  source: 'users' | 'applications' | null;
  ids: Set<string>;
  error?: { status: number | null; body: string | null };
};

type BotGuildResponsePayload = {
  ok: true;
  guilds: DiscordGuildSummary[];
  meta: {
    botGuildCount: number;
    botGuildSource: 'users' | 'applications' | null;
    botFetchStatus: BotGuildFetchStatus;
  };
};

type BotGuildErrorPayload = {
  ok: false;
  error: string;
};

function jsonResponse(status: number, body: BotGuildResponsePayload | BotGuildErrorPayload, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers ?? undefined);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  return new Response(JSON.stringify(body), { ...init, status, headers });
}

function normalizeString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  return null;
}

function normalizeGuild(raw: RawDiscordGuild): DiscordGuildSummary | null {
  const id = normalizeString(raw.id);
  const name = normalizeString(raw.name);
  if (!id || !name) {
    return null;
  }

  const iconValue = normalizeString(raw.icon);
  const featuresValue = Array.isArray(raw.features)
    ? raw.features.filter((feature): feature is string => typeof feature === 'string')
    : [];

  return {
    id,
    name,
    icon: iconValue,
    owner: raw.owner === true,
    permissions: normalizeString(raw.permissions),
    permissionsNew: normalizeString(raw.permissions_new),
    features: featuresValue,
    botJoined: false,
  };
}

async function fetchUserOwnedGuilds(accessToken: string, log: ReturnType<typeof createEdgeRequestLogger>): Promise<DiscordGuildSummary[]> {
  const response = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    log.error('failed to fetch user guilds', { status: response.status, body });
    throw new Error(`discord responded with ${response.status}`);
  }

  const payload = (await response.json()) as RawDiscordGuild[];
  if (!Array.isArray(payload)) {
    log.error('discord user guild payload is not an array');
    throw new Error('invalid discord payload');
  }

  const normalized = payload
    .map((item) => normalizeGuild(item))
    .filter((item): item is DiscordGuildSummary => Boolean(item));

  return normalized.filter((guild) => guild.owner);
}

async function fetchBotGuilds(token: string | null, log: ReturnType<typeof createEdgeRequestLogger>): Promise<BotGuildFetchResult> {
  if (!token) {
    log.warn('bot token is not configured');
    return { status: 'missing_token', source: null, ids: new Set() };
  }

  const endpoints: Array<{ url: string; source: 'users' | 'applications' }> = [
    { url: 'https://discord.com/api/users/@me/guilds', source: 'users' },
    { url: 'https://discord.com/api/applications/@me/guilds', source: 'applications' },
  ];

  let lastError: { status: number | null; body: string | null } | undefined;

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint.url, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (response.ok) {
      const payload = (await response.json()) as RawDiscordGuild[];
      if (!Array.isArray(payload)) {
        log.warn('bot guild payload is not an array', { source: endpoint.source });
        continue;
      }
      const ids = new Set<string>();
      for (const item of payload) {
        const id = normalizeString(item?.id);
        if (id) {
          ids.add(id);
        }
      }
      log.info('bot guilds fetched', { source: endpoint.source, guildCount: ids.size });
      return { status: 'ok', source: endpoint.source, ids };
    }

    const body = await response.text();
    lastError = { status: response.status, body };
    log.warn('failed to fetch bot guilds', { source: endpoint.source, status: response.status, body });
  }

  return {
    status: 'failed',
    source: null,
    ids: new Set(),
    error: lastError,
  };
}

export default async function handler(request: Request): Promise<Response> {
  const log = createEdgeRequestLogger('api/discord/bot-guilds', request);
  log.info('request received');

  if (request.method !== 'GET') {
    log.warn('method not allowed', { method: request.method });
    return jsonResponse(405, { ok: false, error: 'Method Not Allowed' }, { headers: { Allow: 'GET' } });
  }

  const cookies = getCookies(request);
  const sid = typeof cookies?.sid === 'string' ? cookies.sid : null;
  if (!sid) {
    log.info('session cookie is missing');
    return jsonResponse(401, { ok: false, error: 'no session' });
  }

  const csrfCookie = typeof cookies?.discord_csrf === 'string' ? cookies.discord_csrf : null;
  const csrfHeader = request.headers.get(DEFAULT_CSRF_HEADER_NAME);
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    log.warn('csrf validation failed', {
      hasCookie: Boolean(csrfCookie),
      hasHeader: Boolean(csrfHeader),
    });
    return jsonResponse(403, { ok: false, error: 'csrf mismatch' });
  }

  let session: any;
  try {
    session = await getSessionWithRefresh(sid);
  } catch (error) {
    log.error('failed to resolve session', { error });
    return jsonResponse(500, { ok: false, error: 'failed to load session' });
  }

  if (!session) {
    log.info('session not found');
    return jsonResponse(401, { ok: false, error: 'invalid session' });
  }

  const accessToken = typeof session?.access_token === 'string' ? session.access_token : null;
  if (!accessToken) {
    log.warn('session missing access token');
    return jsonResponse(401, { ok: false, error: 'invalid session' });
  }

  let ownedGuilds: DiscordGuildSummary[];
  try {
    ownedGuilds = await fetchUserOwnedGuilds(accessToken, log);
  } catch (error) {
    log.error('failed to collect owned guilds', { error });
    return jsonResponse(502, { ok: false, error: 'failed to fetch discord guilds' });
  }

  const botToken = typeof process.env.DISCORD_BOT_TOKEN === 'string' ? process.env.DISCORD_BOT_TOKEN.trim() : '';
  const botResult = await fetchBotGuilds(botToken || null, log);

  const guilds = ownedGuilds.map((guild) => ({
    ...guild,
    botJoined: botResult.ids.has(guild.id),
  }));

  log.info('guilds resolved', {
    ownedGuildCount: ownedGuilds.length,
    intersectCount: guilds.filter((guild) => guild.botJoined).length,
    botFetchStatus: botResult.status,
  });

  return jsonResponse(200, {
    ok: true,
    guilds,
    meta: {
      botGuildCount: botResult.ids.size,
      botGuildSource: botResult.source,
      botFetchStatus: botResult.status,
    },
  });
}
