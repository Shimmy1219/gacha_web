import { dFetch, PERM } from '../../_lib/discordApi.js';

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

function allowsView(overwrite){
  return (toBigInt(overwrite?.allow) & viewChannelBit) === viewChannelBit;
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

export function extractGiftChannelCandidates({
  channels,
  ownerId,
  guildId,
  botUserIdSet,
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

    const botOverwrite = userOverwrites.find((ow) => {
      const targetId = normalizeSnowflake(ow?.id);
      return targetId ? botUserIdSet.has(targetId) : false;
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
      botHasView: botOverwrite ? allowsView(botOverwrite) : false,
      botOverwritePresent: Boolean(botOverwrite),
    });
  }

  return results;
}

export function extractOwnerBotOnlyGiftChannelCandidates({
  channels,
  ownerId,
  guildId,
  botUserIdSet,
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

    const botOverwrite = userOverwrites.find((ow) => {
      const targetId = normalizeSnowflake(ow?.id);
      return targetId ? botUserIdSet.has(targetId) : false;
    });
    if (!botOverwrite || !allowsView(botOverwrite)){
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
      botHasView: true,
      botOverwritePresent: true,
    });
  }

  return results;
}
