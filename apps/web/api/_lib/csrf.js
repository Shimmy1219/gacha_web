// /api/_lib/csrf.js
import { setCookie } from './cookies.js';

const DEFAULT_COOKIE_NAME = 'csrf';
const DEFAULT_COOKIE_OPTIONS = { domain: '.shimmy3.com' };
const DEFAULT_TOKEN_BYTES = 32;

export const DEFAULT_CSRF_COOKIE_NAME = DEFAULT_COOKIE_NAME;
export const DEFAULT_CSRF_HEADER_NAME = 'x-csrf-token';

function toBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  if (typeof btoa === 'function') {
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
  }

  throw new Error('Base64 encoding is not supported in this environment');
}

function generateToken(tokenBytes) {
  if (!Number.isInteger(tokenBytes) || tokenBytes <= 0) {
    throw new Error('tokenBytes must be a positive integer');
  }

  const cryptoApi = globalThis?.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is not available in this environment');
  }

  const bytes = new Uint8Array(tokenBytes);
  cryptoApi.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function issueCsrfToken(
  res,
  { cookieName = DEFAULT_COOKIE_NAME, cookieOptions = {}, tokenBytes = DEFAULT_TOKEN_BYTES } = {}
) {
  const token = generateToken(tokenBytes);

  if (typeof res?.setHeader === 'function') {
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  } else if (res?.headers) {
    const headers = res.headers instanceof Headers ? res.headers : new Headers(res.headers);
    headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.headers = headers;
  }

  setCookie(res, cookieName, token, { ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions });

  return token;
}
