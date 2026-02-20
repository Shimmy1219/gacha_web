export const DISCORD_SESSION_HINT_COOKIE_NAME = 'discord_session_hint';

/**
 * ブラウザに Discord セッション確認ヒントが残っているかを判定する。
 *
 * この値は認証情報ではなく、`/api/discord/me` を自動取得してよいかの判定にのみ利用する。
 *
 * @returns ヒントクッキーが存在する場合は `true`
 */
export function hasDiscordSessionHintCookie(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const rawCookie = document.cookie;
  if (!rawCookie) {
    return false;
  }

  const entries = rawCookie.split(';');
  for (const entry of entries) {
    const [rawKey, ...rest] = entry.split('=');
    const key = rawKey.trim();
    if (key !== DISCORD_SESSION_HINT_COOKIE_NAME) {
      continue;
    }
    const value = rest.join('=').trim();
    return value.length > 0 && value !== '0' && value.toLowerCase() !== 'false';
  }

  return false;
}

/**
 * Discord セッション確認ヒントをブラウザから削除する。
 *
 * `/api/discord/me` で未ログインが確定した直後に実行し、
 * 同一タブ内での不要な再取得を防ぐために使う。
 *
 * @returns `void`
 */
export function clearDiscordSessionHintCookieClientSide(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const attributes = ['Path=/', 'Max-Age=0', 'SameSite=Lax'];
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    attributes.push('Secure');
  }
  document.cookie = `${DISCORD_SESSION_HINT_COOKIE_NAME}=; ${attributes.join('; ')}`;
}
