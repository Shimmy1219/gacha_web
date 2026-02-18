import { useCallback, useRef } from 'react';
import {
  createCsrfRetryRequestHeaders,
  fetchWithCsrfRetry,
  getCsrfMismatchGuideMessageJa,
  inspectCsrfFailurePayload,
  type CsrfFailureInspection
} from '../csrf/csrfGuards';

export class TransferApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause) {
      try {
        (this as Error & { cause?: unknown }).cause = options.cause;
      } catch {
        // noop
      }
    }
    this.name = 'TransferApiError';
  }
}

const CSRF_ENDPOINT = '/api/blob/csrf';
const TRANSFER_CREATE_ENDPOINT = '/api/transfer/create';
const TRANSFER_COMPLETE_ENDPOINT = '/api/transfer/complete';
const TRANSFER_RESOLVE_ENDPOINT = '/api/transfer/resolve';
const TRANSFER_CONSUME_ENDPOINT = '/api/transfer/consume';

interface CsrfResponsePayload {
  ok?: boolean;
  token?: string;
}

interface TransferApiResponseBase {
  error?: string;
  errorCode?: string;
  csrfReason?: string;
  csrfRetryable?: boolean;
}

interface TransferCreateResponse extends TransferApiResponseBase {
  ok?: boolean;
  code?: string;
  token?: string;
  pathname?: string;
  uploadTokenExpiresAt?: string;
  expiresAt?: string;
}

interface TransferCompleteResponse extends TransferApiResponseBase {
  ok?: boolean;
  expiresAt?: string;
}

interface TransferResolveResponse extends TransferApiResponseBase {
  ok?: boolean;
  downloadUrl?: string;
  createdAt?: string;
  expiresAt?: string;
}

interface TransferConsumeResponse extends TransferApiResponseBase {
  ok?: boolean;
  deleted?: boolean;
}

interface PostJsonWithCsrfOptions {
  url: string;
  buildBody: (csrf: string) => Record<string, unknown>;
}

function resolveCsrfMismatchFailure(payload?: unknown, message?: unknown): CsrfFailureInspection | null {
  const inspection = inspectCsrfFailurePayload(payload);
  if (inspection.isMismatch) {
    return inspection;
  }
  if (typeof message !== 'string' || !/csrf/i.test(message)) {
    return null;
  }
  return {
    isMismatch: true,
    reason: null,
    source: null,
    retryable: true,
    message
  };
}

function buildTransferFailureMessage(context: string, reason: string, payload?: unknown): string {
  const csrfFailure = resolveCsrfMismatchFailure(payload, reason);
  if (!csrfFailure) {
    return `${context} (${reason})`;
  }
  return `${context} (${reason})\n\n${getCsrfMismatchGuideMessageJa(csrfFailure.reason)}`;
}

