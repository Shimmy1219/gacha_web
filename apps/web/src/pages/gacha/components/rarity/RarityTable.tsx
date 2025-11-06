import { clsx } from 'clsx';
import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent
} from 'react';

import { RarityColorPicker } from './color-picker/RarityColorPicker';
import { getRarityTextPresentation } from '../../../../features/rarity/utils/rarityColorPresentation';

interface RarityLabelFieldProps {
  value: string;
  gradientClassName?: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
  onValueChange?: (nextValue: string) => void;
}

function RarityLabelField({
  value,
  gradientClassName,
  className,
  style,
  placeholder,
  ariaLabel,
  onValueChange
}: RarityLabelFieldProps): JSX.Element {
  const editableRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = editableRef.current;
    if (!node) {
      return;
    }

    if (node.textContent !== value) {
      node.textContent = value;
    }
  }, [value]);

  const handleInput = (event: FormEvent<HTMLSpanElement>) => {
    const nextValue = event.currentTarget.textContent ?? '';
    onValueChange?.(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain');
    if (!text) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    selection.deleteFromDocument();
    const range = selection.getRangeAt(0);
    range.insertNode(document.createTextNode(text));
    range.collapse(false);

    const node = editableRef.current;
    if (!node) {
      return;
    }

    onValueChange?.(node.textContent ?? '');
  };

  const displayGradientClass = gradientClassName && value ? gradientClassName : undefined;

  return (
    <span
      ref={editableRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={false}
      spellCheck={false}
      tabIndex={0}
      data-placeholder={placeholder}
      className={clsx(
        'rarity-section__label-field block w-full rounded-xl border border-border/60 bg-panel-contrast px-3 py-2 text-base font-semibold text-surface-foreground transition focus:border-accent focus:outline-none',
        'whitespace-pre-wrap break-words',
        displayGradientClass,
        className
      )}
      style={style}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}

export interface RarityTableRow {
  id: string;
  label: string;
  color: string;
  emitRateInput: string;
  placeholder?: string;
  ariaLabel?: string;
  emitRateAriaLabel?: string;
  isEmitRateReadOnly?: boolean;
}

interface RarityTableProps {
  rows: RarityTableRow[];
  onLabelChange?: (rarityId: string, label: string) => void;
  onColorChange?: (rarityId: string, color: string) => void;
  onEmitRateChange?: (rarityId: string, value: string) => void;
  onEmitRateCommit?: (rarityId: string) => void;
  onDelete?: (rarityId: string) => void;
  onAdd?: () => void;
  canDeleteRow?: (rarityId: string) => boolean;
}

export function RarityTable({
  rows,
  onLabelChange,
  onColorChange,
  onEmitRateChange,
  onEmitRateCommit,
  onDelete,
  onAdd,
  canDeleteRow
}: RarityTableProps): JSX.Element {
  return (
    <div className="rarity-section__table-wrapper rounded-2xl border border-border/60 bg-panel shadow-sm">
      <table className="rarity-section__table w-full border-separate border-spacing-0 divide-y divide-border/60 text-left">
        <colgroup>
          <col className="rarity-section__col rarity-section__col-label" />
          <col className="rarity-section__col rarity-section__col-color" />
          <col className="rarity-section__col rarity-section__col-rate" />
          <col className="rarity-section__col rarity-section__col-actions" />
        </colgroup>
        <thead className="rarity-section__table-head bg-panel-contrast/90 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <tr>
            <th className="rarity-section__column rarity-section__column-label px-[3px] py-2.5 font-semibold">
              レアリティ
            </th>
            <th className="rarity-section__column rarity-section__column-color py-2.5 font-semibold">カラー</th>
            <th className="rarity-section__column rarity-section__column-rate py-2.5 font-semibold">排出率</th>
            <th className="rarity-section__column rarity-section__column-actions py-2.5" />
          </tr>
        </thead>
        <tbody className="rarity-section__table-body divide-y divide-border/40 bg-panel-muted">
          {rows.map((row) => {
            const presentation = getRarityTextPresentation(row.color);
            const deletable = onDelete && (canDeleteRow ? canDeleteRow(row.id) : true);
            const label = row.label;
            const ariaLabel = row.ariaLabel ?? `${label || row.id} のレアリティ名`;
            return (
              <tr key={row.id} className="rarity-section__row text-sm text-surface-foreground">
                <td className="rarity-section__cell rarity-section__cell-label px-1 py-2">
                  <RarityLabelField
                    value={label}
                    onValueChange={(next) => onLabelChange?.(row.id, next)}
                    className="rarity-section__label-input"
                    gradientClassName={presentation.className}
                    style={presentation.style}
                    ariaLabel={ariaLabel}
                    placeholder={row.placeholder ?? row.id}
                  />
                </td>
                <td className="rarity-section__cell rarity-section__cell-color px-1 py-2">
                  <RarityColorPicker
                    value={row.color}
                    ariaLabel={`${label || row.id} のカラー`}
                    onChange={(next) => onColorChange?.(row.id, next)}
                  />
                </td>
                <td className="rarity-section__cell rarity-section__cell-rate px-1 py-2">
                  <div className="rarity-section__rate-control flex flex-nowrap items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="decimal"
                      step="any"
                      value={row.emitRateInput}
                      onChange={(event) => onEmitRateChange?.(row.id, event.target.value)}
                      onBlur={() => onEmitRateCommit?.(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      className="rarity-section__rate-input w-full rounded-xl border border-border/60 bg-panel-contrast px-3 py-2 text-sm text-surface-foreground focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={row.emitRateAriaLabel ?? `${label || row.id} の排出率`}
                      title={row.isEmitRateReadOnly ? '排出率は自動で調整されます' : undefined}
                      disabled={row.isEmitRateReadOnly}
                    />
                    <span className="rarity-section__rate-unit text-xs text-muted-foreground">%</span>
                  </div>
                </td>
                <td className="rarity-section__cell rarity-section__cell-actions px-1 py-2 text-right">
                  <button
                    type="button"
                    className="rarity-section__delete-button inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-border/70 bg-panel-contrast px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:bg-panel-muted hover:text-surface-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onDelete?.(row.id)}
                    disabled={!deletable}
                  >
                    削除
                  </button>
                </td>
              </tr>
            );
          })}
          <tr className="rarity-section__add-row">
            <td className="rarity-section__cell px-1 py-3" colSpan={4}>
              <button
                type="button"
                className="rarity-section__add-button inline-flex w-full items-center justify-center rounded-xl border border-border/70 bg-panel-contrast px-3 py-2 text-sm text-muted-foreground transition hover:border-accent/60 hover:bg-panel-muted hover:text-surface-foreground disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onAdd}
                disabled={!onAdd}
              >
                追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
