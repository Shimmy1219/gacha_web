import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  DISCORD_API_ERROR_CODE_UNKNOWN_GUILD,
  isDiscordUnknownGuildError,
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';
import {
  extractGiftChannelCandidates,
  resolveBotIdentity,
} from './_lib/giftChannelUtils.js';

function normalizeMemberIds(queryValue){
  const collect = [];
  if (Array.isArray(queryValue)){
    for (const entry of queryValue){
      if (typeof entry === 'string' || typeof entry === 'number'){
        const normalized = String(entry).trim();
        if (normalized){
          collect.push(normalized);
        }
      }
    }
    return collect;
  }
  if (typeof queryValue === 'string' || typeof queryValue === 'number'){
    const normalized = String(queryValue).trim();
    if (normalized){
      return normalized.split(',').map((part) => part.trim()).filter(Boolean);
    }
  }
  return collect;
}

export default async function handler(req, res){
  const log = createRequestLogger('api/discord/list-gift-channels', req);
  log.info('request received', { query: req.query });

  if (req.method !== 'GET'){
    res.setHeader('Allow','GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  const { sid } = getCookies(req);
  const sess = await getSessionWithRefresh(sid);
  if (!sess){
    log.info('session missing or invalid');
    return res.status(401).json({ ok:false, error:'not logged in' });
  }

  const guildId = typeof req.query.guild_id === 'string' ? req.query.guild_id.trim() : '';
  const categoryId = typeof req.query.category_id === 'string' ? req.query.category_id.trim() : '';
  if (!guildId){
    log.warn('missing guild identifier');
    return res.status(400).json({ ok:false, error:'guild_id required' });
  }

  const memberIdCandidates = new Set([
    ...normalizeMemberIds(req.query.member_id),
    ...normalizeMemberIds(req.query.member_ids),
  ]);

  log.debug('request parameters normalized', {
    guildId,
    categoryId: categoryId || null,
    memberIdFilterCount: memberIdCandidates.size,
  });

  try {
    await assertGuildOwner(sess.access_token, guildId);
    log.debug('guild ownership confirmed', { guildId, ownerId: sess.uid });
  } catch (error) {
    log.warn('guild ownership assertion failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(403).json({ ok:false, error: error instanceof Error ? error.message : 'forbidden' });
  }

  function respondDiscordApiError(error, context){
    const message = error instanceof Error ? error.message : String(error);
    if (isDiscordUnknownGuildError(error)){
      log.warn('discord guild is not accessible for bot operations', { context, message });
      return res.status(404).json({
        ok:false,
        error:'選択されたDiscordギルドを操作できません。ボットが参加しているか確認してください。',
        errorCode: DISCORD_API_ERROR_CODE_UNKNOWN_GUILD,
      });
    }
    log.error('discord api request failed', { context, message });
    return res.status(502).json({ ok:false, error:'discord api request failed' });
  }

  const { idSet: botUserIdSet } = await resolveBotIdentity(log);
  log.debug('bot identity resolved for listing', {
    botIdCandidates: Array.from(botUserIdSet),
    tokenProvided: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim()),
  });

  let chans;
  try {
    log.debug('fetching guild channels', { guildId });
    chans = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN,
      isBot: true,
    });
    log.debug('guild channels fetched', {
      guildId,
      totalCount: Array.isArray(chans) ? chans.length : 0,
    });
  } catch (error) {
    return respondDiscordApiError(error, 'guild-channels-list');
  }

  const allChannels = Array.isArray(chans) ? chans : [];
  const textChannels = allChannels.filter((ch) => ch && ch.type === 0);

  const candidates = extractGiftChannelCandidates({
    channels: textChannels,
    ownerId: sess.uid,
    guildId,
    botUserIdSet,
  });

  log.debug('gift channel candidates extracted for listing', {
    candidateCount: candidates.length,
  });

  const filtered = memberIdCandidates.size > 0
    ? candidates.filter((candidate) => memberIdCandidates.has(candidate.memberId))
    : candidates;

  const categoryFiltered = categoryId
    ? filtered.filter((candidate) => candidate.parentId === categoryId)
    : filtered;

  const payload = categoryFiltered.map((candidate) => ({
    channel_id: candidate.channelId,
    channel_name: candidate.channelName ?? null,
    parent_id: candidate.parentId ?? null,
    member_id: candidate.memberId,
    bot_has_view: Boolean(candidate.botHasView),
  }));

  log.info('gift channel listing completed', {
    guildId,
    categoryId: categoryId || null,
    returnedCount: payload.length,
  });

  return res.json({
    ok: true,
    channels: payload,
  });
}
