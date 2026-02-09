// /api/_lib/discordApi.js
// Discord REST薄ラッパ（429 retry, JSONパース, 失敗時throw）＋権限ビット
const BASE = 'https://discord.com/api';

export const PERM = {
  VIEW_CHANNEL:        1 << 10,   // 1024
  SEND_MESSAGES:       1 << 11,   // 2048
  READ_MESSAGE_HISTORY:1 << 16,   // 65536
};

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export async function dFetch(path, { token, isBot=false, method='GET', body=null, headers={} } = {}){
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token){
    h.Authorization = isBot ? `Bot ${token}` : `Bearer ${token}`;
  }
  for (let attempt=0; attempt<3; attempt++){
    const res = await fetch(url, { method, headers: h, body: body?JSON.stringify(body):null });
    if (res.status === 429){
      const j = await res.json().catch(()=> ({}));
      const wait = Math.ceil((j.retry_after || 1) * 1000);
      await sleep(wait);
      continue;
    }
    if (!res.ok){
      const t = await res.text();
      throw new Error(`Discord ${method} ${url} -> ${res.status}: ${t}`);
    }
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  }
  throw new Error(`Discord ${method} ${url} -> too many retries`);
}

export async function assertGuildOwner(userAccessToken, guildId){
  const arr = await dFetch('/users/@me/guilds', { token:userAccessToken });
  const owners = Array.isArray(arr) ? arr.filter(g=> g.owner === true) : [];
  if (!owners.find(g=> String(g.id) === String(guildId))){
    throw new Error('forbidden: not an owner of the guild');
  }
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

export const DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS = 'discord_missing_permissions';

export const DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA =
  '申し訳ございません。Discord botの権限確認中にエラーが発生しました。でも大丈夫です。ギルド設定でBotに「チャンネルの管理(Manage Channels)」権限を付与してください。そしたらもう一度試してみてください。';

export function isDiscordMissingPermissionsError(error) {
  const info = extractDiscordApiErrorInfo(error);
  if (!info) {
    return false;
  }
  if (info.status !== 403) {
    return false;
  }
  const code = typeof info?.jsonBody?.code === 'number' ? info.jsonBody.code : null;
  if (code === 50013) {
    return true;
  }
  const raw = typeof info?.rawBody === 'string' ? info.rawBody.toLowerCase() : '';
  return raw.includes('missing permissions');
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

export function build1to1Overwrites({ guildId, ownerId, memberId, botId }){
  const allowMask = String(PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY);
  const overwrites = [];

  // @everyone を見えなくする
  overwrites.push({ id: guildId, type: 0, allow: '0', deny: String(PERM.VIEW_CHANNEL) });

  const seenMemberIds = new Set();
  const pushMemberOverwrite = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (seenMemberIds.has(trimmed)) {
      return;
    }
    seenMemberIds.add(trimmed);
    overwrites.push({ id: trimmed, type: 1, allow: allowMask, deny: '0' });
  };

  // オーナー / メンバー（同一の場合は重複を避ける）
  pushMemberOverwrite(ownerId);
  pushMemberOverwrite(memberId);

  const resolvedBotId = (() => {
    if (typeof botId === 'string' && botId.trim()) {
      return botId.trim();
    }
    const envBotId = process.env.DISCORD_BOT_USER_ID || process.env.DISCORD_CLIENT_ID;
    return typeof envBotId === 'string' ? envBotId.trim() : '';
  })();

  pushMemberOverwrite(resolvedBotId);

  return overwrites;
}
