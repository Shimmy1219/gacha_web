// /api/_lib/siteOrigin.js
// 環境変数 NEXT_PUBLIC_SITE_ORIGIN やアクセス元ホストから受け取った値を
// オリジンに正規化するためのヘルパー。

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

export { normalizeSiteOrigin, resolveSiteOrigin };
