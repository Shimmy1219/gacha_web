import { describe, expect, it } from 'vitest';

import {
  mergeDiscordGuildMembersGiftChannelMetadata,
  type DiscordMemberGiftChannelInfo,
  type DiscordGuildMemberSummary
} from '../discordMemberCacheStorage';

function member(
  partial: Partial<DiscordGuildMemberSummary> & Pick<DiscordGuildMemberSummary, 'id'>
): DiscordGuildMemberSummary {
  const base: DiscordGuildMemberSummary = {
    id: partial.id,
    username: partial.username ?? '',
    globalName: partial.globalName ?? null,
    nick: partial.nick ?? null,
    joinedAt: partial.joinedAt ?? null,
    avatar: partial.avatar ?? null,
    avatarUrl: partial.avatarUrl ?? null,
    displayName: partial.displayName ?? partial.id
  };

  if (partial.giftChannelId !== undefined) {
    base.giftChannelId = partial.giftChannelId;
  }
  if (partial.giftChannelName !== undefined) {
    base.giftChannelName = partial.giftChannelName;
  }
  if (partial.giftChannelParentId !== undefined) {
    base.giftChannelParentId = partial.giftChannelParentId;
  }
  if (partial.giftChannelBotHasView !== undefined) {
    base.giftChannelBotHasView = partial.giftChannelBotHasView;
  }
  if (partial.giftChannelBotCanView !== undefined) {
    base.giftChannelBotCanView = partial.giftChannelBotCanView;
  }
  if (partial.giftChannelBotCanSend !== undefined) {
    base.giftChannelBotCanSend = partial.giftChannelBotCanSend;
  }

  return base;
}

function channel(partial: Partial<DiscordMemberGiftChannelInfo> & Pick<DiscordMemberGiftChannelInfo, 'memberId' | 'channelId'>): DiscordMemberGiftChannelInfo {
  return {
    memberId: partial.memberId,
    channelId: partial.channelId,
    channelName: partial.channelName ?? null,
    channelParentId: partial.channelParentId ?? null,
    botHasView: partial.botHasView ?? null,
    botCanView: partial.botCanView ?? null,
    botCanSend: partial.botCanSend ?? null
  };
}

describe('mergeDiscordGuildMembersGiftChannelMetadata', () => {
  it('does not clear gift metadata for non-target members when memberIds is provided', () => {
    const alice = member({ id: 'alice', displayName: 'Alice' });
    const bob = member({ id: 'bob', displayName: 'Bob', giftChannelId: 'channel-bob' });

    const result = mergeDiscordGuildMembersGiftChannelMetadata(
      [alice, bob],
      [channel({ memberId: 'alice', channelId: 'channel-alice' })],
      { memberIds: ['alice'] }
    );

    const nextAlice = result.find((m) => m.id === 'alice');
    const nextBob = result.find((m) => m.id === 'bob');

    expect(nextAlice?.giftChannelId).toBe('channel-alice');
    expect(nextAlice?.giftChannelBotCanView).toBeNull();
    expect(nextAlice?.giftChannelBotCanSend).toBeNull();
    expect(nextBob?.giftChannelId).toBe('channel-bob');
  });

  it('clears gift metadata for missing channels when memberIds is omitted (full replace)', () => {
    const alice = member({ id: 'alice', displayName: 'Alice', giftChannelId: 'channel-alice' });
    const bob = member({ id: 'bob', displayName: 'Bob', giftChannelId: 'channel-bob' });

    const result = mergeDiscordGuildMembersGiftChannelMetadata([alice, bob], [
      channel({ memberId: 'alice', channelId: 'channel-alice' })
    ]);

    const nextBob = result.find((m) => m.id === 'bob');
    expect(nextBob?.giftChannelId).toBeUndefined();
    expect(nextBob && 'giftChannelId' in nextBob).toBe(false);
  });

  it('does not clear existing gift metadata in upsert mode', () => {
    const alice = member({ id: 'alice', displayName: 'Alice', giftChannelId: 'channel-alice' });

    const result = mergeDiscordGuildMembersGiftChannelMetadata([alice], [], {
      memberIds: ['alice'],
      mode: 'upsert'
    });

    expect(result[0].giftChannelId).toBe('channel-alice');
  });
});
