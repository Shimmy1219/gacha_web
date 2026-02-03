import { useEffect, useMemo, useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { REAL_GOODS_TYPE_SUGGESTIONS } from './riaguTypeSuggestions';

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
const KANJI_REPLACEMENTS: Array<[string, string]> = [
  ['下敷き', 'したじき'],
  ['巾着', 'きんちゃく'],
  ['帽子', 'ぼうし'],
  ['靴下', 'くつした'],
  ['抱き枕', 'だきまくら'],
  ['箸', 'はし'],
  ['食器', 'しょっき'],
  ['色紙', 'しきし'],
  ['缶', 'かん']
];

const normalizeSuggestionText = (value: string) => {
  const lowered = value.trim().toLowerCase();
  const replaced = KANJI_REPLACEMENTS.reduce((accumulator, [target, replacement]) => {
    if (!accumulator.includes(target)) {
      return accumulator;
    }
    return accumulator.replaceAll(target, replacement);
  }, lowered);
  const kanaConverted = replaced.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
  return kanaConverted.replace(/[\s/／・]/g, '').replace(/[-‐‑–—]/g, '');
};

export function RiaguConfigDialog({ payload, close }: ModalComponentProps<RiaguConfigDialogPayload>): JSX.Element {
  const { riagu: riaguStore } = useDomainStores();
  const [price, setPrice] = useState<string>(
    payload?.defaultPrice !== undefined && payload?.defaultPrice !== null ? String(payload.defaultPrice) : ''
  );
  const [type, setType] = useState<string>(payload?.defaultType ?? '');
  const normalizedTypeInput = useMemo(() => normalizeSuggestionText(type), [type]);
  const typeSuggestions = useMemo(() => {
    if (!normalizedTypeInput) {
      return REAL_GOODS_TYPE_SUGGESTIONS;
    }
    return REAL_GOODS_TYPE_SUGGESTIONS.filter((suggestion) => {
      const keys = [suggestion.label, ...(suggestion.aliases ?? [])];
      return keys.some((key) => normalizeSuggestionText(key).includes(normalizedTypeInput));
    });
  }, [normalizedTypeInput]);

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
      <ModalBody className="riagu-config-dialog__body rounded-2xl bg-surface/20 p-0 md:pr-0">
        <p className="riagu-config-dialog__target-row flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="riagu-config-dialog__target-label shrink-0">対象アイテム:</span>
          <span className="riagu-config-dialog__target-name min-w-0 flex-1 truncate font-medium text-surface-foreground">
            {payload?.itemName ?? '-'}
          </span>
        </p>
        <div className="riagu-config-dialog__price-section space-y-4">
          <label className="riagu-config-dialog__field riagu-config-dialog__field--price space-y-2">
            <span className="riagu-config-dialog__field-label text-sm font-medium text-surface-foreground">発注価格（円）</span>
            <input
              type="number"
              min={0}
              step="any"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={`riagu-config-dialog__input riagu-config-dialog__input--price ${INPUT_CLASSNAME}`}
              placeholder="300"
            />
          </label>
        </div>
        <div className="riagu-config-dialog__type-section mt-4 space-y-4">
          <label className="riagu-config-dialog__field riagu-config-dialog__field--type space-y-2">
            <span className="riagu-config-dialog__field-label text-sm font-medium text-surface-foreground">リアルグッズタイプ</span>
            <input
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className={`riagu-config-dialog__input riagu-config-dialog__input--type ${INPUT_CLASSNAME}`}
              placeholder="アクリルスタンド / 缶バッジ など"
            />
          </label>
          <div className="riagu-config-dialog__suggestions space-y-1">
            <p className="riagu-config-dialog__suggestions-label text-xs font-semibold text-muted-foreground">候補</p>
            <div className="riagu-config-dialog__suggestion-list flex max-h-[64px] min-h-[64px] flex-wrap content-start gap-2 overflow-hidden">
              {typeSuggestions.length > 0 ? (
                typeSuggestions.map((suggestion) => {
                  const normalizedKeys = [suggestion.label, ...(suggestion.aliases ?? [])].map(normalizeSuggestionText);
                  const isSelected = normalizedKeys.includes(normalizedTypeInput);
                  return (
                    <button
                      key={suggestion.label}
                      type="button"
                      onClick={() => setType(suggestion.label)}
                      className={`riagu-config-dialog__suggestion-chip inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent/40 ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border/60 text-muted-foreground hover:border-accent hover:text-accent'
                      }`}
                    >
                      {suggestion.label}
                    </button>
                  );
                })
              ) : normalizedTypeInput ? (
                <p className="riagu-config-dialog__suggestion-empty text-xs text-muted-foreground">一致する候補はありません。</p>
              ) : null}
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter className="riagu-config-dialog__footer">
        <button type="button" className="riagu-config-dialog__save-button btn btn-primary" onClick={handleSave}>
          保存する
        </button>
        <button type="button" className="riagu-config-dialog__close-button btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}
