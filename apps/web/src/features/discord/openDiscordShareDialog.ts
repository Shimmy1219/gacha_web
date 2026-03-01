import { DiscordMemberPickerDialog, type DiscordMemberShareResult } from '../../modals/dialogs/DiscordMemberPickerDialog';
import { requireDiscordGuildSelection } from './discordGuildSelectionStorage';
import type { ModalComponentProps } from '../../modals';
import type { DiscordGuildCategorySelection } from './discordGuildSelectionStorage';

interface OpenDiscordShareDialogParams {
  push: ModalComponentProps['push'];
  discordUserId: string;
  shareUrl: string;
  receiverName?: string;
  shareLabel?: string | null;
  shareTitle?: string | null;
  shareComment?: string | null;
  initialCategory?: DiscordGuildCategorySelection | null;
  dialogTitle?: string;
  onShared?: (result: DiscordMemberShareResult) => void;
  onShareFailed?: (message: string) => void;
}

export function openDiscordShareDialog({
  push,
  discordUserId,
  shareUrl,
  receiverName,
  shareLabel,
  shareTitle,
  shareComment,
  initialCategory,
  dialogTitle,
  onShared,
  onShareFailed
}: OpenDiscordShareDialogParams): void {
  const selection = requireDiscordGuildSelection(discordUserId);

  push(DiscordMemberPickerDialog, {
    title: dialogTitle ?? 'Discord共有先の選択',
    size: 'lg',
    payload: {
      guildId: selection.guildId,
      discordUserId,
      initialCategory: initialCategory ?? selection.privateChannelCategory ?? null,
      shareUrl,
      shareLabel: shareLabel ?? undefined,
      shareTitle: shareTitle ?? undefined,
      shareComment: shareComment ?? undefined,
      receiverName,
      onShared: (result) => {
        onShared?.(result);
      },
      onShareFailed
    }
  });
}
