import { useEffect, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';

export interface RiaguConfigDialogPayload {
  gachaId: string;
  itemId: string;
  itemName: string;
  defaultPrice?: number;
  defaultType?: string;
  onSave?: (data: { itemId: string; price: number | null; type: string }) => void;
}

const INPUT_CLASSNAME =
  'w-full rounded-xl border border-border/60 bg-surface/30 px-3 py-2 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/30';

export function RiaguConfigDialog({ payload, close }: ModalComponentProps<RiaguConfigDialogPayload>): JSX.Element {
  const { riagu: riaguStore } = useDomainStores();
  const [price, setPrice] = useState<string>(
    payload?.defaultPrice !== undefined && payload?.defaultPrice !== null ? String(payload.defaultPrice) : ''
  );
  const [type, setType] = useState<string>(payload?.defaultType ?? '');

  useEffect(() => {
    const itemId = payload?.itemId;
    if (!itemId) {
      setPrice('');
      setType('');
      return;
    }

    const fallbackPrice = (() => {
      const value = payload?.defaultPrice;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    })();
    const fallbackType = payload?.defaultType ?? '';

    const unsubscribe = riaguStore.subscribe((state) => {
      const riaguId = state?.indexByItemId?.[itemId];
      const card = riaguId ? state?.riaguCards?.[riaguId] : undefined;
      const hasCard = Boolean(card);

      const resolvedPrice = hasCard
        ? card && typeof card.unitCost === 'number' && Number.isFinite(card.unitCost)
          ? card.unitCost
          : null
        : fallbackPrice;
      const resolvedType = hasCard ? card?.typeLabel ?? '' : fallbackType;

      const nextPriceValue =
        resolvedPrice !== undefined && resolvedPrice !== null ? String(resolvedPrice) : '';
      const nextTypeValue = resolvedType ?? '';

      setPrice((previous) => (previous === nextPriceValue ? previous : nextPriceValue));
      setType((previous) => (previous === nextTypeValue ? previous : nextTypeValue));
    });

    return () => {
      unsubscribe();
    };
  }, [payload?.itemId, payload?.defaultPrice, payload?.defaultType, riaguStore]);

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

  return (
    <>
      <ModalBody className="rounded-2xl bg-surface/20 p-0 md:pr-0">
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="shrink-0">対象アイテム:</span>
          <span className="min-w-0 flex-1 truncate font-medium text-surface-foreground">
            {payload?.itemName ?? '-'}
          </span>
        </p>
        <div className="space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-foreground">発注価格（円）</span>
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
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
