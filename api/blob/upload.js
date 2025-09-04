// /api/blob/upload.js
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
  // 許可オリジン: 本番/プレビューに合わせて列挙（例）
  const ALLOWED_ORIGINS = [
    process.env.NEXT_PUBLIC_SITE_ORIGIN,            // 例: https://shimmy3.com
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`, // 例: https://myapp.vercel.app
  ].filter(Boolean);

  const reqOriginHeader = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const derivedOrigin = (() => {
    try { return referer ? new URL(referer).origin : ''; } catch { return ''; }
  })();

  const originToCheck = reqOriginHeader || derivedOrigin;
  if (!originToCheck || !ALLOWED_ORIGINS.includes(originToCheck)) {
    return res.status(403).json({ ok: false, error: 'Forbidden: origin not allowed' });
  }

  // ====== 2) handleUpload 呼び出し ======
  try {
    const { handleUpload } = await import('@vercel/blob/client');

    // JSON ボディ（@vercel/blob の client が送ってくる）
    const body = req.body ?? {};

    const jsonResponse = await handleUpload({
      request: req,
      body,
      // ---- CSRF & 制限チェック ----
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        // CSRF: クッキー vs clientPayload を一致チェック
        const cookies = Object.fromEntries(
          (req.headers.cookie || '')
            .split(';')
            .map(v => v.trim())
            .filter(Boolean)
            .map(v => v.split('=').map(decodeURIComponent))
        );
        let csrfFromPayload = '';
        try {
          const parsed = clientPayload ? JSON.parse(clientPayload) : {};
          csrfFromPayload = parsed?.csrf || '';
        } catch (_) { /* 無視 */ }

        const csrfFromCookie = cookies['csrf'] || '';
        if (!csrfFromCookie || !csrfFromPayload || csrfFromCookie !== csrfFromPayload) {
          // CSRF不一致 → 拒否
          throw new Error('Forbidden: invalid CSRF token');
        }

        // ここで MIME/サイズ/ファイル名ポリシーを決める
        return {
          addRandomSuffix: true,
          allowedContentTypes: [
            'application/zip',
            'application/x-zip-compressed',
          ],
          maximumSizeInBytes: 100 * 1024 * 1024,
          // cacheControlMaxAge, validUntil など必要なら追加
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[blob/upload completed]', {
          url: blob.url,
          downloadUrl: blob.downloadUrl || null,
          pathname: blob.pathname,
          size: blob.size,
          contentType: blob.contentType,
        });
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[blob/upload error]', err);
    // CSRFなどで throw した場合もここに来るので 403 を返す
    const msg = err?.message || String(err);
    const status = /forbidden/i.test(msg) ? 403 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
}