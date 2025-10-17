import { PhotoIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { SwitchField } from '../../../components/form/SwitchField';
import { ConfirmDialog, ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';
import { type RiaguConfigDialogPayload, RiaguConfigDialog } from '../../riagu/dialogs/RiaguConfigDialog';

interface RarityOption {
  id: string;
  label: string;
}

export interface PrizeSettingsDialogPayload {
  itemId: string;
  itemName: string;
  gachaName: string;
  rarityId: string;
  rarityLabel: string;
  rarityOptions: RarityOption[];
  pickupTarget: boolean;
  completeTarget: boolean;
  isRiagu: boolean;
  thumbnailUrl: string | null;
  rarityColor?: string;
  riaguPrice?: number;
  riaguType?: string;
  onSave?: (data: {
    itemId: string;
    name: string;
    rarityId: string;
    pickupTarget: boolean;
    completeTarget: boolean;
    file: File | null;
  }) => void;
}

const INPUT_CLASSNAME =
  'w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30';

export function PrizeSettingsDialog({ payload, close, push }: ModalComponentProps<PrizeSettingsDialogPayload>): JSX.Element {
  const initialState = useMemo(
    () => ({
      name: payload?.itemName ?? '',
      rarityId: payload?.rarityId ?? '',
      pickup: payload?.pickupTarget ?? false,
      complete: payload?.completeTarget ?? false,
      thumbnailUrl: payload?.thumbnailUrl ?? null
    }),
    [payload]
  );

  const [name, setName] = useState(initialState.name);
  const [rarityId, setRarityId] = useState(initialState.rarityId);
  const [pickupTarget, setPickupTarget] = useState(initialState.pickup);
  const [completeTarget, setCompleteTarget] = useState(initialState.complete);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const currentPreview = previewUrl ?? payload?.thumbnailUrl ?? null;

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (file) {
      const nextUrl = URL.createObjectURL(file);
      setPreviewUrl(nextUrl);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleFileChange(file);
  };

  const handleClearImage = () => {
    handleFileChange(null);
  };

  const hasChanges =
    name !== initialState.name ||
    rarityId !== initialState.rarityId ||
    pickupTarget !== initialState.pickup ||
    completeTarget !== initialState.complete ||
    selectedFile !== null;

  const handleSave = () => {
    if (!payload) {
      close();
      return;
    }

    payload.onSave?.({
      itemId: payload.itemId,
      name,
      rarityId,
      pickupTarget,
      completeTarget,
      file: selectedFile
    });

    console.info('景品設定の保存（ダミー）', {
      itemId: payload.itemId,
      name,
      rarityId,
      pickupTarget,
      completeTarget,
      file: selectedFile?.name ?? null
    });

    close();
  };

  const handleRequestClose = () => {
    if (!hasChanges) {
      close();
      return;
    }

    push(ConfirmDialog, {
      id: `${payload?.itemId ?? 'prize'}-confirm-close`,
      title: '変更を破棄しますか？',
      size: 'sm',
      payload: {
        message: '保存されていない変更があります。破棄すると直前の状態に戻ります。',
        confirmLabel: '破棄する',
        cancelLabel: '編集に戻る',
        onConfirm: () => {
          close();
        }
      }
    });
  };

  const handleOpenRiaguDialog = () => {
    if (!payload) {
      return;
    }

    const riaguPayload: RiaguConfigDialogPayload = {
      itemId: payload.itemId,
      itemName: payload.itemName,
      defaultPrice: payload.riaguPrice,
      defaultType: payload.riaguType,
      onRemove: () => {
        console.info('リアグ設定の解除（ダミー）', payload.itemId);
      },
      onSave: (data) => {
        console.info('リアグ設定の保存（ダミー）', data);
      }
    };

    push(RiaguConfigDialog, {
      id: `${payload.itemId}-riagu`,
      title: 'リアルグッズ設定',
      size: 'sm',
      payload: riaguPayload
    });
  };

  return (
    <>
      <ModalBody className="rounded-2xl bg-surface/20 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="flex-1 space-y-2">
            <span className="block text-sm font-medium text-surface-foreground">対象アイテム</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={INPUT_CLASSNAME}
              placeholder="煌めく星屑ブレスレット"
            />
          </label>
          <div className="flex w-full flex-col gap-2 lg:max-w-[14rem]">
            <span className="text-sm font-medium text-surface-foreground">レアリティ</span>
            <select
              value={rarityId}
              onChange={(event) => setRarityId(event.target.value)}
              className={INPUT_CLASSNAME}
            >
              {payload?.rarityOptions?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[240px,minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-border/50 p-4">
              <p className="text-xs font-medium text-muted-foreground">プレビュー</p>
              <div className="mt-3 grid gap-4 lg:grid-cols-1">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border border-border/60">
                    {currentPreview ? (
                      <img src={currentPreview} alt="プレビュー" className="h-full w-full object-cover" />
                    ) : (
                      <PhotoIcon className="h-12 w-12 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-semibold text-surface-foreground">{name || '未設定'}</p>
                    <span
                      className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ backgroundColor: `${payload?.rarityColor ?? '#ff4f89'}30`, color: payload?.rarityColor ?? '#ff4f89' }}
                    >
                      {payload?.rarityLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-dashed border-border/60 p-5">
              <p className="text-sm font-medium text-surface-foreground">画像ファイルを選択</p>
              <p className="mt-2 text-xs text-muted-foreground">透過PNG / JPG / WEBP に対応。880px以上の正方形を推奨します。</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-2 rounded-xl border border-accent/60 bg-accent/20 px-3 py-2 text-sm font-semibold text-accent">
                  <PlusCircleIcon className="h-4 w-4" />
                  ファイルを選ぶ
                  <input type="file" accept="image/*" className="sr-only" onChange={handleFileInputChange} />
                </label>
                {selectedFile ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
                    onClick={handleClearImage}
                  >
                    <XMarkIcon className="h-4 w-4" />
                    取り消す
                  </button>
                ) : null}
              </div>
              {selectedFile ? (
                <p className="mt-2 text-xs text-muted-foreground">選択中: {selectedFile.name}</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <SwitchField
                  label="ピックアップ対象"
                  description="ピックアップ一覧に表示します"
                  checked={pickupTarget}
                  onChange={setPickupTarget}
                  name="pickupTarget"
                />
                <SwitchField
                  label="コンプリート対象"
                  description="コンプリート判定に含めます"
                  checked={completeTarget}
                  onChange={setCompleteTarget}
                  name="completeTarget"
                />
              </div>
            </div>
          </div>
        </div>
      </ModalBody>
      <p className="modal-description mt-6 w-full text-xs text-muted-foreground">
        画像を保存すると、自動的にカタログの該当アイテムへ反映されます。ZIP出力時は最新の画像が含まれます。
      </p>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          保存する
        </button>
        <button
          type="button"
          className="btn border border-accent/60 bg-accent/10 text-accent transition hover:border-accent hover:bg-accent/20"
          onClick={handleOpenRiaguDialog}
        >
          リアグとして設定
        </button>
        <button type="button" className="btn btn-muted" onClick={handleRequestClose}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