async function requestCsrf(fetcher: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(`${CSRF_ENDPOINT}?ts=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store'
    });
  } catch (error) {
    throw new TransferApiError('CSRFトークンの取得に失敗しました (network error)', { cause: error });
  }

  let payload: CsrfResponsePayload | null = null;
  try {
    payload = (await response.json()) as CsrfResponsePayload;
  } catch (error) {
    throw new TransferApiError('CSRFトークンの取得に失敗しました (invalid json)', { cause: error });
  }

  if (!response.ok || !payload?.token) {
    throw new TransferApiError('CSRFトークンの取得に失敗しました');
  }

  return payload.token;
}

export function useTransferApi(): {
  createTransfer: (args: { pin: string }) => Promise<{ code: string; token: string; pathname: string; expiresAt?: string }>;
  completeTransfer: (args: { code: string; pathname: string; url: string; downloadUrl?: string }) => Promise<void>;
  resolveTransfer: (args: { code: string; pin: string }) => Promise<{ downloadUrl: string; createdAt?: string; expiresAt?: string }>;
  consumeTransfer: (args: { code: string }) => Promise<{ deleted: boolean }>;
} {
  const csrfRef = useRef<string | null>(null);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfRef.current) {
      return csrfRef.current;
    }
    if (typeof fetch === 'undefined') {
      throw new TransferApiError('ブラウザ環境でのみ引継ぎ機能を利用できます');
    }
    const token = await requestCsrf(fetch);
    csrfRef.current = token;
    return token;
  }, []);

  const refreshCsrfToken = useCallback(async () => {
    csrfRef.current = null;
    if (typeof fetch === 'undefined') {
      throw new TransferApiError('ブラウザ環境でのみ引継ぎ機能を利用できます');
    }
    const token = await requestCsrf(fetch);
    csrfRef.current = token;
    return token;
  }, []);

  const postJsonWithCsrf = useCallback(
    async <T>(options: PostJsonWithCsrfOptions): Promise<{ response: Response; payload: T }> => {
      if (typeof fetch === 'undefined') {
        throw new TransferApiError('ブラウザ環境でのみ引継ぎ機能を利用できます');
      }

      let response: Response;
      try {
        response = await fetchWithCsrfRetry({
          fetcher: fetch,
          getToken: async () => ensureCsrfToken(),
          refreshToken: async () => refreshCsrfToken(),
          performRequest: async (csrf, currentFetcher, meta) =>
            currentFetcher(options.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...createCsrfRetryRequestHeaders(meta)
              },
              credentials: 'include',
              body: JSON.stringify(options.buildBody(csrf))
            }),
          maxRetry: 1
        });
      } catch (error) {
        throw new TransferApiError('通信に失敗しました (network error)', { cause: error });
      }

      let payload: T;
      try {
        payload = (await response.json()) as T;
      } catch (error) {
        throw new TransferApiError('通信に失敗しました (invalid json)', { cause: error });
      }

      return { response, payload };
    },
    [ensureCsrfToken, refreshCsrfToken]
  );

  const createTransfer = useCallback(
    async (args: { pin: string }) => {
      const { response, payload } = await postJsonWithCsrf<TransferCreateResponse>({
        url: TRANSFER_CREATE_ENDPOINT,
        buildBody: (csrf) => ({ csrf, pin: args.pin })
      });
      if (!response.ok || !payload?.ok || !payload.code || !payload.token || !payload.pathname) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(buildTransferFailureMessage('引継ぎコードの発行に失敗しました', reason, payload));
      }
      return {
        code: payload.code,
        token: payload.token,
        pathname: payload.pathname,
        expiresAt: payload.expiresAt
      };
    },
    [postJsonWithCsrf]
  );

  const completeTransfer = useCallback(
    async (args: { code: string; pathname: string; url: string; downloadUrl?: string }) => {
      const { response, payload } = await postJsonWithCsrf<TransferCompleteResponse>({
        url: TRANSFER_COMPLETE_ENDPOINT,
        buildBody: (csrf) => ({
          csrf,
          code: args.code,
          pathname: args.pathname,
          url: args.url,
          downloadUrl: args.downloadUrl
        })
      });

      if (!response.ok || !payload?.ok) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(buildTransferFailureMessage('引継ぎデータの登録に失敗しました', reason, payload));
      }
    },
    [postJsonWithCsrf]
  );

  const resolveTransfer = useCallback(
    async (args: { code: string; pin: string }) => {
      const { response, payload } = await postJsonWithCsrf<TransferResolveResponse>({
        url: TRANSFER_RESOLVE_ENDPOINT,
        buildBody: (csrf) => ({
          csrf,
          code: args.code,
          pin: args.pin
        })
      });

      if (!response.ok || !payload?.ok || !payload.downloadUrl) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(buildTransferFailureMessage('引継ぎデータの取得に失敗しました', reason, payload));
      }

      return {
        downloadUrl: payload.downloadUrl,
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt
      };
    },
    [postJsonWithCsrf]
  );

  const consumeTransfer = useCallback(
    async (args: { code: string }) => {
      const { response, payload } = await postJsonWithCsrf<TransferConsumeResponse>({
        url: TRANSFER_CONSUME_ENDPOINT,
        buildBody: (csrf) => ({
          csrf,
          code: args.code
        })
      });

      if (!response.ok || !payload?.ok) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(buildTransferFailureMessage('引継ぎデータの削除に失敗しました', reason, payload));
      }

      return { deleted: payload.deleted === true };
    },
    [postJsonWithCsrf]
  );

  return { createTransfer, completeTransfer, resolveTransfer, consumeTransfer };
}
