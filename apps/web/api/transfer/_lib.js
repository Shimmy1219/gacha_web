// /api/transfer/_lib.js
import crypto from 'crypto';

export const TRANSFER_TTL_SEC = 60 * 60 * 24; // 24 hours
export const TRANSFER_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const TRANSFER_CODE_PREFIX = 'transfer:code:';

export function normalizeTransferCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]{5}$/.test(trimmed)) return null;
  return trimmed;
}

export function transferKey(code) {
  if (!code) {
    throw new Error('transfer code is required');
  }
  return `${TRANSFER_CODE_PREFIX}${code}`;
}

export function randomTransferCode() {
  return crypto.randomInt(0, 100000).toString(10).padStart(5, '0');
}

export function randomObjectSuffix() {
  return crypto.randomBytes(9).toString('base64url');
}

export function ensureAllowedBlobUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    const err = new Error('Invalid blob url');
    err.statusCode = 400;
    throw err;
  }

  const suffixes = (process.env.ALLOWED_DOWNLOAD_HOST_SUFFIXES ||
    'public.blob.vercel-storage.com,blob.vercel-storage.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = suffixes.some((sfx) => parsed.host === sfx || parsed.host.endsWith(`.${sfx}`));
  if (!ok) {
    const err = new Error('Invalid blob host');
    err.statusCode = 400;
    throw err;
  }
}
