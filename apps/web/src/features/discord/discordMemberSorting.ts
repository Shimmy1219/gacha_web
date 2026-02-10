import type { DiscordGuildMemberSummary } from './discordMemberCacheStorage';

function parseJoinedAt(joinedAt: string | null): number | null {
  if (!joinedAt) {
    return null;
  }
  const timestamp = Date.parse(joinedAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function sortDiscordGuildMembersByRecentJoin(
  members: DiscordGuildMemberSummary[]
): DiscordGuildMemberSummary[] {
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const decorated = members.map((member, index) => ({
    member,
    index,
    joinedAt: parseJoinedAt(member.joinedAt),
    displayName: (member.displayName ?? '').toLowerCase()
  }));

  decorated.sort((a, b) => {
    const aJoined = a.joinedAt;
    const bJoined = b.joinedAt;

    if (aJoined !== bJoined) {
      if (aJoined === null) return 1;
      if (bJoined === null) return -1;
      return bJoined - aJoined;
    }

    if (a.displayName !== b.displayName) {
      return a.displayName < b.displayName ? -1 : 1;
    }

    if (a.member.id !== b.member.id) {
      return a.member.id.localeCompare(b.member.id);
    }

    // Preserve original order for true ties (defensive; modern V8 is stable).
    return a.index - b.index;
  });

  return decorated.map((entry) => entry.member);
}

