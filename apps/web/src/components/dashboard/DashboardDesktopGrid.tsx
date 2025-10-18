import { ArrowsRightLeftIcon } from '@heroicons/react/20/solid';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type { DashboardSectionConfig } from './DashboardShell';

interface DashboardDesktopGridProps {
  sections: DashboardSectionConfig[];
}

type Breakpoint = 'base' | 'lg' | 'xl' | '2xl';

interface ColumnConfig {
  minWidths: number[]; // rem values
  weights: number[];
}

const COLUMN_CONFIGS: Record<Exclude<Breakpoint, 'base'>, ColumnConfig> = {
  lg: {
    minWidths: [24, 24],
    weights: [1, 1]
  },
  xl: {
    minWidths: [24, 32, 30, 24],
    weights: [1, 1.25, 1, 0.9]
  },
  '2xl': {
    minWidths: [26, 38, 32, 24],
    weights: [1, 1.4, 1.05, 0.95]
  }
};

interface DragState {
  index: number;
  pointerId: number;
  startX: number;
  startWidths: number[];
  minWidths: number[];
}

function getBreakpoint(width: number): Breakpoint {
  if (width >= 1536) {
    return '2xl';
  }
  if (width >= 1280) {
    return 'xl';
  }
  if (width >= 1024) {
    return 'lg';
  }
  return 'base';
}

function distributeWidths(minWidths: number[], weights: number[], available: number): number[] {
  const minTotal = minWidths.reduce((sum, value) => sum + value, 0);
  const leftover = Math.max(available - minTotal, 0);
  const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;
  return minWidths.map((minWidth, index) => minWidth + (leftover * weights[index]) / weightSum);
}

export function DashboardDesktopGrid({ sections }: DashboardDesktopGridProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [rootFontSize, setRootFontSize] = useState(16);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('base');
  const [containerMetrics, setContainerMetrics] = useState<{ width: number; gap: number }>({
    width: 0,
    gap: 16
  });
  const [columnWidths, setColumnWidths] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (!Number.isNaN(fontSize)) {
      setRootFontSize(fontSize);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const computedStyles = getComputedStyle(element);
      const columnGap = parseFloat(computedStyles.columnGap) || 0;
      setContainerMetrics({
        width: entry.contentRect.width,
        gap: columnGap
      });
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const activeConfig = useMemo(() => {
    if (breakpoint === 'base') {
      return null;
    }
    return COLUMN_CONFIGS[breakpoint as Exclude<Breakpoint, 'base'>];
  }, [breakpoint]);

  const minWidthsPx = useMemo(() => {
    if (!activeConfig) {
      return [] as number[];
    }
    return activeConfig.minWidths.map((rem) => rem * rootFontSize);
  }, [activeConfig, rootFontSize]);

  useEffect(() => {
    if (!activeConfig) {
      setColumnWidths(null);
      return;
    }
    if (containerMetrics.width === 0) {
      return;
    }

    const columnCount = activeConfig.minWidths.length;
    const gapTotal = containerMetrics.gap * Math.max(columnCount - 1, 0);
    const available = Math.max(containerMetrics.width - gapTotal, 0);

    setColumnWidths((previous) => {
      if (!previous || previous.length !== columnCount) {
        return distributeWidths(minWidthsPx, activeConfig.weights, available);
      }

      const extras = previous.map((value, index) => Math.max(value - minWidthsPx[index], 0));
      const sumExtras = extras.reduce((sum, value) => sum + value, 0);
      const ratios = sumExtras > 0 ? extras : activeConfig.weights;
      return distributeWidths(minWidthsPx, ratios, available);
    });
  }, [activeConfig, containerMetrics.width, containerMetrics.gap, minWidthsPx]);

  useEffect(() => {
    if (!columnWidths) {
      dragStateRef.current = null;
    }
  }, [columnWidths]);

  const handlePointerDown = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!columnWidths) {
      return;
    }
    event.preventDefault();
    const target = event.currentTarget;
    dragStateRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidths: columnWidths,
      minWidths: minWidthsPx
    };
    target.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    event.preventDefault();

    const { index, startX, startWidths, minWidths } = dragState;
    const delta = event.clientX - startX;
    const combined = startWidths[index] + startWidths[index + 1];
    const minA = minWidths[index];
    const minB = minWidths[index + 1];

    let nextA = startWidths[index] + delta;
    nextA = Math.max(nextA, minA);
    nextA = Math.min(nextA, combined - minB);
    const nextB = combined - nextA;

    setColumnWidths((current) => {
      if (!current) {
        return current;
      }
      const next = [...current];
      next[index] = nextA;
      next[index + 1] = nextB;
      return next;
    });
  };

  const clearDragState = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const gridStyle = useMemo(() => {
    if (!columnWidths) {
      return undefined;
    }
    return {
      gridTemplateColumns: columnWidths.map((width) => `${Math.max(width, 0)}px`).join(' ')
    } as CSSProperties;
  }, [columnWidths]);

  const handlePositions = useMemo(() => {
    if (!columnWidths) {
      return [] as number[];
    }
    const positions: number[] = [];
    let accumulated = 0;
    for (let index = 0; index < columnWidths.length - 1; index += 1) {
      accumulated += columnWidths[index];
      positions.push(accumulated + containerMetrics.gap * index + containerMetrics.gap / 2);
    }
    return positions;
  }, [columnWidths, containerMetrics.gap]);

  return (
    <div ref={containerRef} className="dashboard-desktop-grid relative grid items-start gap-4" style={gridStyle}>
      {sections.map((section) => (
        <div key={section.id} data-view={section.id} className="dashboard-desktop-grid__item h-full">
          {section.node}
        </div>
      ))}

      {columnWidths
        ? handlePositions.map((left, index) => (
            <div
              key={index}
              role="separator"
              aria-orientation="vertical"
              aria-label="列幅の調整"
              className="dashboard-desktop-grid__handle absolute top-0 bottom-0 w-4 -translate-x-1/2 cursor-col-resize touch-none select-none rounded-full bg-[#15151b]/95 text-white/60 shadow-panel transition-colors hover:text-white/80 z-10"
              style={{ left }}
              onPointerDown={handlePointerDown(index)}
              onPointerMove={handlePointerMove}
              onPointerUp={clearDragState}
              onPointerCancel={clearDragState}
            >
              <span className="sr-only">ドラッグで列幅を変更</span>
              <div className="pointer-events-none flex h-full items-center justify-center">
                <ArrowsRightLeftIcon aria-hidden className="h-3 w-3" />
              </div>
            </div>
          ))
        : null}
    </div>
  );
}
