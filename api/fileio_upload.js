// api/upload.js
// 目的:
//  - あなたのVercelサイトからのみ利用可能にする（オリジン制限）
//  - CSRF(Double Submit Cookie)でブラウザ経由の正規フローのみ許可
//  - ZIPを受け取り file.io に中継アップロードしてURLを返す

import fs from "fs";
import crypto from "crypto";
import FormData from "form-data";
import formidable from "formidable";
import { serialize as cookieSerialize, parse as cookieParse } from "cookie";

export const config = {
  api: {
    bodyParser: false, // multipartは自前で処理
  },
};

// .env に設定（カンマ区切りで複数可）
// 例: ALLOWED_ORIGINS=https://your-site.vercel.app,https://www.your-domain.com
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// CSRFクッキー名
const CSRF_COOKIE = "csrf_token";

// CORSの付与（許可オリジンのみ）
function setCors(req, res, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin"); // CDNキャッシュ分離
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-CSRF-Token"
  );
}

function pickRequestOrigin(req) {
  // ブラウザは Origin ヘッダを送る。無い場合は Referer からオリジンを推定
  const origin = req.headers.origin;
  if (origin) return origin;

  const referer = req.headers.referer;
  try {
    if (referer) {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    }
  } catch (_) {}
  return null;
}

function isAllowedOrigin(origin) {
  if (!ALLOWED_ORIGINS.length) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function getCookies(req) {
  const raw = req.headers.cookie || "";
  return cookieParse(raw);
}

function setCookie(res, name, value, opts = {}) {
  const cookie = cookieSerialize(name, value, {
    httpOnly: true, // JSから読めない(改ざん困難)
    sameSite: "Strict",
    secure: true, // Vercelはhttps前提
    path: "/",
    maxAge: 60 * 30, // 30分
    ...opts,
  });
  res.setHeader("Set-Cookie", cookie);
}

async function parseMultipart(req) {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: "/tmp",
    maxFileSize: 200 * 1024 * 1024, // 必要に応じ調整
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) =>
      err ? reject(err) : resolve({ fields, files })
    );
  });
}

export default async function handler(req, res) {
  const requestOrigin = pickRequestOrigin(req);
  const allowed = requestOrigin && isAllowedOrigin(requestOrigin);
  setCors(req, res, allowed ? requestOrigin : undefined);

  // プリフライト
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // まずオリジンを検証
  if (!allowed) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  // GET: CSRFトークン発行（フロントは最初にこれを叩いてクッキーを受け取る）
  if (req.method === "GET") {
    const token = generateToken();
    setCookie(res, CSRF_COOKIE, token);
    // 参考用としてJS側にトークン値も返す（HttpOnlyで読み取れないため）
    // ただし実運用では hidden input に埋めるなどでもOK
    return res.status(200).json({ csrfToken: token });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // CSRF検証（Double Submit Cookie）
  // 1) クッキーにある csrf_token
  // 2) ヘッダ X-CSRF-Token に同じ値
  const cookies = getCookies(req);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }

  // ここからアップロード処理
  try {
    const { files } = await parseMultipart(req);
    const uploaded = files.file || files.upload || Object.values(files)[0];

    if (!uploaded) {
      return res
        .status(400)
        .json({ error: "No file provided (multipart field name should be 'file')." });
    }

    const filePath = uploaded.filepath || uploaded.path;
    const fileName = uploaded.originalFilename || uploaded.newFilename || "upload.zip";

    // file.io へ中継
    const fd = new FormData();
    fd.append("file", fs.createReadStream(filePath), { filename: fileName });

    const resp = await fetch("https://file.io/", {
      method: "POST",
      body: fd,
      headers: fd.getHeaders(),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.success !== true || !data?.link) {
      return res.status(502).json({
        error: "Upload to file.io failed",
        status: resp.status,
        response: data,
      });
    }

    // 成功：URL返却
    return res.status(200).json({
      success: true,
      url: data.link,
      key: data.key,
      expiry: data.expiry,
    });
  } catch (err) {
    console.error("upload error:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", detail: String(err?.message || err) });
  }
}
