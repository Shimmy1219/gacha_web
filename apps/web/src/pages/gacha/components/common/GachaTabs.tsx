import { XMarkIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useHaptics } from '../../../../features/haptics/HapticsProvider';

export interface GachaTabOption {
  id: string;
  label: string;
}

interface GachaTabsProps {
  tabs: GachaTabOption[];
  activeId: string | null;
  onSelect: (gachaId: string) => void;
  onDelete?: (tab: GachaTabOption) => void;
  onAddGacha?: () => void;
  className?: string;
}

export function GachaTabs({
  tabs,
  activeId,
  onSelect,
  onDelete,
  onAddGacha,
  className
}: GachaTabsProps): JSX.Element {
  const { triggerSelection } = useHaptics();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrollbar, setHasScrollbar] = useState(false);

  const updateScrollbarState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    setHasScrollbar(element.scrollWidth > element.clientWidth);
  }, []);

  useEffect(() => {
    updateScrollbarState();
  }, [tabs, updateScrollbarState]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => updateScrollbarState());
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [updateScrollbarState]);

  const containerClassName = clsx(
    'gacha-tabs tab-scroll-area px-4',
    hasScrollbar && 'tab-scroll-area--scrollable',
    className
  );

  const handleSelect = useCallback(
    (gachaId: string) => {
      triggerSelection();
      onSelect(gachaId);
    },
    [onSelect, triggerSelection]
  );

  if (!tabs.length) {
    return <div ref={scrollRef} className={containerClassName} />;
  }

  return (
    <div ref={scrollRef} className={containerClassName}>
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
              onClick={() => handleSelect(tab.id)}
            >
              <span className="gacha-tab__label-text">{tab.label}</span>
            </button>
            {onDelete && isActive ? (
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
      {onAddGacha ? (
        <div className="gacha-tab gacha-tab--inactive gacha-tabs__add-tab">
          <button
            type="button"
            className="gacha-tab__label gacha-tabs__add-button"
            onClick={() => onAddGacha()}
            aria-label="ガチャを登録"
          >
            <span className="gacha-tab__label-text">＋</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
