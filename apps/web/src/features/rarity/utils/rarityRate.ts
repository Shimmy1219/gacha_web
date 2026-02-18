import { clampRate } from '../../../logic/rarityTable';

export const MAX_RATE_FRACTION_DIGITS = 13;
export const MAX_PERCENT_FRACTION_DIGITS = 10;

const ELLIPSIS = '...';

interface RepeatingFractionPattern {
  prefix: string;
  pattern: string;
}

function detectRepeatingFractionPattern(value: string): RepeatingFractionPattern | null {
  if (!value) {
    return null;
  }

  for (let prefixLength = 0; prefixLength <= value.length - 3; prefixLength += 1) {
    const suffix = value.slice(prefixLength);

    for (let patternLength = 1; patternLength <= suffix.length / 2; patternLength += 1) {
      const minimumLength = patternLength * 2;
      if (suffix.length < minimumLength) {
        break;
      }

      const pattern = suffix.slice(0, patternLength);
      if (!pattern) {
        continue;
      }

      let matches = true;
      for (let offset = 0; offset < suffix.length; offset += patternLength) {
        const segment = suffix.slice(offset, offset + patternLength);
        if (segment.length === 0) {
          break;
        }
        if (segment.length < patternLength) {
          if (!pattern.startsWith(segment)) {
            matches = false;
          }
          break;
        }
        if (segment !== pattern) {
          matches = false;
          break;
        }
      }

      if (!matches) {
        continue;
      }

      if (/^0+$/.test(pattern)) {
        continue;
      }

      return {
        prefix: value.slice(0, prefixLength),
        pattern
      };
    }
  }

  return null;
}

function buildRepeatingFractionPreview({ prefix, pattern }: RepeatingFractionPattern): string {
  if (pattern.length === 0) {
    return prefix;
  }

  if (pattern.length === 1) {
    return `${prefix}${pattern.repeat(2)}`;
  }

  return `${prefix}${pattern}`;
}

export function formatRarityRate(rate?: number): string {
  if (rate == null || Number.isNaN(rate)) {
    return '';
  }

  if (!Number.isFinite(rate)) {
    return '';
  }

  if (rate === 0) {
    return '0';
  }

  const sign = rate < 0 ? '-' : '';
  const absRate = Math.abs(rate);
  const normalizedRate = absRate.toFixed(MAX_RATE_FRACTION_DIGITS);
  const [rateIntegerRaw, rateFractionRaw = ''] = normalizedRate.split('.');
  const rateFraction = rateFractionRaw.padEnd(MAX_RATE_FRACTION_DIGITS, '0');
  const digits = `${rateIntegerRaw}${rateFraction}`;
  const shift = rateIntegerRaw.length + 2;
  const paddedDigits = digits.padEnd(shift + MAX_PERCENT_FRACTION_DIGITS, '0');
  const integerDigits = paddedDigits.slice(0, shift);
  let fractionalDigits = paddedDigits.slice(shift, shift + MAX_PERCENT_FRACTION_DIGITS);

  const integerPart = integerDigits.replace(/^0+(?=\d)/, '') || '0';

  if (!fractionalDigits || /^0+$/.test(fractionalDigits)) {
    const formattedInteger = `${sign}${integerPart}`;
    return formattedInteger === '-0' ? '0' : formattedInteger;
  }

  const repeating = detectRepeatingFractionPattern(fractionalDigits);
  if (repeating) {
    const preview = buildRepeatingFractionPreview(repeating);
    return `${sign}${integerPart}.${preview}${ELLIPSIS}`;
  }

  while (fractionalDigits.endsWith('0')) {
    fractionalDigits = fractionalDigits.slice(0, -1);
  }

  const formatted = `${sign}${integerPart}.${fractionalDigits}`;
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
