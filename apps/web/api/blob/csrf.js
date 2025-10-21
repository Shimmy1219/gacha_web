// /api/blob/csrf.js
// 目的: CSRFトークンを安全属性付きクッキーに設定し、同じ値をJSONでも返す（Double Submit Cookie）
import { createRequestLogger } from '../_lib/logger.js';

export default async function handler(req, res) {
  const log = createRequestLogger('api/blob/csrf', req);
  log.info('request received');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    log.warn('method not allowed', { method: req.method });
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  // ランダム32バイト
  const token = require('crypto').randomBytes(32).toString('base64url');

  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');

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
    'Domain=.shimmy3.com',
    // 期限はセッションでも良いが、必要なら `Max-Age=1800` 等を追加
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
  log.info('csrf token issued');
  return res.status(200).json({ ok: true, token });
}
