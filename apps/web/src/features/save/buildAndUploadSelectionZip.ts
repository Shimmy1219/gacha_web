import type { GachaLocalStorageSnapshot } from '@domain/app-persistence';

import { buildUserZipFromSelection } from './buildUserZip';
import type { SaveTargetSelection, ZipBuildResult } from './types';
import type { UploadZipArgs, UploadZipResult } from './useBlobUpload';

interface BuildAndUploadSelectionZipParams {
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
  userId: string;
  userName: string;
  ownerName: string;
  ownerId: string;
  uploadZip: (args: UploadZipArgs) => Promise<UploadZipResult>;
  ownerDiscordId?: string | null;
  ownerDiscordName?: string | null;
  onBlobReuploadRetry?: UploadZipArgs['onBlobReuploadRetry'];
  itemIdFilter?: Set<string>;
  excludeRiaguImages?: boolean;
  onZipBuilt?: (zip: ZipBuildResult) => void | Promise<void>;
}

export interface BuildAndUploadSelectionZipResult {
  zip: ZipBuildResult;
  uploadResponse: UploadZipResult;
}

export async function buildAndUploadSelectionZip({
  snapshot,
  selection,
  userId,
  userName,
  ownerName,
  ownerId,
  uploadZip,
  ownerDiscordId,
  ownerDiscordName,
  onBlobReuploadRetry,
  itemIdFilter,
  excludeRiaguImages,
  onZipBuilt
}: BuildAndUploadSelectionZipParams): Promise<BuildAndUploadSelectionZipResult> {
  const zip = await buildUserZipFromSelection({
    snapshot,
    selection,
    userId,
    userName,
    ownerName,
    ownerId,
    itemIdFilter,
    excludeRiaguImages
  });

  if (onZipBuilt) {
    await onZipBuilt(zip);
  }

  const uploadResponse = await uploadZip({
    file: zip.blob,
    fileName: zip.fileName,
    userId,
    receiverName: userName,
    ownerDiscordId,
    ownerDiscordName,
    onBlobReuploadRetry
  });

  return { zip, uploadResponse };
}
