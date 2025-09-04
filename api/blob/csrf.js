// /api/blob/csrf.js
// 目的: CSRFトークンを安全属性付きクッキーに設定し、同じ値をJSONでも返す（Double Submit Cookie）
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // ランダム32バイト
  const token = require('crypto').randomBytes(32).toString('base64url');

  // クッキー属性
  // - HttpOnly: JS から読めない（改ざんされにくい）
  // - SameSite=Lax: 通常のCSRFをかなり防げる
  // - Secure: HTTPSのみ
  // - Path=/ : 全体で共有
  const cookie = [
    `csrf=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    // 期限はセッションでも良いが、必要なら `Max-Age=1800` 等を追加
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true, token });
}
