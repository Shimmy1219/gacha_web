// /api/_lib/csrf.js
import { setCookie } from './cookies.js';

const DEFAULT_COOKIE_NAME = 'csrf';
const DEFAULT_COOKIE_OPTIONS = { domain: '.shimmy3.com' };
const DEFAULT_TOKEN_BYTES = 32;

export const DEFAULT_CSRF_COOKIE_NAME = DEFAULT_COOKIE_NAME;
export const DEFAULT_CSRF_HEADER_NAME = 'x-csrf-token';

export function issueCsrfToken(
  res,
  { cookieName = DEFAULT_COOKIE_NAME, cookieOptions = {}, tokenBytes = DEFAULT_TOKEN_BYTES } = {}
) {
  const token = require('crypto').randomBytes(tokenBytes).toString('base64url');

  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');

  setCookie(res, cookieName, token, { ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions });

  return token;
}
