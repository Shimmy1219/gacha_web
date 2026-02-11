import type { DiscordGuildMemberSummary } from './discordMemberCacheStorage';

export type DiscordGuildMemberSortMode = 'name' | 'id' | 'newest' | 'oldest';

function parseJoinedAt(joinedAt: string | null): number | null {
  if (!joinedAt) {
    return null;
  }
  const timestamp = Date.parse(joinedAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

type DecoratedMember = {
  member: DiscordGuildMemberSummary;
  index: number;
  id: string;
  joinedAt: number | null;
  displayName: string;
};

function decorateMembers(members: DiscordGuildMemberSummary[]): DecoratedMember[] {
  return members.map((member, index) => ({
    member,
    index,
    id: member.id,
    joinedAt: parseJoinedAt(member.joinedAt),
    displayName: (member.displayName ?? '').toLowerCase()
  }));
}

function compareName(a: DecoratedMember, b: DecoratedMember): number {
  if (a.displayName !== b.displayName) {
    return a.displayName < b.displayName ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id.localeCompare(b.id);
  }
  return a.index - b.index;
}

function compareId(a: DecoratedMember, b: DecoratedMember): number {
  if (a.id !== b.id) {
    return a.id.localeCompare(b.id);
  }
  if (a.displayName !== b.displayName) {
    return a.displayName < b.displayName ? -1 : 1;
  }
  return a.index - b.index;
}

function compareNewest(a: DecoratedMember, b: DecoratedMember): number {
  const aJoined = a.joinedAt;
  const bJoined = b.joinedAt;

  if (aJoined !== bJoined) {
    if (aJoined === null) return 1;
    if (bJoined === null) return -1;
    return bJoined - aJoined;
  }

  return compareName(a, b);
}

function compareOldest(a: DecoratedMember, b: DecoratedMember): number {
  const aJoined = a.joinedAt;
  const bJoined = b.joinedAt;

  if (aJoined !== bJoined) {
    if (aJoined === null) return 1;
    if (bJoined === null) return -1;
    return aJoined - bJoined;
  }

  return compareName(a, b);
}

export function sortDiscordGuildMembers(
  members: DiscordGuildMemberSummary[],
  mode: DiscordGuildMemberSortMode
): DiscordGuildMemberSummary[] {
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const decorated = decorateMembers(members);
  const compare =
    mode === 'id'
      ? compareId
      : mode === 'oldest'
        ? compareOldest
        : mode === 'newest'
          ? compareNewest
          : compareName;

  decorated.sort(compare);
  return decorated.map((entry) => entry.member);
}

export function sortDiscordGuildMembersByRecentJoin(
  members: DiscordGuildMemberSummary[]
): DiscordGuildMemberSummary[] {
  return sortDiscordGuildMembers(members, 'newest');
}
