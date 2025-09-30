// /api/_lib/cookies.js
import cookie from 'cookie';

const BASE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  // サブドメイン横断（stg/本番）したい場合は下行を有効化
  domain: '.shimmy3.com',
};

export function getCookies(req) {
  return cookie.parse(req.headers.cookie || '');
}

export function setCookie(res, name, value, opts = {}) {
  const c = cookie.serialize(name, value, { ...BASE, ...opts });
  res.setHeader('Set-Cookie', appendCookie(res.getHeader('Set-Cookie'), c));
}

function appendCookie(prev, next) {
  if (!prev) return next;
  if (Array.isArray(prev)) return [...prev, next];
  return [prev, next];
}
