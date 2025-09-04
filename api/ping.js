// 目的: ZIP(生バイナリ)を受け取り、Blob に保存して URL を返す（強いエラーハンドリング）
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // ヘルスチェック
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    return res.status(200).json({ ok: true, route: '/api/ping' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const out = { ok: false, stage: 'start' };

  try {
    // 1) 本文を読み込み
    out.stage = 'read-body';
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const buf = Buffer.concat(chunks);
    out.size = buf.length;

    // 2) ヘッダからファイル名/Content-Type を取得
    out.stage = 'parse-headers';
    const rawName =
      req.headers['x-filename'] ||
      (req.headers['content-disposition'] || '').replace(/^.*filename="?([^"]+)"?.*$/i, '$1') ||
      'unknown.zip';
    let filename = String(rawName);
    try { filename = decodeURIComponent(filename); } catch {}
    const contentType = req.headers['content-type'] || 'application/zip';
    out.filename = filename;
    out.contentType = contentType;

    // 3) ライブラリを読み込み
    out.stage = 'import-blob';
    const { put } = await import('@vercel/blob'); // サーバSDK

    // 4) Blob に保存（公開・衝突回避）
    out.stage = 'blob-put';
    const result = await put(filename, buf, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/zip', // 固定でOK（ヘッダ値を使いたければ contentType に raw を入れても可）
    });

    out.stage = 'done';
    out.ok = true;
    out.url = result.url;
    out.downloadUrl = result.downloadUrl || null;
    out.pathname = result.pathname;
    console.log('[ping] upload ok:', { filename, size: buf.length, url: out.url, downloadUrl: out.downloadUrl });
    return res.status(200).json(out);
  } catch (e) {
    // 失敗しても可能な限り 200 で返し、ステージとメッセージをログ
    console.error('[ping] error at stage:', out.stage, e);
    out.error = e?.message || String(e);
    return res.status(200).json(out);
  }
}
