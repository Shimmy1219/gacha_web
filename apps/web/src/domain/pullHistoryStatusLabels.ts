import type { PullHistoryEntryStatus } from './app-persistence';

export const PULL_HISTORY_STATUS_LABELS: Record<PullHistoryEntryStatus, string> = {
  new: 'new',
  ziped: 'zip出力済み',
  uploaded: 'URL発行済み',
  discord_shared: 'Discord共有済み'
};

const PARTIAL_STATUS_LABEL = '一部未送信';

export function getPullHistoryStatusLabel(
  status: PullHistoryEntryStatus | null | undefined,
  options?: { hasOriginalPrizeMissing?: boolean }
): string | null {
  const labels: string[] = [];
  if (status) {
    const baseLabel = PULL_HISTORY_STATUS_LABELS[status];
    if (baseLabel) {
      labels.push(baseLabel);
    }
  }
  if (options?.hasOriginalPrizeMissing) {
    labels.push(PARTIAL_STATUS_LABEL);
  }
  return labels.length > 0 ? labels.join(' / ') : null;
}
