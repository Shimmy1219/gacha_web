import { useCallback, useRef } from 'react';
import { put } from '@vercel/blob/client';
import {
  API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
  fetchWithCsrfRetry,
  getCsrfMismatchGuideMessageJa,
  inspectCsrfFailurePayload,
  type CsrfFailureInspection
} from '../csrf/csrfGuards';

export interface UploadZipArgs {
  file: Blob;
  fileName: string;
  userId: string;
  receiverName: string;
  ownerDiscordId?: string | null;
  ownerDiscordName?: string | null;
}

export interface UploadZipResult {
  shareUrl: string;
  token: string;
  downloadUrl: string;
  expiresAt?: string;
  pathname?: string;
}

export const BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH = API_ERROR_CODE_CSRF_TOKEN_MISMATCH;

export type BlobUploadErrorCode = typeof BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH;

export class BlobUploadError extends Error {
  code?: BlobUploadErrorCode;
  csrfReason?: string;

  constructor(message: string, options?: { cause?: unknown; code?: BlobUploadErrorCode; csrfReason?: string }) {
    super(message);
    if (options?.cause) {
      try {
        (this as Error & { cause?: unknown }).cause = options.cause;
      } catch {
        // noop
      }
    }
    if (typeof options?.code === 'string') {
      this.code = options.code;
    }
    if (typeof options?.csrfReason === 'string') {
      this.csrfReason = options.csrfReason;
    }
    this.name = 'BlobUploadError';
  }
}

interface CsrfResponsePayload {
  ok?: boolean;
  token?: string;
}

interface ReceiveTokenResponse {
  ok?: boolean;
  shareUrl?: string;
  token?: string;
  exp?: number | string;
  error?: string;
  errorCode?: string;
  csrfReason?: string;
  csrfRetryable?: boolean;
}

interface PrepareUploadResponsePayload {
  ok?: boolean;
  token?: string;
  pathname?: string;
  fileName?: string;
  expiresAt?: string;
  error?: string;
  errorCode?: string;
  csrfReason?: string;
  csrfRetryable?: boolean;
}

interface PrepareUploadArgs {
  userId: string;
  fileName: string;
  purpose: string;
  ownerDiscordId?: string;
  ownerDiscordName?: string;
  receiverName?: string;
}

interface CsrfTokenProvider {
  getCsrfToken: () => Promise<string>;
  refreshCsrfToken: () => Promise<string>;
}

const CSRF_ENDPOINT = '/api/blob/csrf';
const UPLOAD_ENDPOINT = '/api/blob/upload';
const RECEIVE_TOKEN_ENDPOINT = '/api/receive/token';
const DEFAULT_PURPOSE = 'zips';

function resolveCsrfMismatchFailure(payload?: unknown, message?: unknown): CsrfFailureInspection | null {
  const inspection = inspectCsrfFailurePayload(payload);
  if (inspection.isMismatch) {
    return inspection;
  }
  if (typeof message !== 'string') {
    return null;
  }
  const normalized = message.toLowerCase();
  if (normalized.includes('csrf token mismatch') || normalized.includes('invalid csrf token')) {
    return {
      isMismatch: true,
      reason: null,
      source: null,
      retryable: true,
      message,
    };
  }
  return null;
}

function buildCsrfMismatchErrorMessage(context: string, reason: string, payload?: unknown): string {
  const inspection = resolveCsrfMismatchFailure(payload, reason);
  if (!inspection) {
    return `${context} (${reason})`;
  }
  const guide = getCsrfMismatchGuideMessageJa(inspection.reason);
  return `${context} (${reason})\n\n${guide}`;
}

export function isBlobUploadCsrfTokenMismatchError(error: unknown): boolean {
  if (error instanceof BlobUploadError && error.code === BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH) {
    return true;
  }
  if (error instanceof Error) {
    return Boolean(resolveCsrfMismatchFailure(undefined, error.message));
  }
  return false;
}

