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
  try { derivedOrigin = referer ? new URL(referer).origin : ''; } catch {}

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

  // ====== 2) トークン生成 & CSRF/ポリシー ======
  try {
    const { handleUpload } = await import('@vercel/blob/client');
    const body = req.body ?? {};

    const jsonResponse = await handleUpload({
      request: req,
      body,

      // ここで CSRF 照合・保存ポリシー（拡張子/MIME/サイズ/格納パス/有効期限）を決定
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const cookies = parseCookies(req.headers.cookie);

        // 1) CSRF チェック
        let payload = {};
        try { payload = clientPayload ? JSON.parse(clientPayload) : {}; }
        catch (e) { vLog('clientPayload JSON parse error:', String(e)); }

        const csrfFromCookie  = cookies['csrf'] || '';
        const csrfFromPayload = payload?.csrf || '';
        if (!csrfFromCookie || !csrfFromPayload || csrfFromCookie !== csrfFromPayload) {
          const err = new Error('Forbidden: invalid CSRF token');
          err.statusCode = 403; throw err;
        }

        // 2) ユーザー/用途（サニタイズ）
        const userId  = sanitizeSegment(payload?.userId,  'anon');
        const purpose = sanitizeSegment(payload?.purpose, 'misc');

        // 3) レート制限（DBレス：同一IP 1分に1回）
        //    - 時間窓: 60秒
        //    - 決定論的 pathname を生成し、allowOverwrite: false で 2回目以降を弾く
        const ip = (req.headers['x-forwarded-for'] || '')
          .split(',')[0].trim() || req.socket?.remoteAddress || '0.0.0.0';

        const WINDOW_MS = 60 * 1000; // 60秒窓
        const windowId = Math.floor(Date.now() / WINDOW_MS);

        const secret = process.env.BLOB_RATE_SECRET || 'dev-secret-change-me';
        const h = crypto.createHmac('sha256', secret)
                        .update(`${ip}:${windowId}`)
                        .digest('hex')
                        .slice(0, 32);

        // 4) 有効期限（例: 5分）
        const validUntilMs = Date.now() + 5 * 60 * 1000;

        // 5) ZIP限定などの基本ポリシ
        const allowedContentTypes = [
          'application/zip',
          'application/x-zip-compressed',
        ];

        // 6) 決定論的な格納パス（DBレスRateLimitの要）
        //    - 同一IP・同一時間窓なら "同じ pathname" になる
        //    - 元ファイル名は保存先では使わない（必要なら別メタで管理）
        const pathname = `/uploads/${userId}/${purpose}/${h}.zip`;

        const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
        const policyLog = { userId, purpose, windowId, pathname, validUntilMs, ipHash };
        vLog('policy', policyLog);
        log.info('upload token policy decided', { ...policyLog, hasCsrf: Boolean(csrfFromPayload) });

        return {
          // ★ DBレス・ハードレートの要点
          addRandomSuffix: false,
          allowOverwrite: false, // 同名があれば失敗（= 同窓2回目を拒否）

          // 基本制限
          allowedContentTypes,
          maximumSizeInBytes: 100 * 1024 * 1024,

          // セキュリティ/運用
          validUntil: validUntilMs,

          // 保存先指定（prefixではなく固定パス）
          pathname,
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[blob/upload completed]', {
          url: blob.url,
          downloadUrl: blob.downloadUrl || null,
          pathname: blob.pathname,
          size: blob.size,
          contentType: blob.contentType,
          // tokenPayload: tokenPayload // 必要ならログ
        });
      },
    });

    log.info('upload token issued', {
      pathname: jsonResponse?.pathname || null,
      uploadUrl: jsonResponse?.uploadUrl || null,
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    const msg = err?.message || String(err);
    const status =
      (err && (err.statusCode || err.status)) ? (err.statusCode || err.status)
      : (/forbidden/i.test(msg) ? 403 : 500);

    console.error('[blob/upload error]', msg, VERBOSE ? { stack: err?.stack } : '');
    log.error('upload token issuance failed', { status, error: err });
    return res.status(status).json({
      ok: false,
      error: msg,
      dbg: VERBOSE ? { hint: 'Enable/keep VERBOSE_BLOB_LOG=1 to see more logs above.' } : undefined,
    });
  }
}
