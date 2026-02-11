import { PERM } from '../../_lib/discordApi.js';
import { normalizeOverwriteType } from './giftChannelUtils.js';

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

export function canonicalizeGiftChannelName(value){
  if (typeof value !== 'string'){
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed){
    return '';
  }
  const normalized = trimmed.normalize('NFKC').toLowerCase();
  const whitespaceCollapsed = normalized.replace(/\s+/gu, '-');
  return whitespaceCollapsed
    .replace(/[^-\p{Letter}\p{Number}_]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^_+|_+$/g, '');
}

export function buildChannelNameFromDisplayName(displayName, memberId){
  const fallback = `gift-${memberId}`;
  const sanitized = canonicalizeGiftChannelName(displayName);
  const candidate = sanitized || fallback;
  return candidate.length > 90 ? candidate.slice(0, 90) : candidate;
}

export function collectLegacyGiftChannelNameCandidates({
  memberId,
  memberDisplayNameParam,
  expectedChannelName
}){
  const set = new Set();
  const push = (value) => {
    const normalized = canonicalizeGiftChannelName(value);
    if (normalized){
      set.add(normalized);
    }
  };

  push(expectedChannelName);
  push(memberDisplayNameParam);
  push(`gift-${memberId}`);

  return set;
}

export function evaluateChannelForLegacyGiftRepair({
  channel,
  ownerId,
  memberId,
  categoryId,
  botUserIdSet,
  legacyNameCandidates
}){
  const channelId = normalizeSnowflake(channel?.id);
  const channelType = typeof channel?.type === 'number' ? channel.type : null;
  const parentId = normalizeSnowflake(channel?.parent_id);
  const channelName = typeof channel?.name === 'string' ? channel.name : null;
  const normalizedChannelName = canonicalizeGiftChannelName(channelName);
  const ownerSnowflake = normalizeSnowflake(ownerId);
  const memberSnowflake = normalizeSnowflake(memberId);
  const categoryMatched = !categoryId || parentId === categoryId;

  const result = {
    channelId: channelId ?? null,
    channelName: channelName ?? null,
    channelType,
    parentId: parentId ?? null,
    checks: {
      isTextChannel: channelType === 0,
      categoryMatched,
      ownerIdValid: Boolean(ownerSnowflake),
      memberIdValid: Boolean(memberSnowflake),
      hasPermissionOverwrites: false,
      nameMatched: false,
      botOverwritePresent: false,
      botCanView: false,
      explicitHumanOverwriteIds: [],
      conflictingExplicitMemberIds: [],
      candidateReady: false,
    },
    reason: '',
  };

  if (channelType !== 0){
    result.reason = 'skip:not_text_channel';
    return result;
  }

  if (!categoryMatched){
    result.reason = 'skip:category_mismatch';
    return result;
  }

  if (!ownerSnowflake || !memberSnowflake){
    result.reason = 'skip:invalid_owner_or_member';
    return result;
  }

  result.checks.nameMatched = legacyNameCandidates.has(normalizedChannelName);
  if (!result.checks.nameMatched){
    result.reason = 'skip:name_mismatch';
    return result;
  }

  const overwrites = Array.isArray(channel?.permission_overwrites) ? channel.permission_overwrites : [];
  result.checks.hasPermissionOverwrites = overwrites.length > 0;

  const userOverwrites = overwrites.filter((ow) => normalizeOverwriteType(ow) === 'member');
  const botOverwrite = userOverwrites.find((ow) => {
    const targetId = normalizeSnowflake(ow?.id);
    return targetId ? botUserIdSet.has(targetId) : false;
  });
  result.checks.botOverwritePresent = Boolean(botOverwrite);
  result.checks.botCanView = botOverwrite ? allowsView(botOverwrite) : false;

  const explicitHumanOverwriteIds = userOverwrites
    .map((ow) => normalizeSnowflake(ow?.id))
    .filter((id) => id && !botUserIdSet.has(id));
  result.checks.explicitHumanOverwriteIds = explicitHumanOverwriteIds;

  const allowedIdSet = new Set([ownerSnowflake, memberSnowflake]);
  const conflictingExplicitMemberIds = explicitHumanOverwriteIds.filter((id) => !allowedIdSet.has(id));
  result.checks.conflictingExplicitMemberIds = conflictingExplicitMemberIds;
  if (conflictingExplicitMemberIds.length > 0){
    result.reason = 'skip:conflicting_member_overwrites';
    return result;
  }

  result.checks.candidateReady = true;
  result.reason = 'match:legacy_repair_candidate';
  return result;
}
