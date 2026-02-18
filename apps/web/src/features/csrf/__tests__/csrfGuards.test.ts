import {
  API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
  CSRF_FAILURE_REASON_COOKIE_MISSING,
  CSRF_FAILURE_REASON_PROVIDED_MISSING,
  CSRF_FAILURE_REASON_TOKEN_MISMATCH,
  fetchWithCsrfRetry,
  getCsrfMismatchGuideMessageJa,
  inspectCsrfFailurePayload
} from '../csrfGuards';

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('inspectCsrfFailurePayload', () => {
  it('detects cookie_missing with retryable flag', () => {
    const inspection = inspectCsrfFailurePayload({
      errorCode: API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
      error: 'Forbidden: invalid CSRF token',
      csrfReason: CSRF_FAILURE_REASON_COOKIE_MISSING,
      csrfSource: 'header',
      csrfRetryable: true
    });

    expect(inspection.isMismatch).toBe(true);
    expect(inspection.reason).toBe(CSRF_FAILURE_REASON_COOKIE_MISSING);
    expect(inspection.source).toBe('header');
    expect(inspection.retryable).toBe(true);
  });

  it('detects provided_missing as non-retryable when csrfRetryable is false', () => {
    const inspection = inspectCsrfFailurePayload({
      errorCode: API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
      error: 'Forbidden: invalid CSRF token',
      csrfReason: CSRF_FAILURE_REASON_PROVIDED_MISSING,
      csrfSource: 'body',
      csrfRetryable: false
    });

    expect(inspection.isMismatch).toBe(true);
    expect(inspection.reason).toBe(CSRF_FAILURE_REASON_PROVIDED_MISSING);
    expect(inspection.source).toBe('body');
    expect(inspection.retryable).toBe(false);
  });
});

describe('fetchWithCsrfRetry', () => {
  it('retries once when csrf mismatch is retryable', async () => {
    const requestedTokens: string[] = [];
    const retryAttempts: number[] = [];
    const retryFlags: boolean[] = [];
    let refreshCalled = 0;

    const response = await fetchWithCsrfRetry({
      getToken: async () => 'token-a',
      refreshToken: async () => {
        refreshCalled += 1;
        return 'token-b';
      },
      performRequest: async (token, _fetcher, meta) => {
        requestedTokens.push(token);
        retryAttempts.push(meta.attempt);
        retryFlags.push(meta.retryEnabled);
        if (requestedTokens.length === 1) {
          return jsonResponse(403, {
            ok: false,
            error: 'Forbidden: invalid CSRF token',
            errorCode: API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
            csrfReason: CSRF_FAILURE_REASON_TOKEN_MISMATCH,
            csrfRetryable: true
          });
        }
        return jsonResponse(200, { ok: true });
      }
    });

    expect(refreshCalled).toBe(1);
    expect(requestedTokens).toEqual(['token-a', 'token-b']);
    expect(retryAttempts).toEqual([0, 1]);
    expect(retryFlags).toEqual([true, true]);
    expect(response.status).toBe(200);
  });

  it('does not retry when csrf mismatch is non-retryable', async () => {
    const requestedTokens: string[] = [];
    let refreshCalled = 0;

    const response = await fetchWithCsrfRetry({
      getToken: async () => 'token-a',
      refreshToken: async () => {
        refreshCalled += 1;
        return 'token-b';
      },
      performRequest: async (token) => {
        requestedTokens.push(token);
        return jsonResponse(403, {
          ok: false,
          error: 'Forbidden: invalid CSRF token',
          errorCode: API_ERROR_CODE_CSRF_TOKEN_MISMATCH,
          csrfReason: CSRF_FAILURE_REASON_PROVIDED_MISSING,
          csrfRetryable: false
        });
      }
    });

    expect(refreshCalled).toBe(0);
    expect(requestedTokens).toEqual(['token-a']);
    expect(response.status).toBe(403);
  });
});

describe('getCsrfMismatchGuideMessageJa', () => {
  it('returns cookie-specific guidance', () => {
    const message = getCsrfMismatchGuideMessageJa(CSRF_FAILURE_REASON_COOKIE_MISSING);
    expect(message).toContain('cookie_missing');
    expect(message).toContain('セキュリティCookie');
  });

  it('returns token mismatch guidance', () => {
    const message = getCsrfMismatchGuideMessageJa(CSRF_FAILURE_REASON_TOKEN_MISMATCH);
    expect(message).toContain('token_mismatch');
    expect(message).toContain('複数タブ');
  });
});
