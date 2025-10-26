export interface ColorOption {
  id: string;
  name: string;
  value: string;
}

export const RAINBOW_VALUE = 'rainbow';
export const GOLD_HEX = '#d4af37';
export const SILVER_HEX = '#c0c0c0';

export const DEFAULT_PALETTE: ColorOption[] = [
  { id: 'ur-amber', name: 'UR(Amber)', value: '#f59e0b' },
  { id: 'ssr-yellow', name: 'SSR(Yellow)', value: '#fde68a' },
  { id: 'sr-violet', name: 'SR(Violet)', value: '#a78bfa' },
  { id: 'r-light-blue', name: 'R(LightBlue)', value: '#93c5fd' },
  { id: 'n-mint', name: 'N(Mint)', value: '#a7f3d0' },
  { id: 'lose-rose', name: 'はずれ(Rose)', value: '#fca5a5' },
  { id: 'red', name: 'Red', value: '#ef4444' },
  { id: 'orange', name: 'Orange', value: '#f97316' },
  { id: 'amber', name: 'Amber', value: '#eab308' },
  { id: 'lime', name: 'Lime', value: '#84cc16' },
  { id: 'green', name: 'Green', value: '#22c55e' },
  { id: 'teal', name: 'Teal', value: '#14b8a6' },
  { id: 'cyan', name: 'Cyan', value: '#06b6d4' },
  { id: 'blue', name: 'Blue', value: '#3b82f6' },
  { id: 'indigo', name: 'Indigo', value: '#6366f1' },
  { id: 'violet', name: 'Violet', value: '#8b5cf6' },
  { id: 'pink', name: 'Pink', value: '#ec4899' },
  { id: 'rose', name: 'Rose', value: '#f43f5e' },
  { id: 'gold', name: '金', value: GOLD_HEX },
  { id: 'silver', name: '銀', value: SILVER_HEX },
  { id: 'black', name: '黒', value: '#111111' },
  { id: 'gray', name: '灰', value: '#9ca3af' },
  { id: 'white', name: '白', value: '#ffffff' },
  { id: 'rainbow', name: '虹', value: RAINBOW_VALUE }
];

export function isRainbow(value: string): boolean {
  return value.toLowerCase() === RAINBOW_VALUE;
}

export function isGold(value: string): boolean {
  return value.toLowerCase() === GOLD_HEX;
}

export function isSilver(value: string): boolean {
  return value.toLowerCase() === SILVER_HEX;
}

export function isMetal(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === GOLD_HEX || normalized === SILVER_HEX;
}
