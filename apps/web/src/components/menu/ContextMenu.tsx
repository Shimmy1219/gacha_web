import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import {
  createPortal
} from 'react-dom';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';

export type ContextMenuTone = 'default' | 'danger';

export interface ContextMenuActionItem {
  type?: 'item';
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  disabled?: boolean;
  tone?: ContextMenuTone;
  closeOnSelect?: boolean;
  onSelect?: () => void;
  className?: string;
}

export interface ContextMenuSeparator {
  type: 'separator';
  id?: string;
  className?: string;
}

export interface ContextMenuSubmenuItem {
  type: 'submenu';
  id: string;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  disabled?: boolean;
  tone?: ContextMenuTone;
  className?: string;
  items: ContextMenuEntry[];
  width?: number;
  closeOnSelect?: boolean;
}

export type ContextMenuEntry = ContextMenuActionItem | ContextMenuSeparator | ContextMenuSubmenuItem;

export interface ContextMenuClassNames {
  menu?: string;
  header?: string;
  items?: string;
  item?: string;
  itemDanger?: string;
  itemDisabled?: string;
  description?: string;
  separator?: string;
  leading?: string;
  trailing?: string;
}

export interface ContextMenuProps {
  anchor: { x: number; y: number };
  items: ContextMenuEntry[];
  onClose: () => void;
  header?: ReactNode;
  classNames?: ContextMenuClassNames;
  width?: number;
  submenuWidth?: number;
  style?: CSSProperties;
  container?: HTMLElement | null;
  closeOnSelect?: boolean;
}

const DEFAULT_WIDTH = 248;
const DEFAULT_MENU_HEIGHT_GUESS = 320;
const DEFAULT_SUBMENU_WIDTH = 220;
const DEFAULT_SUBMENU_HEIGHT_GUESS = 260;
const MENU_MARGIN = 8;

interface SubmenuState {
  id: string;
  anchor: { x: number; y: number };
  items: ContextMenuEntry[];
  width: number;
}

function clampPosition({
  anchor,
  width,
  height
}: {
  anchor: { x: number; y: number };
  width: number;
  height: number;
}): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const x = Math.min(Math.max(anchor.x, MENU_MARGIN), viewportWidth - width - MENU_MARGIN);
  const y = Math.min(Math.max(anchor.y, MENU_MARGIN), viewportHeight - height - MENU_MARGIN);
  return { x, y };
}

