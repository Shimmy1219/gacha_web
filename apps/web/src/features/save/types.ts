export type SaveTargetSelectionMode = 'all' | 'gacha' | 'history';

export type SaveTargetSelection =
  | { mode: 'all' }
  | { mode: 'gacha'; gachaIds: string[] }
  | { mode: 'history'; pullIds: string[]; newItemsOnlyPullIds?: string[] };

export interface SaveTargetSelectionSummaryItem {
  gachaId: string;
  gachaName: string;
}

export interface ZipBuildResult {
  blob: Blob;
  fileName: string;
  fileCount: number;
  warnings: string[];
  pullIds: string[];
}
