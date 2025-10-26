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

    normalizedUsers[normalizedId] = {
      id: normalizedId,
      displayName,
      joinedAt: profile.joinedAt,
      updatedAt: profile.updatedAt ?? state.updatedAt ?? now
    } satisfies UserProfileCardV3;
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

  protected persistImmediate(state: UserProfilesStateV3 | undefined): void {
    this.persistence.saveUserProfiles(state);
  }

  protected persistDebounced(state: UserProfilesStateV3 | undefined): void {
    this.persistence.saveUserProfilesDebounced(state);
  }
}
