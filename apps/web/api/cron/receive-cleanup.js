import { del as deleteBlob } from '@vercel/blob';
import { kv } from '../_lib/kv.js';
import { createRequestLogger } from '../_lib/logger.js';

const INDEX_KEY = 'receive:edge:index';
const META_PREFIX = 'receive:edge:meta:';
const SHORT_TOKEN_PREFIX = 'receive:token:';
const DEFAULT_BATCH_LIMIT = Number(process.env.RECEIVE_CLEANUP_BATCH_LIMIT || 100);
const MAX_DELETE_RETRIES = 3;

function metaKey(id) {
  return `${META_PREFIX}${id}`;
}

function shortTokenKey(token) {
  return `${SHORT_TOKEN_PREFIX}${token}`;
}

function parseAuthHeader(header) {
  if (typeof header !== 'string') return '';
  return header.toLowerCase().startsWith('bearer ')
    ? header.slice(7)
    : header;
}

function isAuthorized(req) {
  const cronSecret = process.env.RECEIVE_CLEANUP_SECRET;
  const authHeader = parseAuthHeader(req.headers?.authorization || '');
  const hasVercelCronHeader = Boolean(req.headers?.['x-vercel-cron']);

  if (cronSecret) {
    return authHeader === cronSecret || hasVercelCronHeader;
  }

  return hasVercelCronHeader;
}

function parseLimit(req) {
  const raw = req.query?.limit;
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_BATCH_LIMIT;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeMeta(raw) {
  let meta = raw;
  if (typeof raw === 'string') {
    try {
      meta = JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  if (!meta || typeof meta !== 'object') return null;

  const id = typeof meta.id === 'string' ? meta.id : undefined;
  const blobName =
    typeof meta.blob_name === 'string'
      ? meta.blob_name
      : typeof meta.pathname === 'string'
        ? meta.pathname
        : typeof meta.blobName === 'string'
          ? meta.blobName
          : undefined;
  const expiresAt = toNumber(meta.expires_at ?? meta.expiresAt);
  const shortToken =
    typeof meta.short_token === 'string'
      ? meta.short_token
      : typeof meta.shortToken === 'string'
        ? meta.shortToken
        : undefined;

  return { id, blobName, expiresAt, shortToken };
}

async function deleteWithRetry(identifier, log) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_DELETE_RETRIES; attempt += 1) {
    try {
      await deleteBlob(identifier, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return { ok: true, attempt };
    } catch (error) {
      const isNotFound = error?.name === 'BlobNotFoundError';
      if (isNotFound) {
        return { ok: true, attempt, notFound: true };
      }
      lastError = error;
      log.warn('blob delete failed, will retry if attempts remain', {
        attempt,
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ok: false, error: lastError };
}

async function cleanupKeys(id, shortToken) {
  const tasks = [kv.zrem(INDEX_KEY, id), kv.del(metaKey(id))];
  if (shortToken) {
    tasks.push(kv.del(shortTokenKey(shortToken)));
  }
  await Promise.all(tasks);
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/cron/receive-cleanup', req);
  log.info('cron request received', { method: req.method, query: req.query });

  if (req.method === 'GET' && 'health' in (req.query || {})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/cron/receive-cleanup' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!isAuthorized(req)) {
    log.warn('unauthorized cron access attempt');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const now = Date.now();
    const limit = parseLimit(req);
    const expired = await kv.zrange(INDEX_KEY, 0, now, {
      byScore: true,
      withScores: true,
      limit: { offset: 0, count: limit },
    });

    log.info('expired candidates fetched', { count: expired.length, limit });

    const summary = {
      scanned: expired.length,
      deleted: 0,
      notFound: 0,
      missingMeta: 0,
      skipped: 0,
      errors: 0,
    };

    for (const entry of expired) {
      const id = typeof entry === 'string' ? entry : entry?.member;
      if (!id) {
        summary.missingMeta += 1;
        continue;
      }

      const rawMeta = await kv.get(metaKey(id));
      const meta = normalizeMeta(rawMeta);

      if (!meta || !meta.blobName) {
        log.warn('metadata missing or invalid', { id });
        summary.missingMeta += 1;
        await cleanupKeys(id);
        continue;
      }

      const deleteResult = await deleteWithRetry(meta.blobName, log);
      if (!deleteResult.ok) {
        summary.errors += 1;
        summary.skipped += 1;
        log.error('blob delete failed after retries', { id, blobName: meta.blobName, error: deleteResult.error });
        continue;
      }

      summary.deleted += 1;
      if (deleteResult.notFound) summary.notFound += 1;

      await cleanupKeys(id, meta.shortToken);
      log.info('cleanup completed for entry', {
        id,
        blobName: meta.blobName,
        notFound: Boolean(deleteResult.notFound),
      });
    }

    const response = {
      ok: true,
      now: new Date(now).toISOString(),
      indexKey: INDEX_KEY,
      ...summary,
    };

    log.info('cron finished', response);
    return res.status(200).json(response);
  } catch (error) {
    log.error('cron execution failed', { error });
    const message = error?.message || 'Internal Server Error';
    return res.status(500).json({ ok: false, error: message });
  }
}
