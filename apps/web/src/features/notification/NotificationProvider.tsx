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

function GlobalNotificationHost({ notifications, onDismiss }: GlobalNotificationHostProps): JSX.Element | null {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    setPortalElement(document.body);
  }, []);

  if (!portalElement || notifications.length === 0) {
    return null;
  }

  return createPortal(
    <div className="global-notification-root pointer-events-none fixed inset-x-0 top-0 z-[140] flex justify-center px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
      <div className="global-notification__viewport flex w-full max-w-[min(42rem,calc(100vw-1.5rem))] flex-col gap-2">
        {notifications.map((notification) => {
          const colorClassName = resolveVariantContainerClassName(notification.variant);
          const iconClassName = resolveVariantIconClassName(notification.variant);
          const Icon = resolveVariantIcon(notification.variant);
          return (
            <div
              key={notification.id}
              className={`global-notification-toast pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm transition ${colorClassName}`}
              data-variant={notification.variant}
              role={notification.variant === 'error' ? 'alert' : 'status'}
              aria-live={notification.variant === 'error' ? 'assertive' : 'polite'}
            >
              <div className="global-notification-toast__icon pt-0.5">
                <Icon className={`h-5 w-5 ${iconClassName}`} />
              </div>
              <div className="global-notification-toast__content min-w-0 flex-1">
                {notification.title ? (
                  <p className="global-notification-toast__title text-sm font-semibold text-surface-foreground">
                    {notification.title}
                  </p>
                ) : null}
                <p className="global-notification-toast__message text-sm text-surface-foreground/95">
                  {notification.message}
                </p>
              </div>
              {notification.dismissible ? (
                <button
                  type="button"
                  className="global-notification-toast__close-button inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/40 text-muted-foreground transition hover:border-border/80 hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => onDismiss(notification.id)}
                >
                  <span className="sr-only">通知を閉じる</span>
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
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
      return 'global-notification-toast--success border-emerald-500/45 bg-emerald-500/12';
    case 'warning':
      return 'global-notification-toast--warning border-amber-500/50 bg-amber-500/14';
    case 'error':
      return 'global-notification-toast--error border-rose-500/55 bg-rose-500/14';
    default:
      return 'border-border/60 bg-surface/95';
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
