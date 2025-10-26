import { CheckIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { ContextMenu, type ContextMenuEntry } from '../menu/ContextMenu';

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
  const rarityBadge = useMemo(() => {
    if (selectedCount <= 0) {
      return null;
    }
    if (selectedCount === 1) {
      return '単一アイテム';
    }
    return `${selectedCount}件選択中`;
  }, [selectedCount]);

  const rarityMenuItems = useMemo<ContextMenuEntry[]>(() => {
    if (rarityOptions.length === 0) {
      return [
        {
          type: 'item',
          id: 'rarity-empty',
          label: '設定可能なレアリティがありません',
          disabled: true,
          closeOnSelect: false
        }
      ];
    }

    return rarityOptions.map((option) => ({
      type: 'item',
      id: option.id,
      label: option.label,
      trailing: option.id === currentRarityId ? <CheckIcon className="h-4 w-4" /> : null,
      onSelect: () => onSelectRarity(option.id)
    }));
  }, [currentRarityId, onSelectRarity, rarityOptions]);

  const menuItems = useMemo<ContextMenuEntry[]>(
    () => [
      {
        type: 'submenu',
        id: 'rarity',
        label: 'レアリティを選択',
        items: rarityMenuItems
      },
      {
        type: 'item',
        id: 'edit-image',
        label: '画像を設定',
        disabled: disableEditImage,
        onSelect: onEditImage,
        closeOnSelect: !disableEditImage
      },
      {
        type: 'item',
        id: 'complete',
        label: completeLabel,
        onSelect: onToggleComplete
      },
      {
        type: 'item',
        id: 'pickup',
        label: pickupLabel,
        onSelect: onTogglePickup
      },
      {
        type: 'item',
        id: 'riagu',
        label: riaguLabel,
        onSelect: onToggleRiagu
      },
      { type: 'separator', id: 'danger-separator' },
      {
        type: 'item',
        id: 'delete',
        label: '削除',
        tone: 'danger',
        onSelect: onDelete
      }
    ],
    [
      completeLabel,
      disableEditImage,
      onDelete,
      onEditImage,
      onToggleComplete,
      onTogglePickup,
      onToggleRiagu,
      pickupLabel,
      rarityMenuItems,
      riaguLabel
    ]
  );

  return (
    <ContextMenu
      anchor={anchor}
      header={rarityBadge ?? 'コンテキスト操作'}
      items={menuItems}
      onClose={onClose}
      width={248}
      submenuWidth={220}
    />
  );
}
