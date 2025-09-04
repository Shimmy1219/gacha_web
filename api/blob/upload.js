// 目的: Vercel Blob 用トークン発行 & 直送受け口（GETで健康チェックも可能）
import { handleUpload } from '@vercel/blob/client';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // ヘルスチェック（ブラウザで /api/blob/upload?health=1 を叩くと 200）
  if (req.method === 'GET' && 'health' in req.query) {
    return res.status(200).json({ ok: true, route: '/api/blob/upload' });
  }

  // 直送アップロード
  return handleUpload({
    req,
    res,
    onBeforeGenerateToken: async () => ({
      access: 'public',                 // ★ サーバ側で指定
      addRandomSuffix: true,            // ★ サーバ側で指定（クライアントは禁止）
      allowedContentTypes: ['application/zip'],
      // cacheControlMaxAge: 31536000,  // 必要ならここで（クライアントでは指定不可）
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
