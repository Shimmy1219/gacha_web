import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  createContext,
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
import { useResponsiveDashboard } from './useResponsiveDashboard';

export interface DashboardSectionConfig {
  id: string;
  label: string;
  description?: string;
  node: ReactNode;
}

interface DashboardShellProps {
  sections: DashboardSectionConfig[];
  controlsSlot?: ReactNode;
}

interface DashboardContextValue {
  isMobile: boolean;
  activeView: string;
  setActiveView: Dispatch<SetStateAction<string>>;
}

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

const CONTROLS_POSITION_STORAGE_KEY = 'dashboard-shell__controls-position';
const DEFAULT_CONTROLS_PADDING = 16;

type ControlsPosition = { top: number; left: number };

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

export function DashboardShell({ sections, controlsSlot }: DashboardShellProps): JSX.Element {
  const { isMobile } = useResponsiveDashboard();
  const [activeView, setActiveView] = useState(() => sections[0]?.id ?? 'rarity');
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

    let storedPosition: ControlsPosition | null = null;
    if (typeof window !== 'undefined') {
      try {
        const persisted = window.localStorage.getItem(CONTROLS_POSITION_STORAGE_KEY);
        if (persisted) {
          const parsed = JSON.parse(persisted);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.top === 'number' &&
            typeof parsed.left === 'number'
          ) {
            storedPosition = clampControlsPosition(parsed, containerRect, controlsRect);
          }
        }
      } catch (error) {
        console.error('Failed to parse dashboard controls position from localStorage', error);
      }
    }

    if (storedPosition) {
      setControlsPosition(storedPosition);
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

  const handleControlsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              CONTROLS_POSITION_STORAGE_KEY,
              JSON.stringify(constrained)
            );
          } catch (error) {
            console.error('Failed to persist dashboard controls position', error);
          }
        }

        return constrained;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDragging);
    window.addEventListener('pointercancel', finishDragging);
  };

  const value = useMemo(
    () => ({ isMobile, activeView, setActiveView }),
    [isMobile, activeView]
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

        <div className="dashboard-shell__desktop hidden lg:block">
          <DashboardDesktopGrid sections={sections} />
        </div>

        <div className="dashboard-shell__mobile space-y-4 lg:hidden">
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

        <DashboardMobileTabs sections={sections} />
      </div>
    </DashboardContext.Provider>
  );
}
