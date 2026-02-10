import { describe, expect, it } from 'vitest';

import { sortDiscordGuildMembersByRecentJoin } from '../discordMemberSorting';
import type { DiscordGuildMemberSummary } from '../discordMemberCacheStorage';

function member(partial: Partial<DiscordGuildMemberSummary> & Pick<DiscordGuildMemberSummary, 'id'>): DiscordGuildMemberSummary {
  return {
    id: partial.id,
    username: partial.username ?? '',
    globalName: partial.globalName ?? null,
    nick: partial.nick ?? null,
    joinedAt: partial.joinedAt ?? null,
    avatar: partial.avatar ?? null,
    avatarUrl: partial.avatarUrl ?? null,
    displayName: partial.displayName ?? partial.id,
    giftChannelId: partial.giftChannelId,
    giftChannelName: partial.giftChannelName,
    giftChannelParentId: partial.giftChannelParentId,
    giftChannelBotHasView: partial.giftChannelBotHasView
  };
}

describe('sortDiscordGuildMembersByRecentJoin', () => {
  it('sorts by joinedAt desc (most recent first)', () => {
    const a = member({ id: 'a', displayName: 'Alice', joinedAt: '2024-01-01T00:00:00.000Z' });
    const b = member({ id: 'b', displayName: 'Bob', joinedAt: '2025-01-01T00:00:00.000Z' });
    const c = member({ id: 'c', displayName: 'Carol', joinedAt: '2023-01-01T00:00:00.000Z' });

    const result = sortDiscordGuildMembersByRecentJoin([a, b, c]);
    expect(result.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('pushes missing/invalid joinedAt to the bottom, preserving name order among them', () => {
    const recent = member({ id: 'recent', displayName: 'Zed', joinedAt: '2025-02-01T00:00:00.000Z' });
    const missing = member({ id: 'missing', displayName: 'alpha', joinedAt: null });
    const invalid = member({ id: 'invalid', displayName: 'Beta', joinedAt: 'not-a-date' });

    const result = sortDiscordGuildMembersByRecentJoin([missing, invalid, recent]);
    expect(result.map((m) => m.id)).toEqual(['recent', 'missing', 'invalid']);
  });

  it('uses displayName + id as tiebreaker when joinedAt is equal', () => {
    const baseJoinedAt = '2025-01-01T00:00:00.000Z';
    const a = member({ id: '2', displayName: 'bbb', joinedAt: baseJoinedAt });
    const b = member({ id: '1', displayName: 'aaa', joinedAt: baseJoinedAt });
    const c = member({ id: '3', displayName: 'aaa', joinedAt: baseJoinedAt });

    const result = sortDiscordGuildMembersByRecentJoin([a, b, c]);
    expect(result.map((m) => m.id)).toEqual(['1', '3', '2']);
  });
});

