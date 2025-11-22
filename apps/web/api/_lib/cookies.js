// /api/_lib/cookies.js
import cookie from 'cookie';

const BASE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

function readCookieHeader(source) {
  if (!source) {
    return '';
  }

  if (typeof source === 'string') {
    return source;
  }

  if (typeof Headers !== 'undefined' && source instanceof Headers) {
    return source.get('cookie') || '';
  }

  if (typeof Request !== 'undefined' && source instanceof Request) {
    return source.headers.get('cookie') || '';
  }

  if (typeof source?.headers?.get === 'function') {
    return source.headers.get('cookie') || '';
  }

  if (source?.headers && typeof source.headers === 'object') {
    const header = source.headers.cookie || source.headers.Cookie;
    if (Array.isArray(header)) {
      return header.join('; ');
    }
    if (typeof header === 'string') {
      return header;
    }
  }

  if (typeof source?.getHeader === 'function') {
    const header = source.getHeader('cookie');
    if (Array.isArray(header)) {
      return header.join('; ');
    }
    if (typeof header === 'string') {
      return header;
    }
  }

  return '';
}

function appendCookieHeader(target, value) {
  if (!target) {
    return;
  }

  if (typeof Headers !== 'undefined' && target instanceof Headers) {
    target.append('Set-Cookie', value);
    return;
  }

  if (typeof target.append === 'function' && typeof target.get === 'function') {
    target.append('Set-Cookie', value);
    return;
  }

  if (typeof target?.setHeader === 'function') {
    target.setHeader('Set-Cookie', appendCookieValues(target.getHeader('Set-Cookie'), value));
    return;
  }

  if (target?.headers) {
    appendCookieHeader(target.headers, value);
  }
}

export function getCookies(source) {
  return cookie.parse(readCookieHeader(source));
}

export function setCookie(target, name, value, opts = {}) {
  const serialized = cookie.serialize(name, value, { ...BASE, ...opts });
  appendCookieHeader(target, serialized);
  return serialized;
}

function appendCookieValues(prev, next) {
  if (!prev) return next;
  if (Array.isArray(prev)) return [...prev, next];
  return [prev, next];
}
