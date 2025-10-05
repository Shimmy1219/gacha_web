// /api/discord/send.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { dFetch } from '../_lib/discordApi.js';

export default async function handler(req, res){
  if (req.method !== 'POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) return res.status(401).json({ ok:false, error:'not logged in' });

  const { channel_id, share_url, title, comment, mode='bot' } = req.body || {};
  if (!channel_id || !share_url){
    return res.status(400).json({ ok:false, error:'channel_id and share_url required' });
  }
  const content = [title || '景品リンクです', share_url, comment || ''].filter(Boolean).join('\n');

  if (mode === 'bot'){
    const j = await dFetch(`/channels/${channel_id}/messages`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: { content, allowed_mentions: { parse: [] } }
    });
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
  return res.json({ ok:true, message_id: r.id || null, via:'webhook' });
}
