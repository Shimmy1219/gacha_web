export const API_ERROR_CODE_CSRF_TOKEN_MISMATCH = 'csrf_token_mismatch' as const;
export const CSRF_FAILURE_REASON_COOKIE_MISSING = 'cookie_missing' as const;
export const CSRF_FAILURE_REASON_PROVIDED_MISSING = 'provided_missing' as const;
export const CSRF_FAILURE_REASON_TOKEN_MISMATCH = 'token_mismatch' as const;

export type CsrfFailureReason =
  | typeof CSRF_FAILURE_REASON_COOKIE_MISSING
  | typeof CSRF_FAILURE_REASON_PROVIDED_MISSING
  | typeof CSRF_FAILURE_REASON_TOKEN_MISMATCH;

export type CsrfFailureSource = 'header' | 'body';

export interface CsrfFailureInspection {
  isMismatch: boolean;
  reason: CsrfFailureReason | null;
  source: CsrfFailureSource | null;
  retryable: boolean;
  message: string | null;
}

type CsrfErrorPayload = {
  errorCode?: unknown;
  error?: unknown;
  csrfReason?: unknown;
  csrfSource?: unknown;
  csrfRetryable?: unknown;
};

const DEFAULT_CSRF_FAILURE_INSPECTION: CsrfFailureInspection = {
  isMismatch: false,
  reason: null,
  source: null,
  retryable: false,
  message: null
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toCsrfPayload(value: unknown): CsrfErrorPayload | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  return record as CsrfErrorPayload;
}

function normalizeCsrfFailureReason(value: unknown): CsrfFailureReason | null {
  if (
    value === CSRF_FAILURE_REASON_COOKIE_MISSING ||
    value === CSRF_FAILURE_REASON_PROVIDED_MISSING ||
    value === CSRF_FAILURE_REASON_TOKEN_MISMATCH
  ) {
    return value;
  }
  return null;
}

function normalizeCsrfFailureSource(value: unknown): CsrfFailureSource | null {
  if (value === 'header' || value === 'body') {
    return value;
  }
  return null;
}

function reasonFromMessage(message: string | null): CsrfFailureReason | null {
  if (!message) {
    return null;
  }
  const normalized = message.toLowerCase();
  if (normalized.includes(CSRF_FAILURE_REASON_COOKIE_MISSING)) {
    return CSRF_FAILURE_REASON_COOKIE_MISSING;
  }
  if (normalized.includes(CSRF_FAILURE_REASON_PROVIDED_MISSING)) {
    return CSRF_FAILURE_REASON_PROVIDED_MISSING;
  }
  if (normalized.includes(CSRF_FAILURE_REASON_TOKEN_MISMATCH)) {
    return CSRF_FAILURE_REASON_TOKEN_MISMATCH;
  }
  if (normalized.includes('csrf token mismatch') || normalized.includes('invalid csrf token')) {
    return CSRF_FAILURE_REASON_TOKEN_MISMATCH;
  }
  return null;
}

function isLikelyCsrfFailureMessage(message: string | null): boolean {
  if (!message) {
    return false;
  }
  return /csrf/i.test(message);
}

export function inspectCsrfFailurePayload(payload: unknown): CsrfFailureInspection {
  const normalizedPayload = toCsrfPayload(payload);
  if (!normalizedPayload) {
    return DEFAULT_CSRF_FAILURE_INSPECTION;
  }

  const errorCode = normalizedPayload.errorCode;
  const message = typeof normalizedPayload.error === 'string' ? normalizedPayload.error : null;
  const isMismatchByCode = errorCode === API_ERROR_CODE_CSRF_TOKEN_MISMATCH;
  const isMismatchByMessage = isLikelyCsrfFailureMessage(message);
  if (!isMismatchByCode && !isMismatchByMessage) {
    return DEFAULT_CSRF_FAILURE_INSPECTION;
  }

  const reason = normalizeCsrfFailureReason(normalizedPayload.csrfReason) ?? reasonFromMessage(message);
  const source = normalizeCsrfFailureSource(normalizedPayload.csrfSource);
  const retryable =
    typeof normalizedPayload.csrfRetryable === 'boolean'
      ? normalizedPayload.csrfRetryable
      : reason !== CSRF_FAILURE_REASON_PROVIDED_MISSING;

  return {
    isMismatch: true,
    reason,
    source,
    retryable,
    message
  };
}

