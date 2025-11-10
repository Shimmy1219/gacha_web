import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction
} from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { clsx } from 'clsx';

import { DashboardDesktopGrid } from './DashboardDesktopGrid';
import { DashboardMobileTabs } from './DashboardMobileTabs';
import { DashboardSidebarLayout } from './DashboardSidebarLayout';
import { useResponsiveDashboard } from './useResponsiveDashboard';
import {
  loadStoredDashboardControlsPosition,
  saveDashboardControlsPosition
} from './dashboardControlsPositionStorage';
import { useDomainStores } from '../../../../features/storage/AppPersistenceProvider';
import { useStoreValue } from '@domain/stores';

export interface DashboardSectionConfig {
  id: string;
  label: string;
  description?: string;
  node: ReactNode;
}

interface DashboardShellProps {
  sections: DashboardSectionConfig[];
  controlsSlot?: ReactNode;
  onDrawGacha?: () => void;
}

interface DashboardContextValue {
  isMobile: boolean;
  activeView: string;
  setActiveView: Dispatch<SetStateAction<string>>;
  activeSidebarViews: readonly string[];
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

const DEFAULT_CONTROLS_PADDING = 16;

type ControlsPosition = { top: number; left: number };

function deriveSidebarViews(
  previous: readonly string[],
  sections: DashboardSectionConfig[]
): string[] {
  const availableIds = sections.map((section) => section.id);

  if (availableIds.length === 0) {
    return [];
  }

  const filtered = previous.filter((viewId) => availableIds.includes(viewId)).slice(0, 2);

  if (filtered.length === 0) {
    return availableIds.slice(0, Math.min(2, availableIds.length));
  }

  if (filtered.length === 1 && availableIds.length > 1) {
    const fallback = availableIds.find((id) => id !== filtered[0]);
    if (fallback) {
      return [filtered[0], fallback];
    }
  }

  return filtered;
}

function shallowEqualArrays(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

function clampControlsPosition(
  position: ControlsPosition,
  containerRect: Pick<DOMRect, 'width' | 'height'>,
  controlsRect: Pick<DOMRect, 'width' | 'height'>
): ControlsPosition {
  const maxLeft = Math.max(0, containerRect.width - controlsRect.width);
  const maxTop = Math.max(0, containerRect.height - controlsRect.height);

  return {
    top: Math.min(Math.max(position.top, 0), maxTop),
    left: Math.min(Math.max(position.left, 0), maxLeft)
  };
}

export function useDashboardShell(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboardShell must be used within DashboardShell');
  }
  return context;
}

export function DashboardShell({ sections, controlsSlot, onDrawGacha }: DashboardShellProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const { uiPreferences: uiPreferencesStore } = useDomainStores();
  useStoreValue(uiPreferencesStore);
  const desktopLayout = uiPreferencesStore.getDashboardDesktopLayout();
  const isSidebarLayout = !isMobile && desktopLayout === 'sidebar';
  const [activeView, setActiveView] = useState(() => sections[0]?.id ?? 'rarity');
  const [activeSidebarViews, setActiveSidebarViews] = useState<string[]>(() =>
    deriveSidebarViews([], sections)
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const [controlsPosition, setControlsPosition] = useState<ControlsPosition | null>(null);
  const [isDraggingControls, setIsDraggingControls] = useState(false);

  useEffect(() => {
    if (sections.length === 0) {
      return;
    }
    if (!sections.some((section) => section.id === activeView)) {
      setActiveView(sections[0].id);
    }
  }, [sections, activeView]);

  useEffect(() => {
    setActiveSidebarViews((previous) => {
      const next = deriveSidebarViews(previous, sections);
      if (shallowEqualArrays(previous, next)) {
        return previous;
      }
      return next;
    });
  }, [sections]);

  useEffect(() => {
    if (activeSidebarViews.length > 0 && activeSidebarViews[0] !== activeView) {
      setActiveView(activeSidebarViews[0]);
    }
  }, [activeSidebarViews, activeView]);

  useLayoutEffect(() => {
    if (!controlsSlot) {
      setControlsPosition(null);
      return;
    }

    const container = containerRef.current;
    const controls = controlsRef.current;

    if (!container || !controls) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();

    const storedPosition = loadStoredDashboardControlsPosition();
    if (storedPosition) {
      setControlsPosition(clampControlsPosition(storedPosition, containerRect, controlsRect));
      return;
    }

    const defaultPosition = clampControlsPosition(
      {
        top: DEFAULT_CONTROLS_PADDING,
        left: containerRect.width - controlsRect.width - DEFAULT_CONTROLS_PADDING
      },
      containerRect,
      controlsRect
    );

    setControlsPosition(defaultPosition);
  }, [controlsSlot, isMobile]);

  useEffect(() => {
    if (!controlsSlot) {
      return;
    }

    const handleResize = () => {
      const container = containerRef.current;
      const controls = controlsRef.current;

      if (!container || !controls) {
        return;
      }

      setControlsPosition((previous) => {
        if (!previous) {
          return previous;
        }

        const containerRect = container.getBoundingClientRect();
        const controlsRect = controls.getBoundingClientRect();

        return clampControlsPosition(previous, containerRect, controlsRect);
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [controlsSlot]);

  const handleControlsPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (event.target instanceof HTMLElement) {
      const interactive = event.target.closest('button, a, input, textarea, select');
      if (interactive) {
        return;
      }
    }

    const container = containerRef.current;
    const controls = controlsRef.current;

    if (!container || !controls) {
      return;
    }

    event.preventDefault();

    const pointerId = event.pointerId;
    const initialContainerRect = container.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const offsetX = event.clientX - controlsRect.left;
    const offsetY = event.clientY - controlsRect.top;

    setIsDraggingControls(true);
    controls.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect() ?? initialContainerRect;
      const currentControlsRect = controlsRef.current?.getBoundingClientRect() ?? controlsRect;

      const nextPosition = clampControlsPosition(
        {
          top: moveEvent.clientY - containerRect.top - offsetY,
          left: moveEvent.clientX - containerRect.left - offsetX
        },
        containerRect,
        currentControlsRect
      );

      setControlsPosition(nextPosition);
    };

    const finishDragging = () => {
      setIsDraggingControls(false);
      if (controls.hasPointerCapture(pointerId)) {
        controls.releasePointerCapture(pointerId);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDragging);
      window.removeEventListener('pointercancel', finishDragging);

      setControlsPosition((previous) => {
        if (!previous) {
          return previous;
        }

        const containerRect = containerRef.current?.getBoundingClientRect() ?? initialContainerRect;
        const currentControlsRect = controlsRef.current?.getBoundingClientRect() ?? controlsRect;
        const constrained = clampControlsPosition(previous, containerRect, currentControlsRect);

        saveDashboardControlsPosition(constrained);

        return constrained;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDragging);
    window.addEventListener('pointercancel', finishDragging);
  };

  const handleToggleSidebarView = useCallback(
    (viewId: string) => {
      setActiveSidebarViews((previous) => {
        const availableIds = sections.map((section) => section.id);

        if (!availableIds.includes(viewId)) {
          return previous;
        }

        const isSelected = previous.includes(viewId);

        if (isSelected) {
          const next = previous.filter((id) => id !== viewId);
          if (next.length === 0) {
            const fallback = availableIds.find((id) => id !== viewId);
            return fallback ? [fallback] : [viewId];
          }
          return next;
        }

        if (previous.length >= 2) {
          return [...previous.slice(1), viewId];
        }

        return [...previous, viewId];
      });
    },
    [sections]
  );

  const value = useMemo(
    () => ({ isMobile, activeView, setActiveView, activeSidebarViews }),
    [isMobile, activeView, activeSidebarViews]
  );

  return (
    <DashboardContext.Provider value={value}>
      <div
        ref={containerRef}
        className="dashboard-shell relative flex w-full flex-col gap-4 pb-[5.5rem] lg:pb-16"
      >
        {controlsSlot ? (
          <aside
            ref={controlsRef}
            onPointerDown={handleControlsPointerDown}
            className={clsx(
              'dashboard-shell__controls absolute z-20 w-60 max-w-full rounded-[1.5rem] border border-border/70 bg-panel/95 p-6 ring-1 ring-inset ring-white/5',
              controlsPosition ? undefined : 'top-4 right-4',
              isDraggingControls ? 'cursor-grabbing' : 'cursor-grab'
            )}
            style={
              controlsPosition
                ? { top: `${controlsPosition.top}px`, left: `${controlsPosition.left}px` }
                : undefined
            }
          >
            {controlsSlot}
          </aside>
        ) : null}

        {!isMobile && isSidebarLayout ? (
          <div className="dashboard-shell__desktop-sidebar hidden lg:block">
            <DashboardSidebarLayout
              sections={sections}
              selectedViewIds={activeSidebarViews}
              onToggleView={handleToggleSidebarView}
            />
          </div>
        ) : null}

        {!isMobile && !isSidebarLayout ? (
          <div className="dashboard-shell__desktop hidden lg:block">
            <DashboardDesktopGrid sections={sections} />
          </div>
        ) : null}

        <div className="dashboard-shell__mobile lg:hidden">
          {sections.map((section) => (
            <div
              key={section.id}
              data-view={section.id}
              className={clsx('dashboard-shell__mobile-section', activeView !== section.id && 'hidden')}
            >
              {section.node}
            </div>
          ))}
        </div>

        <DashboardMobileTabs sections={sections} onDrawGacha={onDrawGacha} />
      </div>
    </DashboardContext.Provider>
  );
}
