import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '../../../components/modal';

export interface LivePasteDialogPayload {
  defaultValue?: string;
  onApply?: (value: string) => void;
  helperText?: string;
}

export function LivePasteDialog({ payload, close }: ModalComponentProps<LivePasteDialogPayload>): JSX.Element {
  const [value, setValue] = useState(payload?.defaultValue ?? '');

  return (
    <>
      <ModalBody className="space-y-4">
        <div className="text-xs leading-relaxed text-muted-foreground">
          {payload?.helperText ?? (
            <span>
              形式例：<span className="kbd font-mono text-[11px]">ガチャ名</span> →{' '}
              <span className="kbd font-mono text-[11px]">名前100連</span> →{' '}
              <span className="kbd font-mono text-[11px]">【R】C 4個</span> … →{' '}
              <span className="kbd font-mono text-[11px]">#なまずつーるず</span>
            </span>
          )}
        </div>
        <textarea
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder="ここに結果テキストを貼り付け（複数ブロック可）"
          className="min-h-[220px] w-full rounded-xl border border-border/60 bg-[#111119] px-3 py-3 text-sm text-surface-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            payload?.onApply?.(value);
            close();
          }}
        >
          <ClipboardDocumentCheckIcon className="h-5 w-5" />
          反映する
        </button>
      </ModalFooter>
    </>
  );
}