export async function inspectCsrfFailureResponse(response: Response): Promise<CsrfFailureInspection> {
  let payload: unknown = null;
  try {
    payload = (await response.clone().json().catch(() => null)) as unknown;
  } catch {
    payload = null;
  }
  return inspectCsrfFailurePayload(payload);
}

export interface FetchWithCsrfRetryOptions {
  fetcher?: typeof fetch;
  getToken: (fetcher: typeof fetch) => Promise<string>;
  refreshToken: (fetcher: typeof fetch) => Promise<string>;
  performRequest: (token: string, fetcher: typeof fetch) => Promise<Response>;
  shouldRetry?: (inspection: CsrfFailureInspection, attempt: number) => boolean;
  maxRetry?: number;
}

export async function fetchWithCsrfRetry(options: FetchWithCsrfRetryOptions): Promise<Response> {
  const fetcher = options.fetcher ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetcher) {
    throw new Error('fetch is not available in this environment');
  }

  const maxRetry = Number.isInteger(options.maxRetry) && (options.maxRetry as number) >= 0 ? Number(options.maxRetry) : 1;
  let attempt = 0;
  let token = await options.getToken(fetcher);
  let response = await options.performRequest(token, fetcher);

  while (attempt < maxRetry) {
    const inspection = await inspectCsrfFailureResponse(response);
    const shouldRetry =
      typeof options.shouldRetry === 'function'
        ? options.shouldRetry(inspection, attempt)
        : inspection.isMismatch && inspection.retryable;
    if (!shouldRetry) {
      break;
    }
    token = await options.refreshToken(fetcher);
    response = await options.performRequest(token, fetcher);
    attempt += 1;
  }

  return response;
}

export function getCsrfMismatchGuideMessageJa(reason: unknown): string {
  switch (normalizeCsrfFailureReason(reason)) {
    case CSRF_FAILURE_REASON_COOKIE_MISSING:
      return [
        'エラー名: CSRFトークン不一致 (cookie_missing)',
        '',
        'ブラウザにセキュリティCookieを保存できませんでした。',
        '対処法:',
        '1. プライベートモードを解除してください。',
        '2. Cookieブロック設定や追跡防止を一時的に緩和してください。',
        '3. DiscordやXのアプリ内ブラウザではなく、Safari/Chromeで開き直してください。',
        '4. ページを再読み込みして再度お試しください。'
      ].join('\n');
    case CSRF_FAILURE_REASON_PROVIDED_MISSING:
      return [
        'エラー名: CSRFトークン不一致 (provided_missing)',
        '',
        'ブラウザからの送信データが不足しています。',
        '対処法:',
        '1. ページを再読み込みしてから再操作してください。',
        '2. 拡張機能やセキュリティソフトが通信を書き換えていないか確認してください。',
        '3. 解決しない場合は時間を置いて再試行してください。'
      ].join('\n');
    case CSRF_FAILURE_REASON_TOKEN_MISMATCH:
      return [
        'エラー名: CSRFトークン不一致 (token_mismatch)',
        '',
        '対処法:',
        '1. 複数タブで同時に操作している場合は、不要なタブを閉じて1タブで操作してください。',
        '2. ページを再読み込みして、もう一度お試しください。',
        '3. それでも解決しない場合は、Cookie設定を確認してください。'
      ].join('\n');
    default:
      return [
        'エラー名: CSRFトークン不一致 (csrf_token_mismatch)',
        '',
        '対処法:',
        '1. ページを再読み込みして、もう一度お試しください。',
        '2. ブラウザのCookie設定を確認してください。',
        '3. 複数タブで同時操作している場合は1タブに絞ってください。'
      ].join('\n');
  }
}
