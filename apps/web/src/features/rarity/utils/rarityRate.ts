export function formatRarityRate(rate?: number): string {
  if (rate == null || Number.isNaN(rate)) {
    return '';
  }

  const percent = rate * 100;
  if (!Number.isFinite(percent)) {
    return '';
  }

  if (percent === 0) {
    return '0';
  }

  const absPercent = Math.abs(percent);
  let maximumFractionDigits = 2;
  if (absPercent < 0.0001) {
    maximumFractionDigits = 8;
  } else if (absPercent < 0.01) {
    maximumFractionDigits = 6;
  } else if (absPercent < 1) {
    maximumFractionDigits = 6;
  } else if (absPercent < 10) {
    maximumFractionDigits = 4;
  } else if (absPercent < 100) {
    maximumFractionDigits = 2;
  } else {
    maximumFractionDigits = 0;
  }

  return new Intl.NumberFormat('ja-JP', {
    useGrouping: false,
    maximumFractionDigits
  }).format(percent);
}

export function parseRarityRateInput(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return null;
  }

  const clamped = Math.min(Math.max(parsed, 0), 100);
  return clamped / 100;
}
