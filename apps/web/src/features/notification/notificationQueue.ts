export type NotificationVariant = 'success' | 'warning' | 'error';

export interface NotifyOptions {
  id?: string;
  title?: string;
  message: string;
  variant: NotificationVariant;
  durationMs?: number;
  dismissible?: boolean;
}

export interface GlobalNotificationItem {
  id: string;
  title?: string;
  message: string;
  variant: NotificationVariant;
  durationMs: number;
  dismissible: boolean;
  createdAt: number;
}

export interface UpsertNotificationQueueResult {
  queue: GlobalNotificationItem[];
  removedIds: string[];
}

export const MAX_GLOBAL_NOTIFICATIONS = 3;

export const DEFAULT_NOTIFICATION_DURATION_MS: Record<NotificationVariant, number> = {
  success: 4000,
  warning: 5000,
  error: 7000
};

export function resolveNotificationDuration(variant: NotificationVariant, durationMs?: number): number {
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
    return durationMs;
  }
  return DEFAULT_NOTIFICATION_DURATION_MS[variant];
}

export function normalizeNotificationId(inputId: string | undefined, sequence: number): string {
  if (typeof inputId === 'string') {
    const trimmed = inputId.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return `global-notification-${Date.now()}-${sequence}`;
}

export function upsertNotificationQueue(
  currentQueue: GlobalNotificationItem[],
  nextItem: GlobalNotificationItem,
  maxVisible: number = MAX_GLOBAL_NOTIFICATIONS
): UpsertNotificationQueueResult {
  const withoutDuplicate = currentQueue.filter((item) => item.id !== nextItem.id);
  const merged = [...withoutDuplicate, nextItem];

  if (maxVisible <= 0 || merged.length <= maxVisible) {
    return {
      queue: merged,
      removedIds: currentQueue.filter((item) => item.id === nextItem.id).map((item) => item.id)
    };
  }

  const overflowCount = merged.length - maxVisible;
  const removed = merged.slice(0, overflowCount);
  return {
    queue: merged.slice(overflowCount),
    removedIds: removed.map((item) => item.id)
  };
}
