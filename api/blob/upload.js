// /api/blob/upload.js
// 目的:
// - 同一オリジン検証
// - CSRF（二重送信: Cookie + clientPayload）
// - ユーザー/用途ごとの格納パス (pathnamePrefix)
// - トークン有効期限 (validUntil)
// - デバッグログ（VERBOSE_BLOB_LOG=1 のとき詳細）

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
  // ヘルスチェック
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    return res.status(200).json({ ok: true, route: '/api/blob/upload' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
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
      onBeforeGenerateToken: async (_pathname, clientPayload /* string|undefined */) => {
        const cookies = parseCookies(req.headers.cookie);

        let payload = {};
        try { payload = clientPayload ? JSON.parse(clientPayload) : {}; }
        catch (e) { vLog('clientPayload JSON parse error:', String(e)); }

        const csrfFromCookie  = cookies['csrf'] || '';
        const csrfFromPayload = payload?.csrf || '';
        vLog('csrfFromCookie exists:', !!csrfFromCookie);
        vLog('csrfFromPayload exists:', !!csrfFromPayload);

        if (!csrfFromCookie || !csrfFromPayload || csrfFromCookie !== csrfFromPayload) {
          vLog('CSRF mismatch', { csrfFromCookieLen: csrfFromCookie.length, csrfFromPayloadLen: csrfFromPayload.length });
          const err = new Error('Forbidden: invalid CSRF token');
          err.statusCode = 403;
          throw err;
        }

        // --- ユーザー/用途の抽出＆サニタイズ ---
        const rawUserId = payload?.userId;
        const rawPurpose = payload?.purpose;
        const userId  = sanitizeSegment(rawUserId, 'anon');
        const purpose = sanitizeSegment(rawPurpose, 'misc');

        // --- ファイル名・サイズ等の制約（ZIPのみ） ---
        // クライアントが送る multipart のときは _pathname が無い場合もあるので拡張子は二重でチェックするなら完了時スキャンも検討
        const allowedContentTypes = [
          'application/zip',
          'application/x-zip-compressed',
        ];

        // --- 有効期限（発行から5分） ---
        const validUntilMs = Date.now() + 5 * 60 * 1000;

        // --- パスのプレフィックス（ユーザー/用途ごと） ---
        // 例: /uploads/<userId>/<purpose>/ 直下に addRandomSuffix 付きで保存
        const pathnamePrefix = `/uploads/${userId}/${purpose}/`;

        vLog('policy', { userId, purpose, pathnamePrefix, validUntilMs });

        return {
          addRandomSuffix: true,
          allowedContentTypes,
          maximumSizeInBytes: 100 * 1024 * 1024,  // 100MB
          validUntil: validUntilMs,
          pathnamePrefix,
          // 必要に応じて: cacheControlMaxAge, allowOverwrite など
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

    return res.status(200).json(jsonResponse);
  } catch (err) {
    const msg = err?.message || String(err);
    const status =
      (err && (err.statusCode || err.status)) ? (err.statusCode || err.status)
      : (/forbidden/i.test(msg) ? 403 : 500);

    console.error('[blob/upload error]', msg, VERBOSE ? { stack: err?.stack } : '');
    return res.status(status).json({
      ok: false,
      error: msg,
      dbg: VERBOSE ? { hint: 'Enable/keep VERBOSE_BLOB_LOG=1 to see more logs above.' } : undefined,
    });
  }
}
