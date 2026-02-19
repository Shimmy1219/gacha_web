import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DashboardSectionConfig } from './DashboardShell';
import {
  calculateResizeHandleOffsets,
  clampColumnWidthByPair,
  columnWidthsToFrUnits,
  remToVisualPixels
} from './desktopGridResizeMath';
import { readSiteZoomScaleFromComputedStyle, SITE_ZOOM_CHANGE_EVENT } from '../../../../features/theme/siteZoomMath';

export const DESKTOP_GRID_MAIN_HEIGHT_CSS = [
  'max(0px, calc(',
  '(100vh * var(--site-zoom-inverse-scale, 1))',
  ' - var(--app-header-height, 0px)',
  ' - var(--app-main-vertical-padding, 0px)',
  '))'
].join('');

const LG_COLUMN_FR_VARIABLES = ['--dashboard-grid-lg-col-1-fr', '--dashboard-grid-lg-col-2-fr'] as const;
const XL_COLUMN_FR_VARIABLES = [
  '--dashboard-grid-xl-col-1-fr',
  '--dashboard-grid-xl-col-2-fr',
  '--dashboard-grid-xl-col-3-fr',
  '--dashboard-grid-xl-col-4-fr'
] as const;

const DEFAULT_LG_FR_UNITS = [1, 1] as const;
const DEFAULT_XL_FR_UNITS = [1, 1.25, 1, 0.9] as const;
const LG_MIN_WIDTH_REM = [24, 24] as const;
const XL_MIN_WIDTH_REM = [24, 32, 30, 24] as const;

type DesktopGridMode = 'base' | 'lg' | 'xl';
type ResizableGridMode = Exclude<DesktopGridMode, 'base'>;

interface DragState {
  pointerId: number;
  mode: ResizableGridMode;
  handleIndex: number;
  startX: number;
  startWidths: number[];
  minVisualWidths: number[];
  columnGap: number;
  handleElement: HTMLDivElement;
  currentWidths: number[];
  currentFrUnits: number[];
}

const DESKTOP_GRID_STYLE: CSSProperties = {
  height: DESKTOP_GRID_MAIN_HEIGHT_CSS,
  ...({
    '--dashboard-grid-lg-col-1-fr': `${DEFAULT_LG_FR_UNITS[0]}fr`,
    '--dashboard-grid-lg-col-2-fr': `${DEFAULT_LG_FR_UNITS[1]}fr`,
    '--dashboard-grid-xl-col-1-fr': `${DEFAULT_XL_FR_UNITS[0]}fr`,
    '--dashboard-grid-xl-col-2-fr': `${DEFAULT_XL_FR_UNITS[1]}fr`,
    '--dashboard-grid-xl-col-3-fr': `${DEFAULT_XL_FR_UNITS[2]}fr`,
    '--dashboard-grid-xl-col-4-fr': `${DEFAULT_XL_FR_UNITS[3]}fr`
  } as Record<string, string>)
};

function resolveDesktopGridMode(viewportWidth: number): DesktopGridMode {
  if (viewportWidth >= 1280) {
    return 'xl';
  }
  if (viewportWidth >= 1024) {
    return 'lg';
  }
  return 'base';
}

function readGridColumnGapPixels(gridElement: HTMLElement): number {
  const computedStyle = getComputedStyle(gridElement);
  const columnGap = parseFloat(computedStyle.columnGap);
  if (Number.isFinite(columnGap) && !Number.isNaN(columnGap)) {
    return Math.max(columnGap, 0);
  }

  const gap = parseFloat(computedStyle.gap);
  if (Number.isFinite(gap) && !Number.isNaN(gap)) {
    return Math.max(gap, 0);
  }

  return 0;
}

function readModeColumnCount(mode: ResizableGridMode): number {
  return mode === 'xl' ? 4 : 2;
}

function readModeMinRemWidths(mode: ResizableGridMode): readonly number[] {
  return mode === 'xl' ? XL_MIN_WIDTH_REM : LG_MIN_WIDTH_REM;
}

function readModeFrVariables(mode: ResizableGridMode): readonly string[] {
  return mode === 'xl' ? XL_COLUMN_FR_VARIABLES : LG_COLUMN_FR_VARIABLES;
}

function sanitizeFrUnits(values: readonly number[], columnCount: number): number[] {
  const safeValues = values
    .slice(0, columnCount)
    .map((value) => (Number.isFinite(value) && !Number.isNaN(value) ? Math.max(value, 0.0001) : 0.0001));
  if (safeValues.length === columnCount) {
    return safeValues;
  }

  return Array.from({ length: columnCount }, (_, index) => safeValues[index] ?? 1);
}

