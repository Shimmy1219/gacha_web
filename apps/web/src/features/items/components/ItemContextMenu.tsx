import { CheckIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [position, setPosition] = useState(anchor);
  const [showRarityList, setShowRarityList] = useState(false);

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
      if (target && menuRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
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
  }, [onClose]);

  const rarityBadge = useMemo(() => {
    if (selectedCount <= 0) {
      return null;
    }
    if (selectedCount === 1) {
      return '単一アイテム';
    }
    return `${selectedCount}件選択中`;
  }, [selectedCount]);

  const content = (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[1000] min-w-[220px] max-w-[280px] rounded-xl border border-white/10 bg-[#14141c] p-2 text-sm shadow-lg shadow-black/60"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {rarityBadge ?? 'コンテキスト操作'}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onClick={() => setShowRarityList((previous) => !previous)}
        >
          <span>レアリティを選択</span>
          <ChevronRightIcon className={clsx('h-4 w-4 transition-transform', showRarityList && 'rotate-90')} />
        </button>
        {showRarityList ? (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-black/20 p-1">
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
                      onClose();
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    {isCurrent ? <CheckIcon className="h-4 w-4" /> : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
        <button
          type="button"
          disabled={disableEditImage}
          className={clsx(
            'flex w-full items-center rounded-lg px-3 py-2 text-left',
            disableEditImage
              ? 'cursor-not-allowed text-muted-foreground/60'
              : 'hover:bg-accent/20'
          )}
          onClick={() => {
            if (disableEditImage) {
              return;
            }
            onEditImage();
            onClose();
          }}
        >
          画像を設定
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onClick={() => {
            onToggleComplete();
            onClose();
          }}
        >
          {completeLabel}
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onClick={() => {
            onTogglePickup();
            onClose();
          }}
        >
          {pickupLabel}
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent/20"
          onClick={() => {
            onToggleRiagu();
            onClose();
          }}
        >
          {riaguLabel}
        </button>
        <div className="border-t border-border/40 pt-1" />
        <button
          type="button"
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/20"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          削除
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
