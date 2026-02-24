const OWNER_ACTOR_COOKIE_NAME = 'owner_name';
const OWNER_ACTOR_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

function sanitizeOwnerName(value: string | null | undefined): string {
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
  return normalized.slice(0, 64);
}

function isHttpsEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  return window.location.protocol === 'https:';
}

/**
 * 受け取りオーナー名を actor追跡用cookie(owner_name) と同期する。
 * 空文字の場合は cookie を削除する。
 * @param ownerName localStorageに保存しているオーナー名
 */
export function syncOwnerNameActorCookie(ownerName: string | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const normalized = sanitizeOwnerName(ownerName);
  const attributes = ['Path=/', 'SameSite=Lax'];
  if (isHttpsEnvironment()) {
    attributes.push('Secure');
  }

  if (!normalized) {
    attributes.push('Max-Age=0');
    document.cookie = `${OWNER_ACTOR_COOKIE_NAME}=; ${attributes.join('; ')}`;
    return;
  }

  attributes.push(`Max-Age=${OWNER_ACTOR_COOKIE_MAX_AGE_SEC}`);
  document.cookie = `${OWNER_ACTOR_COOKIE_NAME}=${encodeURIComponent(normalized)}; ${attributes.join('; ')}`;
}

