// /api/discord/find-channel.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { getCookies } from '../_lib/cookies.js';
import { DEFAULT_CSRF_HEADER_NAME } from '../_lib/csrf.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  build1to1Overwrites,
  DISCORD_API_ERROR_CODE_CATEGORY_CHANNEL_LIMIT_REACHED,
  DISCORD_API_ERROR_CODE_UNKNOWN_GUILD,
  DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS,
  DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
  isDiscordCategoryChannelLimitReachedError,
  isDiscordMissingPermissionsError,
  isDiscordUnknownGuildError,
  PERM
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';
import {
  extractGiftChannelCandidates,
  extractOwnerBotOnlyGiftChannelCandidates,
  normalizeOverwriteType,
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

function matchesCandidateCategory(candidate, categoryId){
  if (!categoryId){
    return true;
  }
  return candidate.parentId === categoryId;
}

function matchesOwnerBotOnlyCandidateByName(candidateName, expectedName, memberId){
  if (typeof candidateName !== 'string'){
    return false;
  }
  const normalizedName = candidateName.trim().toLowerCase();
  if (!normalizedName){
    return false;
  }

  const normalizedExpected = typeof expectedName === 'string' ? expectedName.trim().toLowerCase() : '';
  if (normalizedExpected && normalizedName === normalizedExpected){
    return true;
  }

  return normalizedName === `gift-${memberId}`.toLowerCase();
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

function allowsView(overwrite){
  const viewChannelBit = BigInt(PERM.VIEW_CHANNEL);
  return (toBigInt(overwrite?.allow) & viewChannelBit) === viewChannelBit;
}

function deniesView(overwrite){
  const viewChannelBit = BigInt(PERM.VIEW_CHANNEL);
  return (toBigInt(overwrite?.deny) & viewChannelBit) === viewChannelBit;
}

function evaluateChannelForGiftMatching({
  channel,
  ownerId,
  guildId,
  botUserIdSet,
  memberId,
  categoryId,
  expectedChannelName
}){
  const channelId = normalizeSnowflake(channel?.id);
  const channelType = typeof channel?.type === 'number' ? channel.type : null;
  const parentId = normalizeSnowflake(channel?.parent_id);
  const channelName = typeof channel?.name === 'string' ? channel.name : null;
  const categoryMatched = !categoryId || parentId === categoryId;

  const result = {
    channelId: channelId ?? null,
    channelName: channelName ?? null,
    channelType,
    parentId: parentId ?? null,
    checks: {
      isTextChannel: channelType === 0,
      hasPermissionOverwrites: false,
      ownerOverwritePresent: false,
      botOverwritePresent: false,
      botCanView: false,
      everyoneDenyPresent: false,
      everyoneDenyView: false,
      ownerCanView: false,
      memberCanView: false,
      categoryMatched,
      memberOverwriteCountExcludingOwnerAndBot: 0,
      otherUserOverwriteCount: 0,
      standardCandidateMemberId: null,
      standardCandidateEligible: false,
      standardCandidateMemberMatched: false,
      standardCandidateWithBot: false,
      standardCandidateWithoutBot: false,
      ownerBotOnlyEligible: false,
      ownerBotOnlyNameMatched: false,
      ownerBotOnlyAdoptable: false,
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
  const targetMemberSnowflake = normalizeSnowflake(memberId);
  if (!ownerSnowflake || !guildSnowflake || !targetMemberSnowflake){
    result.reason = 'skip:invalid_owner_or_guild_or_member';
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

  // Standard owner + member (+ optional bot) candidate checks.
  if (nonOwnerNonBotMemberOverwrites.length === 1){
    const memberOverwrite = nonOwnerNonBotMemberOverwrites[0];
    const extractedMemberId = normalizeSnowflake(memberOverwrite?.id);
    result.checks.standardCandidateMemberId = extractedMemberId;
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
    result.checks.standardCandidateMemberMatched =
      extractedMemberId === targetMemberSnowflake && result.checks.categoryMatched;
    result.checks.standardCandidateWithBot =
      result.checks.standardCandidateEligible &&
      result.checks.standardCandidateMemberMatched &&
      result.checks.botCanView;
    result.checks.standardCandidateWithoutBot =
      result.checks.standardCandidateEligible &&
      result.checks.standardCandidateMemberMatched &&
      !result.checks.botCanView;
  }

  // Owner + bot only candidate checks.
  result.checks.ownerBotOnlyEligible = Boolean(
    nonOwnerNonBotMemberOverwrites.length === 0 &&
    result.checks.everyoneDenyView &&
    result.checks.ownerCanView &&
    result.checks.botCanView
  );
  result.checks.ownerBotOnlyNameMatched = matchesOwnerBotOnlyCandidateByName(
    channelName,
    expectedChannelName,
    targetMemberSnowflake
  );
  result.checks.ownerBotOnlyAdoptable =
    result.checks.ownerBotOnlyEligible &&
    result.checks.categoryMatched &&
    result.checks.ownerBotOnlyNameMatched;

  if (result.checks.standardCandidateWithBot){
    result.reason = 'match:standard_with_bot';
    return result;
  }
  if (result.checks.standardCandidateWithoutBot){
    result.reason = 'match:standard_without_bot';
    return result;
  }
  if (result.checks.ownerBotOnlyAdoptable){
    result.reason = 'match:owner_bot_only_adoptable';
    return result;
  }

  if (!result.checks.categoryMatched){
    result.reason = 'skip:category_mismatch';
    return result;
  }
  if (result.checks.standardCandidateEligible && !result.checks.standardCandidateMemberMatched){
    result.reason = 'skip:member_mismatch';
    return result;
  }
  if (result.checks.ownerBotOnlyEligible && !result.checks.ownerBotOnlyNameMatched){
    result.reason = 'skip:owner_bot_only_name_mismatch';
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
  if (result.checks.memberOverwriteCountExcludingOwnerAndBot > 1){
    result.reason = 'skip:member_overwrites_count_not_one';
    return result;
  }

  result.reason = 'skip:not_matching_candidate';
  return result;
}

export default withApiGuards({
  route: '/api/discord/find-channels',
  health: { enabled: true },
  methods: ['GET'],
  origin: true,
  csrf: { cookieName: 'discord_csrf', source: 'header', headerName: DEFAULT_CSRF_HEADER_NAME },
  rateLimit: { name: 'discord:find-channels', limit: 30, windowSec: 60 },
})(async function handler(req, res) {
  const log = createRequestLogger('api/discord/find-channels', req);
  log.info('request received', { query: req.query });

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
      log.warn('【既知のエラー】discord guild is not accessible for bot operations', { context, message });
      return res.status(404).json({
        ok:false,
        error:'選択されたDiscordギルドを操作できません。ボットが参加しているか確認してください。',
        errorCode: DISCORD_API_ERROR_CODE_UNKNOWN_GUILD,
      });
    }
    if (isDiscordMissingPermissionsError(error)) {
      log.warn('【既知のエラー】discord bot is missing permissions', { context, message });
      return res.status(403).json({
        ok: false,
        error: DISCORD_MISSING_PERMISSIONS_GUIDE_MESSAGE_JA,
        errorCode: DISCORD_API_ERROR_CODE_MISSING_PERMISSIONS
      });
    }
    if (isDiscordCategoryChannelLimitReachedError(error)) {
      log.warn('【既知のエラー】discord category channel limit reached', { context, message });
      return res.status(409).json({
        ok: false,
        error: 'カテゴリ内のチャンネル数が50に到達しました。',
        errorCode: DISCORD_API_ERROR_CODE_CATEGORY_CHANNEL_LIMIT_REACHED
      });
    }
    log.error('【既知のエラー】discord api request failed', { context, message });
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

  const expectedChannelName = buildChannelNameFromDisplayName(memberDisplayNameParam, memberId);
  const channelEvaluations = allChannels.map((channel) =>
    evaluateChannelForGiftMatching({
      channel,
      ownerId: sess.uid,
      guildId,
      botUserIdSet,
      memberId,
      categoryId,
      expectedChannelName
    })
  );
  channelEvaluations.forEach((evaluation) => {
    log.debug('channel evaluation for gift matching', evaluation);
  });

  const matchesForMember = candidates.filter(
    (candidate) => candidate.memberId === memberId && matchesCandidateCategory(candidate, categoryId)
  );
  const outOfCategoryMatches = categoryId
    ? candidates.filter((candidate) => candidate.memberId === memberId && candidate.parentId !== categoryId)
    : [];

  if (categoryId && outOfCategoryMatches.length > 0){
    log.info('existing member channels found outside selected category and ignored', {
      memberId,
      categoryId,
      ignoredCount: outOfCategoryMatches.length,
      ignoredChannelIds: outOfCategoryMatches.map((candidate) => candidate.channelId),
    });
  }

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

  const ownerBotOnlyCandidates = extractOwnerBotOnlyGiftChannelCandidates({
    channels: textChannels,
    ownerId: sess.uid,
    guildId,
    botUserIdSet,
  })
    .filter((candidate) => matchesCandidateCategory(candidate, categoryId))
    .filter((candidate) => matchesOwnerBotOnlyCandidateByName(candidate.channelName, expectedChannelName, memberId));

  if (ownerBotOnlyCandidates.length === 1){
    const adopted = ownerBotOnlyCandidates[0];
    try {
      await dFetch(`/channels/${adopted.channelId}/permissions/${memberId}`, {
        token: process.env.DISCORD_BOT_TOKEN,
        isBot:true,
        method:'PUT',
        body: {
          type: 1,
          allow: allowMaskString,
          deny: '0'
        }
      });
      log.info('adopted owner+bot channel and granted member permission', {
        channelId: adopted.channelId,
        memberId,
        parentId: adopted.parentId,
        categoryId: categoryId || null,
      });
    } catch (error) {
      return respondDiscordApiError(error, 'guild-channel-grant-member');
    }

    return res.json({
      ok:true,
      channel_id: adopted.channelId,
      channel_name: adopted.channelName ?? null,
      created:false,
      parent_id: adopted.parentId
    });
  }

  if (ownerBotOnlyCandidates.length > 1){
    log.warn('multiple owner+bot channels matched member name; skip adoption', {
      memberId,
      expectedChannelName,
      categoryId: categoryId || null,
      channelIds: ownerBotOnlyCandidates.map((candidate) => candidate.channelId),
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
      channelNamePreview: expectedChannelName,
      overwritePayload: overwrites,
    });
    created = await dFetch(`/guilds/${guildId}/channels`, {
      token: process.env.DISCORD_BOT_TOKEN, isBot:true, method:'POST',
      body: {
        name: expectedChannelName,
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
});
