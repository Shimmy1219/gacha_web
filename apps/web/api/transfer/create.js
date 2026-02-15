// /api/transfer/create.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  TRANSFER_PIN_HASH_ALG,
  TRANSFER_PIN_HASH_ITERATIONS,
  TRANSFER_TTL_SEC,
  TRANSFER_UPLOAD_TOKEN_TTL_MS,
  hashTransferPin,
  normalizeTransferPin,
  randomPinSalt,
  randomObjectSuffix,
  randomTransferCode,
  transferKey,
} from './_lib.js';

function toIso(ms) {
  return new Date(ms).toISOString();
}

export default withApiGuards({
  route: '/api/transfer/create',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'transfer:create', limit: 10, windowSec: 60 },
})(async (req, res) => {
  const log = createRequestLogger('api/transfer/create', req);
  log.info('request received', { method: req.method });

  const body = req.body ?? {};
  const pin = normalizeTransferPin(body?.pin);
  if (!pin) {
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    log.error('blob token missing');
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  const now = Date.now();
  const expiresAtMs = now + TRANSFER_TTL_SEC * 1000;
  const uploadTokenExpiresAtMs = now + TRANSFER_UPLOAD_TOKEN_TTL_MS;

  const pinSalt = randomPinSalt();
  let pinHash;
  try {
    pinHash = await hashTransferPin(pin, { salt: pinSalt, iterations: TRANSFER_PIN_HASH_ITERATIONS });
  } catch (error) {
    log.warn('failed to hash transfer pin', {
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomTransferCode();
    const suffix = randomObjectSuffix();
    const pathname = `transfer/${code}/transfer-${code}-${suffix}.shimmy`;

    const record = {
      version: 1,
      status: 'reserved',
      code,
      pathname,
      createdAt: toIso(now),
      expiresAt: toIso(expiresAtMs),
      uploadTokenExpiresAt: toIso(uploadTokenExpiresAtMs),
      pinKdf: { alg: TRANSFER_PIN_HASH_ALG, iterations: TRANSFER_PIN_HASH_ITERATIONS },
      pinSalt,
      pinHash,
    };

    try {
      const stored = await kv.set(transferKey(code), record, { ex: TRANSFER_TTL_SEC, nx: true });
      if (stored !== 'OK') {
        continue;
      }

      const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
      const token = await generateClientTokenFromReadWriteToken({
        pathname,
        access: 'public',
        addRandomSuffix: false,
        allowedContentTypes: ['application/octet-stream', 'application/x-shimmy'],
        maximumSizeInBytes: 100 * 1024 * 1024,
        validUntil: uploadTokenExpiresAtMs,
        token: blobToken,
      });

      log.info('transfer code reserved', { code, pathname, expiresAt: record.expiresAt });
      return res.status(200).json({
        ok: true,
        code,
        token,
        pathname,
        uploadTokenExpiresAt: record.uploadTokenExpiresAt,
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      log.error('failed to allocate transfer code', { error });
      break;
    }
  }

  log.error('transfer code allocation exhausted');
  return res.status(503).json({ ok: false, error: 'Failed to allocate transfer code' });
});
