// /api/transfer/_lib.js
import crypto from 'crypto';
import { promisify } from 'util';

export const TRANSFER_TTL_SEC = 60 * 60 * 24; // 24 hours
export const TRANSFER_UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const TRANSFER_CODE_PREFIX = 'transfer:code:';

export const TRANSFER_PIN_HASH_ALG = 'pbkdf2-sha256';
export const TRANSFER_PIN_HASH_BYTES = 32;
export const TRANSFER_PIN_SALT_BYTES = 16;
export const TRANSFER_PIN_HASH_ITERATIONS = Math.max(
  10_000,
  Number(process.env.TRANSFER_PIN_HASH_ITERATIONS || 210_000)
);

const pbkdf2Async = promisify(crypto.pbkdf2);

export function normalizeTransferCode(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]{5}$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeTransferPin(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[0-9]{4}$/.test(trimmed)) return null;
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

export function randomPinSalt() {
  return crypto.randomBytes(TRANSFER_PIN_SALT_BYTES).toString('base64url');
}

export async function hashTransferPin(pin, params) {
  const normalizedPin = normalizeTransferPin(pin);
  if (!normalizedPin) {
    const err = new Error('Invalid pin');
    err.statusCode = 400;
    throw err;
  }

  const salt = typeof params?.salt === 'string' ? params.salt : '';
  let saltBytes;
  try {
    saltBytes = Buffer.from(salt, 'base64url');
  } catch {
    saltBytes = null;
  }
  if (!saltBytes || saltBytes.length < 8 || saltBytes.length > 64) {
    const err = new Error('Invalid pin salt');
    err.statusCode = 400;
    throw err;
  }

  const iterations = Number(params?.iterations);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 2_000_000) {
    const err = new Error('Invalid pin iterations');
    err.statusCode = 400;
    throw err;
  }

  const derived = await pbkdf2Async(normalizedPin, saltBytes, iterations, TRANSFER_PIN_HASH_BYTES, 'sha256');
  return Buffer.from(derived).toString('base64url');
}

export function timingSafeEqualBase64Url(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  let ba;
  let bb;
  try {
    ba = Buffer.from(a, 'base64url');
    bb = Buffer.from(b, 'base64url');
  } catch {
    return false;
  }
  if (ba.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
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
