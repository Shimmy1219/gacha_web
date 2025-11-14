import { XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

export interface GachaTabOption {
  id: string;
  label: string;
}

interface GachaTabsProps {
  tabs: GachaTabOption[];
  activeId: string | null;
  onSelect: (gachaId: string) => void;
  onDelete?: (tab: GachaTabOption) => void;
  className?: string;
}

export function GachaTabs({ tabs, activeId, onSelect, onDelete, className }: GachaTabsProps): JSX.Element {
  if (!tabs.length) {
    return <div className={clsx('gacha-tabs tab-scroll-area px-4', className)} />;
  }

  return (
    <div className={clsx('gacha-tabs tab-scroll-area px-4', className)}>
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <div
            key={tab.id}
            className={clsx('gacha-tab', isActive ? 'gacha-tab--active' : 'gacha-tab--inactive')}
          >
            <button
              type="button"
              className="gacha-tab__label"
              onClick={() => onSelect(tab.id)}
            >
              <span className="gacha-tab__label-text">{tab.label}</span>
            </button>
            {onDelete ? (
              <button
                type="button"
                className="gacha-tab__close"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onDelete(tab);
                }}
                aria-label={`${tab.label} を削除`}
              >
                <XMarkIcon className="gacha-tab__close-icon" aria-hidden="true" />
                <span className="sr-only">{tab.label} を削除</span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
