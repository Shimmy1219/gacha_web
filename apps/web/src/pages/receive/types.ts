export type ReceiveMediaKind = 'image' | 'video' | 'audio' | 'text' | 'other';

export interface ReceiveItemMetadata {
  id: string;
  filePath: string | null;
  gachaId?: string | null;
  gachaName: string;
  itemId?: string | null;
  itemName: string;
  rarity: string;
  rarityColor: string | null;
  isRiagu: boolean;
  riaguType: string | null;
  obtainedCount: number;
  isNewForUser: boolean;
  isOmitted?: boolean;
}

export interface ReceiveMediaItem {
  id: string;
  path: string;
  filename: string;
  size: number;
  blob: Blob;
  kind: ReceiveMediaKind;
  mimeType?: string;
  metadata?: ReceiveItemMetadata;
}
