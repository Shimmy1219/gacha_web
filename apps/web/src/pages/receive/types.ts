export type ReceiveMediaKind = 'image' | 'video' | 'audio' | 'text' | 'other';

export interface ReceiveMediaItem {
  id: string;
  path: string;
  filename: string;
  size: number;
  blob: Blob;
  kind: ReceiveMediaKind;
  mimeType?: string;
}
