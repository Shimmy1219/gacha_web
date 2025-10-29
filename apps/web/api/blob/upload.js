// /api/blob/upload.js
// 目的:
// - 同一オリジン検証
// - CSRF（二重送信: Cookie + clientPayload）
// - ユーザー/用途ごとの格納パス (pathnamePrefix)
// - トークン有効期限 (validUntil)
// - デバッグログ（VERBOSE_BLOB_LOG=1 のとき詳細）
import crypto from 'crypto';
import { createRequestLogger } from '../_lib/logger.js';
const VERBOSE = process.env.VERBOSE_BLOB_LOG === '1';

function vLog(...args) {
  if (VERBOSE) console.log('[blob/upload]', ...args);
}

function parseCookies(header) {
  const out = {};
  (header || '')
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
    .forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > -1) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
  return out;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function hostToOrigin(host, protoHint = 'https') {
  if (!host) return '';
  return `${protoHint}://${host}`;
}

// 許可文字: 英数・_・- のみ（その他は除去）
function sanitizeSegment(s, fallback) {
  if (typeof s !== 'string' || !s) return fallback;
  const t = s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return t || fallback;
}

function sanitizeDirectoryName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const replaced = value
    .normalize('NFKC')
    .replace(/[^0-9A-Za-z._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
  return replaced || fallback;
}

function sanitizeZipFileName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  let normalized = trimmed
    .normalize('NFKC')
    .replace(/[^0-9A-Za-z._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!/\.zip$/i.test(normalized)) {
    normalized = `${normalized.replace(/\.+$/, '')}.zip`;
  }
  if (!normalized) {
    return fallback;
  }
  if (normalized.length > 128) {
    const base = normalized.slice(0, -4); // remove .zip
    const truncatedBase = base.slice(0, 124);
    normalized = `${truncatedBase}.zip`;
  }
  return normalized;
}

function buildFileNameWithSuffix(fileName, suffix) {
  const safeSuffix = typeof suffix === 'string' ? suffix.replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24) : '';
  const extIndex = fileName.toLowerCase().lastIndexOf('.zip');
  const baseName = extIndex >= 0 ? fileName.slice(0, extIndex) : fileName;
  const truncatedBase = baseName.slice(0, Math.max(1, 120 - safeSuffix.length));
  const finalBase = safeSuffix ? `${truncatedBase}-${safeSuffix}` : truncatedBase;
  return `${finalBase}.zip`;
}

function deriveUploadPolicy(req, payload) {
  const cookies = parseCookies(req.headers.cookie);

  const csrfFromCookie = cookies['csrf'] || '';
  const csrfFromPayload = typeof payload?.csrf === 'string' ? payload.csrf : '';
  if (!csrfFromCookie || !csrfFromPayload || csrfFromCookie !== csrfFromPayload) {
    const err = new Error('Forbidden: invalid CSRF token');
    err.statusCode = 403;
    throw err;
  }

  const userId = sanitizeSegment(payload?.userId, 'anon');
  const purpose = sanitizeSegment(payload?.purpose, 'misc');
  const ownerDiscordId = sanitizeSegment(payload?.ownerDiscordId, 'anon');
  const ownerDirectory = sanitizeDirectoryName(payload?.ownerDiscordName, ownerDiscordId || 'anonymous');
  const receiverDirectory = sanitizeDirectoryName(payload?.receiverName, 'unknown');
  const requestedFileName = sanitizeZipFileName(payload?.fileName, 'archive.zip');

  const ip = (req.headers['x-forwarded-for'] || '')
    .split(',')[0].trim() || req.socket?.remoteAddress || '0.0.0.0';

  const WINDOW_MS = 60 * 1000;
  const windowId = Math.floor(Date.now() / WINDOW_MS);

  const secret = process.env.BLOB_RATE_SECRET || 'dev-secret-change-me';
  const h = crypto.createHmac('sha256', secret)
    .update(`${ip}:${windowId}`)
    .digest('hex')
    .slice(0, 32);

  const validUntilMs = Date.now() + 5 * 60 * 1000;

  const allowedContentTypes = [
    'application/zip',
    'application/x-zip-compressed'
  ];

  const finalFileName = buildFileNameWithSuffix(requestedFileName, h);
  const pathname = `receive/${ownerDirectory}/${receiverDirectory}/${finalFileName}`;

  const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);

  const policyLog = {
    userId,
    purpose,
    ownerDiscordId,
    ownerDirectory,
    receiverDirectory,
    requestedFileName,
    windowId,
    pathname: `/${pathname}`,
    validUntilMs,
    ipHash
  };

  const result = {
    policyLog,
    policy: {
      userId,
      purpose,
      ownerDiscordId,
      ownerDirectory,
      receiverDirectory,
      requestedFileName,
      finalFileName,
      pathname,
      validUntilMs,
      allowedContentTypes,
      maximumSizeInBytes: 100 * 1024 * 1024
    }
  };
  vLog('policy', policyLog);
  return result;
}