export function extractBlobUploadCsrfFailureReason(error: unknown): string | undefined {
  if (error instanceof BlobUploadError && typeof error.csrfReason === 'string' && error.csrfReason.length > 0) {
    return error.csrfReason;
  }
  return undefined;
}

function ensureZipFileName(fileName: string): void {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    throw new BlobUploadError('ZIPファイル名が指定されていません');
  }
  if (!/\.zip$/i.test(fileName)) {
    throw new BlobUploadError('ZIPファイルのみアップロードできます');
  }
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeExpiration(exp?: number | string): string | undefined {
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    const iso = new Date(exp).toISOString();
    return Number.isNaN(Date.parse(iso)) ? undefined : iso;
  }
  if (typeof exp === 'string') {
    const parsed = Date.parse(exp);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return undefined;
}

async function requestCsrf(fetcher: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(`${CSRF_ENDPOINT}?ts=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store'
    });
  } catch (error) {
    throw new BlobUploadError('CSRFトークンの取得に失敗しました (network error)', { cause: error });
  }

  let payload: CsrfResponsePayload | null = null;
  try {
    payload = (await response.json()) as CsrfResponsePayload;
  } catch (error) {
    throw new BlobUploadError('CSRFトークンの取得に失敗しました (invalid json)', { cause: error });
  }

  if (!response.ok || !payload?.token) {
    throw new BlobUploadError('CSRFトークンの取得に失敗しました');
  }

  return payload.token;
}

async function issueReceiveShareUrl(
  fetcher: typeof fetch,
  args: { downloadUrl: string; fileName: string } & CsrfTokenProvider
): Promise<{ shareUrl: string; token: string; expiresAt?: string }> {
  let response: Response;
  try {
    response = await fetchWithCsrfRetry({
      fetcher,
      getToken: async () => args.getCsrfToken(),
      refreshToken: async () => args.refreshCsrfToken(),
      performRequest: async (csrf, currentFetcher) =>
        currentFetcher(RECEIVE_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            url: args.downloadUrl,
            name: args.fileName,
            purpose: DEFAULT_PURPOSE,
            csrf
          })
        }),
      maxRetry: 1
    });
  } catch (error) {
    throw new BlobUploadError('共有リンクの発行に失敗しました (network error)', { cause: error });
  }

  let payload: ReceiveTokenResponse | null = null;
  try {
    payload = (await response.json()) as ReceiveTokenResponse;
  } catch (error) {
    throw new BlobUploadError('共有リンクの発行に失敗しました (invalid json)', { cause: error });
  }

  if (!response.ok || !payload?.ok || !payload.shareUrl || !payload.token) {
    const reason = payload?.error ?? `status ${response.status}`;
    const csrfFailure = resolveCsrfMismatchFailure(payload, reason);
    if (csrfFailure) {
      throw new BlobUploadError(buildCsrfMismatchErrorMessage('共有リンクの発行に失敗しました', reason, payload), {
        code: BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH,
        csrfReason: csrfFailure.reason ?? undefined
      });
    }
    throw new BlobUploadError(`共有リンクの発行に失敗しました (${reason})`);
  }

  return {
    shareUrl: payload.shareUrl,
    token: payload.token,
    expiresAt: normalizeExpiration(payload.exp)
  };
}

async function requestUploadAuthorization(
  fetcher: typeof fetch,
  args: PrepareUploadArgs & CsrfTokenProvider
): Promise<{ token: string; pathname: string; fileName?: string }> {
  let response: Response;
  try {
    response = await fetchWithCsrfRetry({
      fetcher,
      getToken: async () => args.getCsrfToken(),
      refreshToken: async () => args.refreshCsrfToken(),
      performRequest: async (csrf, currentFetcher) =>
        currentFetcher(UPLOAD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'prepare-upload',
            csrf,
            userId: args.userId,
            fileName: args.fileName,
            purpose: args.purpose,
            ownerDiscordId: args.ownerDiscordId,
            ownerDiscordName: args.ownerDiscordName,
            receiverName: args.receiverName
          })
        }),
      maxRetry: 1
    });
  } catch (error) {
    throw new BlobUploadError('アップロードポリシーの取得に失敗しました (network error)', { cause: error });
  }

  let payload: PrepareUploadResponsePayload | null = null;
  try {
    payload = (await response.json()) as PrepareUploadResponsePayload;
  } catch (error) {
    throw new BlobUploadError('アップロードポリシーの取得に失敗しました (invalid json)', { cause: error });
  }

  if (!response.ok || !payload?.ok || !payload.token || !payload.pathname) {
    const reason = payload?.error ?? `status ${response.status}`;
    const csrfFailure = resolveCsrfMismatchFailure(payload, reason);
    if (csrfFailure) {
      throw new BlobUploadError(buildCsrfMismatchErrorMessage('アップロードポリシーの取得に失敗しました', reason, payload), {
        code: BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH,
        csrfReason: csrfFailure.reason ?? undefined
      });
    }
    throw new BlobUploadError(`アップロードポリシーの取得に失敗しました (${reason})`);
  }

  return {
    token: payload.token,
    pathname: payload.pathname,
    fileName: payload.fileName
  };
}

export function useBlobUpload(): { uploadZip: (args: UploadZipArgs) => Promise<UploadZipResult> } {
  const csrfRef = useRef<string | null>(null);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfRef.current) {
      return csrfRef.current;
    }
    if (typeof fetch === 'undefined') {
      throw new BlobUploadError('ブラウザ環境でのみアップロードを実行できます');
    }
    const token = await requestCsrf(fetch);
    csrfRef.current = token;
    return token;
  }, []);

  const refreshCsrfToken = useCallback(async () => {
    csrfRef.current = null;
    if (typeof fetch === 'undefined') {
      throw new BlobUploadError('ブラウザ環境でのみアップロードを実行できます');
    }
    const token = await requestCsrf(fetch);
    csrfRef.current = token;
    return token;
  }, []);

  const uploadZip = useCallback(async (args: UploadZipArgs): Promise<UploadZipResult> => {
    if (typeof window === 'undefined') {
      throw new BlobUploadError('ブラウザ環境でのみアップロードを実行できます');
    }

    if (!(args.file instanceof Blob)) {
      throw new BlobUploadError('アップロードするZIPの内容が不正です');
    }

    ensureZipFileName(args.fileName);

    const ownerDiscordId = normalizeOptionalString(args.ownerDiscordId ?? undefined);
    const ownerDiscordName = normalizeOptionalString(args.ownerDiscordName ?? undefined);
    const receiverName = normalizeOptionalString(args.receiverName);

    const uploadIntent = await requestUploadAuthorization(fetch, {
      userId: args.userId,
      fileName: args.fileName,
      purpose: DEFAULT_PURPOSE,
      ownerDiscordId,
      ownerDiscordName,
      receiverName,
      getCsrfToken: ensureCsrfToken,
      refreshCsrfToken
    });

    let uploadResult;
    try {
      uploadResult = await put(uploadIntent.pathname, args.file, {
        access: 'public',
        multipart: true,
        contentType: 'application/zip',
        token: uploadIntent.token
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw new BlobUploadError('ZIPファイルのアップロードに失敗しました', { cause: error });
    }

    const downloadUrl = uploadResult.downloadUrl ?? uploadResult.url;
    if (!downloadUrl) {
      throw new BlobUploadError('アップロード応答にダウンロードURLが含まれていません');
    }

    const { shareUrl, token, expiresAt } = await issueReceiveShareUrl(fetch, {
      downloadUrl,
      fileName: args.fileName,
      getCsrfToken: ensureCsrfToken,
      refreshCsrfToken
    });

    return {
      shareUrl,
      token,
      downloadUrl,
      expiresAt,
      pathname: uploadResult.pathname
    };
  }, [ensureCsrfToken, refreshCsrfToken]);

  return { uploadZip };
}
