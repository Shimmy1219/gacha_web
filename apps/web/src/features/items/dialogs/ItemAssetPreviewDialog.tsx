import { MusicalNoteIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';
import { type ItemId } from '../../../components/cards/ItemCard';
import { useAssetPreview } from '../../assets/useAssetPreview';
import { getRarityTextPresentation } from '../../rarity/utils/rarityColorPresentation';

export interface ItemAssetPreviewDialogPayload {
  itemId: ItemId;
  itemName: string;
  gachaName: string;
  rarityLabel: string;
  rarityColor: string;
  assetHash: string | null;
  thumbnailUrl: string | null;
}

export function ItemAssetPreviewDialog({
  payload,
  close
}: ModalComponentProps<ItemAssetPreviewDialogPayload>): JSX.Element {
  if (!payload) {
    return (
      <>
        <ModalBody>
          <p className="text-sm text-muted-foreground">プレビュー情報を読み込めませんでした。</p>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="btn btn-primary" onClick={close}>
            閉じる
          </button>
        </ModalFooter>
      </>
    );
  }

  const { assetHash, thumbnailUrl, itemName, rarityColor, rarityLabel } = payload;
  const preview = useAssetPreview(assetHash);
  const previewUrl = preview.url ?? thumbnailUrl ?? null;
  const previewType = preview.type ?? (previewUrl ? 'image/*' : null);
  const isImagePreview = Boolean(previewType && previewType.startsWith('image/'));
  const isVideoPreview = Boolean(previewType && previewType.startsWith('video/'));
  const isAudioPreview = Boolean(previewType && previewType.startsWith('audio/'));
  const typeLabel = isImagePreview ? '画像' : isVideoPreview ? '動画' : isAudioPreview ? '音声' : '不明な形式';
  const assetName = preview.name ?? itemName;
  const { className: rarityClassName, style: rarityStyle } = getRarityTextPresentation(rarityColor);

  return (
    <>
      <ModalBody className="flex flex-1 flex-col gap-6 space-y-0 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{typeLabel}</span>
          <span
            className={clsx('rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold', rarityClassName)}
            style={rarityStyle}
          >
            {rarityLabel}
          </span>
        </div>
        {assetName ? (
          <p className="text-sm text-muted-foreground">{assetName}</p>
        ) : null}
        <div className="relative flex h-[min(70vh,720px)] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
          {isImagePreview && previewUrl ? (
            <img src={previewUrl} alt={itemName} className="max-h-full w-auto max-w-full object-contain" />
          ) : isVideoPreview && previewUrl ? (
            <video controls src={previewUrl} className="max-h-full w-full max-w-full rounded-xl bg-black" />
          ) : isAudioPreview && previewUrl ? (
            <div className="flex w-full max-w-2xl flex-col items-center gap-4">
              <MusicalNoteIcon className="h-16 w-16 text-muted-foreground" />
              <audio controls src={previewUrl} className="w-full" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <PhotoIcon className="h-16 w-16" />
              <p className="text-sm">プレビューを表示できません。</p>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
