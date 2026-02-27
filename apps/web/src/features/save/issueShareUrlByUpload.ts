import type { AppPersistence, GachaLocalStorageSnapshot } from '@domain/app-persistence';

import type { SaveTargetSelection, ZipBuildResult } from './types';
import { buildAndUploadSelectionZip } from './buildAndUploadSelectionZip';
import type { UploadZipArgs, UploadZipResult } from './useBlobUpload';
import { resolveThumbnailOwnerId } from '../gacha/thumbnailOwnerId';
import { formatDiscordShareExpiresAt } from '../discord/shareMessage';

export interface IssuedShareLinkResult {
  url: string;
  label?: string;
  expiresAt?: string;
}

export interface IssueShareUrlByUploadParams {
  persistence: AppPersistence;
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
  userId: string;
  userName: string;
  ownerName: string;
  ownerDiscordId?: string | null;
  ownerDiscordName?: string | null;
  uploadZip: (args: UploadZipArgs) => Promise<UploadZipResult>;
  itemIdFilter?: Set<string>;
  excludeRiaguImages?: boolean;
  onBlobReuploadRetry?: UploadZipArgs['onBlobReuploadRetry'];
  onZipBuilt?: (zip: ZipBuildResult) => void | Promise<void>;
}

export interface IssueShareUrlByUploadResult {
  zip: ZipBuildResult;
  uploadResponse: UploadZipResult;
  shareLink: IssuedShareLinkResult;
}

/**
 * 保存オプションの「zipファイルをアップロード」と同等の共有URL発行処理を実行する。
 * ZIP生成・Blobアップロード・saveOptions保存をまとめて行い、呼び出し側でステータス更新のみ扱えるようにする。
 *
 * @param params 共有URL発行に必要な入力
 * @returns 発行した共有リンク情報とZIP/アップロード結果
 */
export async function issueShareUrlByUpload({
  persistence,
  snapshot,
  selection,
  userId,
  userName,
  ownerName,
  ownerDiscordId,
  ownerDiscordName,
  uploadZip,
  itemIdFilter,
  excludeRiaguImages,
  onBlobReuploadRetry,
  onZipBuilt
}: IssueShareUrlByUploadParams): Promise<IssueShareUrlByUploadResult> {
  const resolvedOwnerId = resolveThumbnailOwnerId(ownerDiscordId ?? null);
  if (!resolvedOwnerId) {
    throw new Error('配信サムネイルownerIdを解決できませんでした。');
  }

  const { zip, uploadResponse } = await buildAndUploadSelectionZip({
    snapshot,
    selection,
    userId,
    userName,
    ownerName,
    ownerId: resolvedOwnerId,
    uploadZip,
    ownerDiscordId,
    ownerDiscordName,
    onBlobReuploadRetry,
    itemIdFilter,
    excludeRiaguImages,
    onZipBuilt
  });

  const savedAt = new Date().toISOString();
  persistence.savePartial({
    saveOptions: {
      [userId]: {
        version: 3,
        key: uploadResponse.token,
        shareUrl: uploadResponse.shareUrl,
        downloadUrl: uploadResponse.downloadUrl,
        expiresAt: uploadResponse.expiresAt,
        pathname: uploadResponse.pathname,
        savedAt
      }
    }
  });

  const shareLink: IssuedShareLinkResult = {
    url: uploadResponse.shareUrl,
    label: uploadResponse.shareUrl,
    expiresAt: formatDiscordShareExpiresAt(uploadResponse.expiresAt) ?? undefined
  };

  return { zip, uploadResponse, shareLink };
}
