import { useCallback, useRef } from 'react';

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

interface TransferCreateResponse {
  ok?: boolean;
  code?: string;
  token?: string;
  pathname?: string;
  uploadTokenExpiresAt?: string;
  expiresAt?: string;
  error?: string;
}

interface TransferCompleteResponse {
  ok?: boolean;
  expiresAt?: string;
  error?: string;
}

interface TransferResolveResponse {
  ok?: boolean;
  downloadUrl?: string;
  createdAt?: string;
  expiresAt?: string;
  error?: string;
}

interface TransferConsumeResponse {
  ok?: boolean;
  deleted?: boolean;
  error?: string;
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

async function postJson<T>(
  fetcher: typeof fetch,
  url: string,
  body: Record<string, unknown>
): Promise<{ response: Response; payload: T }> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
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
}

export function useTransferApi(): {
  createTransfer: () => Promise<{ code: string; token: string; pathname: string; expiresAt?: string }>;
  completeTransfer: (args: { code: string; pathname: string; url: string; downloadUrl?: string }) => Promise<void>;
  resolveTransfer: (args: { code: string }) => Promise<{ downloadUrl: string; createdAt?: string; expiresAt?: string }>;
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

  const createTransfer = useCallback(async () => {
    const csrf = await ensureCsrfToken();
    const { response, payload } = await postJson<TransferCreateResponse>(fetch, TRANSFER_CREATE_ENDPOINT, { csrf });
    if (!response.ok || !payload?.ok || !payload.code || !payload.token || !payload.pathname) {
      const reason = payload?.error ?? `status ${response.status}`;
      throw new TransferApiError(`引継ぎコードの発行に失敗しました (${reason})`);
    }
    return {
      code: payload.code,
      token: payload.token,
      pathname: payload.pathname,
      expiresAt: payload.expiresAt
    };
  }, [ensureCsrfToken]);

  const completeTransfer = useCallback(
    async (args: { code: string; pathname: string; url: string; downloadUrl?: string }) => {
      const csrf = await ensureCsrfToken();
      const { response, payload } = await postJson<TransferCompleteResponse>(fetch, TRANSFER_COMPLETE_ENDPOINT, {
        csrf,
        code: args.code,
        pathname: args.pathname,
        url: args.url,
        downloadUrl: args.downloadUrl
      });

      if (!response.ok || !payload?.ok) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(`引継ぎデータの登録に失敗しました (${reason})`);
      }
    },
    [ensureCsrfToken]
  );

  const resolveTransfer = useCallback(
    async (args: { code: string }) => {
      const csrf = await ensureCsrfToken();
      const { response, payload } = await postJson<TransferResolveResponse>(fetch, TRANSFER_RESOLVE_ENDPOINT, {
        csrf,
        code: args.code
      });

      if (!response.ok || !payload?.ok || !payload.downloadUrl) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(`引継ぎデータの取得に失敗しました (${reason})`);
      }

      return {
        downloadUrl: payload.downloadUrl,
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt
      };
    },
    [ensureCsrfToken]
  );

  const consumeTransfer = useCallback(
    async (args: { code: string }) => {
      const csrf = await ensureCsrfToken();
      const { response, payload } = await postJson<TransferConsumeResponse>(fetch, TRANSFER_CONSUME_ENDPOINT, {
        csrf,
        code: args.code
      });

      if (!response.ok || !payload?.ok) {
        const reason = payload?.error ?? `status ${response.status}`;
        throw new TransferApiError(`引継ぎデータの削除に失敗しました (${reason})`);
      }

      return { deleted: payload.deleted === true };
    },
    [ensureCsrfToken]
  );

  return { createTransfer, completeTransfer, resolveTransfer, consumeTransfer };
}

