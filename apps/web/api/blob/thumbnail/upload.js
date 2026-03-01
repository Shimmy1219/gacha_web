// /api/blob/thumbnail/upload.js
// 配信サムネイルの Blob 署名発行 / 登録確定 / 削除を扱う。
import { del } from '@vercel/blob';
import { withApiGuards } from '../../_lib/apiGuards.js';
import { getCookies } from '../../_lib/cookies.js';
import { getSessionWithRefresh } from '../../_lib/getSessionWithRefresh.js';
import { createRequestLogger } from '../../_lib/logger.js';
import { kv } from '../../_lib/kv.js';
import { ensureAllowedBlobUrl } from '../../transfer/_lib.js';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const TOKEN_TTL_MS = 5 * 60 * 1000;

const THUMBNAIL_OWNER_KEY_PREFIX = 'thumb:owner:';
const THUMBNAIL_OWNERS_SET_PREFIX = 'thumb:owners:';

function sanitizeId(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const normalized = trimmed.replace(/[^A-Za-z0-9_-]/g, '');
  return normalized || fallback;
}

function normalizeGachaId(value) {
  return sanitizeId(value, '');
}

function normalizeOwnerName(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return normalized;
}

function normalizeAnonOwnerId(value) {
  const normalized = sanitizeId(value, '');
  if (!normalized) {
    return '';
  }
  return /^anon-[A-Za-z0-9_-]{8,64}$/.test(normalized) ? normalized : '';
}

function normalizeOwnerIdFromBody(value) {
  const normalized = sanitizeId(value, '');
  return normalized || '';
}

function resolveContentTypeAndExtension(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'image/png') {
    return { contentType: 'image/png', extension: '.png' };
  }
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return { contentType: 'image/jpeg', extension: '.jpg' };
  }
  return null;
}

function buildOwnerRecordKey(ownerId, gachaId) {
  return `${THUMBNAIL_OWNER_KEY_PREFIX}${ownerId}:${gachaId}`;
}

function buildOwnersSetKey(gachaId) {
  return `${THUMBNAIL_OWNERS_SET_PREFIX}${gachaId}`;
}

function parseStoredRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw;
  const url = typeof value.url === 'string' ? value.url : '';
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : '';
  const contentType = typeof value.contentType === 'string' ? value.contentType : '';
  if (!url) {
    return null;
  }
  return {
    url,
    updatedAt: updatedAt || null,
    contentType: contentType || null
  };
}

function extractPathname(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}

function isExpectedPathname({ url, ownerId, gachaId }) {
  const pathname = extractPathname(url);
  if (!pathname) {
    return false;
  }
  return pathname.startsWith(`thumbnail/${ownerId}/${gachaId}.`);
}

async function resolveAuthenticatedOwner(req, body) {
  const sid = getCookies(req)?.sid;
  const session = sid ? await getSessionWithRefresh(sid) : null;
  if (session?.uid) {
    return {
      ownerId: sanitizeId(session.uid, ''),
      ownerName: normalizeOwnerName(session.name),
      isAuthenticated: true
    };
  }

  const anonOwnerId = normalizeAnonOwnerId(body?.anonOwnerId);
  if (!anonOwnerId) {
    const error = new Error('owner id is required');
    error.statusCode = 401;
    throw error;
  }

  return {
    ownerId: anonOwnerId,
    ownerName: normalizeOwnerName(body?.ownerName),
    isAuthenticated: false
  };
}

async function readOwnerRecord(ownerId, gachaId) {
  const key = buildOwnerRecordKey(ownerId, gachaId);
  const raw = await kv.get(key);
  return parseStoredRecord(raw);
}

async function writeOwnerRecord(ownerId, gachaId, record) {
  const key = buildOwnerRecordKey(ownerId, gachaId);
  const ownersKey = buildOwnersSetKey(gachaId);
  await kv.set(key, record);
  await kv.sadd(ownersKey, ownerId);
}

async function deleteOwnerRecord(ownerId, gachaId) {
  const key = buildOwnerRecordKey(ownerId, gachaId);
  const ownersKey = buildOwnersSetKey(gachaId);
  await kv.del(key);
  await kv.srem(ownersKey, ownerId);
}

async function allowDeleteForOwner(req, body, log) {
  const requestedOwnerId = normalizeOwnerIdFromBody(body?.ownerId);
  if (!requestedOwnerId) {
    const error = new Error('ownerId is required');
    error.statusCode = 400;
    throw error;
  }

  const sid = getCookies(req)?.sid;
  const session = sid ? await getSessionWithRefresh(sid) : null;
  if (session?.uid) {
    const authenticatedOwnerId = sanitizeId(session.uid, '');
    if (authenticatedOwnerId === requestedOwnerId) {
      return requestedOwnerId;
    }
    if (/^anon-[A-Za-z0-9_-]{8,64}$/.test(requestedOwnerId)) {
      // ログイン後の anon -> ownerId 移行時のみ許可する。
      log.info('allowing anon cleanup for authenticated owner', {
        authenticatedOwnerId,
        requestedOwnerId
      });
      return requestedOwnerId;
    }
    const error = new Error('forbidden owner');
    error.statusCode = 403;
    throw error;
  }

  if (!/^anon-[A-Za-z0-9_-]{8,64}$/.test(requestedOwnerId)) {
    const error = new Error('not logged in');
    error.statusCode = 401;
    throw error;
  }

  const anonOwnerId = normalizeAnonOwnerId(body?.anonOwnerId);
  if (!anonOwnerId || anonOwnerId !== requestedOwnerId) {
    const error = new Error('forbidden owner');
    error.statusCode = 403;
    throw error;
  }
  return requestedOwnerId;
}

