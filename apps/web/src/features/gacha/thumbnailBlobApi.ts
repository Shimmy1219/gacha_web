import { put } from '@vercel/blob/client';

import {
  createCsrfRetryRequestHeaders,
  fetchWithCsrfRetry
} from '../csrf/csrfGuards';
import { resolveThumbnailOwnerId } from './thumbnailOwnerId';

const BLOB_CSRF_ENDPOINT = '/api/blob/csrf';
const THUMBNAIL_UPLOAD_ENDPOINT = '/api/blob/thumbnail/upload';
const THUMBNAIL_RESOLVE_ENDPOINT = '/api/blob/thumbnail/resolve';

interface CsrfPayload {
  ok?: boolean;
  token?: string;
  error?: string;
}

interface PrepareUploadPayload {
  ok?: boolean;
  token?: string;
  pathname?: string;
  ownerId?: string;
  contentType?: string;
  error?: string;
}

interface CommitUploadPayload {
  ok?: boolean;
  url?: string;
  ownerId?: string;
  updatedAt?: string;
  error?: string;
}

interface DeletePayload {
  ok?: boolean;
  error?: string;
}

export type ThumbnailResolveMatch = 'owner' | 'fallback' | 'not_found' | 'ambiguous';

interface ResolvePayload {
  ok?: boolean;
  results?: Array<{
    gachaId?: string | null;
    ownerId?: string | null;
    url?: string | null;
    updatedAt?: string | null;
    match?: ThumbnailResolveMatch;
  }>;
  error?: string;
}

export interface UploadGachaThumbnailToBlobParams {
  gachaId: string;
  file: File;
  ownerName?: string | null;
  discordUserId?: string | null;
}

export interface UploadGachaThumbnailToBlobResult {
  url: string;
  ownerId: string;
  updatedAt: string | null;
}

export interface DeleteGachaThumbnailFromBlobParams {
  gachaId: string;
  ownerId: string;
  discordUserId?: string | null;
}

export interface ResolveGachaThumbnailRequest {
  gachaId: string;
  ownerId?: string | null;
}

export interface ResolveGachaThumbnailResult {
  gachaId: string | null;
  ownerId: string | null;
  url: string | null;
  updatedAt: string | null;
  match: ThumbnailResolveMatch;
}

/**
 * 配信サムネイルBlob API専用エラー。
 */
export class GachaThumbnailBlobError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'GachaThumbnailBlobError';
    if (options?.cause) {
      try {
        (this as Error & { cause?: unknown }).cause = options.cause;
      } catch {
        // noop
      }
    }
  }
}

