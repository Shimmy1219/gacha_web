import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { type LivePasteGachaConflict } from '../../features/realtime/logic/livePaste';

export interface LivePasteGachaPickerDialogPayload {
  conflicts: LivePasteGachaConflict[];
  onResolve?: (selection: Record<string, string>) => Promise<boolean | void> | boolean | void;
  helperText?: string;
}

export function LivePasteGachaPickerDialog({
  payload,
  close
}: ModalComponentProps<LivePasteGachaPickerDialogPayload>): JSX.Element {
  const conflicts = payload?.conflicts ?? [];
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allSelected = conflicts.every((conflict) => Boolean(selection[conflict.gachaName]));

  const handleSelect = (gachaName: string, gachaId: string) => {
    setSelection((prev) => ({ ...prev, [gachaName]: gachaId }));
  };

  const handleConfirm = async () => {
    if (!allSelected || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await payload?.onResolve?.(selection);
      if (result !== false) {
        close();
      }
    } catch (error) {
      console.error('ガチャ選択の確定に失敗しました', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalBody className="space-y-6">
        <div className="text-xs leading-relaxed text-muted-foreground">
          {payload?.helperText ?? '同名のガチャが存在します。反映先のガチャを選択してください。'}
        </div>
        <div className="space-y-6">
          {conflicts.map((conflict, conflictIndex) => {
            const groupName = `gacha-${conflictIndex}`;
            return (
              <section key={conflict.gachaName} className="space-y-3 rounded-2xl border border-border/60 bg-surface/70 p-4">
                <header className="space-y-1">
                  <h3 className="text-sm font-semibold text-surface-foreground">
                    {conflict.gachaName || '名称未設定のガチャ'}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    対象のガチャを1つ選択してください。
                  </p>
                </header>
                <div className="space-y-2">
                  {conflict.candidates.map((candidate) => {
                    const inputId = `${groupName}-${candidate.id}`;
                    const isChecked = selection[conflict.gachaName] === candidate.id;
                    return (
                      <label
                        key={candidate.id}
                        htmlFor={inputId}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-panel/60 px-4 py-3 text-sm shadow transition hover:border-accent/40 hover:bg-panel/80"
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name={groupName}
                          value={candidate.id}
                          checked={isChecked}
                          onChange={() => handleSelect(conflict.gachaName, candidate.id)}
                          className="mt-1 h-4 w-4 text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        <div className="space-y-1 text-xs leading-relaxed">
                          <p className="text-sm font-medium text-surface-foreground">{candidate.displayName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            ID: <span className="font-mono">{candidate.id}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            更新日:{' '}
                            <span className="font-mono">
                              {candidate.updatedAt ?? candidate.createdAt ?? '---'}
                            </span>
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close} disabled={isSubmitting}>
          戻る
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!allSelected || isSubmitting}
        >
          {isSubmitting ? '反映中…' : 'このガチャに反映する'}
        </button>
      </ModalFooter>
    </>
  );
}
