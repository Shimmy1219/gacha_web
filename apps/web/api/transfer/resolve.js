// /api/transfer/resolve.js
import { withApiGuards } from '../_lib/apiGuards.js';
import { createRequestLogger } from '../_lib/logger.js';
import { kv } from '../_lib/kv.js';
import {
  normalizeTransferCode,
  transferKey,
} from './_lib.js';

const limitPerMinute = Number(process.env.TRANSFER_RESOLVE_LIMIT_PER_MINUTE || 30);

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
  if (!code) {
    return res.status(400).json({ ok: false, error: 'Bad Request' });
  }

  const record = await kv.get(transferKey(code));
  if (!record || typeof record !== 'object') {
    log.warn('transfer code not found', { code });
    return res.status(404).json({ ok: false, error: 'Transfer code not found' });
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
