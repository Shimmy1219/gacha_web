import type { CSSProperties } from 'react';

import {
  GOLD_HEX,
  RAINBOW_VALUE,
  SILVER_HEX
} from '../../../pages/gacha/components/rarity/color-picker/palette';

export interface RarityTextPresentation {
  className?: string;
  style?: CSSProperties;
}

interface GradientConfig {
  className: string;
  caretColor: string;
}

const GRADIENTS: Record<string, GradientConfig> = {
  [RAINBOW_VALUE]: { className: 'text-gradient-rainbow', caretColor: '#f4f4f5' },
  rainbow: { className: 'text-gradient-rainbow', caretColor: '#f4f4f5' },
  [GOLD_HEX]: { className: 'text-gradient-gold', caretColor: '#facc15' },
  gold: { className: 'text-gradient-gold', caretColor: '#facc15' },
  [SILVER_HEX]: { className: 'text-gradient-silver', caretColor: '#e5e7eb' },
  silver: { className: 'text-gradient-silver', caretColor: '#e5e7eb' }
};

export function getRarityTextPresentation(color?: string | null): RarityTextPresentation {
  if (!color) {
    return {};
  }

  const normalized = color.trim().toLowerCase();
  const gradient = GRADIENTS[normalized];
  if (gradient) {
    return { className: gradient.className, style: { caretColor: gradient.caretColor } };
  }

  return { style: { color } };
}
