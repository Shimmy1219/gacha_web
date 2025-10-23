// /api/discord/send.js
import { getCookies, setCookie } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { dFetch } from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';
import { SESSION_TTL_SEC } from '../_lib/sessionStore.js';

export default async function handler(req, res){
  const log = createRequestLogger('api/discord/send', req);
  log.info('request received');

  if (req.method !== 'POST'){
    res.setHeader('Allow','POST');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  const sessionInfo = await getSessionWithRefresh(sid);
  const sess = sessionInfo.session;
  if (!sess) {
    log.info('session missing or invalid');
    return res.status(401).json({ ok:false, error:'not logged in' });
  }

  if (sessionInfo.cookieUpdated && sessionInfo.cookieValue) {
    setCookie(res, 'sid', sessionInfo.cookieValue, { maxAge: SESSION_TTL_SEC });
  }

  const { channel_id, share_url, title, comment, mode='bot' } = req.body || {};
  if (!channel_id || !share_url){
    log.warn('missing channel_id or share_url', { hasChannelId: Boolean(channel_id), hasShareUrl: Boolean(share_url) });
    return res.status(400).json({ ok:false, error:'channel_id and share_url required' });
  }
  const content = [title || '景品リンクです', share_url, comment || ''].filter(Boolean).join('\n');

  if (mode === 'bot'){
    const j = await dFetch(`/channels/${channel_id}/messages`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
    log.info('message sent via bot', { channelId: channel_id, messageId: j.id || null });
    return res.json({ ok:true, message_id: j.id || null, via:'bot' });
  }

  // webhook mode
  const hooks = await dFetch(`/channels/${channel_id}/webhooks`, {
    token: process.env.DISCORD_BOT_TOKEN, isBot:true
  });
  let hook = (Array.isArray(hooks)?hooks:[]).find(h => h.name === 'Gacha Sender') || null;
  if (!hook){
    hook = await dFetch(`/channels/${channel_id}/webhooks`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: { name:'Gacha Sender' }
    });
  }
  const wurl = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
  const r = await dFetch(wurl, {
    method:'POST',
    body: { content, allowed_mentions: { parse: [] } }
  });
  log.info('message sent via webhook', { channelId: channel_id, messageId: r.id || null });
  return res.json({ ok:true, message_id: r.id || null, via:'webhook' });
}
