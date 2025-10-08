// /api/discord/members.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { dFetch, assertGuildOwner } from '../_lib/discordApi.js';

export default async function handler(req, res){
  if (req.method !== 'GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) return res.status(401).json({ ok:false, error:'not logged in' });

  const guildId = String(req.query.guild_id || '');
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min( Number(req.query.limit || 100), 1000 );

  if (!guildId) return res.status(400).json({ ok:false, error:'guild_id required' });

  // オーナー検証
  try { await assertGuildOwner(sess.access_token, guildId); }
  catch(e){ return res.status(403).json({ ok:false, error: e.message || 'forbidden' }); }

  // まず search API を試す（privileged intentが不要なケースもある）
  if (q){
    try{
      const hits = await dFetch(`/guilds/${guildId}/members/search?query=${encodeURIComponent(q)}&limit=${limit}`, {
        token: process.env.DISCORD_BOT_TOKEN, isBot:true
      });
      const rows = (Array.isArray(hits)?hits:[]).map(m => ({
        id: m.user.id, username: m.user.username, nick: m.nick || null, avatar: m.user.avatar || null
      }));
      return res.json({ ok:true, members: rows, mode:'search' });
    }catch(_e){
      // 403が出る等はフォールバックに回す
    }
  }

  // フォールバック：ページングで最大limitまで集める
  const out = [];
  let after = '0';
  while (out.length < limit){
    const rest = limit - out.length;
    const take = Math.min(rest, 1000);
    const batch = await dFetch(`/guilds/${guildId}/members?limit=${take}&after=${after}`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true
    });
    const arr = Array.isArray(batch) ? batch : [];
    for (const m of arr){
      out.push({ id:m.user.id, username:m.user.username, nick:m.nick || null, avatar:m.user.avatar || null });
    }
    if (arr.length < take) break;
    after = arr[arr.length-1].user.id;
  }

  // クエリがある場合はサーバ側で簡易フィルタ（username / nick に部分一致）
  const filtered = q
    ? out.filter(m => (m.username||'').includes(q) || (m.nick||'').includes(q))
    : out;

  return res.json({ ok:true, members: filtered, mode: q?'scan+filter':'scan' });
}
