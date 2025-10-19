import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';

export interface RarityInUseDialogPayload {
  rarityLabel?: string;
  affectedCount?: number;
  itemNames?: string[];
  confirmLabel?: string;
  message?: string;
}

export function RarityInUseDialog({ payload, close }: ModalComponentProps<RarityInUseDialogPayload>): JSX.Element {
  const { rarityLabel, affectedCount, itemNames, confirmLabel, message } = useMemo(() => {
    const label = payload?.rarityLabel ?? 'このレアリティ';
    const items = payload?.itemNames?.filter((name) => name.trim().length > 0) ?? [];
    const count = typeof payload?.affectedCount === 'number' ? payload?.affectedCount : items.length;

    return {
      rarityLabel: label,
      affectedCount: count,
      itemNames: items,
      confirmLabel: payload?.confirmLabel ?? '分かった',
      message: payload?.message
    };
  }, [payload]);

  const displayedItems = useMemo(() => itemNames.slice(0, 5), [itemNames]);
  const hasOverflow = itemNames.length > displayedItems.length;

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-warning-foreground">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5" aria-hidden="true" />
          <div className="space-y-2">
            <p>
              {rarityLabel}
              {affectedCount > 0 ? ` は現在${affectedCount}件のアイテムで使用されています。` : ' はアイテムで使用されています。'}
              削除する前に、アイテムからこのレアリティの設定を外してください。
            </p>
            {displayedItems.length > 0 ? (
              <ul className="list-inside list-disc space-y-1 text-xs text-warning-foreground/90">
                {displayedItems.map((name) => (
                  <li key={name}>{name}</li>
                ))}
                {hasOverflow ? <li>…ほか {itemNames.length - displayedItems.length} 件</li> : null}
              </ul>
            ) : null}
            {message ? <p className="text-xs text-warning-foreground/80">{message}</p> : null}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-primary" onClick={close}>
          {confirmLabel}
        </button>
      </ModalFooter>
    </>
  );
}
