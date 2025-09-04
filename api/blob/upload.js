// 目的: Client Upload 用 POST を Web Request にブリッジし、duplex 指定で 500 を解消
async function handler(req, res) {
  // health チェック
  if (req.method === "GET" && req.query && "health" in req.query) {
    return res.status(200).json({ ok: true, route: "/api/blob/upload" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).end("Method Not Allowed");
  }

  const { handleUpload } = await import("@vercel/blob/client");

  try {
    // Node → WHATWG Request に橋渡し（★ body を渡す場合は duplex が必須）
    const proto = req.headers["x-forwarded-proto"] || "https";
    const url = new URL(req.url, `${proto}://${req.headers.host}`);
    const webReq = new Request(url, {
      method: req.method,
      headers: new Headers(req.headers),
      body: req,                 // 生ストリーム
      // @ts-ignore Node18/undici 用に必須
      duplex: "half",
    });

    // handleUpload は Web Request/Response を扱える
    const webRes = await handleUpload({
      request: webReq,
      onBeforeGenerateToken: async () => ({
        access: "public",                 // クライアント側では指定しない
        addRandomSuffix: true,            // 衝突回避はサーバ側で
        allowedContentTypes: ["application/zip"],
        // maximumSizeInBytes: 50 * 1024 * 1024, // 必要なら
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

    // Web Response → Node の res へ
    res.status(webRes.status);
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = Buffer.from(await webRes.arrayBuffer());
    return res.end(buf);
  } catch (err) {
    console.error("handleUpload error", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

// Next.js / Vercel Functions 両対応の CJS エクスポート
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
