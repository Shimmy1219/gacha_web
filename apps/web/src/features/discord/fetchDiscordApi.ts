import { fetchWithCsrfRetry } from '../csrf/csrfGuards';

const DISCORD_CSRF_ENDPOINT = '/api/discord/csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

type CsrfResponsePayload = {
  ok?: boolean;
  token?: string;
  error?: string;
};

let cachedDiscordCsrfToken: string | null = null;
let inflightDiscordCsrf: Promise<string> | null = null;

async function issueDiscordCsrfToken(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(`${DISCORD_CSRF_ENDPOINT}?ts=${Date.now()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  let payload: CsrfResponsePayload | null = null;
  try {
    payload = (await response.json()) as CsrfResponsePayload;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || !payload.token) {
    const reason = payload?.error ?? `status ${response.status}`;
    throw new Error(`Failed to issue Discord CSRF token (${reason})`);
  }

  return payload.token;
}

async function ensureDiscordCsrfToken(fetcher: typeof fetch): Promise<string> {
  if (cachedDiscordCsrfToken) {
    return cachedDiscordCsrfToken;
  }
  if (!inflightDiscordCsrf) {
    inflightDiscordCsrf = issueDiscordCsrfToken(fetcher).finally(() => {
      inflightDiscordCsrf = null;
    });
  }
  const token = await inflightDiscordCsrf;
  cachedDiscordCsrfToken = token;
  return token;
}

async function refreshDiscordCsrfToken(fetcher: typeof fetch): Promise<string> {
  cachedDiscordCsrfToken = null;
  return ensureDiscordCsrfToken(fetcher);
}

function mergeHeaders(base?: HeadersInit, extra?: HeadersInit): Headers {
  const headers = new Headers(base ?? undefined);
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

export async function fetchDiscordApi(input: string, init: RequestInit = {}): Promise<Response> {
  if (typeof fetch === 'undefined') {
    throw new Error('fetch is not available in this environment');
  }

  return fetchWithCsrfRetry({
    fetcher: fetch,
    getToken: ensureDiscordCsrfToken,
    refreshToken: refreshDiscordCsrfToken,
    performRequest: async (token, fetcher) => {
      const headers = mergeHeaders(init.headers, { [CSRF_HEADER_NAME]: token, Accept: 'application/json' });
      return fetcher(input, {
        ...init,
        credentials: init.credentials ?? 'include',
        headers,
      });
    },
    maxRetry: 1
  });
}
