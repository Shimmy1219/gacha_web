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

export function build1to1Overwrites({ guildId, ownerId, memberId }){
  return [
    // @everyone を見えなくする
    { id: guildId, type: 0, allow: '0', deny: String(PERM.VIEW_CHANNEL) },
    // オーナー
    { id: ownerId, type: 1, allow: String(PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY), deny: '0' },
    // メンバー
    { id: memberId, type: 1, allow: String(PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY), deny: '0' },
  ];
}
