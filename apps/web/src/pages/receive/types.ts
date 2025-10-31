export type ReceiveMediaKind = 'image' | 'video' | 'audio' | 'text' | 'other';

export interface ReceiveItemMetadata {
  id: string;
  filePath: string;
  gachaName: string;
  itemName: string;
  rarity: string;
  isRiagu: boolean;
  riaguType: string | null;
  obtainedCount: number;
  isNewForUser: boolean;
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
