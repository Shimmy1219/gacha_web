// /api/discord/find-channel.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  build1to1Overwrites,
  DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
  isDiscordMissingPermissionsError,
  isDiscordUnknownGuildError,
  PERM
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';
import {
  extractGiftChannelCandidates,
  resolveBotIdentity,
} from './_lib/giftChannelUtils.js';

function buildChannelNameFromDisplayName(displayName, memberId){
  const fallback = `gift-${memberId}`;
  if (typeof displayName !== 'string'){ return fallback; }
  const trimmed = displayName.trim();
  if (!trimmed){ return fallback; }

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

  log.debug('session resolved', { uid: sess.uid, expiresAt: sess.expires_at ?? null });

  const guildId = String(req.query.guild_id || '');
  const memberId = String(req.query.member_id || '');
  const memberDisplayNameParam = typeof req.query.display_name === 'string' ? req.query.display_name : '';
  const createParam = String(req.query.create ?? '1').toLowerCase();
  const categoryIdParam = req.query.category_id;
  const categoryId = typeof categoryIdParam === 'string' ? categoryIdParam.trim() : '';
  const allowCreate = createParam !== '0' && createParam !== 'false';
  if (!guildId || !memberId) {
    log.warn('missing identifiers', { guildIdPresent: Boolean(guildId), memberIdPresent: Boolean(memberId) });
    return res.status(400).json({ ok:false, error:'guild_id and member_id required' });
  }

  log.debug('request parameters normalized', {
    guildId,
    memberId,
    memberDisplayNameParam,
    createParam,
    allowCreate,
    categoryId: categoryId || null,
  });

  // オーナー検証
  try {
    await assertGuildOwner(sess.access_token, guildId);
    log.debug('guild ownership confirmed', { guildId, ownerId: sess.uid });
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
    if (isDiscordMissingPermissionsError(error)) {
      log.warn('discord bot is missing permissions', { context, message });
      return res.status(403).json({
        ok: false,
        error: DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA
      });
    }
    log.error('discord api request failed', { context, message });
    return res.status(502).json({ ok:false, error:'discord api request failed' });
  }

  const { primaryId: botUserId, idSet: botUserIdSet } = await resolveBotIdentity(log);
  log.debug('bot identity resolved', {
    primaryBotUserId: botUserId || null,
    botIdCandidates: Array.from(botUserIdSet),
    tokenProvided: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim()),
  });

  const allowMaskString = String(PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY);

  // 全チャンネル取得
  let chans;
  try {
    log.debug('fetching guild channels', { guildId });
    chans = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true
    });
    log.debug('guild channels fetched', {
      guildId,
      totalCount: Array.isArray(chans) ? chans.length : 0,
    });
  } catch (error) {
    return respondDiscordApiError(error, 'guild-channels-list');
  }

  const allChannels = Array.isArray(chans)?chans:[];
  const textChannels = allChannels.filter(c => c.type === 0);
  log.debug('filtered text channels for evaluation', {
    guildId,
    textChannelCount: textChannels.length,
  });
  const candidates = extractGiftChannelCandidates({
    channels: textChannels,
    ownerId: sess.uid,
    guildId,
    botUserIdSet,
  });

  log.debug('gift channel candidates evaluated', {
    guildId,
    totalTextChannels: textChannels.length,
    candidateCount: candidates.length,
  });

  const matchesForMember = candidates.filter((candidate) => candidate.memberId === memberId);
  const matchWithBot = matchesForMember.find((candidate) => candidate.botHasView);
  const matchWithoutBot = matchesForMember.find((candidate) => !candidate.botHasView);

  if (matchWithBot){
    log.info('existing channel found with bot access', {
      channelId: matchWithBot.channelId,
      parentId: matchWithBot.parentId,
    });
    return res.json({
      ok:true,
      channel_id: matchWithBot.channelId,
      channel_name: matchWithBot.channelName ?? null,
      created:false,
      parent_id: matchWithBot.parentId
    });
  }

  if (matchWithoutBot){
    if (!botUserId){
      log.error('bot user id missing, cannot grant access to existing channel', {
        channelId: matchWithoutBot.channelId,
      });
      return res.status(500).json({
        ok:false,
        error:'DiscordボットのユーザーIDが設定されていません。',
      });
    }
    try {
      await dFetch(`/channels/${matchWithoutBot.channelId}/permissions/${botUserId}`, {
        token: process.env.DISCORD_BOT_TOKEN,
        isBot:true,
        method:'PUT',
        body: {
          type: 1,
          allow: allowMaskString,
          deny: '0'
        }
      });
      log.info('granted bot permission on existing channel', {
        channelId: matchWithoutBot.channelId,
        parentId: matchWithoutBot.parentId
      });
    } catch (error) {
      return respondDiscordApiError(error, 'guild-channel-grant-bot');
    }

    return res.json({
      ok:true,
      channel_id: matchWithoutBot.channelId,
      channel_name: matchWithoutBot.channelName ?? null,
      created:false,
      parent_id: matchWithoutBot.parentId
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
  const overwrites = build1to1Overwrites({ guildId, ownerId: sess.uid, memberId, botId: botUserId });
  let created;
  try {
    log.debug('creating new channel', {
      guildId,
      memberId,
      parentCategoryId: category.id,
      channelNamePreview: buildChannelNameFromDisplayName(memberDisplayNameParam, memberId),
      overwritePayload: overwrites,
    });
    created = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: {
        name: buildChannelNameFromDisplayName(memberDisplayNameParam, memberId),
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
    channel_name: typeof created?.name === 'string' ? created.name : null,
    created:true,
    parent_id: category.id
  });
}
