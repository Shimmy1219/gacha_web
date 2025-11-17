import { DiscordPrivateChannelCategoryDialog } from '../../modals/dialogs/DiscordPrivateChannelCategoryDialog';
import type { ModalComponentProps } from '../../modals';
import type {
  DiscordGuildCategorySelection,
  DiscordGuildSelection
} from './discordGuildSelectionStorage';

interface EnsurePrivateChannelCategoryParams {
  push: ModalComponentProps['push'];
  discordUserId: string;
  guildSelection: DiscordGuildSelection;
  dialogTitle?: string;
}

export async function ensurePrivateChannelCategory({
  push,
  discordUserId,
  guildSelection,
  dialogTitle
}: EnsurePrivateChannelCategoryParams): Promise<DiscordGuildCategorySelection> {
  if (guildSelection.privateChannelCategory?.id) {
    return guildSelection.privateChannelCategory;
  }

  return await new Promise<DiscordGuildCategorySelection>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (category: DiscordGuildCategorySelection) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(category);
    };
    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    push(DiscordPrivateChannelCategoryDialog, {
      title: dialogTitle ?? 'お渡しカテゴリの選択',
      size: 'lg',
      payload: {
        guildId: guildSelection.guildId,
        discordUserId,
        initialCategory: guildSelection.privateChannelCategory ?? null,
        onCategorySelected: (category) => {
          resolveOnce(category);
        }
      },
      onClose: () => {
        rejectOnce(new Error('お渡しチャンネルのカテゴリが設定されていません。'));
      }
    });
  });
}
