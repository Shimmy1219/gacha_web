// /api/discord/members.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { getCookies } from '../_lib/cookies.js';
import { DEFAULT_CSRF_HEADER_NAME } from '../_lib/csrf.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { dFetch, assertGuildOwner, isDiscordUnknownGuildError } from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

export default withApiGuards({
  route: '/api/discord/members',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  csrf: { cookieName: 'discord_csrf', source: 'header', headerName: DEFAULT_CSRF_HEADER_NAME },
  rateLimit: { name: 'discord:members', limit: 20, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/members', req);
  log.info('request received', { query: req.query });

  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('session missing or invalid');
    return res.status(401).json({ ok:false, error:'not logged in' });
  }

  const guildId = String(req.query.guild_id || '');
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min( Number(req.query.limit || 100), 1000 );

  if (!guildId) {
    log.warn('missing guild id');
    return res.status(400).json({ ok:false, error:'guild_id required' });
  }

  // オーナー検証
  try {
    await assertGuildOwner(sess.access_token, guildId);
  } catch(e){
    log.warn('guild ownership assertion failed', { error: e instanceof Error ? e.message : String(e) });
    return res.status(403).json({ ok:false, error: e.message || 'forbidden' });
  }

  function respondDiscordApiError(error, context){
    const message = error instanceof Error ? error.message : String(error);
    if (isDiscordUnknownGuildError(error)){
      log.warn('discord guild is not accessible for bot operations', { context, message });
      return res.status(404).json({
        ok:false,
        error:'選択されたDiscordギルドを操作できません。ボットが参加しているか確認してください。',
      });
    }
    log.error('discord api request failed', { context, message });
    return res.status(502).json({ ok:false, error:'discord api request failed' });
  }

  const toMemberSummary = (m) => {
    const userId = m?.user?.id != null ? String(m.user.id) : '';
    const username = m?.user?.username != null ? String(m.user.username) : '';
    return {
      id: userId,
      username,
      globalName: m?.user?.global_name || null,
      nick: m?.nick || null,
      avatar: m?.user?.avatar || null,
      displayName:
        m?.display_name ||
        m?.nick ||
        m?.user?.global_name ||
        username ||
        userId,
    };
  };

  // まず search API を試す（privileged intentが不要なケースもある）
  if (q){
    try{
      const hits = await dFetch(`/guilds/${guildId}/members/search?query=${encodeURIComponent(q)}&limit=${limit}`, {
        token: process.env.DISCORD_BOT_TOKEN, isBot:true
      });
      const rows = (Array.isArray(hits)?hits:[]).map(toMemberSummary);
      log.info('members search succeeded', { count: rows.length, mode: 'search' });
      return res.json({ ok:true, members: rows, mode:'search' });
    }catch(error){
      if (isDiscordUnknownGuildError(error)){
        return respondDiscordApiError(error, 'guild-members-search');
      }
      log.warn('members search failed, falling back', {
        error: error instanceof Error ? error.message : String(error)
      });
      // 403が出る等はフォールバックに回す
    }
  }

  // フォールバック：ページングで最大limitまで集める
  const out = [];
  let after = '0';
  try {
    while (out.length < limit){
      const rest = limit - out.length;
      const take = Math.min(rest, 1000);
      const batch = await dFetch(`/guilds/${guildId}/members?limit=${take}&after=${after}`, {
        token: process.env.DISCORD_BOT_TOKEN, isBot:true
      });
      const arr = Array.isArray(batch) ? batch : [];
      for (const m of arr){
        out.push(toMemberSummary(m));
      }
      if (arr.length < take) break;
      after = arr[arr.length-1].user.id;
    }
  } catch (error) {
    return respondDiscordApiError(error, 'guild-members-list');
  }

  // クエリがある場合はサーバ側で簡易フィルタ（username / nick に部分一致）
  const filtered = q
    ? out.filter(m => (m.username||'').includes(q) || (m.nick||'').includes(q))
    : out;

  log.info('members resolved', { count: filtered.length, mode: q?'scan+filter':'scan' });
  return res.json({ ok:true, members: filtered, mode: q?'scan+filter':'scan' });
});
