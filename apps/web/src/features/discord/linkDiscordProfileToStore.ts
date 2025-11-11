import { saveAsset } from '@domain/assets/assetStorage';
import type { UserProfileStore } from '@domain/stores/userProfileStore';

interface LinkDiscordProfileParams {
  store: UserProfileStore | undefined;
  profileId: string | null | undefined;
  discordUserId: string;
  discordDisplayName?: string | null;
  discordUserName?: string | null;
  avatarUrl?: string | null;
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
}

function normalizeAvatarUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function linkDiscordProfileToStore({
  store,
  profileId,
  discordUserId,
  discordDisplayName,
  discordUserName,
  avatarUrl,
  share
}: LinkDiscordProfileParams): Promise<void> {
  if (!store || !profileId) {
    return;
  }

  const trimmedProfileId = profileId.trim();
  if (!trimmedProfileId) {
    return;
  }

  const trimmedDiscordId = discordUserId?.trim();
  if (!trimmedDiscordId) {
    return;
  }

  const profilesState = store.getState();
  const existingProfile = profilesState?.users?.[trimmedProfileId];

  const normalizedAvatarUrl = normalizeAvatarUrl(avatarUrl);
  let avatarAssetId: string | null | undefined = undefined;

  if (normalizedAvatarUrl === null) {
    avatarAssetId = null;
  } else if (typeof normalizedAvatarUrl === 'string') {
    const existingAvatarUrl = existingProfile?.discordAvatarUrl ?? null;
    if (normalizedAvatarUrl !== existingAvatarUrl) {
      if (
        typeof window !== 'undefined' &&
        typeof fetch === 'function' &&
        typeof File !== 'undefined'
      ) {
        try {
          const response = await fetch(normalizedAvatarUrl, { credentials: 'omit' });
          if (response.ok) {
            const blob = await response.blob();
            const mimeType = blob.type || 'image/png';
            let extension = 'png';
            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
              extension = 'jpg';
            } else if (mimeType.includes('gif')) {
              extension = 'gif';
            } else if (mimeType.includes('webp')) {
              extension = 'webp';
            }
            const fileName = `discord-avatar-${trimmedDiscordId}.${extension}`;
            const file = new File([blob], fileName, { type: mimeType });
            const record = await saveAsset(file);
            avatarAssetId = record.id;
          } else {
            console.warn('Discordアバターの取得に失敗しました', {
              status: response.status
            });
            avatarAssetId = null;
          }
        } catch (error) {
          console.warn('Discordアバターの保存に失敗しました', error);
          avatarAssetId = null;
        }
      } else {
        avatarAssetId = null;
      }
    } else {
      avatarAssetId = existingProfile?.discordAvatarAssetId ?? undefined;
    }
  } else {
    avatarAssetId = existingProfile?.discordAvatarAssetId ?? undefined;
  }

  try {
    store.linkDiscordProfile(
      trimmedProfileId,
      {
        discordUserId: trimmedDiscordId,
        discordDisplayName: discordDisplayName ?? undefined,
        discordUserName: discordUserName ?? undefined,
        discordAvatarAssetId: avatarAssetId,
        discordAvatarUrl: normalizedAvatarUrl,
        share
      },
      { persist: 'immediate' }
    );
  } catch (error) {
    console.warn('Discordプロフィール連携情報の更新に失敗しました', error);
  }
}

