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
 * Discord actor の cookie(d_uid/d_name)を設定する。
 * @param {unknown} target Node.js response
 * @param {{ id: unknown, name: unknown, maxAgeSec?: number }} params cookieへ保存するDiscord actor情報
 * @returns {void}
 */
export function setDiscordActorCookies(target, params) {
  const discordId = sanitizeDiscordId(params?.id);
  const discordName = sanitizeText(params?.name, 80);
  if (!discordId) {
    clearDiscordActorCookies(target);
    return;
  }

  const maxAgeCandidate = Number(params?.maxAgeSec);
  const maxAgeSec = Number.isFinite(maxAgeCandidate) && maxAgeCandidate > 0
    ? Math.floor(maxAgeCandidate)
    : DISCORD_ACTOR_COOKIE_MAX_AGE_SEC;

  setCookie(target, 'd_uid', discordId, { maxAge: maxAgeSec });
  setCookie(target, 'd_name', discordName || discordId, { maxAge: maxAgeSec });
}

/**
 * Discord actor の cookie(d_uid/d_name)を削除する。
 * @param {unknown} target Node.js response
 * @returns {void}
 */
export function clearDiscordActorCookies(target) {
  setCookie(target, 'd_uid', '', { maxAge: 0 });
  setCookie(target, 'd_name', '', { maxAge: 0 });
}

