const DEFAULT_RETURN_TO = '/gacha';
const MAX_RETURN_TO_LENGTH = 2048;

function isLikelyAbsoluteUrl(value) {
  // Examples: https://example.com, javascript:alert(1)
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

export function sanitizeReturnTo(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length > MAX_RETURN_TO_LENGTH) {
    return '';
  }

  if (trimmed.startsWith('//') || isLikelyAbsoluteUrl(trimmed)) {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // Prevent redirect loops or SSRF-like behavior against our API routes.
  if (withLeadingSlash.startsWith('/api/')) {
    return '';
  }

  return withLeadingSlash;
}

export function buildRedirectTarget(returnTo, extraParams) {
  const base = sanitizeReturnTo(returnTo) || DEFAULT_RETURN_TO;
  if (!extraParams || typeof extraParams !== 'object') {
    return base;
  }

  try {
    const url = new URL(base, 'http://localhost');

    Object.entries(extraParams).forEach(([key, value]) => {
      if (typeof value !== 'string' || value.length === 0) {
        return;
      }
      url.searchParams.set(key, value);
    });

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return base;
  }
}

