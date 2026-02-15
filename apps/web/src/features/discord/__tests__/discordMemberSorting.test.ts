import { describe, expect, it } from 'vitest';

import { sortDiscordGuildMembers } from '../discordMemberSorting';
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

describe('sortDiscordGuildMembers', () => {
  it('sorts by displayName asc when mode is name', () => {
    const a = member({ id: '2', displayName: 'Bob' });
    const b = member({ id: '1', displayName: 'alice' });
    const c = member({ id: '3', displayName: 'Alice' });

    const result = sortDiscordGuildMembers([a, b, c], 'name');
    expect(result.map((m) => m.id)).toEqual(['1', '3', '2']);
  });

  it('sorts by id asc when mode is id', () => {
    const a = member({ id: '2', displayName: 'Bob' });
    const b = member({ id: '1', displayName: 'Alice' });
    const c = member({ id: '3', displayName: 'Carol' });

    const result = sortDiscordGuildMembers([a, b, c], 'id');
    expect(result.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by joinedAt desc (most recent first) when mode is newest', () => {
    const a = member({ id: 'a', displayName: 'Alice', joinedAt: '2024-01-01T00:00:00.000Z' });
    const b = member({ id: 'b', displayName: 'Bob', joinedAt: '2025-01-01T00:00:00.000Z' });
    const c = member({ id: 'c', displayName: 'Carol', joinedAt: '2023-01-01T00:00:00.000Z' });

    const result = sortDiscordGuildMembers([a, b, c], 'newest');
    expect(result.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by joinedAt asc (oldest first) when mode is oldest', () => {
    const a = member({ id: 'a', displayName: 'Alice', joinedAt: '2024-01-01T00:00:00.000Z' });
    const b = member({ id: 'b', displayName: 'Bob', joinedAt: '2025-01-01T00:00:00.000Z' });
    const c = member({ id: 'c', displayName: 'Carol', joinedAt: '2023-01-01T00:00:00.000Z' });

    const result = sortDiscordGuildMembers([a, b, c], 'oldest');
    expect(result.map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('pushes missing/invalid joinedAt to the bottom in join-based sorts', () => {
    const recent = member({ id: 'recent', displayName: 'Zed', joinedAt: '2025-02-01T00:00:00.000Z' });
    const missing = member({ id: 'missing', displayName: 'alpha', joinedAt: null });
    const invalid = member({ id: 'invalid', displayName: 'Beta', joinedAt: 'not-a-date' });

    const newest = sortDiscordGuildMembers([missing, invalid, recent], 'newest');
    expect(newest.map((m) => m.id)).toEqual(['recent', 'missing', 'invalid']);

    const oldest = sortDiscordGuildMembers([missing, invalid, recent], 'oldest');
    expect(oldest.map((m) => m.id)).toEqual(['recent', 'missing', 'invalid']);
  });
});
