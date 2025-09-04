// 目的: ZIP(生バイナリ)を受け取り、受け取ったこと＆ファイル名を返す
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // ヘルスチェック
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    return res.status(200).json({ ok: true, route: '/api/ping' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const buf = Buffer.concat(chunks);

    const filename =
      req.headers['x-filename'] ||
      (req.headers['content-disposition'] || '').replace(/^.*filename="?([^"]+)"?.*$/i, '$1') ||
      'unknown.zip';

    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // ここでは保存せず、受け取ったことだけ返す
    return res.status(200).json({
      ok: true,
      received: true,
      filename: String(filename),
      size: buf.length,
      contentType
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'read error' });
  }
}
