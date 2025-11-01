// /api/discord/find-channel.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import { dFetch, assertGuildOwner, build1to1Overwrites } from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

const CATEGORY_NAME = '景品お渡し';

export default async function handler(req, res){
  const log = createRequestLogger('api/discord/find-channels', req);
  log.info('request received', { query: req.query });

  if (req.method !== 'GET'){
    res.setHeader('Allow','GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }
  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess) {
    log.info('session missing or invalid');
    return res.status(401).json({ ok:false, error:'not logged in' });
  }

  const guildId = String(req.query.guild_id || '');
  const memberId = String(req.query.member_id || '');
  const createParam = String(req.query.create ?? '1').toLowerCase();
  const allowCreate = createParam !== '0' && createParam !== 'false';
  if (!guildId || !memberId) {
    log.warn('missing identifiers', { guildIdPresent: Boolean(guildId), memberIdPresent: Boolean(memberId) });
    return res.status(400).json({ ok:false, error:'guild_id and member_id required' });
  }

  // オーナー検証
  try {
    await assertGuildOwner(sess.access_token, guildId);
  } catch(e){
    log.warn('guild ownership assertion failed', { error: e instanceof Error ? e.message : String(e) });
    return res.status(403).json({ ok:false, error: e.message || 'forbidden' });
  }

  // 全チャンネル取得
  const chans = await dFetch(`/guilds/${guildId}/channels`, {
    token: process.env.DISCORD_BOT_TOKEN, isBot:true
  });

  const allChannels = Array.isArray(chans)?chans:[];
  let category = allChannels.find(c => c.type === 4 && c.name === CATEGORY_NAME);

  if (!category && allowCreate){
    category = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: { name: CATEGORY_NAME, type: 4 }
    });
    log.info('category created', { categoryId: category?.id });
  }

  const kids = category
    ? allChannels.filter(c => c.parent_id === category.id && c.type === 0)
    : [];
  const match = kids.find(ch => {
    const ow = ch.permission_overwrites || [];
    const hasOwner = ow.find(x => x.id === sess.uid && x.type === 1);
    const hasMember = ow.find(x => x.id === memberId && x.type === 1);
    const hasEveryone = ow.find(x => x.id === guildId && x.type === 0);
    return !!(hasOwner && hasMember && hasEveryone);
  });

  if (match){
    log.info('existing channel found', { channelId: match.id });
    return res.json({ ok:true, channel_id: match.id, created:false });
  }

  if (!allowCreate || !category){
    log.info('matching channel not found and creation disabled', { allowCreate, hasCategory: Boolean(category) });
    return res.json({ ok:true, channel_id: null, created:false });
  }

  // 無ければ作成
  const overwrites = build1to1Overwrites({ guildId, ownerId: sess.uid, memberId });
  const created = await dFetch(`/guilds/${guildId}/channels`, {
    token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
    body: {
      name: `gift-${memberId}`,
      type: 0,               // text
      parent_id: category.id,
      permission_overwrites: overwrites
    }
  });

  log.info('channel created', { channelId: created.id, guildId, memberId });
  return res.json({ ok:true, channel_id: created.id, created:true });
}
