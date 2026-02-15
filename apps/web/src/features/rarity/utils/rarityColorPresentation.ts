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

const WHITE_COLOR_VALUES = new Set([
  'white',
  '#fff',
  '#ffffff',
  'rgb(255,255,255)',
  'rgba(255,255,255,1)'
]);

const WHITE_RARITY_TEXT_OUTLINE_SHADOW =
  '-2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';

export function isWhiteRarityColor(color?: string | null): boolean {
  if (!color) {
    return false;
  }

  const normalized = color.trim().toLowerCase().replace(/\s+/g, '');
  return WHITE_COLOR_VALUES.has(normalized);
}

export function getWhiteRarityTextOutlineStyle(): CSSProperties {
  return {
    color: '#fff',
    WebkitTextFillColor: '#fff',
    textShadow: WHITE_RARITY_TEXT_OUTLINE_SHADOW
  };
}

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
