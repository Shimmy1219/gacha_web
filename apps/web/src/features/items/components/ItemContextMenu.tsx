import { CheckIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MouseEvent as ReactMouseEvent
} from 'react';

interface RarityOption {
  id: string;
  label: string;
}

export interface ItemContextMenuProps {
  anchor: { x: number; y: number };
  selectedCount: number;
  rarityOptions: RarityOption[];
  currentRarityId?: string | null;
  pickupLabel: string;
  completeLabel: string;
  riaguLabel: string;
  onSelectRarity: (rarityId: string) => void;
  onEditImage: () => void;
  onTogglePickup: () => void;
  onToggleComplete: () => void;
  onToggleRiagu: () => void;
  onDelete: () => void;
  onClose: () => void;
  disableEditImage?: boolean;
}

const MENU_WIDTH = 248;
const MENU_HEIGHT_GUESS = 320;
const RARITY_MENU_WIDTH = 220;
const RARITY_MENU_HEIGHT_GUESS = 260;

export function ItemContextMenu({
  anchor,
  selectedCount,
  rarityOptions,
  currentRarityId,
  pickupLabel,
  completeLabel,
  riaguLabel,
  onSelectRarity,
  onEditImage,
  onTogglePickup,
  onToggleComplete,
  onToggleRiagu,
  onDelete,
  onClose,
  disableEditImage = false
}: ItemContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rarityButtonRef = useRef<HTMLButtonElement | null>(null);
  const rarityMenuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(anchor);
  const [showRarityList, setShowRarityList] = useState(false);
  const [rarityMenuPosition, setRarityMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleClose = useCallback(() => {
    setShowRarityList(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    setPosition((previous) => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;
      const nextX = Math.min(Math.max(anchor.x, margin), viewportWidth - MENU_WIDTH - margin);
      const nextY = Math.min(Math.max(anchor.y, margin), viewportHeight - MENU_HEIGHT_GUESS - margin);
      if (previous.x === nextX && previous.y === nextY) {
        return previous;
      }
      return { x: nextX, y: nextY };
    });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      const target = event.target as Node | null;
      const isInsideMenu = target ? menuRef.current.contains(target) : false;
      const isInsideRarityMenu = target ? rarityMenuRef.current?.contains(target) ?? false : false;
      if (isInsideMenu || isInsideRarityMenu) {
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
        const isInsideMenu = menuRef.current?.contains(target) ?? false;
        const isInsideRarityMenu = rarityMenuRef.current?.contains(target) ?? false;
        if (isInsideMenu || isInsideRarityMenu) {
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
  }, [handleClose]);

  useLayoutEffect(() => {
    if (!showRarityList) {
      setRarityMenuPosition(null);
      return;
    }

    const buttonRect = rarityButtonRef.current?.getBoundingClientRect();
    if (!buttonRect) {
      return;
    }

    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = buttonRect.right + margin;
    if (x + RARITY_MENU_WIDTH + margin > viewportWidth) {
      x = Math.max(margin, buttonRect.left - RARITY_MENU_WIDTH - margin);
    }

    let y = buttonRect.top;
    if (y + RARITY_MENU_HEIGHT_GUESS + margin > viewportHeight) {
      y = Math.max(margin, viewportHeight - RARITY_MENU_HEIGHT_GUESS - margin);
    }

    setRarityMenuPosition({ x, y });
  }, [showRarityList]);

  const rarityBadge = useMemo(() => {
    if (selectedCount <= 0) {
      return null;
    }
    if (selectedCount === 1) {
      return '単一アイテム';
    }
    return `${selectedCount}件選択中`;
  }, [selectedCount]);

  const handleMenuMouseLeave = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget) {
      setShowRarityList(false);
      return;
    }
    if (rarityButtonRef.current?.contains(nextTarget) || rarityMenuRef.current?.contains(nextTarget)) {
      return;
    }
    setShowRarityList(false);
  }, []);

  const handleRarityButtonMouseLeave = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && rarityMenuRef.current?.contains(nextTarget)) {
      return;
    }
    setShowRarityList(false);
  }, []);

  const handleRarityMenuMouseLeave = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && rarityButtonRef.current?.contains(nextTarget)) {
      return;
    }
    setShowRarityList(false);
  }, []);

  const handleSecondaryItemEnter = useCallback(() => {
    setShowRarityList(false);
  }, []);

  const content = (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[1000] min-w-[220px] max-w-[280px] rounded-xl border border-white/10 bg-[#14141c] p-2 text-sm shadow-lg shadow-black/60"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onMouseLeave={handleMenuMouseLeave}
    >
      <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {rarityBadge ?? 'コンテキスト操作'}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          ref={rarityButtonRef}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onMouseEnter={() => setShowRarityList(true)}
          onMouseLeave={handleRarityButtonMouseLeave}
          onClick={() => setShowRarityList((previous) => !previous)}
        >
          <span>レアリティを選択</span>
          <ChevronRightIcon className={clsx('h-4 w-4 transition-transform', showRarityList && 'rotate-90')} />
        </button>
        <button
          type="button"
          disabled={disableEditImage}
          className={clsx(
            'flex w-full items-center rounded-lg px-3 py-2 text-left',
            disableEditImage
              ? 'cursor-not-allowed text-muted-foreground/60'
              : 'hover:bg-accent/20'
          )}
          onMouseEnter={handleSecondaryItemEnter}
          onClick={() => {
            if (disableEditImage) {
              return;
            }
            onEditImage();
            handleClose();
          }}
        >
          画像を設定
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onMouseEnter={handleSecondaryItemEnter}
          onClick={() => {
            onToggleComplete();
            handleClose();
          }}
        >
          {completeLabel}
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onMouseEnter={handleSecondaryItemEnter}
          onClick={() => {
            onTogglePickup();
            handleClose();
          }}
        >
          {pickupLabel}
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onMouseEnter={handleSecondaryItemEnter}
          onClick={() => {
            onToggleRiagu();
            handleClose();
          }}
        >
          {riaguLabel}
        </button>
        <div className="border-t border-border/40 pt-1" />
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/20"
          onMouseEnter={handleSecondaryItemEnter}
          onClick={() => {
            onDelete();
            handleClose();
          }}
        >
          削除
        </button>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(content, document.body)}
      {showRarityList && rarityMenuPosition
        ? createPortal(
            <div
              ref={rarityMenuRef}
              className="fixed z-[1001] max-h-48 min-w-[200px] max-w-[260px] space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-black/80 p-1 backdrop-blur"
              style={{ top: rarityMenuPosition.y, left: rarityMenuPosition.x }}
              role="menu"
              onMouseLeave={handleRarityMenuMouseLeave}
            >
              {rarityOptions.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">設定可能なレアリティがありません</p>
              ) : (
                rarityOptions.map((option) => {
                  const isCurrent = option.id === currentRarityId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={clsx(
                        'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-accent/15',
                        isCurrent && 'bg-accent/20 text-accent'
                      )}
                      onClick={() => {
                        onSelectRarity(option.id);
                        handleClose();
                      }}
                    >
                      <span className="truncate">{option.label}</span>
                      {isCurrent ? <CheckIcon className="h-4 w-4" /> : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
