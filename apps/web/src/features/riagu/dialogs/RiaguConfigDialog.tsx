import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';
import { useDomainStores } from '../../storage/AppPersistenceProvider';

export interface RiaguConfigDialogPayload {
  gachaId: string;
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
  const { riagu: riaguStore } = useDomainStores();
  const [price, setPrice] = useState<string>(
    payload?.defaultPrice !== undefined && payload?.defaultPrice !== null ? String(payload.defaultPrice) : ''
  );
  const [type, setType] = useState<string>(payload?.defaultType ?? '');

  const handleSave = () => {
    if (!payload) {
      close();
      return;
    }

    const normalizedPrice = price.trim();
    const parsedNumber = normalizedPrice ? Number(normalizedPrice) : null;
    const parsedPrice = typeof parsedNumber === 'number' && Number.isFinite(parsedNumber) ? parsedNumber : null;
    const normalizedType = type.trim();

    riaguStore.upsertCard(
      {
        itemId: payload.itemId,
        gachaId: payload.gachaId,
        unitCost: parsedPrice,
        typeLabel: normalizedType || null
      },
      { persist: 'debounced' }
    );

    payload.onSave?.({
      itemId: payload.itemId,
      price: parsedPrice,
      type: normalizedType
    });
    close();
  };

  const handleRemove = () => {
    if (!payload) {
      close();
      return;
    }

    riaguStore.removeByItemId(payload.itemId, { persist: 'debounced' });
    payload.onRemove?.(payload.itemId);
    close();
  };

  return (
    <>
      <ModalBody className="rounded-2xl bg-surface/20 p-6">
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
        </div>
      </ModalBody>
      <p className="modal-description mt-6 w-full text-xs text-muted-foreground">
        リアグ情報はガチャの保存オプションに含まれ、共有ZIPにも出力されます。
      </p>
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
