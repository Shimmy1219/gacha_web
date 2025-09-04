// 目的: 依存未解決や ESM/CJS 差異でのロード失敗を防ぐ（health は必ず通す）
// 目的: クライアント直送トークンの発行（access/public と addRandomSuffix をサーバ側で付与）
import { handleUpload } from "@vercel/blob/client";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // ヘルスチェック
  if (req.method === "GET" && req.query.health) {
    return res.status(200).json({ ok: true, route: "/api/blob/upload" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).end("Method Not Allowed");
  }

  return handleUpload({
    req,
    res,
    // ★ ここで 'public' と addRandomSuffix を付ける（クライアントでは指定不可）
    onBeforeGenerateToken: async () => ({
      access: "public",
      addRandomSuffix: true,
      allowedContentTypes: ["application/zip"],
      // 必要なら: maximumSizeInBytes: 50 * 1024 * 1024,
    }),
    onUploadCompleted: async ({ blob }) => {
      // 本番ではログや記録に使う
      console.log("blob uploaded:", blob.url);
    },
  });
}

