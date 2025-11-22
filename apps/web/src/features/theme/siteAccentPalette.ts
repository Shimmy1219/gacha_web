export interface SiteAccentPaletteEntry {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const SITE_ACCENT_PALETTE: SiteAccentPaletteEntry[] = [
  { id: 'cobalt-blue', name: 'コバルトブルー', light: '#2962FF', dark: '#2979FF' },
  { id: 'cerulean-blue', name: 'セルリアンブルー', light: '#039BE5', dark: '#40C4FF' },
  { id: 'turquoise', name: 'ターコイズ', light: '#26C6DA', dark: '#00E5FF' },
  { id: 'teal-green', name: 'ティールグリーン', light: '#00897B', dark: '#00BFA5' },
  { id: 'mint-green', name: 'ミントグリーン', light: '#43A047', dark: '#69F0AE' },
  { id: 'olive-green', name: 'オリーブグリーン', light: '#7CB342', dark: '#C6FF00' },
  { id: 'goldenrod', name: 'ゴールデンロッド', light: '#FBC02D', dark: '#FFD740' },
  { id: 'amber', name: 'アンバー', light: '#FFB300', dark: '#FFC400' },
  { id: 'sunset-orange', name: 'サンセットオレンジ', light: '#FB8C00', dark: '#FF9100' },
  { id: 'coral-pink', name: 'コーラルピンク', light: '#F06292', dark: '#FF4081' },
  { id: 'rose-pink', name: 'ローズピンク', light: '#EC407A', dark: '#F50057' },
  { id: 'violet', name: 'バイオレット', light: '#7E57C2', dark: '#B388FF' },
  { id: 'amethyst', name: 'アメジスト', light: '#9575CD', dark: '#C792EA' },
  { id: 'indigo', name: 'インディゴ', light: '#5C6BC0', dark: '#3D5AFE' },
  { id: 'scarlet', name: 'スカーレット', light: '#D32F2F', dark: '#FF5252' },
  { id: 'tomato-red', name: 'トマトレッド', light: '#E53935', dark: '#FF6D6D' },
  { id: 'chocolate', name: 'チョコレート', light: '#8D6E63', dark: '#BCAAA4' },
  { id: 'slate-gray', name: 'スレートグレー', light: '#546E7A', dark: '#90A4AE' },
  { id: 'sand-rose', name: 'サンドローズ', light: '#F48FB1', dark: '#FF80AB' },
  { id: 'ice-blue', name: 'アイスブルー', light: '#81D4FA', dark: '#00B8D4' }
];
