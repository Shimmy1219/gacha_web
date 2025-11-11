import { clampRate } from '../../../logic/rarityTable';

export const MAX_RATE_FRACTION_DIGITS = 12;

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

  const sign = percent < 0 ? '-' : '';
  const absPercent = Math.abs(percent);
  const factor = 10 ** MAX_RATE_FRACTION_DIGITS;
  const factorBigInt = BigInt(10) ** BigInt(MAX_RATE_FRACTION_DIGITS);
  const scaled = Math.floor(absPercent * factor + Number.EPSILON);
  const scaledBigInt = BigInt(scaled);
  const integerPartBigInt = scaledBigInt / factorBigInt;
  const fractionalPartBigInt = scaledBigInt % factorBigInt;
  const integerPart = integerPartBigInt.toString();

  if (fractionalPartBigInt === 0n) {
    return integerPart === '0' ? '0' : `${sign}${integerPart}`;
  }

  let fractionalPart = fractionalPartBigInt.toString().padStart(MAX_RATE_FRACTION_DIGITS, '0');
  while (fractionalPart.endsWith('0')) {
    fractionalPart = fractionalPart.slice(0, -1);
  }

  const formatted = `${sign}${integerPart}.${fractionalPart}`;
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

  const clampedPercent = Math.min(Math.max(parsed, 0), 100);
  return clampRate(clampedPercent / 100);
}
