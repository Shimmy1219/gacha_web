// /api/auth/logout.js
// 現在の端末のセッションだけ無効化
import { getCookies, setCookie } from '../_lib/cookies.js';
import { deleteSession } from '../_lib/sessionStore.js';

export default async function handler(req, res) {
  const { sid } = getCookies(req);
  if (sid) {
    await deleteSession(sid);
    // sid クッキーを消す
    setCookie(res, 'sid', '', { maxAge: 0 });
  }
  return res.status(200).json({ ok: true });
}
