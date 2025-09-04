// 目的: 依存未解決や ESM/CJS 差異でのロード失敗を防ぐ（health は必ず通す）
async function handler(req, res) {
  // GET /api/blob/upload?health=1 → まずはこれで 200 が返るか確認
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    return res.status(200).json({ ok: true, route: '/api/blob/upload' });
  }

  // ここで初めて依存を読み込む（CJS/ESM どちらでも動く）
  const { handleUpload } = await import('@vercel/blob/client');

  return handleUpload({
    req,
    res,
    onBeforeGenerateToken: async () => ({
      access: 'public',
      addRandomSuffix: true,
      allowedContentTypes: ['application/zip'],
      // cacheControlMaxAge: 31536000, // 必要ならここに（client 側では指定しない）
    }),
    onUploadCompleted: async ({ blob }) => {
      console.log('[blob uploaded]', {
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        size: blob.size,
      });
    },
  });
}

// Next.js / Vercel Functions どちらでも動くようにエクスポート
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
