import type { PullHistoryEntryStatus } from './app-persistence';

export const PULL_HISTORY_STATUS_LABELS: Record<PullHistoryEntryStatus, string> = {
  new: 'new',
  ziped: 'zip出力済み',
  uploaded: 'URL発行済み'
};

export function getPullHistoryStatusLabel(
  status: PullHistoryEntryStatus | null | undefined
): string | null {
  if (!status) {
    return null;
  }
  return PULL_HISTORY_STATUS_LABELS[status] ?? null;
}
