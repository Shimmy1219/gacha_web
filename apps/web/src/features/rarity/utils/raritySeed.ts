import { DEFAULT_PALETTE } from '../../../pages/gacha/components/rarity/color-picker/palette';

export const FALLBACK_RARITY_COLOR = '#3f3f46';

const RARITY_LABEL_OPTIONS = ['SR', 'UR', 'SSR', 'N', 'AR', 'NR', 'USR', 'SSSR', 'HR', 'はずれ'];

function generateFallbackLabel(existing: Set<string>): string {
  let counter = existing.size + 1;
  let fallback = `レアリティ${counter}`;
  while (existing.has(fallback)) {
    counter += 1;
    fallback = `レアリティ${counter}`;
  }
  return fallback;
}

export function generateRandomRarityLabel(existing: Set<string>): string {
  const trimmedExisting = new Set(
    Array.from(existing)
      .map((label) => label.trim())
      .filter((label): label is string => label.length > 0)
  );
  const unused = RARITY_LABEL_OPTIONS.filter((label) => !trimmedExisting.has(label));
  if (unused.length > 0) {
    const index = Math.floor(Math.random() * unused.length);
    return unused[index] ?? generateFallbackLabel(trimmedExisting);
  }

  return generateFallbackLabel(trimmedExisting);
}

export function generateRandomRarityColor(existingColors: Set<string>): string {
  const normalizedExisting = new Set(
    Array.from(existingColors)
      .map((color) => color.trim().toLowerCase())
      .filter((value): value is string => value.length > 0)
  );

  const unused = DEFAULT_PALETTE.filter(
    (option) => !normalizedExisting.has(option.value.trim().toLowerCase())
  );

  const pool = unused.length > 0 ? unused : DEFAULT_PALETTE;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected?.value ?? FALLBACK_RARITY_COLOR;
}

export function generateRandomRarityEmitRate(): number {
  const minPercent = 0.5;
  const maxPercent = 5;
  const percent = Math.random() * (maxPercent - minPercent) + minPercent;
  const rounded = Math.round(percent * 100) / 100;
  return rounded / 100;
}
