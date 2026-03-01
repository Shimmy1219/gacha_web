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

const ACTIVE_TAB_SELECTOR = '.gacha-tab--active';
const TAB_VISIBLE_GUTTER_PX = 16;

/**
 * ガチャ一覧タブを横並び表示し、アクティブタブが可視領域内に収まるよう補正する。
 *
 * @param tabs 表示するガチャタブ一覧
 * @param activeId 現在アクティブなガチャID
 * @param onSelect タブ選択時のコールバック
 * @param onDelete アクティブタブ削除時のコールバック
 * @param onAddGacha ガチャ追加時のコールバック
 * @param className ルート要素へ追加するクラス名
 * @returns ガチャタブUI
 */
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

  const scrollActiveTabIntoView = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const activeTab = container.querySelector<HTMLElement>(ACTIVE_TAB_SELECTOR);
    if (!activeTab) {
      return;
    }

    const visibleStart = container.scrollLeft;
    const visibleEnd = visibleStart + container.clientWidth;
    const activeStart = activeTab.offsetLeft;
    const activeEnd = activeStart + activeTab.offsetWidth;
    const shouldAlignFromStart = activeTab.offsetWidth + TAB_VISIBLE_GUTTER_PX * 2 >= container.clientWidth;
    let nextScrollLeft: number | null = null;

    if (shouldAlignFromStart) {
      nextScrollLeft = Math.max(0, activeStart - TAB_VISIBLE_GUTTER_PX);
    } else if (activeStart - TAB_VISIBLE_GUTTER_PX < visibleStart) {
      nextScrollLeft = Math.max(0, activeStart - TAB_VISIBLE_GUTTER_PX);
    } else if (activeEnd + TAB_VISIBLE_GUTTER_PX > visibleEnd) {
      nextScrollLeft = Math.max(0, activeEnd + TAB_VISIBLE_GUTTER_PX - container.clientWidth);
    }

    if (nextScrollLeft !== null && Math.abs(nextScrollLeft - container.scrollLeft) > 1) {
      container.scrollTo({ left: nextScrollLeft, behavior });
    }
  }, []);

  // タブ一覧やアクティブIDが更新された直後に、スクロールバー有無とアクティブ表示位置を同期する。
  // tabs/activeId 依存にすることで、初期表示・タブ追加削除・アクティブ変更の全てを同じ処理で補正する。
  useEffect(() => {
    updateScrollbarState();
    if (typeof window === 'undefined') {
      scrollActiveTabIntoView('auto');
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      scrollActiveTabIntoView('auto');
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [activeId, tabs, scrollActiveTabIntoView, updateScrollbarState]);

  // コンテナ幅の変化(レスポンシブ切替・モバイルタブ切替時の再表示)に追従し、
  // 非表示→表示で幅が変わったケースでもアクティブタブが見切れないように補正する。
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => {
      updateScrollbarState();
      scrollActiveTabIntoView('auto');
    });
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [scrollActiveTabIntoView, updateScrollbarState]);

  // セクションが画面内に入ったタイミング(モバイル切替で hidden が外れた直後など)を検知し、
  // 「表示されたが横スクロール位置だけ古い」状態を避けるために再補正する。
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        scrollActiveTabIntoView('auto');
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [scrollActiveTabIntoView]);

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
