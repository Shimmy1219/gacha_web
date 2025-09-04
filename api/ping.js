// 目的: 同一オリジン（Origin/Referer/X-App-Origin）検証を加え、ZIPをBlob保存。詳細ログ込みで堅牢化
export const config = { api: { bodyParser: false } };

// ★ 許可オリジン（本番/プレビュー/ローカル開発）
const ORIGIN_ALLOW = [
  /^https:\/\/shimmy3\.com$/i,                  // 本番
  /^https:\/\/.*-shimmy3\.vercel\.app$/i,       // Vercel Preview
  /^http:\/\/localhost(?::\d+)?$/i,             // ローカル
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i
];

function parseOriginLike(value) {
  if (!value) return '';
  try {
    // Originヘッダなら既に"scheme://host"形式、RefererはフルURLなのでoriginへ正規化
    const u = new URL(value);
    return u.origin;
  } catch {
    // すでに "scheme://host" 形式 or 不正 → そのまま検査に回す
    return String(value);
  }
}

function assertSameOrigin(req) {
  const originHeader  = req.headers.origin || '';
  const refererHeader = req.headers.referer || '';
  const appOriginHdr  = req.headers['x-app-origin'] || ''; // クライアント側で送るフォールバック

  const candOrigin  = parseOriginLike(originHeader);
  const candReferer = parseOriginLike(refererHeader);
  const candApp     = parseOriginLike(appOriginHdr);

  // 検査に使う候補（優先: Origin > Referer > X-App-Origin）
  const candidate = candOrigin || candReferer || candApp;
  console.log('[ping] origin-check begin', {
    originHeader, refererHeader, appOriginHdr,
    candOrigin, candReferer, candApp, candidate, allow: ORIGIN_ALLOW.map(r=>String(r))
  });

  if (!candidate) {
    const msg = 'missing Origin/Referer/X-App-Origin';
    console.warn('[ping] origin-check reject:', msg);
    const err = new Error(msg);
    err.code = 'NO_ORIGIN';
    throw err;
  }

  const ok = ORIGIN_ALLOW.some(re => re.test(candidate));
  if (!ok) {
    console.warn('[ping] origin-check reject: not-allowed', { candidate });
    const err = new Error(`forbidden origin: ${candidate}`);
    err.code = 'BAD_ORIGIN';
    throw err;
  }

  console.log('[ping] origin-check ok:', { candidate });
}

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
    // 0) 同一オリジン検証
    out.stage = 'origin-check';
    try {
      assertSameOrigin(req);
    } catch (e) {
      console.warn('[ping] origin error:', e?.message);
      // セキュリティ事由は 403 で返す（ログは詳細）
      return res.status(403).json({
        ok: false, stage: out.stage,
        error: e?.message || 'origin check failed'
      });
    }

    // 1) 本文読取
    out.stage = 'read-body';
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const buf = Buffer.concat(chunks);
    out.size = buf.length;

    // 2) ヘッダからファイル名/コンテントタイプ
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

    // 3) Blob SDK 読込
    out.stage = 'import-blob';
    const { put } = await import('@vercel/blob');

    // 4) Blob へ保存（公開 / 衝突回避）
    out.stage = 'blob-put';
    let result = null;
    try {
      result = await put(filename, buf, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/zip'
      });
    } catch (e) {
      console.error('[ping] blob put failed:', e);
      // ここで失敗しても 200 で返してステージを知らせる方針
      return res.status(200).json({
        ok: false, stage: out.stage,
        filename, size: buf.length,
        error: e?.message || 'blob put error'
      });
    }

    out.stage = 'done';
    out.ok = true;
    out.url = result.url;
    out.downloadUrl = result.downloadUrl || null;
    out.pathname = result.pathname;

    console.log('[ping] upload ok:', {
      filename, size: buf.length, url: out.url, downloadUrl: out.downloadUrl
    });
    return res.status(200).json(out);

  } catch (e) {
    console.error('[ping] error at stage:', out.stage, e);
    out.error = e?.message || String(e);
    // 可能な限り 200 で返す（原因はstageで判別可能）
    return res.status(200).json(out);
  }
}
