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

export type Breakpoint = 'base' | 'lg' | 'xl' | '2xl';

export interface ColumnConfig {
  minWidths: number[]; // rem values
  weights: number[];
}

export const COLUMN_CONFIGS: Record<Exclude<Breakpoint, 'base'>, ColumnConfig> = {
  lg: {
    minWidths: [26, 34, 26],
    weights: [1, 1.2, 1]
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

export function getBreakpoint(width: number): Breakpoint {
  if (width >= 1536) {
    return '2xl';
  }
  if (width >= 1100) {
    return 'xl';
  }
  if (width >= 900) {
    return 'lg';
  }
  return 'base';
}

export function getColumnConfig(breakpoint: Breakpoint): ColumnConfig | null {
  if (breakpoint === 'base') {
    return null;
  }
  return COLUMN_CONFIGS[breakpoint];
}

export function distributeWidths(minWidths: number[], weights: number[], available: number): number[] {
  if (minWidths.length === 0) {
    return [];
  }

  const safeAvailable = Math.max(available, 0);
  const safeMinWidths = minWidths.map((value) => Math.max(value, 0));
  const minTotal = safeMinWidths.reduce((sum, value) => sum + value, 0);

  if (minTotal > safeAvailable && minTotal > 0) {
    const scale = safeAvailable / minTotal;
    return safeMinWidths.map((minWidth) => minWidth * scale);
  }

  const leftover = safeAvailable - minTotal;
  const safeWeights = weights.map((value) => Math.max(value, 0));
  const weightSum = safeWeights.reduce((sum, value) => sum + value, 0);
  const fallbackWeights = weightSum > 0 ? safeWeights : safeMinWidths.map(() => 1);
  const fallbackSum = weightSum > 0 ? weightSum : fallbackWeights.length || 1;

  return safeMinWidths.map(
    (minWidth, index) => minWidth + (leftover * (fallbackWeights[index] ?? 0)) / fallbackSum
  );
}

export function clampWidthsToAvailable(widths: number[], available: number): number[] {
  if (widths.length === 0) {
    return widths;
  }

  const safeAvailable = Math.max(available, 0);
  const sanitized = widths.map((value) => Math.max(value, 0));
  const total = sanitized.reduce((sum, value) => sum + value, 0);

  if (total === 0 || safeAvailable === 0) {
    return sanitized.map(() => 0);
  }

  if (total <= safeAvailable) {
    return sanitized;
  }

  const scale = safeAvailable / total;
  return sanitized.map((value) => value * scale);
}

function calculateDraggedWidths(
  startWidths: number[],
  minWidths: number[],
  index: number,
  delta: number
): number[] {
  const next = [...startWidths];
  if (delta === 0) {
    return next;
  }

  const safeMinWidths = minWidths.map((value) => Math.max(value, 0));

  if (delta > 0) {
    let remaining = delta;
    for (let rightIndex = index + 1; rightIndex < next.length && remaining > 0; rightIndex += 1) {
      const available = next[rightIndex] - (safeMinWidths[rightIndex] ?? 0);
      if (available <= 0) {
        continue;
      }
      const take = Math.min(available, remaining);
      next[rightIndex] -= take;
      remaining -= take;
    }
    const applied = delta - remaining;
    if (applied <= 0) {
      return next;
    }
    next[index] = Math.max(safeMinWidths[index] ?? 0, startWidths[index] + applied);
    return next;
  }

  const available = startWidths[index] - (safeMinWidths[index] ?? 0);
  const applied = Math.min(-delta, Math.max(available, 0));
  if (applied <= 0) {
    return next;
  }

  next[index] = startWidths[index] - applied;
  if (index + 1 < next.length) {
    next[index + 1] = startWidths[index + 1] + applied;
  }

  return next;
}

export function DashboardDesktopGrid({ sections }: DashboardDesktopGridProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [rootFontSize, setRootFontSize] = useState(16);
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

  const breakpoint = useMemo(
    () => getBreakpoint(containerMetrics.width),
    [containerMetrics.width]
  );

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

  const activeConfig = useMemo(() => getColumnConfig(breakpoint), [breakpoint]);

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
        const distributed = distributeWidths(minWidthsPx, activeConfig.weights, available);
        return clampWidthsToAvailable(distributed, available);
      }

      const extras = previous.map((value, index) => Math.max(value - minWidthsPx[index], 0));
      const sumExtras = extras.reduce((sum, value) => sum + value, 0);
      const ratios = sumExtras > 0 ? extras : activeConfig.weights;
      const distributed = distributeWidths(minWidthsPx, ratios, available);
      return clampWidthsToAvailable(distributed, available);
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
      startWidths: [...columnWidths],
      minWidths: columnWidths.map(() => 0)
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
    const nextWidths = calculateDraggedWidths(startWidths, minWidths, index, delta);

    setColumnWidths((current) => {
      if (!current) {
        return current;
      }
      if (current.length !== nextWidths.length) {
        const gapTotal = containerMetrics.gap * Math.max(nextWidths.length - 1, 0);
        const available = Math.max(containerMetrics.width - gapTotal, 0);
        return clampWidthsToAvailable(nextWidths, available);
      }
      for (let i = 0; i < current.length; i += 1) {
        if (current[i] !== nextWidths[i]) {
          const gapTotal = containerMetrics.gap * Math.max(nextWidths.length - 1, 0);
          const available = Math.max(containerMetrics.width - gapTotal, 0);
          return clampWidthsToAvailable(nextWidths, available);
        }
      }
      return current;
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
    const gapTotal = containerMetrics.gap * Math.max(columnWidths.length - 1, 0);
    const available = Math.max(containerMetrics.width - gapTotal, 0);
    const safeWidths = clampWidthsToAvailable(columnWidths, available);
    return {
      gridTemplateColumns: safeWidths.map((width) => `${Math.max(width, 0)}px`).join(' ')
    } as CSSProperties;
  }, [columnWidths, containerMetrics.gap, containerMetrics.width]);

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
              className="dashboard-desktop-grid__handle absolute top-0 bottom-0 w-4 -translate-x-1/2 cursor-col-resize touch-none select-none rounded-full bg-panel/95 text-white/60 transition-colors hover:text-white/80 z-10"
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