async function requestBlobCsrfToken(): Promise<string> {
  const response = await fetch(`${BLOB_CSRF_ENDPOINT}?ts=${Date.now()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = (await response.json().catch(() => null)) as CsrfPayload | null;
  if (!response.ok || !payload?.ok || typeof payload.token !== 'string' || payload.token.length === 0) {
    const reason = payload?.error ?? `status ${response.status}`;
    throw new GachaThumbnailBlobError(`CSRFトークンの取得に失敗しました (${reason})`);
  }
  return payload.token;
}

async function withCsrfRetry<T>(
  perform: (csrf: string, meta: { attempt: number; retryEnabled: true }) => Promise<Response>,
  parse: (response: Response, payload: unknown) => T
): Promise<T> {
  const csrfRef = { current: null as string | null };
  const response = await fetchWithCsrfRetry({
    fetcher: fetch,
    getToken: async () => {
      if (!csrfRef.current) {
        csrfRef.current = await requestBlobCsrfToken();
      }
      return csrfRef.current;
    },
    refreshToken: async () => {
      csrfRef.current = await requestBlobCsrfToken();
      return csrfRef.current;
    },
    performRequest: async (csrf, _fetcher, meta) => await perform(csrf, meta),
    maxRetry: 1
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  return parse(response, payload);
}

function validateImageContentType(file: File): string {
  const normalized = file.type.trim().toLowerCase();
  if (normalized === 'image/png') {
    return 'image/png';
  }
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.png')) {
    return 'image/png';
  }
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  throw new GachaThumbnailBlobError('配信サムネイルには PNG / JPG のみ登録できます。');
}

/**
 * サムネイル画像を Blob へアップロードし、索引を確定する。
 *
 * @param params アップロード対象情報
 * @returns 保存済みURLとownerId
 */
export async function uploadGachaThumbnailToBlob(
  params: UploadGachaThumbnailToBlobParams
): Promise<UploadGachaThumbnailToBlobResult> {
  if (!(params.file instanceof File)) {
    throw new GachaThumbnailBlobError('アップロード対象ファイルが不正です。');
  }
  const gachaId = params.gachaId.trim();
  if (!gachaId) {
    throw new GachaThumbnailBlobError('gachaIdが不正です。');
  }
  const contentType = validateImageContentType(params.file);
  const ownerId = resolveThumbnailOwnerId(params.discordUserId ?? null);
  if (!ownerId) {
    throw new GachaThumbnailBlobError('ownerIdを解決できませんでした。');
  }

  const anonOwnerId = params.discordUserId?.trim() ? undefined : ownerId;

  const prepare = await withCsrfRetry<{
    token: string;
    pathname: string;
    ownerId: string;
    contentType: string;
  }>(
    async (csrf, meta) =>
      await fetch(THUMBNAIL_UPLOAD_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...createCsrfRetryRequestHeaders(meta)
        },
        body: JSON.stringify({
          action: 'prepare-upload',
          csrf,
          gachaId,
          contentType,
          ownerName: params.ownerName ?? undefined,
          anonOwnerId
        })
      }),
    (response, payload) => {
      const typed = payload as PrepareUploadPayload | null;
      if (!response.ok || !typed?.ok || !typed.token || !typed.pathname || !typed.ownerId) {
        const reason = typed?.error ?? `status ${response.status}`;
        throw new GachaThumbnailBlobError(`配信サムネイルのアップロード準備に失敗しました (${reason})`);
      }
      return {
        token: typed.token,
        pathname: typed.pathname,
        ownerId: typed.ownerId,
        contentType: typed.contentType ?? contentType
      };
    }
  );

  const uploaded = await put(prepare.pathname, params.file, {
    access: 'public',
    multipart: true,
    contentType: prepare.contentType,
    token: prepare.token
  });
  const uploadedUrl = uploaded.url ?? uploaded.downloadUrl;
  if (!uploadedUrl) {
    throw new GachaThumbnailBlobError('配信サムネイルのアップロード結果にURLが含まれていません。');
  }

  return await withCsrfRetry<UploadGachaThumbnailToBlobResult>(
    async (csrf, meta) =>
      await fetch(THUMBNAIL_UPLOAD_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...createCsrfRetryRequestHeaders(meta)
        },
        body: JSON.stringify({
          action: 'commit-upload',
          csrf,
          gachaId,
          ownerId: prepare.ownerId,
          url: uploadedUrl,
          contentType: prepare.contentType,
          anonOwnerId
        })
      }),
    (response, payload) => {
      const typed = payload as CommitUploadPayload | null;
      if (!response.ok || !typed?.ok || !typed.url || !typed.ownerId) {
        const reason = typed?.error ?? `status ${response.status}`;
        throw new GachaThumbnailBlobError(`配信サムネイルの登録確定に失敗しました (${reason})`);
      }
      return {
        url: typed.url,
        ownerId: typed.ownerId,
        updatedAt: typed.updatedAt ?? null
      };
    }
  );
}

/**
 * 指定ガチャの配信サムネイルを Blob から削除する。
 *
 * @param params 削除対象情報
 */
export async function deleteGachaThumbnailFromBlob(
  params: DeleteGachaThumbnailFromBlobParams
): Promise<void> {
  const gachaId = params.gachaId.trim();
  const ownerId = params.ownerId.trim();
  if (!gachaId || !ownerId) {
    throw new GachaThumbnailBlobError('削除対象のgachaIdまたはownerIdが不正です。');
  }
  const anonOwnerId = params.discordUserId?.trim() ? undefined : ownerId;

  await withCsrfRetry<void>(
    async (csrf, meta) =>
      await fetch(THUMBNAIL_UPLOAD_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...createCsrfRetryRequestHeaders(meta)
        },
        body: JSON.stringify({
          action: 'delete',
          csrf,
          gachaId,
          ownerId,
          anonOwnerId
        })
      }),
    (response, payload) => {
      const typed = payload as DeletePayload | null;
      if (!response.ok || !typed?.ok) {
        const reason = typed?.error ?? `status ${response.status}`;
        throw new GachaThumbnailBlobError(`配信サムネイルの削除に失敗しました (${reason})`);
      }
    }
  );
}

/**
 * 複数ガチャの配信サムネイルURLを一括解決する。
 *
 * @param requests 解決要求
 * @returns 入力順の解決結果
 */
export async function resolveGachaThumbnailFromBlob(
  requests: ResolveGachaThumbnailRequest[]
): Promise<ResolveGachaThumbnailResult[]> {
  if (!Array.isArray(requests) || requests.length === 0) {
    return [];
  }
  const response = await fetch(THUMBNAIL_RESOLVE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: requests.map((request) => ({
        gachaId: request.gachaId,
        ownerId: request.ownerId ?? undefined
      }))
    })
  });
  const payload = (await response.json().catch(() => null)) as ResolvePayload | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.results)) {
    const reason = payload?.error ?? `status ${response.status}`;
    throw new GachaThumbnailBlobError(`配信サムネイルの解決に失敗しました (${reason})`);
  }
  return payload.results.map((entry) => ({
    gachaId: typeof entry?.gachaId === 'string' ? entry.gachaId : null,
    ownerId: typeof entry?.ownerId === 'string' ? entry.ownerId : null,
    url: typeof entry?.url === 'string' ? entry.url : null,
    updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : null,
    match:
      entry?.match === 'owner' ||
      entry?.match === 'fallback' ||
      entry?.match === 'ambiguous' ||
      entry?.match === 'not_found'
        ? entry.match
        : 'not_found'
  }));
}
