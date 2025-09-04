// 目的: Node の req/res を Web Request/Response にブリッジして handleUpload を安全に呼ぶ

async function handler(req, res) {
  // ヘルスチェック
  if (req.method === "GET" && req.query && "health" in req.query) {
    return res.status(200).json({ ok: true, route: "/api/blob/upload" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).end("Method Not Allowed");
  }

  // 依存は動的 import（ESM/CJS 差異の影響を最小化）
  const { handleUpload } = await import("@vercel/blob/client");

  // Node → Web Request にブリッジ
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = new URL(req.url, `${proto}://${req.headers.host}`);
  const webReq = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req, // 生ストリーム
    // @ts-ignore (Node18+ の ReadableStream を Request.body として扱うため)
    duplex: "half",
  });

  // handleUpload は Web Request/Response を扱える
  const webRes = await handleUpload({
    request: webReq,
    onBeforeGenerateToken: async () => ({
      access: "public",                 // ★ クライアント側は access 以外指定しない
      addRandomSuffix: true,            // ★ 衝突回避はサーバ側で
      allowedContentTypes: ["application/zip"],
      // maximumSizeInBytes: 50 * 1024 * 1024, // 必要なら
    }),
    onUploadCompleted: async ({ blob }) => {
      console.log("[blob uploaded]", {
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        size: blob.size,
      });
    },
  });

  // Web Response → Node の res に戻す
  res.status(webRes.status);
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  const buf = Buffer.from(await webRes.arrayBuffer());
  return res.end(buf);
}

// Next.js / Vercel Functions どちらでも動くようにエクスポート
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
