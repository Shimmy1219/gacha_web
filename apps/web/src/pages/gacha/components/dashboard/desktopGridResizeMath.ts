export function clampColumnWidthByPair(
  widths: readonly number[],
  minWidths: readonly number[],
  handleIndex: number,
  deltaX: number
): number[] {
  if (handleIndex < 0 || handleIndex >= widths.length - 1) {
    return [...widths];
  }

  const next = [...widths];
  const leftStart = Math.max(widths[handleIndex] ?? 0, 0);
  const rightStart = Math.max(widths[handleIndex + 1] ?? 0, 0);
  const leftMin = Math.max(minWidths[handleIndex] ?? 0, 0);
  const rightMin = Math.max(minWidths[handleIndex + 1] ?? 0, 0);
  const pairTotal = leftStart + rightStart;
  const safeDelta = Number.isFinite(deltaX) && !Number.isNaN(deltaX) ? deltaX : 0;

  if (pairTotal <= 0) {
    return next;
  }

  const minLeft = Math.min(leftMin, pairTotal);
  const maxLeft = Math.max(minLeft, pairTotal - Math.min(rightMin, pairTotal));
  const clampedLeft = Math.min(Math.max(leftStart + safeDelta, minLeft), maxLeft);
  const clampedRight = Math.max(pairTotal - clampedLeft, 0);

  next[handleIndex] = clampedLeft;
  next[handleIndex + 1] = clampedRight;
  return next;
}

export function columnWidthsToFrUnits(widths: readonly number[]): number[] {
  if (widths.length === 0) {
    return [];
  }

  const safeWidths = widths.map((value) =>
    Number.isFinite(value) && !Number.isNaN(value) ? Math.max(value, 0) : 0
  );
  const total = safeWidths.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return safeWidths.map(() => 1);
  }

  const columnCount = safeWidths.length;
  return safeWidths.map((value) => (value / total) * columnCount);
}

export function calculateResizeHandleOffsets(widths: readonly number[], columnGap: number): number[] {
  if (widths.length <= 1) {
    return [];
  }

  const safeGap = Number.isFinite(columnGap) && !Number.isNaN(columnGap) ? Math.max(columnGap, 0) : 0;
  const offsets: number[] = [];
  let accumulated = 0;

  for (let index = 0; index < widths.length - 1; index += 1) {
    const safeWidth = Number.isFinite(widths[index]) && !Number.isNaN(widths[index])
      ? Math.max(widths[index], 0)
      : 0;
    accumulated += safeWidth;
    offsets.push(accumulated + safeGap * index + safeGap / 2);
  }

  return offsets;
}

export function remToVisualPixels(remValue: number, rootFontSizePx: number, siteZoomScale: number): number {
  const safeRem = Number.isFinite(remValue) && !Number.isNaN(remValue) ? Math.max(remValue, 0) : 0;
  const safeRootFont = Number.isFinite(rootFontSizePx) && !Number.isNaN(rootFontSizePx)
    ? Math.max(rootFontSizePx, 0)
    : 0;
  const safeScale = Number.isFinite(siteZoomScale) && !Number.isNaN(siteZoomScale)
    ? Math.max(siteZoomScale, 0)
    : 0;

  return safeRem * safeRootFont * safeScale;
}
