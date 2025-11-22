const VERBOSE = process.env.VERBOSE_RECEIVE_LOG === '1';

function vLog(...args) {
  if (VERBOSE) console.log('[receive/origin]', ...args);
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

export function hostToOrigin(host) {
  if (!host) return '';
  const proto = process.env.VERCEL_ENV ? 'https' : 'https';
  return `${proto}://${host}`;
}

export function deriveAllowedOrigins(req) {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN; // e.g. https://shimmy3.com
  const vercelUrl = process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`;
  const self = hostToOrigin(req.headers.host);
  return uniq([envOrigin, envOrigin && envOrigin.replace('://', '://www.'), vercelUrl, self]);
}

export function isAllowedOrigin(req) {
  const allowed = deriveAllowedOrigins(req);

  const originHdr = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let derived = '';
  try {
    derived = referer ? new URL(referer).origin : '';
  } catch (error) {
    vLog('failed to parse referer URL', {
      referer,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  const candidate = originHdr || derived || '';
  const self = hostToOrigin(req.headers.host);

  const ok = (!!candidate && allowed.includes(candidate)) || (!candidate && allowed.includes(self));
  vLog('allowList:', allowed, 'origin:', originHdr, 'referer:', referer, 'derived:', derived, 'self:', self, 'ok:', ok);
  return { ok, candidate, allowed, origin: originHdr, referer, self };
}
