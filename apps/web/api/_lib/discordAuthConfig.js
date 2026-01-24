const DISCORD_REDIRECT_PATH = '/api/auth/discord/callback';

function trimOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOrigin(origin) {
  const trimmed = trimOrEmpty(origin);
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

export function resolveDiscordRedirectUri(req) {
  const explicitRedirectUri = trimOrEmpty(process.env.VITE_DISCORD_REDIRECT_URI);

  if (explicitRedirectUri) {
    return explicitRedirectUri;
  }

  const siteOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_ORIGIN);
  if (siteOrigin) {
    return `${siteOrigin}${DISCORD_REDIRECT_PATH}`;
  }

  const vercelUrl = normalizeOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (vercelUrl) {
    return `${vercelUrl}${DISCORD_REDIRECT_PATH}`;
  }

  if (req?.headers?.host && !process.env.VERCEL_ENV) {
    return `http://${req.headers.host}${DISCORD_REDIRECT_PATH}`;
  }

  return '';
}
