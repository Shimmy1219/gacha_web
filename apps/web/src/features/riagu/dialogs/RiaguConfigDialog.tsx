import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';

export interface RiaguConfigDialogPayload {
  itemId: string;
  itemName: string;
  defaultPrice?: number;
  defaultType?: string;
  onSave?: (data: { itemId: string; price: number | null; type: string }) => void;
  onRemove?: (itemId: string) => void;
}

const INPUT_CLASSNAME =
  'w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30';

export function RiaguConfigDialog({ payload, close }: ModalComponentProps<RiaguConfigDialogPayload>): JSX.Element {
  const [price, setPrice] = useState<string>(
    payload?.defaultPrice !== undefined && payload?.defaultPrice !== null ? String(payload.defaultPrice) : ''
  );
  const [type, setType] = useState<string>(payload?.defaultType ?? '');

  const handleSave = () => {
    if (!payload) {
      close();
      return;
    }

    const parsedPrice = price ? Number(price) : null;
    payload.onSave?.({
      itemId: payload.itemId,
      price: parsedPrice,
      type
    });
    console.info('リアグ設定の保存（ダミー）', {
      itemId: payload.itemId,
      price: parsedPrice,
      type
    });
    close();
  };

  const handleRemove = () => {
    if (!payload) {
      close();
      return;
    }

    payload.onRemove?.(payload.itemId);
    console.info('リアグ設定の解除（ダミー）', payload.itemId);
    close();
  };

  return (
    <>
      <ModalBody className="space-y-5">
        <p className="text-sm text-muted-foreground">
          対象アイテム: <span className="font-medium text-surface-foreground">{payload?.itemName ?? '-'}</span>
        </p>
        <div className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-foreground">原価（円）</span>
            <input
              type="number"
              min={0}
              step={10}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={INPUT_CLASSNAME}
              placeholder="300"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-foreground">リアルグッズタイプ</span>
            <input
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className={INPUT_CLASSNAME}
              placeholder="アクリルスタンド / 缶バッジ など"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            リアグ情報はガチャの保存オプションに含まれ、共有ZIPにも出力されます。
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          保存する
        </button>
        {payload?.onRemove ? (
          <button
            type="button"
            className="btn border border-border/60 bg-transparent text-xs text-muted-foreground transition hover:border-accent/60 hover:text-surface-foreground"
            onClick={handleRemove}
          >
            リアグ解除
          </button>
        ) : null}
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
