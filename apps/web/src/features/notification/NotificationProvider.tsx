import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PropsWithChildren
} from 'react';
import { createPortal } from 'react-dom';

import { useHaptics } from '../haptics/HapticsProvider';
import {
  normalizeNotificationId,
  resolveNotificationDuration,
  upsertNotificationQueue,
  type GlobalNotificationItem,
  type NotificationVariant,
  type NotifyOptions
} from './notificationQueue';

interface NotificationContextValue {
  notify: (options: NotifyOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: PropsWithChildren): JSX.Element {
  const [notifications, setNotifications] = useState<GlobalNotificationItem[]>([]);
  const notificationsRef = useRef<GlobalNotificationItem[]>([]);
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const notificationSequenceRef = useRef(0);
  const { triggerConfirmation, triggerSelection, triggerError } = useHaptics();

  const clearNotificationTimer = useCallback((id: string) => {
    const timer = timerMapRef.current.get(id);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timerMapRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearNotificationTimer(id);
      const nextNotifications = notificationsRef.current.filter((entry) => entry.id !== id);
      notificationsRef.current = nextNotifications;
      setNotifications(nextNotifications);
    },
    [clearNotificationTimer]
  );

  const dismissAll = useCallback(() => {
    timerMapRef.current.forEach((timer) => {
      clearTimeout(timer);
    });
    timerMapRef.current.clear();
    notificationsRef.current = [];
    setNotifications([]);
  }, []);

  useEffect(() => {
    return () => {
      timerMapRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      timerMapRef.current.clear();
      notificationsRef.current = [];
    };
  }, []);

  const notify = useCallback(
    (options: NotifyOptions) => {
      const nextSequence = ++notificationSequenceRef.current;
      const notificationId = normalizeNotificationId(options.id, nextSequence);
      const nextVariant = options.variant;
      const nextNotification: GlobalNotificationItem = {
        id: notificationId,
        title: options.title,
        message: options.message,
        variant: nextVariant,
        durationMs: resolveNotificationDuration(nextVariant, options.durationMs),
        dismissible: options.dismissible ?? true,
        createdAt: Date.now()
      };

      const queueUpdateResult = upsertNotificationQueue(notificationsRef.current, nextNotification);
      notificationsRef.current = queueUpdateResult.queue;
      setNotifications(queueUpdateResult.queue);

      queueUpdateResult.removedIds.forEach((id) => {
        if (id !== notificationId) {
          clearNotificationTimer(id);
        }
      });

      clearNotificationTimer(notificationId);
      if (nextNotification.durationMs > 0) {
        const timeoutHandle = setTimeout(() => {
          dismiss(notificationId);
        }, nextNotification.durationMs);
        timerMapRef.current.set(notificationId, timeoutHandle);
      }

      if (nextVariant === 'success') {
        triggerConfirmation();
      } else if (nextVariant === 'warning') {
        triggerSelection();
      } else {
        triggerError();
      }

      return notificationId;
    },
    [clearNotificationTimer, dismiss, triggerConfirmation, triggerError, triggerSelection]
  );

  const contextValue = useMemo<NotificationContextValue>(
    () => ({
      notify,
      dismiss,
      dismissAll
    }),
    [notify, dismiss, dismissAll]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <GlobalNotificationHost notifications={notifications} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

interface GlobalNotificationHostProps {
  notifications: GlobalNotificationItem[];
  onDismiss: (id: string) => void;
}

type NotificationRenderPhase = 'entering' | 'visible' | 'leaving';

interface NotificationRenderEntry {
  notification: GlobalNotificationItem;
  phase: NotificationRenderPhase;
}

const NOTIFICATION_TRANSITION_MS = 220;

function GlobalNotificationHost({ notifications, onDismiss }: GlobalNotificationHostProps): JSX.Element | null {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const [renderEntries, setRenderEntries] = useState<NotificationRenderEntry[]>([]);
  const enterRafMapRef = useRef<Map<string, number>>(new Map());
  const leaveTimerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    setPortalElement(document.body);
  }, []);

  useEffect(() => {
    setRenderEntries((previous) => {
      const latestById = new Map(notifications.map((notification) => [notification.id, notification]));
      const nextEntries: NotificationRenderEntry[] = [];
      const seenIds = new Set<string>();

      previous.forEach((entry) => {
        const latest = latestById.get(entry.notification.id);
        if (latest) {
          seenIds.add(latest.id);
          nextEntries.push({
            notification: latest,
            phase: entry.phase === 'leaving' ? 'visible' : entry.phase
          });
          return;
        }
        nextEntries.push({
          notification: entry.notification,
          phase: 'leaving'
        });
      });

      notifications.forEach((notification) => {
        if (!seenIds.has(notification.id)) {
          nextEntries.push({
            notification,
            phase: 'entering'
          });
        }
      });

      return nextEntries;
    });
  }, [notifications]);

  useEffect(() => {
    renderEntries.forEach((entry) => {
      const notificationId = entry.notification.id;

      if (entry.phase === 'entering' && !enterRafMapRef.current.has(notificationId)) {
        const rafId = window.requestAnimationFrame(() => {
          setRenderEntries((previous) =>
            previous.map((current) => {
              if (current.notification.id !== notificationId || current.phase !== 'entering') {
                return current;
              }
              return {
                notification: current.notification,
                phase: 'visible'
              };
            })
          );
          enterRafMapRef.current.delete(notificationId);
        });
        enterRafMapRef.current.set(notificationId, rafId);
      }

      if (entry.phase !== 'entering') {
        const rafId = enterRafMapRef.current.get(notificationId);
        if (typeof rafId === 'number') {
          window.cancelAnimationFrame(rafId);
          enterRafMapRef.current.delete(notificationId);
        }
      }

      if (entry.phase === 'leaving' && !leaveTimerMapRef.current.has(notificationId)) {
        const timerId = window.setTimeout(() => {
          setRenderEntries((previous) =>
            previous.filter((current) => current.notification.id !== notificationId)
          );
          leaveTimerMapRef.current.delete(notificationId);
        }, NOTIFICATION_TRANSITION_MS);
        leaveTimerMapRef.current.set(notificationId, timerId);
      }

      if (entry.phase !== 'leaving') {
        const timerId = leaveTimerMapRef.current.get(notificationId);
        if (timerId) {
          window.clearTimeout(timerId);
          leaveTimerMapRef.current.delete(notificationId);
        }
      }
    });

    const activeIds = new Set(renderEntries.map((entry) => entry.notification.id));
    leaveTimerMapRef.current.forEach((timerId, notificationId) => {
      if (!activeIds.has(notificationId)) {
        window.clearTimeout(timerId);
        leaveTimerMapRef.current.delete(notificationId);
      }
    });
    enterRafMapRef.current.forEach((rafId, notificationId) => {
      if (!activeIds.has(notificationId)) {
        window.cancelAnimationFrame(rafId);
        enterRafMapRef.current.delete(notificationId);
      }
    });
  }, [renderEntries]);

  useEffect(() => {
    return () => {
      enterRafMapRef.current.forEach((rafId) => {
        window.cancelAnimationFrame(rafId);
      });
      enterRafMapRef.current.clear();
      leaveTimerMapRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      leaveTimerMapRef.current.clear();
    };
  }, []);

  if (!portalElement || renderEntries.length === 0) {
    return null;
  }

  return createPortal(
    <div className="global-notification-root pointer-events-none fixed inset-x-0 top-0 z-[140] flex justify-center px-2 pt-[calc(env(safe-area-inset-top,0px)+0.45rem)]">
      <div className="global-notification__viewport flex w-full max-w-[min(34rem,calc(100vw-0.85rem))] flex-col">
        {renderEntries.map((entry) => {
          const notification = entry.notification;
          const titleLabel = notification.title?.trim() || resolveVariantLabel(notification.variant);
          const colorClassName = resolveVariantContainerClassName(notification.variant);
          const iconClassName = resolveVariantIconClassName(notification.variant);
          const Icon = resolveVariantIcon(notification.variant);
          const phaseClassName = resolvePhaseClassName(entry.phase);
          const wrapperPhaseClassName = resolveWrapperPhaseClassName(entry.phase);
          return (
            <div
              key={notification.id}
              className={`global-notification-toast-wrap pointer-events-auto overflow-hidden transition-[max-height,margin,opacity] duration-200 ease-out ${wrapperPhaseClassName}`}
            >
              <div
                className={`global-notification-toast flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-md backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out ${phaseClassName} ${colorClassName}`}
                data-variant={notification.variant}
                data-phase={entry.phase}
                role={notification.variant === 'error' ? 'alert' : 'status'}
                aria-live={notification.variant === 'error' ? 'assertive' : 'polite'}
              >
                <div className="global-notification-toast__icon shrink-0">
                  <Icon className={`h-4 w-4 ${iconClassName}`} />
                </div>
                <div className="global-notification-toast__content min-w-0 flex-1">
                  <p className="global-notification-toast__message truncate text-xs leading-5 text-surface-foreground/95">
                    <span className="global-notification-toast__title font-semibold text-surface-foreground">
                      {titleLabel}：
                    </span>{' '}
                    <span className="global-notification-toast__message-text">{notification.message}</span>
                  </p>
                </div>
                {notification.dismissible ? (
                  <button
                    type="button"
                    className="global-notification-toast__close-button inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/40 text-muted-foreground transition hover:border-border/80 hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() => onDismiss(notification.id)}
                  >
                    <span className="sr-only">通知を閉じる</span>
                    <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    portalElement
  );
}

function resolveVariantContainerClassName(variant: NotificationVariant): string {
  switch (variant) {
    case 'success':
      return 'global-notification-toast--success border-emerald-400/52 bg-white/84 dark:border-emerald-300/45 dark:bg-white/16';
    case 'warning':
      return 'global-notification-toast--warning border-amber-400/54 bg-white/84 dark:border-amber-300/48 dark:bg-white/16';
    case 'error':
      return 'global-notification-toast--error border-rose-400/58 bg-white/84 dark:border-rose-300/50 dark:bg-white/16';
    default:
      return 'border-border/70 bg-white/86 dark:bg-white/18';
  }
}

function resolveVariantLabel(variant: NotificationVariant): string {
  switch (variant) {
    case 'success':
      return '成功';
    case 'warning':
      return '警告';
    case 'error':
      return 'エラー';
    default:
      return '通知';
  }
}

function resolvePhaseClassName(phase: NotificationRenderPhase): string {
  switch (phase) {
    case 'entering':
      return 'global-notification-toast--entering -translate-y-2.5 opacity-0';
    case 'visible':
      return 'global-notification-toast--visible translate-y-0 opacity-100';
    case 'leaving':
      return 'global-notification-toast--leaving -translate-y-2.5 opacity-0';
    default:
      return 'translate-y-0 opacity-100';
  }
}

function resolveWrapperPhaseClassName(phase: NotificationRenderPhase): string {
  switch (phase) {
    case 'entering':
      return 'global-notification-toast-wrap--entering mb-0 max-h-0 opacity-0';
    case 'visible':
      return 'global-notification-toast-wrap--visible mb-1.5 max-h-24 opacity-100';
    case 'leaving':
      return 'global-notification-toast-wrap--leaving mb-0 max-h-0 opacity-0';
    default:
      return 'mb-1.5 max-h-24 opacity-100';
  }
}

function resolveVariantIconClassName(variant: NotificationVariant): string {
  switch (variant) {
    case 'success':
      return 'text-emerald-400';
    case 'warning':
      return 'text-amber-400';
    case 'error':
      return 'text-rose-400';
    default:
      return 'text-surface-foreground';
  }
}

function resolveVariantIcon(
  variant: NotificationVariant
): (props: ComponentProps<typeof CheckCircleIcon>) => JSX.Element {
  switch (variant) {
    case 'success':
      return CheckCircleIcon;
    case 'warning':
      return ExclamationTriangleIcon;
    case 'error':
      return XCircleIcon;
    default:
      return CheckCircleIcon;
  }
}
