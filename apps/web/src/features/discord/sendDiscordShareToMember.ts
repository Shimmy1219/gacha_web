import type { ModalComponentProps } from '../../modals';
import {
  isDiscordCategoryChannelLimitReachedErrorCode,
  pushDiscordApiWarningByErrorCode
} from '../../modals/dialogs/_lib/discordApiErrorHandling';
import { ensurePrivateChannelCategory } from './ensurePrivateChannelCategory';
import type { DiscordGuildSelection } from './discordGuildSelectionStorage';
import { fetchDiscordApi } from './fetchDiscordApi';
import { recoverDiscordCategoryLimitByCreatingNextCategory } from './recoverDiscordCategoryLimit';

interface FindChannelsResponsePayload {
  ok: boolean;
  channel_id?: string | null;
  channel_name?: string | null;
  parent_id?: string | null;
  created?: boolean;
  error?: string;
  errorCode?: string;
}

interface SendDiscordResponsePayload {
  ok?: boolean;
  error?: string;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface SendDiscordShareToMemberParams {
  push: ModalComponentProps['push'];
  discordUserId: string;
  guildSelection: DiscordGuildSelection;
  memberId: string;
  channelId?: string | null;
  channelName?: string | null;
  channelParentId?: string | null;
  displayNameForChannel?: string | null;
  shareUrl: string;
  shareTitle: string;
  shareComment?: string | null;
  createChannelIfMissing?: boolean;
  categoryDialogTitle?: string;
}

export interface SendDiscordShareToMemberResult {
  channelId: string;
  channelName: string | null;
  channelParentId: string | null;
}

export async function sendDiscordShareToMember({
  push,
  discordUserId,
  guildSelection,
  memberId,
  channelId,
  channelName,
  channelParentId,
  displayNameForChannel,
  shareUrl,
  shareTitle,
  shareComment,
  createChannelIfMissing = false,
  categoryDialogTitle
}: SendDiscordShareToMemberParams): Promise<SendDiscordShareToMemberResult> {
  let resolvedChannelId = normalizeOptionalString(channelId);
  let resolvedChannelName = normalizeOptionalString(channelName);
  let resolvedChannelParentId = normalizeOptionalString(channelParentId);
  let preferredCategory = resolvedChannelParentId ?? guildSelection.privateChannelCategory?.id ?? null;
  let preferredCategoryName =
    guildSelection.privateChannelCategory?.id === preferredCategory
      ? normalizeOptionalString(guildSelection.privateChannelCategory?.name)
      : null;

  if (!resolvedChannelId && !preferredCategory) {
    const category = await ensurePrivateChannelCategory({
      push,
      discordUserId,
      guildSelection,
      dialogTitle: categoryDialogTitle ?? 'お渡しカテゴリの設定'
    });
    preferredCategory = category.id;
    preferredCategoryName = normalizeOptionalString(category.name);
  }

  if (!resolvedChannelId) {
    if (!preferredCategory) {
      throw new Error('お渡しチャンネルのカテゴリが設定されていません。Discord共有設定を確認してください。');
    }

    const normalizedDisplayName = normalizeOptionalString(displayNameForChannel);
    let triedCategoryLimitRecovery = false;

    while (!resolvedChannelId) {
      const params = new URLSearchParams({
        guild_id: guildSelection.guildId,
        member_id: memberId,
        category_id: preferredCategory
      });
      if (createChannelIfMissing) {
        params.set('create', '1');
      }
      if (normalizedDisplayName) {
        params.set('display_name', normalizedDisplayName);
      }

      const findResponse = await fetchDiscordApi(`/api/discord/find-channels?${params.toString()}`, {
        method: 'GET'
      });

      const findPayload = (await findResponse.json().catch(() => null)) as FindChannelsResponsePayload | null;
      if (!findResponse.ok || !findPayload || !findPayload.ok) {
        const message =
          !findResponse.ok || !findPayload
            ? findPayload?.error || `お渡しチャンネルの確認に失敗しました (${findResponse.status})`
            : findPayload.error || 'お渡しチャンネルの確認に失敗しました';

        if (
          createChannelIfMissing &&
          !triedCategoryLimitRecovery &&
          preferredCategory &&
          isDiscordCategoryChannelLimitReachedErrorCode(findPayload?.errorCode)
        ) {
          const nextCategory = await recoverDiscordCategoryLimitByCreatingNextCategory({
            push,
            discordUserId,
            guildSelection,
            currentCategoryId: preferredCategory,
            currentCategoryName: preferredCategoryName
          });
          if (!nextCategory?.id) {
            throw new Error('Discord共有を中断しました。');
          }
          preferredCategory = nextCategory.id;
          preferredCategoryName = normalizeOptionalString(nextCategory.name);
          triedCategoryLimitRecovery = true;
          continue;
        }

        if (pushDiscordApiWarningByErrorCode(push, findPayload?.errorCode, message)) {
          throw new Error('Discordギルドの設定を確認してください。');
        }
        throw new Error(message);
      }

      resolvedChannelId = normalizeOptionalString(findPayload.channel_id);
      resolvedChannelName = normalizeOptionalString(findPayload.channel_name);
      resolvedChannelParentId = normalizeOptionalString(findPayload.parent_id) ?? preferredCategory;
    }
  }

  if (!resolvedChannelId) {
    throw new Error('お渡しチャンネルの情報が見つかりませんでした。');
  }

  const payload: Record<string, unknown> = {
    channel_id: resolvedChannelId,
    share_url: shareUrl,
    title: shareTitle,
    mode: 'bot'
  };
  const normalizedComment = normalizeOptionalString(shareComment);
  if (normalizedComment) {
    payload.comment = normalizedComment;
  }

  const sendResponse = await fetchDiscordApi('/api/discord/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const sendPayload = (await sendResponse
    .json()
    .catch(() => ({ ok: false, error: 'unexpected response' }))) as SendDiscordResponsePayload;

  if (!sendResponse.ok || !sendPayload.ok) {
    throw new Error(sendPayload.error || 'Discordへの共有に失敗しました');
  }

  return {
    channelId: resolvedChannelId,
    channelName: resolvedChannelName ?? null,
    channelParentId: resolvedChannelParentId ?? preferredCategory ?? null
  };
}
