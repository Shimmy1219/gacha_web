// /api/blob/thumbnail/resolve.js
// gachaId / ownerId から配信サムネイルURLを解決する read-only API。
import { withApiGuards } from '../../_lib/apiGuards.js';
import { createRequestLogger } from '../../_lib/logger.js';
import { kv } from '../../_lib/kv.js';

const THUMBNAIL_OWNER_KEY_PREFIX = 'thumb:owner:';
const THUMBNAIL_OWNERS_SET_PREFIX = 'thumb:owners:';
const MAX_REQUESTS = 120;

function sanitizeId(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/[^A-Za-z0-9_-]/g, '');
}

function buildOwnerRecordKey(ownerId, gachaId) {
  return `${THUMBNAIL_OWNER_KEY_PREFIX}${ownerId}:${gachaId}`;
}

function buildOwnersSetKey(gachaId) {
  return `${THUMBNAIL_OWNERS_SET_PREFIX}${gachaId}`;
}

function parseOwnerRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw;
  const url = typeof value.url === 'string' ? value.url : '';
  if (!url) {
    return null;
  }
  return {
    url,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
  };
}

async function resolveFromOwner(gachaId, ownerId) {
  const ownerRecordRaw = await kv.get(buildOwnerRecordKey(ownerId, gachaId));
  const ownerRecord = parseOwnerRecord(ownerRecordRaw);
  if (!ownerRecord) {
    return null;
  }
  return {
    gachaId,
    ownerId,
    url: ownerRecord.url,
    updatedAt: ownerRecord.updatedAt,
    match: 'owner'
  };
}

async function resolveByFallback(gachaId) {
  const owners = await kv.smembers(buildOwnersSetKey(gachaId));
  const normalizedOwners = Array.isArray(owners)
    ? owners.map((value) => sanitizeId(String(value))).filter(Boolean)
    : [];
  if (normalizedOwners.length === 0) {
    return {
      gachaId,
      ownerId: null,
      url: null,
      updatedAt: null,
      match: 'not_found'
    };
  }

  // owners set に古い ownerId が残ることがあるため、実在recordのみを採用する。
  const resolvedRecords = [];
  for (const ownerId of normalizedOwners) {
    const raw = await kv.get(buildOwnerRecordKey(ownerId, gachaId));
    const parsed = parseOwnerRecord(raw);
    if (parsed) {
      resolvedRecords.push({ ownerId, ...parsed });
    } else {
      await kv.srem(buildOwnersSetKey(gachaId), ownerId);
    }
  }

  if (resolvedRecords.length === 0) {
    return {
      gachaId,
      ownerId: null,
      url: null,
      updatedAt: null,
      match: 'not_found'
    };
  }

  if (resolvedRecords.length > 1) {
    return {
      gachaId,
      ownerId: null,
      url: null,
      updatedAt: null,
      match: 'ambiguous'
    };
  }

  const hit = resolvedRecords[0];
  return {
    gachaId,
    ownerId: hit.ownerId,
    url: hit.url,
    updatedAt: hit.updatedAt,
    match: 'fallback'
  };
}

async function resolveOne(request) {
  const gachaId = sanitizeId(request?.gachaId);
  if (!gachaId) {
    return {
      gachaId: null,
      ownerId: null,
      url: null,
      updatedAt: null,
      match: 'not_found'
    };
  }
  const ownerId = sanitizeId(request?.ownerId);
  if (ownerId) {
    const direct = await resolveFromOwner(gachaId, ownerId);
    if (direct) {
      return direct;
    }
  }
  return await resolveByFallback(gachaId);
}

export default withApiGuards({
  route: '/api/blob/thumbnail/resolve',
  health: { enabled: true },
  methods: ['POST'],
  origin: true,
  rateLimit: { name: 'blob:thumbnail:resolve', limit: 120, windowSec: 60 }
})(async (req, res) => {
  const log = createRequestLogger('api/blob/thumbnail/resolve', req);
  const body = req.body ?? {};
  const requests = Array.isArray(body?.requests) ? body.requests : [];
  if (requests.length === 0) {
    return res.status(200).json({ ok: true, results: [] });
  }
  if (requests.length > MAX_REQUESTS) {
    return res.status(400).json({ ok: false, error: 'too many requests' });
  }

  try {
    const results = [];
    for (const request of requests) {
      // 解決結果の順番は入力順と一致させる。
      const result = await resolveOne(request);
      results.push(result);
    }
    return res.status(200).json({ ok: true, results });
  } catch (error) {
    log.error('failed to resolve thumbnail urls', { error });
    return res.status(500).json({ ok: false, error: 'resolve failed' });
  }
});