export function DashboardDesktopGrid({ sections }: { sections: DashboardSectionConfig[] }): JSX.Element {
  const gridElementRef = useRef<HTMLDivElement | null>(null);
  const handleElementRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameRequestRef = useRef<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragListenersCleanupRef = useRef<(() => void) | null>(null);
  const modeRef = useRef<DesktopGridMode>('base');
  const modeFrUnitsRef = useRef<{ lg: number[]; xl: number[] }>({
    lg: [...DEFAULT_LG_FR_UNITS],
    xl: [...DEFAULT_XL_FR_UNITS]
  });
  const [gridMode, setGridMode] = useState<DesktopGridMode>(() =>
    typeof window === 'undefined' ? 'xl' : resolveDesktopGridMode(window.innerWidth)
  );
  const [activeHandleIndex, setActiveHandleIndex] = useState<number | null>(null);

  const resizeHandleCount = useMemo(() => {
    if (gridMode === 'xl') {
      return 3;
    }
    if (gridMode === 'lg') {
      return 1;
    }
    return 0;
  }, [gridMode]);

  const applyFrUnitsToGrid = useCallback((mode: ResizableGridMode, frUnits: readonly number[]) => {
    const gridElement = gridElementRef.current;
    if (!gridElement) {
      return;
    }

    const columnCount = readModeColumnCount(mode);
    const variables = readModeFrVariables(mode);
    const normalized = sanitizeFrUnits(frUnits, columnCount);

    normalized.forEach((value, index) => {
      const variableName = variables[index];
      if (!variableName) {
        return;
      }
      gridElement.style.setProperty(variableName, `${Number(value.toFixed(5))}fr`);
    });

    modeFrUnitsRef.current[mode] = normalized;
  }, []);

  const updateHandleOffsets = useCallback((columnWidths: readonly number[], columnGap: number) => {
    const offsets = calculateResizeHandleOffsets(columnWidths, columnGap);
    handleElementRefs.current.forEach((handleElement, index) => {
      if (!handleElement) {
        return;
      }

      const offset = offsets[index];
      if (offset === undefined) {
        handleElement.style.left = '-9999px';
        return;
      }
      handleElement.style.left = `${Number(offset.toFixed(3))}px`;
    });
  }, []);

  const readCurrentColumnMetrics = useCallback((mode: ResizableGridMode) => {
    const gridElement = gridElementRef.current;
    if (!gridElement) {
      return null;
    }

    const columnCount = readModeColumnCount(mode);
    const allItems = Array.from(gridElement.querySelectorAll<HTMLElement>('.dashboard-desktop-grid__item'));
    const firstRowItems = allItems.slice(0, columnCount);
    const columnGap = readGridColumnGapPixels(gridElement);

    if (firstRowItems.length === columnCount) {
      const widths = firstRowItems.map((item) => item.getBoundingClientRect().width);
      return { widths, columnGap };
    }

    const containerWidth = gridElement.getBoundingClientRect().width;
    const availableWidth = Math.max(containerWidth - columnGap * Math.max(columnCount - 1, 0), 0);
    const frUnits = modeFrUnitsRef.current[mode];
    const totalFr = frUnits.reduce((sum, value) => sum + value, 0);
    const safeTotalFr = totalFr > 0 ? totalFr : columnCount;
    const fallbackWidths = frUnits.map((value) => (availableWidth * value) / safeTotalFr);
    return { widths: fallbackWidths, columnGap };
  }, []);

  const syncHandlesForActiveMode = useCallback(() => {
    const currentMode = modeRef.current;
    if (currentMode === 'base') {
      return;
    }

    const metrics = readCurrentColumnMetrics(currentMode);
    if (!metrics) {
      return;
    }

    updateHandleOffsets(metrics.widths, metrics.columnGap);
  }, [readCurrentColumnMetrics, updateHandleOffsets]);

  useEffect(() => {
    modeRef.current = gridMode;
    if (gridMode === 'base') {
      return;
    }

    applyFrUnitsToGrid(gridMode, modeFrUnitsRef.current[gridMode]);
    syncHandlesForActiveMode();
  }, [applyFrUnitsToGrid, gridMode, syncHandlesForActiveMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setGridMode((previous) => {
        const next = resolveDesktopGridMode(window.innerWidth);
        return previous === next ? previous : next;
      });
      syncHandlesForActiveMode();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener(SITE_ZOOM_CHANGE_EVENT, handleResize as EventListener);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener(SITE_ZOOM_CHANGE_EVENT, handleResize as EventListener);
    };
  }, [syncHandlesForActiveMode]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const gridElement = gridElementRef.current;
    if (!gridElement) {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncHandlesForActiveMode();
    });
    observer.observe(gridElement);

    return () => {
      observer.disconnect();
    };
  }, [syncHandlesForActiveMode]);

  useEffect(() => {
    return () => {
      if (frameRequestRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frameRequestRef.current);
      }
      frameRequestRef.current = null;
      dragListenersCleanupRef.current?.();
      dragListenersCleanupRef.current = null;
      const dragState = dragStateRef.current;
      if (dragState && dragState.handleElement.hasPointerCapture(dragState.pointerId)) {
        dragState.handleElement.releasePointerCapture(dragState.pointerId);
      }
      dragStateRef.current = null;
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>, handleIndex: number) => {
    const currentMode = modeRef.current;
    if (event.button !== 0 || currentMode === 'base') {
      return;
    }

    const metrics = readCurrentColumnMetrics(currentMode);
    if (!metrics) {
      return;
    }

    const startWidths = metrics.widths;
    if (startWidths.length <= handleIndex + 1) {
      return;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const rootFontSize = parseFloat(rootStyle.fontSize) || 16;
    const siteZoomScale = readSiteZoomScaleFromComputedStyle(rootStyle);
    const baseMinVisualWidths = readModeMinRemWidths(currentMode).map((remValue) =>
      remToVisualPixels(remValue, rootFontSize, siteZoomScale)
    );
    const totalBaseMinWidth = baseMinVisualWidths.reduce((sum, value) => sum + value, 0);
    const availableWidth = Math.max(startWidths.reduce((sum, value) => sum + value, 0), 0);
    const minScale = totalBaseMinWidth > availableWidth && totalBaseMinWidth > 0
      ? availableWidth / totalBaseMinWidth
      : 1;
    const minVisualWidths = baseMinVisualWidths.map((value) => value * minScale);

    const pointerId = event.pointerId;
    setActiveHandleIndex(handleIndex);
    event.preventDefault();
    event.currentTarget.setPointerCapture(pointerId);

    const dragState: DragState = {
      pointerId,
      mode: currentMode,
      handleIndex,
      startX: event.clientX,
      startWidths,
      minVisualWidths,
      columnGap: metrics.columnGap,
      handleElement: event.currentTarget,
      currentWidths: startWidths,
      currentFrUnits: modeFrUnitsRef.current[currentMode]
    };

    dragStateRef.current = dragState;
    dragListenersCleanupRef.current?.();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag || moveEvent.pointerId !== currentDrag.pointerId) {
        return;
      }

      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - currentDrag.startX;
      const nextWidths = clampColumnWidthByPair(
        currentDrag.startWidths,
        currentDrag.minVisualWidths,
        currentDrag.handleIndex,
        deltaX
      );
      const nextFrUnits = columnWidthsToFrUnits(nextWidths);
      currentDrag.currentWidths = nextWidths;
      currentDrag.currentFrUnits = nextFrUnits;

      if (frameRequestRef.current !== null) {
        window.cancelAnimationFrame(frameRequestRef.current);
      }

      frameRequestRef.current = window.requestAnimationFrame(() => {
        frameRequestRef.current = null;
        const activeDrag = dragStateRef.current;
        if (!activeDrag) {
          return;
        }
        applyFrUnitsToGrid(activeDrag.mode, activeDrag.currentFrUnits);
        updateHandleOffsets(activeDrag.currentWidths, activeDrag.columnGap);
      });
    };

    const finishPointerDrag = (finishEvent: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag || finishEvent.pointerId !== currentDrag.pointerId) {
        return;
      }

      if (frameRequestRef.current !== null) {
        window.cancelAnimationFrame(frameRequestRef.current);
        frameRequestRef.current = null;
      }

      applyFrUnitsToGrid(currentDrag.mode, currentDrag.currentFrUnits);
      updateHandleOffsets(currentDrag.currentWidths, currentDrag.columnGap);

      if (currentDrag.handleElement.hasPointerCapture(currentDrag.pointerId)) {
        currentDrag.handleElement.releasePointerCapture(currentDrag.pointerId);
      }

      dragStateRef.current = null;
      setActiveHandleIndex(null);

      dragListenersCleanupRef.current?.();
      dragListenersCleanupRef.current = null;
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPointerDrag);
      window.removeEventListener('pointercancel', finishPointerDrag);
    };
    dragListenersCleanupRef.current = cleanupListeners;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishPointerDrag);
    window.addEventListener('pointercancel', finishPointerDrag);
  };

  return (
    <div
      ref={gridElementRef}
      className="dashboard-desktop-grid relative grid auto-rows-fr items-stretch gap-4"
      style={DESKTOP_GRID_STYLE}
    >
      {sections.map((section) => (
        <div key={section.id} data-view={section.id} className="dashboard-desktop-grid__item h-full min-h-0">
          {section.node}
        </div>
      ))}
      {Array.from({ length: resizeHandleCount }).map((_, index) => (
        <div
          key={`desktop-grid-resize-handle-${index}`}
          ref={(element) => {
            handleElementRefs.current[index] = element;
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label={`カラム幅調整ハンドル ${index + 1}`}
          className={`dashboard-desktop-grid__resize-handle ${
            activeHandleIndex === index ? 'dashboard-desktop-grid__resize-handle--active' : ''
          }`}
          onPointerDown={(event) => handlePointerDown(event, index)}
        >
          <span className="dashboard-desktop-grid__resize-handle-icon" aria-hidden>
            ⋮⋮
          </span>
          <span className="sr-only">ドラッグしてカラム幅を調整</span>
        </div>
      ))}
    </div>
  );
}
