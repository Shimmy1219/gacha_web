// /api/discord/find-channel.js
import { getCookies } from '../_lib/cookies.js';
import { getSessionWithRefresh } from '../_lib/getSessionWithRefresh.js';
import {
  dFetch,
  assertGuildOwner,
  build1to1Overwrites,
  isDiscordUnknownGuildError,
  PERM
} from '../_lib/discordApi.js';
import { createRequestLogger } from '../_lib/logger.js';

const ENV_BOT_ID_KEYS = ['DISCORD_BOT_USER_ID', 'DISCORD_CLIENT_ID'];

function collectEnvBotIds(){
  const ids = new Set();
  for (const key of ENV_BOT_ID_KEYS){
    const value = process.env[key];
    if (typeof value === 'string'){
      const trimmed = value.trim();
      if (trimmed){
        ids.add(trimmed);
      }
    }
  }
  return ids;
}

let botIdentityCache = null;
let botIdentityCacheToken = null;
let botIdentityPromise = null;

async function resolveBotIdentity(log){
  const envIds = collectEnvBotIds();
  const token = typeof process.env.DISCORD_BOT_TOKEN === 'string' ? process.env.DISCORD_BOT_TOKEN.trim() : '';
  if (!token){
    const primaryId = envIds.values().next().value || '';
    return { primaryId, idSet: envIds };
  }

  const finalize = (cache) => {
    const idSet = new Set([...envIds, ...(cache?.ids ?? [])]);
    const primaryId = cache?.primaryId || idSet.values().next().value || '';
    return { primaryId, idSet };
  };

  if (botIdentityCache && botIdentityCacheToken === token){
    return finalize(botIdentityCache);
  }

  if (!botIdentityPromise){
    botIdentityPromise = (async () => {
      try {
        const me = await dFetch('/users/@me', { token, isBot:true });
        const fetchedId = typeof me?.id === 'string' ? me.id.trim() : '';
        const ids = new Set();
        if (fetchedId){
          ids.add(fetchedId);
        }
        botIdentityCacheToken = token;
        botIdentityCache = { primaryId: fetchedId, ids };
      } catch (error) {
        botIdentityCacheToken = token;
        botIdentityCache = { primaryId: '', ids: new Set() };
        const message = error instanceof Error ? error.message : String(error);
        log?.warn('failed to resolve bot id from token', { message });
      } finally {
        botIdentityPromise = null;
      }
      return botIdentityCache;
    })();
  }

  const cache = await botIdentityPromise;
  return finalize(cache);
}

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
    log.error('discord api request failed', { context, message });
    return res.status(502).json({ ok:false, error:'discord api request failed' });
  }

  const { primaryId: botUserId, idSet: botUserIdSet } = await resolveBotIdentity(log);
  log.debug('bot identity resolved', {
    primaryBotUserId: botUserId || null,
    botIdCandidates: Array.from(botUserIdSet),
    tokenProvided: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim()),
  });

  const viewChannelBit = BigInt(PERM.VIEW_CHANNEL);
  const allowMaskString = String(PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES | PERM.READ_MESSAGE_HISTORY);

  const toBigInt = (value) => {
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
  };

  const allowsView = (overwrite) => (toBigInt(overwrite?.allow) & viewChannelBit) === viewChannelBit;
  const deniesView = (overwrite) => (toBigInt(overwrite?.deny) & viewChannelBit) === viewChannelBit;

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
  let matchWithBot = null;
  let matchWithoutBot = null;

  for (const ch of textChannels){
    const overwrites = Array.isArray(ch.permission_overwrites) ? ch.permission_overwrites : [];
    const evaluation = {
      channelId: ch.id,
      channelName: typeof ch.name === 'string' ? ch.name : null,
      parentId: ch.parent_id || null,
      overwriteCount: overwrites.length,
    };
    log.debug('channel evaluation started', {
      ...evaluation,
      rawOverwrites: overwrites,
    });
    if (overwrites.length === 0){
      log.debug('channel skipped: no permission overwrites', evaluation);
      continue;
    }
    const userOverwrites = overwrites.filter((ow) => ow.type === 1);
    const ownerOverwrite = userOverwrites.find((ow) => ow.id === sess.uid);
    const memberOverwrite = userOverwrites.find((ow) => ow.id === memberId);
    log.debug('channel overwrite presence evaluation', {
      channelId: ch.id,
      hasOwnerOverwrite: Boolean(ownerOverwrite),
      hasMemberOverwrite: Boolean(memberOverwrite),
      ownerOverwrite,
      memberOverwrite,
    });
    if (!ownerOverwrite || !memberOverwrite){
      log.debug('channel skipped: owner/member overwrite missing', {
        channelId: ch.id,
        hasOwnerOverwrite: Boolean(ownerOverwrite),
        hasMemberOverwrite: Boolean(memberOverwrite),
      });
      continue;
    }

    const otherUsers = userOverwrites.filter((ow) => {
      if (ow.id === sess.uid || ow.id === memberId){
        return false;
      }
      if (botUserIdSet.has(ow.id)){
        return false;
      }
      return true;
    });
    log.debug('channel other user overwrite evaluation', {
      channelId: ch.id,
      otherUserOverwriteCount: otherUsers.length,
      otherUserOverwrites: otherUsers,
      recognizedBotOverwriteIds: Array.from(botUserIdSet),
    });
    if (otherUsers.length > 0){
      log.debug('channel skipped: unexpected user overwrites present', {
        channelId: ch.id,
        otherUserOverwriteCount: otherUsers.length,
      });
      continue;
    }

    const everyoneOverwrite = overwrites.find((ow) => ow.type === 0 && ow.id === guildId);
    const everyoneDeniedView = everyoneOverwrite ? deniesView(everyoneOverwrite) : false;
    log.debug('channel everyone overwrite evaluation', {
      channelId: ch.id,
      hasEveryoneOverwrite: Boolean(everyoneOverwrite),
      everyoneOverwrite,
      everyoneDeniedView,
    });
    if (!everyoneOverwrite || !everyoneDeniedView){
      log.debug('channel skipped: everyone overwrite missing or allows view', {
        channelId: ch.id,
        hasEveryoneOverwrite: Boolean(everyoneOverwrite),
        everyoneDeniedView,
      });
      continue;
    }

    const ownerAllowsView = allowsView(ownerOverwrite);
    const memberAllowsView = allowsView(memberOverwrite);
    log.debug('channel owner/member view permission evaluation', {
      channelId: ch.id,
      ownerAllowsView,
      memberAllowsView,
    });
    if (!ownerAllowsView || !memberAllowsView){
      log.debug('channel skipped: owner or member lacks view permission', {
        channelId: ch.id,
        ownerAllowsView,
        memberAllowsView,
      });
      continue;
    }

    const botOverwrite = userOverwrites.find((ow) => botUserIdSet.has(ow.id));
    const botHasView = botOverwrite ? allowsView(botOverwrite) : false;
    log.debug('channel bot overwrite evaluation', {
      channelId: ch.id,
      botOverwritePresent: Boolean(botOverwrite),
      botOverwrite,
      botHasView,
    });
    if (botOverwrite && botHasView){
      log.debug('channel accepted: matches criteria with bot access', {
        channelId: ch.id,
      });
      matchWithBot = ch;
      break;
    }

    if (!matchWithoutBot){
      log.debug('channel candidate stored: matches criteria without bot access', {
        channelId: ch.id,
        botOverwritePresent: Boolean(botOverwrite),
        botHasView,
      });
      matchWithoutBot = ch;
    }
  }

  if (matchWithBot){
    log.info('existing channel found with bot access', {
      channelId: matchWithBot.id,
      parentId: matchWithBot.parent_id || null,
    });
    return res.json({
      ok:true,
      channel_id: matchWithBot.id,
      channel_name: typeof matchWithBot.name === 'string' ? matchWithBot.name : null,
      created:false,
      parent_id: matchWithBot.parent_id || null
    });
  }

  if (matchWithoutBot){
    if (!botUserId){
      log.error('bot user id missing, cannot grant access to existing channel', {
        channelId: matchWithoutBot.id,
      });
      return res.status(500).json({
        ok:false,
        error:'DiscordボットのユーザーIDが設定されていません。',
      });
    }
    try {
      await dFetch(`/channels/${matchWithoutBot.id}/permissions/${botUserId}`, {
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
        channelId: matchWithoutBot.id,
        parentId: matchWithoutBot.parent_id || null
      });
    } catch (error) {
      return respondDiscordApiError(error, 'guild-channel-grant-bot');
    }

    return res.json({
      ok:true,
      channel_id: matchWithoutBot.id,
      channel_name: typeof matchWithoutBot.name === 'string' ? matchWithoutBot.name : null,
      created:false,
      parent_id: matchWithoutBot.parent_id || null
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
