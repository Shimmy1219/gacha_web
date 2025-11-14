// /api/_lib/siteOrigin.js
// 環境変数 NEXT_PUBLIC_SITE_ORIGIN やアクセス元ホストから受け取った値を
// オリジンに正規化するためのヘルパー。

const SHIMMY3_BASE_DOMAIN = 'shimmy3.com';
const ALLOWED_SHIMMY3_SUBDOMAINS = new Set(['stg', 'dev', 'test01', 'test02']);

function normalizeSiteOrigin(origin) {
  if (typeof origin !== 'string') {
    return '';
  }

  const trimmed = origin.trim();
  if (!trimmed) {
    return '';
  }

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    return url.origin;
  } catch (error) {
    return '';
  }
}

function resolveSiteOrigin(preferredOrigin, fallbackOrigin) {
  const normalizedFallback = normalizeSiteOrigin(fallbackOrigin);
  if (normalizedFallback) {
    return normalizedFallback;
  }

  const normalizedPreferred = normalizeSiteOrigin(preferredOrigin);
  if (normalizedPreferred) {
    return normalizedPreferred;
  }

  return '';
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0] ?? '') : '';
  }
  if (typeof value === 'string') {
    const [first] = value.split(',');
    return first ? first.trim() : '';
  }
  return '';
}

function buildOriginFromHost(host, protoHint = 'https') {
  if (typeof host !== 'string' || host.length === 0) {
    return '';
  }
  const proto = typeof protoHint === 'string' && protoHint.trim().length > 0 ? protoHint.trim() : 'https';
  return `${proto}://${host}`;
}

function isAllowedShimmySiteOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (hostname === SHIMMY3_BASE_DOMAIN) {
      return true;
    }

    const suffix = `.${SHIMMY3_BASE_DOMAIN}`;
    if (hostname.endsWith(suffix)) {
      const subdomain = hostname.slice(0, -suffix.length);
      return ALLOWED_SHIMMY3_SUBDOMAINS.has(subdomain);
    }
  } catch (error) {
    return false;
  }

  return false;
}

function resolveRequestSiteOrigin(req, options = {}) {
  const headers = (req && typeof req === 'object' && req.headers) || {};
  const originHeader = firstHeaderValue(headers.origin);
  const refererHeader = firstHeaderValue(headers.referer);
  const forwardedHost = firstHeaderValue(headers['x-forwarded-host']);
  const forwardedProto = firstHeaderValue(headers['x-forwarded-proto']);
  const hostHeader = firstHeaderValue(headers.host);
  const forwardedOrigin = buildOriginFromHost(forwardedHost, forwardedProto);
  const hostOrigin = buildOriginFromHost(hostHeader, forwardedProto || 'https');
  const normalizedFallback = normalizeSiteOrigin(options.fallbackOrigin);
  const fallbackAllowed = isAllowedShimmySiteOrigin(normalizedFallback);

  const candidates = [
    { source: 'origin-header', value: originHeader },
    { source: 'referer-header', value: refererHeader },
    { source: 'x-forwarded-host', value: forwardedOrigin },
    { source: 'host-header', value: hostOrigin },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSiteOrigin(candidate.value);
    if (normalized && isAllowedShimmySiteOrigin(normalized)) {
      return {
        origin: normalized,
        source: candidate.source,
        fallbackOrigin: fallbackAllowed ? normalizedFallback : '',
        fallbackApplied: false,
        details: {
          originHeader: originHeader || undefined,
          refererHeader: refererHeader || undefined,
          forwardedHost: forwardedHost || undefined,
          forwardedProto: forwardedProto || undefined,
          hostHeader: hostHeader || undefined,
        },
      };
    }
  }

  if (fallbackAllowed) {
    return {
      origin: normalizedFallback,
      source: 'env-fallback',
      fallbackOrigin: normalizedFallback,
      fallbackApplied: true,
      details: {
        originHeader: originHeader || undefined,
        refererHeader: refererHeader || undefined,
        forwardedHost: forwardedHost || undefined,
        forwardedProto: forwardedProto || undefined,
        hostHeader: hostHeader || undefined,
      },
    };
  }

  return {
    origin: '',
    source: null,
    fallbackOrigin: fallbackAllowed ? normalizedFallback : '',
    fallbackApplied: false,
    details: {
      originHeader: originHeader || undefined,
      refererHeader: refererHeader || undefined,
      forwardedHost: forwardedHost || undefined,
      forwardedProto: forwardedProto || undefined,
      hostHeader: hostHeader || undefined,
    },
  };
}

export {
  normalizeSiteOrigin,
  resolveSiteOrigin,
  resolveRequestSiteOrigin,
  isAllowedShimmySiteOrigin,
};