export function ContextMenu({
  anchor,
  items,
  onClose,
  header,
  classNames,
  width = DEFAULT_WIDTH,
  submenuWidth = DEFAULT_SUBMENU_WIDTH,
  style,
  container,
  closeOnSelect = true
}: ContextMenuProps): JSX.Element | null {
  const targetContainer = container ?? (typeof document !== 'undefined' ? document.body : null);
  const [position, setPosition] = useState(() => clampPosition({ anchor, width, height: DEFAULT_MENU_HEIGHT_GUESS }));
  const [submenu, setSubmenu] = useState<SubmenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const submenuButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const closeCallback = useRef(onClose);

  closeCallback.current = onClose;

  const getFocusableButtons = useCallback((container: HTMLDivElement | null) => {
    if (!container) {
      return [] as HTMLButtonElement[];
    }
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')
    );
  }, []);

  const focusFirstItem = useCallback(
    (container: HTMLDivElement | null) => {
      const buttons = getFocusableButtons(container);
      if (buttons.length === 0) {
        return;
      }
      buttons[0].focus();
    },
    [getFocusableButtons]
  );

  const focusLastItem = useCallback(
    (container: HTMLDivElement | null) => {
      const buttons = getFocusableButtons(container);
      if (buttons.length === 0) {
        return;
      }
      buttons[buttons.length - 1].focus();
    },
    [getFocusableButtons]
  );

  const handleClose = useCallback(() => {
    setSubmenu(null);
    closeCallback.current();
  }, []);

  useEffect(() => {
    if (!targetContainer) {
      return;
    }
    setPosition(clampPosition({ anchor, width, height: DEFAULT_MENU_HEIGHT_GUESS }));
  }, [anchor, targetContainer, width]);

  useEffect(() => {
    focusFirstItem(menuRef.current);
  }, [anchor, items, focusFirstItem]);

  useEffect(() => {
    if (!targetContainer) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const isInsideMenu = target ? menuRef.current?.contains(target) ?? false : false;
      const isInsideSubmenu = target ? submenuRef.current?.contains(target) ?? false : false;
      if (isInsideMenu || isInsideSubmenu) {
        return;
      }
      handleClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target) {
        const insideMenu = menuRef.current?.contains(target) ?? false;
        const insideSubmenu = submenuRef.current?.contains(target) ?? false;
        if (insideMenu || insideSubmenu) {
          return;
        }
      }
      handleClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [handleClose, targetContainer]);

  const registerSubmenuButton = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) {
      submenuButtonRefs.current.set(id, node);
    } else {
      submenuButtonRefs.current.delete(id);
    }
  }, []);

  const closeSubmenu = useCallback(() => {
    setSubmenu(null);
  }, []);

  const openSubmenu = useCallback(
    (id: string, nextItems: ContextMenuEntry[]) => {
      const button = submenuButtonRefs.current.get(id);
      if (!button) {
        setSubmenu({ id, items: nextItems, anchor: position, width: submenuWidth });
        return;
      }
      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = rect.right + MENU_MARGIN;
      if (x + submenuWidth + MENU_MARGIN > viewportWidth) {
        x = Math.max(MENU_MARGIN, rect.left - submenuWidth - MENU_MARGIN);
      }

      let y = rect.top;
      if (y + DEFAULT_SUBMENU_HEIGHT_GUESS + MENU_MARGIN > viewportHeight) {
        y = Math.max(MENU_MARGIN, viewportHeight - DEFAULT_SUBMENU_HEIGHT_GUESS - MENU_MARGIN);
      }

      setSubmenu({ id, items: nextItems, anchor: { x, y }, width: submenuWidth });
    },
    [position, submenuWidth]
  );

  const handleMenuMouseLeave = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (!nextTarget) {
        closeSubmenu();
        return;
      }
      if (submenuRef.current?.contains(nextTarget)) {
        return;
      }
      for (const button of submenuButtonRefs.current.values()) {
        if (button?.contains(nextTarget)) {
          return;
        }
      }
      closeSubmenu();
    },
    [closeSubmenu]
  );

  const handleSubmenuMouseLeave = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (!nextTarget) {
        closeSubmenu();
        return;
      }
      const activeButton = submenu?.id ? submenuButtonRefs.current.get(submenu.id) : null;
      if (activeButton?.contains(nextTarget)) {
        return;
      }
      closeSubmenu();
    },
    [closeSubmenu, submenu]
  );

  const renderItems = useCallback(
    (
      entries: ContextMenuEntry[],
      options: {
        menuId: string;
        onItemHover?: () => void;
        onItemSelect: (item: ContextMenuActionItem) => void;
      }
    ) => {
      return entries.map((entry, index) => {
        if (entry.type === 'separator') {
          return (
            <div
              key={entry.id ?? `separator-${options.menuId}-${index}`}
              className={clsx('my-1 border-t border-border/40', classNames?.separator, entry.className)}
            />
          );
        }

        if (entry.type === 'submenu') {
          const key = entry.id;
          const disabled = entry.disabled ?? false;
          const toneClass = entry.tone === 'danger' ? classNames?.itemDanger : undefined;
          return (
            <button
              key={key}
              type="button"
              role="menuitem"
              ref={(node) => registerSubmenuButton(key, node)}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
                classNames?.item,
                toneClass,
                disabled ? classNames?.itemDisabled ?? 'cursor-not-allowed text-muted-foreground/60' : 'hover:bg-accent/20',
                entry.className
              )}
              onMouseEnter={() => {
                if (disabled) {
                  return;
                }
                openSubmenu(key, entry.items);
              }}
              onClick={() => {
                if (disabled) {
                  return;
                }
                openSubmenu(key, entry.items);
              }}
              disabled={disabled}
            >
              <span className="flex flex-1 items-center gap-2">
                {entry.leading ? <span className={clsx('shrink-0', classNames?.leading)}>{entry.leading}</span> : null}
                <span className="flex-1">
                  <span>{entry.label}</span>
                  {entry.description ? (
                    <span className={clsx('block text-xs text-muted-foreground/80', classNames?.description)}>
                      {entry.description}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className={clsx('shrink-0 text-muted-foreground', classNames?.trailing)}>
                {entry.trailing ?? <ChevronRightIcon className="h-4 w-4" />}
              </span>
            </button>
          );
        }

        const key = entry.id ?? `item-${options.menuId}-${index}`;
        const disabled = entry.disabled ?? false;
        const toneClass = entry.tone === 'danger' ? classNames?.itemDanger : undefined;
        return (
          <button
            key={key}
            type="button"
            role="menuitem"
              className={clsx(
              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
              classNames?.item,
              toneClass,
              disabled ? classNames?.itemDisabled ?? 'cursor-not-allowed text-muted-foreground/60' : 'hover:bg-accent/20',
              entry.className
            )}
            onMouseEnter={() => {
              options.onItemHover?.();
            }}
            onClick={() => {
              if (disabled) {
                return;
              }
              options.onItemSelect(entry);
            }}
            disabled={disabled}
          >
            <span className="flex flex-1 items-center gap-2">
              {entry.leading ? <span className={clsx('shrink-0', classNames?.leading)}>{entry.leading}</span> : null}
              <span className="flex-1">
                <span>{entry.label}</span>
                {entry.description ? (
                  <span className={clsx('block text-xs text-muted-foreground/80', classNames?.description)}>
                    {entry.description}
                  </span>
                ) : null}
              </span>
            </span>
            {entry.trailing ? <span className={clsx('shrink-0', classNames?.trailing)}>{entry.trailing}</span> : null}
          </button>
        );
      });
    },
    [classNames?.description, classNames?.item, classNames?.itemDanger, classNames?.itemDisabled, classNames?.leading, classNames?.separator, classNames?.trailing, openSubmenu, registerSubmenuButton]
  );

  const handleActionSelect = useCallback(
    (item: ContextMenuActionItem) => {
      item.onSelect?.();
      if (item.closeOnSelect === false) {
        return;
      }
      if (closeOnSelect) {
        handleClose();
      }
    },
    [closeOnSelect, handleClose]
  );

  const handleMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const container = event.currentTarget as HTMLDivElement | null;
      const buttons = getFocusableButtons(container);
      if (buttons.length === 0) {
        return;
      }

      const activeElement = document.activeElement as HTMLButtonElement | null;
      const currentIndex = activeElement ? buttons.indexOf(activeElement) : -1;

      const focusByIndex = (index: number) => {
        const normalized = (index + buttons.length) % buttons.length;
        buttons[normalized]?.focus();
      };

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusByIndex(currentIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (currentIndex === -1) {
            focusLastItem(container);
          } else {
            focusByIndex(currentIndex - 1);
          }
          break;
        case 'Home':
          event.preventDefault();
          focusFirstItem(container);
          break;
        case 'End':
          event.preventDefault();
          focusLastItem(container);
          break;
        case 'Tab':
          event.preventDefault();
          if (event.shiftKey) {
            focusByIndex(currentIndex === -1 ? buttons.length - 1 : currentIndex - 1);
          } else {
            focusByIndex(currentIndex + 1);
          }
          break;
        default:
          break;
      }
    },
    [focusFirstItem, focusLastItem, getFocusableButtons]
  );

  useEffect(() => {
    if (!submenu) {
      return;
    }
    focusFirstItem(submenuRef.current);
  }, [submenu, focusFirstItem]);

  if (!targetContainer) {
    return null;
  }

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      className={clsx(
        'fixed z-[1000] min-w-[220px] max-w-[280px] rounded-xl border border-white/10 bg-[#14141c] p-2 text-sm shadow-lg shadow-black/60',
        classNames?.menu
      )}
      style={{ top: position.y, left: position.x, width, ...style }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
      onMouseLeave={handleMenuMouseLeave}
    >
      {header ? (
        <div className={clsx('px-2 pb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground', classNames?.header)}>
          {header}
        </div>
      ) : null}
      <div className={clsx('space-y-1', classNames?.items)}>
        {renderItems(items, {
          menuId: 'root',
          onItemHover: closeSubmenu,
          onItemSelect: handleActionSelect
        })}
      </div>
    </div>
  );

  const submenuContent = submenu
    ? (
        <div
          ref={submenuRef}
          role="menu"
          className={clsx(
            'fixed z-[1001] max-h-48 min-w-[200px] max-w-[260px] space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-black/80 p-1 backdrop-blur',
            classNames?.menu
          )}
          style={{ top: submenu.anchor.y, left: submenu.anchor.x, width: submenu.width }}
          onKeyDown={handleMenuKeyDown}
          onMouseLeave={handleSubmenuMouseLeave}
        >
          {renderItems(submenu.items, {
            menuId: submenu.id,
            onItemHover: undefined,
            onItemSelect: (item) => handleActionSelect(item)
          })}
        </div>
      )
    : null;

  return (
    <>
      {createPortal(menu, targetContainer)}
      {submenuContent ? createPortal(submenuContent, targetContainer) : null}
    </>
  );
}
