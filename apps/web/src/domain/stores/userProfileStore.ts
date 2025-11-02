import { AppPersistence, type UserProfileCardV3, type UserProfilesStateV3 } from '../app-persistence';
import { generateDeterministicUserId } from '../idGenerators';
import { PersistedStore, type UpdateOptions } from './persistedStore';

function normalizeState(state: UserProfilesStateV3 | undefined): UserProfilesStateV3 {
  const now = new Date().toISOString();

  if (!state || state.version !== 3) {
    return {
      version: 3,
      updatedAt: now,
      users: {}
    } satisfies UserProfilesStateV3;
  }

  const normalizedUsers: Record<string, UserProfileCardV3> = {};
  const entries = Object.entries(state.users ?? {});

  entries.forEach(([, profile]) => {
    if (!profile) {
      return;
    }

    const displayName = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
    if (!displayName) {
      return;
    }

    const normalizedId = typeof profile.id === 'string' && profile.id.trim().length > 0 ? profile.id.trim() : generateDeterministicUserId(displayName);

    const normalizedProfile: UserProfileCardV3 = {
      id: normalizedId,
      displayName,
      joinedAt: typeof profile.joinedAt === 'string' ? profile.joinedAt : undefined,
      updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : state.updatedAt ?? now
    } satisfies UserProfileCardV3;

    const discordUserId = typeof profile.discordUserId === 'string' ? profile.discordUserId.trim() : '';
    if (discordUserId) {
      normalizedProfile.discordUserId = discordUserId;

      const discordDisplayName =
        typeof profile.discordDisplayName === 'string' ? profile.discordDisplayName.trim() : '';
      if (discordDisplayName) {
        normalizedProfile.discordDisplayName = discordDisplayName;
      }

      const discordUserName =
        typeof profile.discordUserName === 'string' ? profile.discordUserName.trim() : '';
      if (discordUserName) {
        normalizedProfile.discordUserName = discordUserName;
      }

      if (profile.discordAvatarAssetId === null) {
        normalizedProfile.discordAvatarAssetId = null;
      } else if (typeof profile.discordAvatarAssetId === 'string') {
        const assetId = profile.discordAvatarAssetId.trim();
        if (assetId) {
          normalizedProfile.discordAvatarAssetId = assetId;
        } else {
          normalizedProfile.discordAvatarAssetId = null;
        }
      }

      if (profile.discordAvatarUrl === null) {
        normalizedProfile.discordAvatarUrl = null;
      } else if (typeof profile.discordAvatarUrl === 'string') {
        const avatarUrl = profile.discordAvatarUrl.trim();
        if (avatarUrl) {
          normalizedProfile.discordAvatarUrl = avatarUrl;
        }
      }

      const linkedAtValue =
        typeof profile.discordLinkedAt === 'string' && profile.discordLinkedAt
          ? profile.discordLinkedAt
          : undefined;
      if (linkedAtValue) {
        normalizedProfile.discordLinkedAt = linkedAtValue;
      }
    }

    normalizedUsers[normalizedId] = normalizedProfile;
  });

  return {
    version: 3,
    updatedAt: state.updatedAt ?? now,
    users: normalizedUsers
  } satisfies UserProfilesStateV3;
}

export class UserProfileStore extends PersistedStore<UserProfilesStateV3 | undefined> {
  constructor(persistence: AppPersistence) {
    super(persistence);
  }

  override hydrate(initialState: UserProfilesStateV3 | undefined): void {
    const normalized = initialState ? normalizeState(initialState) : undefined;
    super.hydrate(normalized);
  }

  ensureProfile(displayName: string, options: UpdateOptions = { persist: 'immediate' }): string | undefined {
    const trimmed = displayName.trim();
    if (!trimmed) {
      return undefined;
    }

    const userId = generateDeterministicUserId(trimmed);

    this.update((previous) => {
      const base = normalizeState(previous);
      const now = new Date().toISOString();
      const existing = base.users[userId];
      const nextUsers = {
        ...base.users,
        [userId]: {
          ...existing,
          id: userId,
          displayName: trimmed,
          joinedAt: existing?.joinedAt ?? now,
          updatedAt: now
        }
      } satisfies Record<string, UserProfileCardV3>;

      return {
        ...base,
        updatedAt: now,
        users: nextUsers
      } satisfies UserProfilesStateV3;
    }, options);

    return userId;
  }

  linkDiscordProfile(
    profileId: string,
    info: {
      discordUserId: string;
      discordDisplayName?: string | null;
      discordUserName?: string | null;
      discordAvatarAssetId?: string | null;
      discordAvatarUrl?: string | null;
    },
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const trimmedProfileId = profileId.trim();
    const discordUserId = info.discordUserId?.trim();

    if (!trimmedProfileId || !discordUserId) {
      return;
    }

    const displayNameCandidate = info.discordDisplayName?.trim();
    const discordUserName = info.discordUserName?.trim();
    const avatarAssetId = info.discordAvatarAssetId;
    const avatarUrl = info.discordAvatarUrl;

    this.update((previous) => {
      const base = normalizeState(previous);
      const now = new Date().toISOString();
      const existing = base.users[trimmedProfileId];

      const fallbackDisplayName =
        existing?.displayName || displayNameCandidate || trimmedProfileId;

      const nextProfile: UserProfileCardV3 = {
        ...existing,
        id: trimmedProfileId,
        displayName: fallbackDisplayName,
        joinedAt: existing?.joinedAt ?? now,
        updatedAt: now,
        discordUserId,
        discordDisplayName:
          displayNameCandidate || existing?.discordDisplayName || fallbackDisplayName,
        discordUserName: discordUserName || existing?.discordUserName,
        discordLinkedAt: now
      } satisfies UserProfileCardV3;

      if (avatarAssetId !== undefined) {
        nextProfile.discordAvatarAssetId = avatarAssetId;
      } else if (existing?.discordAvatarAssetId !== undefined) {
        nextProfile.discordAvatarAssetId = existing.discordAvatarAssetId ?? null;
      }

      if (avatarUrl !== undefined) {
        nextProfile.discordAvatarUrl = avatarUrl;
      } else if (existing?.discordAvatarUrl !== undefined) {
        nextProfile.discordAvatarUrl = existing.discordAvatarUrl ?? null;
      }

      const nextUsers = {
        ...base.users,
        [trimmedProfileId]: nextProfile
      } satisfies Record<string, UserProfileCardV3>;

      return {
        ...base,
        updatedAt: now,
        users: nextUsers
      } satisfies UserProfilesStateV3;
    }, options);
  }

  protected persistImmediate(state: UserProfilesStateV3 | undefined): void {
    this.persistence.saveUserProfiles(state);
  }

  protected persistDebounced(state: UserProfilesStateV3 | undefined): void {
    this.persistence.saveUserProfilesDebounced(state);
  }
}
