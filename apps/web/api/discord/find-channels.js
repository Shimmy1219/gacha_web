// /api/discord/find-channel.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  build1to1Overwrites,
  isDiscordUnknownGuildError
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

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
  const categoryIdParam = req.query.category_id;
  const categoryId = typeof categoryIdParam === 'string' ? categoryIdParam.trim() : '';
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

  // 全チャンネル取得
  let chans;
  try {
    chans = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true
    });
  } catch (error) {
    return respondDiscordApiError(error, 'guild-channels-list');
  }

  const allChannels = Array.isArray(chans)?chans:[];
  const textChannels = allChannels.filter(c => c.type === 0);
  const match = textChannels.find(ch => {
    const ow = ch.permission_overwrites || [];
    const hasOwner = ow.find(x => x.id === sess.uid && x.type === 1);
    const hasMember = ow.find(x => x.id === memberId && x.type === 1);
    const hasEveryone = ow.find(x => x.id === guildId && x.type === 0);
    return !!(hasOwner && hasMember && hasEveryone);
  });

  if (match){
    log.info('existing channel found', { channelId: match.id, parentId: match.parent_id || null });
    return res.json({
      ok:true,
      channel_id: match.id,
      created:false,
      parent_id: match.parent_id || null
    });
  }

  if (!allowCreate){
    log.info('matching channel not found and creation disabled', { allowCreate });
    return res.json({ ok:true, channel_id: null, created:false });
  }

  if (!categoryId) {
    log.warn('category id missing for channel creation');
    return res.status(400).json({ ok:false, error:'category_id required to create private channel' });
  }

  const category = allChannels.find(c => c.type === 4 && c.id === categoryId);
  if (!category) {
    log.warn('specified category not found in guild', { categoryId });
    return res.status(404).json({ ok:false, error:'指定されたカテゴリが見つかりません。' });
  }

  // 無ければ作成
  const overwrites = build1to1Overwrites({ guildId, ownerId: sess.uid, memberId });
  let created;
  try {
    created = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: {
        name: `gift-${memberId}`,
        type: 0,               // text
        parent_id: category.id,
        permission_overwrites: overwrites
      }
    });
  } catch (error) {
    return respondDiscordApiError(error, 'guild-channel-create');
  }

  log.info('channel created', { channelId: created.id, guildId, memberId, parentId: category.id });
  return res.json({
    ok:true,
    channel_id: created.id,
    created:true,
    parent_id: category.id
  });
}
