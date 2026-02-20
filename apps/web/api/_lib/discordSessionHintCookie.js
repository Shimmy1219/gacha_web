// /api/_lib/discordSessionHintCookie.js
import { setCookie } from './cookies.js';

export const DISCORD_SESSION_HINT_COOKIE_NAME = 'discord_session_hint';
const DISCORD_SESSION_HINT_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/**
 * Discordログイン済み判定の「ヒント」クッキーを付与する。
 *
 * このクッキーは認証情報ではなく、クライアント側で
 * 「/api/discord/me を自動取得してよいか」を判断するためにのみ利用する。
 *
 * @param {import('http').ServerResponse | Headers} target - Set-Cookie を追加するレスポンス
 * @returns {void}
 */
export function setDiscordSessionHintCookie(target) {
  setCookie(target, DISCORD_SESSION_HINT_COOKIE_NAME, '1', {
    maxAge: DISCORD_SESSION_HINT_MAX_AGE_SEC,
    httpOnly: false,
  });
}

/**
 * Discordログイン判定ヒントを削除する。
 *
 * @param {import('http').ServerResponse | Headers} target - Set-Cookie を追加するレスポンス
 * @returns {void}
 */
export function clearDiscordSessionHintCookie(target) {
  setCookie(target, DISCORD_SESSION_HINT_COOKIE_NAME, '', {
    maxAge: 0,
    httpOnly: false,
  });
}
