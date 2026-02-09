// /api/transfer/resolve.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  hashTransferPin,
  normalizeTransferPin,
  normalizeTransferCode,
  timingSafeEqualBase64Url,
  transferKey,
} from './_lib.js';

const limitPerMinute = Number(process.env.TRANSFER_RESOLVE_LIMIT_PER_MINUTE || 30);
const limitPerCodePerMinute = Number(process.env.TRANSFER_RESOLVE_CODE_LIMIT_PER_MINUTE || 20);

const guarded = withApiGuards({
  route: '/api/transfer/resolve',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: {
    name: 'transfer:resolve',
    limit: Number.isFinite(limitPerMinute) && limitPerMinute > 0 ? limitPerMinute : 30,
    windowSec: 60,
  },
})(async (req, res) => {
  const log = createRequestLogger('api/transfer/resolve', req);
  log.info('request received', { method: req.method });

  const body = req.body ?? {};
  const code = normalizeTransferCode(body?.code);
  const pin = normalizeTransferPin(body?.pin);
  if (!code || !pin) {
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  const record = await kv.get(transferKey(code));
  if (!record || typeof record !== 'object') {
    log.warn('transfer credentials invalid', { code });
    return res.status(404).json({ ok: false, error: 'Transfer code or PIN is invalid' });
  }

  const pinSalt = typeof record.pinSalt === 'string' ? record.pinSalt : '';
  const pinHash = typeof record.pinHash === 'string' ? record.pinHash : '';
  const iterations = Number(record?.pinKdf?.iterations);
  const storedIterations =
    Number.isFinite(iterations) && iterations > 0 ? iterations : Number(process.env.TRANSFER_PIN_HASH_ITERATIONS || 210_000);

  if (!pinSalt || !pinHash) {
    log.warn('transfer record missing pin hash', { code });
    return res.status(404).json({ ok: false, error: 'Transfer code or PIN is invalid' });
  }

  let candidateHash;
  try {
    candidateHash = await hashTransferPin(pin, { salt: pinSalt, iterations: storedIterations });
  } catch (error) {
    log.warn('failed to hash provided pin', {
      code,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(404).json({ ok: false, error: 'Transfer code or PIN is invalid' });
  }

  if (!timingSafeEqualBase64Url(candidateHash, pinHash)) {
    if (Number.isFinite(limitPerCodePerMinute) && limitPerCodePerMinute > 0) {
      const windowSec = 60;
      const windowId = Math.floor(Date.now() / (windowSec * 1000));
      const rlKey = `rl:transfer:resolve:pin-fail:${windowId}:${code}`;
      try {
        const next = await kv.incr(rlKey);
        if (next === 1) {
          await kv.expire(rlKey, windowSec + 10);
        }
        if (typeof next === 'number' && next > limitPerCodePerMinute) {
          res.setHeader('Retry-After', String(windowSec));
          return res.status(429).json({ ok: false, error: 'Too Many Requests' });
        }
      } catch (error) {
        log.warn('failed to enforce per-code failure rate limit', {
          code,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.warn('transfer pin mismatch', { code });
    return res.status(404).json({ ok: false, error: 'Transfer code or PIN is invalid' });
  }

  const status = typeof record.status === 'string' ? record.status : '';
  if (status !== 'ready') {
    log.warn('transfer code not ready', { code, status });
    return res.status(409).json({ ok: false, error: 'Transfer code is not ready' });
  }

  const downloadUrl =
    typeof record.downloadUrl === 'string' && record.downloadUrl
      ? record.downloadUrl
      : typeof record.url === 'string'
        ? record.url
        : '';
  if (!downloadUrl) {
    log.error('transfer record missing blob url', { code });
    return res.status(500).json({ ok: false, error: 'Transfer payload is invalid' });
  }

  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : undefined;
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : undefined;

  log.info('transfer resolved', { code, urlHost: new URL(downloadUrl).host });
  return res.status(200).json({
    ok: true,
    downloadUrl,
    createdAt,
    expiresAt,
  });
});

export default guarded;
