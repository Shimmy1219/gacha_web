// /api/blob/upload.js
// 目的: client-upload 用トークン発行 + 完了通知の受け取り（最小要件）
// ポイント: handleUpload は「req/resを直接いじらない」。戻り値を res.json で返す。

export const config = {
  api: {
    // JSON 受け取るだけなので bodyParser は有効のままでOK
    // 大きい本体はブラウザ→Vercel Blob へ直送される
  },
};

export default async function handler(req, res) {
  // ヘルスチェック
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    return res.status(200).json({ ok: true, route: '/api/blob/upload' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    // 重要: client 用のヘルパーは '@vercel/blob/client' から
    const { handleUpload } = await import('@vercel/blob/client');

    // Next.js /pages の req.body は JSON (upload() が投げる HandleUploadBody)
    const body = req.body ?? {};

    const jsonResponse = await handleUpload({
      request: req,      // Node IncomingMessage でもOK
      body,              // ← ここに JSON ボディ（token 生成 or 完了通知のどちらか）
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        // ここでアップロード許可ポリシーを返す
        return {
          addRandomSuffix: true, // ファイル名衝突を避ける
          allowedContentTypes: [
            'application/zip',
            'application/x-zip-compressed',
          ],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          // 必要なら cacheControlMaxAge, validUntil, allowOverwrite など
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // 完了フック（本番ならDB更新など）
        console.log('[blob/upload completed]', {
          url: blob.url,
          downloadUrl: blob.downloadUrl || null,
          pathname: blob.pathname,
          size: blob.size,
          contentType: blob.contentType,
          tokenPayload,
        });
      },
    });

    // handleUpload はレスポンスを書かないので、ここで返す
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[blob/upload error]', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}