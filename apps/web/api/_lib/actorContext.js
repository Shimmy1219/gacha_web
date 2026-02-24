import crypto from 'crypto';
import { getCookies, setCookie } from './cookies.js';

export const VISITOR_ID_COOKIE_NAME = 'visitor_id';
export const VISITOR_ID_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

const VISITOR_ID_PREFIX = 'vst_';
const VISITOR_ID_RANDOM_BYTES = 16;
const VISITOR_ID_BODY_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
const DISCORD_ID_PATTERN = /^[0-9]{5,32}$/;

const visitorOverrideMap = new WeakMap();

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }
  // ログ汚染や可読性低下を避けるため、制御文字は明示的に除去する。
  const withoutControlChars = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 127) || code > 127;
    })
    .join('');
  const sanitized = withoutControlChars
    .normalize('NFKC')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .trim();
  if (!sanitized) {
    return '';
  }
  return sanitized.slice(0, maxLength);
}

function sanitizeDiscordId(value) {
  const normalized = sanitizeText(value, 64);
  if (!normalized) {
    return '';
  }
  if (!DISCORD_ID_PATTERN.test(normalized)) {
    return '';
  }
  return normalized;
}

function readCookiesSafely(source) {
  try {
    return getCookies(source);
  } catch {
    return {};
  }
}

function compactObject(value) {
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'undefined') {
      continue;
    }
    out[key] = item;
  }
  return out;
}

function readVisitorIdOverride(source) {
  if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
    return '';
  }
  const stored = visitorOverrideMap.get(source);
  return normalizeVisitorId(stored);
}

/**
 * visitor_id クッキー値として使える形式に正規化する。
 * @param {unknown} value 生のvisitor_id候補
 * @returns {string} 正常値ならそのまま返し、不正値なら空文字を返す
 */
export function normalizeVisitorId(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim();
  if (!normalized.startsWith(VISITOR_ID_PREFIX)) {
    return '';
  }
  const body = normalized.slice(VISITOR_ID_PREFIX.length);
  if (!VISITOR_ID_BODY_PATTERN.test(body)) {
    return '';
  }
  return normalized;
}

/**
 * ログ相関に使うvisitor_idを新規生成する。
 * @returns {string} `vst_` で始まる追跡用ID
 */
export function createVisitorId() {
  const suffix = crypto.randomBytes(VISITOR_ID_RANDOM_BYTES).toString('base64url');
  return `${VISITOR_ID_PREFIX}${suffix}`;
}

/**
 * リクエスト単位で visitor_id を上書き登録し、同一リクエスト内ログで利用できるようにする。
 * @param {unknown} source req / request オブジェクト
 * @param {unknown} visitorId 正規化済み visitor_id
 * @returns {void}
 */
export function setVisitorIdOverride(source, visitorId) {
  if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
    return;
  }
  const normalized = normalizeVisitorId(visitorId);
  if (!normalized) {
    return;
  }
  visitorOverrideMap.set(source, normalized);
}

/**
 * visitor_id が未発行なら Cookie を発行して返す。
 * @param {unknown} target Node.js の res もしくは Headers
 * @param {unknown} source req / request
 * @param {{ maxAgeSec?: number }} [options] 有効期限の上書きオプション
 * @returns {string} 利用中の visitor_id
 */
export function ensureVisitorIdCookie(target, source, options = {}) {
  const cookies = readCookiesSafely(source);
  const existing = normalizeVisitorId(cookies[VISITOR_ID_COOKIE_NAME]);
  if (existing) {
    return existing;
  }

  const issued = createVisitorId();
  const configuredMaxAge = Number(options.maxAgeSec);
  const maxAge = Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
    ? Math.floor(configuredMaxAge)
    : VISITOR_ID_COOKIE_MAX_AGE_SEC;

  setCookie(target, VISITOR_ID_COOKIE_NAME, issued, { maxAge });
  return issued;
}

/**
 * ログ出力用の actor 情報を Cookie から解決する。
 * @param {unknown} source req / request
 * @param {{ fallbackVisitorId?: string | null }} [options] Cookie未反映時の補完visitor_id
 * @returns {{
 *   visitorId?: string,
 *   actorType: 'discord' | 'owner' | 'anonymous',
 *   actorLabel: string,
 *   actorTrust: 'cookie' | 'self-asserted' | 'none',
 *   discordId?: string,
 *   discordName?: string,
 *   ownerName?: string,
 * }} ログにそのまま付与できるactor情報
 */
export function resolveActorContext(source, options = {}) {
  const cookies = readCookiesSafely(source);
  const visitorId =
    readVisitorIdOverride(source) ||
    normalizeVisitorId(cookies[VISITOR_ID_COOKIE_NAME]) ||
    normalizeVisitorId(options?.fallbackVisitorId || '');

  const discordId = sanitizeDiscordId(cookies.d_uid);
  const discordName = sanitizeText(cookies.d_name, 80);
  const ownerName = sanitizeText(cookies.owner_name, 64);

  if (discordId) {
    const labelName = discordName || discordId;
    return compactObject({
      visitorId: visitorId || undefined,
      actorType: 'discord',
      actorTrust: 'cookie',
      actorLabel: `${labelName} (${discordId})`,
      discordId,
      discordName: labelName,
    });
  }

  if (ownerName) {
    return compactObject({
      visitorId: visitorId || undefined,
      actorType: 'owner',
      actorTrust: 'self-asserted',
      actorLabel: `owner:${ownerName}`,
      ownerName,
    });
  }

  return compactObject({
    visitorId: visitorId || undefined,
    actorType: 'anonymous',
    actorTrust: 'none',
    actorLabel: 'anonymous',
  });
}