async function handlePrepareUpload(req, res, log, body) {
  const { policyLog, policy } = deriveUploadPolicy(req, body);

  log.info('upload intent authorized', { ...policyLog, hasCsrf: true });

  try {
    const { generateClientTokenFromReadWriteToken } = await import('@vercel/blob/client');
    const token = await generateClientTokenFromReadWriteToken({
      pathname: policy.pathname,
      access: 'public',
      addRandomSuffix: false,
      allowedContentTypes: policy.allowedContentTypes,
      maximumSizeInBytes: policy.maximumSizeInBytes,
      validUntil: policy.validUntilMs
    });

    const expiresAtIso = new Date(policy.validUntilMs).toISOString();

    return res.status(200).json({
      ok: true,
      token,
      pathname: policy.pathname,
      fileName: policy.finalFileName,
      expiresAt: expiresAtIso,
      ownerDirectory: policy.ownerDirectory,
      receiverDirectory: policy.receiverDirectory
    });
  } catch (error) {
    const status = error?.statusCode || error?.status || 500;
    log.error('failed to generate client token', { error, status });
    return res.status(status).json({ ok: false, error: error?.message || 'Failed to generate upload token' });
  }
}

export default async function handler(req, res) {
  const log = createRequestLogger('api/blob/upload', req);
  log.info('request received', { method: req.method, hasBody: Boolean(req.body) });

  // ヘルスチェック
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    log.info('health check ok');
    return res.status(200).json({ ok: true, route: '/api/blob/upload' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // ====== 1) 同一オリジン検証 ======
  const envOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN; // 例: https://shimmy3.com
  const vercelUrl = process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`; // 例: https://xxx.vercel.app
  const apex = envOrigin;
  const www = envOrigin && envOrigin.replace('://', '://www.');
  const selfOriginFromHost = hostToOrigin(req.headers.host);

  const ALLOWED_ORIGINS = uniq([apex, www, vercelUrl, selfOriginFromHost]);
  const originHdr = req.headers.origin || '';
  const referer = req.headers.referer || '';
  let derivedOrigin = '';
  try {
    derivedOrigin = referer ? new URL(referer).origin : '';
  } catch (error) {
    vLog('failed to parse referer URL', {
      referer,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const originToCheck = originHdr || derivedOrigin || '';
  const isAllowed =
    (!!originToCheck && ALLOWED_ORIGINS.includes(originToCheck))
    || (!originToCheck && ALLOWED_ORIGINS.includes(selfOriginFromHost));

  vLog('allowList:', ALLOWED_ORIGINS);
  vLog('headers.origin:', originHdr);
  vLog('headers.referer:', referer);
  vLog('derivedOrigin:', derivedOrigin);
  vLog('selfOriginFromHost:', selfOriginFromHost);
  vLog('isAllowed:', isAllowed);

  if (!isAllowed) {
    log.warn('origin check failed', { originHdr, referer, derivedOrigin, selfOriginFromHost });
    return res.status(403).json({
      ok: false,
      error: 'Forbidden: origin not allowed',
      dbg: VERBOSE ? { originHdr, referer, derivedOrigin, ALLOWED_ORIGINS } : undefined,
    });
  }

  const body = req.body ?? {};
  if (body?.action === 'prepare-upload') {
    return handlePrepareUpload(req, res, log, body);
  }

  log.warn('invalid upload request payload', { action: body?.action });
  return res.status(400).json({ ok: false, error: 'Bad Request' });
}
