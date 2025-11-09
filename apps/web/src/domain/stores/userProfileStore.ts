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

      const shareChannelId =
        typeof profile.discordLastShareChannelId === 'string'
          ? profile.discordLastShareChannelId.trim()
          : '';
      if (shareChannelId) {
        normalizedProfile.discordLastShareChannelId = shareChannelId;
      }

      if (profile.discordLastShareChannelName === null) {
        normalizedProfile.discordLastShareChannelName = null;
      } else if (typeof profile.discordLastShareChannelName === 'string') {
        const channelName = profile.discordLastShareChannelName.trim();
        if (channelName) {
          normalizedProfile.discordLastShareChannelName = channelName;
        }
      }

      if (profile.discordLastShareChannelParentId === null) {
        normalizedProfile.discordLastShareChannelParentId = null;
      } else if (typeof profile.discordLastShareChannelParentId === 'string') {
        const parentId = profile.discordLastShareChannelParentId.trim();
        if (parentId) {
          normalizedProfile.discordLastShareChannelParentId = parentId;
        }
      }

      if (typeof profile.discordLastShareUrl === 'string') {
        const shareUrl = profile.discordLastShareUrl.trim();
        if (shareUrl) {
          normalizedProfile.discordLastShareUrl = shareUrl;
        }
      }

      if (profile.discordLastShareLabel === null) {
        normalizedProfile.discordLastShareLabel = null;
      } else if (typeof profile.discordLastShareLabel === 'string') {
        const shareLabel = profile.discordLastShareLabel.trim();
        if (shareLabel) {
          normalizedProfile.discordLastShareLabel = shareLabel;
        }
      }

      if (profile.discordLastShareTitle === null) {
        normalizedProfile.discordLastShareTitle = null;
      } else if (typeof profile.discordLastShareTitle === 'string') {
        const shareTitle = profile.discordLastShareTitle.trim();
        if (shareTitle) {
          normalizedProfile.discordLastShareTitle = shareTitle;
        }
      }

      if (profile.discordLastShareComment === null) {
        normalizedProfile.discordLastShareComment = null;
      } else if (typeof profile.discordLastShareComment === 'string') {
        const shareComment = profile.discordLastShareComment.trim();
        if (shareComment) {
          normalizedProfile.discordLastShareComment = shareComment;
        }
      }

      if (typeof profile.discordLastShareAt === 'string') {
        const trimmed = profile.discordLastShareAt.trim();
        if (trimmed) {
          const parsed = new Date(trimmed);
          if (!Number.isNaN(parsed.valueOf())) {
            normalizedProfile.discordLastShareAt = parsed.toISOString();
          }
        }
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

export type RenameProfileResult =
  | { success: true }
  | {
      success: false;
      reason: 'invalid-input' | 'not-found' | 'duplicate-name';
      conflictProfileId?: string;
    };

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

    let resolvedId = generateDeterministicUserId(trimmed);
    this.update((previous) => {
      const base = normalizeState(previous);
      const now = new Date().toISOString();
      const existingByName = Object.values(base.users).find((profile) => profile.displayName === trimmed);
      const userId = existingByName?.id ?? resolvedId;
      resolvedId = userId;
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

    return resolvedId;
  }

  renameProfile(
    profileId: string,
    displayName: string,
    options: UpdateOptions = { persist: 'immediate' }
  ): RenameProfileResult {
    const trimmedProfileId = profileId.trim();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedProfileId || !trimmedDisplayName) {
      return { success: false, reason: 'invalid-input' };
    }

    let result: RenameProfileResult = { success: false, reason: 'not-found' };

    this.update((previous) => {
      const base = normalizeState(previous);
      const existing = base.users[trimmedProfileId];
      if (!existing) {
        result = { success: false, reason: 'not-found' };
        return previous;
      }

      if (existing.displayName === trimmedDisplayName) {
        result = { success: true };
        return previous;
      }

      const duplicateProfile = Object.values(base.users).find(
        (profile) => profile.displayName === trimmedDisplayName && profile.id !== trimmedProfileId
      );
      if (duplicateProfile) {
        result = {
          success: false,
          reason: 'duplicate-name',
          conflictProfileId: duplicateProfile.id
        };
        return previous;
      }

      const now = new Date().toISOString();
      const nextUsers = {
        ...base.users,
        [trimmedProfileId]: {
          ...existing,
          displayName: trimmedDisplayName,
          updatedAt: now
        }
      } satisfies Record<string, UserProfileCardV3>;

      result = { success: true };

      return {
        ...base,
        updatedAt: now,
        users: nextUsers
      } satisfies UserProfilesStateV3;
    }, options);

    return result;
  }

  linkDiscordProfile(
    profileId: string,
    info: {
      discordUserId: string;
      discordDisplayName?: string | null;
      discordUserName?: string | null;
      discordAvatarAssetId?: string | null;
      discordAvatarUrl?: string | null;
      share?: {
        channelId?: string;
        channelName?: string | null;
        channelParentId?: string | null;
        shareUrl?: string;
        shareLabel?: string | null;
        shareTitle?: string | null;
        shareComment?: string | null;
        sharedAt?: string;
      };
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
    const shareInfo = info.share;

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

      if (shareInfo) {
        const channelId =
          typeof shareInfo.channelId === 'string' ? shareInfo.channelId.trim() : '';
        if (channelId) {
          nextProfile.discordLastShareChannelId = channelId;
        }

        if (shareInfo.channelName === null) {
          nextProfile.discordLastShareChannelName = null;
        } else if (typeof shareInfo.channelName === 'string') {
          const channelName = shareInfo.channelName.trim();
          if (channelName) {
            nextProfile.discordLastShareChannelName = channelName;
          }
        }

        if (shareInfo.channelParentId === null) {
          nextProfile.discordLastShareChannelParentId = null;
        } else if (typeof shareInfo.channelParentId === 'string') {
          const parentId = shareInfo.channelParentId.trim();
          if (parentId) {
            nextProfile.discordLastShareChannelParentId = parentId;
          }
        }

        if (typeof shareInfo.shareUrl === 'string') {
          const shareUrl = shareInfo.shareUrl.trim();
          if (shareUrl) {
            nextProfile.discordLastShareUrl = shareUrl;
          }
        }

        if (shareInfo.shareLabel === null) {
          nextProfile.discordLastShareLabel = null;
        } else if (typeof shareInfo.shareLabel === 'string') {
          const label = shareInfo.shareLabel.trim();
          if (label) {
            nextProfile.discordLastShareLabel = label;
          }
        }

        if (shareInfo.shareTitle === null) {
          nextProfile.discordLastShareTitle = null;
        } else if (typeof shareInfo.shareTitle === 'string') {
          const title = shareInfo.shareTitle.trim();
          if (title) {
            nextProfile.discordLastShareTitle = title;
          }
        }

        if (shareInfo.shareComment === null) {
          nextProfile.discordLastShareComment = null;
        } else if (typeof shareInfo.shareComment === 'string') {
          const comment = shareInfo.shareComment.trim();
          if (comment) {
            nextProfile.discordLastShareComment = comment;
          }
        }

        const sharedAtRaw =
          typeof shareInfo.sharedAt === 'string' ? shareInfo.sharedAt.trim() : '';
        const parsedSharedAt = sharedAtRaw ? new Date(sharedAtRaw) : null;
        nextProfile.discordLastShareAt =
          parsedSharedAt && !Number.isNaN(parsedSharedAt.valueOf())
            ? parsedSharedAt.toISOString()
            : now;
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

  unlinkDiscordProfile(
    profileId: string,
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const trimmedProfileId = profileId.trim();
    if (!trimmedProfileId) {
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous);
      const existing = base.users[trimmedProfileId];
      if (!existing) {
        return previous;
      }

      const {
        discordUserId: _discardUserId,
        discordDisplayName: _discardDisplayName,
        discordUserName: _discardUserName,
        discordAvatarAssetId: _discardAvatarAssetId,
        discordAvatarUrl: _discardAvatarUrl,
        discordLinkedAt: _discardLinkedAt,
        discordLastShareChannelId: _discardChannelId,
        discordLastShareChannelName: _discardChannelName,
        discordLastShareChannelParentId: _discardParentId,
        discordLastShareUrl: _discardShareUrl,
        discordLastShareLabel: _discardShareLabel,
        discordLastShareTitle: _discardShareTitle,
        discordLastShareComment: _discardShareComment,
        discordLastShareAt: _discardShareAt,
        ...rest
      } = existing;

      const now = new Date().toISOString();
      const nextProfile: UserProfileCardV3 = {
        ...rest,
        id: existing.id,
        displayName: existing.displayName,
        joinedAt: existing.joinedAt,
        updatedAt: now
      } satisfies UserProfileCardV3;

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

  deleteProfile(
    profileId: string,
    options: UpdateOptions = { persist: 'immediate' }
  ): void {
    const trimmedProfileId = profileId.trim();
    if (!trimmedProfileId) {
      return;
    }

    this.update((previous) => {
      const base = normalizeState(previous);
      if (!base.users[trimmedProfileId]) {
        return previous;
      }

      const nextUsers = { ...base.users } as Record<string, UserProfileCardV3>;
      delete nextUsers[trimmedProfileId];

      if (Object.keys(nextUsers).length === 0) {
        return undefined;
      }

      const now = new Date().toISOString();

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
