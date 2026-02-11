import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  PERM,
  isDiscordUnknownGuildError,
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';
import {
  extractGiftChannelCandidates,
  normalizeOverwriteType,
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

function normalizeSnowflake(value){
  if (typeof value === 'string'){
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number'){
    return String(value);
  }
  return null;
}

function toBigInt(value){
  if (typeof value === 'string' && value){
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  if (typeof value === 'number'){
    return BigInt(value);
  }
  return 0n;
}

const viewChannelBit = BigInt(PERM.VIEW_CHANNEL);

function allowsView(overwrite){
  return (toBigInt(overwrite?.allow) & viewChannelBit) === viewChannelBit;
}

function deniesView(overwrite){
  return (toBigInt(overwrite?.deny) & viewChannelBit) === viewChannelBit;
}

function evaluateChannelForGiftListing({
  channel,
  ownerId,
  guildId,
  botUserIdSet,
  memberIdFilterSet,
  categoryId
}){
  const channelId = normalizeSnowflake(channel?.id);
  const channelType = typeof channel?.type === 'number' ? channel.type : null;
  const parentId = normalizeSnowflake(channel?.parent_id);
  const channelName = typeof channel?.name === 'string' ? channel.name : null;

  const result = {
    channelId: channelId ?? null,
    channelName: channelName ?? null,
    channelType,
    parentId: parentId ?? null,
    checks: {
      isTextChannel: channelType === 0,
      hasPermissionOverwrites: false,
      ownerOverwritePresent: false,
      ownerCanView: false,
      everyoneDenyPresent: false,
      everyoneDenyView: false,
      memberCanView: false,
      memberOverwriteCountExcludingOwnerAndBot: 0,
      otherUserOverwriteCount: 0,
      candidateMemberId: null,
      standardCandidateEligible: false,
      botOverwritePresent: false,
      botCanView: false,
      memberFilterEnabled: memberIdFilterSet.size > 0,
      memberFilterMatched: false,
      categoryMatched: !categoryId || parentId === categoryId,
      listed: false,
    },
    reason: '',
  };

  if (channelType !== 0){
    result.reason = 'skip:not_text_channel';
    return result;
  }

  const overwrites = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  result.checks.hasPermissionOverwrites = overwrites.length > 0;
  if (overwrites.length === 0){
    result.reason = 'skip:no_permission_overwrites';
    return result;
  }

  const ownerSnowflake = normalizeSnowflake(ownerId);
  const guildSnowflake = normalizeSnowflake(guildId);
  if (!ownerSnowflake || !guildSnowflake){
    result.reason = 'skip:invalid_owner_or_guild';
    return result;
  }

  const userOverwrites = overwrites.filter((ow) => normalizeOverwriteType(ow) === 'member');
  const ownerOverwrite = userOverwrites.find((ow) => normalizeSnowflake(ow?.id) === ownerSnowflake);
  result.checks.ownerOverwritePresent = Boolean(ownerOverwrite);
  result.checks.ownerCanView = ownerOverwrite ? allowsView(ownerOverwrite) : false;
  if (!ownerOverwrite){
    result.reason = 'skip:owner_overwrite_missing';
    return result;
  }

  const nonOwnerNonBotMemberOverwrites = userOverwrites.filter((ow) => {
    const targetId = normalizeSnowflake(ow?.id);
    if (!targetId){
      return false;
    }
    if (targetId === ownerSnowflake){
      return false;
    }
    if (botUserIdSet.has(targetId)){
      return false;
    }
    return true;
  });
  result.checks.memberOverwriteCountExcludingOwnerAndBot = nonOwnerNonBotMemberOverwrites.length;

  const botOverwrite = userOverwrites.find((ow) => {
    const targetId = normalizeSnowflake(ow?.id);
    return targetId ? botUserIdSet.has(targetId) : false;
  });
  result.checks.botOverwritePresent = Boolean(botOverwrite);
  result.checks.botCanView = botOverwrite ? allowsView(botOverwrite) : false;

  const everyoneOverwrite = overwrites.find(
    (ow) => normalizeOverwriteType(ow) === 'role' && normalizeSnowflake(ow?.id) === guildSnowflake
  );
  result.checks.everyoneDenyPresent = Boolean(everyoneOverwrite);
  result.checks.everyoneDenyView = everyoneOverwrite ? deniesView(everyoneOverwrite) : false;

  if (nonOwnerNonBotMemberOverwrites.length === 1){
    const memberOverwrite = nonOwnerNonBotMemberOverwrites[0];
    const extractedMemberId = normalizeSnowflake(memberOverwrite?.id);
    result.checks.candidateMemberId = extractedMemberId;
    result.checks.memberCanView = memberOverwrite ? allowsView(memberOverwrite) : false;

    const otherUsers = userOverwrites.filter((ow) => {
      const targetId = normalizeSnowflake(ow?.id);
      if (!targetId){
        return false;
      }
      if (targetId === ownerSnowflake){
        return false;
      }
      if (targetId === extractedMemberId){
        return false;
      }
      if (botUserIdSet.has(targetId)){
        return false;
      }
      return true;
    });
    result.checks.otherUserOverwriteCount = otherUsers.length;
    result.checks.standardCandidateEligible = Boolean(
      extractedMemberId &&
      otherUsers.length === 0 &&
      result.checks.everyoneDenyView &&
      result.checks.ownerCanView &&
      result.checks.memberCanView
    );
  }

  if (!result.checks.standardCandidateEligible){
    if (!result.checks.everyoneDenyPresent){
      result.reason = 'skip:everyone_overwrite_missing';
      return result;
    }
    if (!result.checks.everyoneDenyView){
      result.reason = 'skip:everyone_view_not_denied';
      return result;
    }
    if (!result.checks.ownerCanView){
      result.reason = 'skip:owner_view_not_allowed';
      return result;
    }
    if (result.checks.memberOverwriteCountExcludingOwnerAndBot !== 1){
      result.reason = 'skip:member_overwrite_count_not_one';
      return result;
    }
    if (!result.checks.memberCanView){
      result.reason = 'skip:member_view_not_allowed';
      return result;
    }
    if (result.checks.otherUserOverwriteCount > 0){
      result.reason = 'skip:other_user_overwrites_present';
      return result;
    }
    result.reason = 'skip:not_matching_candidate';
    return result;
  }

  const candidateMemberId = result.checks.candidateMemberId;
  const memberFilterMatched = !result.checks.memberFilterEnabled || (
    typeof candidateMemberId === 'string' && memberIdFilterSet.has(candidateMemberId)
  );
  result.checks.memberFilterMatched = memberFilterMatched;
  if (!memberFilterMatched){
    result.reason = 'skip:member_filter_miss';
    return result;
  }

  if (!result.checks.categoryMatched){
    result.reason = 'skip:category_mismatch';
    return result;
  }

  result.checks.listed = true;
  result.reason = 'match:listed_candidate';
  return result;
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

  const channelEvaluations = allChannels.map((channel) =>
    evaluateChannelForGiftListing({
      channel,
      ownerId: sess.uid,
      guildId,
      botUserIdSet,
      memberIdFilterSet: memberIdCandidates,
      categoryId,
    })
  );
  channelEvaluations.forEach((evaluation) => {
    log.debug('channel evaluation for gift listing', evaluation);
  });

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
