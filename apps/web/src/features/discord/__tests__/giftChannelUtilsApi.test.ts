import { describe, expect, it } from 'vitest';

import {
  extractGiftChannelCandidates,
  extractOwnerBotOnlyGiftChannelCandidates
} from '../../../../api/discord/_lib/giftChannelUtils.js';

const VIEW_CHANNEL_BIT = '1024';

function buildTextChannel(
  id: string,
  parentId: string | null,
  permissionOverwrites: Array<Record<string, unknown>>,
  name = 'channel'
): Record<string, unknown> {
  return {
    id,
    type: 0,
    parent_id: parentId,
    name,
    permission_overwrites: permissionOverwrites
  };
}

function buildEveryoneDeny(guildId: string): Record<string, unknown> {
  return {
    id: guildId,
    type: 0,
    allow: '0',
    deny: VIEW_CHANNEL_BIT
  };
}

function buildMemberAllow(memberId: string): Record<string, unknown> {
  return {
    id: memberId,
    type: 1,
    allow: VIEW_CHANNEL_BIT,
    deny: '0'
  };
}

describe('giftChannelUtils API helpers', () => {
  it('extractGiftChannelCandidates includes owner+member(+bot) channels and excludes owner+bot-only channels', () => {
    const guildId = 'guild-1';
    const ownerId = 'owner-1';
    const memberId = 'member-1';
    const botId = 'bot-1';

    const channels = [
      buildTextChannel(
        'channel-owner-member-bot',
        'category-a',
        [buildEveryoneDeny(guildId), buildMemberAllow(ownerId), buildMemberAllow(memberId), buildMemberAllow(botId)],
        'owner-member-bot'
      ),
      buildTextChannel(
        'channel-owner-bot-only',
        'category-a',
        [buildEveryoneDeny(guildId), buildMemberAllow(ownerId), buildMemberAllow(botId)],
        'owner-bot-only'
      )
    ];

    const result = extractGiftChannelCandidates({
      channels,
      ownerId,
      guildId,
      botUserIdSet: new Set([botId])
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.channelId).toBe('channel-owner-member-bot');
    expect(result[0]?.memberId).toBe(memberId);
  });

  it('extractOwnerBotOnlyGiftChannelCandidates includes only owner+bot-only channels', () => {
    const guildId = 'guild-1';
    const ownerId = 'owner-1';
    const memberId = 'member-1';
    const botId = 'bot-1';

    const channels = [
      buildTextChannel(
        'channel-owner-member-bot',
        'category-a',
        [buildEveryoneDeny(guildId), buildMemberAllow(ownerId), buildMemberAllow(memberId), buildMemberAllow(botId)],
        'owner-member-bot'
      ),
      buildTextChannel(
        'channel-owner-bot-only',
        'category-b',
        [buildEveryoneDeny(guildId), buildMemberAllow(ownerId), buildMemberAllow(botId)],
        'owner-bot-only'
      )
    ];

    const result = extractOwnerBotOnlyGiftChannelCandidates({
      channels,
      ownerId,
      guildId,
      botUserIdSet: new Set([botId])
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.channelId).toBe('channel-owner-bot-only');
    expect(result[0]?.parentId).toBe('category-b');
  });
});