async function handlePrepareUpload(req, res, log, body) {
  const gachaId = normalizeGachaId(body?.gachaId);
  if (!gachaId) {
    return res.status(400).json({ ok: false, error: 'gachaId is required' });
  }
  const typeEntry = resolveContentTypeAndExtension(body?.contentType);
  if (!typeEntry) {
    return res.status(400).json({ ok: false, error: 'contentType must be image/png or image/jpeg' });
  }

  let owner;
  try {
    owner = await resolveAuthenticatedOwner(req, body);
  } catch (error) {
    return res.status(error?.statusCode || 401).json({ ok: false, error: error?.message || 'unauthorized' });
  }

  const pathname = `thumbnail/${owner.ownerId}/${gachaId}${typeEntry.extension}`;

  try {
    const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const token = await generateClientTokenFromReadWriteToken({
      pathname,
      access: 'public',
      addRandomSuffix: false,
      allowedContentTypes: [typeEntry.contentType],
      maximumSizeInBytes: MAX_UPLOAD_SIZE_BYTES,
      validUntil: Date.now() + TOKEN_TTL_MS,
      ...(blobToken ? { token: blobToken } : {})
    });
    return res.status(200).json({
      ok: true,
      token,
      pathname,
      ownerId: owner.ownerId,
      contentType: typeEntry.contentType
    });
  } catch (error) {
    log.error('failed to generate thumbnail upload token', { error });
    return res.status(500).json({ ok: false, error: 'failed to generate upload token' });
  }
}

async function handleCommitUpload(req, res, log, body) {
  const gachaId = normalizeGachaId(body?.gachaId);
  const ownerId = normalizeOwnerIdFromBody(body?.ownerId);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';

  if (!gachaId || !ownerId || !url) {
    return res.status(400).json({ ok: false, error: 'gachaId, ownerId and url are required' });
  }

  try {
    const sid = getCookies(req)?.sid;
    const session = sid ? await getSessionWithRefresh(sid) : null;
    if (session?.uid) {
      const authenticatedOwnerId = sanitizeId(session.uid, '');
      if (authenticatedOwnerId !== ownerId) {
        return res.status(403).json({ ok: false, error: 'forbidden owner' });
      }
    } else {
      const anonOwnerId = normalizeAnonOwnerId(body?.anonOwnerId);
      if (!anonOwnerId || anonOwnerId !== ownerId) {
        return res.status(403).json({ ok: false, error: 'forbidden owner' });
      }
    }

    ensureAllowedBlobUrl(url);
    if (!isExpectedPathname({ url, ownerId, gachaId })) {
      return res.status(400).json({ ok: false, error: 'unexpected blob pathname' });
    }

    const previous = await readOwnerRecord(ownerId, gachaId);
    const contentType = resolveContentTypeAndExtension(body?.contentType)?.contentType || null;
    const updatedAt = new Date().toISOString();

    await writeOwnerRecord(ownerId, gachaId, {
      url,
      updatedAt,
      contentType
    });

    if (previous?.url && previous.url !== url) {
      try {
        await del(previous.url, process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : undefined);
      } catch (error) {
        log.warn('failed to delete previous thumbnail blob', { ownerId, gachaId, error });
      }
    }

    return res.status(200).json({
      ok: true,
      url,
      ownerId,
      updatedAt
    });
  } catch (error) {
    log.error('failed to commit thumbnail upload', { error });
    return res.status(error?.statusCode || 500).json({ ok: false, error: error?.message || 'commit failed' });
  }
}

async function handleDelete(req, res, log, body) {
  const gachaId = normalizeGachaId(body?.gachaId);
  if (!gachaId) {
    return res.status(400).json({ ok: false, error: 'gachaId is required' });
  }

  let ownerId;
  try {
    ownerId = await allowDeleteForOwner(req, body, log);
  } catch (error) {
    return res.status(error?.statusCode || 403).json({ ok: false, error: error?.message || 'forbidden' });
  }

  try {
    const previous = await readOwnerRecord(ownerId, gachaId);
    if (previous?.url) {
      try {
        await del(previous.url, process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : undefined);
      } catch (error) {
        const status = error?.statusCode || error?.status;
        if (status !== 404) {
          log.warn('failed to delete thumbnail blob', { ownerId, gachaId, error });
        }
      }
    }

    await deleteOwnerRecord(ownerId, gachaId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    log.error('failed to delete thumbnail record', { ownerId, gachaId, error });
    return res.status(500).json({ ok: false, error: 'delete failed' });
  }
}

export default withApiGuards({
  route: '/api/blob/thumbnail/upload',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  csrf: { cookieName: 'csrf', source: 'body', field: 'csrf' },
  rateLimit: { name: 'blob:thumbnail:upload', limit: 60, windowSec: 60 }
})(async (req, res) => {
  const log = createRequestLogger('api/blob/thumbnail/upload', req);
  const body = req.body ?? {};
  const action = typeof body?.action === 'string' ? body.action : '';

  if (action === 'prepare-upload') {
    return await handlePrepareUpload(req, res, log, body);
  }
  if (action === 'commit-upload') {
    return await handleCommitUpload(req, res, log, body);
  }
  if (action === 'delete') {
    return await handleDelete(req, res, log, body);
  }

  return res.status(400).json({ ok: false, error: 'invalid action' });
});
