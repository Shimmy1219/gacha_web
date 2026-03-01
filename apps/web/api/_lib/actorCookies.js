import { setCookie } from './cookies.js';

const DISCORD_ACTOR_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const DISCORD_ID_PATTERN = /^[0-9]{5,32}$/;

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }
  const withoutControlChars = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 127) || code > 127;
    })
    .join('');
  const normalized = withoutControlChars
    .normalize('NFKC')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, maxLength);
}

function sanitizeDiscordId(value) {
  const normalized = sanitizeText(value, 64);
  if (!normalized || !DISCORD_ID_PATTERN.test(normalized)) {
    return '';
  }
  return normalized;
}

/**
 * Discord actor の cookie(d_uid/d_uname/d_dname)を設定する。
 * 既存ログ互換のため d_name も同時に更新する。
 * @param {unknown} target Node.js response
 * @param {{ id: unknown, username?: unknown, displayName?: unknown, name?: unknown, maxAgeSec?: number }} params cookieへ保存するDiscord actor情報
 * @returns {void}
 */
export function setDiscordActorCookies(target, params) {
  const discordId = sanitizeDiscordId(params?.id);
  const username = sanitizeText(params?.username, 80);
  const displayName = sanitizeText(params?.displayName, 80);
  // 旧呼び出しとの互換: name のみ渡された場合は username/displayName 両方へ補完する。
  const legacyName = sanitizeText(params?.name, 80);
  const resolvedUsername = username || legacyName || discordId;
  const resolvedDisplayName = displayName || legacyName || resolvedUsername || discordId;
  if (!discordId) {
    clearDiscordActorCookies(target);
    return;
  }

  const maxAgeCandidate = Number(params?.maxAgeSec);
  const maxAgeSec = Number.isFinite(maxAgeCandidate) && maxAgeCandidate > 0
    ? Math.floor(maxAgeCandidate)
    : DISCORD_ACTOR_COOKIE_MAX_AGE_SEC;

  setCookie(target, 'd_uid', discordId, { maxAge: maxAgeSec });
  setCookie(target, 'd_uname', resolvedUsername || discordId, { maxAge: maxAgeSec });
  setCookie(target, 'd_dname', resolvedDisplayName || resolvedUsername || discordId, { maxAge: maxAgeSec });
  setCookie(target, 'd_name', resolvedDisplayName || resolvedUsername || discordId, { maxAge: maxAgeSec });
}

/**
 * Discord actor の cookie(d_uid/d_uname/d_dname/d_name)を削除する。
 * @param {unknown} target Node.js response
 * @returns {void}
 */
export function clearDiscordActorCookies(target) {
  setCookie(target, 'd_uid', '', { maxAge: 0 });
  setCookie(target, 'd_uname', '', { maxAge: 0 });
  setCookie(target, 'd_dname', '', { maxAge: 0 });
  setCookie(target, 'd_name', '', { maxAge: 0 });
}
