// /api/blob/upload.js
// 同一オリジン検証 + CSRF（二重送信）+ デバッグログ強化

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
  // Vercel は基本 https
  if (!host) return '';
  return `${protoHint}://${host}`;
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

  // ====== 1) 同一オリジン検証（堅め + フォールバック） ======
  // 許可オリジンを列挙（環境変数 + 代表例）
  const envOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;       // 例: https://shimmy3.com
  const vercelUrl = process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`; // 例: https://xxx.vercel.app
  // www を使う可能性も考慮
  const apex = envOrigin;
  const www = envOrigin && envOrigin.replace('://', '://www.');

  // Host ヘッダから自己オリジンも推測（Origin/Referer が空の時の救済）
  const selfOriginFromHost = hostToOrigin(req.headers.host);

  const ALLOWED_ORIGINS = uniq([apex, www, vercelUrl, selfOriginFromHost]);
  const originHdr = req.headers.origin || '';
  const referer = req.headers.referer || '';

  let derivedOrigin = '';
  try { derivedOrigin = referer ? new URL(referer).origin : ''; } catch { /* noop */ }

  // チェックに使う候補
  const originToCheck = originHdr || derivedOrigin || '';
  const isAllowed =
    (!!originToCheck && ALLOWED_ORIGINS.includes(originToCheck))
    // Origin/Referer が空でも、Host ベース自己推測と一致すれば許可（同一オリジン救済）
    || (!originToCheck && ALLOWED_ORIGINS.includes(selfOriginFromHost));

  vLog('allowList:', ALLOWED_ORIGINS);
  vLog('headers.origin:', originHdr);
  vLog('headers.referer:', referer);
  vLog('derivedOrigin:', derivedOrigin);
  vLog('selfOriginFromHost:', selfOriginFromHost);
  vLog('isAllowed:', isAllowed);

  if (!isAllowed) {
    // ここで詳細を返すと攻撃者にヒントを与えるが、開発中は助かる
    return res.status(403).json({
      ok: false,
      error: 'Forbidden: origin not allowed',
      dbg: VERBOSE ? { originHdr, referer, derivedOrigin, ALLOWED_ORIGINS } : undefined,
    });
  }

  // ====== 2) トークン生成 & CSRF 検証 ======
  try {
    const { handleUpload } = await import('@vercel/blob/client');
    const body = req.body ?? {};

    const jsonResponse = await handleUpload({
      request: req,
      body,

      onBeforeGenerateToken: async (_pathname, clientPayload /* string|undefined */) => {
        // CSRF: cookie vs clientPayload の照合
        const cookies = parseCookies(req.headers.cookie);
        let csrfFromPayload = '';
        try {
          const parsed = clientPayload ? JSON.parse(clientPayload) : {};
          csrfFromPayload = parsed?.csrf || '';
        } catch (e) {
          vLog('clientPayload JSON parse error:', String(e));
        }
        const csrfFromCookie = cookies['csrf'] || '';

        vLog('csrfFromCookie exists:', !!csrfFromCookie);
        vLog('csrfFromPayload exists:', !!csrfFromPayload);

        if (!csrfFromCookie || !csrfFromPayload || csrfFromCookie !== csrfFromPayload) {
          vLog('CSRF mismatch', { csrfFromCookieLen: csrfFromCookie.length, csrfFromPayloadLen: csrfFromPayload.length });
          // 403 相当のエラー
          const err = new Error('Forbidden: invalid CSRF token');
          err.statusCode = 403;
          throw err;
        }

        // ZIP のみ・サイズ制限
        return {
          addRandomSuffix: true,
          allowedContentTypes: [
            'application/zip',
            'application/x-zip-compressed',
          ],
          maximumSizeInBytes: 100 * 1024 * 1024,
          // validUntil: Date.now() + 5 * 60 * 1000, // 有効期限を付けたいとき
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[blob/upload completed]', {
          url: blob.url,
          downloadUrl: blob.downloadUrl || null,
          pathname: blob.pathname,
          size: blob.size,
          contentType: blob.contentType,
          // tokenPayload は必要ならログ
        });
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    // ここで CSRF / Origin いずれのエラーも捕捉
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
