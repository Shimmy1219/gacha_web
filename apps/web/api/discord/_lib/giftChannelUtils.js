import { dFetch, PERM } from '../../_lib/discordApi.js';

const ENV_BOT_ID_KEYS = ['DISCORD_BOT_USER_ID', 'DISCORD_CLIENT_ID'];
const ADMINISTRATOR_BIT = 1n << 3n;

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

export function normalizeOverwriteType(overwrite){
  if (!overwrite){ return null; }
  const { type } = overwrite;
  if (typeof type === 'number'){
    if (type === 1){ return 'member'; }
    if (type === 0){ return 'role'; }
    return null;
  }
  if (typeof type === 'string'){
    const normalized = type.trim().toLowerCase();
    if (normalized === '1' || normalized === 'member'){ return 'member'; }
    if (normalized === '0' || normalized === 'role'){ return 'role'; }
  }
  return null;
}

let botIdentityCache = null;
let botIdentityCacheToken = null;
let botIdentityPromise = null;

export async function resolveBotIdentity(log){
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
const sendMessagesBit = BigInt(PERM.SEND_MESSAGES);

function allowsView(overwrite){
  return (toBigInt(overwrite?.allow) & viewChannelBit) === viewChannelBit;
}

function allowsSend(overwrite){
  return (toBigInt(overwrite?.allow) & sendMessagesBit) === sendMessagesBit;
}

function deniesView(overwrite){
  return (toBigInt(overwrite?.deny) & viewChannelBit) === viewChannelBit;
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

function applyOverwritePermissions(current, overwrite){
  if (!overwrite){
    return current;
  }
  const deny = toBigInt(overwrite?.deny);
  const allow = toBigInt(overwrite?.allow);
  return (current & ~deny) | allow;
}

function aggregateRolePermissions(overwrites, roleIds){
  let deny = 0n;
  let allow = 0n;
  for (const overwrite of overwrites) {
    const overwriteId = normalizeSnowflake(overwrite?.id);
    if (!overwriteId || !roleIds.has(overwriteId)){
      continue;
    }
    deny |= toBigInt(overwrite?.deny);
    allow |= toBigInt(overwrite?.allow);
  }
  return { deny, allow };
}

function toAccessResult(permissionBits){
  const canView = (permissionBits & viewChannelBit) === viewChannelBit;
  const canSend = (permissionBits & sendMessagesBit) === sendMessagesBit;
  return { canView, canSend };
}

function resolveBotChannelAccessFromContext({ channel, guildId, botUserId, context }){
  if (!context || !guildId || !botUserId){
    return null;
  }
  const permissionOverwrites = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  let permissionBits = context.basePermissions;
  if ((permissionBits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT){
    return { canView: true, canSend: true, via: 'administrator' };
  }

  const everyoneOverwrite = permissionOverwrites.find(
    (overwrite) => normalizeOverwriteType(overwrite) === 'role' && normalizeSnowflake(overwrite?.id) === guildId
  );
  permissionBits = applyOverwritePermissions(permissionBits, everyoneOverwrite);

  const roleOverwrites = permissionOverwrites.filter((overwrite) => normalizeOverwriteType(overwrite) === 'role');
  const roleAggregate = aggregateRolePermissions(roleOverwrites, context.roleIds);
  permissionBits = (permissionBits & ~roleAggregate.deny) | roleAggregate.allow;

  const memberOverwrite = permissionOverwrites.find(
    (overwrite) => normalizeOverwriteType(overwrite) === 'member' && normalizeSnowflake(overwrite?.id) === botUserId
  );
  permissionBits = applyOverwritePermissions(permissionBits, memberOverwrite);

  return { ...toAccessResult(permissionBits), via: 'calculated' };
}

function fallbackBotChannelAccess({ userOverwrites, botUserIdSet }){
  const botOverwrite = userOverwrites.find((ow) => {
    const targetId = normalizeSnowflake(ow?.id);
    return targetId ? botUserIdSet.has(targetId) : false;
  });
  if (!botOverwrite){
    return { canView: null, canSend: null, botOverwritePresent: false, via: 'unknown' };
  }
  return {
    canView: allowsView(botOverwrite),
    canSend: allowsSend(botOverwrite),
    botOverwritePresent: true,
    via: 'overwrite'
  };
}

function resolveBotChannelAccess({
  channel,
  guildId,
  botUserIdSet,
  permissionContext,
  userOverwrites
}){
  const fallback = fallbackBotChannelAccess({ userOverwrites, botUserIdSet });
  const resolvedBotUserId = permissionContext?.botUserId || null;
  const calculated = resolveBotChannelAccessFromContext({
    channel,
    guildId,
    botUserId: resolvedBotUserId,
    context: permissionContext
  });
  if (!calculated){
    return {
      botCanView: fallback.canView,
      botCanSend: fallback.canSend,
      botHasView: fallback.canView,
      botOverwritePresent: fallback.botOverwritePresent,
      resolvedVia: fallback.via
    };
  }
  return {
    botCanView: calculated.canView,
    botCanSend: calculated.canSend,
    botHasView: calculated.canView,
    botOverwritePresent: fallback.botOverwritePresent,
    resolvedVia: calculated.via
  };
}

function normalizeRoleIdList(value){
  if (!Array.isArray(value)){
    return [];
  }
  return value
    .map((roleId) => normalizeSnowflake(roleId))
    .filter(Boolean);
}

function buildRolePermissionMap(roles){
  const rolePermissionMap = new Map();
  if (!Array.isArray(roles)){
    return rolePermissionMap;
  }
  for (const role of roles) {
    const roleId = normalizeSnowflake(role?.id);
    if (!roleId){
      continue;
    }
    rolePermissionMap.set(roleId, toBigInt(role?.permissions));
  }
  return rolePermissionMap;
}

export async function resolveBotPermissionContext({ guildId, botUserId, botUserIdSet, token, log }){
  const guildSnowflake = normalizeSnowflake(guildId);
  const resolvedBotUserId = normalizeSnowflake(botUserId) || Array.from(botUserIdSet ?? [])[0] || null;
  if (!guildSnowflake || !resolvedBotUserId || !token){
    return null;
  }
  try {
    const [botMember, guildRoles] = await Promise.all([
      dFetch(`/guilds/${guildSnowflake}/members/${resolvedBotUserId}`, { token, isBot: true }),
      dFetch(`/guilds/${guildSnowflake}/roles`, { token, isBot: true })
    ]);
    const rolePermissionMap = buildRolePermissionMap(guildRoles);
    const botRoleIds = new Set(normalizeRoleIdList(botMember?.roles));

    let basePermissions = rolePermissionMap.get(guildSnowflake) ?? 0n;
    for (const roleId of botRoleIds) {
      const rolePermissionBits = rolePermissionMap.get(roleId) ?? 0n;
      basePermissions |= rolePermissionBits;
    }

    return {
      botUserId: resolvedBotUserId,
      guildId: guildSnowflake,
      roleIds: botRoleIds,
      basePermissions
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.warn('failed to resolve bot permission context; fallback to overwrite-based access detection', {
      guildId: guildSnowflake,
      botUserId: resolvedBotUserId,
      message
    });
    return null;
  }
}

export function extractGiftChannelCandidates({
  channels,
  ownerId,
  guildId,
  botUserIdSet,
  permissionContext = null,
}){
  const ownerSnowflake = normalizeSnowflake(ownerId);
  const guildSnowflake = normalizeSnowflake(guildId);
  if (!ownerSnowflake || !guildSnowflake){
    return [];
  }

  const results = [];
  const textChannels = Array.isArray(channels) ? channels.filter((ch) => ch && ch.type === 0) : [];

  for (const ch of textChannels){
    const overwrites = Array.isArray(ch.permission_overwrites) ? ch.permission_overwrites : [];
    if (overwrites.length === 0){
      continue;
    }

    const userOverwrites = overwrites.filter((ow) => normalizeOverwriteType(ow) === 'member');
    const ownerOverwrite = userOverwrites.find((ow) => normalizeSnowflake(ow?.id) === ownerSnowflake);
    if (!ownerOverwrite){
      continue;
    }

    const normalizedMemberOverwrites = userOverwrites.filter((ow) => {
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

    if (normalizedMemberOverwrites.length !== 1){
      continue;
    }

    const memberOverwrite = normalizedMemberOverwrites[0];
    const memberId = normalizeSnowflake(memberOverwrite?.id);
    if (!memberId){
      continue;
    }

    const otherUsers = userOverwrites.filter((ow) => {
      const targetId = normalizeSnowflake(ow?.id);
      if (!targetId){
        return false;
      }
      if (targetId === ownerSnowflake){
        return false;
      }
      if (targetId === memberId){
        return false;
      }
      if (botUserIdSet.has(targetId)){
        return false;
      }
      return true;
    });

    if (otherUsers.length > 0){
      continue;
    }

    const everyoneOverwrite = overwrites.find((ow) => normalizeOverwriteType(ow) === 'role' && normalizeSnowflake(ow?.id) === guildSnowflake);
    if (!everyoneOverwrite || !deniesView(everyoneOverwrite)){
      continue;
    }

    if (!allowsView(ownerOverwrite) || !allowsView(memberOverwrite)){
      continue;
    }

    const botAccess = resolveBotChannelAccess({
      channel: ch,
      guildId: guildSnowflake,
      botUserIdSet,
      permissionContext,
      userOverwrites
    });

    const channelId = normalizeSnowflake(ch.id);
    if (!channelId){
      continue;
    }

    const parentId = normalizeSnowflake(ch.parent_id);
    const name = typeof ch.name === 'string' ? ch.name : null;

    results.push({
      channel: ch,
      channelId,
      channelName: name,
      parentId: parentId || null,
      memberId,
      botCanView: botAccess.botCanView,
      botCanSend: botAccess.botCanSend,
      botHasView: botAccess.botHasView,
      botOverwritePresent: botAccess.botOverwritePresent,
      botAccessResolvedVia: botAccess.resolvedVia
    });
  }

  return results;
}

export function extractOwnerBotOnlyGiftChannelCandidates({
  channels,
  ownerId,
  guildId,
  botUserIdSet,
  permissionContext = null,
}){
  const ownerSnowflake = normalizeSnowflake(ownerId);
  const guildSnowflake = normalizeSnowflake(guildId);
  if (!ownerSnowflake || !guildSnowflake){
    return [];
  }

  const results = [];
  const textChannels = Array.isArray(channels) ? channels.filter((ch) => ch && ch.type === 0) : [];

  for (const ch of textChannels){
    const overwrites = Array.isArray(ch.permission_overwrites) ? ch.permission_overwrites : [];
    if (overwrites.length === 0){
      continue;
    }

    const userOverwrites = overwrites.filter((ow) => normalizeOverwriteType(ow) === 'member');
    const ownerOverwrite = userOverwrites.find((ow) => normalizeSnowflake(ow?.id) === ownerSnowflake);
    if (!ownerOverwrite){
      continue;
    }

    const memberOverwrites = userOverwrites.filter((ow) => {
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

    if (memberOverwrites.length !== 0){
      continue;
    }

    const everyoneOverwrite = overwrites.find(
      (ow) => normalizeOverwriteType(ow) === 'role' && normalizeSnowflake(ow?.id) === guildSnowflake
    );
    if (!everyoneOverwrite || !deniesView(everyoneOverwrite)){
      continue;
    }

    if (!allowsView(ownerOverwrite)){
      continue;
    }

    const botAccess = resolveBotChannelAccess({
      channel: ch,
      guildId: guildSnowflake,
      botUserIdSet,
      permissionContext,
      userOverwrites
    });
    if (botAccess.botCanView !== true || botAccess.botCanSend !== true){
      continue;
    }

    const channelId = normalizeSnowflake(ch.id);
    if (!channelId){
      continue;
    }

    const parentId = normalizeSnowflake(ch.parent_id);
    const name = typeof ch.name === 'string' ? ch.name : null;

    results.push({
      channel: ch,
      channelId,
      channelName: name,
      parentId: parentId || null,
      botCanView: true,
      botCanSend: true,
      botHasView: true,
      botOverwritePresent: botAccess.botOverwritePresent,
      botAccessResolvedVia: botAccess.resolvedVia
    });
  }

  return results;
}
