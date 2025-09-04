// 目的: Client Upload のトークン生成(POST)＋ヘルスチェック(GET)。body を明示的に渡して 500 を解消。
async function handler(req, res) {
  // GET /api/blob/upload?health=1 → 動作確認
  if (req.method === "GET" && req.query.health) {
    return res.status(200).json({ ok: true, route: "/api/blob/upload" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).end("Method Not Allowed");
  }

  // 動的 import（ESM/CJS 差異を吸収）
  const { handleUpload } = await import("@vercel/blob/client");

  try {
    // Node の req → WHATWG Request に橋渡し
    const url = new URL(req.url, `https://${req.headers.host}`);
    const request = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers),
      body: req, // 生ストリームをそのまま
    });

    // ★ これが無いと handleUpload 内で body が undefined になり
    //    「Cannot read properties of undefined (reading 'type')」で 500 になります
    const body = await request.json().catch(() => ({}));

    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => ({
        // クライアント側では addRandomSuffix 等は指定しない
        allowedContentTypes: ["application/zip"],
        addRandomSuffix: true,
        // cacheControlMaxAge: 31536000, // 必要ならサーバ側のみで指定
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("[blob uploaded]", {
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          pathname: blob.pathname,
          size: blob.size,
          contentType: blob.contentType,
        });
      },
    });

    return res.status(200).json(json);
  } catch (err) {
    console.error("handleUpload error", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

// Next.js pages API / Vercel Functions 両対応の CJS エクスポート
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
