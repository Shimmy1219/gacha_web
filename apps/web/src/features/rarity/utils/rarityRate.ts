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

  const maxFractionDigits = 12;
  let formatted = percent.toFixed(maxFractionDigits);

  if (formatted.includes('.')) {
    while (formatted.endsWith('0')) {
      formatted = formatted.slice(0, -1);
    }

    if (formatted.endsWith('.')) {
      formatted = formatted.slice(0, -1);
    }
  }

  if (formatted === '-0') {
    return '0';
  }

  return formatted;
}

export function parseRarityRateInput(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return null;
  }

  const clamped = Math.min(Math.max(parsed, 0), 100);
  return clamped / 100;
}
