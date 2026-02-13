import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { type ReleaseNoteEntry } from '../../content/releaseNotes';

export interface ReleaseNotesDialogPayload {
  entries?: ReleaseNoteEntry[];
  closeLabel?: string;
}

function formatReleaseDate(dateLabel: string): string {
  const parsedAt = Date.parse(dateLabel);
  if (Number.isNaN(parsedAt)) {
    return dateLabel;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(parsedAt));
}

function toReleaseEntryDomId(entryId: string): string {
  return `release-notes-dialog-entry-${entryId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function ReleaseNotesDialog({ payload, close }: ModalComponentProps<ReleaseNotesDialogPayload>): JSX.Element {
  const entries = useMemo(() => payload?.entries ?? [], [payload?.entries]);
  const closeLabel = payload?.closeLabel ?? '閉じる';

  return (
    <>
      <ModalBody className="release-notes-dialog__body max-h-[55vh] space-y-5 md:max-h-[60vh]">
        <div className="release-notes-dialog__entries space-y-4">
          {entries.map((entry) => (
            <section
              key={entry.id}
              id={toReleaseEntryDomId(entry.id)}
              className="release-notes-dialog__entry rounded-2xl border border-white/10 bg-surface/60 p-4"
            >
              <div className="release-notes-dialog__entry-header mb-3 space-y-1">
                <h3 className="release-notes-dialog__entry-title text-base font-semibold text-surface-foreground">
                  {entry.title}
                </h3>
                <p className="release-notes-dialog__entry-date text-xs text-muted-foreground">
                  公開日: {formatReleaseDate(entry.publishedAt)}
                </p>
              </div>
              <ul className="release-notes-dialog__entry-list space-y-2">
                {entry.items.map((item, index) => (
                  <li key={`${entry.id}-${index}`} className="release-notes-dialog__entry-item flex gap-2 text-sm">
                    <span className="release-notes-dialog__entry-bullet mt-[2px] text-accent" aria-hidden="true">
                      ●
                    </span>
                    <span className="release-notes-dialog__entry-text leading-relaxed text-muted-foreground">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {entries.length === 0 ? (
            <div className="release-notes-dialog__empty rounded-2xl border border-dashed border-white/10 px-4 py-6">
              <p className="release-notes-dialog__empty-text text-sm text-muted-foreground">
                表示できる更新情報はありません。
              </p>
            </div>
          ) : null}
        </div>
      </ModalBody>
      <ModalFooter className="release-notes-dialog__footer">
        <button type="button" className="release-notes-dialog__close-button btn btn-primary" onClick={close}>
          {closeLabel}
        </button>
      </ModalFooter>
    </>
  );
}
