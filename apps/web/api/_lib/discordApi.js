// /api/_lib/discordApi.js
// Discord REST薄ラッパ（429 retry, JSONパース, 失敗時throw）＋権限ビット
const BASE = 'https://discord.com/api';

export const PERM = {
  VIEW_CHANNEL: 1 << 10, // 1024
  SEND_MESSAGES: 1 << 11, // 2048
  READ_MESSAGE_HISTORY: 1 << 16, // 65536
};

const ENV_BOT_ID_KEYS = ['DISCORD_BOT_USER_ID', 'DISCORD_CLIENT_ID'];

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export async function dFetch(path, { token, isBot = false, method = 'GET', body = null, headers = {} } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token){
    h.Authorization = isBot ? `Bot ${token}` : `Bearer ${token}`;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = body == null ? undefined : JSON.stringify(body);
    const res = await fetch(url, { method, headers: h, body: payload });
    if (res.status === 429){
      const j = await res.json().catch(()=> ({}));
      const wait = Math.ceil((j.retry_after || 1) * 1000);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Discord ${method} ${url} -> ${res.status}: ${t}`);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }
  throw new Error(`Discord ${method} ${url} -> too many retries`);
}

export async function assertGuildOwner(userAccessToken, guildId) {
  const arr = await dFetch('/users/@me/guilds', { token: userAccessToken });
  const owners = Array.isArray(arr) ? arr.filter((g) => g.owner === true) : [];
  if (!owners.find((g) => String(g.id) === String(guildId))) {
    throw new Error('forbidden: not an owner of the guild');
  }
}

export function collectEnvBotIds() {
  const ids = new Set();
  for (const key of ENV_BOT_ID_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        ids.add(trimmed);
      }
    }
  }
  return ids;
}

let botIdentityCache = null;
let botIdentityCacheToken = null;
let botIdentityPromise = null;

export async function resolveBotIdentity(log) {
  const envIds = collectEnvBotIds();
  const token = typeof process.env.DISCORD_BOT_TOKEN === 'string' ? process.env.DISCORD_BOT_TOKEN.trim() : '';
  if (!token) {
    const primaryId = envIds.values().next().value || '';
    return { primaryId, idSet: envIds };
  }

  const finalize = (cache) => {
    const idSet = new Set([...envIds, ...(cache?.ids ?? [])]);
    const primaryId = cache?.primaryId || idSet.values().next().value || '';
    return { primaryId, idSet };
  };

  if (botIdentityCache && botIdentityCacheToken === token) {
    return finalize(botIdentityCache);
  }

  if (!botIdentityPromise) {
    botIdentityPromise = (async () => {
      try {
        const me = await dFetch('/users/@me', { token, isBot: true });
        const fetchedId = typeof me?.id === 'string' ? me.id.trim() : '';
        const ids = new Set();
        if (fetchedId) {
          ids.add(fetchedId);
        }
        botIdentityCacheToken = token;
        botIdentityCache = { primaryId: fetchedId, ids };
      } catch (error) {
        botIdentityCacheToken = token;
        botIdentityCache = { primaryId: '', ids: new Set() };
        const message = error instanceof Error ? error.message : String(error);
        log?.warn?.('failed to resolve bot id from token', { message });
      } finally {
        botIdentityPromise = null;
      }
      return botIdentityCache;
    })();
  }

  const cache = await botIdentityPromise;
  return finalize(cache);
}

export function normalizeOverwriteType(overwrite) {
  if (!overwrite) {
    return null;
  }
  const { type } = overwrite;
  if (typeof type === 'number') {
    if (type === 1) {
      return 'member';
    }
    if (type === 0) {
      return 'role';
    }
    return null;
  }
  if (typeof type === 'string') {
    const normalized = type.trim().toLowerCase();
    if (normalized === '1' || normalized === 'member') {
      return 'member';
    }
    if (normalized === '0' || normalized === 'role') {
      return 'role';
    }
  }
  return null;
}

export function toBigIntPermissionValue(value) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'string' && value) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  if (typeof value === 'number') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function hasPermissionBit(overwrite, bit, mode = 'allow') {
  const normalizedBit = typeof bit === 'bigint' ? bit : BigInt(bit);
  if (mode === 'allow') {
    return (toBigIntPermissionValue(overwrite?.allow) & normalizedBit) === normalizedBit;
  }
  if (mode === 'deny') {
    return (toBigIntPermissionValue(overwrite?.deny) & normalizedBit) === normalizedBit;
  }
  return false;
}

function extractDiscordApiErrorInfo(error) {
  if (!(error instanceof Error)) {
    return null;
  }
  const match = /->\s+(\d{3}):\s*(.*)$/s.exec(error.message);
  if (!match) {
    return { status: null, rawBody: null, message: error.message };
  }
  const status = Number.parseInt(match[1], 10);
  const rawBody = match[2] ?? '';
  let jsonBody = null;
  if (rawBody) {
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      jsonBody = null;
    }
  }
  return {
    status: Number.isNaN(status) ? null : status,
    rawBody,
    jsonBody,
    message: error.message,
  };
}

export function parseDiscordApiError(error) {
  return extractDiscordApiErrorInfo(error);
}

export function isDiscordUnknownGuildError(error) {
  const info = extractDiscordApiErrorInfo(error);
  if (!info) {
    return false;
  }
  if (info.status !== 404) {
    return false;
  }
  const code = typeof info?.jsonBody?.code === 'number' ? info.jsonBody.code : null;
  if (code === 10004) {
    return true;
  }
  const raw = typeof info?.rawBody === 'string' ? info.rawBody.toLowerCase() : '';
  return raw.includes('unknown guild');
}

export function build1to1Overwrites({ guildId, ownerId, memberId, botId }) {
  const allowMask = String(PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY);
  const overwrites = [
    // @everyone を見えなくする
    { id: guildId, type: 0, allow: '0', deny: String(PERM.VIEW_CHANNEL) },
    // オーナー
    { id: ownerId, type: 1, allow: allowMask, deny: '0' },
    // メンバー
    { id: memberId, type: 1, allow: allowMask, deny: '0' },
  ];

  const resolvedBotId = (() => {
    if (typeof botId === 'string' && botId.trim()) {
      return botId.trim();
    }
    const envIds = collectEnvBotIds();
    return envIds.values().next().value || '';
  })();

  if (resolvedBotId) {
    overwrites.push({ id: resolvedBotId, type: 1, allow: allowMask, deny: '0' });
  }

  return overwrites;
}

export function buildChannelNameFromDisplayName(displayName, memberId) {
  const fallback = `gift-${memberId}`;
  if (typeof displayName !== 'string') {
    return fallback;
  }
  const trimmed = displayName.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.normalize('NFKC').toLowerCase();
  const whitespaceCollapsed = normalized.replace(/\s+/gu, '-');
  const sanitized = whitespaceCollapsed
    .replace(/[^-\p{Letter}\p{Number}_]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^_+|_+$/g, '');

  const candidate = sanitized || fallback;
  return candidate.length > 90 ? candidate.slice(0, 90) : candidate;
}
