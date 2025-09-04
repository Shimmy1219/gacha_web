// [api/blob/upload.js] 新規ファイル
// 目的: クライアント直送用トークンの発行（最小要件・セキュリティ無視）。ZIPのみ許可し公開で保存。
// NOTE: クライアントの upload() 側では addRandomSuffix 等は渡さず、ここで設定します。

export const config = { api: { bodyParser: false } };

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
    const { handleUpload } = await import('@vercel/blob/client');

    // 最小要件: ZIPのみ / 公開 / 衝突回避
    await handleUpload(req, res, {
      onBeforeGenerateToken: async (_pathname, _blobInfo) => ({
        access: 'public',
        addRandomSuffix: true,
        allowedContentTypes: ['application/zip', 'application/x-zip-compressed'],
        maximumSizeInBytes: 100 * 1024 * 1024, // 100MB まで（必要に応じ調整）
      }),
      onUploadCompleted: async ({ blob }) => {
        // 成功ログ（本番では計測等に利用）
        console.log('[blob/upload completed]', {
          url: blob.url,
          downloadUrl: blob.downloadUrl || null,
          pathname: blob.pathname,
          size: blob.size,
          contentType: blob.contentType,
        });
      },
    });
    // handleUpload がレスポンスを返すため、ここで return しなくてOK

  } catch (err) {
    console.error('[blob/upload error]', err);
    // 最小要件: 失敗時は 500 を返す
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
